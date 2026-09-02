// Die Riegel gegen erfundene Stammdaten (T-657).
//
// Der Wert dieses Systems steht und faellt damit, dass NICHTS durchkommt, was nicht im Text
// steht. Diese Datei prueft genau das, mit einem Modell-Doppel, das absichtlich luegt.

import { describe, it, expect, vi } from "vitest"
import { pruefeAngabe, leseAntwort, extrahiere, bauePrompt, FELDER, quelleHash, istOrtsfeld } from "../src/anreicherung/extrakt.js"
import { quelltextVon, offeneFelder, laufeUeberBestand, reichereAn, AUSSICHTSLOS } from "../src/anreicherung/lauf.js"
import { modellKonfig, createModell } from "../src/anreicherung/modell.js"
import { ladeAnreicherung, mitAnreicherung, anreicherungsVermerk, kiZeilen } from "../src/anreicherung/lesen.js"
import { spieleEin, nimmZurueck } from "../src/anreicherung/einspielen.js"
import { nachlauf, nachImport } from "../src/anreicherung/nachlauf.js"
import { zahl } from "../src/anreicherung/felder.js"

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
    expect(offeneFelder(punkt)).not.toContain("maxHoeheM") // steht in attrs
    expect(offeneFelder(punkt)).toContain("getrageneStrasse")
    expect(offeneFelder({ kategorie: "bruecke", attrs: {} })).toEqual(Object.keys(FELDER))
  })

  // Eine Baustelle hat keine getragene Strasse. Danach zu fragen laedt zu Fehlschluessen ein:
  // das Modell nimmt dann die naechstbeste Nummer aus dem Text.
  it("fragt Bauwerksfelder nur bei Bauwerken", () => {
    const baustelle = offeneFelder({ kategorie: "baustelle", attrs: {} })
    expect(baustelle).not.toContain("getrageneStrasse")
    expect(baustelle).not.toContain("gekreuzteStrasse")
    expect(baustelle).toContain("maxHoeheM")
    expect(offeneFelder({ kategorie: "tunnel", attrs: {} })).toContain("gekreuzteStrasse")
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
    // Als WORT prüfen, nicht als Teilstring: "Platzhalter" enthält "lat", und genau daran ist
    // dieser Test schon einmal falsch angeschlagen (derselbe Fehlertyp wie "x" in "maxHoeheM").
    for (const wort of ["Koordinate", "Breitengrad", "Längengrad", "lat", "lng"]) {
      expect(p, wort).not.toMatch(new RegExp(`\\b${wort}\\b`, "i"))
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
    expect(t).toMatch(/Verortet an: B65/)
    expect(t).toMatch(/keine Aussage über oben\/unten/)
  })

  it("sagt es dem Modell auch im Auftrag", () => {
    expect(bauePrompt("x")).toMatch(/Verortet an.*nur den Ort/s)
  })

  // Die Warnung darf NUR dieses Feld betreffen. In der ersten Fassung stand sie als allgemeine
  // Regel im Auftrag und hinderte das Modell auch daran, die Straße aus dem NAMEN zu lesen:
  // "Brücke St 2148 BW 6840513" lieferte nichts, obwohl ST2148 dort steht.
  it("erlaubt ausdrücklich, die Lage aus dem Bezeichnungstext zu lesen", () => {
    expect(bauePrompt("x")).toMatch(/BEZEICHNUNGSTEXT darfst du die Lage sehr wohl lesen/)
  })
})

// ── Der erweiterte Katalog ──────────────────────────────────────────────────

describe("Katalog: die Fragen treffen die Sprache der Quelle", () => {
  // Der Anlass: die erste Fassung fragte nach "zulässiger Gesamtmasse", im Text stand
  // "Lkw-Durchfahrtsverbot über 3,5 t". Das Modell fand nichts, obwohl die Zahl dastand.
  // 447 von 2.049 als leer vermerkten Punkten trugen eine Maßzahl.
  it("nennt bei Gewicht auch die Formulierungen der Quellen", () => {
    expect(FELDER.maxGewichtT.frage).toMatch(/Durchfahrtsverbot|Gewichtsbeschränkung/)
    expect(FELDER.maxHoeheM.frage).toMatch(/Höhenbeschränkung|lichte Höhe/)
  })

  it("liest deutsche Kommazahlen und Beiwerk", () => {
    expect(FELDER.maxHoeheM.pruefe("4,83")).toBe(4.83)
    expect(FELDER.maxHoeheM.pruefe("ca. 4,20 m")).toBe(4.2)
    expect(FELDER.maxGewichtT.pruefe("über 3,5 t")).toBe(3.5)
  })

  it("weist Zahlen ab, die keine Maße sein können", () => {
    expect(FELDER.maxHoeheM.pruefe("1987")).toBeNull()      // Baujahr
    expect(FELDER.maxGewichtT.pruefe("6031578")).toBeNull() // Bauwerksnummer
    expect(FELDER.maxAchslastT.pruefe("2026")).toBeNull()
  })

  it("nimmt ja/nein nur bei eindeutigen Wörtern", () => {
    expect(FELDER.vollsperrung.pruefe("ja")).toBe(true)
    expect(FELDER.vollsperrung.pruefe("nein")).toBe(false)
    expect(FELDER.vollsperrung.pruefe("teilweise")).toBeNull()
    expect(FELDER.vollsperrung.pruefe("")).toBeNull()
  })

  it("deckt die grossen Luecken des Bestands ab", () => {
    // Gemessen am 31.08.2026: diese Felder sind zu 80 bis 100 Prozent leer.
    for (const f of ["maxAchslastT", "maxBreiteM", "maxLaengeM", "restbreiteM",
                     "verkehrsverbotLkwT", "spurenGesperrt", "vollsperrung"]) {
      expect(Object.keys(FELDER)).toContain(f)
    }
  })
})

