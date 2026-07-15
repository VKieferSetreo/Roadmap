// Schleifen-/Stichfahrt-Erkennung fuer Planungsrouten (Max 2026-07-15: Murks-Routen
// mit Doppel-Befahrung duerfen den Nutzer nie erreichen).

import { describe, expect, it } from "vitest"
import { schleifenCheck } from "../src/routes/route.js"

const KM_LAT = 1 / 110.6 // Grad pro km (Breite)
const KM_LNG = 1 / (111.32 * Math.cos((48 * Math.PI) / 180)) // Grad pro km bei 48° N

/** Gerade West-Ost-Strecke: `km` lang, Punkt alle 100 m. */
function gerade(km, lat = 48, lng0 = 7) {
  const pts = []
  for (let i = 0; i <= km * 10; i++) pts.push({ lat, lng: lng0 + (i / 10) * KM_LNG })
  return pts
}

describe("schleifenCheck", () => {
  it("flaggt eine saubere gerade Route nicht", () => {
    expect(schleifenCheck(gerade(60))).toEqual([])
  })

  it("erkennt eine Stichfahrt (out-and-back) in der Routenmitte", () => {
    const pts = gerade(30)
    const basis = pts[pts.length - 1]
    // 3 km nach Norden und denselben Weg zurueck (klassisches Via-Pin-Artefakt).
    for (let i = 1; i <= 30; i++) pts.push({ lat: basis.lat + (i / 10) * KM_LAT, lng: basis.lng })
    for (let i = 29; i >= 0; i--) pts.push({ lat: basis.lat + (i / 10) * KM_LAT, lng: basis.lng })
    for (let i = 1; i <= 300; i++) pts.push({ lat: basis.lat, lng: basis.lng + (i / 10) * KM_LNG })
    const zonen = schleifenCheck(pts)
    expect(zonen.length).toBeGreaterThan(0)
    // Die gemeldete Stelle liegt im Bereich der Stichfahrt (km 30-36).
    expect(zonen[0].vonKm).toBeGreaterThan(25)
    expect(zonen[0].vonKm).toBeLessThan(40)
  })

  it("ignoriert Out-and-back direkt am Ziel (legitime Zufahrt)", () => {
    const pts = gerade(20)
    const basis = pts[pts.length - 1]
    // 1 km Stich am Routenende — Endbereiche (2 km) sind ausgenommen.
    for (let i = 1; i <= 10; i++) pts.push({ lat: basis.lat + (i / 10) * KM_LAT, lng: basis.lng })
    for (let i = 9; i >= 5; i--) pts.push({ lat: basis.lat + (i / 10) * KM_LAT, lng: basis.lng })
    expect(schleifenCheck(pts)).toEqual([])
  })
})
