// Referenz-Connector Quelle 0001: Autobahn-API (verkehr.autobahn.de).
// Zieht ALLE Autobahnen (Road-Liste dynamisch von der API) × {Baustellen (roadworks), Sperrungen (closure)}.
// NICHTS wird gedroppt (keine hardcoded Road-Whitelist mehr) und NICHTS aggregiert (externeId = identifier,
// eindeutig je Richtung/Bauphase). Native Felder werden DIREKT gemappt statt hergeleitet:
//   subtitle → Richtung · startTimestamp + "Ende:"-Zeile → Gültig von/bis · impact.symbols → freie/gesperrte
//   Spuren · impact.lower/upper → Streckenabschnitt. future=true (zukünftig startende) bleibt erhalten.

import { fetchJson } from "../external/http.js"
import { extractStammdaten, restriktionsProfil, stabilHash } from "./_helpers.js"

/** Projekt-Schlüssel = die Autobahn-Maßnahmen-Nummer (Format YYYY-NNNNNN am Anfang des identifier).
 *  Die API zerlegt EINE Maßnahme nicht nur geografisch (…de1/de3/de9), sondern auch zeitlich pro
 *  Nacht/Bauphase — und das DATUM steckt MITTEN im identifier
 *  (z.B. 2026-028479--vi-bs.2026-06-22_…de1, …2026-06-23_…de3). Ein bloßes ".deN"-Strippen lässt
 *  deshalb jede Nacht als eigenes "Projekt" stehen → N-fach-Duplikate derselben Maßnahme. Wir gruppieren
 *  daher auf die Maßnahmen-Nummer: alle Segmente + Nächte EINER Maßnahme werden zu einer Strecke. */
const projektKey = (id) => {
  const s = String(id ?? "")
  const m = s.match(/^(\d{4}-\d{5,6})/) // YYYY-NNNNNN — Maßnahmen-Nr. am Anfang
  if (m) return m[1]
  // Fallback (untypische ids): bis zum Phasen-Trenner "--", dann ".deN" strippen.
  return s.split("--")[0].replace(/\.de\d+$/i, "")
}

// extractStammdaten-Felder, die KEINE attrs sind (eigene Spalten / Top-Level).
const EX_NICHT_ATTR = new Set(["gueltigVon", "gueltigBis", "strassenRef", "richtung"])

const ROADS_URL = "https://verkehr.autobahn.de/o/autobahn/"
const serviceUrl = (road, service) =>
  `https://verkehr.autobahn.de/o/autobahn/${encodeURIComponent(road)}/services/${service}`

// Beibehalten für Tests/Fallback — wird NICHT mehr als Whitelist genutzt (nur wenn env.AUTOBAHN_ROADS gesetzt).
export const AUTOBAHN_DEFAULT_ROADS = "A1,A2,A3,A5,A7,A8,A9,A24"

const isoDateOrNull = (ts) => {
  if (typeof ts !== "string") return null
  // T-610: LOKALES Datum direkt aus dem ISO-String („2026-07-06T00:00:00+02:00") nehmen. new Date()
  // .toISOString() rechnete nach UTC um → ein Mitternachts-Start (00:00 lokal) kippte auf den Vortag
  // (−1-Tag-Off-by-one, 48 Karten). Der führende YYYY-MM-DD-Teil IST bereits das lokale Datum.
  const m = ts.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  const d = new Date(ts)
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
}

/** "Ende: 31.08.26 um 15:00 Uhr" aus den description-Zeilen → ISO-Datum (natives Ende statt Heuristik). */
function endeAusBeschreibung(descLines) {
  const txt = Array.isArray(descLines) ? descLines.join("\n") : String(descLines ?? "")
  const iso = (m) => `${m[3].length === 2 ? "20" + m[3] : m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`
  const m = txt.match(/Ende[^0-9]{0,14}(\d{1,2})\.(\d{1,2})\.(\d{2,4})/i)
  if (m) return iso(m)
  // T-610: Eintages-Fenster „… gültig: DD.MM.YY von HH:MM bis HH:MM Uhr" hat KEIN separates Ende-Datum
  // (nur Tages-Uhrzeiten) → die Maßnahme gilt NUR an diesem Tag. Ohne Cutoff bliebe gueltig_bis NULL =
  // nie ablaufend und überlappte jeden künftigen Transport (Zeit-Analogon zum Buchwald-Bug, 24 FP/6 krit).
  // Nur greifen, wenn KEIN zweites (Ende-)Datum existiert, sonst ist es ein Mehrtages-Zeitraum.
  const sw = txt.match(/g(?:ü|ue)ltig:?\s*(\d{1,2})\.(\d{1,2})\.(\d{2,4})\s+von\s+\d{1,2}[:.]\d{2}\s+bis\s+\d{1,2}[:.]\d{2}\s*Uhr/i)
  if (sw && (txt.match(/\d{1,2}\.\d{1,2}\.\d{2,4}/g) || []).length === 1) return iso(sw)
  return null
}

