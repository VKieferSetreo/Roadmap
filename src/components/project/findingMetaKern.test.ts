// Kern von findingMeta.ts: die vier Stellen, an denen die Mutationsprobe der letzten Runde
// zeigte, dass die GESAMTE Suite grün blieb, obwohl echtes Verhalten kaputt war (T-734).
//
//   visibleFindings/hiddenFindings — Filter invertiert  → grün geblieben
//   imExportZeitraum               — gab bedingungslos true zurück → grün geblieben
//   katMeta                        — ?? FALLBACK_KAT_META entfernt → grün geblieben
//   formatGueltigkeit              — „Ab/am" auf „Ab" verkürzt → grün geblieben
//
// EIGENE DATEI, nicht findingMeta.test.ts: dort liegt die Anzeige-Logik der Fund-Details
// (sichtbaresDetail/attrEntries, T-664). Hier liegt das, was ZÄHLT und ENTSCHEIDET — Karte,
// Dashboard, Export und PDF hängen an genau diesen vier Funktionen.
//
// Alle Zahlen in den Kommentaren sind am 07.09.2026 gegen die Produktionsdatenbank gemessen
// (nur SELECT), nicht geschätzt.

import { describe, it, expect } from "vitest"
import type { Finding, FindingKategorie } from "@/types/domain"
import {
  visibleFindings,
  hiddenFindings,
  imExportZeitraum,
  katMeta,
  KATEGORIE_META,
  FALLBACK_KAT_META,
  formatGueltigkeit,
} from "./findingMeta"

/** Ein Fund, wie ihn GET /api/projects/:id liefert; gesetzt wird nur, worauf der Fall zielt. */
function fund(over: Partial<Finding> & { id: string }): Finding {
  return {
    kategorie: "baustelle",
    titel: `Fund ${over.id}`,
    beschreibung: "",
    lat: 53.5,
    lng: 10.0,
    km: 0,
    severity: "warnung",
    detail: {},
    ...over,
  }
}

// ── (a) visibleFindings / hiddenFindings ──────────────────────────────────────
//
// Die Basis ALLER Fundzählungen: ProjectCard (Kachel-Zähler), DashboardTab (Aggregate, Donut,
// Liste, Charts), KarteTab (Marker + „läuft ohne Ergebnis"), ExportDialog (Vorschau-Zahlen) und
// ReportView (PDF) rufen visibleFindings als ERSTEN Schritt auf. Kippt der Filter, zählt das
// ganze Produkt falsch — und zwar still, weil eine Zahl auch dann plausibel aussieht, wenn sie
// die falsche ist.
//
// Gemessen am 07.09.2026: 83 ausgeblendete Funde in 23 der 82 Projekte, bei 3.324 Funden
// insgesamt. Das schärfste Projekt hat 20 Funde, davon 9 ausgeblendet — invertiert stünden dort
// 9 statt 11, und die 11 echten Funde wären aus Karte, Dashboard und PDF verschwunden.
describe("visibleFindings / hiddenFindings (T-734)", () => {
  const funde = [
    fund({ id: "a" }), // kein hidden-Feld: der Normalfall aus der API — 3.241 der 3.324 Funde
    fund({ id: "b", hidden: true, hiddenGrund: "nicht_relevant" }),
    fund({ id: "c", hidden: false }),
    fund({ id: "d", hidden: true, hiddenGrund: "falsche_fahrbahn" }),
  ]

  it("gibt genau die NICHT ausgeblendeten Funde zurück", () => {
    expect(visibleFindings(funde).map((f) => f.id)).toEqual(["a", "c"])
  })

  it("gibt unter hiddenFindings genau die ausgeblendeten zurück", () => {
    expect(hiddenFindings(funde).map((f) => f.id)).toEqual(["b", "d"])
  })

  // Der Fund ohne hidden-Feld ist der Regelfall (nur 83 von 3.324 tragen es). Wer die Prüfung
  // auf `f.hidden === false` umstellt, verliert 97,5 Prozent des Bestands aus der Anzeige.
  it("behandelt einen Fund ohne hidden-Feld als sichtbar", () => {
    expect(visibleFindings([fund({ id: "ohne" })]).map((f) => f.id)).toEqual(["ohne"])
    expect(hiddenFindings([fund({ id: "ohne" })])).toEqual([])
  })

  // NICHTS VERSCHWINDEN LASSEN: die beiden Listen sind eine Zerlegung, kein Filterpaar mit
  // Lücke. Jeder Fund steht in genau einer von beiden — sonst fällt er aus Aggregat UND
  // Ausgeblendet-Liste heraus und ist für den Kunden nicht mehr auffindbar.
  it("teilt den Bestand vollständig und überschneidungsfrei auf", () => {
    const sichtbar = visibleFindings(funde).map((f) => f.id)
    const versteckt = hiddenFindings(funde).map((f) => f.id)
    expect([...sichtbar, ...versteckt].sort()).toEqual(["a", "b", "c", "d"])
    expect(sichtbar.filter((id) => versteckt.includes(id))).toEqual([])
  })

  // Der gemessene Extremfall (Projekt mit 20 Funden, 9 davon ausgeblendet). Die Zahl, die der
  // Disponent auf der Kachel liest, ist 11 — nicht 9 und nicht 20.
  it("zählt das gemessene Projekt mit 20 Funden auf 11 sichtbare und 9 ausgeblendete", () => {
    const zwanzig = [
      ...Array.from({ length: 11 }, (_, i) => fund({ id: `s${i}` })),
      ...Array.from({ length: 9 }, (_, i) => fund({ id: `h${i}`, hidden: true })),
    ]
    expect(visibleFindings(zwanzig)).toHaveLength(11)
    expect(hiddenFindings(zwanzig)).toHaveLength(9)
  })

  it("verträgt ein Projekt ganz ohne Funde", () => {
    expect(visibleFindings([])).toEqual([])
    expect(hiddenFindings([])).toEqual([])
  })
})

