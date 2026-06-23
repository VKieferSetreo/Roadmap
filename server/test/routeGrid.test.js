import { describe, it, expect } from "vitest"
import { nearestOnRoute, buildRouteGrid, cumulativeKm } from "../src/engine/geometry.js"

// Der Gitter-Index darf das Matching NICHT verändern: für jeden Punkt muss die Korridor-Entscheidung
// (distM ≤ Schwelle) identisch sein, und bei Treffern auch distM + km exakt gleich wie der lineare
// Scan. (Abdeckung Zelle+8 Nachbarn ≥ ~95 m > clipM 60 m > corridorM 20 m.)
describe("Gitter-Index nearestOnRoute == linear (verhaltenserhaltend)", () => {
  // Realistische, kurvige Route quer durch DE (grob A5/A7-artig), ~2 Punkte/km.
  const route = []
  for (let i = 0; i <= 400; i++) {
    const lat = 48.0 + i * 0.012 + 0.03 * Math.sin(i / 7)
    const lng = 8.0 + 0.02 * Math.cos(i / 5) + i * 0.004
    route.push({ lat, lng })
  }
  const cum = cumulativeKm(route)
  const grid = buildRouteGrid(route)

  it("Korridor-Entscheidung + km identisch über ein dichtes Punktraster", () => {
    let checked = 0
    let matchesInCorridor = 0
    for (let a = 0; a <= 400; a += 3) {
      const base = route[a]
      // Punkte rund um die Route in verschiedenen Abständen (m → grob in Grad).
      for (const dLat of [-0.003, -0.0008, -0.0001, 0, 0.0001, 0.0008, 0.003]) {
        for (const dLng of [-0.003, -0.0005, 0, 0.0005, 0.003]) {
          const p = { lat: base.lat + dLat, lng: base.lng + dLng }
          const lin = nearestOnRoute(p, route, cum)
          const idx = nearestOnRoute(p, route, cum, grid)
          // 1) Schwellen-Entscheidung muss für 20 m UND 60 m gleich sein
          expect(idx.distM <= 20).toBe(lin.distM <= 20)
          expect(idx.distM <= 60).toBe(lin.distM <= 60)
          // 2) bei Treffern (≤ clipM) exakt gleiche distM + km
          if (lin.distM <= 60) {
            expect(idx.distM).toBeCloseTo(lin.distM, 9)
            expect(idx.km).toBe(lin.km)
            matchesInCorridor++
          }
          checked++
        }
      }
    }
    expect(checked).toBeGreaterThan(2000)
    expect(matchesInCorridor).toBeGreaterThan(50) // es gab echte Treffer zum Vergleichen
  })
})