/** impact.symbols → { spurenFrei, spurenGesperrt }. ARROW_UP/DOWN = offene Fahrstreifen, CLOSED = gesperrt
 *  (BORDER/SEPARATE/BREAKDOWN_LANE sind keine regulären Fahrstreifen). */
export function spurenAusSymbols(symbols) {
  if (!Array.isArray(symbols) || !symbols.length) return {}
  let frei = 0, gesperrt = 0
  for (const s of symbols) {
    if (s === "ARROW_UP" || s === "ARROW_DOWN") frei += 1
    else if (s === "CLOSED") gesperrt += 1
  }
  const out = {}
  if (frei > 0) out.spurenFrei = frei
  if (gesperrt > 0) out.spurenGesperrt = gesperrt
  return out
}

/**
 * Autobahn-API-Item (roadworks ODER closure) → NormalizedObstacle (oder null wenn unbrauchbar).
 * identifier ist die stabile, eindeutige externe ID (kodiert Richtung + Bauphase → keine Aggregation).
 */
export function normalizeAutobahn(item, road, service, url) {
  const lat = Number(item?.coordinate?.lat)
  const lng = Number(item?.coordinate?.long)
  if (typeof item?.identifier !== "string" || !item.identifier ||
      !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null
  }
  // T-428: ein Gewichtslimit-Schild (display_type WEIGHT_LIMIT_x, z.B. "für LKW über 3,5 t")
  // kommt zwar über den closure-Service, ist aber KEINE Vollsperrung → eigene Kategorie 'gewicht'
  // mit maxGewichtT. Vollsperrung nur bei echtem Closure/isBlocked. (35 → 3,5 t, /10.)
  const displayType = String(item.display_type ?? "")
  const gewichtsLimitM = displayType.match(/WEIGHT_LIMIT_(\d+)/i)
  const maxGewichtLimit = gewichtsLimitM ? Number(gewichtsLimitM[1]) / 10 : null
  const istGewichtsschild = maxGewichtLimit != null && maxGewichtLimit > 0
  const istSperrung = !istGewichtsschild && (service === "closure" || item.isBlocked === "true")
  const descLines = Array.isArray(item.description) ? item.description : []
  const beschreibung = [item.subtitle, ...descLines]
    .filter((s) => typeof s === "string" && s.trim())
    .join("\n") || null

  const start = isoDateOrNull(item.startTimestamp)
  const ende = endeAusBeschreibung(descLines)
  const ex = extractStammdaten(beschreibung)

  // ALLE extrahierten attrs übernehmen (numerisch + Flags wie fahrbahnVerengt/umleitung/medium …),
  // außer den Nicht-attr-Feldern (Datum/Ref/Richtung).
  const attrs = {}
  for (const [k, v] of Object.entries(ex)) {
    if (EX_NICHT_ATTR.has(k)) continue
    if (v != null && v !== false && v !== "") attrs[k] = v
  }
  Object.assign(attrs, spurenAusSymbols(item?.impact?.symbols)) // native Spur-Belegung
  if (istSperrung) attrs.vollsperrung = true
  if (istGewichtsschild && attrs.maxGewichtT == null) attrs.maxGewichtT = maxGewichtLimit

  const gueltigVon = start ?? ex.gueltigVon ?? null
  const gueltigBis = ende ?? ex.gueltigBis ?? null
  // Streckenabschnitt nativ (impact.lower/upper) → falls vorhanden vorne an die Beschreibung.
  const segment = item?.impact?.lower && item?.impact?.upper
    ? `Abschnitt: ${item.impact.lower} – ${item.impact.upper}` : null
  const extrahiert = Object.keys(attrs).length > 0 || (!!ende && !start) || (!start && !!ex.gueltigVon)
  // Beschreibung = PURER Autobahn-GmbH-Meldungstext (Segment-Abschnitt + Original-Description), KEINE
  // eigenen Notizen. Abgeleitete Felder markiert das kiAufbereitet-Flag separat.
  const beschFinal = [segment, beschreibung].filter(Boolean).join("\n") || null

  return {
    externeId: item.identifier,
    kategorie: istSperrung ? "sperrung" : istGewichtsschild ? "gewicht" : "baustelle",
    name: typeof item.title === "string" && item.title.trim()
      ? item.title.trim()
      : `${istSperrung ? "Sperrung" : istGewichtsschild ? "Gewichtsbeschränkung" : "Baustelle"} ${road}`,
    beschreibung: beschFinal,
    lat,
    lng,
    strassenRef: road,
    attrs,
    ...(gueltigVon && { gueltigVon, realerStart: gueltigVon }),
    ...(gueltigBis && { gueltigBis }),
    kiAufbereitet: extrahiert,
    geom: item.geometry && typeof item.geometry === "object" && item.geometry.type ? item.geometry : null,
    _pk: projektKey(item.identifier), // Gruppierungs-Hilfsfelder (von validateObstacle ignoriert)
    _ri: typeof item.subtitle === "string" ? item.subtitle.trim() : "",
    quelle: {
      // Quelle = Autobahn GmbH; Link öffnet die offizielle Autobahn-Seite (nicht den JSON-Endpunkt).
      name: `Autobahn GmbH · ${road}`,
      url: "https://autobahn.de",
      aktualisiertAm: new Date().toISOString(),
    },
  }
}

