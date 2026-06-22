// Connector Quelle 0154: LSBB Sachsen-Anhalt — Fahrauflagen GST-Kran-Routennetz.
// Research-Fund 2026-06-22 (T-551). Offener ArcGIS-MapServer (DL-DE/BY-2.0). Der Dienst führt je
// KRANGEWICHTSKLASSE (24/36/48/60/72/84/96/108 t) einen Detail-Layer mit dem Feld AUFLAGE je
// Bauwerk — die Restriktion ist also GEWICHTSABHÄNGIG. Wir gruppieren je Brücke (BAUWERKSID) über
// alle Klassen und leiten die effektive Gewichtsgrenze ab:
//   - "Fahrverbot" ab Klasse W  → maxGewichtT = höchste Klasse DARUNTER, die NICHT Fahrverbot ist.
//   - schon die kleinste Klasse (24 t) = Fahrverbot → grundsaetzlicheGstSperre (kein t-Wert).
//   - nirgends Fahrverbot (nur "Keine Auflage" oder Bedingungen wie Polizeibegleitung) → KEINE harte
//     Restriktion → NICHT emittieren (reine Infrastruktur; die Engine modelliert keine "Auflage").
// Bedingungs-Texte (Polizeibegleitung/Einzelfahrt/Überholverbot) wandern in die Beschreibung der
// emittierten (= fahrverbots-)Brücken als Kontext. Polygon-Geometrie → erster Vertex; outSR=4326.

import { makeNormalized, getJson, stabilHash } from "./_helpers.js"

const QUELLE = "0154"
const QUELLE_NAME = "LSBB Sachsen-Anhalt — Fahrauflagen GST-Kran-Routennetz"
const BASE = "https://www.geodatenportal.sachsen-anhalt.de/arcgis/rest/services/Geofachdaten/LSBB_Fahrauflagen_2018/MapServer"
const DETAIL_LAYER = [5, 8, 11, 14, 17, 20, 23, 26, 29] // "Objekte mit Auflagen (Detailansicht)" je Krangewichtsklasse

const clean = (s) => String(s ?? "").replace(/\s+/g, " ").trim()
const FAHRVERBOT = /fahrverbot/i
const KEINE_AUFLAGE = /keine auflage/i
const tonnageAusProjekt = (p) => { const m = String(p ?? "").match(/(\d+)\s*t/i); return m ? Number(m[1]) : null }

function ersteKoordinate(geom) {
  const c = geom?.coordinates
  if (!Array.isArray(c)) return [null, null]
  let cur = c
  while (Array.isArray(cur) && Array.isArray(cur[0])) cur = cur[0]
  const lng = Number(cur?.[0]), lat = Number(cur?.[1])
  return Number.isFinite(lng) && Number.isFinite(lat) ? [lng, lat] : [null, null]
}

async function ladeLayer(id, timeoutMs) {
  const url = `${BASE}/${id}/query?where=1%3D1&outFields=${encodeURIComponent("BAUWERKSID,BW_NAME,ORT,ZUGEORDNET,IBWNR,PROJEKT,AUFLAGE")}` +
    `&outSR=4326&returnGeometry=true&f=geojson&resultRecordCount=100000`
  const data = await getJson(url, { timeoutMs })
  return data?.features ?? []
}

export const lsbbStFahrauflagenConnector = {
  quelleId: QUELLE,
  name: QUELLE_NAME,
  schedule: "0 5 * * *", // 1× täglich; statisches 2018er-Netz, ändert sich selten
  vollbestand: true,

  async fetch({ timeoutMs = 45000, log = () => {} } = {}) {
    // Alle Klassen-Layer laden, je Bauwerk (BAUWERKSID) die Auflage je Tonnage sammeln.
    const bruecken = new Map() // bauwerksId → { name, ort, ref, ibwnr, lat, lng, klassen: Map(t→auflage), bedingungen:Set }
    for (const layerId of DETAIL_LAYER) {
      const feats = await ladeLayer(layerId, timeoutMs)
      for (const f of feats) {
        const p = f.properties ?? {}
        const id = p.BAUWERKSID
        if (id == null) continue
        const t = tonnageAusProjekt(p.PROJEKT)
        if (t == null) continue
        const auflage = clean(p.AUFLAGE)
        let b = bruecken.get(id)
        if (!b) {
          const [lng, lat] = ersteKoordinate(f.geometry)
          b = { name: clean(p.BW_NAME), ort: clean(p.ORT), ref: clean(p.ZUGEORDNET), ibwnr: clean(p.IBWNR), lat, lng, klassen: new Map(), bedingungen: new Set() }
          bruecken.set(id, b)
        }
        b.klassen.set(t, auflage)
        if (auflage && !KEINE_AUFLAGE.test(auflage) && !FAHRVERBOT.test(auflage)) b.bedingungen.add(auflage)
      }
    }
    log(`${QUELLE}: ${bruecken.size} Bauwerke über ${DETAIL_LAYER.length} Gewichtsklassen`)

    const obstacles = []
    for (const [id, b] of bruecken) {
      const tonnagen = [...b.klassen.keys()].sort((a, x) => a - x)
      const ersteSperre = tonnagen.find((t) => FAHRVERBOT.test(b.klassen.get(t) || ""))
      if (ersteSperre == null) continue // kein Fahrverbot → keine harte Restriktion → nicht emittieren

      const okDarunter = tonnagen.filter((t) => t < ersteSperre && !FAHRVERBOT.test(b.klassen.get(t) || ""))
      const maxGewichtT = okDarunter.length ? Math.max(...okDarunter) : null
      const vollSperre = maxGewichtT == null // schon kleinste Klasse gesperrt

      const bed = [...b.bedingungen].slice(0, 3).join("; ")
      // Beschreibung bewusst OHNE "X t"-Token (sonst extractStammdaten-Scheinwert) — die Grenze
      // steht strukturiert in maxGewichtT, die Klassen-Info verbal als "Kran-Gewichtsklasse".
      const grenzeTxt = vollSperre
        ? "für Großraum-/Schwertransporte gesperrt (alle Krangewichtsklassen)"
        : `Fahrverbot ab Krangewichtsklasse oberhalb ${maxGewichtT} t` // maxGewichtT explizit gesetzt → Gap-Fill greift nicht drüber
      const beschreibung = [
        `GST-Fahrauflage (LSBB Sachsen-Anhalt): ${grenzeTxt}`,
        bed ? `Auflagen: ${bed}` : null,
        [b.ort, "ST"].filter(Boolean).join(", "),
      ].filter(Boolean).join(". ") || null

      const [lng, lat] = [b.lng, b.lat]
      obstacles.push(makeNormalized({
        externeId: `lsbb-st-${id}#${stabilHash(lat, lng, b.ibwnr)}`,
        kategorie: "bruecke",
        name: b.name || `Bauwerk ${b.ibwnr || id}`,
        beschreibung,
        lat, lng,
        strassenRef: b.ref || null,
        attrs: vollSperre ? { grundsaetzlicheGstSperre: true } : { maxGewichtT },
        quelleName: QUELLE_NAME, quelleUrl: "https://www.geodatenportal.sachsen-anhalt.de",
      }))
    }
    log(`${QUELLE}: ${obstacles.length} Brücken mit Fahrverbot/Gewichtsgrenze (Bedingungs-only verworfen)`)
    return { obstacles }
  },
}
