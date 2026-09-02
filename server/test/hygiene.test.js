// Der Aufraeumer der Anreicherungstabelle (T-662).
//
// Hier steht ein DELETE gegen Produktivdaten. Der Test sichert nicht ab, dass es funktioniert —
// das tut die Datenbank —, sondern dass es NICHT ZU VIEL trifft. Faellt eine der Bedingungen aus
// dem SQL heraus, loescht dieselbe Zeile Code die gesamte Anreicherung von 73.000 Punkten.

import { describe, it, expect } from "vitest"
import { purgeVerwaisteAnreicherung } from "../src/worker/hygiene.js"

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
