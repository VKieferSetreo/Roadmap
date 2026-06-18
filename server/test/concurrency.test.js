// In-Process-Semaphore (T-173 Kern): begrenzt parallele Auswertungen.

import { describe, expect, it } from "vitest"
import { createSemaphore } from "../src/concurrency.js"

describe("createSemaphore", () => {
  it("begrenzt die gleichzeitige Ausführung auf max", async () => {
    const run = createSemaphore(2)
    let active = 0
    let peak = 0
    const task = () =>
      run(async () => {
        active += 1
        peak = Math.max(peak, active)
        await new Promise((r) => setTimeout(r, 10))
        active -= 1
      })
    await Promise.all(Array.from({ length: 8 }, task))
    expect(peak).toBe(2)
    expect(active).toBe(0)
  })

  it("führt alle Tasks aus (kein Verlust bei Stau)", async () => {
    const run = createSemaphore(1)
    const done = []
    await Promise.all([1, 2, 3, 4, 5].map((n) => run(async () => { done.push(n) })))
    expect(done.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5])
  })

  it("gibt den Slot auch bei Fehler frei (kein Deadlock)", async () => {
    const run = createSemaphore(1)
    await expect(run(async () => { throw new Error("boom") })).rejects.toThrow("boom")
    // Slot wieder frei → nächster Task läuft
    let ran = false
    await run(async () => { ran = true })
    expect(ran).toBe(true)
  })
})
