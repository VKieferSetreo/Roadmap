// Die Riegel gegen erfundene Stammdaten (T-657).
//
// Der Wert dieses Systems steht und faellt damit, dass NICHTS durchkommt, was nicht im Text
// steht. Diese Datei prueft genau das, mit einem Modell-Doppel, das absichtlich luegt.

import { describe, it, expect, vi } from "vitest"
import { pruefeAngabe, leseAntwort, extrahiere, bauePrompt, FELDER, quelleHash, istOrtsfeld } from "../src/anreicherung/extrakt.js"
import { quelltextVon, offeneFelder } from "../src/anreicherung/lauf.js"
import { modellKonfig, createModell } from "../src/anreicherung/modell.js"
import { ladeAnreicherung, mitAnreicherung, anreicherungsVermerk } from "../src/anreicherung/lesen.js"

const TEXT = 'Bezeichnung: Brücke K BA 10 über die A70\nBeschreibung: Durchfahrtshöhe 4,20 m, Baujahr 1987'

describe("pruefeAngabe — Belegpflicht", () => {
  it("nimmt an, was im Text steht und aus dem Beleg folgt", () => {
    const r = pruefeAngabe({ feld: "getrageneStrasse", wert: "K BA 10", beleg: "Brücke K BA 10" }, TEXT)
    expect(r).toMatchObject({ ok: true, feld: "getrageneStrasse", wert: "KBA10" })
  })

  // Der wichtigste Test der Datei: das Modell erfindet eine Textstelle.
  it("verwirft einen Beleg, den es im Text gar nicht gibt", () => {
    const r = pruefeAngabe({ feld: "getrageneStrasse", wert: "A9", beleg: "im Zuge der A9" }, TEXT)
    expect(r.ok).toBe(false)
    expect(r.grund).toMatch(/nicht im Quelltext/)
  })

  // Zweitwichtigster: der Beleg stimmt, aber der Wert steht gar nicht drin. So entsteht sonst
  // aus einer richtigen Textstelle eine falsche Zahl.
  it("verwirft einen Wert, der aus dem Beleg nicht folgt", () => {
    const r = pruefeAngabe({ feld: "getrageneStrasse", wert: "A70", beleg: "Brücke K BA 10" }, TEXT)
    expect(r.ok).toBe(false)
    expect(r.grund).toMatch(/folgt nicht aus dem Beleg/)
  })

  it("verlangt ueberhaupt einen Beleg", () => {
    expect(pruefeAngabe({ feld: "maxHoeheM", wert: "4.2" }, TEXT).ok).toBe(false)
    expect(pruefeAngabe({ feld: "maxHoeheM", wert: "4.2", beleg: "" }, TEXT).ok).toBe(false)
  })

  it("laesst nur bekannte Felder zu", () => {
    const r = pruefeAngabe({ feld: "baujahr", wert: "1987", beleg: "Baujahr 1987" }, TEXT)
    expect(r.ok).toBe(false)
    expect(r.grund).toMatch(/unbekanntes Feld/)
  })

  it("ist gegen Gross/Kleinschreibung und Leerzeichen unempfindlich, sonst aber genau", () => {
    expect(pruefeAngabe({ feld: "maxHoeheM", wert: "4,20", beleg: "durchfahrtshöhe  4,20 M" }, TEXT).ok).toBe(true)
    expect(pruefeAngabe({ feld: "maxHoeheM", wert: "4,20", beleg: "Durchfahrtshoehe 4,20 m" }, TEXT).ok).toBe(false)
  })
})

describe("pruefeAngabe — Formtreue", () => {
  // Baujahr, Stationierung und Bauwerksnummer sind die Zahlen, die in diesen Texten
  // herumliegen und faelschlich als Hoehe oder Last gelesen werden koennen.
  it("weist eine Hoehe zurueck, die keine sein kann", () => {
    for (const [wert, beleg] of [["1987", "Baujahr 1987"], ["0.5", "Baujahr 1987"]]) {
      expect(pruefeAngabe({ feld: "maxHoeheM", wert, beleg }, TEXT).ok).toBe(false)
    }
  })

  it("weist eine Tonnage zurueck, die keine sein kann", () => {
    expect(pruefeAngabe({ feld: "maxGewichtT", wert: "6031578", beleg: "BW 6031578" }, "BW 6031578").ok).toBe(false)
  })

  it("nimmt eine plausible Tonnage an", () => {
    const t = "zulässige Gesamtmasse 44 t"
    expect(pruefeAngabe({ feld: "maxGewichtT", wert: "44", beleg: "Gesamtmasse 44 t" }, t)).toMatchObject({ ok: true, wert: "44" })
  })
})

