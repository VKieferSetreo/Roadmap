// Connector Quelle 0219: Karlsruhe / TRK — Baustellen (mobil.trk.de GeoServer).
// Port aus karlsruhe-trk-baustellen.cron.mjs. Beide Layer "aktuell" + "vorschau" (WFS 1.0.0
// GeoJSON, Point, EPSG:25832), reprojiziert UTM32 → WGS84. Regionaler Aggregator (Karlsruhe,
// Ettlingen, Rastatt, Baden-Baden, Bruchsal, Rheinstetten, Stutensee + Alsace).

import { makeNormalized, getJson, utmZuWgs84, tonnageAusText, meterAusText, dateOnly } from "./_helpers.js"

const PORTAL = "https://transparenz.karlsruhe.de/dataset/baustellen"
const QUELLE_NAME = "Karlsruhe / TRK — Baustellen (TechnologieRegion Karlsruhe)"
const WS = "https://mobil.trk.de/geoserver/TBA/ows?service=WFS&version=1.0.0&request=GetFeature&outputFormat=application/json"
const LAYERS = [
  { typ: "TBA:baustellen_aktuell", phase: "aktuell" },
  { typ: "TBA:baustellen_vorschau", phase: "vorschau" },
]

// T-710: Das TRK-Portal liefert bewusst auch die elsässischen Partner mit ("+ Alsace", siehe Kopf).
// Im Bestand sind das 67 französischsprachige Einträge, 41 davon westlich von 7,5 Grad Ost bis in
// die Vogesen (Ballon d'Alsace, Col de la Schlucht, Col du Bonhomme) — rund 150 km von Karlsruhe.
// Für einen deutschen Schwertransport sind sie nicht nur nutzlos, sondern schädlich: 8 davon tragen
// "B13", das französische Schild-Kürzel für ein Gewichtsverbot, das extractStammdaten als deutsche
// Bundesstraße B13 liest ("Col de Ste Marie : interdiction PL", 3,5 t, 48,243/7,170). Die echte B13
// hat 92 Einträge in Bayern — ein bayerischer Fund mit einer Vogesen-Auflage ist der Demo-Unfall.
// Der DE-Bbox-Filter in makeNormalized greift nicht: das Elsass liegt mit 7,17 Grad innerhalb
// dieser groben Deutschland-Box (ab 5,8 Grad Ost).
//
// Warum die Westgrenze bei genau 8,0 Grad liegt: alle deutschen Zulieferer dieses Feeds liegen
// rechts des Rheins, und der Rhein verläuft auf dieser Breite zwischen 7,8 (Kehl) und 8,3 Grad
// (Karlsruhe-Maxau). Weiter östlich darf die Grenze nicht liegen, weil der Landkreis Rastatt mit
// Rheinmünster (8,06) und Iffezheim (8,14) selbst bis dicht an den Strom reicht — 8,2 Grad würde
// echte deutsche Baustellen wegwerfen. Die übrigen drei Kanten sind bewusst weit gefasst; sie
// fangen nur grobe Ausreißer ab und schneiden das Einzugsgebiet nirgends an (südlichster Punkt
// Landkreis Rastatt ≈ 48,6, nördlichster Landkreis Karlsruhe ≈ 49,3, östlichster ≈ 8,9).
//
// Verworfen wird ganz, nicht nur die Straßen-Ref: die Ref entsteht erst in makeNormalized aus dem
// Freitext, ließe sich hier also gar nicht auf null zwingen — und ein Vogesenpass im Ergebnis
// bleibt auch ohne Ref ein falscher Fund.
const EINZUGSGEBIET = { latMin: 48.4, latMax: 49.5, lngMin: 8.0, lngMax: 9.2 }
const imEinzugsgebiet = (lat, lng) =>
  lat >= EINZUGSGEBIET.latMin && lat <= EINZUGSGEBIET.latMax &&
  lng >= EINZUGSGEBIET.lngMin && lng <= EINZUGSGEBIET.lngMax

function ersterPunktUtm32(geom) {
  if (!geom) return [null, null]
  let c = geom.coordinates
  while (Array.isArray(c) && Array.isArray(c[0])) c = c[0]
  if (!Array.isArray(c) || c.length < 2) return [null, null]
  return utmZuWgs84(c[0], c[1], 32)
}

export const karlsruheTrkBaustellenConnector = {
  quelleId: "0219",
  name: QUELLE_NAME,
  schedule: "0 8,12,18 * * *",
  // Beide Layer mit maxFeatures=10000 voll gezogen → kompletter Bestand.
  vollbestand: true,

  async fetch({ timeoutMs = 60000, log = () => {} } = {}) {
    const obstacles = []
    for (const L of LAYERS) {
      const data = await getJson(`${WS}&typeName=${encodeURIComponent(L.typ)}&maxFeatures=10000`, { timeoutMs })
      const feats = data?.features ?? []
      let elsass = 0
      for (const f of feats) {
        const p = f.properties ?? {}
        const [lng, lat] = ersterPunktUtm32(f.geometry)
        // T-710: Elsass raus. Nur Features MIT Koordinate prüfen — ohne Koordinate scheitert der
        // Eintrag ohnehin am Importer-Gate, und er soll nicht als Elsass gezählt werden.
        if (lat != null && lng != null && !imEinzugsgebiet(lat, lng)) { elsass++; continue }
        const text = [p.art, p.lage, p.zusatzinfo, p.sperrung].filter(Boolean).join(" ")
        const sperrung = String(p.sperrung ?? "")
        // T-611: bare „gesperrt" raus (matchte Geh-/Radweg-/Spur-/Richtungssperren → Falsch-Kritisch).
        // Nur echte Vollsperrungen (kontrolliertes Vokabular, analog _helpers.js).
        const vollsperrung = /vollsperr|voll gesperrt|komplett gesperrt|gesamtsperrung|fermeture totale/i.test(text) || undefined
        const istSperrung = sperrung && /sperrung|gesperrt|fermeture/i.test(sperrung)
        obstacles.push(makeNormalized({
          externeId: `${L.phase}-${p.id ?? f.id}`,
          kategorie: istSperrung ? "sperrung" : "baustelle",
          name: p.lage ?? p.art ?? "Baustelle TRK",
          beschreibung: [p.art, p.lage, p.zusatzinfo].filter(Boolean).join(" — ").replace(/<[^>]+>/g, " ").trim() || null,
          lat, lng,
          strassenRef: null,
          attrs: {
            vollsperrung,
            restbreiteM: meterAusText(text, /breite/i),
            maxHoeheM: meterAusText(text, /(?:höhe|hoehe|durchfahrt)/i),
            maxGewichtT: tonnageAusText(text),
          },
          realerStart: dateOnly(p.vorgangszeitraum_von),
          gueltigVon: dateOnly(p.vorgangszeitraum_von),
          gueltigBis: dateOnly(p.vorgangszeitraum_bis),
          quelleName: QUELLE_NAME,
          quelleUrl: PORTAL,
        }))
      }
      log(`Karlsruhe/${L.phase}: ${feats.length} Features${elsass ? `, ${elsass} ausserhalb des Einzugsgebiets verworfen (Elsass)` : ""}`)
    }
    return { obstacles }
  },
}
