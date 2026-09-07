// Die Auswahl des Nachtlaufs (T-732).
//
// Geprueft wird hier nicht "laeuft es", sondern die drei Zusagen, an denen Daten haengen:
//   1. der Quell-Hash wird ueber ALLE Spalten gebildet, die quellHashVon liest — und nur ueber die
//   2. abgeraeumt wird ausschliesslich die Fertig-Marke des eigenen Modells
//   3. der Altbestandsschritt kann sich nicht im Kreis drehen
//
// Zu 1.: wird beim Nachladen eine Spalte vergessen, ist ihr Wert undefined, der Hash weicht ab,
// und der Lauf haelt den halben Bestand fuer geaendert. Das waere kein Absturz, sondern 60
// Stunden GPU fuer nichts — die Art Fehler, die man nur an einer Rechnung merkt.

import { describe, it, expect } from "vitest"
import { quellHashVon } from "../src/anreicherung/lauf.js"
import { FELDER } from "../src/anreicherung/extrakt.js"
import {
  HASH_SPALTEN, ueberholteMarken, altbestandMarken, raeumeMarken, zaehleKandidaten,
} from "../scripts/anreicherungLauf.mjs"

// Die Katalogroesse steht im Wert der Fertig-Marke. Nicht festverdrahten: waechst der Katalog um
// ein Feld, aendert sich die Zahl, und der Test soll das mitgehen.
const KATALOG = String(Object.keys(FELDER).length)

// Ein Punkt, an dem jede Spalte des Hashs belegt ist — sonst faende der Test unten nicht, dass
// eine fehlt: null gegen null ist auch dann gleich, wenn die Spalte gar nicht mitgelesen wurde.
const punkt = () => ({
  id: "11111111-1111-1111-1111-111111111111",
  name: "Brücke St 2148 BW 6840513",
  beschreibung: "Restbreite 3,20 m",
  strassen_ref: "B65",
  zustaendig: "SBV Nord",
  kategorie: "bruecke",
  richtung: "beide",
  gueltig_von: "2026-08-30",
  gueltig_bis: "2026-09-14",
  roh: { quelle: "bast", feld: "wert" },
})

describe("Der Quell-Hash und die Spalten, die ihn tragen", () => {
  it("reagiert auf jede einzelne Spalte aus HASH_SPALTEN", () => {
    const basis = quellHashVon(punkt())
    for (const spalte of HASH_SPALTEN) {
      const anders = { ...punkt(), [spalte]: "etwas ganz anderes" }
      expect(quellHashVon(anders), `${spalte} geht nicht in den Hash ein`).not.toBe(basis)
    }
  })

  it("merkt es, wenn eine Spalte beim Nachladen fehlt", () => {
    // Genau der Fall aus dem Betrieb: die Abfrage laesst eine Spalte weg, der Wert ist undefined.
    const basis = quellHashVon(punkt())
    for (const spalte of HASH_SPALTEN) {
      const ohne = { ...punkt() }
      delete ohne[spalte]
      expect(quellHashVon(ohne), `eine fehlende ${spalte} bliebe unbemerkt`).not.toBe(basis)
    }
  })

  // Der Gegentest, und er ist der wichtigere: am 02.09.2026 steckte attrs im Hash. spieleEin
  // schreibt die abgeleiteten Werte genau dorthin, damit aenderte der Lauf durch seinen eigenen
  // Eintrag den Hash und erklaerte 61.274 von 74.175 Punkten fuer veraltet. Was WIR schreiben,
  // darf den Hash nicht bewegen.
  it("bewegt sich nicht durch das, was wir selbst schreiben", () => {
    const basis = quellHashVon(punkt())
    expect(quellHashVon({ ...punkt(), attrs: { maxHoeheM: 3.2 } })).toBe(basis)
    expect(quellHashVon({ ...punkt(), ki_aufbereitet: true })).toBe(basis)
    expect(quellHashVon({ ...punkt(), updated_at: new Date() })).toBe(basis)
  })

  // DATE-Spalten kommen ueber src/db.js als "YYYY-MM-DD"-Text zurueck (setTypeParser 1082).
  // Ein roher pg.Pool liefert stattdessen ein JS-Date, und dann weicht der Hash bei jedem Punkt
  // mit Gueltigkeitsfenster ab. Beim Messen am 07.09.2026 hat genau das 29.286 Punkte
  // faelschlich als geaendert ausgewiesen — 4 von 5 aller vermeintlichen Aenderungen.
  it("haengt am Rueckgabetyp der DATE-Spalten, deshalb nur ueber src/db.js abfragen", () => {
    const alsText = quellHashVon(punkt())
    const alsDate = quellHashVon({ ...punkt(), gueltig_von: new Date("2026-08-30T00:00:00Z") })
    expect(alsDate).not.toBe(alsText)
  })
})

