// Nominatim-Geocoder (nur serverseitig). Liefert null bei jedem Fehler/Timeout —
// der Aufrufer fällt dann auf die eingebaute Städte-Tabelle zurück.

import { fetchJson } from "./http.js"

export function createNominatim({
  baseUrl = process.env.NOMINATIM_URL || "https://nominatim.openstreetmap.org",
  timeoutMs = Number(process.env.EXTERNAL_TIMEOUT_MS ?? 4000),
  fetchImpl = globalThis.fetch,
} = {}) {
  return {
    /** @returns {{lat:number,lng:number,displayName:string}|null} */
    async geocode(ort) {
      const url = `${baseUrl.replace(/\/$/, "")}/search?format=json&limit=1&q=${encodeURIComponent(ort)}`
      const data = await fetchJson(url, {
        timeoutMs,
        fetchImpl,
        headers: { "User-Agent": "setreo-roadmap/1.0" },
      })
      const hit = Array.isArray(data) ? data[0] : null
      if (!hit) return null
      const lat = Number(hit.lat)
      const lng = Number(hit.lon)
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
      return { lat, lng, displayName: hit.display_name ?? ort }
    },
  }
}
