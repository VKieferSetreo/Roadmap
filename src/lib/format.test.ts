// Erster Frontend-Test des Projekts (T-733) — bewusst an der kleinsten Stelle, damit er die
// Einrichtung beweist, bevor die schwereren Komponententests darauf aufbauen.
//
// fundeText ist der Fall aus T-688: im Export-Dialog stand "1 Funde im Export", obwohl die
// Hilfsfunktion genau dafür gebaut und zwei Zeilen höher schon benutzt wurde. Ein Ein-Zeilen-Test
// hätte das gehalten.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import {
  formatBytes,
  formatDateDE,
  formatRelativeDE,
  formatStampDE,
  fundeText,
} from "./format"

describe("fundeText", () => {
  it("setzt den Singular bei genau einem Fund", () => {
    expect(fundeText(1)).toBe("1 Fund")
  })

  it("setzt den Plural bei allem anderen — auch bei null", () => {
    expect(fundeText(0)).toBe("0 Funde")
    expect(fundeText(2)).toBe("2 Funde")
    expect(fundeText(3366)).toBe("3366 Funde")
  })
})

// ── Zeitangaben (T-734) ───────────────────────────────────────────────────────
//
// Erweiterung um die Datums-Texte, die der Kunde tatsächlich zu sehen bekommt. Bis hierher hing
// von format.ts genau ein Ein-Zeilen-Test (fundeText), obwohl an diesen Funktionen der
// „Letzter Stand"-Text im Kopf (HeaderSync), die Kachel-Zeile jeder Projektliste (ProjectCard)
// und das Berichtsdatum im PDF (ReportView) hängen.
//
// Feste Systemzeit, weil „heute"/„gestern" sonst vom Tag des Testlaufs abhängen — ein Test, der
// um Mitternacht kippt, ist kein Test. Alle Eingaben stehen in LOKALER Zeit (kein Z am Ende),
// damit das Ergebnis nicht von der Zeitzone der Maschine abhängt.
describe("formatStampDE — Letzter Stand im Kopf und im Reiter Anlage", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 8, 7, 12, 0, 0)) // Montag, 07.09.2026, 12:00 Uhr
  })
  afterEach(() => vi.useRealTimers())

  // Der Worker läuft 8/12/18 Uhr; „noch nie" ist der Zustand vor dem ersten Lauf und im
  // Quellen-Register der Text für eine Quelle ohne Abruf. Ein leerer Text an dieser Stelle sähe
  // aus wie ein Ladefehler.
  it("sagt noch nie, wenn es keinen Stand gibt", () => {
    expect(formatStampDE(null)).toBe("noch nie")
    expect(formatStampDE(undefined)).toBe("noch nie")
    expect(formatStampDE("")).toBe("noch nie")
  })

  it("nennt bei einem Stand von heute die Uhrzeit statt des Datums", () => {
    expect(formatStampDE("2026-09-07T08:03:00")).toBe("heute, 08:03 Uhr")
  })

  it("unterscheidet gestern von heute", () => {
    expect(formatStampDE("2026-09-06T18:02:00")).toBe("gestern, 18:02 Uhr")
  })

  it("schreibt bei älteren Ständen Tag und Monat davor", () => {
    expect(formatStampDE("2026-09-01T08:00:00")).toBe("01.09., 08:00 Uhr")
  })
})

// ProjectCard schreibt damit „Aktualisiert …" unter jeden Projektnamen. Gemessen am 07.09.2026:
// von 82 Projekten standen 2 auf „gestern" und 80 auf einem älteren Stand, der älteste vom
// 18.06.2026 — die relative Angabe ist also der Normalfall, nicht die Ausnahme.
describe("formatRelativeDE — Aktualisiert-Zeile der Projektkachel", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 8, 7, 12, 0, 0))
  })
  afterEach(() => vi.useRealTimers())

  it("hängt bei heute und gestern die Uhrzeit an — die Frage ist WANN heute", () => {
    expect(formatRelativeDE("2026-09-07T14:05:00")).toBe("heute, 14:05")
    expect(formatRelativeDE("2026-09-06T18:02:00")).toBe("gestern, 18:02")
  })

  // Bewusste Ausnahme im Code: 00:00 ist ein reines Datum ohne Zeitanteil. Ein angehängtes
  // „, 00:00" würde eine Uhrzeit behaupten, die in den Daten gar nicht steht.
  it("lässt bei einem reinen Datum ohne Zeitanteil die Uhrzeit weg", () => {
    expect(formatRelativeDE("2026-09-07")).toBe("heute")
  })

  it("sagt morgen ohne Uhrzeit", () => {
    expect(formatRelativeDE("2026-09-08T09:00:00")).toBe("morgen")
  })

  it("zählt weiter entfernte Tage in beide Richtungen", () => {
    expect(formatRelativeDE("2026-09-12T09:00:00")).toBe("in 5 Tagen")
    expect(formatRelativeDE("2026-09-02T09:00:00")).toBe("vor 5 Tagen")
    // Der gemessene älteste Projektstand (18.06.2026) — 81 Tage vor dem gesetzten Testtag.
    expect(formatRelativeDE("2026-06-18T20:17:06")).toBe("vor 81 Tagen")
  })
})

// Berichtsdatum, Daten-Stand und Export-Zeitraum im PDF (ReportView) — das Dokument, das der
// Kunde weitergibt. Eine amerikanische Reihenfolge wäre dort ein Fehler mit Rechtsfolge.
describe("formatDateDE — Datum im Kundenbericht", () => {
  it("schreibt Tag.Monat.Jahr, nicht Monat/Tag", () => {
    expect(formatDateDE("2026-09-07")).toBe("07.09.2026")
    expect(formatDateDE(new Date(2026, 8, 7, 14, 5))).toBe("07.09.2026")
  })

  it("schneidet die Uhrzeit eines Zeitstempels ab", () => {
    expect(formatDateDE("2026-12-24T23:59:00")).toBe("24.12.2026")
  })
})

// DropZone beschriftet damit die Obergrenze („max. 50 MB", Vorgabe maxSizeMb = 50).
describe("formatBytes — Größenangabe im Upload-Feld", () => {
  it("beschriftet die 50-MB-Grenze der Upload-Fläche", () => {
    expect(formatBytes(50 * 1024 * 1024)).toBe("50.0 MB")
  })

  it("wechselt die Einheit erst ab der vollen 1024er-Stufe", () => {
    expect(formatBytes(512)).toBe("512 B")
    expect(formatBytes(1023)).toBe("1023 B")
    expect(formatBytes(1024)).toBe("1.0 KB")
    expect(formatBytes(1024 * 1024)).toBe("1.0 MB")
    expect(formatBytes(1024 * 1024 * 1024)).toBe("1.00 GB")
  })

  it("rundet auf eine Nachkommastelle, statt die Zahl auszuschreiben", () => {
    expect(formatBytes(1536)).toBe("1.5 KB")
    expect(formatBytes(2.5 * 1024 * 1024 * 1024)).toBe("2.50 GB")
  })
})