// ── (b) imExportZeitraum ──────────────────────────────────────────────────────
//
// Filtert im Export-Dialog, im Dashboard-Export und im PDF (ReportView) auf das gewählte
// Transport-Zeitfenster — der Fall „Teiltransport, der nur einen Datumsabschnitt der Strecke
// betrachtet". Gibt die Funktion bedingungslos true zurück, steht im Bericht wieder alles drin,
// und der Kunde plant um Baustellen herum, die zu seinem Termin längst weg sind.
//
// Gemessen am 07.09.2026 über 77.280 aktive Hindernisse: 42.270 (54,7 Prozent) sind PERMANENT
// (weder Von noch Bis) und müssen in jedem Fenster gelten, 34.532 tragen beide Grenzen,
// 276 nur einen Start, 202 nur ein Ende. 382 aktive Hindernisse haben ein Ende in der
// Vergangenheit, 3.113 beginnen erst in über 30 Tagen — das sind die Funde, die ein gesetztes
// Fenster herausnehmen muss.
describe("imExportZeitraum (T-734)", () => {
  const permanent = fund({ id: "p" }) // Brücke/Höhenlimit: gilt ohne Datum
  const baustelle = (von: string, bis: string) => fund({ id: "b", gueltigVon: von, gueltigBis: bis })

  it("nimmt ohne gesetztes Fenster jeden Fund mit", () => {
    expect(imExportZeitraum(permanent, "", "")).toBe(true)
    expect(imExportZeitraum(baustelle("2020-01-01", "2020-01-31"), "", "")).toBe(true)
  })

  // Die 42.270 permanenten Hindernisse — lastbeschränkte Brücken, Höhenlimits. Sie betreffen
  // jeden Transport, unabhängig vom Datum, und dürfen ein Zeitfenster nie herausfiltern.
  it("behält permanente Funde ohne Gültigkeit in jedem Fenster", () => {
    expect(imExportZeitraum(permanent, "2026-09-01", "2026-09-07")).toBe(true)
  })

  it("nimmt einen Fund heraus, der erst nach dem Fenster beginnt", () => {
    expect(imExportZeitraum(baustelle("2026-10-01", "2026-10-31"), "2026-09-01", "2026-09-30")).toBe(
      false,
    )
  })

  it("nimmt einen Fund heraus, der schon vor dem Fenster endet", () => {
    expect(imExportZeitraum(baustelle("2026-07-01", "2026-08-31"), "2026-09-01", "2026-09-30")).toBe(
      false,
    )
  })

  it("behält einen Fund, dessen Zeitraum das Fenster überschneidet", () => {
    expect(imExportZeitraum(baustelle("2026-08-15", "2026-09-15"), "2026-09-01", "2026-09-30")).toBe(
      true,
    )
  })

  // Die Kanten gehören dazu: ein Fund, der am letzten Fenstertag beginnt (oder am ersten endet),
  // trifft den Transport noch. Ein „>=" statt „>" würde genau diesen Tag verschlucken.
  it("behält einen Fund, der am letzten Fenstertag beginnt", () => {
    expect(imExportZeitraum(baustelle("2026-09-30", "2026-10-20"), "2026-09-01", "2026-09-30")).toBe(
      true,
    )
  })

  it("behält einen Fund, der am ersten Fenstertag endet", () => {
    expect(imExportZeitraum(baustelle("2026-08-01", "2026-09-01"), "2026-09-01", "2026-09-30")).toBe(
      true,
    )
  })

  // Halboffene Fenster: der Dialog lässt beide Felder einzeln leer. Eine leere Grenze heißt
  // „offen", nicht „heute".
  it("prüft bei offenem Ende nur den Anfang", () => {
    expect(imExportZeitraum(baustelle("2020-01-01", "2020-12-31"), "2026-09-01", "")).toBe(false)
    expect(imExportZeitraum(baustelle("2030-01-01", "2030-12-31"), "2026-09-01", "")).toBe(true)
  })

  it("prüft bei offenem Anfang nur das Ende", () => {
    expect(imExportZeitraum(baustelle("2030-01-01", "2030-12-31"), "", "2026-09-30")).toBe(false)
    expect(imExportZeitraum(baustelle("2020-01-01", "2020-12-31"), "", "2026-09-30")).toBe(true)
  })

  // Die 276 Hindernisse mit Start ohne Ende (158 Gewicht, 78 Sperrung, 21 Baustelle, 10
  // Engstelle, 9 Brücke): offenes Ende heißt „läuft weiter", nicht „schon vorbei".
  it("behandelt einen Fund mit Start ohne Ende als laufend", () => {
    expect(imExportZeitraum(fund({ id: "o", gueltigVon: "2026-01-01" }), "2026-09-01", "2026-09-30")).toBe(
      true,
    )
    expect(imExportZeitraum(fund({ id: "o", gueltigVon: "2027-01-01" }), "2026-09-01", "2026-09-30")).toBe(
      false,
    )
  })

  // Der Vergleich läuft TAGGENAU (tag() schneidet auf YYYY-MM-DD). Die API liefert heute schon
  // geschnittene Datumswerte (server/src/map.js → toIsoDate), deshalb ist das der Gürtel: ein
  // Wert mit Zeitanteil würde als Zeichenkette größer als der Fenstertag und der Fund fiele an
  // seinem eigenen letzten Tag heraus.
  it("vergleicht taggenau, auch wenn ein Zeitanteil am Datum hängt", () => {
    const mitUhrzeit = fund({ id: "u", gueltigVon: "2026-09-30T12:00:00.000Z" })
    expect(imExportZeitraum(mitUhrzeit, "2026-09-01", "2026-09-30")).toBe(true)
  })
})

