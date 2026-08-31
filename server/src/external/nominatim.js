// Nominatim-Geocoder (nur serverseitig). Liefert null bei jedem Fehler/Timeout —
// der Aufrufer fällt dann auf die eingebaute Städte-Tabelle zurück.

import { fetchJson } from "./http.js"

export function createNominatim({
  // T-338: KEINE stille Default-URL auf den öffentlichen OSM-Endpunkt — Ortsnamen/Adressen sind
  // personenbeziehbar und dürfen nicht ungewollt an einen Dritt-Dienst lecken. Ohne explizit
  // konfigurierte (self-hosted) NOMINATIM_URL ist der Geocoder deaktiviert (→ null); der Aufrufer
  // fällt dann auf die eingebaute Städte-Tabelle zurück.
  baseUrl = process.env.NOMINATIM_URL || "",
  timeoutMs = Number(process.env.EXTERNAL_TIMEOUT_MS ?? 4000),
  fetchImpl = globalThis.fetch,
} = {}) {
  if (!baseUrl) return null
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

    /**
     * OSM-highway-Klasse am Punkt — z.B. "residential", "living_street", "unclassified",
     * "tertiary", … oder null. Für die Ortsdurchfahrt-Erkennung (Konzept „Ortschaften
     * umfahren"): klassifiziert Streckenabschnitte OHNE Straßen-Ref, damit der Agent eine
     * innerörtliche Gemeindestraße von einer klassifizierten Durchgangsstraße unterscheiden
     * kann. `zoom=17` trifft die einzelne Straße. Null bei Fehler/Timeout oder wenn das
     * nächste Objekt keine Straße ist (dann behandelt der Aufrufer das Segment als unklar).
     * @returns {Promise<string|null>}
     */
    async reverseRoadClass(lat, lng) {
      if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) return null
      // format=jsonv2: Feld heißt "category" (statt "class" im v1-JSON) — beide abfangen.
      const url = `${baseUrl.replace(/\/$/, "")}/reverse?format=jsonv2&zoom=17&lat=${lat}&lon=${lng}`
      const data = await fetchJson(url, {
        timeoutMs,
        fetchImpl,
        headers: { "User-Agent": "setreo-roadmap/1.0" },
      }).catch(() => null)
      if (!data || typeof data !== "object") return null
      const kategorie = data.category ?? data.class
      if (kategorie !== "highway") return null
      return typeof data.type === "string" && data.type ? data.type : null
    },
  }
}
