// Der Aufraeumer der Anreicherungstabelle (T-662).
//
// Hier steht ein DELETE gegen Produktivdaten. Der Test sichert nicht ab, dass es funktioniert —
// das tut die Datenbank —, sondern dass es NICHT ZU VIEL trifft. Faellt eine der Bedingungen aus
// dem SQL heraus, loescht dieselbe Zeile Code die gesamte Anreicherung von 73.000 Punkten.

import { describe, it, expect } from "vitest"
import { purgeStaleInactive, purgeVerwaisteAnreicherung } from "../src/worker/hygiene.js"

describe("purgeVerwaisteAnreicherung", () => {
  const fang = () => {
    const gesehen = []
    const db = { query: async (sql, p) => { gesehen.push({ sql, p }); return { rows: [{ id: 1 }, { id: 2 }] } } }
    return { db, gesehen }
  }

  it("loescht nur Zeilen, deren Hindernis wirklich fehlt", async () => {
    const { db, gesehen } = fang()
    await purgeVerwaisteAnreicherung(db)
    const { sql } = gesehen[0]

    // Die drei Bedingungen, ohne die das DELETE zu viel trifft.
    expect(sql).toContain("ziel_typ = 'obstacle'")
    expect(sql, "ohne den LEFT JOIN gibt es keinen Abgleich mit dem Bestand").toContain("LEFT JOIN obstacles")
    expect(sql, "o.id IS NULL ist die eigentliche Waisen-Bedingung").toContain("o.id IS NULL")
    // Und es begrenzt sich selbst: der Vergleich kann keinen Index nutzen, ein unbegrenzter Lauf
    // haelt sonst die groesste Tabelle des Systems minutenlang.
    expect(sql).toContain("LIMIT")
  })

  it("reicht die Batchgroesse durch und meldet die geloeschte Zahl", async () => {
    const { db, gesehen } = fang()
    const n = await purgeVerwaisteAnreicherung(db, { batch: 500 })
    expect(gesehen[0].p).toEqual([500])
    expect(n).toBe(2)
  })

  it("nimmt eine lebende Zeile nicht mit", async () => {
    // Gegenprobe an echten Daten waere eine Integrationssache; hier zaehlt, dass die Bedingung
    // ueberhaupt auf das Fehlen des Punktes zielt und nicht etwa auf dessen aktiv-Flag. Ein
    // deaktiviertes Hindernis behaelt seine Ableitungen — es kann jederzeit reaktiviert werden.
    const { db, gesehen } = fang()
    await purgeVerwaisteAnreicherung(db)
    expect(gesehen[0].sql, "aktiv=false ist KEIN Grund zu loeschen").not.toContain("aktiv")
  })
})

describe("purgeStaleInactive", () => {
  it("haelt inaktive Zeilen laenger, als die Auswertung zurueckschaut", async () => {
    // Die Aufraeumfrist ist keine freie Zahl: "weggefallen" auf /veraenderungen liest
    // aktiv = false plus updated_at, was hier geloescht wird, fehlt dort ersatzlos. Faellt die
    // Frist unter das groesste Auswertungsfenster (90 Tage), zeigt das Chart fuer die aelteren
    // Tage wieder fast nur Neuanlagen — genau der Zustand, den T-757 behoben hat.
    let frist = null
    const db = { query: async (_sql, p) => { frist = p[0]; return { rows: [] } } }
    await purgeStaleInactive(db)
    expect(frist).toBeGreaterThan(90)
  })

  it("loescht nur globale Importe, nie Kunden-Eintraege", async () => {
    let sql = ""
    const db = { query: async (s2) => { sql = s2; return { rows: [] } } }
    await purgeStaleInactive(db)
    expect(sql).toContain("aktiv = false")
    expect(sql, "ohne tenant_id IS NULL trifft das DELETE auch Mandanten-Eintraege").toContain("tenant_id IS NULL")
    expect(sql, "ohne quellen_id IS NOT NULL auch manuell angelegte Punkte").toContain("quellen_id IS NOT NULL")
  })
})
