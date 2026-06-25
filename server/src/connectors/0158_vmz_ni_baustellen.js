// Connector Quelle 0158: VMZ Niedersachsen — Baustellen INNERORTS/kommunal.
// vmz-niedersachsen.de (mapsight/Neonaut-Viewer) lädt aus einem OFFENEN GeoJSON-Backend ohne Auth.
// Nutzung NUR INTERN freigegeben (Max 2026-06-25, Lizenz „© VMZ Niedersachsen", keine kommerzielle
// Weitergabe) → die Quelle trägt nur_intern=true (rotes „Intern"-Badge im Quellenregister).
//
// WICHTIG — Abgrenzung zu 0140 (NI NLStBV Baustellen B/L via Mobilithek): dieselbe LMS-NI-Quelle
// (id-Wurzel `lms-ni`, source „Ni_Bau.xml") speist BEIDE. Die A/B/L-Features (~178/339) sind daher
// Dubletten zu 0140 → werden HART AUSGESCHLOSSEN. Wir emittieren NUR die innerörtliche/kommunale
// Schicht (Kreisstraßen K + namentliche Stadtstraßen, ~161/339), die 0140 strukturell NICHT abdeckt
// (NLStBV = nur A/B/L). Das ist das NI-Pendant zur NRW-innerorts-Lücke (0156). Kein weiterer
// Cross-Source-Dedup nötig, da innerorts nicht mit unseren A/B/L-Feeds überlappt.
//
// LIVE-VERKEHR RAUS (Max-Regel „keine Live-Verkehrsdaten"): mapsightIconId `stau`/`meldung` sind
// aktuelle Verkehrslage, keine Planungsdaten → nicht emittiert. Nur baustelle/fahrbahnverengung/
// vollsperrung.

import { makeNormalized, getJson } from "./_helpers.js"

const QUELLE = "0158"
const QUELLE_NAME = "VMZ Niedersachsen — Baustellen innerorts/kommunal"
const QUELLE_URL = "https://www.vmz-niedersachsen.de/niedersachsen/baustellen-aktuell/"
const FEED = "https://www.vmz-niedersachsen.de/geojson/niedersachsen-baustellen.geojson"

// A/B/L = NLStBV-Zuständigkeit → in 0140, hier raus (Dedup). Match auf roadNumber ODER Name-Anfang.
const ABL = /^\s*[ABL]\s?\d/

// mapsightIconId → Kategorie. stau/meldung (Live-Verkehr) bewusst NICHT gelistet → übersprungen.
const ICON_MAP = {
  baustelle: { kat: "baustelle", label: "Baustelle" },
  fahrbahnverengung: { kat: "baustelle", label: "Fahrbahnverengung" },
  vollsperrung: { kat: "sperrung", label: "Vollsperrung", attrs: { vollsperrung: true } },
}

function istInnerorts(p) {
  if (ABL.test(String(p.roadNumber ?? ""))) return false
  if (ABL.test(String(p.name ?? ""))) return false
  return true
}

// Straßen-Bezug: roadNumber (K…) wenn vorhanden, sonst der Straßenname aus dem VMZ-Namensschema
// „<Ort>, <Straße> zwischen/bis/in/Richtung …". WICHTIG: explizit setzen (auch nicht-leer), damit
// makeNormalized NICHT die im Namen als Landmarke genannte B-Straße („… zwischen B68 …") als
// strassenRef fehl-extrahiert (sonst trägt eine innerorts-Baustelle fälschlich „B68").
function strasseRef(p) {
  const rn = typeof p.roadNumber === "string" ? p.roadNumber.trim() : ""
  if (rn) return rn.slice(0, 80)
  const m = String(p.name ?? "").match(/,\s*([^,]+?)\s+(?:zwischen|bis|in|Richtung|ab|von)\s/i)
  if (m && m[1].trim()) return m[1].trim().slice(0, 80)
  return null
}

// [lat, lng] aus centroid {x:lng, y:lat}, sonst erstem Point/LineString der GeometryCollection.
function latLng(f) {
  const c = f.properties?.centroid
  if (c && Number.isFinite(c.y) && Number.isFinite(c.x)) return [c.y, c.x]
  for (const g of f.geometry?.geometries ?? []) {
    if (g.type === "Point" && Array.isArray(g.coordinates)) return [Number(g.coordinates[1]), Number(g.coordinates[0])]
  }
  for (const g of f.geometry?.geometries ?? []) {
    const p0 = g.type === "LineString" ? g.coordinates?.[0] : null
    if (Array.isArray(p0)) return [Number(p0[1]), Number(p0[0])]
  }
  return [null, null]
}

/** Pure Parse: VMZ-NI-Features → Obstacles (innerorts-only, Bau-Icons, kein Live-Verkehr). Testbar. */
export function parseVmzNiFeatures(features) {
  const obstacles = []
  const seen = new Set()
  for (const f of Array.isArray(features) ? features : []) {
    const p = f?.properties ?? {}
    const map = ICON_MAP[p.mapsightIconId]
    if (!map) continue // stau/meldung/unbekannt (Live-Verkehr) raus
    if (!istInnerorts(p)) continue // A/B/L → in 0140 (Dedup)
    const [lat, lng] = latLng(f)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue
    // Stabile externeId aus der lms-ni-id (überlebt Re-Importe); sonst Lage.
    const eid = p.id ? `ni-${p.id}` : `ni-${map.kat}-${lat.toFixed(5)},${lng.toFixed(5)}`
    if (seen.has(eid)) continue
    seen.add(eid)
    obstacles.push(makeNormalized({
      externeId: eid,
      kategorie: map.kat,
      // name trägt die Lage (z.B. „Achim, Bahnhofstraße zwischen …"); BEWUSST keine Beschreibung mit
      // „X m"/„X t"-Token durchreichen (extractStammdaten-Scheinwert-Risiko, Lektion 0156).
      name: typeof p.name === "string" && p.name.trim() ? p.name.trim().slice(0, 300) : `${map.label} (NI innerorts)`,
      beschreibung: `${map.label} innerorts (VMZ Niedersachsen).`,
      lat, lng,
      strassenRef: strasseRef(p),
      attrs: { ...(map.attrs || {}) },
      quelleName: QUELLE_NAME,
      quelleUrl: QUELLE_URL,
    }))
  }
  return obstacles
}

export const vmzNiBaustellenConnector = {
  quelleId: QUELLE,
  name: QUELLE_NAME,
  schedule: "0 7,13 * * *", // 2× täglich; der VMZ-Bestand ändert sich laufend
  vollbestand: true, // Voll-Feed → Reconcile (verschwundene Baustellen werden deaktiviert)

  async fetch({ timeoutMs = 60000, log = () => {} } = {}) {
    const data = await getJson(FEED, { timeoutMs })
    if (!data) {
      // Abruf fehlgeschlagen → Teilbestand signalisieren (kein zerstörerischer Reconcile, T-311/314).
      log(`${QUELLE}: Feed nicht erreichbar`)
      return { obstacles: [], complete: false }
    }
    const feats = data.features ?? []
    const obstacles = parseVmzNiFeatures(feats)
    log(`${QUELLE}: ${obstacles.length} innerorts-Funde aus ${feats.length} Features (A/B/L→0140, Live-Verkehr raus)`)
    return { obstacles }
  },
}
