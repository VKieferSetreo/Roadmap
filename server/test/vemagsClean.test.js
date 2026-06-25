import { describe, it, expect } from "vitest"
import { cleanWaypoints, haversineKm } from "../src/external/vemagsClean.js"

// pts-Format wie aus resolveVemagsPunkte: { raw, typ, c:{lat,lng} }
const pt = (typ, lat, lng, raw = "") => ({ raw, typ, c: { lat, lng } })

describe("vemagsClean.cleanWaypoints", () => {
  it("Haversine HH->Berlin ~255 km", () => {
    const d = haversineKm({ lat: 53.55, lng: 10.0 }, { lat: 52.52, lng: 13.4 })
    expect(d).toBeGreaterThan(250)
    expect(d).toBeLessThan(260)
  })

  it("Hin-und-Zurueck (Nordstrasse -> Bremen, ratio ~2.4) fliegt raus", () => {
    const { kept, dropped } = cleanWaypoints([
      pt("start", 53.351, 8.488), pt("place", 53.10, 8.775, "Nordstrasse"), pt("ziel", 53.144, 8.216),
    ])
    expect(dropped.map((d) => d.raw)).toContain("Nordstrasse")
    expect(kept.length).toBe(2)
  })

  it("echter 90°-Knick (Knoten, ratio ~1.3) BLEIBT", () => {
    const { dropped } = cleanWaypoints([
      pt("junction", 52.398, 9.889, "AK Hannover-Ost"),
      pt("junction", 52.176, 11.546, "AK Magdeburg"),
      pt("junction", 51.267, 11.442, "AK Schkeuditz"),
    ])
    expect(dropped.length).toBe(0)
  })

  it("mittlerer Spike (ratio ~1.63): lokal raus, Autobahn-Knoten bleibt", () => {
    const seq = (typ) => [pt("start", 50.0, 8.0), pt(typ, 50.125, 8.15, "X"), pt("ziel", 50.0, 8.3)]
    expect(cleanWaypoints(seq("place")).dropped.length).toBeGreaterThan(0)
    expect(cleanWaypoints(seq("junction")).dropped.length).toBe(0)
  })

  it("saubere Folge bleibt unangetastet", () => {
    const { dropped } = cleanWaypoints([
      pt("start", 53.0, 8.0), pt("place", 53.1, 8.1, "B"), pt("ziel", 53.2, 8.2),
    ])
    expect(dropped.length).toBe(0)
  })

  it("Last-Mile: lokaler Punkt <1.5 km vom Start wird zusammengefasst", () => {
    const { kept, dropped } = cleanWaypoints([
      pt("start", 50.42, 7.565), pt("place", 50.42, 7.578, "Werftstrasse"), pt("ziel", 51.2, 8.0),
    ])
    expect(dropped.map((d) => d.raw)).toContain("Werftstrasse")
    expect(kept.length).toBe(2)
  })
})