/** Mehrere Teil-Segmente EINES Projekts + EINER Richtung → ein Strecken-Hindernis: kombinierte Linien-
 *  Geometrie (MultiLineString), schärfste Maße, frühestes Von / spätestes Bis. Behebt die N-fach-Duplikate
 *  und liefert die Strecke (Linie + 1 Pin) statt N Punkte. Gruppe der Größe 1 → unverändert. */
function mergeAutobahnGruppe(group) {
  if (group.length === 1) return group[0]
  const first = group[0]
  const lines = []
  for (const o of group) {
    const g = o.geom
    if (!g) continue
    if (g.type === "LineString") lines.push(g.coordinates)
    else if (g.type === "MultiLineString") lines.push(...g.coordinates)
  }
  const MIN_KEYS = new Set(["restbreiteM", "maxHoeheM", "maxGewichtT", "maxBreiteM", "maxAchslastT", "spurenFrei"])
  const MAX_KEYS = new Set(["spurenGesperrt", "sperrlaengeM"])
  const attrs = {}
  for (const o of group) {
    for (const [k, v] of Object.entries(o.attrs ?? {})) {
      if (typeof v === "boolean") { if (v) attrs[k] = true }
      else if (typeof v === "number") {
        if (MIN_KEYS.has(k)) attrs[k] = attrs[k] == null ? v : Math.min(attrs[k], v)
        else if (MAX_KEYS.has(k)) attrs[k] = attrs[k] == null ? v : Math.max(attrs[k], v)
        else attrs[k] = attrs[k] ?? v
      } else attrs[k] = attrs[k] ?? v
    }
  }
  const vons = group.map((o) => o.gueltigVon).filter(Boolean).sort()
  const bisse = group.map((o) => o.gueltigBis).filter(Boolean).sort()
  const gueltigVon = vons[0] ?? null
  const gueltigBis = bisse.length ? bisse[bisse.length - 1] : null
  return {
    // Restriktions-Profil MIT in die externeId — sonst kollidieren zwei Bauphasen gleicher Projekt-Nr./
    // Richtung mit unterschiedlicher Breite (5,85 m vs 3,5 m) auf einer ID.
    externeId: `${first._pk}#${stabilHash(first._ri, first.kategorie, restriktionsProfil(attrs))}`, // stabil, eindeutig je Projekt+Richtung+Profil
    kategorie: first.kategorie,
    name: first.name,
    beschreibung: first.beschreibung ?? null, // purer Quelltext; die Strecke steckt in geom (MultiLineString)
    lat: first.lat,
    lng: first.lng,
    strassenRef: first.strassenRef,
    attrs,
    ...(gueltigVon && { gueltigVon, realerStart: gueltigVon }),
    ...(gueltigBis && { gueltigBis }),
    kiAufbereitet: group.some((o) => o.kiAufbereitet),
    geom: lines.length ? { type: "MultiLineString", coordinates: lines } : first.geom ?? null,
    quelle: first.quelle,
  }
}