describe("leseAntwort", () => {
  it("schaelt JSON aus Prosa und Codebloecken", () => {
    expect(leseAntwort('Hier das Ergebnis:\n```json\n{"angaben":[{"feld":"x"}]}\n```\nViel Erfolg!'))
      .toEqual([{ feld: "x" }])
  })
  it("gibt null bei allem, was kein JSON ist", () => {
    expect(leseAntwort("Ich kann das nicht beantworten.")).toBeNull()
    expect(leseAntwort("")).toBeNull()
    expect(leseAntwort(null)).toBeNull()
  })
  it("gibt null, wenn angaben fehlt oder keine Liste ist", () => {
    expect(leseAntwort('{"ergebnis": "A7"}')).toBeNull()
    expect(leseAntwort('{"angaben": "A7"}')).toBeNull()
  })
})

describe("extrahiere — Modell-Doppel", () => {
  const luegt = (antwort) => vi.fn().mockResolvedValue(antwort)

  it("nimmt Belegtes an und verwirft Erfundenes im selben Durchgang", async () => {
    const r = await extrahiere(TEXT, {
      modell: "doppel",
      felder: ["getrageneStrasse", "maxHoeheM"],
      rufeModell: luegt(JSON.stringify({ angaben: [
        { feld: "getrageneStrasse", wert: "K BA 10", beleg: "Brücke K BA 10" },
        { feld: "maxGewichtT", wert: "40", beleg: "Tragfähigkeit 40 t" }, // steht nicht im Text
      ] })),
    })
    expect(r.gueltig).toHaveLength(1)
    expect(r.gueltig[0].wert).toBe("KBA10")
    expect(r.verworfen).toHaveLength(1)
  })

  it("nimmt ein Feld nur einmal — zwei Antworten sind keine Antwort", async () => {
    const r = await extrahiere(TEXT, {
      modell: "doppel",
      felder: ["getrageneStrasse"],
      rufeModell: luegt(JSON.stringify({ angaben: [
        { feld: "getrageneStrasse", wert: "K BA 10", beleg: "Brücke K BA 10" },
        { feld: "getrageneStrasse", wert: "A70", beleg: "über die A70" },
      ] })),
    })
    expect(r.gueltig).toHaveLength(1)
    expect(r.verworfen[0].grund).toMatch(/mehrfach/)
  })

  it("uebersteht ein Modell, das gar nicht antwortet", async () => {
    for (const antwort of [null, "", "Fehler"]) {
      const r = await extrahiere(TEXT, { modell: "d", felder: ["maxHoeheM"], rufeModell: luegt(antwort) })
      expect(r.gueltig).toEqual([])
    }
  })

  it("uebersteht ein Modell, das wirft", async () => {
    const r = await extrahiere(TEXT, {
      modell: "d", felder: ["maxHoeheM"],
      rufeModell: vi.fn().mockRejectedValue(new Error("Zeit abgelaufen")),
    })
    expect(r.gueltig).toEqual([])
  })
})

describe("bauePrompt", () => {
  it("nennt nur die gefragten Felder und stellt den Text hinein", () => {
    const p = bauePrompt("Brücke A7", ["maxHoeheM"])
    expect(p).toContain("maxHoeheM")
    expect(p).not.toContain("maxGewichtT")
    expect(p).toContain("Brücke A7")
  })

  // Ein Prompt mit erfundenen Beispiel-Strassennummern faerbt auf die Antwort ab. Deshalb steht
  // im Prompt keine einzige echte Strassennummer.
  it("enthaelt keine Beispiel-Strassennummern, die abgeschrieben werden koennten", () => {
    expect(bauePrompt("x")).not.toMatch(/\b[AB]\s?\d{1,3}\b/)
  })
})