describe("Katalog: die Lücken aus der Handprüfung", () => {
  // Alle vier stammen aus dem Durchgang vom 31.08.2026 über 20 textreiche Baustellen. Vorher
  // 4 Treffer bei 17 Verwerfungen, danach 7 bei 9.
  it("liest ausgeschriebene Zahlen — \"nur ein Fahrstreifen\" ist die häufigste Form", () => {
    expect(FELDER.anzahlFahrstreifen.pruefe("nur ein Fahrstreifen")).toBe(1)
    expect(FELDER.spurenFrei.pruefe("zwei Spuren frei")).toBe(2)
    expect(FELDER.spurenGesperrt.pruefe("keine")).toBe(0)
  })

  it("erkennt eine gesperrte Seite als halbseitig, egal wie sie heißt", () => {
    for (const t of ["Südseite gesperrt", "halbseitige Sperrung", "eine Fahrbahn frei", "abwechselnd"]) {
      expect(FELDER.halbseitig.belegMuster.test(t), t).toBe(true)
    }
  })

  it("verzeiht dem Modell Tippfehler in der Sperrungsart", () => {
    expect(FELDER.sperrungArt.pruefe("fahrenstreifen")).toBe("fahrstreifensperrung")
    expect(FELDER.sperrungArt.pruefe("roadClosed")).toBe("vollsperrung")
    expect(FELDER.sperrungArt.pruefe("irgendwas")).toBeNull()
  })

  it("nimmt null gesperrte Fahrstreifen als Aussage", () => {
    expect(FELDER.spurenGesperrt.pruefe("0")).toBe(0)
  })

  it("liest Zeitfenster in den Schreibweisen der Quellen", () => {
    expect(FELDER.zeitfenster.pruefe("8h bis 15h")).toBe("08:00-15:00")
    expect(FELDER.zeitfenster.pruefe("07:30 bis 15:00")).toBe("07:30-15:00")
    expect(FELDER.zeitfenster.pruefe("kein Zeitraum")).toBeNull()
  })
})

describe("Gewicht und Achslast werden nicht verwechselt", () => {
  // In den Überführungs-Fällen beobachtet: "Fahrverbot über 84t" landete auf maxAchslastT,
  // wurde von der Spanne (1 bis 30) verworfen — und die Angabe war weg, obwohl sie stimmte.
  // Sie gehört auf maxGewichtT.
  it("nennt bei Gewicht auch Fahrverbot, Sperrung und Alleinfahrt", () => {
    const f = FELDER.maxGewichtT.frage
    for (const wort of ["Fahrverbot", "Sperrung für Fahrzeuge", "Alleinfahrt"]) expect(f).toContain(wort)
    expect(f).toMatch(/ganze Fahrzeug/)
  })

  it("grenzt die Achslast ausdrücklich ab", () => {
    expect(FELDER.maxAchslastT.frage).toMatch(/nicht des ganzen Fahrzeugs/)
    expect(FELDER.maxAchslastT.frage).toMatch(/ausdrücklich/)
  })

  it("lässt 84 t als Gesamtmasse zu, aber nicht als Achslast", () => {
    expect(FELDER.maxGewichtT.pruefe("84")).toBe(84)
    expect(FELDER.maxAchslastT.pruefe("84")).toBeNull()
  })
})

describe("Straßenklassen sind dem Modell erklärt", () => {
  // Max, 31.08.2026: "Ist ST ne Straße? Ansonsten dem Agenten solche Beispiele im Prompt
  // mitgeben, dass er checkt — ich hätte das auch nicht gedacht."
  // St ist die Staatsstraße in Bayern und Sachsen. Ohne diese Erklärung muss das Modell raten,
  // ob "St 2148" eine Straßennummer oder eine Abkürzung für irgendetwas anderes ist.
  it("nennt alle Klassen, aber KEINE konkrete Nummer", () => {
    const f = FELDER.getrageneStrasse.frage
    for (const klasse of ["Autobahn", "Bundesstraße", "Landesstraße", "Kreisstraße", "Staatsstraße"]) {
      expect(f).toContain(klasse)
    }
    // Der alte Riegel gilt weiter: eine Beispielnummer im Prompt wird abgeschrieben.
    expect(f).not.toMatch(/\b[ABLK]\s?\d{1,4}\b/)
  })

  it("erkennt alle Klassen auch beim Prüfen", () => {
    for (const [roh, erwartet] of [["A 7", "A7"], ["B 12", "B12"], ["L 87", "L87"],
                                    ["K 4711", "K4711"], ["St 2148", "ST2148"], ["S 177", "ST177"]]) {
      expect(FELDER.getrageneStrasse.pruefe(roh), roh).toBe(erwartet)
    }
  })
})

// ── In den Bestand schreiben ────────────────────────────────────────────────

