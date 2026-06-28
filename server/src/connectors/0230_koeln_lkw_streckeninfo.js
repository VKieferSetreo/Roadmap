// Connector Quelle 0230: Köln — LKW-Streckeninfo (Geoportal Stadt Köln, ArcGIS MapServer).
// Research-Fund T-563. Offen, f=geojson. Amtliche Brücken-Tragfähigkeiten + Durchfahrtshöhen +
// sonstige LKW-Beschränkungen mit STRASSE/Lage-Kontext. Distinkt von 0212 (Verkehrsbeeinträchtigungen).
//
//   Layer 1 "Beschränkungen Tragfähigkeit" → Brücken-Tonnage (beschraenkung "30 Tonnen")  → maxGewichtT
//   Layer 2 "Beschränkungen Höhe"          → lichte Höhe   (beschraenkung "3,6 Meter")    → maxHoeheM
//   Layer 3 "andere Verkehrsbeschränkungen"→ Freitext (LKW-Nachtfahrverbote etc.)          → sonstige
// Layer 4 (LKW-Verbindungen = Routen) + 5 (Verbotszone-Polygon) bewusst weggelassen.

import { makeNormalized, getJson } from "./_helpers.js"

const QUELLE = "0230"
const QUELLE_NAME = "Köln — LKW-Streckeninfo (Brücken-Tonnage/Durchfahrtshöhe)"
const QUELLE_URL = "https://geoportal.stadt-koeln.de/"
const BASE = "https://geoportal.stadt-koeln.de/arcgis/rest/services/verkehr/lkw_streckeninfo/MapServer"

const LAYERS = [
  { id: 1, kat: "bruecke", key: "maxGewichtT", label: "Brücken-Tragfähigkeit" },
  { id: 2, kat: "bruecke", key: "maxHoeheM", label: "Durchfahrtshöhe" },
  { id: 3, kat: "sonstige", key: null, label: "LKW-Beschränkung" },
]

/** "30 Tonnen" / "3,6 Meter" / "3,5 t" → 30 / 3.6 / 3.5 (dt. Komma). */
function wertNum(s) {
  const m = String(s ?? "").replace(",", ".").match(/(\d+(?:\.\d+)?)/)
  const n = m ? Number(m[1]) : null
  return n && n > 0 && n < 1000 ? n : null
}

// T-611: Lage-Marker, ab denen `strasse` Standort-Freitext statt Straßenname trägt.
// Greift nur, wenn dem Marker noch Inhalt folgt (\s+\S) — sonst würde ein legitimer
// Straßenname, der auf "…Höhe"/"…nach" endet (z. B. "Auf der Höhe"), fälschlich gekürzt.
const LAGE_RE = /\s+(?:nach|höhe|hoehe|richtung|zwischen|einmündung|einmuendung|kreuzung)\s+\S/i

/**
 * T-611: strassenRef auf den führenden Straßennamen-Token kürzen.
 * Die Köln-Quelle füllt `strasse` neben dem Namen mit Lage-Freitext (" nach …",
 * " Höhe …", Klammer-Zusätzen) und gelegentlich der ss-Schreibvariante von "Straße".
 * Für eine saubere Match-Ref nur den Namen vor dem ersten Lage-Zusatz behalten.
 * Konservativ: bleibt nichts Brauchbares übrig, gilt der bisherige Komma-Token —
 * kein echter Fund geht verloren, das Hindernis wird unabhängig davon emittiert.
 */
function strassenRefKurz(strasse) {
  const basis = String(strasse ?? "").split(",")[0].trim()
  if (!basis) return null
  let ref = basis.replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s{2,}/g, " ").trim() // Klammer-Zusätze raus
  const m = ref.match(LAGE_RE)
  if (m) ref = ref.slice(0, m.index).trim() // ab erstem Lage-Marker abschneiden
  // T-611: bekannte Quellen-Schreibvariante normalisieren ("…strasse" → "…straße"),
  // damit dieselbe Brücke nicht über zwei Ref-Schreibweisen in zwei Funde zerfällt.
  ref = ref.replace(/strasse\b/gi, (s) => (s[0] === "S" ? "Straße" : "straße"))
  return ref || basis // im Zweifel: bisheriger Wert
}

const layerUrl = (id) =>
  `${BASE}/${id}/query?where=${encodeURIComponent("1=1")}&outFields=*&f=geojson&outSR=4326&resultRecordCount=2000`

export const koelnLkwStreckeninfoConnector = {
  quelleId: QUELLE,
  name: QUELLE_NAME,
  schedule: "0 6 * * *", // 1× täglich; statisches Kataster
  vollbestand: true,

  async fetch({ timeoutMs = 45000, log = () => {} } = {}) {
    const obstacles = []
    let layerFehler = 0
    for (const L of LAYERS) {
      let data
      try {
        data = await getJson(layerUrl(L.id), { timeoutMs })
      } catch (e) {
        layerFehler++
        log(`${QUELLE}: Layer ${L.id} fehlgeschlagen: ${e?.message ?? e}`)
        continue
      }
      for (const f of data?.features ?? []) {
        const p = f.properties ?? {}
        const c = f.geometry?.coordinates
        const lng = Array.isArray(c) ? Number(c[0]) : null
        const lat = Array.isArray(c) ? Number(c[1]) : null
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue
        const strasse = String(p.strasse ?? "").trim()
        const titel = String(p.titel ?? "").trim()
        // T-611: richtungsgebundene Beschränkung (z. B. einseitig befahrbare Brücke). Nur ausgeben,
        // wenn die Quelle das Feld real liefert — KEINE harte Richtungsfilterung (würde echte Funde
        // verstecken, kein Max-Sign-off). Wird in attrs.richtung + beschreibung als Kontext benannt.
        const richtung = String(p.richtung ?? "").trim()
        const attrs = {}
        if (L.key) {
          const w = wertNum(p.beschraenkung)
          if (w) attrs[L.key] = w // explizit → Gap-Fill greift nicht drüber
        }
        if (richtung) attrs.richtung = richtung // T-611: Fahrtrichtung als Attribut
        obstacles.push(makeNormalized({
          externeId: `koeln-lkwstr-${L.id}-${p.objectid}`,
          kategorie: L.kat,
          name: [L.label, titel || strasse.split(",")[0]].filter(Boolean).join(" · ") || `${L.label} (Köln)`,
          // Lage-Kontext aus strasse; beschraenkung trägt für Layer 3 den Freitext (Nachtfahrverbote
          // etc.) — die "X Tonnen/Meter"-Token decken sich bei Layer 1/2 mit dem explizit gesetzten attr.
          // T-611: Fahrtrichtung mit aufnehmen, damit der Fund nicht stumm beide Richtungen flaggt.
          beschreibung: [strasse, p.beschraenkung, richtung ? `Richtung: ${richtung}` : null].filter(Boolean).join(" · ") || null,
          lat, lng,
          strassenRef: strassenRefKurz(strasse), // T-611: führender Straßenname statt Lage-Freitext/Tippfehler
          attrs,
          quelleName: QUELLE_NAME, quelleUrl: QUELLE_URL,
        }))
      }
    }
    log(`${QUELLE}: ${obstacles.length} LKW-Beschränkungen (Köln) aus ${LAYERS.length - layerFehler}/${LAYERS.length} Layern`)
    return layerFehler > 0 ? { obstacles, complete: false } : { obstacles }
  },
}