// ── (c) katMeta ───────────────────────────────────────────────────────────────
//
// Der ?? FALLBACK_KAT_META-Zweig ist im Code ausdrücklich als Schutz vor React #130 vermerkt:
// KategorieGlyph rendert <Icon/>, und ein undefined als Elementtyp reißt die ganze Ansicht ab —
// Karte, Dashboard-Liste und Detail-Overlay auf einmal.
//
// Dass die Kategorie-Liste des Backends WÄCHST, ist belegt und nicht ausgedacht: Migration 006/009
// hat 'sperrung' nachgezogen, Migration 011 'sonstige'. Beide fehlten in der Ursprungsliste von
// 001_init. Heute stehen 20.922 Hindernisse auf 'sperrung' und 12 auf 'sonstige' — Kategorien, die
// es beim Schreiben des Frontends noch nicht gab. Gemessen am 07.09.2026 kennt der Bestand
// 0 Kategorien außerhalb der Frontend-Liste; der Fallback ist der Schutz für die nächste.
describe("katMeta (T-734)", () => {
  // Die 11 Werte des obstacles_kategorie_check aus der Produktion, wörtlich abgeschrieben.
  // Bewusst KEIN Vergleich der Schlüsselmenge mit KATEGORIE_META: ein solcher Test würde bei
  // jeder korrekten Erweiterung rot und ist deshalb wertlos (vgl. sourceHealth.test.ts).
  const bestand: FindingKategorie[] = [
    "bruecke",
    "engstelle",
    "baustelle",
    "sperrung",
    "gewicht",
    "bahnuebergang",
    "kreisverkehr",
    "ampel",
    "steigung",
    "tunnel",
    "sonstige",
  ]

  it("löst jede Kategorie des Bestands auf ihr eigenes Label und Icon auf", () => {
    for (const k of bestand) {
      const meta = katMeta(k)
      expect(meta.icon).toBeDefined()
      expect(meta.label).toBe(KATEGORIE_META[k].label)
      // Gegenprobe zum Fallback: eine bekannte Kategorie darf NICHT im Fallback landen,
      // sonst hieße im Dashboard alles „Hindernis".
      expect(meta.label).not.toBe(FALLBACK_KAT_META.label)
    }
  })

  it("nennt die häufigsten Kategorien beim Namen", () => {
    // 24.358 Baustellen, 20.192 Gewicht, 16.494 Brücken im aktiven Bestand (07.09.2026).
    expect(katMeta("baustelle").label).toBe("Baustelle")
    expect(katMeta("gewicht").label).toBe("Gewicht")
    expect(katMeta("bruecke").label).toBe("Brücke")
  })

  // Der eigentliche Schutzfall: eine Kategorie, die das Backend liefert und das Frontend nicht
  // kennt. Ohne Fallback kommt undefined zurück, `meta.label` wirft und `<Icon/>` crasht mit
  // React #130 — die Ansicht ist weg, statt ein unbekanntes Bauwerk neutral zu zeigen.
  it("gibt bei einer unbekannten Kategorie den Fallback statt undefined", () => {
    const meta = katMeta("hochwasser")
    expect(meta).toEqual(FALLBACK_KAT_META)
    expect(meta.label).toBe("Hindernis")
    expect(meta.icon).toBeDefined()
  })

  it("liefert auch für leere und krumme Werte ein renderbares Icon", () => {
    // Groß-/Kleinschreibung und ein angehängtes Leerzeichen treffen die Liste NICHT — genau
    // dafür ist der Fallback da, und genau so kommt es aus einem neuen Connector.
    for (const k of ["", "Baustelle", "sperrung "]) {
      expect(katMeta(k).icon).toBeDefined()
      expect(typeof katMeta(k).label).toBe("string")
    }
  })

  // Beim Schreiben dieses Tests gefunden und danach behoben (T-734, 07.09.2026): der blosse
  // Objektzugriff lieferte bei "__proto__", "constructor" oder "toString" das PROTOTYP-Objekt.
  // Das ist truthy, also griff der ?? -Fallback nicht, und `meta.icon` blieb undefined — genau
  // der React-#130-Renderabsturz, den der Fallback verhindern soll. Heute nicht erreichbar
  // (beide Tabellen tragen einen CHECK auf die 11 zulässigen Werte), aber ein Schutz soll halten,
  // was sein Kommentar verspricht.
  it("faellt auch bei Prototyp-Schluesseln auf den Ersatz zurueck", () => {
    for (const k of ["__proto__", "constructor", "toString", "valueOf", "hasOwnProperty"]) {
      expect(katMeta(k).icon, k).toBeDefined()
      expect(typeof katMeta(k).label, k).toBe("string")
      expect(katMeta(k).label, k).toBe(FALLBACK_KAT_META.label)
    }
  })
})

