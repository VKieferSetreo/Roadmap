// VEMAGS-Bescheid-Parser (Neubau 2026-06-25, portiert 1:1 aus dem verifizierten Prototyp
// VEMAGS_ROUTING/extract_strecken.py; das alte Modul wurde ersetzt). Reine Textfunktion — die
// PDF→Text-Extraktion (in-memory, PDF wird NIE gespeichert) liegt im Aufrufer.
//
// Anker (ueber alle 17 Beispiel-Bescheide verifiziert): Punkt 9 "Fahrtweg" → je "Fahrtweg: N" →
// "Fahrtwegteil: X.Y - Leer-/Lastfahrt" → "Start:" / Routenzeile(n, ' - '-getrennt) / "Ziel:".
// Kuerzel werden ausgeschrieben (sonst geocoden Google/OSM einen falschen Punkt), Strassennummern
// und Manoever sind KEINE Wegpunkte (Strasse = Verbindung; OSRM routet dazwischen).

const num = (s) => {
  const m = String(s ?? "").replace(/\s/g, "").replace(",", ".").match(/-?\d+(?:\.\d+)?/)
  return m ? Number(m[0]) : null
}

// VEMAGS-Standard-Kuerzel ausschreiben (in-Dokument bestaetigt). GüG = Grenzuebergang (Start-Depot).
const ABK = {
  AS: "Anschlussstelle",
  AD: "Autobahndreieck",
  AK: "Autobahnkreuz",
  OD: "Ortsdurchfahrt",
  "GüG": "Grenzübergang",
}
const ABK_RE = new RegExp("\\b(" + Object.keys(ABK).join("|") + ")\\b", "g")
const expandAbk = (s) => String(s ?? "").replace(ABK_RE, (m) => ABK[m])

// Reine Strassennummer (ggf. mit vorangestelltem Manoever) → Verbindung, KEIN Wegpunkt.
const MANEUVER_RE = /^(links|rechts|li\.|re\.|weiter|geradeaus|gerade aus|auf|über|ueber|im Gegenverkehr|entgegen der Fahrtrichtung)\s+/i
const ROAD_RE = /^(A|B|L|K|St)\s?\d+[a-z]?$/i
const stripManeuver = (s) => {
  let prev = null
  let t = String(s ?? "").trim()
  while (prev !== t) {
    prev = t
    t = t.replace(MANEUVER_RE, "").trim()
  }
  return t
}
const JUNC_PREFIX = ["Anschlussstelle", "Autobahnkreuz", "Kreuz", "Autobahndreieck", "Dreieck"]
const isRoad = (seg) => ROAD_RE.test(stripManeuver(seg))
const isJunction = (seg) => JUNC_PREFIX.some((p) => stripManeuver(seg).startsWith(p))

/** Ein Routen-Segment → {raw, typ}. typ: 'junction' | 'road' | 'instruction' | 'place'. */
export function classifyToken(raw) {
  const t = expandAbk(String(raw ?? "").trim().replace(/\s+/g, " "))
  if (!t) return null
  if (isRoad(t)) return { raw: t, typ: "road" }
  if (isJunction(t)) return { raw: t, typ: "junction" }
  // Manoever-Beschreibung ohne Ortsbezug (z.B. "Wendemanoever", "Kreisverkehr im Gegenverkehr")
  if (/\b(wenden|wendeman|kreisverkehr|gegenverkehr|sonderabfahrt|zufahrt|über waldweg|wirtschaftsweg|rückwärts|vorwärts)\b/i.test(t)) {
    return { raw: t, typ: "instruction" }
  }
  return { raw: t, typ: "place" }
}

/** Nur routbare Wegpunkte (Knoten + Orte); Strassennummern + Manoever raus. */
export function routableWaypoints(tokens) {
  return tokens.filter((t) => t && (t.typ === "junction" || t.typ === "place"))
}

