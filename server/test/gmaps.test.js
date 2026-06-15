// Google-Maps-Link → geordnete Wegpunkte (Stopps). Koordinaten direkt, Ortsnamen als {name}.
import { describe, it, expect } from "vitest"
import { extractMapsStops } from "../src/external/gmaps.js"

describe("extractMapsStops", () => {
  it("/maps/dir/ mit Koordinaten — @-Mitte + data= ignoriert", async () => {
    const url = "https://www.google.com/maps/dir/48.53,8.08/49.01,8.40/@48.7,8.2,9z/data=!4m2!4m1!3e0"
    const { stops } = await extractMapsStops(url)
    expect(stops).toEqual([{ lat: 48.53, lng: 8.08 }, { lat: 49.01, lng: 8.40 }])
  })

  it("?api=1 mit origin/waypoints/destination in Reihenfolge", async () => {
    const url = "https://www.google.com/maps/dir/?api=1&origin=48.53,8.08&waypoints=48.7,8.2&destination=49.01,8.40&travelmode=driving"
    const { stops } = await extractMapsStops(url)
    expect(stops).toEqual([
      { lat: 48.53, lng: 8.08 },
      { lat: 48.7, lng: 8.2 },
      { lat: 49.01, lng: 8.40 },
    ])
  })

  it("Ortsnamen (mit + als Leerzeichen) → {name} zum Geokodieren", async () => {
    const url = "https://www.google.com/maps/dir/Oberkirch/Bad+Rappenau/Karlsruhe"
    const { stops } = await extractMapsStops(url)
    expect(stops).toEqual([{ name: "Oberkirch" }, { name: "Bad Rappenau" }, { name: "Karlsruhe" }])
  })

  it("Kurz-Link wird server-seitig aufgelöst (fetchImpl-Redirect)", async () => {
    const fetchImpl = async () => ({ url: "https://www.google.com/maps/dir/48.5,8.0/49.0,8.4/" })
    const { stops, resolvedUrl } = await extractMapsStops("https://maps.app.goo.gl/abc123", { fetchImpl })
    expect(resolvedUrl).toContain("/maps/dir/")
    expect(stops).toEqual([{ lat: 48.5, lng: 8.0 }, { lat: 49.0, lng: 8.4 }])
  })

  it("Einzel-Ort/Murks → keine 2 Wegpunkte", async () => {
    const { stops } = await extractMapsStops("https://www.google.com/maps/place/Köln/@50.9,6.9,12z")
    expect(stops.length).toBeLessThan(2)
  })

  it("Consent-Gate: continue-Param wird gefolgt", async () => {
    const target = "https://www.google.com/maps/dir/48.5,8.0/49.0,8.4/"
    const fetchImpl = async () => ({
      url: `https://consent.google.com/m?continue=${encodeURIComponent(target)}&gl=DE`,
    })
    const { stops } = await extractMapsStops("https://maps.app.goo.gl/x", { fetchImpl })
    expect(stops).toEqual([{ lat: 48.5, lng: 8.0 }, { lat: 49.0, lng: 8.4 }])
  })

  it("data=-Fallback (!3d lat !4d lng) wenn Pfad keine Stopps hat", async () => {
    const url = "https://www.google.com/maps/dir/@48.7,8.2,9z/data=!3d48.5!4d8.0!3d49.0!4d8.4"
    const { stops } = await extractMapsStops(url)
    expect(stops).toEqual([{ lat: 48.5, lng: 8.0 }, { lat: 49.0, lng: 8.4 }])
  })
})
