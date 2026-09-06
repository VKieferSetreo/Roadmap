// Connector Quelle 0132: Brandenburg — Baustellen (Landesbetrieb Straßenwesen, GDI-BB WFS).
// WFS 2.0, GeoJSON (outputFormat MUSS application/geo+json — json → HTTP 400), EPSG:25833 nativ
// → utmZuWgs84(.,.,33), LineString. Landesweit B/L/K bis Gemeindeebene, geplant + laufend.
// Lizenz: dl-de/by-2.0 (Namensnennung „Landesbetrieb Straßenwesen Brandenburg"). Frei direkt,
// KEIN Mobilithek-Abo nötig (liegt zusätzlich als offener WFS vor).

import { makeNormalized, fetchAllFeatures, reprojGeom, dateOnly, tonnageAusText, meterAusText } from "./_helpers.js"

const QUELLE = "0132"
const QUELLE_NAME = "Brandenburg — Baustellen (Landesbetrieb Straßenwesen)"
const QUELLE_URL = "https://isk.geobasis-bb.de/"
const BASE = "https://isk.geobasis-bb.de/ows/baustelleninfo_wfs?service=WFS&version=2.0.0&request=GetFeature" +
  "&typeNames=app:baustelleninfo&outputFormat=application/geo%2Bjson&srsName=EPSG:25833"

function refAus(s) { const m = String(s ?? "").match(/\b([ABLK])\s?(\d{1,4})\b/); return m ? `${m[1]}${m[2]}` : null }

export const brandenburgBaustellenConnector = {
  quelleId: QUELLE,
  name: QUELLE_NAME,
  schedule: "0 8,12,18 * * *",
  vollbestand: true,

  async fetch({ timeoutMs = 45000, log = () => {} } = {}) {
    const feats = await fetchAllFeatures(BASE, { mode: "wfs2", pageSize: 1000, maxPages: 20, timeoutMs, log })
    const obstacles = feats.map((f) => {
      const p = f.properties ?? {}
      const geom = reprojGeom(f.geometry, 33)
      let c = geom?.coordinates
      while (Array.isArray(c) && Array.isArray(c[0])) c = c[0]
      const [lng, lat] = Array.isArray(c) ? c : [null, null]
      const istLinie = geom?.type === "LineString" || geom?.type === "MultiLineString"
      const strasse = p["Straßenummner"] ?? p["Straßennummer"] ?? null
      const text = [p.Verkehrsinformation, p.Art, p.Ortsangabe].filter(Boolean).join(" ")
      const tonnage = tonnageAusText(text)
      // T-444: strukturierte WFS-Felder verwerten statt nur Freitext zu raten (case-tolerant).
      const statusFs = String(p.Status_Fahrstreifen ?? p.status_fahrstreifen ?? "")
      const gesperrt = Number(p.Anzahl_Fahrstreifen_gesperrt ?? p.anzahl_fahrstreifen_gesperrt)
      const laengeM = Number(p.Laenge_m ?? p.laenge_m)
      const sperrlaengeM = Number.isFinite(laengeM) && laengeM > 0 ? laengeM : undefined
      // T-707: Die Restbreite kam hier als Sperrlänge herein. meterAusText prüfte nur, OB irgendwo
      // "breite"/"einengung" steht, und nahm dann die erste Meterzahl aus dem GANZEN Freitext —
      // das war regelmäßig die Länge der Maßnahme. Gemessen: von 13 aktiven Hindernissen dieser
      // Quelle mit restbreiteM war der Wert bei 9 exakt gleich sperrlaengeM (140, 200, 257, 312,
      // 1236, 1493 m). "Restbreite 1.493,0 m" stand so im Fund; die beiden 3-m-Werte bei einer
      // Sperrlänge von 320 m erzeugten obendrein falsch-kritische Funde für jeden Großraumtransport.
      // Zwei Sicherungen: die Zahl muss im selben Satzfragment wie das Schlüsselwort stehen
      // (imFragment, dieselbe Fehlerklasse wie bisZumTrenner in external/osrm.js, T-699), und ein
      // Wert, der exakt der Sperrlänge entspricht, ist keine Breite — er wird verworfen.
      const restbreiteRoh = meterAusText(text, /breite|einengung/i, { imFragment: true })
      // Die Gegenprobe stand hier zuerst als exakte Gleichheit `restbreiteRoh === sperrlaengeM`.
      // Das ist zu schwach: sie versagt bei jeder Rundung und greift gar nicht, wenn die Quelle
      // keine Sperrlänge liefert. Deshalb zusätzlich eine Plausibilitätsgrenze, die ohne jedes
      // zweite Feld auskommt — eine Fahrbahn-Restbreite über 25 m gibt es nicht, die gemessenen
      // Fehlwerte lagen bei 140, 200, 257, 312, 1236 und 1493 m. Die Grenze ist bewusst weit über
      // dem, was als Restbreite je vorkommt (Median im Gesamtbestand 4,5 m, Ausreißer bis 20 m aus
      // der Autobahn-API, siehe T-711): sie soll Längen fangen, nicht großzügige Breiten.
      const UNPLAUSIBEL_M = 25
      const laengeStattBreite =
        restbreiteRoh != null &&
        (restbreiteRoh > UNPLAUSIBEL_M ||
          (sperrlaengeM != null && Math.abs(restbreiteRoh - sperrlaengeM) < 0.5))
      const restbreiteM = laengeStattBreite ? undefined : restbreiteRoh
      // Verworfen heißt: gar keine Restbreite — und zwar endgültig. Hier stand, makeNormalized dürfe
      // die Lücke danach „über den strengeren Weg" füllen. Das war falsch: der Gap-Fill liest
      // DENSELBEN Freitext (Name + Beschreibung) und holte den verworfenen Wert postwendend zurück,
      // dazu kiAufbereitet=true. Nur wenn wir tatsächlich etwas abgelehnt haben — sonst darf der
      // Gap-Fill wie bei jeder anderen Quelle arbeiten.
      const verworfeneAttrs = laengeStattBreite ? ["restbreiteM"] : null
      // Vollsperrung: Freitext ODER strukturierter Status (konservativ — nur explizites 'vollsperr').
      const vollsperrung = /vollsperr/i.test(text) || /vollsperr/i.test(statusFs) || undefined
      return makeNormalized({
        externeId: p.ID,
        kategorie: tonnage ? "gewicht" : vollsperrung ? "sperrung" : "baustelle",
        name: p.Art || p.Ortsangabe || "Baustelle",
        beschreibung: p.Verkehrsinformation || p.Ortsangabe || null,
        lat, lng,
        strassenRef: refAus(strasse) ?? (strasse || null),
        attrs: {
          maxGewichtT: tonnage,
          restbreiteM,
          vollsperrung,
          // Anzeige-attrs (T-459 rendert sie in Fund/PDF/CSV); treiben keine Severity.
          spurenGesperrt: Number.isFinite(gesperrt) && gesperrt > 0 ? gesperrt : undefined,
          sperrlaengeM,
        },
        verworfeneAttrs,
        gueltigVon: dateOnly(p.Baustellen_Beginn), gueltigBis: dateOnly(p.Baustellen_Ende), realerStart: dateOnly(p.Baustellen_Beginn),
        geom: istLinie ? geom : null,
        quelleName: QUELLE_NAME, quelleUrl: QUELLE_URL,
      })
    })
    log(`${QUELLE}: ${feats.length} Baustellen`)
    return { obstacles }
  },
}