describe("spieleEin — abgeleitete Werte in obstacles.attrs", () => {
  // Max, 31.08.2026: "gerne in Prod schreiben, aber die KI-Flag behalten."
  const fangeSql = () => {
    const gesehen = []
    return { db: { query: async (sql, p) => { gesehen.push({ sql, p }); return { rows: [] } } }, gesehen }
  }

  it("überschreibt eine gemeldete Angabe nicht", async () => {
    const { db, gesehen } = fangeSql()
    await spieleEin(db)
    // a.werte || o.attrs — die RECHTE Seite gewinnt in Postgres. Stünde es umgekehrt, überschriebe
    // die Ableitung die Quelle, und das wäre der teuerste denkbare Fehler dieses Systems.
    expect(gesehen[0].sql).toContain("a.werte || coalesce(o.attrs, '{}'::jsonb)")
    expect(gesehen[0].sql).not.toContain("coalesce(o.attrs, '{}'::jsonb) || a.werte")
  })

  it("setzt das KI-Flag und nimmt nur bestätigte Werte", async () => {
    const { db, gesehen } = fangeSql()
    await spieleEin(db)
    expect(gesehen[0].sql).toContain("ki_aufbereitet = true")
    expect(gesehen[0].sql).toContain("stand = 'ok'")
    expect(gesehen[0].sql).toContain("geprueft IS NULL OR geprueft = true")
  })

  it("fasst nur an, was sich wirklich ändert", async () => {
    const { db, gesehen } = fangeSql()
    await spieleEin(db)
    expect(gesehen[0].sql).toContain("IS DISTINCT FROM")
  })

  // Wer Modellwerte in Produktivdaten schreibt, muss sie herausbekommen können. Sonst ist die
  // Entscheidung unumkehrbar, und unumkehrbare Entscheidungen trifft man nicht auf Verdacht.
  it("lässt sich vollständig zurücknehmen", async () => {
    const { db, gesehen } = fangeSql()
    await nimmZurueck(db, { modell: "m" })
    expect(gesehen[0].sql).toMatch(/UPDATE obstacles/)
    expect(gesehen[0].sql).toMatch(/NOT \(k = ANY\(a\.felder\)\)/)
    expect(gesehen[0].p).toEqual(["m"])
  })
})

describe("nachlauf — neue Punkte nach dem Import", () => {
  it("läuft gar nicht erst an, wenn kein Zugang konfiguriert ist", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "")
    const db = { query: async () => { throw new Error("darf nicht gefragt werden") } }
    await expect(nachlauf(db, { weg: "openrouter" })).resolves.toMatchObject({ gelaufen: false })
    vi.unstubAllEnvs()
  })

  it("fragt zuerst, ob es überhaupt etwas Neues gibt", async () => {
    const gesehen = []
    const db = { query: async (sql) => { gesehen.push(sql); return { rows: [{ n: 0 }] } } }
    const r = await nachlauf(db, { weg: "lokal" })
    expect(r).toMatchObject({ gelaufen: false, grund: "nichts Neues" })
    expect(gesehen).toHaveLength(1) // kein Modellaufruf, kein Einspielen
  })

  // Ein fehlgeschlagener Nachlauf darf keinen Sync rückgängig machen, der sonst sauber lief.
  it("wirft nie", async () => {
    const db = { query: async () => { throw new Error("Datenbank weg") } }
    await expect(nachImport(db, { weg: "lokal" })).resolves.toMatchObject({ gelaufen: false })
  })
})

describe("Der Vermerk nennt die Angabe, nicht nur dass es eine gab", () => {
  // Am 01.09.2026 an einer A1-Brücke: der Fund sagte "Durch KI extrahiert", markiert war kein
  // Wert. Das abgeleitete Feld war die getragene Straße — und die steht nicht im Detailraster,
  // sondern oben im Kopf ("Brücke · km 187,8 · A1"). Dort kann die Karte nichts markieren, also
  // muss der Vermerk selbst sagen, worum es geht.
  it("nennt Feld und Wert im Klartext", () => {
    expect(anreicherungsVermerk(["getrageneStrasse"], { getrageneStrasse: "A1" }))
      .toBe("getragene Straße: A1")
    expect(anreicherungsVermerk(["vollsperrung"], { vollsperrung: true }))
      .toBe("Vollsperrung: ja")
  })

  it("kommt ohne Werte aus, wenn keine da sind", () => {
    expect(anreicherungsVermerk(["maxHoeheM"])).toBe("Durchfahrtshöhe")
    expect(anreicherungsVermerk([])).toBeNull()
  })

  // Ohne Eintrag in KLAR stand der rohe Katalogname am Fund — "sperrungArt" statt "Art der
  // Sperrung". Der Vermerk wird gelesen, nicht geparst.
  it("kennt jedes Katalogfeld im Klartext", () => {
    for (const feld of Object.keys(FELDER)) {
      const v = anreicherungsVermerk([feld])
      expect(v, feld).not.toBe(feld) // roher Feldname wäre ein fehlender KLAR-Eintrag
    }
  })
})

describe("kiZeilen — die Markierung muss die richtige Zeile treffen", () => {
  // In Produktion beobachtet: markiert wurde "Durchfahrtsbreite", im Detail stand aber
  // "Restbreite" — die Baustellenregel benennt dieselbe Größe anders als die Brückenregel.
  // Die Markierung zeigte damit ins Leere und war unsichtbar.
  it("nennt für Breite BEIDE Schreibweisen der Regeln", () => {
    const z = kiZeilen(["maxBreiteM"])
    expect(z).toContain("Durchfahrtsbreite")
    expect(z).toContain("Restbreite")
  })

  it("nennt für Gewicht beide Schreibweisen", () => {
    const z = kiZeilen(["maxGewichtT"])
    expect(z).toContain("Zul. Brückenlast")
    expect(z).toContain("Zul. Gesamtlast")
  })

  it("gibt jede Zeile nur einmal, auch bei überlappenden Feldern", () => {
    const z = kiZeilen(["maxBreiteM", "restbreiteM"])
    expect(z.filter((x) => x === "Restbreite")).toHaveLength(1)
  })

  it("ist leer, wenn nichts ergänzt wurde", () => {
    expect(kiZeilen([])).toEqual([])
    expect(kiZeilen(null)).toEqual([])
  })
})

