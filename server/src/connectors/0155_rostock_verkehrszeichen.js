// Connector Quelle 0155: Rostock — Verkehrszeichen-Kataster (GST-Beschränkungszeichen).
// Research-Fund 2026-06-22 (T-556). OpenData.HRO (CC0), statisches GeoJSON, WGS84-Punkte.
// Anders als 0223 (Rostock GST-gesperrte Ingenieurbauwerke) ist dies das allgemeine VZ-Kataster
// (18.219 Schilder) — wir filtern auf die GST-relevanten Beschränkungszeichen 262/263/264/265/266.
// Der Wert steckt im stvo_nummer-Suffix ("262-7,5t", "265-3,5", "266-8m"). Die Suffix-Einheit ist
// inkonsistent (z.B. "265-3,5t" bei Höhe) → wir IGNORIEREN die Suffix-Einheit und leiten key/Einheit
// aus der Basis-VZ-Nummer ab (Muster 0221 Leipzig / 0134 Hamburg). Bare Schilder ohne Wert raus.

import { makeNormalized, getJson } from "./_helpers.js"

const QUELLE = "0155"
const QUELLE_NAME = "Rostock — Verkehrszeichen-Kataster (GST-Beschränkungen)"
const URL = "https://geo.sv.rostock.de/download/opendata/verkehrszeichen/verkehrszeichen.json"

// VZ-Basis → Kategorie + attrs-Key. T-611 (Audit R3, Max-Freigabe): VZ263 (zul. ACHSLAST) → maxAchslastT
// (INFO), NICHT maxGewichtT. Achslast als Gesamtgewicht zu werten erzeugte Falsch-Kritische (ein 5-t-
// Achslast-Schild blockte jeden schweren Transport); Achslast wird bewusst nicht bewertet (Max 2026-06-16).
const GST_VZ = {
  "262": { kat: "gewicht", key: "maxGewichtT" },
  "263": { kat: "gewicht", key: "maxAchslastT" },
  "264": { kat: "engstelle", key: "maxBreiteM" },
  "265": { kat: "bruecke", key: "maxHoeheM" },
  "266": { kat: "engstelle", key: "maxLaengeM" },
}

// T-611: Sprechender Titel je VZ-Basis aus Kategorie + Wert + Straße statt generischem "VZ {base}".
// Achslast (263) bewusst eigenes Label (nicht "Gewicht"), passend zur maxAchslastT-Trennung oben.
const VZ_TITEL = {
  "262": { label: "Gewichtsbeschränkung", einheit: "t" },
  "263": { label: "Achslast", einheit: "t" },
  "264": { label: "Breitenbeschränkung", einheit: "m" },
  "265": { label: "Durchfahrtshöhe", einheit: "m" },
  "266": { label: "Längenbeschränkung", einheit: "m" },
}

/** stvo_nummer → { base, wert }. "262-7,5t"→{262,7.5}; "265-3,5"→{265,3.5}; "262"→{262,null}. */
function vzWert(stvo) {
  const s = String(stvo ?? "").trim()
  const base = s.split("-")[0].trim()
  const rest = s.includes("-") ? s.slice(s.indexOf("-") + 1) : ""
  const m = rest.replace(",", ".").match(/\d+(?:\.\d+)?/)
  return { base, wert: m ? Number(m[0]) : null }
}

export const rostockVerkehrszeichenConnector = {
  quelleId: QUELLE,
  name: QUELLE_NAME,
  schedule: "0 6 * * *", // 1× täglich; Kataster ändert sich selten
  vollbestand: true,

  async fetch({ timeoutMs = 45000, log = () => {} } = {}) {
    const data = await getJson(URL, { timeoutMs })
    const feats = data?.features ?? []
    const obstacles = []
    for (const f of feats) {
      const p = f.properties ?? {}
      const { base, wert } = vzWert(p.stvo_nummer)
      const map = GST_VZ[base]
      if (!map || wert == null || !(wert > 0)) continue // nur GST-VZ mit echtem Wert
      const c = f.geometry?.coordinates
      const lng = Array.isArray(c) ? Number(c[0]) : null
      const lat = Array.isArray(c) ? Number(c[1]) : null
      const strasse = String(p.strasse_name ?? "").trim()
      // T-611: Titel aus Kategorie+Wert+Straße (z.B. "Durchfahrtshöhe 3,5 m · Lange Straße");
      // Wert deutsch mit Dezimalkomma. Fallback auf alten "VZ {base}"-Titel falls Basis unbekannt.
      const titel = VZ_TITEL[base]
      const wertStr = String(wert).replace(".", ",")
      const name = titel
        ? [`${titel.label} ${wertStr} ${titel.einheit}`, strasse].filter(Boolean).join(" · ")
        : [`VZ ${base}`, strasse].filter(Boolean).join(" · ") || `Verkehrszeichen ${base} Rostock`
      obstacles.push(makeNormalized({
        externeId: p.uuid ? `ro-vz-${p.uuid}` : `ro-vz-${base}-${p.nummer ?? ""}-${lat},${lng}`,
        kategorie: map.kat,
        name,
        beschreibung: `Verkehrszeichen-Beschränkung (Rostock VZ-Kataster)${strasse ? ` · ${strasse}` : ""}`,
        lat, lng,
        attrs: { [map.key]: wert }, // explizit gesetzt → makeNormalized-Gap-Fill greift nicht drüber
        quelleName: QUELLE_NAME, quelleUrl: "https://www.opendata-hro.de/dataset/verkehrszeichen",
      }))
    }
    log(`${QUELLE}: ${obstacles.length} GST-Beschränkungszeichen (von ${feats.length} VZ gesamt)`)
    return { obstacles }
  },
}
