// Eine Definition von "grob verortet" fuer alle Einstiegspunkte.
//
// /startziel prueft das seit dem Phantomrouten-Gate. Als die Streckensuche dazukam,
// fehlte die Pruefung dort: fuer "Achern → Offenburg" (30 km in Baden) kam eine
// 372-km-Strecke ueber Grosskugel und Chemnitz-Gloesa zurueck, bewertet mit
// "0 kritisch" (Messlauf 19.08.2026). Deshalb steht die Bedingung jetzt an genau
// einer Stelle — und hier ein Test davor.

import { describe, it, expect } from "vitest"
import { istGrobeVerortung } from "../src/routes/route.js"

describe("grobe Verortung", () => {
  it("erkennt den OSRM-Ausfall", () => {
    expect(istGrobeVerortung({ router: "fallback", geocoder: "nominatim" })).toBe(true)
  })

  it("erkennt den Staedtelisten-Geocoder", () => {
    expect(istGrobeVerortung({ router: "osrm", geocoder: "cities" })).toBe(true)
  })

  it("erkennt das ausdrueckliche Fallback-Kennzeichen", () => {
    expect(istGrobeVerortung({ router: "osrm", geocoder: "nominatim", fallback: true })).toBe(true)
  })

  it("laesst eine saubere Verortung durch", () => {
    expect(istGrobeVerortung({ router: "osrm", geocoder: "nominatim" })).toBe(false)
    expect(istGrobeVerortung(null)).toBe(false)
  })
})