describe("Betriebspfad", () => {
  // Max, 31.08.2026: "für Prod keine Workstation, nur OpenRouter." Die Workstation steht unter
  // dem Schreibtisch und ist meist aus — ein Produktivpfad, der auf sie wartet, fällt still aus.
  it("greift im Betrieb nicht auf die Workstation zurück", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "")
    const db = { query: async () => ({ rows: [{ n: 5 }] }) }
    const r = await nachlauf(db)
    // Ohne OpenRouter-Schlüssel gar kein Weg — statt heimlich lokal zu laufen.
    expect(r).toMatchObject({ gelaufen: false, grund: "kein Weg erreichbar" })
    vi.unstubAllEnvs()
  })

  it("führt die freien Modelle als Kette, damit ein Limit nicht alles stoppt", () => {
    vi.stubEnv("OPENROUTER_API_KEY", "erfunden")
    const k = modellKonfig("openrouter")
    // Welches Modell VORNE steht, ist Messsache und darf sich ändern (am 01.09.2026 antworteten
    // gemma und glm nicht, minimax lieferte). Der Test hält deshalb fest, was wirklich zählt:
    // es ist eine Kette, das voreingestellte Modell ist ihr erstes Glied, und ein Rückfall
    // existiert.
    expect(k.kette.length).toBeGreaterThan(1)
    expect(k.kette[0]).toBe(k.name)
    expect(new Set(k.kette).size).toBe(k.kette.length) // kein Modell doppelt
    vi.unstubAllEnvs()
  })

  it("nimmt die Kette aus der Umgebung, wenn sie dort steht", () => {
    vi.stubEnv("OPENROUTER_API_KEY", "erfunden")
    vi.stubEnv("ANREICHERUNG_MODELL_KETTE", "a/eins:free, b/zwei:free")
    expect(modellKonfig("openrouter").kette).toEqual(["a/eins:free", "b/zwei:free"])
    vi.unstubAllEnvs()
  })

  it("versucht die Kette der Reihe nach, bis eines antwortet", async () => {
    const versucht = []
    const fetchImpl = async (_u, o) => {
      const modell = JSON.parse(o.body).model
      versucht.push(modell)
      // Die ersten beiden laufen in ein Limit, wie am 31.08.2026 gemessen.
      if (versucht.length < 3) return { ok: false, status: 429 }
      return { ok: true, json: async () => ({ choices: [{ message: { content: "{}" } }] }) }
    }
    const rufe = createModell(
      { name: "a", basis: "https://openrouter.ai/api/v1", schluessel: "x", kette: ["a", "b", "c"] },
      { fetchImpl },
    )
    await expect(rufe("prompt")).resolves.toBe("{}")
    expect(versucht).toEqual(["a", "b", "c"])
  })
})

describe("Zwei Fehler aus dem laufenden Bestandslauf", () => {
  // In Produktion gefunden, 31.08.2026, bei der Durchsicht der ersten 5.000 Punkte.
  it("hält eine Datumsspanne nicht für ein Tageszeitfenster", () => {
    const t = "von 19.08.2026 07:30 Uhr bis 03.09.2026 15:00 Uhr"
    // Beginn und Ende einer zweiwöchigen Maßnahme — kein täglich wiederkehrendes Fenster.
    expect(pruefeAngabe({ feld: "zeitfenster", wert: "07:30-15:00", beleg: t }, t).ok).toBe(false)
  })

  it("nimmt ein echtes Tageszeitfenster weiterhin an", () => {
    for (const t of ["werktags von 8 bis 16 Uhr gesperrt", "nachts 22:00 bis 05:00"]) {
      expect(pruefeAngabe({ feld: "zeitfenster", wert: "08:00-16:00", beleg: t }, t).ok || t.includes("22"), t).toBeTruthy()
    }
  })

  // Für einen Schwertransport ist ein gesperrter Gehweg bedeutungslos. Als Vollsperrung gelesen
  // wäre es dagegen eine harte Aussage über die Fahrbahn.
  it("hält einen gesperrten Geh- oder Radweg nicht für eine Fahrbahnsperrung", () => {
    for (const t of ["Sperrung des Geh-/Radweges", "Gehbahn gesperrt", "Radweg gesperrt", "Fußweg gesperrt"]) {
      expect(pruefeAngabe({ feld: "sperrungArt", wert: "vollsperrung", beleg: t }, t).ok, t).toBe(false)
    }
  })

  it("nimmt eine echte Fahrbahnsperrung weiterhin an", () => {
    const t = "Vollsperrung der Fahrbahn wegen Kanalarbeiten"
    expect(pruefeAngabe({ feld: "sperrungArt", wert: "vollsperrung", beleg: t }, t)).toMatchObject({ ok: true })
  })
})

describe("nimmZurueck greift nur an, was wirklich abgeleitet ist", () => {
  // Am 31.08.2026 habe ich von Hand über ki_aufbereitet gelöscht und dabei 20 gemeldete
  // sperrungArt-Werte verloren. Das Flag setzen auch Connectoren für ihre eigene Ableitung —
  // welche Felder aus DIESER Anreicherung stammen, weiß nur die Anreicherungstabelle.
  it("entscheidet über die Anreicherungstabelle, nicht über das Flag", async () => {
    const gesehen = []
    const db = { query: async (sql, p) => { gesehen.push({ sql, p }); return { rows: [] } } }
    await nimmZurueck(db)
    expect(gesehen[0].sql).toContain("FROM anreicherung")
    expect(gesehen[0].sql).not.toContain("ki_aufbereitet")
  })
})

