// Connector Quelle 0301: Overpass API (OpenStreetMap) — GST-Restriktionen + Bauwerke.
// Port aus API/Sonstige/overpass-api/overpass-api.cron.mjs (1:1-Logik).
// Zieht OSM-Ways mit maxheight/maxweight/maxwidth/maxaxleload (+ bridge/tunnel) je Bundesland-Area.
//
// vollbestand=FALSE: Overpass kennt keinen Offset; Voll-DE in einem Query ist zu groß/last-intensiv
// (Timeout). Wir chunken über Bundesland-Areas (admin_level=4) und mergen — das deckt DE faktisch ab,
// aber falls einzelne Area-Queries timeouten fehlen Teile, daher KEIN destruktiver Reconcile.

import { makeNormalized } from "./_helpers.js"

const QUELLE_NAME = "Overpass API (OpenStreetMap)"
// Mehrere Instanzen — bei Rate-Limit (429) wird die nächste probiert.
const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
]
const UA = "Roadmap-Setreo-Cron/1.0 (klattigmaximilian@gmail.com)"

// Tags, die ein Strecken-Hindernis markieren.
const RESTRIKTIONS_TAGS = ["maxheight", "maxweight", "maxweight:rating:hgv", "maxwidth", "maxaxleload"]

// DE-weit über Bundesland-Areas chunken (Overpass hat keinen Offset → geografisches Chunking).
// WICHTIG: Bundesländer (admin_level=4) tragen ISO3166-2 (z.B. DE-HB) — NICHT ISO3166-1=DE
// (das steht nur am Land). Area-Selektor daher über ISO3166-2 (stabiler als der Name).
const BUNDESLAENDER = [
  { name: "Baden-Württemberg", iso: "DE-BW" }, { name: "Bayern", iso: "DE-BY" },
  { name: "Berlin", iso: "DE-BE" }, { name: "Brandenburg", iso: "DE-BB" },
  { name: "Bremen", iso: "DE-HB" }, { name: "Hamburg", iso: "DE-HH" },
  { name: "Hessen", iso: "DE-HE" }, { name: "Mecklenburg-Vorpommern", iso: "DE-MV" },
  { name: "Niedersachsen", iso: "DE-NI" }, { name: "Nordrhein-Westfalen", iso: "DE-NW" },
  { name: "Rheinland-Pfalz", iso: "DE-RP" }, { name: "Saarland", iso: "DE-SL" },
  { name: "Sachsen", iso: "DE-SN" }, { name: "Sachsen-Anhalt", iso: "DE-ST" },
  { name: "Schleswig-Holstein", iso: "DE-SH" }, { name: "Thüringen", iso: "DE-TH" },
]

