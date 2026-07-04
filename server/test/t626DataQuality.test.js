// T-626 Data-Quality-Audit — Fixes: dateOnly-Slash-Format (0215 Münster) + Staleness-Monitor-Klassifikation
// + T-632 SEVAS VZ 253/250 (Lkw-/Durchfahrtsverbote) + ruleGewicht-Verbots-Semantik.
import { describe, it, expect } from "vitest"
import { dateOnly } from "../src/connectors/_helpers.js"
import { detectStaleSources } from "../src/worker/hygiene.js"
import { sevasFeatureToObstacle } from "../src/connectors/0157_sevas_nrw_restriktionen.js"
import { evaluate } from "../src/engine/rules.js"
import { runImport } from "../src/worker/importer.js"
import { createFakeDb } from "./helpers/fakeDb.js"
import { zeitfensterAusRecord, kreisRefAus } from "../src/connectors/datex2.js"

const TRANSPORT = { laenge: 24.5, breite: 3.0, hoehe: 4.2, gesamtgewicht: 68, achsen: 8 }
const sevasFeat = (props) => ({
  type: "Feature",
  geometry: { type: "LineString", coordinates: [[7.5, 51.5], [7.51, 51.51]] },
  properties: { segment_id: 1, restrkn_id: 2, name: "Teststraße", gemeinde: "Krefeld", kreis: "Krefeld", ...props },
})

describe("dateOnly — Slash-Format (T-626, Münster-Feed 0215)", () => {
  it("parst YYYY/MM/DD [HH:MM:SS] → ISO", () => {
    expect(dateOnly("2026/07/02 00:00:00")).toBe("2026-07-02")
    expect(dateOnly("2026/12/31")).toBe("2026-12-31")
  })
  it("bestehende Formate bleiben unverändert", () => {
    expect(dateOnly("2026-07-02T13:00:00Z")).toBe("2026-07-02")
    expect(dateOnly("02.07.2026")).toBe("2026-07-02")
    expect(dateOnly("02.07.26")).toBe("2026-07-02")
    expect(dateOnly(null)).toBe(null)
    expect(dateOnly("kein Datum")).toBe(null)
  })
})

describe("detectStaleSources — Grund-Klassifikation (T-626)", () => {
  // Stub-DB: liefert kanonische Zeilen, wie sie STALE_SOURCES_SQL zurückgäbe.
  const stubDb = (rows) => ({ query: async () => ({ rows }) })

  it("klassifiziert jedes Signal korrekt", async () => {
    const rows = [
      { id: "0124", name: "NRW GST", last_status: "warn", last_run: "2026-06-29 10:00", age_days: 5, aktiv_n: "156" },
      { id: "0111", name: "HH Brücken", last_status: "ok", last_run: "2026-07-04 06:00", age_days: 0, aktiv_n: "0" },
      { id: "0122", name: "MobiData BW", last_status: "ok", last_run: "2026-06-14 16:00", age_days: 20, aktiv_n: "0" },
      { id: "0009", name: "Nie gelaufen", last_status: null, last_run: null, age_days: null, aktiv_n: "0" },
    ]
    const out = await detectStaleSources(stubDb(rows), { staleDays: 3 })
    const byId = Object.fromEntries(out.map((f) => [f.id, f.grund]))
    expect(byId["0124"]).toBe("letzter Lauf warn")
    expect(byId["0111"]).toBe("0 aktive Hindernisse")
    expect(byId["0009"]).toBe("nie gelaufen")
    // 0122: ok-Lauf, 0 aktiv → "0 aktive Hindernisse" hat Vorrang (aktiv_n===0 vor Alters-Fallback)
    expect(byId["0122"]).toBe("0 aktive Hindernisse")
    expect(out.every((f) => typeof f.aktiv_n === "number")).toBe(true)
  })

  it("leere Liste → keine Flags", async () => {
    const out = await detectStaleSources(stubDb([]), {})
    expect(out).toEqual([])
  })
})