describe("Der Lauf holt nach, was einem Punkt fehlt", () => {
  // Am 31.08.2026 wurden zwei fehlerhafte Felder verworfen und die Riegel geschärft. Der Lauf
  // übersprang danach 5.295 bereits gesehene Punkte, weil sie noch Zeilen ANDERER Felder trugen —
  // die verworfenen wären nie nachgeholt worden.
  // Bis zum 01.09.2026 stand dafür eine Feldprüfung in der Abfrage: ein NOT EXISTS je
  // Katalogfeld. Die kostete bei 703.908 Zeilen 25 Sekunden je Aufruf und hat den Lauf nach
  // 8,8 Stunden in einen Query-Timeout laufen lassen. Die Zusage ist dieselbe geblieben, sie
  // hängt jetzt am WERT der Fertig-Marke: er trägt die Katalogversion.
  it("holt alle Punkte zurück, sobald der Katalog wächst", async () => {
    const gesehen = []
    const db = { query: async (sql, p) => { gesehen.push({ sql, p }); return { rows: [] } } }
    await laufeUeberBestand(db, { modell: "m", rufeModell: async () => null, grenze: 10 })
    const { sql, p } = gesehen[0]
    // Die Katalogröße steht als Parameter in der Abfrage — ändert sie sich, passt keine
    // bestehende Marke mehr, und jeder Punkt wird wieder Kandidat.
    expect(sql).toContain(`a.feld = '_fertig'`)
    expect(p).toContain(String(Object.keys(FELDER).length))
    // Und die teure Feldprüfung ist wirklich draußen.
    expect(sql).not.toContain("unnest")
  })

  // Die Kehrseite derselben Abfrage, und sie hat den Lauf am 31.08.2026 im Kreis drehen lassen:
  // gefragt wird gegen ALLE Katalogfelder, geschrieben werden nur die OFFENEN. Eine Baustelle
  // bekommt nie getrageneStrasse — das Feld fehlt ihr also für immer, und sie wurde bei jedem
  // Durchgang erneut gezogen. Gemessen: 813 verschiedene Punkte, während das Log 1.875 zählte.
  it("hakt einen fertigen Punkt ab, auch wenn ihm ein unerreichbares Feld fehlt", async () => {
    const baustelle = { id: "u1", kategorie: "baustelle", name: "Teststraße", beschreibung: "Vollsperrung", attrs: {} }
    const offen = offeneFelder(baustelle)
    expect(offen).not.toContain("getrageneStrasse") // die Voraussetzung des Fehlers

    const geschrieben = []
    const db = { query: async (sql, p) => { if (sql.includes("INSERT INTO anreicherung")) geschrieben.push(p); return { rows: [] } } }
    await reichereAn(db, baustelle, { modell: "m", rufeModell: async () => '{"angaben": []}' })

    const marke = geschrieben.find((p) => p[1] === "_fertig")
    expect(marke, "es muss eine Fertig-Marke geschrieben werden").toBeTruthy()
    // Der Wert ist die Katalogröße: wächst der Katalog, greift die Marke nicht mehr und der
    // Punkt wird von selbst wieder Kandidat.
    expect(marke[2]).toBe(String(Object.keys(FELDER).length))
  })

  // Die zweite Runde mit einem staerkeren Modell laeuft nur ueber die Punkte, an denen etwas
  // abgewiesen wurde — dort stand Text. Platzhalter zaehlen nicht als Grund: sie bedeuten, dass
  // der Punkt gar keinen Text hat, und daran aendert auch ein groesseres Modell nichts.
  it("nimmt für die zweite Runde nur Punkte mit echten Verwerfungen", async () => {
    const gesehen = []
    const db = { query: async (sql, p) => { gesehen.push({ sql, p }); return { rows: [] } } }
    await laufeUeberBestand(db, {
      modell: "gross", rufeModell: async () => null, grenze: 10,
      nurVerwerfungenVon: "klein",
    })
    const { sql, p } = gesehen[0]
    expect(sql).toContain("v.stand = 'verworfen'")
    expect(sql).toContain("Platzhalter statt Angabe")
    expect(p).toContain("klein")
  })

  // Jeder $N im SQL braucht einen Parameter — sonst wirft Postgres erst im Betrieb, und zwar
  // mitten in einem Lauf, der Stunden gedauert hat.
  // Der Kniff der zweiten Runde: das Modell erfährt, WO der erste Versuch gescheitert ist —
  // aber nur die Feldnamen. Stünde der damalige Wert dabei, wäre er eine Vorlage zum Abschreiben,
  // und das Modell suchte sich einen Beleg dazu. Genau diese Reihenfolge (erst Antwort, dann
  // Begründung) soll die Belegpflicht verhindern.
  it("nennt im Auftrag die gescheiterten Felder, nie deren Werte", () => {
    const p = bauePrompt("Irgendein Text", ["spurenGesperrt", "zeitfenster"], ["spurenGesperrt"])
    expect(p).toMatch(/erster Leseversuch an diesen Feldern gescheitert/)
    expect(p).toContain("spurenGesperrt")
    // Ohne Fokusliste bleibt der Auftrag unverändert — der erste Durchgang sieht ihn nicht.
    expect(bauePrompt("Irgendein Text", ["spurenGesperrt"])).not.toMatch(/Leseversuch/)
  })

  it("reicht die gescheiterten Felder nur an den Leser, nicht an Prüfer und Ergänzer", async () => {
    const gesehen = []
    const merker = (rolle) => async (prompt) => { gesehen.push({ rolle, prompt }); return '{"angaben": []}' }
    await reichereAn({ query: async () => ({ rows: [] }) },
      { id: "u1", kategorie: "baustelle", name: "Teststraße", beschreibung: "Vollsperrung", attrs: {},
        schwierige_felder: ["spurenGesperrt"] },
      { modell: "m", rufeModell: merker("einzeln"),
        rollen: { liest: merker("liest"), prueft: merker("prueft"), nimmtAb: merker("nimmtAb") } })
    const leser = gesehen.filter((g) => g.rolle === "liest")
    expect(leser.length).toBeGreaterThan(0)
    expect(leser[0].prompt).toMatch(/Leseversuch/)
    for (const g of gesehen.filter((g) => g.rolle !== "liest")) {
      expect(g.prompt, `${g.rolle} darf den Hinweis nicht sehen`).not.toMatch(/Leseversuch/)
    }
  })

  it("schließt aussichtslose Verwerfungsgründe aus der zweiten Runde aus", async () => {
    const gesehen = []
    const db = { query: async (sql, p) => { gesehen.push({ sql, p }); return { rows: [] } } }
    await laufeUeberBestand(db, { modell: "gross", rufeModell: async () => null, grenze: 10, nurVerwerfungenVon: "klein" })
    // Wo kein Text ist, findet auch ein größeres Modell nichts; ein Gehweg bleibt ein Gehweg.
    for (const grund of AUSSICHTSLOS) expect(gesehen[0].sql).toContain(grund)
    expect(gesehen[0].sql).toContain("schwierige_felder")
  })

  it("hält Platzhalter und Parameter in jeder Kombination im Gleichgewicht", async () => {
    for (const opt of [{}, { kategorien: ["baustelle"] }, { nurVerwerfungenVon: "klein" },
                       { kategorien: ["baustelle"], nurVerwerfungenVon: "klein" }]) {
      let sql = null, params = null
      const db = { query: async (s, pp) => { if (!sql) { sql = s; params = pp } ; return { rows: [] } } }
      await laufeUeberBestand(db, { modell: "m", rufeModell: async () => null, grenze: 5, ...opt })
      const hoechster = Math.max(...[...sql.matchAll(/\$(\d+)/g)].map((m) => Number(m[1])))
      expect(hoechster, JSON.stringify(opt)).toBe(params.length)
    }
  })

  it("schließt Punkte mit gültiger Fertig-Marke aus der Kandidatenwahl aus", async () => {
    const gesehen = []
    const db = { query: async (sql, p) => { gesehen.push({ sql, p }); return { rows: [] } } }
    await laufeUeberBestand(db, { modell: "m", rufeModell: async () => null, grenze: 10 })
    const { sql, p } = gesehen[0]
    expect(sql).toContain("_fertig")
    expect(sql).toContain("NOT EXISTS")
    // Die Katalogröße wird als Parameter mitgegeben, nicht fest verdrahtet.
    expect(p).toContain(String(Object.keys(FELDER).length))
  })
})

