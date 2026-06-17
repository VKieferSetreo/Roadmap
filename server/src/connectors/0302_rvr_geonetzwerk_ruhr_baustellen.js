// Connector Quelle 0302: RVR / GEONETZWERK.RUHR — Baustellen (Ruhrgebiet-GeoServer).
// Port aus API/Sonstige/rvr-geonetzwerk-ruhr-baustellen/rvr-geonetzwerk-ruhr-baustellen.cron.mjs.
// Zieht den GESAMTEN Baustellen-Bestand je GeoServer-Instanz (WFS GetFeature, GeoJSON, EPSG:25832).
//
// vollbestand=true: je Instanz holt ein GetFeature den vollen aktuellen Bestand (Layer < pageSize,
// kein Offset nötig). Reconcile erlaubt — fällt eine Baustelle aus dem Feed, wird sie deaktiviert.

import {
  makeNormalized, dateOnly, tonnageAusText, meterAusText,
  stabilHash, fetchAllFeatures, ersterPunkt, reprojGeom,
} from "./_helpers.js"

// Linien-/Flächen-Geometrien werden zusätzlich als geom durchgereicht (Korridor-Clip,
// Linien-Render, Gegenfahrbahn-Filter). Reine Punkte tragen keine Strecke → kein geom.
const LINIEN_FLAECHE = new Set([
  "LineString", "MultiLineString", "Polygon", "MultiPolygon",
])

/** Volle Linien-/Flächen-Geometrie in WGS84 (EPSG:25832 → Zone 32, identisch zum Punkt-Pfad).
 *  Point/MultiPoint → null (kein Strecken-Render). */
function streckenGeom(g) {
  if (!g || !LINIEN_FLAECHE.has(g.type)) return null
  return reprojGeom(g, 32)
}

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

/** Referenzpunkt (lat/lng) geometrie-agnostisch ziehen — Point bis MultiPolygon, beliebig
 *  verschachtelt. ersterPunkt steigt in coordinates ab und reprojiziert UTM(>1000)→WGS84.
 *  KEINE Geometrietypen mehr verlieren (kein Default-null mehr für Polygon/MultiPoint/etc). */
function koordVonFeature(g) {
  const [lng, lat] = ersterPunkt(g, 32)
  return { lat, lng }
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
      // Paginierter Vollabruf statt einem ungekappten GetFeature: VERSION=1.1.0 → mode:'wfs1'
      // (maxFeatures). Kein stilles Server-Default-Limit mehr; ein hohes pageSize zieht den
      // gesamten Bestand. So schneidet Reconcile (vollbestand=true) keine echten Einträge ab.
      const feats = await fetchAllFeatures(wfsUrl(inst.base), {
        mode: "wfs1", pageSize: 50000, maxPages: 500, timeoutMs, log,
      })
      if (!feats || feats.length === 0) {
        log(`Instanz ${inst.stadt} nicht erreichbar oder leer — übersprungen`)
        continue
      }
      verfuegbar += feats.length
      log(`${inst.stadt}: ${feats.length} Baustellen`)

      for (const f of feats) {
        const p = f.properties ?? {}
        const { lat, lng } = koordVonFeature(f.geometry)
        // strasse z.B. "Forellstr. A 43" — Straßenref (A/B/L/K) heuristisch extrahieren
        const refMatch = String(p.strasse ?? "").match(/\b([ABLK])\s?-?\s?(\d+)\b/i)
        const strassenRef = refMatch ? `${refMatch[1].toUpperCase()}${refMatch[2]}` : null
        const text = [p.massnahme, p.einschr, p.bemerkung].filter(Boolean).join(" · ")

        // Eindeutige & reconcile-stabile externeId: (lat,lng) allein kollabiert Meldungen am
        // selben Ort (je Fahrtrichtung/Teilstück/Phase). Diskriminator nimmt unterscheidende
        // Quellfelder mit auf — Straße, von/bis-Datum, Einschränkung/Richtung, erste Maßnahme-
        // Zeile. Bevorzugt native gml_id/id als Quell-Schlüssel; KEIN Array-Index/Zufall.
        const quellId = p.gml_id ?? f.id
        const ersteZeile = String(p.massnahme ?? "").split(/[\n·]/)[0].trim()
        const externeId = `${quellId ?? "x"}#${stabilHash(
          lat, lng, p.strasse, p.beginn, p.ende, p.einschr, ersteZeile,
        )}`

        obstacles.push(makeNormalized({
          externeId,
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
          geom: streckenGeom(f.geometry),
        }))
      }
    }

    log(`verfügbar: ${verfuegbar} · normalisiert: ${obstacles.length}`)
    return { obstacles }
  },
}
