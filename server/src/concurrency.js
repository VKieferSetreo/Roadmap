// In-Process-Semaphore: begrenzt die gleichzeitige Ausführung schwerer Operationen
// (z.B. Auswertungen) auf `max`. Übersteigt die Parallelität das Limit, warten weitere
// Aufrufe FIFO auf einen frei werdenden Slot. Schützt Event-Loop + Heap gegen Überlast.
//
// Bewusst In-Process (eine API-Instanz). Für echte horizontale Skalierung (mehrere API-/
// Worker-Instanzen) gehört das in eine DB-gestützte Job-Queue (Postgres FOR UPDATE SKIP
// LOCKED, Per-Tenant-Fairness) — T-173 Vollausbau, setzt T-162 (stateless) voraus.

export function createSemaphore(max) {
  const limit = Math.max(1, Number(max) || 1)
  let active = 0
  const waiting = []

  return async function run(fn) {
    if (active >= limit) {
      await new Promise((resolve) => waiting.push(resolve))
    }
    active += 1
    try {
      return await fn()
    } finally {
      active -= 1
      const next = waiting.shift()
      if (next) next()
    }
  }
}
