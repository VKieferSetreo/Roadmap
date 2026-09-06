// T-732: Der manuelle Sync muss stillgelegte Quellen genauso auslassen wie das Worker-Scheduling.
//
// Der Fehler, den das absichert: das Scheduling im Worker beachtet `quellen.aktiv` seit T-694, der
// Knopf "Alle Quellen aktualisieren" tat es nicht. Zwei Wege, dieselbe Frage, zwei Antworten — und
// die falsche importierte weiter, was das Register als stillgelegt fuehrt, samt Reaktivierung der
// Zeilen. Beobachtet am 06.09.2026 bei einem manuellen Lauf: 0151 und 0159 meldeten "Vollbestand-
// Feed lieferte 0 Eintraege", obwohl beide in Migration 073 stillgelegt worden waren.

import { describe, it, expect } from "vitest"
import { startSync, getSyncJob } from "../src/sync.js"
import { createFakeDb } from "./helpers/fakeDb.js"

/** Connector-Attrappe: liefert nichts, merkt sich nur, dass sie lief. */
const attrappe = (quelleId, gelaufen) => ({
  quelleId,
  name: `Testquelle ${quelleId}`,
  vollbestand: false,
  async fetch() {
    gelaufen.push(quelleId)
    return { obstacles: [] }
  },
})

/** Wartet, bis der Hintergrund-Job fertig ist (oder die Geduld reisst). */
async function fertig(id, msMax = 5000) {
  const bis = Date.now() + msMax
  for (;;) {
    const j = getSyncJob(id)
    if (!j || j.status !== "running") return j
    if (Date.now() > bis) throw new Error(`Sync-Job wurde in ${msMax} ms nicht fertig`)
    await new Promise((r) => setTimeout(r, 10))
  }
}

describe("startSync respektiert stillgelegte Quellen (T-732)", () => {
  it("laesst eine Quelle mit aktiv=false aus und zaehlt sie nicht mit", async () => {
    const db = createFakeDb()
    db.state.quellen.push(
      { id: "9001", name: "Laeuft", typ: "api", aktiv: true },
      { id: "9002", name: "Stillgelegt", typ: "api", aktiv: false },
    )
    const gelaufen = []
    const job = startSync({
      db,
      connectors: [attrappe("9001", gelaufen), attrappe("9002", gelaufen)],
      env: {},
    })
    const fertigerJob = await fertig(job.id)

    expect(gelaufen).toEqual(["9001"])
    // Der Fortschrittsbalken darf keine Gesamtzahl zeigen, die nie erreicht wird: startSync setzt
    // job.total synchron, bevor die Aktiv-Abfrage ueberhaupt laufen kann.
    expect(fertigerJob.total).toBe(1)
    expect(fertigerJob.done).toBe(1)
    expect(fertigerJob.uebersprungen).toBe(1)
  })

  it("laeuft ueber alle Quellen, wenn keine stillgelegt ist", async () => {
    const db = createFakeDb()
    db.state.quellen.push(
      { id: "9003", name: "A", typ: "api", aktiv: true },
      { id: "9004", name: "B", typ: "api", aktiv: true },
    )
    const gelaufen = []
    const job = startSync({
      db,
      connectors: [attrappe("9003", gelaufen), attrappe("9004", gelaufen)],
      env: {},
    })
    const fertigerJob = await fertig(job.id)

    expect(gelaufen.sort()).toEqual(["9003", "9004"])
    expect(fertigerJob.total).toBe(2)
    expect(fertigerJob.uebersprungen).toBeUndefined()
  })

  // FAIL-OPEN, und das ist die wichtigere Richtung: ein Datenbankhaenger darf den
  // Aktualisieren-Knopf nicht wirkungslos machen. Lieber einmal zu viel importieren als gar nicht.
  it("importiert alles, wenn die Aktiv-Abfrage scheitert", async () => {
    const db = createFakeDb()
    db.state.quellen.push({ id: "9005", name: "C", typ: "api", aktiv: false })
    const echt = db.query.bind(db)
    db.query = async (sql, params) => {
      if (String(sql).startsWith("SELECT id FROM quellen WHERE aktiv = false")) {
        throw new Error("Datenbank gerade nicht erreichbar")
      }
      return echt(sql, params)
    }
    const gelaufen = []
    const job = startSync({ db, connectors: [attrappe("9005", gelaufen)], env: {} })
    await fertig(job.id)

    expect(gelaufen).toEqual(["9005"])
  })
})
