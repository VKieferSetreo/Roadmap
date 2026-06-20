// Connector Quelle 0128: MobiData BW — Baustelleninformationen (BEMaS).
// Port aus API/Länder/Baden-Württemberg/MobiData-BW-Baustellen-BEMaS/*.cron.mjs.
// Ein einziger GeoJSON-Feed (WGS84) liefert den GESAMTEN aktuellen Baustellen-Bestand
// (B/L/K) — keine Pagination nötig → vollbestand=true (Reconcile erlaubt).

import { makeNormalized, getJson, dateOnly, tonnageAusText, meterAusText } from "./_helpers.js"

const QUELLE = "0128"
const QUELLE_NAME = "MobiData BW — Baustelleninformationen (BEMaS)"
const QUELLE_URL = "https://mobidata-bw.de/dataset/baustelleninformationen-baden-wurttemberg"
const BASE = "https://api.mobidata-bw.de/datasets/traffic/roadworks/roadworks_geojson.json"
const UA = "Roadmap-Setreo-API-Katalog/1.0 (Schwertransport-Routing; kontakt: klattigmaximilian@gmail.com)"

function ersterPunkt(geom) {
  if (!geom) return [null, null]
  let c = geom.coordinates
  while (Array.isArray(c) && Array.isArray(c[0])) c = c[0]
  return [c?.[0] ?? null, c?.[1] ?? null] // Feed ist bereits WGS84 [lng,lat]
}
function strasseAusText(s) {
  if (!s) return null
  const m = String(s).match(/\b([ABLK]\s?\d{1,4})\b/) // "K1077 Böblingen-Gärtringen" → K1077
  return m ? m[1].replace(/\s/, "") : null
}

export const mobidataBwBaustellenConnector = {
  quelleId: QUELLE,
  name: QUELLE_NAME,
  schedule: "0 8,12,18 * * *",
  vollbestand: true,

  async fetch({ env = {}, timeoutMs = 45000, log = () => {} } = {}) {
    const data = await getJson(BASE, { headers: { "user-agent": UA }, timeoutMs })
    const feats = data?.features ?? []
    log(`${QUELLE}: ${feats.length} Features im Feed`)

    // T-442: BEMaS gibt eine durchgehende Baustelle als mehrere Segment-Features mit IDs wie
    // "…-sperrung.001/.002" zurück. Vor dem Normalisieren je Stamm-ID (ohne .NNN) zu EINEM
    // Feature mit MultiLineString zusammenführen — sonst zersplittert eine Maßnahme in N Funde
    // (dedupeObstacles greift über lange Korridore nicht; es gruppiert nur auf ~100 m).
    const stamm = (f) => String(f.properties?.id ?? f.id ?? "").replace(/\.\d+$/, "")
    const gruppen = new Map()
    for (const f of feats) {
      const key = stamm(f) || `__${gruppen.size}`
      if (!gruppen.has(key)) gruppen.set(key, [])
      gruppen.get(key).push(f)
    }
    const merged = [...gruppen.values()].map((group) => {
      if (group.length === 1) return group[0]
      const lines = []
      for (const f of group) {
        const t = f.geometry?.type
        if (t === "LineString") lines.push(f.geometry.coordinates)
        else if (t === "MultiLineString") lines.push(...f.geometry.coordinates)
      }
      const base = group[0]
      return {
        ...base,
        geometry: lines.length ? { type: "MultiLineString", coordinates: lines } : base.geometry,
        properties: { ...base.properties, id: stamm(base) || base.properties?.id },
      }
    })

    const obstacles = merged.map((f) => {
      const p = f.properties ?? {}
      const [lng, lat] = ersterPunkt(f.geometry)
      // Strecke durchreichen statt auf einen Punkt zu kollabieren: nur Linien werden zu Strecken-
      // Funden (Linien-Render + geometrischer Gegenfahrbahn-Filter, der die Reiserichtung aus der
      // Geometrie liest). Punkt-Features bleiben Punkt-Meldungen (immer sichtbar).
      const typ = f.geometry?.type
      const geom = typ === "LineString" || typ === "MultiLineString" ? f.geometry : null
      const istSperrung = String(p.type ?? "").toUpperCase().includes("ROAD_CLOSED")
      const text = [p.description, p.subtype].filter(Boolean).join(" ")
      const tonnage = tonnageAusText(text)
      return makeNormalized({
        externeId: p.id ?? f.id,
        kategorie: tonnage ? "gewicht" : istSperrung ? "sperrung" : "baustelle",
        name: p.description || p.street || (istSperrung ? "Sperrung" : "Baustelle"),
        beschreibung: p.description || null,
        lat, lng,
        strassenRef: strasseAusText(p.street),
        attrs: {
          restbreiteM: meterAusText(text, /breite|einengung/i),
          maxGewichtT: tonnage,
          vollsperrung: istSperrung || undefined,
          // T-441: direction-Enum (ONE_DIRECTION|BOTH_DIRECTIONS, 100% gesetzt) als boolean-attr
          // durchreichen — NICHT in die richtung-Spalte (NOT-NULL-CHECK-Enum, vom INSERT nicht
          // beschrieben). makeNormalized behält nur number|boolean, daher boolean statt String.
          richtungEinseitig: String(p.direction ?? "").toUpperCase().includes("ONE") || undefined,
        },
        realerStart: dateOnly(p.starttime),
        gueltigVon: dateOnly(p.starttime),
        gueltigBis: dateOnly(p.endtime),
        geom,
        quelleName: QUELLE_NAME, quelleUrl: QUELLE_URL,
      })
    })
    return { obstacles }
  },
}
