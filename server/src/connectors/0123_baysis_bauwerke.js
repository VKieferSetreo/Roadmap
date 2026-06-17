// Connector Quelle 0123: BAYSIS Bauwerke (Bayern) — Brücken + Tunnel-/Trogbauwerke.
// Port aus API/Länder/Bayern/BAYSIS-Bauwerke-WFS-WMS/*.cron.mjs.
// Strukturierte GST-Restriktionsquelle (Höhen-/Gewichtsbeschränkung, Brückenklasse,
// Grundsätzliche_Schwertransportsperre). ArcGIS-WFSServer liefert GeoJSON nativ in WGS84,
// paginiert über count/startIndex. Live numberMatched≈12287 → maxPages so gesetzt, dass der
// VOLLE Bestand kommt (pageSize 1500 × 10 = 15000) → vollbestand=true.

import { makeNormalized, fetchAllFeatures, ersterPunkt, stabilHash } from "./_helpers.js"

const QUELLE = "0123"
const QUELLE_NAME = "BAYSIS Bauwerke (Bayerische Straßenbauverwaltung)"
const QUELLE_URL = "https://www.baysis.bayern.de/internet/geodaten_dienste/wfs/"
const BASE =
  "https://gisportal-stmb.bayern.de/server/services/WFS/BAYSIS_Bauwerke/MapServer/WFSServer" +
  "?service=WFS&version=2.0.0&request=GetFeature&typeNames=BAYSIS_Bauwerke:bauwerke" +
  "&outputFormat=GEOJSON&srsName=EPSG:4326"

function bauwerkName(p) {
  const teile = [p.Art, p.Straßenbezeichnung, p.Bauwerksnummer && `BW ${p.Bauwerksnummer}`].filter(Boolean)
  return teile.join(" ") || "Bauwerk"
}
function normRef(r) {
  if (!r) return null
  const m = String(r).toUpperCase().match(/\b(A|B|ST|L|K)\s?\d{1,4}\b/)
  return m ? m[0].replace(/\s/, "") : null
}
// "3,60 m" / "4,0" / "30" / "6,0 t" → Zahl (robust, auch ohne Einheit).
function zahlMitEinheit(v) {
  if (v == null || String(v).trim() === "") return null
  const s = String(v).replace(",", ".")
  const m = s.match(/(\d+(?:\.\d+)?)/)
  if (!m) return null
  const n = Number(m[1])
  return Number.isFinite(n) ? n : null
}
// HINWEIS: Brückenklasse NICHT als maxGewichtT-Proxy nutzen. JEDE Brücke trägt eine Brückenklasse
// (400/400) — ein Proxy würde alle ~12.000 bayerischen Brücken von "reiner Infrastruktur" (wird
// übersprungen) zu gespeicherten Hindernissen machen → N+1-Import-Explosion (~100s) + Funde-Flut.
// BK-Bewusstsein gehört in die Routing-Auswertung (BK der Brücken auf der Route vs. Transportgewicht),
// nicht in den Import als globales Hindernis. (Revert von efcd717, Performance-Regression.)

export const baysisBauwerkeConnector = {
  quelleId: QUELLE,
  name: QUELLE_NAME,
  schedule: "0 8,12,18 * * *",
  vollbestand: true,

  async fetch({ env = {}, timeoutMs = 60000, log = () => {} } = {}) {
    // maxPages nur hoher Sicherheits-Backstop — fetchAllFeatures stoppt selbst bei numberMatched
    // bzw. erster Teilseite. KEIN Abschneiden des Bestands, auch wenn die Quelle über 15000 wächst.
    const feats = await fetchAllFeatures(BASE, { mode: "wfs2", pageSize: 1500, maxPages: 500, timeoutMs, log })
    log(`${QUELLE}: ${feats.length} Bauwerke geladen`)

    const obstacles = feats.map((f) => {
      const p = f.properties ?? {}
      // Koords retten: nicht nur Point — alle Geometrie-Typen (Line/Polygon/Multi) über den ersten
      // Punkt; bereits WGS84 (srsName=EPSG:4326), daher keine UTM-Reprojektion nötig. So gehen keine
      // Einträge mit Nicht-Point-Geometrie verloren.
      const [lng, lat] = ersterPunkt(f.geometry)
      const art = String(p.Art ?? "")
      const kategorie = /tunnel|trog/i.test(art) ? "tunnel" : "bruecke"
      const gstSperre = String(p.Grundsätzliche_Schwertransportsperre ?? "").trim().toLowerCase() === "vorhanden"
      // externeId EINDEUTIG je echtem Teilbauwerk UND STABIL über Läufe (reconcile-stabil):
      // Bauwerksnummer (ASB-Nr) ist KEIN Unique-Key — zwei Teilbauwerke (je Richtungsfahrbahn) bzw.
      // dasselbe Bauwerk auf zwei Abschnitten teilen sie sich → würden beim Upsert kollabieren.
      // Diskriminator-Hash aus Geometrie + unterscheidenden Quellfeldern (GmlID/OBJECTID feature-stabil,
      // Art, Straße). NIE Array-Index/Zufall (nicht reconcile-stabil).
      const quellId = p.Bauwerksnummer ?? p.OBJECTID ?? f.id ?? "BW"
      const disc = stabilHash(lat, lng, p.GmlID ?? p.OBJECTID ?? f.id, art, p.Straßenbezeichnung)
      return makeNormalized({
        externeId: `${quellId}#${disc}`,
        kategorie,
        name: bauwerkName(p),
        beschreibung: art || null,
        lat, lng,
        strassenRef: normRef(p.Straßenbezeichnung),
        attrs: {
          maxHoeheM: zahlMitEinheit(p.Höhenbeschränkung),
          maxGewichtT: zahlMitEinheit(p.Gewichtsbeschränkung),
          grundsaetzlicheGstSperre: gstSperre || undefined,
        },
        quelleName: QUELLE_NAME, quelleUrl: QUELLE_URL,
      })
    })
    return { obstacles }
  },
}