// ── (d) formatGueltigkeit ─────────────────────────────────────────────────────
//
// Steht in jedem Karten-Popup (ObstaclesMap) und auf jeder Fund-Karte (FindingCard).
//
// „Ab/am" statt „Ab" ist ein ausdrücklicher Max-Wunsch aus T-611 und die ehrliche Formulierung:
// ein Fund mit Start ohne Ende ist oft eine Ein-Tages-Baustelle, deren Quelle kein Enddatum
// liefert — wir wissen die Eintägigkeit nicht sicher, also behaupten wir sie auch nicht.
// Gemessen am 07.09.2026 im aktiven Bestand: 276 Hindernisse mit Start ohne Ende („Ab/am"),
// 202 nur mit Ende („Bis"), 42.270 ohne beides („Unbefristet"), 34.532 mit beiden Grenzen.
describe("formatGueltigkeit (T-734)", () => {
  it("schreibt einen Zeitraum mit beiden Grenzen deutsch mit Gedankenstrich", () => {
    expect(formatGueltigkeit("2026-09-01", "2026-09-30")).toBe("01.09.2026 – 30.09.2026")
  })

  // T-611: „Ab/am", nicht „Ab" — und groß. Beides ist bewusst so gewollt.
  it("sagt bei Start ohne Ende Ab/am, weil die Eintägigkeit nicht sicher ist", () => {
    expect(formatGueltigkeit("2026-09-01", null)).toBe("Ab/am 01.09.2026")
    expect(formatGueltigkeit("2026-09-01", undefined)).toBe("Ab/am 01.09.2026")
    expect(formatGueltigkeit("2026-09-01", "")).toBe("Ab/am 01.09.2026")
  })

  it("sagt bei Ende ohne Start Bis", () => {
    expect(formatGueltigkeit(null, "2026-09-30")).toBe("Bis 30.09.2026")
  })

  it("nennt einen Fund ohne jede Datumsangabe unbefristet", () => {
    expect(formatGueltigkeit(null, null)).toBe("Unbefristet")
    expect(formatGueltigkeit(undefined, undefined)).toBe("Unbefristet")
    expect(formatGueltigkeit("", "")).toBe("Unbefristet")
  })

  it("dreht das ISO-Datum auf die deutsche Reihenfolge", () => {
    expect(formatGueltigkeit("2026-12-24", "2027-01-06")).toBe("24.12.2026 – 06.01.2027")
  })
})
