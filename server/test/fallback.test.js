// Deterministischer Routen-Fallback: gleicher Input → identische Geometrie.

import { describe, expect, it } from "vitest"
import { CITY_COORDS, resolveOrt } from "../src/engine/cities.js"
import { buildPolyline, downsample, seedWaypoints } from "../src/engine/fallback.js"

describe("resolveOrt", () => {
  it("bekannte Städte exakt", () => {
    expect(resolveOrt("Hamburg")).toEqual(CITY_COORDS.hamburg)
    expect(resolveOrt("  münchen ")).toEqual(CITY_COORDS.münchen)
  })

  it("Teilstring-Treffer (Frankfurt am Main → frankfurt)", () => {
    expect(resolveOrt("Frankfurt am Main")).toEqual(CITY_COORDS.frankfurt)
  })

  it("unbekannte Orte: deterministisch + grob in Deutschland", () => {
    const a = resolveOrt("Hintertupfingen")
    const b = resolveOrt("Hintertupfingen")
    expect(a).toEqual(b)
    expect(a.lat).toBeGreaterThan(48.3)
    expect(a.lat).toBeLessThan(54.1)
    expect(a.lng).toBeGreaterThan(6.9)
    expect(a.lng).toBeLessThan(14.0)
  })
})

describe("buildPolyline", () => {
  const wps = [CITY_COORDS.hamburg, CITY_COORDS.hannover, CITY_COORDS.münchen]

  it("deterministisch: zweifacher Aufruf → identische Geometrie", () => {
    expect(JSON.stringify(buildPolyline(wps))).toBe(JSON.stringify(buildPolyline(wps)))
  })

  it("Start- und Endpunkt bleiben exakt erhalten", () => {
    const line = buildPolyline(wps)
    expect(line[0]).toEqual(CITY_COORDS.hamburg)
    expect(line[line.length - 1]).toEqual(CITY_COORDS.münchen)
    expect(line.length).toBeGreaterThan(20)
  })

  it("unterschiedliche Waypoints → unterschiedliche Geometrie", () => {
    const other = buildPolyline([CITY_COORDS.köln, CITY_COORDS.stuttgart])
    expect(JSON.stringify(other)).not.toBe(JSON.stringify(buildPolyline(wps)))
  })
})

describe("seedWaypoints (Upload ohne Punkte)", () => {
  it("gleicher Dateiname → gleiche Strecke, anderer Name → andere", () => {
    expect(seedWaypoints("route.gpx")).toEqual(seedWaypoints("route.gpx"))
    expect(JSON.stringify(seedWaypoints("a.gpx"))).not.toBe(JSON.stringify(seedWaypoints("b.gpx")))
  })
})

describe("downsample", () => {
  it("reduziert auf max Punkte, Endpunkte bleiben", () => {
    const pts = Array.from({ length: 5000 }, (_, i) => ({ lat: i, lng: i }))
    const out = downsample(pts, 2000)
    expect(out.length).toBe(2000)
    expect(out[0]).toEqual(pts[0])
    expect(out[out.length - 1]).toEqual(pts[pts.length - 1])
  })

  it("lässt kurze Listen unverändert", () => {
    const pts = [{ lat: 1, lng: 1 }, { lat: 2, lng: 2 }]
    expect(downsample(pts, 2000)).toBe(pts)
  })
})