describe("Welche Punkte sich der Lauf vornimmt", () => {
  const fakeDb = (rows) => {
    const gesehen = []
    return { gesehen, query: async (sql, p) => { gesehen.push({ sql, p }); return { rows, rowCount: rows.length } } }
  }

  it("liest jede Hash-Spalte mit ab", async () => {
    const db = fakeDb([])
    await ueberholteMarken(db, { modell: "m" })
    for (const spalte of HASH_SPALTEN) {
      expect(db.gesehen[0].sql, `${spalte} fehlt in der Abfrage`).toContain(`o.${spalte}`)
    }
    // Nur aktive Punkte, nur die Marke dieses Modells, aelteste zuerst.
    expect(db.gesehen[0].sql).toContain("o.aktiv = true")
    expect(db.gesehen[0].sql).toContain("m.feld = '_fertig'")
    expect(db.gesehen[0].sql).toContain("ORDER BY m.erstellt_am ASC")
    expect(db.gesehen[0].p).toEqual(["m", KATALOG])
  })

  it("nimmt genau die Punkte, deren Hash nicht mehr passt", async () => {
    const aktuell = { ...punkt(), id: "gleich" }
    const veraltet = { ...punkt(), id: "anders" }
    const db = fakeDb([
      { ...aktuell, quelle_hash: quellHashVon(aktuell) },
      { ...veraltet, quelle_hash: "0000000000000000" },
    ])
    const { gepruefte, ids } = await ueberholteMarken(db, { modell: "m" })
    expect(gepruefte).toBe(2)
    expect(ids).toEqual(["anders"])
  })

  it("raeumt nur die Fertig-Marke ab, nur beim eigenen Modell", async () => {
    const db = fakeDb([])
    await raeumeMarken(db, { modell: "m", ids: ["a", "b"] })
    const { sql, p } = db.gesehen[0]
    expect(sql).toContain("DELETE FROM anreicherung")
    expect(sql).toContain("feld = '_fertig'")
    expect(sql).toContain("modell = $1")
    expect(sql).toContain("ziel_typ = 'obstacle'")
    // Alles andere in dieser Tabelle ist Arbeitsergebnis und darf nicht mitgehen.
    for (const stand of ["'ok'", "'leer'", "'verworfen'"]) expect(sql).not.toContain(stand)
    expect(p).toEqual(["m", ["a", "b"]])
  })

  it("loescht in Bloecken, damit der Parameter nicht ueber die Postgres-Grenze waechst", async () => {
    const db = fakeDb([])
    await raeumeMarken(db, { modell: "m", ids: Array.from({ length: 4500 }, (_, i) => `id${i}`) })
    expect(db.gesehen.length).toBe(3)
    expect(db.gesehen[0].p[1].length).toBe(2000)
    expect(db.gesehen[2].p[1].length).toBe(500)
  })

  // Ohne die Schranke auf erstellt_am waere die Marke, die dieser Lauf gerade selbst geschrieben
  // hat, irgendwann wieder die aelteste — ein Vollbestandslauf drehte sich im Kreis, statt einmal
  // durchzugehen. Und ohne aktiv = true raeumte er Marken an Punkten ab, die die Kandidatenwahl
  // gar nicht ansieht: dieselbe Zeile kaeme in jedem Durchgang wieder.
  it("kann sich beim Altbestand nicht im Kreis drehen", async () => {
    const db = fakeDb([])
    const vor = new Date("2026-09-07T10:00:00Z")
    await altbestandMarken(db, { modell: "m", anzahl: 200, vor })
    const { sql, p } = db.gesehen[0]
    expect(sql).toContain("a.erstellt_am < $3")
    expect(sql).toContain("o.aktiv = true")
    expect(sql).toContain("ORDER BY a.erstellt_am ASC")
    expect(sql).toContain("LIMIT 200")
    // Der Join zwischen der Textspalte ziel_id und der UUID muss ausdruecklich casten, sonst
    // wirft Postgres.
    expect(sql).toContain("o.id::text = a.ziel_id")
    expect(p).toEqual(["m", KATALOG, vor])
  })

  it("zaehlt die Offenen nach derselben Bedingung wie die Kandidatenwahl", async () => {
    const db = fakeDb([{ n: 895 }])
    expect(await zaehleKandidaten(db, { modell: "m" })).toBe(895)
    expect(db.gesehen[0].sql).toContain("NOT EXISTS")
    expect(db.gesehen[0].sql).toContain("a.feld = '_fertig'")
    expect(db.gesehen[0].p).toEqual(["m", KATALOG])
  })
})