/** Maße aus dem Bescheid (Länge/Breite/Höhe/Masse + Achslasten) — reine Datenextraktion. */
function parseSpec(text) {
  const grab = (label, unit) => {
    const re = new RegExp(label + "\\s*:?\\s*([0-9]+[.,][0-9]+|[0-9]+)\\s*" + unit, "i")
    const m = text.match(re)
    return m ? num(m[1]) : null
  }
  const spec = {
    laengeM: grab("Länge", "m"),
    breiteM: grab("Breite", "m"),
    hoeheM: grab("Höhe", "m"),
    masseT: grab("Masse", "t") ?? grab("Gesamtmasse", "t") ?? grab("Gesamtgewicht", "t"),
    achslastenT: [],
  }
  for (const m of text.matchAll(/Achslast\s*\[t\][^\n]*/gi)) {
    for (const z of m[0].matchAll(/\d+(?:[.,]\d+)?/g)) spec.achslastenT.push(num(z[0]))
  }
  return spec
}

function parseMeta(text) {
  const g = (re) => { const m = text.match(re); return m ? m[1].trim() : null }
  return {
    bescheidVersion: g(/Bescheidversion\s+(\d{8,}_[A-Z]_\d+)/),
    antragsteller: g(/Firma\s*:\s*(.+?)(?:\s{2,}|\n)/),
    behoerde: g(/Behörde\s*:\s*(.+?)(?:\s{2,}|\n)/),
  }
}

/**
 * Parst den Bescheid-Text → { meta, spec, strecken:[{name, art, istLastfahrt, startText, zielText,
 * punkte:[{raw,typ}]}] }. punkte-Reihenfolge: Start → routbare Wegpunkte (Knoten/Orte) → Ziel.
 */
export function parseVemagsText(text) {
  const meta = parseMeta(text)
  const spec = parseSpec(text)

  const start9 = text.search(/^\s*9\.\s+Fahrtweg\b/m)
  const end10 = text.search(/^\s*10\.\s+/m)
  const block = start9 >= 0 ? text.slice(start9, end10 > start9 ? end10 : undefined) : ""

  const strecken = []
  const fwParts = block.split(/Fahrtweg:\s*(\d+)/) // [vor, nr1, body1, …]
  for (let i = 1; i < fwParts.length; i += 2) {
    const body = fwParts[i + 1] || ""
    const teilRe = /Fahrtwegteil:\s*([\d.]+)\s*-\s*([^\n]+?)\s*\n([\s\S]*?)(?=Fahrtwegteil:|$)/g
    for (const tm of body.matchAll(teilRe)) {
      const teilNr = tm[1].trim()
      const art = tm[2].trim()
      const seg = tm[3]
      const sm = seg.match(/Start:\s*([^\n]+)/)
      const zm = seg.match(/Ziel:\s*([^\n]+)/)
      const startText = sm ? sm[1].trim() : null
      const zielText = zm ? zm[1].trim() : null
      // Routenzeile(n) = alles zwischen Start- und Ziel-Zeile (mehrzeilig → Whitespace kollabieren).
      let seqText = ""
      if (sm) {
        const after = seg.slice(seg.indexOf(sm[0]) + sm[0].length)
        seqText = zm ? after.slice(0, after.indexOf(zm[0])) : after
      }
      const seqClean = seqText.replace(/\s+/g, " ").trim()
      // NUR auf ' - ' splitten → Bindestrich-Namen ("Hermann-Honnef Strasse") bleiben heil.
      const tokens = seqClean ? seqClean.split(/\s+-\s+/).map(classifyToken).filter(Boolean) : []
      strecken.push({
        name: `Fahrtwegteil ${teilNr} — ${art}`,
        art,
        istLastfahrt: /last/i.test(art),
        startText,
        zielText,
        punkte: [
          startText ? { raw: startText, typ: "start" } : null,
          ...routableWaypoints(tokens),
          zielText ? { raw: zielText, typ: "ziel" } : null,
        ].filter(Boolean),
      })
    }
  }

  return { meta, spec, strecken }
}
