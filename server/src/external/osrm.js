// OSRM-Router (nur serverseitig). Liefert null bei jedem Fehler/Timeout —
// der Aufrufer nutzt dann den deterministischen Geometrie-Fallback.

import { fetchJson } from "./http.js"

export function createOsrm({
  baseUrl = process.env.OSRM_URL || "https://router.project-osrm.org",
  timeoutMs = Number(process.env.EXTERNAL_TIMEOUT_MS ?? 4000),
  fetchImpl = globalThis.fetch,
} = {}) {
  return {
    /** @returns {{geometry:{lat:number,lng:number}[],distanzKm:number,dauerMin:number}|null} */
    async route(waypoints) {
      const coords = waypoints.map((p) => `${p.lng},${p.lat}`).join(";")
      const url = `${baseUrl.replace(/\/$/, "")}/route/v1/driving/${coords}?overview=full&geometries=geojson`
      const data = await fetchJson(url, {
        timeoutMs,
        fetchImpl,
        headers: { "User-Agent": "setreo-roadmap/1.0" },
      })
      const route = data?.code === "Ok" ? data.routes?.[0] : null
      const coordsOut = route?.geometry?.coordinates
      if (!Array.isArray(coordsOut) || coordsOut.length < 2) return null
      return {
        geometry: coordsOut.map(([lng, lat]) => ({ lat, lng })),
        distanzKm: route.distance / 1000,
        dauerMin: route.duration / 60,
      }
    },
  }
}
