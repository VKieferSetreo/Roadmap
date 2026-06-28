// Connector Quelle 0221: Leipzig — Verkehrszeichen-Kataster (GST-Beschränkungen).
// Port aus leipzig-verkehrszeichen.cron.mjs. WFS 2.0 GeoJSON (Punkt, EPSG:25833, ZONE 33!),
// serverseitiger cql_filter auf die GST-relevanten Beschränkungszeichen 262/263/264/265/266.
// Schilder = DAUERHAFTE Restriktionen. Reprojiziert UTM33 → WGS84.

import { makeNormalized, fetchAllFeatures, utmZuWgs84, tonnageAusText, meterAusText, stabilHash } from "./_helpers.js"

const PORTAL = "https://opendata.leipzig.de/dataset/verkehrszeichen-stadt-leipzig"
const QUELLE_NAME = "Leipzig — Verkehrszeichen-Kataster (GST-Beschränkungen)"

// VZ-Nr → Kategorie + attrs-Key + Einheit. 264/265/266 = Meter, 262/263 = Tonnen.
const GST_VZ = {
  "262": { kat: "gewicht", key: "maxGewichtT", einheit: "t" },
  // T-611 (Audit R3, Max-Freigabe, ersetzt T-458): VZ263 (zul. ACHSLAST) → maxAchslastT (INFO).
  // T-458 mappte sie auf maxGewichtT, damit überhaupt etwas bewertet wird — das wertete aber die
  // ACHSLAST als GESAMTGEWICHT → Falsch-Kritisch (5-t-Achslast-Schild blockt jeden schweren Transport).
  // Achslast wird bewusst nicht bewertet (Max 2026-06-16) → maxAchslastT zeigt sie als Hinweis.
  "263": { kat: "gewicht", key: "maxAchslastT", einheit: "t" },
  "264": { kat: "engstelle", key: "maxBreiteM", einheit: "m" },
  "265": { kat: "bruecke", key: "maxHoeheM", einheit: "m" }, // Höhe meist Brücke/Unterführung
  // VZ266 (zul. Länge): keine Längen-Regel in der Engine → bleibt maxLaengeM (seit T-459 als Info
  // im Fund/PDF/CSV sichtbar, treibt aber keine Severity).
  "266": { kat: "engstelle", key: "maxLaengeM", einheit: "m" },
}
const VZ_LISTE = Object.keys(GST_VZ).map((n) => `'${n}'`).join(",")
const BASE =
  "https://geodienste.leipzig.de/l3/OpenData/wfs?VERSION=2.0.0&REQUEST=GetFeature" +
  "&typeName=OpenData:verkehrszeichen&outputFormat=application/json" +
  `&cql_filter=${encodeURIComponent(`vz_nr IN (${VZ_LISTE})`)}`
// Fallback ohne CQL-Filter (Server filtert dann nicht serverseitig) — wird ebenfalls paginiert.
const FALLBACK =
  "https://geodienste.leipzig.de/l3/OpenData/wfs?VERSION=2.0.0&REQUEST=GetFeature" +
  "&typeName=OpenData:verkehrszeichen&outputFormat=application/json"

// Erstes valides (x,y)-Vertex aus beliebiger GeoJSON-Geometrie (Point/Line/Polygon/Multi*) ziehen —
// tolerant gegen tief verschachtelte coords, damit kein Eintrag wegen "exotischer" Geometrie ohne
// Koords verloren geht. Reprojiziert UTM33 → WGS84 [lng, lat].
function erstesVertex(c) {
  if (!Array.isArray(c)) return null
  // Schon ein [x,y]-Paar (zwei endliche Zahlen)?
  if (c.length >= 2 && Number.isFinite(c[0]) && Number.isFinite(c[1])) return [c[0], c[1]]
  // Sonst rekursiv in die verschachtelten Koordinaten absteigen.
  for (const inner of c) {
    const v = erstesVertex(inner)
    if (v) return v
  }
  return null
}
function ersterPunktUtm33(geom) {
  if (!geom) return [null, null]
  // GeometryCollection: erste Geometrie mit Koords nehmen.
  if (geom.type === "GeometryCollection" && Array.isArray(geom.geometries)) {
    for (const g of geom.geometries) {
      const p = ersterPunktUtm33(g)
      if (p[0] != null) return p
    }
    return [null, null]
  }
  const v = erstesVertex(geom.coordinates)
  if (!v) return [null, null]
  return utmZuWgs84(v[0], v[1], 33)
}
// T-611: sprechender Anzeige-Titel je Schild-Art (analog 0134) statt rohem vz_bez. Key = attrs-Key,
// damit die Achslast-Trennung aus T-611 (263 → maxAchslastT) auch im Titel sichtbar bleibt.
const VZ_LABEL = {
  maxGewichtT: { wort: "Gewichtsbeschränkung", einheit: "t" },
  maxAchslastT: { wort: "Achslastbeschränkung", einheit: "t" },
  maxBreiteM: { wort: "Breitenbeschränkung", einheit: "m" },
  maxHoeheM: { wort: "Durchfahrtshöhe", einheit: "m" },
  maxLaengeM: { wort: "Längenbeschränkung", einheit: "m" },
}
// T-611: Titel "Gewichtsbeschränkung 6 t — Lauchstädter Straße"; ohne Wert nur Schild-Art, ohne
// Straße nur die Beschränkung. wert=null (nicht extrahierbar) → Wert wird weggelassen statt geraten.
function baueTitel(vz, wert, strasse) {
  const l = VZ_LABEL[vz.key]
  const kern = l
    ? (wert != null ? `${l.wort} ${String(wert).replace(".", ",")} ${l.einheit}` : l.wort)
    : `VZ ${vz.key}`
  return strasse ? `${kern} — ${strasse}` : kern
}

