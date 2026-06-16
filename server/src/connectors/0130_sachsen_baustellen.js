// Connector Quelle 0130: Sachsen — Baustellen/Sperrungen (Baustelleninformationssystem Sachsen,
// LASuV). GeoJSON-ZIP-Download, EPSG:25833 (UTM Zone 33!), LineString → Strecken-Geometrie
// (relevant für Schwertransport). Landesweit B/S/K/G, geplant + laufend. Lizenz: CC-BY 4.0,
// Namensnennung „Landesamt für Straßenbau und Verkehr des Landes Sachsen, Baustelleninformations-
// system Sachsen". ZIP enthält Sperrungen + Umleitungen — wir nutzen die Sperrungen.

import { makeNormalized, getBuffer, unzipEntry, utmZuWgs84, dateOnly, tonnageAusText, meterAusText } from "./_helpers.js"

const QUELLE = "0130"
const QUELLE_NAME = "Baustelleninformationssystem Sachsen (LASuV)"
const QUELLE_URL = "https://www.baustellen.sachsen.de/"
const ZIP = "https://www.list.smwa.sachsen.de/gdi/download/baustelleninfo/Baustelleninfo_Sachsen_geojson.zip"

function refAus(s) { const m = String(s ?? "").match(/\b([ABS]|K)\s?(\d{1,4})\b/); return m ? `${m[1]}${m[2]}` : null }
// EPSG:25833 → WGS84 für die GANZE Geometrie (Linie soll als Strecke gerendert werden).
function reproj(geom) {
  if (!geom?.coordinates) return null
  const map = (c) => (Array.isArray(c[0]) ? c.map(map) : utmZuWgs84(c[0], c[1], 33))
  return { type: geom.type, coordinates: map(geom.coordinates) }
}

export const sachsenBaustellenConnector = {
  quelleId: QUELLE,
  name: QUELLE_NAME,
  schedule: "0 8,12,18 * * *",
  vollbestand: true,

  async fetch({ timeoutMs = 60000, log = () => {} } = {}) {
    const buf = await getBuffer(ZIP, { timeoutMs })
    const entry = buf && unzipEntry(buf, /Sperrungen.*\.geojson$/i)
    if (!entry) { log(`${QUELLE}: ZIP/Entpacken fehlgeschlagen`); return { obstacles: [] } }
    const data = JSON.parse(entry.toString("utf8").replace(/^﻿/, ""))
    const feats = data?.features ?? []

    const obstacles = feats.map((f) => {
      const p = f.properties ?? {}
      const g = reproj(f.geometry)
      let c = g?.coordinates
      while (Array.isArray(c) && Array.isArray(c[0])) c = c[0]
      const [lng, lat] = Array.isArray(c) ? c : [null, null]
      const istLinie = g?.type === "LineString" || g?.type === "MultiLineString"
      const vollsperrung = String(p.Sperrung_Art_Klartext ?? "").toLowerCase().includes("vollsperrung") || undefined
      const text = [p.Sperrung_Grund, p.Bemerkung].filter(Boolean).join(" ")
      const tonnage = tonnageAusText(text)
      return makeNormalized({
        externeId: p.ID,
        kategorie: tonnage ? "gewicht" : vollsperrung ? "sperrung" : "baustelle",
        name: p.Sperrung_Grund || p.Strasse || "Baustelle",
        beschreibung: p.Bemerkung || p.Strasse || null,
        lat, lng,
        strassenRef: refAus(p.Strasse),
        attrs: { maxGewichtT: tonnage, restbreiteM: meterAusText(text, /breite|einengung/i), vollsperrung },
        gueltigVon: dateOnly(p.Sperrung_von), gueltigBis: dateOnly(p.Sperrung_bis), realerStart: dateOnly(p.Sperrung_von),
        geom: istLinie ? g : null,
        quelleName: QUELLE_NAME, quelleUrl: QUELLE_URL,
      })
    })
    log(`${QUELLE}: ${feats.length} Sperrungen/Baustellen`)
    return { obstacles }
  },
}