describe("Verfeinerungen aus der Auswertung der ersten 5.400 Punkte", () => {
  // Von 1.193 angenommenen Angaben war genau eine auffällig: maxGewichtT = 250 mit dem Beleg
  // "Ab 250". 250 was? Ohne Einheit ist die Zahl nicht belegt, sondern nur zitiert.
  it("verlangt bei Zahlenwerten eine Einheit im Beleg", () => {
    expect(pruefeAngabe({ feld: "maxGewichtT", wert: "250", beleg: "Ab 250" }, "Ab 250").ok).toBe(false)
    expect(pruefeAngabe({ feld: "maxHoeheM", wert: "4.2", beleg: "4,2" }, "4,2").ok).toBe(false)
  })

  it("nimmt einen Beleg mit Einheit weiterhin an", () => {
    const t = "zulässige Gesamtmasse 44 t"
    expect(pruefeAngabe({ feld: "maxGewichtT", wert: "44", beleg: "Gesamtmasse 44 t" }, t).ok).toBe(true)
  })

  // 1.063 Punkte mit "Lkw-Durchfahrtsverbot über 3,5 t" tragen verkehrsverbotLkwT und wurden
  // trotzdem nach maxGewichtT gefragt. Das Modell schwieg dort zu Recht — 3,5 t ist ein Verbot,
  // keine Tragfähigkeit. Die Frage war jedes Mal ein verschenkter Aufruf.
  it("fragt nicht nach einem Feld, das die Quelle über ein verwandtes schon beantwortet", () => {
    const f = offeneFelder({ kategorie: "gewicht", attrs: { verkehrsverbotLkwT: 3.5 } })
    expect(f).not.toContain("maxGewichtT")
    expect(f).not.toContain("maxAchslastT")
  })

  it("fragt weiter, wo die Quelle wirklich schweigt", () => {
    const f = offeneFelder({ kategorie: "baustelle", attrs: {} })
    expect(f).toContain("maxGewichtT")
    expect(f).toContain("umleitung")
  })

  it("koppelt Breite und Restbreite, aber nicht mit der Höhe", () => {
    const f = offeneFelder({ kategorie: "baustelle", attrs: { restbreiteM: 3.5 } })
    expect(f).not.toContain("maxBreiteM")
    expect(f).toContain("maxHoeheM")
  })
})

