// Connector Quelle 0118: Umleitungsstrecken Schleswig-Holstein (LBV.SH / GDI-SH).
// Port aus API/Länder/Schleswig-Holstein/OpenData-SH-Umleitungsstrecken-WFS/umleitungsstrecken-sh.cron.mjs.
// ArcGIS-WFS 2.0, GeoJSON, EPSG:4326 nativ. ~173 Umleitungsstrecken. GST-Ausweichkorridor →
// kategorie sperrung (neutraler Träger) + umleitung=true.

import { makeNormalized, fetchAllFeatures, dateOnly, num } from "./_helpers.js"

const QUELLE_NAME = "Umleitungsstrecken Schleswig-Holstein (LBV.SH / GDI-SH)"
const QUELLE_URL = "https://dienste.gdi-sh.de/WFS_SH_Baustelleninformationen"
const BASE =
  "https://dienste.gdi-sh.de/WFS_SH_Baustelleninformationen?Service=WFS&Version=2.0.0&Request=GetFeature" +
  "&typeNames=Baustelleninformationen:Umleitungsstrecken&outputFormat=GEOJSON&srsName=EPSG:4326"

function ersterPunkt(geom) {
  if (!geom) return [null, null]
  let c = geom.coordinates
  while (Array.isArray(c) && Array.isArray(c[0])) c = c[0]
  return [c?.[0] ?? null, c?.[1] ?? null]
}

// 06.09.2026: der Dienst hat die Attributnamen umbenannt. Im Juni lieferte er GROSSSCHREIBUNG
// (STRECKENFÜHRUNG, GÜLTIGKEIT, ZUSÄTZLICHER_ZEITBEDARF_IN_MIN), heute die gemischte Schreibweise
// der ArcGIS-Feld-Aliase (Streckenführung, Gültigkeit, Zusätzlicher_Zeitbedarf_in_min) — belegt per
// DescribeFeatureType. Der Zugriff auf die alten Keys ergab undefined, ohne dass irgendetwas
// fehlschlug: alle 178 Funde hiessen nur noch "Umleitungsstrecke", ohne Beschreibung und ohne
// Zeitraum. Der Dedup gruppiert auf kategorie|name|ort — ohne unterscheidenden Namen kollabierten
// die 178 Strecken auf 88 Ortsgruppen mit voellig neuen dup#-IDs, worauf der Reconcile-Guard 70 %
// Bestandsverlust sah und aussetzte (status=partial). Deshalb hier schreibweise-unabhaengig lesen:
// dieselbe Umbenennung (in welche Richtung auch immer) trifft uns damit nicht noch einmal.
function feld(p, name) {
  if (p?.[name] != null) return p[name]
  const ziel = name.normalize("NFC").toLowerCase()
  for (const k of Object.keys(p ?? {})) {
    if (k.normalize("NFC").toLowerCase() === ziel) return p[k]
  }
  return null
}
// "2026-05-18 - 2027-03-23" → {von, bis}
function gueltigkeit(s) {
  if (!s) return { von: null, bis: null }
  const t = String(s).split(/\s+-\s+/)
  return { von: dateOnly(t[0]), bis: dateOnly(t[1] ?? t[0]) }
}

export const umleitungsstreckenShConnector = {
  quelleId: "0118",
  name: QUELLE_NAME,
  schedule: "0 8,12,18 * * *",
  vollbestand: true,

  async fetch({ timeoutMs = 45000, log = () => {} } = {}) {
    const feats = await fetchAllFeatures(BASE, { mode: "wfs2", pageSize: 1000, maxPages: 200, timeoutMs })
    log(`SH-Umleitungsstrecken: ${feats.length} Features`)
    const obstacles = []
    for (const f of feats) {
      const p = f.properties ?? {}
      const [lng, lat] = ersterPunkt(f.geometry)
      const { von, bis } = gueltigkeit(feld(p, "GÜLTIGKEIT"))
      const streckenfuehrung = feld(p, "STRECKENFÜHRUNG")
      obstacles.push(makeNormalized({
        externeId: feld(p, "OBJECTID") ?? f.id,
        kategorie: "sperrung",
        name: `Umleitungsstrecke ${String(streckenfuehrung ?? "").slice(0, 60)}`.trim(),
        beschreibung: streckenfuehrung || null,
        lat, lng,
        // T-431: Umleitungskorridor ist eine (Multi)LineString in EPSG:4326 (nativ, keine
        // Reprojektion) — als geom durchreichen, sonst kollabiert der Korridor zum Punkt.
        geom:
          f.geometry?.type === "LineString" || f.geometry?.type === "MultiLineString"
            ? f.geometry
            : null,
        attrs: {
          umleitung: true,
          mehrwegKm: num(feld(p, "Mehrweg_in_km")) ?? undefined,
          zusatzzeitMin: num(feld(p, "ZUSÄTZLICHER_ZEITBEDARF_IN_MIN")) ?? undefined,
        },
        gueltigVon: von, gueltigBis: bis, realerStart: von,
        quelleName: QUELLE_NAME,
        quelleUrl: QUELLE_URL,
      }))
    }
    return { obstacles }
  },
}