describe("T-632 — SEVAS VZ 253/250 Verbote (0157)", () => {
  it("VZ 253 → gewicht + verkehrsverbotLkwT=3.5, Zusatzzeichen als Kontext", () => {
    const o = sevasFeatureToObstacle(sevasFeat({ typ: "253", wert: "", vz_1020_30: "true" }))
    expect(o.kategorie).toBe("gewicht")
    expect(o.attrs.verkehrsverbotLkwT).toBe(3.5)
    expect(o.attrs.maxGewichtT).toBeUndefined() // KEINE physische Traglast
    expect(o.name).toMatch(/Lkw-Durchfahrtsverbot/)
    expect(o.beschreibung).toMatch(/Zusatzzeichen/)
  })
  it("VZ 250 → sperrung + vollsperrung; Zeitfenster als Hinweis", () => {
    const o = sevasFeatureToObstacle(sevasFeat({ typ: "250", zeit1_von: "22:00", zeit1_bis: "06:00" }))
    expect(o.kategorie).toBe("sperrung")
    expect(o.attrs.vollsperrung).toBe(true)
    expect(o.beschreibung).toMatch(/22:00–06:00/)
  })
  it("Maß-Zeichen VZ 265 (Höhe) bleibt unverändert; typ mit Suffix + unbekannt → null", () => {
    const o = sevasFeatureToObstacle(sevasFeat({ typ: "265", wert: "3,8" }))
    expect(o.kategorie).toBe("bruecke")
    expect(o.attrs.maxHoeheM).toBe(3.8)
    expect(sevasFeatureToObstacle(sevasFeat({ typ: "257-57" }))).toBe(null)
    expect(sevasFeatureToObstacle(sevasFeat({ typ: "262", wert: "" }))).toBe(null) // Maß ohne Wert
  })
})

describe("T-632/T-631 — ruleGewicht Verbots-Severity", () => {
  const obst = (attrs) => ({ kategorie: "gewicht", name: "x", attrs, gueltigVon: null, gueltigBis: null })
  it("VZ-253-Verbot (verkehrsverbotLkwT) → WARNUNG, nicht kritisch (kein Karten-Flut)", () => {
    const r = evaluate(obst({ verkehrsverbotLkwT: 3.5 }), TRANSPORT, {})
    expect(r).not.toBe(null)
    expect(r.severity).toBe("warnung")
  })
  it("grundsaetzlicheGstSperre → warnung; gesperrtKomplett → kritisch", () => {
    expect(evaluate(obst({ grundsaetzlicheGstSperre: true }), TRANSPORT, {}).severity).toBe("warnung")
    expect(evaluate(obst({ gesperrtKomplett: true }), TRANSPORT, {}).severity).toBe("kritisch")
  })
  it("physische Traglast maxGewichtT < Transport bleibt kritisch", () => {
    expect(evaluate(obst({ maxGewichtT: 30 }), TRANSPORT, {}).severity).toBe("kritisch")
  })
})

describe("T-627 — Reconcile-Plausibilitäts-Guard (Data-Loss-Schutz)", () => {
  const item = (i) => ({ externeId: `g-${i}`, kategorie: "baustelle", name: `Baustelle Nr ${i}`, lat: 52 + i * 0.01, lng: 9 + i * 0.01, attrs: {}, quelle: { name: "m", url: "https://x" } })
  const voll = (items) => ({ quelleId: "0009", name: "M", schedule: "0 4 * * *", vollbestand: true, fetch: async () => ({ obstacles: items }) })
  const many = Array.from({ length: 60 }, (_, i) => item(i))
  const aktivN = (db) => db.state.obstacles.filter((o) => o.aktiv).length

  it("Massen-Deaktivierung (>40% von ≥50) → Reconcile ausgesetzt, status=partial, nichts gelöscht", async () => {
    const db = createFakeDb()
    await runImport({ db, connector: voll(many), log: () => {} })
    expect(aktivN(db)).toBe(60)
    // nächster Lauf liefert nur 20 (40 „verschwunden" = 66%) — z.B. Paging-Abbruch → Guard greift
    const run = await runImport({ db, connector: voll(many.slice(0, 20)), log: () => {} })
    expect(run.status).toBe("partial")
    expect(run.stats.deaktiviert).toBe(0)
    expect(aktivN(db)).toBe(60) // KEINE echte Zeile deaktiviert
  })

  it("normale Fluktuation (<40%) → Reconcile läuft normal", async () => {
    const db = createFakeDb()
    await runImport({ db, connector: voll(many), log: () => {} })
    const run = await runImport({ db, connector: voll(many.slice(0, 55)), log: () => {} }) // 5 weg = 8%
    expect(run.status).toBe("ok")
    expect(run.stats.deaktiviert).toBe(5)
    expect(aktivN(db)).toBe(55)
  })
})