describe("quelltextVon / offeneFelder", () => {
  const punkt = {
    name: "Brücke K BA 10", beschreibung: "Durchfahrtshöhe 4,20 m",
    strassen_ref: "A70", kategorie: "bruecke", attrs: { maxHoeheM: 4.2 },
  }

  it("gibt dem Modell alles, was wir haben", () => {
    const t = quelltextVon(punkt)
    for (const stueck of ["Brücke K BA 10", "Durchfahrtshöhe", "A70", "bruecke"]) expect(t).toContain(stueck)
  })

  it("nimmt die Ursprungsdaten der Quelle mit, sobald es sie gibt", () => {
    expect(quelltextVon({ ...punkt, roh: { hoechst_sachverhalt_oben: "K BA 10" } }))
      .toContain("hoechst_sachverhalt_oben")
  })

  it("fragt nur nach dem, was die Quelle nicht schon sagt", () => {
    expect(offeneFelder(punkt)).not.toContain("maxHoeheM")
    expect(offeneFelder(punkt)).toContain("getrageneStrasse")
    expect(offeneFelder({ attrs: {} })).toEqual(Object.keys(FELDER))
  })
})

describe("quelleHash", () => {
  it("ist stabil und aendert sich mit dem Text", () => {
    expect(quelleHash("abc")).toBe(quelleHash("abc"))
    expect(quelleHash("abc")).not.toBe(quelleHash("abd"))
  })
})

describe("modellKonfig", () => {
  it("nimmt lokal ohne Schluessel und OpenRouter nur mit", () => {
    vi.stubEnv("OPENROUTER_API_KEY", "")
    expect(modellKonfig("lokal").verfuegbar).toBe(true)
    expect(modellKonfig("openrouter").verfuegbar).toBe(false)
    vi.stubEnv("OPENROUTER_API_KEY", "erfunden-fuer-den-test")
    expect(modellKonfig("openrouter").verfuegbar).toBe(true)
    vi.unstubAllEnvs()
  })

  it("schickt den Schluessel nur an OpenRouter, nie an den lokalen Dienst", async () => {
    const gesehen = []
    const fetchImpl = async (url, o) => {
      gesehen.push({ url, auth: o.headers.Authorization ?? null })
      return { ok: true, json: async () => ({ choices: [{ message: { content: "{}" } }] }) }
    }
    await createModell({ name: "m", basis: "http://lokal/v1", schluessel: null }, { fetchImpl })("x")
    await createModell({ name: "m", basis: "https://openrouter.ai/api/v1", schluessel: "geheim" }, { fetchImpl })("x")
    expect(gesehen[0].auth).toBeNull()
    expect(gesehen[1].auth).toBe("Bearer geheim")
  })

  it("gibt null statt zu werfen, wenn der Dienst nicht antwortet", async () => {
    const rufe = createModell({ name: "m", basis: "http://weg/v1", schluessel: null }, {
      fetchImpl: async () => { throw new Error("kein Netz") },
    })
    await expect(rufe("x")).resolves.toBeNull()
  })
})

// ── Übernahme in die Analyse ────────────────────────────────────────────────

describe("mitAnreicherung — abgeleitete Werte füllen nur Lücken", () => {
  const eintrag = {
    getrageneStrasse: { wert: "A7", beleg: "Brücke A7" },
    maxHoeheM: { wert: "4.2", beleg: "Höhe 4,20 m" },
  }

  it("setzt einen abgeleiteten Wert dort ein, wo die Quelle schweigt", () => {
    const r = mitAnreicherung({ attrs: {} }, eintrag)
    expect(r.obstacle.attrs.getrageneStrasse).toBe("A7")
    expect(r.ergaenzt).toEqual(["getrageneStrasse", "maxHoeheM"])
  })

  // Der wichtigste Test hier: eine gemeldete Angabe wird NIE überschrieben, auch dann nicht,
  // wenn der abgeleitete Wert plausibler aussieht. Sonst würde eine stille Modellkorrektur zu
  // einer Aussage über eine Brücke, für die am Ende jemand geradesteht.
  it("überschreibt eine gemeldete Angabe niemals", () => {
    const r = mitAnreicherung({ attrs: { getrageneStrasse: "B62" } }, eintrag)
    expect(r.obstacle.attrs.getrageneStrasse).toBe("B62")
    expect(r.ergaenzt).toEqual(["maxHoeheM"])
  })

  it("lässt das Hindernis unangetastet, wenn es nichts zu ergänzen gibt", () => {
    const o = { attrs: { getrageneStrasse: "B62" } }
    expect(mitAnreicherung(o, null).obstacle).toBe(o)
    expect(mitAnreicherung(o, {}).ergaenzt).toEqual([])
  })

  it("nennt im Vermerk, WAS ergänzt wurde, nicht nur dass etwas ergänzt wurde", () => {
    expect(anreicherungsVermerk(["getrageneStrasse", "maxHoeheM"])).toBe("getragene Straße, Durchfahrtshöhe")
    expect(anreicherungsVermerk([])).toBeNull()
  })
})

