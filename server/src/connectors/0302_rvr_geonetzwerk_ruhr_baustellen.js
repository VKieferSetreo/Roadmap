// Connector Quelle 0302: RVR / GEONETZWERK.RUHR — Baustellen (Ruhrgebiet-GeoServer).
// Port aus API/Sonstige/rvr-geonetzwerk-ruhr-baustellen/rvr-geonetzwerk-ruhr-baustellen.cron.mjs.
// Zieht den GESAMTEN Baustellen-Bestand je GeoServer-Instanz (WFS GetFeature, GeoJSON, EPSG:25832).
//
// vollbestand=true: je Instanz holt ein GetFeature den vollen aktuellen Bestand (Layer < pageSize,
// kein Offset nötig). Reconcile erlaubt — fällt eine Baustelle aus dem Feed, wird sie deaktiviert.

import {
  makeNormalized, getJson, utmZuWgs84, dateOnly, tonnageAusText, meterAusText,
} from "./_helpers.js"

const QUELLE_NAME = "RVR / GEONETZWERK.RUHR — Baustellen"

// Ruhrgebiet-GeoServer (Pfad-Muster geodaten.<stadt>.de/geoserver/verkehr/baustellen).
// Herne ist die verifizierte Instanz; weitere Städte ergänzbar sobald Endpunkte auflösen.
const INSTANZEN = [
  { stadt: "Herne", base: "https://geodaten.herne.de/geoserver/verkehr/baustellen" },
]

/** WFS GetFeature → GeoJSON in EPSG:25832 (UTM Zone 32N). */
function wfsUrl(base) {
  return `${base}?SERVICE=WFS&VERSION=1.1.0&REQUEST=GetFeature&TYPENAME=baustelle&OUTPUTFORMAT=GeoJSON&SRSNAME=EPSG:25832`
}

/** Referenzpunkt (lat/lng) aus der UTM-Geometrie ziehen, erster Punkt nach WGS84 reprojizieren. */
function koordVonFeature(g) {
  if (!g) return { lat: null, lng: null }
  if (g.type === "Point") {
    const [lng, lat] = utmZuWgs84(g.coordinates[0], g.coordinates[1], 32)
    return { lat, lng }
  }
  if (g.type === "LineString") {
    const [lng, lat] = utmZuWgs84(g.coordinates[0][0], g.coordinates[0][1], 32)
    return { lat, lng }
  }
  if (g.type === "MultiLineString") {
    const [lng, lat] = utmZuWgs84(g.coordinates[0][0][0], g.coordinates[0][0][1], 32)
    return { lat, lng }
  }
  return { lat: null, lng: null }
}

/** "Teilsperrung mit LSA" / "Vollsperrung" → vollsperrung-Flag (true/undefined). */
function vollsperrung(einschr) {
  if (!einschr) return undefined
  return /vollsperr/i.test(einschr) ? true : undefined
}

export const rvrGeonetzwerkRuhrBaustellenConnector = {
  quelleId: "0302",
  name: QUELLE_NAME,
  schedule: "0 8,12,18 * * *",
  vollbestand: true,

  async fetch({ timeoutMs = 45000, log = () => {} } = {}) {
    const obstacles = []
    let verfuegbar = 0

    for (const inst of INSTANZEN) {
      const fc = await getJson(wfsUrl(inst.base), { timeoutMs })
      if (!fc) {
        log(`Instanz ${inst.stadt} nicht erreichbar — übersprungen`)
        continue
      }
      const feats = fc.features ?? []
      verfuegbar += feats.length
      log(`${inst.stadt}: ${feats.length} Baustellen`)

      for (const f of feats) {
        const p = f.properties ?? {}
        const { lat, lng } = koordVonFeature(f.geometry)
        // strasse z.B. "Forellstr. A 43" — Straßenref (A/B/L/K) heuristisch extrahieren
        const refMatch = String(p.strasse ?? "").match(/\b([ABLK])\s?-?\s?(\d+)\b/i)
        const strassenRef = refMatch ? `${refMatch[1].toUpperCase()}${refMatch[2]}` : null
        const text = [p.massnahme, p.einschr, p.bemerkung].filter(Boolean).join(" · ")

        obstacles.push(makeNormalized({
          externeId: p.gml_id ?? f.id,
          kategorie: "baustelle",
          name: p.massnahme ?? p.strasse ?? "Baustelle (RVR)",
          beschreibung: text || null,
          lat, lng,
          strassenRef,
          attrs: {
            vollsperrung: vollsperrung(p.einschr),
            restbreiteM: meterAusText(text, /breite/i),
            maxGewichtT: tonnageAusText(text),
          },
          realerStart: dateOnly(p.beginn),
          gueltigVon: dateOnly(p.beginn),
          gueltigBis: dateOnly(p.ende),
          quelleName: `${QUELLE_NAME} (${inst.stadt})`,
          quelleUrl: inst.base,
        }))
      }
    }

    log(`verfügbar: ${verfuegbar} · normalisiert: ${obstacles.length}`)
    return { obstacles }
  },
}