describe("T-635 — Richtung + Zeitfenster als Info (Severity UNVERÄNDERT, FN-Schutz)", () => {
  const inZeitraum = { von: "2026-08-01", bis: "2026-08-01" }
  const ob = (kategorie, attrs) => ({ kategorie, name: "x", attrs, gueltigVon: "2026-07-01", gueltigBis: "2026-12-31" })

  it("einseitige Vollsperrung bleibt KRITISCH, Richtung nur im Detail", () => {
    const r = evaluate(ob("sperrung", { vollsperrung: true, richtung: "in Fahrtrichtung" }), TRANSPORT, inZeitraum)
    expect(r.severity).toBe("kritisch") // FN-Schutz: NICHT gesenkt
    expect(r.detail.Sperrung).toBe("Vollsperrung (nur in Fahrtrichtung)")
  })
  it("beidseitige Vollsperrung: kein Richtungs-Suffix", () => {
    expect(evaluate(ob("sperrung", { vollsperrung: true, richtung: "beide Richtungen" }), TRANSPORT, inZeitraum).detail.Sperrung).toBe("Vollsperrung")
  })
  it("Baustellen-Vollsperrung einseitig: Beschreibung nennt Richtungs-Prüfung, kritisch", () => {
    const r = evaluate(ob("baustelle", { vollsperrung: true, richtung: "Gegenrichtung" }), TRANSPORT, inZeitraum)
    expect(r.severity).toBe("kritisch")
    expect(r.beschreibung).toMatch(/gesperrten Richtung/)
  })
  it("Zeitfenster als Info-Detail, Severity unverändert", () => {
    const r = evaluate(ob("sperrung", { vollsperrung: true, zeitfenster: "22:00–05:00", nurNachts: true }), TRANSPORT, inZeitraum)
    expect(r.severity).toBe("kritisch")
    expect(r.detail.Sperrzeitfenster).toBe("22:00–05:00 (nur nachts)")
  })
})

describe("T-635 — datex2 Zeitfenster-Extraktion (Freitext, eng verankert)", () => {
  it("'20h bis 5h' → nächtlich", () => {
    expect(zeitfensterAusRecord("", "Sperrung 20h bis 5h")).toEqual({ zeitfenster: "20:00–05:00", nurNachts: true })
  })
  it("'9h bis 15h' → kein nurNachts", () => {
    expect(zeitfensterAusRecord("", "je 9h bis 15h")).toEqual({ zeitfenster: "09:00–15:00" })
  })
  it("km-/Datumsangaben werden NICHT als Zeitfenster gematcht", () => {
    expect(zeitfensterAusRecord("", "km 10 bis 15 gesperrt")).toEqual({})
    expect(zeitfensterAusRecord("", "vom 17.6. bis 20.6.")).toEqual({})
  })
})

describe("T-629 — bayerische Kreisstraßen-Ref (0147, kreisRefAus)", () => {
  it("echte BayernInfo-Kreisstraßen am Namensanfang", () => {
    expect(kreisRefAus("PAN31 zwischen Furth und Unterthann gesperrt")).toBe("PAN31")
    expect(kreisRefAus("OA32 zwischen Felben und Binzen gesperrt")).toBe("OA32")
    expect(kreisRefAus("DLG10 Osterbuch, Buchbergstraße zwischen …")).toBe("DLG10")
    expect(kreisRefAus("RO2 Feldkirchen, Dorfplatz bis Glonner Straße")).toBe("RO2")
  })
  it("Fehlmatch-Schutz: Einheiten + Innerorts-Straßen → null", () => {
    expect(kreisRefAus("VK 0,4kV rep.")).toBe(null) // Kilovolt, kein Straßen-Kontext
    expect(kreisRefAus("München, Schellingstraße zwischen Arcisstraße")).toBe(null) // Ortsname, keine Kreis-Ref
    expect(kreisRefAus("Oberndorfer Straße zwischen Oberndorf und Bad Abbach")).toBe(null)
  })
})