describe("ladeAnreicherung", () => {
  it("bricht die Analyse nicht ab, wenn die Tabelle fehlt", async () => {
    const db = { query: async () => { throw new Error('relation "anreicherung" does not exist') } }
    await expect(ladeAnreicherung(db, ["a"])).resolves.toEqual(new Map())
  })

  it("fragt gar nicht erst ohne Kennungen", async () => {
    let gefragt = false
    const db = { query: async () => { gefragt = true; return { rows: [] } } }
    await ladeAnreicherung(db, [])
    expect(gefragt).toBe(false)
  })

  it("lässt von Hand verworfene Werte draußen", async () => {
    const gesehen = []
    const db = { query: async (sql) => { gesehen.push(sql); return { rows: [] } } }
    await ladeAnreicherung(db, ["a"])
    expect(gesehen[0]).toMatch(/geprueft IS NULL OR geprueft = true/)
    expect(gesehen[0]).toMatch(/stand = 'ok'/)
  })
})

// ── Die Ortssperre ──────────────────────────────────────────────────────────

describe("Koordinaten sind für das Modell gesperrt", () => {
  // Max, 31.08.2026: "aber Agent darf keine Koordinaten bauen, das darf nur der deterministische
  // Pull." Eine erfundene Ortsangabe legt ein Hindernis an eine Stelle, an der es nicht ist.
  it("führt kein einziges Ortsfeld", () => {
    for (const feld of Object.keys(FELDER)) {
      expect(istOrtsfeld(feld), `Feld "${feld}" ist ein Ortsfeld`).toBe(false)
    }
  })

  it("erkennt Ortsfelder, laesst Massfelder aber in Ruhe", () => {
    for (const f of ["lat", "lng", "x", "y", "geom", "koordinateX", "rechtswert"]) expect(istOrtsfeld(f)).toBe(true)
    // Die Falle: "maxHoeheM" enthaelt ein x. Eine Teilstring-Pruefung auf "x" sperrte alle Massfelder.
    for (const f of ["maxHoeheM", "maxGewichtT", "maxBreiteM", "getrageneStrasse"]) expect(istOrtsfeld(f)).toBe(false)
  })

  it("nimmt eine Ortsangabe auch dann nicht an, wenn das Modell sie anbietet", () => {
    for (const feld of ["lat", "lng", "geom", "position"]) {
      const r = pruefeAngabe({ feld, wert: "49.1234", beleg: "49.1234" }, "49.1234")
      expect(r.ok).toBe(false)
      expect(r.grund).toMatch(/unbekanntes Feld/)
    }
  })

  it("fragt das Modell gar nicht erst nach einem Ort", () => {
    const p = bauePrompt("irgendein Text")
    for (const wort of ["Koordinate", "Breitengrad", "Längengrad", "lat", "lng"]) {
      expect(p).not.toContain(wort)
    }
  })
})

describe("Ortsangabe verleitet nicht zur Lage", () => {
  // In der Produktion beobachtet: aus der Zeile "Straßenangabe: B65" schloss das Modell, die
  // Brücke TRAGE die B65. Bei einer Überführung ÜBER die B65 wäre das genau verkehrt. Der
  // Belegriegel kann das nicht abfangen — die Zeile steht ja wirklich da. Nur die Formulierung
  // verhindert den Fehlschluss.
  it("bezeichnet die Straßenangabe als reine Ortsangabe", () => {
    const t = quelltextVon({ name: "BW 308A", strassen_ref: "B65" })
    expect(t).not.toMatch(/^Straßenangabe:/m)
    expect(t).toMatch(/sagt nichts über oben\/unten/)
  })

  it("sagt es dem Modell auch im Auftrag", () => {
    expect(bauePrompt("x")).toMatch(/Leite daraus keine der beiden Angaben ab/)
  })
})