function queryFuerLand(iso) {
  const tagFilter = RESTRIKTIONS_TAGS.map((t) => `way["${t}"](area.a);`).join("")
  return `[out:json][timeout:180];area["ISO3166-2"="${iso}"][admin_level=4]->.a;(${tagFilter});out tags geom;`
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** Overpass-Query mit Mirror-Rotation + Backoff bei 429 (Rate-Limit) / Fehlern. */
async function overpass(query, timeoutMs) {
  let lastErr
  // bis zu 3 Versuche, je Versuch eine andere Instanz; bei 429 vor dem nächsten warten.
  for (let attempt = 0; attempt < 3; attempt++) {
    const endpoint = ENDPOINTS[attempt % ENDPOINTS.length]
    try {
      const r = await fetch(endpoint, {
        method: "POST",
        headers: { "user-agent": UA, "content-type": "application/x-www-form-urlencoded" },
        body: "data=" + encodeURIComponent(query),
        signal: AbortSignal.timeout(timeoutMs),
      })
      if (r.status === 429) {
        lastErr = new Error("Overpass HTTP 429 (Rate-Limit)")
        await sleep(8000 * (attempt + 1)) // 8s, 16s, 24s
        continue
      }
      if (!r.ok) throw new Error(`Overpass HTTP ${r.status}`)
      return r.json()
    } catch (e) {
      lastErr = e
      await sleep(3000)
    }
  }
  throw lastErr ?? new Error("Overpass: alle Instanzen fehlgeschlagen")
}

/** OSM-Maßangabe → Zahl. Sentinels ("none"/"default"/"no_sign"/"unsigned") = keine echte Grenze. */
function osmMass(v) {
  if (v == null) return null
  const s = String(v).trim().toLowerCase()
  if (!s || ["none", "default", "no_sign", "unsigned", "no", "yes"].includes(s)) return null
  const m = s.replace(",", ".").match(/(\d+(?:\.\d+)?)/)
  return m ? Number(m[1]) : null
}

/** Kategorie aus den Tags: Bauwerk (tunnel/bridge) hat Vorrang, sonst nach restriktivem Maß. */
function kategorieAus(tags, maxHoeheM, maxBreiteM, maxGewichtT) {
  if (tags.tunnel && tags.tunnel !== "no") return "tunnel"
  if (tags.bridge && tags.bridge !== "no") return "bruecke"
  if (maxHoeheM != null || maxBreiteM != null) return "engstelle"
  if (maxGewichtT != null) return "gewicht"
  return "engstelle"
}

function koordVonElement(el) {
  if (!Array.isArray(el.geometry) || el.geometry.length === 0) return { lat: null, lng: null }
  return { lat: el.geometry[0].lat, lng: el.geometry[0].lon }
}

export const overpassApiConnector = {
  quelleId: "0301",
  name: QUELLE_NAME,
  schedule: "0 8,12,18 * * *",
  // Geografisches Area-Chunking ohne Offset; einzelne Land-Queries können timeouten →
  // KEIN vollständig garantierter Bestand → vollbestand=false (kein destruktiver Reconcile).
  vollbestand: false,

  async fetch({ env = {}, log = () => {} } = {}) {
    // EIGENER langer Timeout: Overpass braucht je großem Bundesland bis ~180 s. Der globale
    // EXTERNAL_TIMEOUT_MS (40 s, für REST-Feeds) würde die großen Länder killen → wir ignorieren
    // ihn hier bewusst. vollbestand=false: ein in einem Run getimeoutetes Land bleibt aus dem
    // letzten Run erhalten (kein destruktiver Reconcile), der Bestand heilt über mehrere Läufe.
    const timeoutMs = 200000
    // OVERPASS_ONLY_ISO (z.B. "DE-BY"): nur dieses eine Bundesland ziehen. Ermöglicht das
    // einmalige Backfill als 16 Einzel-Runs (je eigene DB-Transaktion) — übersteht Deploys/
    // Container-Restarts, idempotent re-runbar (Upsert auf way/<id>). Leer = alle 16 (Default).
    const nurIso = String(env.OVERPASS_ONLY_ISO ?? "").trim()
    const laender = nurIso ? BUNDESLAENDER.filter((b) => b.iso === nurIso) : BUNDESLAENDER
    const obstacles = []
    let verfuegbar = 0

    for (const [i, { name: land, iso }] of laender.entries()) {
      if (i > 0) await sleep(4000) // Rate-Limit-Höflichkeit zwischen den Bundesländern
      let data
      try {
        data = await overpass(queryFuerLand(iso), timeoutMs)
      } catch (e) {
        log(`${land}: Overpass-Fehler (${e.message}) — übersprungen`)
        continue
      }
      const elements = (data.elements ?? []).filter((e) => e.type === "way" && e.tags)
      verfuegbar += elements.length
      log(`${land}: ${elements.length} Ways mit Restriktions-Tag`)

      for (const el of elements) {
        const t = el.tags
        const maxHoeheM = osmMass(t.maxheight)
        const maxBreiteM = osmMass(t.maxwidth)
        // maxweight:rating:hgv = LKW-spezifische Tragfähigkeit → vor generischem maxweight
        const maxGewichtT = osmMass(t["maxweight:rating:hgv"]) ?? osmMass(t.maxweight)
        const maxAchslastT = osmMass(t.maxaxleload)

        // Nur Datensätze mit mind. einem echten Grenzwert (Sentinels rausgefiltert)
        if (maxHoeheM == null && maxBreiteM == null && maxGewichtT == null && maxAchslastT == null) continue

        const { lat, lng } = koordVonElement(el)
        const kategorie = kategorieAus(t, maxHoeheM, maxBreiteM, maxGewichtT)
        const name = t.name ?? t.ref
          ?? (t.bridge && t.bridge !== "no" ? "Brücke (OSM)"
            : t.tunnel && t.tunnel !== "no" ? "Tunnel (OSM)" : "Restriktion (OSM)")

        obstacles.push(makeNormalized({
          externeId: `way/${el.id}`,
          kategorie,
          name,
          beschreibung: t.highway ? `OSM highway=${t.highway}` : null,
          lat, lng,
          strassenRef: t.ref ?? null,
          attrs: { maxHoeheM, maxBreiteM, maxGewichtT, maxAchslastT },
          quelleName: QUELLE_NAME,
          quelleUrl: `https://www.openstreetmap.org/way/${el.id}`,
        }))
      }
    }

    log(`verfügbar (Ways m. Tag): ${verfuegbar} · normalisiert: ${obstacles.length}`)
    return { obstacles }
  },
}
