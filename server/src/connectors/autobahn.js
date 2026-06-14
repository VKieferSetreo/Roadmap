// Referenz-Connector Quelle 0001: Autobahn-API (verkehr.autobahn.de).
// Zieht ALLE Autobahnen (Road-Liste dynamisch von der API) × {Baustellen (roadworks), Sperrungen (closure)}.
// NICHTS wird gedroppt (keine hardcoded Road-Whitelist mehr) und NICHTS aggregiert (externeId = identifier,
// eindeutig je Richtung/Bauphase). Native Felder werden DIREKT gemappt statt hergeleitet:
//   subtitle → Richtung · startTimestamp + "Ende:"-Zeile → Gültig von/bis · impact.symbols → freie/gesperrte
//   Spuren · impact.lower/upper → Streckenabschnitt. future=true (zukünftig startende) bleibt erhalten.

import { fetchJson } from "../external/http.js"
import { extractStammdaten } from "./_helpers.js"

// extractStammdaten-Felder, die KEINE attrs sind (eigene Spalten / Top-Level).
const EX_NICHT_ATTR = new Set(["gueltigVon", "gueltigBis", "strassenRef", "richtung"])

const ROADS_URL = "https://verkehr.autobahn.de/o/autobahn/"
const serviceUrl = (road, service) =>
  `https://verkehr.autobahn.de/o/autobahn/${encodeURIComponent(road)}/services/${service}`

// Beibehalten für Tests/Fallback — wird NICHT mehr als Whitelist genutzt (nur wenn env.AUTOBAHN_ROADS gesetzt).
export const AUTOBAHN_DEFAULT_ROADS = "A1,A2,A3,A5,A7,A8,A9,A24"

const isoDateOrNull = (ts) => {
  if (typeof ts !== "string") return null
  const d = new Date(ts)
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
}

/** "Ende: 31.08.26 um 15:00 Uhr" aus den description-Zeilen → ISO-Datum (natives Ende statt Heuristik). */
function endeAusBeschreibung(descLines) {
  const txt = Array.isArray(descLines) ? descLines.join("\n") : String(descLines ?? "")
  const m = txt.match(/Ende[^0-9]{0,14}(\d{1,2})\.(\d{1,2})\.(\d{2,4})/i)
  if (!m) return null
  const yyyy = m[3].length === 2 ? "20" + m[3] : m[3]
  return `${yyyy}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`
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
  const istSperrung = service === "closure" || item.isBlocked === "true"
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

  const gueltigVon = start ?? ex.gueltigVon ?? null
  const gueltigBis = ende ?? ex.gueltigBis ?? null
  // Streckenabschnitt nativ (impact.lower/upper) → falls vorhanden vorne an die Beschreibung.
  const segment = item?.impact?.lower && item?.impact?.upper
    ? `Abschnitt: ${item.impact.lower} – ${item.impact.upper}` : null
  const extrahiert = Object.keys(attrs).length > 0 || (!!ende && !start) || (!start && !!ex.gueltigVon)
  const beschFinal = [segment, beschreibung].filter(Boolean).join("\n") || null

  return {
    externeId: item.identifier,
    kategorie: istSperrung ? "sperrung" : "baustelle",
    name: typeof item.title === "string" && item.title.trim()
      ? item.title.trim()
      : `${istSperrung ? "Sperrung" : "Baustelle"} ${road}`,
    beschreibung: extrahiert && beschFinal ? `${beschFinal}\n· Angaben aus Meldungstext extrahiert` : beschFinal,
    lat,
    lng,
    strassenRef: road,
    attrs,
    ...(gueltigVon && { gueltigVon, realerStart: gueltigVon }),
    ...(gueltigBis && { gueltigBis }),
    kiAufbereitet: extrahiert,
    quelle: {
      name: `Autobahn-API · ${road} ${service}`,
      url,
      aktualisiertAm: new Date().toISOString(),
    },
  }
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
    let baustellen = 0, sperrungen = 0
    const perRoad = await mapPool(roads, 6, async (road) => {
      const found = []
      for (const service of SERVICES) {
        const url = serviceUrl(road, service)
        const json = await fetchJson(url, { fetchImpl, timeoutMs })
        if (!json) continue
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

    log(`Autobahn gesamt: ${obstacles.length} (${baustellen} Baustellen, ${sperrungen} Sperrungen) über ${roads.length} Roads`)
    return { obstacles }
  },
}