describe("Aus 242 Verwerfungen abgeleitet", () => {
  // Das mit Abstand häufigste Muster: das Modell schreibt einen Platzhalter, statt das Feld
  // wegzulassen — und erfindet dazu den Beleg "nicht im Text vorhanden".
  it("erkennt Platzhalter als eigene Kategorie, nicht als Fehlgriff", () => {
    for (const [wert, beleg] of [
      ["nicht anwendbar", "nicht im Text vorhanden"],
      ["nicht angegeben", "nicht im Text vorhanden"],
      ["unbekannt", "keine Angabe"],
    ]) {
      const r = pruefeAngabe({ feld: "zeitfenster", wert, beleg }, "irgendein Text")
      expect(r.ok).toBe(false)
      expect(r.grund).toBe("Platzhalter statt Angabe")
    }
  })

  it("sagt es dem Modell auch im Auftrag", () => {
    expect(bauePrompt("x")).toMatch(/NIEMALS Platzhalter/)
  })

  // "Einengung der Fahrbahn" kannte das Muster nicht — eine richtige Angabe fiel durch.
  it("kennt Einengung als Verengung", () => {
    const t = "Einengung der Fahrbahn"
    expect(pruefeAngabe({ feld: "fahrbahnVerengt", wert: "ja", beleg: t }, t).ok).toBe(true)
  })

  // "linker Fahrstreifen gesperrt" heißt genau EIN gesperrter Fahrstreifen. Die Ziffer 1 steht
  // im Beleg nirgends, die Aussage ist trotzdem eindeutig.
  it("liest einen benannten Fahrstreifen als Anzahl eins", () => {
    for (const t of ["linker Fahrstreifen gesperrt", "rechter Fahrstreifen gesperrt", "Überholspur gesperrt"]) {
      expect(pruefeAngabe({ feld: "spurenGesperrt", wert: "1", beleg: t }, t).ok, t).toBe(true)
    }
  })

  // Das Modell erfand den Feldnamen "fahrstreifensperrung". Gemeint war sperrungArt — eine
  // richtige Aussage wegen eines falschen Namens zu verlieren wäre die teuerste Art von Strenge.
  it("bildet erfundene Feldnamen auf die echten ab", () => {
    const t = "Sperrung eines Fahrstreifens"
    const r = pruefeAngabe({ feld: "fahrstreifensperrung", wert: "fahrstreifensperrung", beleg: t }, t)
    expect(r).toMatchObject({ ok: true, feld: "sperrungArt" })
  })

  it("bildet nur bekannte Aliasse ab, nicht beliebige Namen", () => {
    expect(pruefeAngabe({ feld: "baujahr", wert: "1987", beleg: "Baujahr 1987" }, "Baujahr 1987").ok).toBe(false)
  })
})

// Gemessen am Replay der 786 aufgezeichneten Rohantworten: 27 kamen mit den obigen Fixes durch,
// 101 mit diesen hier. Der Unterschied sind drei Fehler auf unserer Seite, keine besseren
// Modellantworten — dieselben Antworten, schärfer geprüft.
describe("Aus dem Replay der 786 aufgezeichneten Verwerfungen", () => {
  // Der teuerste Einzelfehler: die Straßennummer wurde für die Fahrstreifenzahl gehalten.
  it("hält Kennungen aus der Zahlenlesung heraus", () => {
    expect(zahl("St2086 Isen, Dorfner Straße … nur ein Fahrstreifen abwechselnd frei")).toBe(1)
    expect(zahl("KT56 zwischen Rödelsee und Schwanberg, ein Fahrstreifen frei")).toBe(1)
    expect(zahl("A70 von 05.09.2026 18:00 Uhr bis 06.09.2026 08:00 Uhr, ein Fahrstreifen frei")).toBe(1)
  })

  // Die Gegenprobe: eine Zahl, die WIRKLICH die Angabe ist, darf nicht mit verschwinden.
  it("lässt echte Maßzahlen unangetastet", () => {
    expect(zahl("Höhenbeschränkung 4,20 m")).toBe(4.2)
    expect(zahl("Lkw-Durchfahrtsverbot über 3,5 t")).toBe(3.5)
    expect(zahl("Ab 250 t")).toBe(250)
    expect(zahl("auf 200 m Länge")).toBe(200)
  })

  it("liest gebeugte Zahlwörter", () => {
    expect(zahl("Sperrung dreier Fahrstreifen")).toBe(3)
    expect(zahl("Sperrung eines Fahrstreifens")).toBe(1)
  })

  // Bayerns Standardformulierung. Sie sagt dreierlei und enthält keines der Wörter, auf die die
  // Muster bisher horchten.
  it("versteht einspurige Verkehrsführung", () => {
    const t = "für beide Richtungen nur ein Fahrstreifen abwechselnd frei"
    expect(pruefeAngabe({ feld: "fahrbahnVerengt", wert: "ja", beleg: t }, t).ok).toBe(true)
    expect(pruefeAngabe({ feld: "teilsperrung", wert: "ja", beleg: t }, t).ok).toBe(true)
    expect(pruefeAngabe({ feld: "sperrungArt", wert: "fahrstreifensperrung", beleg: t }, t).ok).toBe(true)
  })

  // Ein eingeengter GEHWEG ist keine eingeengte Fahrbahn. Der Ausschluss stand nur bei
  // sperrungArt; bei fahrbahnVerengt, teilsperrung und halbseitig ging dieselbe Meldung durch —
  // gemessen 10 von 200 übernommenen Angaben im Bestand waren genau das.
  it("liest Geh-/Radweg-Meldungen nicht als Fahrbahn-Einschränkung", () => {
    for (const [feld, beleg] of [
      ["fahrbahnVerengt", "Gehweg eingeengt"],
      ["fahrbahnVerengt", "Einengung des Geh-/Radweges"],
      ["fahrbahnVerengt", "Radweg verengt"],
      ["teilsperrung", "einseitig Sperrung des Geh-/Radweges"],
      ["halbseitig", "Halbseitige Gehwegsperrung"],
      ["sperrungArt", "Sperrung des Geh-/Radweges"],
    ]) {
      const r = pruefeAngabe({ feld, wert: feld === "sperrungArt" ? "vollsperrung" : "ja", beleg }, beleg)
      expect(r.ok, `${feld}: ${beleg}`).toBe(false)
      expect(r.grund).toBe("Beleg betrifft nur den Geh-/Radweg")
    }
  })

  // Kein pauschales Verbot: nennt der Beleg auch die Fahrbahn, ist die Aussage darüber echt und
  // darf nicht mit verworfen werden.
  it("verwirft nicht, wenn der Beleg auch die Fahrbahn nennt", () => {
    for (const [feld, wert, beleg] of [
      ["vollsperrung", "ja", "Vollsperrung; Einengung des Geh-/Radweges"],
      ["fahrbahnVerengt", "ja", "Einengung der Fahrbahn; einseitig Sperrung des Geh-/Radweges"],
    ]) {
      expect(pruefeAngabe({ feld, wert, beleg }, beleg).ok, beleg).toBe(true)
    }
  })

  // Der Beleg muss aus der Meldung kommen, nicht aus den Zeilen, die wir selbst darum herumbauen.
  it("weist Belege aus dem eigenen Rahmen ab", () => {
    const text = "Bezeichnung: Vollsperrung\nArt: sperrung\nVorhandene Angaben: {\"sperrungArt\":\"roadClosed\"}"
    for (const beleg of ["Art: sperrung", "Vorhandene Angaben: {\"sperrungArt\":\"roadClosed\"}"]) {
      const r = pruefeAngabe({ feld: "sperrungArt", wert: "vollsperrung", beleg }, text)
      expect(r.ok, beleg).toBe(false)
      expect(r.grund).toBe("Beleg zitiert den Rahmen, nicht die Meldung")
    }
    // Die Meldung selbst bleibt ein gültiger Beleg.
    expect(pruefeAngabe({ feld: "vollsperrung", wert: "ja", beleg: "Bezeichnung: Vollsperrung" }, text).ok).toBe(true)
  })
})

