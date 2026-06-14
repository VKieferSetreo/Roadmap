// Referenz-Connector Quelle 0001: Autobahn-API (verkehr.autobahn.de), Baustellen.
// GET /o/autobahn/{road}/services/roadworks pro Road aus env AUTOBAHN_ROADS.
// Timeout/Fehler je Road tolerant (fetchJson → null → Road übersprungen + Log).

import { fetchJson } from "../external/http.js"
import { extractStammdaten } from "./_helpers.js"

export const AUTOBAHN_DEFAULT_ROADS = "A1,A2,A3,A5,A7,A8,A9,A24"

const roadworksUrl = (road) =>
  `https://verkehr.autobahn.de/o/autobahn/${encodeURIComponent(road)}/services/roadworks`

const isoDateOrNull = (ts) => {
  if (typeof ts !== "string") return null
  const d = new Date(ts)
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
}

/**
 * Roadwork-Item der Autobahn-API → NormalizedObstacle (oder null wenn unbrauchbar).
 * lat/long kommen als Strings; identifier ist die stabile externe ID (Dedupe-Anker).
 */
export function normalizeRoadwork(rw, road, url) {
  const lat = Number(rw?.coordinate?.lat)
  const lng = Number(rw?.coordinate?.long)
  if (typeof rw?.identifier !== "string" || !rw.identifier ||
      !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null
  }
  const beschreibung = [rw.subtitle, ...(Array.isArray(rw.description) ? rw.description : [])]
    .filter((s) => typeof s === "string" && s.trim())
    .join("\n") || null
  const start = isoDateOrNull(rw.startTimestamp)
  const ende = isoDateOrNull(rw.endTimestamp)

  // Strip-down: Breite/Höhe/Gewicht/Länge + Gültigkeit/Zeitfenster stecken bei der Autobahn-API NUR
  // im Beschreibungstext ("Maximale Durchfahrtsbreite: 10.75 m", "15.06.26 von 07:00 bis 19:00 Uhr").
  const ex = extractStammdaten(beschreibung)
  const attrs = {}
  for (const k of ["restbreiteM", "maxHoeheM", "maxGewichtT", "sperrlaengeM"]) {
    if (ex[k] != null) attrs[k] = ex[k]
  }
  if (ex.zeitfenster) attrs.zeitfenster = ex.zeitfenster
  const gueltigVon = start ?? ex.gueltigVon ?? null
  const gueltigBis = ende ?? ex.gueltigBis ?? null
  const realerStart = start ?? ex.gueltigVon ?? null
  const extrahiert = Object.keys(attrs).length > 0 || (!start && ex.gueltigVon) || (!ende && ex.gueltigBis)

  return {
    externeId: rw.identifier,
    kategorie: "baustelle",
    name: typeof rw.title === "string" && rw.title.trim() ? rw.title.trim() : `Baustelle ${road}`,
    beschreibung: extrahiert && beschreibung
      ? `${beschreibung}\n· Angaben aus Meldungstext extrahiert`
      : beschreibung,
    lat,
    lng,
    strassenRef: road,
    attrs,
    ...(gueltigVon && { gueltigVon, realerStart }),
    ...(gueltigBis && { gueltigBis }),
    kiAufbereitet: extrahiert,
    quelle: {
      name: `Autobahn-API · ${road} Roadworks`,
      url,
      aktualisiertAm: new Date().toISOString(),
    },
  }
}

export const autobahnConnector = {
  quelleId: "0001",
  name: "Autobahn-API (verkehr.autobahn.de)",
  schedule: "0 4 * * *",
  // Die Roadworks-API liefert je Road den vollen aktuellen Baustellen-Bestand →
  // Reconcile erlaubt: fällt eine Baustelle aus dem Feed, wird sie deaktiviert.
  vollbestand: true,

  /** ctx: { fetchImpl, env, timeoutMs, log } → { obstacles: NormalizedObstacle[] } */
  async fetch({ fetchImpl = globalThis.fetch, env = {}, timeoutMs = 4000, log = () => {} } = {}) {
    const roads = String(env.AUTOBAHN_ROADS || AUTOBAHN_DEFAULT_ROADS)
      .split(",").map((r) => r.trim()).filter(Boolean)

    const obstacles = []
    for (const road of roads) {
      const url = roadworksUrl(road)
      const json = await fetchJson(url, { fetchImpl, timeoutMs })
      if (!json) {
        log(`${road}: keine Antwort (Timeout/Fehler) — Road übersprungen`)
        continue
      }
      const items = Array.isArray(json.roadworks) ? json.roadworks : []
      let used = 0
      for (const rw of items) {
        const norm = normalizeRoadwork(rw, road, url)
        if (norm) {
          obstacles.push(norm)
          used += 1
        }
      }
      log(`${road}: ${items.length} Meldungen, ${used} verwertbar`)
    }
    return { obstacles }
  },
}
