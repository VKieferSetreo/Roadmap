// VEMAGS-Bescheid-Parser (T-567). Extrahiert aus dem TEXT eines VEMAGS-Bescheids (Großraum-/
// Schwertransport-Genehmigung) den Fahrtweg (Punkt 9) als Strecken + die Transport-Maße.
// Reine Textfunktion — die PDF→Text-Extraktion (in-memory, PDF wird NICHT gespeichert) liegt im
// Aufrufer. Punkt 9 ist semi-strukturiert: Fahrtweg(e) → Fahrtwegteile (Leer-/Lastfahrt), je
// Start: / Wegpunkt-Sequenz (dash-separiert) / Ziel:.

const num = (s) => {
  const m = String(s ?? "").replace(/\s/g, "").replace(",", ".").match(/-?\d+(?:\.\d+)?/)
  return m ? Number(m[0]) : null
}

// Token-Klassifikation der dash-separierten Wegpunkt-Sequenz.
const ROAD_RE = /^(?:A|B|L|K|St|S)\s?\d+[a-z]?$/i // A5, B33a, L98, K29 — Verbindungsstraße, KEIN Wegpunkt
const JUNCTION_RE = /^(AS|AK|AD)\s+|^(Anschlussstelle|Autobahnkreuz|Autobahndreieck|Kreuz|Dreieck)\b/i
const INSTRUCTION_RE = /\b(links|rechts|geradeaus|gegenverkehr|sonderabfahrt|zufahrt|über|teilweise|wenden|abfahrt|auffahrt|im zuge)\b/i

/** Ein Sequenz-Token → {raw, typ}. typ: 'junction' | 'place' | 'road' | 'instruction'. */
export function classifyToken(raw) {
  const t = String(raw ?? "").trim().replace(/\s+/g, " ")
  if (!t) return null
  if (ROAD_RE.test(t)) return { raw: t, typ: "road" }
  if (JUNCTION_RE.test(t)) return { raw: t, typ: "junction" }
  if (INSTRUCTION_RE.test(t)) return { raw: t, typ: "instruction" }
  return { raw: t, typ: "place" }
}

/** Nur routbare Wegpunkte (Knoten + Orte), Straßennummern + Anweisungen raus. */
export function routableWaypoints(tokens) {
  return tokens.filter((t) => t && (t.typ === "junction" || t.typ === "place"))
}

/** Maße aus dem Bescheid (Länge/Breite/Höhe/Masse + Achslasten). */
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
  // Achslast-Zeile(n): "Achslast [t]   7,7   7   9 …" → Zahlenliste
  for (const m of text.matchAll(/Achslast\s*\[t\][^\n]*/gi)) {
    for (const z of m[0].matchAll(/\d+(?:[.,]\d+)?/g)) spec.achslastenT.push(num(z[0]))
  }
  return spec
}

/** Bescheid-/Antragsmetadaten (best effort). */
function parseMeta(text) {
  const g = (re) => { const m = text.match(re); return m ? m[1].trim() : null }
  return {
    // Strukturierte Bescheid-ID (z.B. 20260017547_B_03) — NICHT das lose "Bescheidversion zu …".
    bescheidVersion: g(/Bescheidversion\s+(\d{8,}_[A-Z]_\d+)/),
    antragsteller: g(/Firma\s*:\s*(.+?)(?:\s{2,}|\n)/),
    behoerde: g(/Behörde\s*:\s*(.+?)(?:\s{2,}|\n)/),
  }
}

/**
 * Parst den Bescheid-Text → { meta, spec, fahrtwege:[{nr, teile:[{teil, art, start, ziel, sequenz, waypoints}]}], strecken:[…] }.
 * `strecken` = flache Liste (1 je Fahrtwegteil) für die direkte Übernahme als Projekt-Strecken.
 */
export function parseVemagsText(text) {
  const meta = parseMeta(text)
  const spec = parseSpec(text)

  // Punkt 9 „Fahrtweg" isolieren: ab "9. Fahrtweg" bis "10." (Antragsrelevante Mitteilungen).
  const start9 = text.search(/^\s*9\.\s+Fahrtweg\b/m)
  const end10 = text.search(/^\s*10\.\s+/m)
  const block = start9 >= 0 ? text.slice(start9, end10 > start9 ? end10 : undefined) : ""

  const fahrtwege = []
  // In Fahrtweg-Blöcke splitten ("Fahrtweg: N"). KEIN Zeilen-Anker — durch das PDF-Layout steht oft
  // Trailing-Text auf der Zeile (z.B. "Fahrtweg: 1   siehe Anlage 2"). "Fahrtweg:" matcht NICHT
  // "Fahrtwegteil:" (dort folgt "teil", kein Doppelpunkt+Ziffer).
  const fwParts = block.split(/Fahrtweg:\s*(\d+)/)
  // fwParts: [vor, nr1, body1, nr2, body2, …]
  for (let i = 1; i < fwParts.length; i += 2) {
    const nr = fwParts[i]
    const body = fwParts[i + 1] || ""
    const teile = []
    // je Fahrtwegteil: "Fahrtwegteil: N.M - Art" … "Start:" … <seq> … "Ziel:"
    const teilRe = /Fahrtwegteil:\s*([\d.]+)\s*-\s*([^\n]+?)\s*\n([\s\S]*?)(?=Fahrtwegteil:|$)/g
    for (const tm of body.matchAll(teilRe)) {
      const teilNr = tm[1].trim()
      const art = tm[2].trim() // Leerfahrt / Lastfahrt
      const seg = tm[3]
      const sm = seg.match(/Start:\s*([^\n]+)/)
      const zm = seg.match(/Ziel:\s*([^\n]+)/)
      const startText = sm ? sm[1].trim() : null
      const zielText = zm ? zm[1].trim() : null
      // Wegpunkt-Sequenz = alles zwischen Start-Zeile und Ziel-Zeile (mehrzeilig → joinen).
      let seqText = ""
      if (sm) {
        const after = seg.slice(seg.indexOf(sm[0]) + sm[0].length)
        seqText = zm ? after.slice(0, after.indexOf(zm[0])) : after
      }
      const seqClean = seqText.replace(/\s+/g, " ").trim()
      const tokens = seqClean ? seqClean.split(/\s+-\s+/).map(classifyToken).filter(Boolean) : []
      teile.push({
        teil: teilNr,
        art,
        istLastfahrt: /last/i.test(art),
        start: startText,
        ziel: zielText,
        sequenz: tokens,
        waypoints: routableWaypoints(tokens),
      })
    }
    fahrtwege.push({ nr, teile })
  }

  // Flache Strecken-Liste (1 je Fahrtwegteil) — Reihenfolge: Start → routbare Wegpunkte → Ziel.
  const strecken = []
  for (const fw of fahrtwege) {
    for (const t of fw.teile) {
      strecken.push({
        name: `Fahrtwegteil ${t.teil} — ${t.art}`,
        art: t.art,
        istLastfahrt: t.istLastfahrt,
        startText: t.start,
        zielText: t.ziel,
        // Geokodier-Eingaben in Reihenfolge: Start, Wegpunkte (Knoten/Orte), Ziel.
        punkte: [
          t.start ? { raw: t.start, typ: "start" } : null,
          ...t.waypoints,
          t.ziel ? { raw: t.ziel, typ: "ziel" } : null,
        ].filter(Boolean),
      })
    }
  }

  return { meta, spec, fahrtwege, strecken }
}