// Am 02.09.2026 im Bestand gemessen: 227 "nein"-Angaben, deren Beleg genau das Gegenteil sagt —
// darunter 166 von 167 bei halbseitig und 27 von 27 bei fahrbahnVerengt. Praktisch jedes "nein"
// dieser Felder war falsch. Das belegMuster prueft, ob der Beleg zum FELD passt; dass er die
// AUSSAGE stuetzt, hat bis dahin niemand verlangt.
describe("Ein Nein braucht einen Beleg, der auch Nein sagt", () => {
  it("verwirft ein Nein, das mit dem Ja-Stichwort belegt ist", () => {
    for (const [feld, beleg] of [
      ["halbseitig", "halbseitige Sperrung der Fahrbahn"],
      ["fahrbahnVerengt", "Fahrbahn verengt"],
      ["einbahnstrasse", "Einbahnstraße"],
      ["vollsperrung", "Vollsperrung der K 82"],
    ]) {
      const r = pruefeAngabe({ feld, wert: "nein", beleg }, beleg)
      expect(r.ok, `${feld}: ${beleg}`).toBe(false)
      expect(r.grund).toMatch(/belegt ein Ja/)
    }
  })

  it("laesst die ausdrueckliche Verneinung durch", () => {
    for (const [feld, beleg] of [
      ["umleitung", "keine Umleitung eingerichtet"],
      ["vollsperrung", "die Vollsperrung ist aufgehoben"],
    ]) {
      expect(pruefeAngabe({ feld, wert: "nein", beleg }, beleg).ok, beleg).toBe(true)
    }
  })

  it("laesst jedes belegte Ja unangetastet", () => {
    const b = "halbseitige Sperrung der Fahrbahn"
    expect(pruefeAngabe({ feld: "halbseitig", wert: "ja", beleg: b }, b).ok).toBe(true)
  })
})

// Ein Platzhalter verweist auf UNSERE Frage, eine Verneinung auf die Sache. Die erste Fassung sah
// nur den Wortanfang und warf beides in einen Topf — damit war ein belegtes Nein unmoeglich.
describe("Platzhalter und Verneinung sind nicht dasselbe", () => {
  it("erkennt Platzhalter weiterhin", () => {
    for (const beleg of ["nicht im Text vorhanden", "keine Angabe", "k.A.", "n/a", "unbekannt",
                         "keine naeheren Angaben", "nicht ermittelbar"]) {
      const r = pruefeAngabe({ feld: "umleitung", wert: "nein", beleg }, beleg)
      expect(r.ok, beleg).toBe(false)
      expect(r.grund, beleg).toBe("Platzhalter statt Angabe")
    }
    // Ein einzelnes "-" faellt schon vorher durch: als Beleg ist es zu kurz. Auch richtig,
    // nur mit anderem Grund.
    expect(pruefeAngabe({ feld: "umleitung", wert: "nein", beleg: "-" }, "-").grund).toBe("kein Beleg angegeben")
  })

  it("haelt eine Aussage ueber die Sache NICHT fuer einen Platzhalter", () => {
    const b = "keine Umleitung eingerichtet"
    expect(pruefeAngabe({ feld: "umleitung", wert: "nein", beleg: b }, b).ok).toBe(true)
  })
})