// T-611: Sentinel-Platzhalter der Quelle (z.B. 1900-01-01/1900-01-02, Jahr < 2000) sind KEIN echtes
// Datum → null, statt sie als gueltigVon/Bis durchzureichen (verfälscht Gültigkeits-/Reconcile-Logik).
function dateOnlySafe(v) {
  if (!v) return null
  const m = String(v).match(/\d{4}-\d{2}-\d{2}/)
  if (!m) return null
  if (Number(m[0].slice(0, 4)) < 2000) return null
  return m[0]
}

export const leipzigVerkehrszeichenConnector = {
  quelleId: "0221",
  name: QUELLE_NAME,
  schedule: "0 8,12,18 * * *",
  // Serverseitiger cql_filter zieht alle GST-relevanten Schilder, paginiert per fetchAllFeatures bis
  // numberMatched → kompletter relevanter Bestand (kein Cap), Reconcile erlaubt.
  vollbestand: true,

  async fetch({ timeoutMs = 90000, log = () => {} } = {}) {
    // Voller paginierter Abruf via fetchAllFeatures (count + startIndex bis numberMatched / letzte
    // Teilseite) — KEIN harter 5000er-Cap mehr, der den Bestand still abschneiden würde.
    let feats = await fetchAllFeatures(BASE, { mode: "wfs2", pageSize: 1000, maxPages: 500, timeoutMs, log })
    if (!feats || feats.length === 0) {
      // Fallback ohne CQL: kompletten Bestand paginiert ziehen und clientseitig filtern.
      log("Leipzig VZ: cql_filter fehlgeschlagen/leer → Fallback ohne Filter (clientseitig)")
      const fb = await fetchAllFeatures(FALLBACK, { mode: "wfs2", pageSize: 1000, maxPages: 500, timeoutMs, log })
      feats = (fb ?? []).filter((f) => GST_VZ[String(f.properties?.vz_nr ?? "")])
    }

    const obstacles = []
    for (const f of feats) {
      const p = f.properties ?? {}
      const vz = GST_VZ[String(p.vz_nr ?? "")]
      if (!vz) continue
      const [lng, lat] = ersterPunktUtm33(f.geometry)
      const text = [p.vz_zus_tx, p.so_av_tx, p.vz_bez].filter(Boolean).join(" ")
      // T-611: dedizierter Gewichts-/Maß-Schild-Feed — die Zahl am Schild IST das Limit. Daher
      // tonnageAusText mit requireKontext:false (rohe erste t-Zahl), denn Standort-Specs wie
      // "325/60,3" sind nicht von "t" gefolgt und stören die Extraktion nicht.
      const wert = vz.einheit === "t"
        ? tonnageAusText(text, { requireKontext: false })
        : meterAusText(text, null)
      const strasse = String(p.so_seg_sn ?? p.vz_seg_sn ?? "").trim()
      obstacles.push(makeNormalized({
        // so_id = Standort, NICHT Schild — ein Standort kann mehrere GST-Schilder tragen (z.B. Brücke
        // mit 265 Höhe + 262 Gewicht). so_id allein würde sie beim Upsert auf (quelle, externe_id)
        // gegenseitig überschreiben (stiller Verlust). Daher vz_nr + stabiler Diskriminator-Hash aus
        // Geometrie, vz_nr, Gültigkeit und erster Beschreibungszeile → eindeutig pro Einzelschild und
        // reconcile-stabil (gleiches Schild/Geometrie → gleicher Hash, kein Index/Zufall).
        externeId: `${p.so_id ?? p.objectid ?? f.id ?? "vz"}-${p.vz_nr}#${stabilHash(
          lat, lng, p.vz_nr, p.so_beg ?? p.vz_aufst, p.so_end, (text.split("\n")[0] || "").slice(0, 60),
        )}`,
        kategorie: vz.kat,
        // T-611: Titel aus Schild-Art + Wert + Straße (analog 0134) statt rohem vz_bez.
        name: baueTitel(vz, wert, strasse),
        beschreibung: text.trim() || null,
        lat, lng,
        strassenRef: null,
        attrs: {
          [vz.key]: wert,
        },
        realerStart: dateOnlySafe(p.so_beg ?? p.vz_aufst),
        gueltigVon: dateOnlySafe(p.so_beg ?? p.vz_aufst),
        gueltigBis: dateOnlySafe(p.so_end),
        quelleName: QUELLE_NAME,
        quelleUrl: PORTAL,
      }))
    }
    log(`Leipzig VZ: ${feats.length} GST-relevant → ${obstacles.length} obstacles`)
    return { obstacles }
  },
}
