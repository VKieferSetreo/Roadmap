// Connector Quelle 0120: LSBB Sperrinfo Sachsen-Anhalt (SPERRINFOSYS ST).
// Port aus API/Länder/Sachsen-Anhalt/LSBB-Sperrinfo-WFS/lsbb-sperrinfo.cron.mjs.
// WFS 2.0, GeoJSON, EPSG:4326 nativ (keine Reprojektion). LineString-Geometrie, ~168 roadworks.
// LIZENZ: "non-commercial only" — kommerziell nur mit Freigabe MLV/LSBB.

import { makeNormalized, getJson, dateOnly, tonnageAusText, meterAusText } from "./_helpers.js"

const QUELLE_NAME = "LSBB Sperrinfo Sachsen-Anhalt (SPERRINFOSYS ST)"
const QUELLE_URL = "https://lsbb.sachsen-anhalt.de/service/baustellen-und-umleitungen"
const BASE = "https://service.ifak.eu/sperrinfo/wfs?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&TYPENAMES=roadworks"
const OUT = "&outputFormat=" + encodeURIComponent("application/json; subtype=geojson")
const PAGE = 1000, MAX_PAGES = 5

function katAus(p) {
  const k = String(p.kind ?? "").toUpperCase()
  const d = String(p.kind_description ?? "").toLowerCase()
  if (d.includes("sperr") || k === "S") return "sperrung"
  if (d.includes("einschränk") || k === "B") return "baustelle"
  return "baustelle"
}
function refAus(p) {
  const m = String(p.street ?? "").match(/\b([ABLK])\s?(\d{1,4})\b/)
  if (m) return `${m[1]}${m[2]}`
  if (p.bab_nr) { const b = String(p.bab_nr).match(/(\d+)/); if (b) return `A${b[1]}` }
  return null
}
function ersterPunkt(geom) {
  if (!geom) return [null, null]
  let c = geom.coordinates
  while (Array.isArray(c) && Array.isArray(c[0])) c = c[0]
  return [c?.[0] ?? null, c?.[1] ?? null]
}

export const lsbbSperrinfoConnector = {
  quelleId: "0120",
  name: QUELLE_NAME,
  schedule: "0 8,12,18 * * *",
  vollbestand: true,

  async fetch({ timeoutMs = 45000, log = () => {} } = {}) {
    const feats = []
    for (let page = 0; page < MAX_PAGES; page++) {
      const data = await getJson(`${BASE}${OUT}&count=${PAGE}&startIndex=${page * PAGE}`, { timeoutMs })
      const fs = data?.features ?? []
      feats.push(...fs)
      if (fs.length < PAGE) break
    }
    log(`ST-Sperrinfo: ${feats.length} roadworks`)
    const obstacles = []
    for (const f of feats) {
      const p = f.properties ?? {}
      const [lng, lat] = ersterPunkt(f.geometry)
      const text = [p.cause, p.kind_description].filter(Boolean).join(" — ")
      const tonnage = tonnageAusText(text)
      obstacles.push(makeNormalized({
        externeId: p.gid ?? p.feature_id ?? f.id,
        kategorie: tonnage ? "gewicht" : katAus(p),
        name: p.street || `Maßnahme ${p.location ?? ""}`,
        beschreibung: text || null,
        lat, lng,
        strassenRef: refAus(p),
        attrs: {
          maxGewichtT: tonnage ?? undefined,
          restbreiteM: meterAusText(text, /breite/i) ?? undefined,
        },
        gueltigVon: dateOnly(p.from_date), gueltigBis: dateOnly(p.to_date), realerStart: dateOnly(p.from_date),
        quelleName: QUELLE_NAME,
        quelleUrl: QUELLE_URL,
      }))
    }
    return { obstacles }
  },
}