/** Teil-Segmente (gleiche Projekt-ID + Richtung + Kategorie + RESTRIKTIONS-PROFIL) zu Strecken-
 *  Hindernissen zusammenfassen. Das Profil MUSS in den Key: eine Maßnahme (gleiche Projekt-Nr.) hat oft
 *  mehrere BAUPHASEN mit UNTERSCHIEDLICHER Durchfahrtsbreite (z.B. A7 2025-009385: 5,85 m / 5,5 m /
 *  3,5 m). Ohne Profil-Key landeten alle in einer Gruppe, der Min-Merge der restbreiteM machte JEDE
 *  Phase so schmal wie die schmalste (3,5 m) → falsch-kritisch + Widerspruch Text (5,85 m) ↔ Restbreite
 *  (3,5 m). Min-Merge bleibt korrekt für RÄUMLICHE Nacht-/Teilstücke GLEICHEN Profils (z.B.
 *  Fahrbahnverengung ohne Maße → 1 Strecke); unterschiedliche Profile bleiben getrennt. */
export function gruppiereStrecken(obstacles) {
  const groups = new Map()
  for (const o of obstacles) {
    const key = `${o._pk}|${o._ri}|${o.kategorie}|${restriktionsProfil(o.attrs)}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(o)
  }
  return [...groups.values()].map(mergeAutobahnGruppe)
}

/** Begrenzte Parallelität für die vielen Road-Requests (107 Roads × 2 Services). */
async function mapPool(items, limit, fn) {
  const out = []
  let i = 0
  const worker = async () => {
    while (i < items.length) {
      const idx = i++
      out[idx] = await fn(items[idx])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}

export const autobahnConnector = {
  quelleId: "0001",
  name: "Autobahn-API (verkehr.autobahn.de)",
  schedule: "0 4 * * *",
  // roadworks+closure je Road = voller aktueller Bestand → Reconcile erlaubt (abgebaute Meldungen raus).
  vollbestand: true,

  /** ctx: { fetchImpl, env, timeoutMs, log } → { obstacles: NormalizedObstacle[] } */
  async fetch({ fetchImpl = globalThis.fetch, env = {}, timeoutMs = 4000, log = () => {} } = {}) {
    // ALLE Autobahnen dynamisch von der API. env.AUTOBAHN_ROADS nur als optionaler Override (Tests/Debug).
    const override = String(env.AUTOBAHN_ROADS || "").trim()
    let roads
    if (override) {
      roads = override.split(",").map((r) => r.trim()).filter(Boolean)
    } else {
      const list = await fetchJson(ROADS_URL, { fetchImpl, timeoutMs })
      roads = Array.isArray(list?.roads) ? list.roads.map((r) => String(r).trim()).filter(Boolean) : []
    }
    if (!roads.length) {
      log("keine Road-Liste von der Autobahn-API erhalten — 0 obstacles")
      return { obstacles: [] }
    }
    log(`${roads.length} Autobahnen × {roadworks, closure}`)

    const SERVICES = ["roadworks", "closure"]
    const obstacles = []
    let baustellen = 0, sperrungen = 0, fehlgeschlagen = 0
    const perRoad = await mapPool(roads, 6, async (road) => {
      const found = []
      for (const service of SERVICES) {
        const url = serviceUrl(road, service)
        const json = await fetchJson(url, { fetchImpl, timeoutMs })
        // T-311/T-314: gescheiterter Road/Service-Abruf = Teilbestand → complete:false, damit
        // der Reconcile die (nur diesmal nicht geladenen) Funde nicht fälschlich deaktiviert.
        if (!json) { fehlgeschlagen += 1; continue }
        const items = Array.isArray(json[service]) ? json[service] : []
        for (const it of items) {
          const norm = normalizeAutobahn(it, road, service, url)
          if (norm) {
            found.push(norm)
            if (norm.kategorie === "sperrung") sperrungen += 1
            else baustellen += 1
          }
        }
      }
      return found
    })
    for (const list of perRoad) if (Array.isArray(list)) obstacles.push(...list)

    // Teil-Segmente eines Projekts+Richtung zu Strecken zusammenfassen (kein 3×-Duplikat, Linie statt Punkt).
    const strecken = gruppiereStrecken(obstacles)
    log(`Autobahn gesamt: ${obstacles.length} Teil-Segmente → ${strecken.length} Strecken (${baustellen} Baustellen, ${sperrungen} Sperrungen) über ${roads.length} Roads${fehlgeschlagen ? `, ${fehlgeschlagen} Abrufe gescheitert → Teilbestand` : ""}`)
    return { obstacles: strecken, complete: fehlgeschlagen === 0 }
  },
}
