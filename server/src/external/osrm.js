// OSRM-Router (nur serverseitig). Liefert null bei jedem Fehler/Timeout —
// der Aufrufer nutzt dann den deterministischen Geometrie-Fallback.

import { fetchJson } from "./http.js"

// Straßen-Referenz normalisieren: "A 1" → "A1", "B 252"/"B252" → "B252", "St 2580" → "ST2580",
// "L 99" → "L99", "K 142" → "K142". Führende Nullen weg. NUR klassifizierte Straßennummern
// (A/B/L/K/St/S) — gibt null für Straßennamen/leere Refs zurück (dann NICHT vergleichen).
export function normRoadRef(s) {
  const m = String(s ?? "").toUpperCase().match(/\b(A|B|L|K|ST|S)\s*0*(\d{1,4})\b/)
  return m ? `${m[1] === "S" ? "ST" : m[1]}${m[2]}` : null
}

/** Die einzelnen Schritte mit Strassennummer und Geometrie — {ref, punkte}[]. */
export function abschnitteAusLegs(legs) {
  const raus = []
  for (const leg of legs ?? []) {
    for (const step of leg.steps ?? []) {
      const ref = normRoadRef(String(step.ref ?? "").split(/[;,/]/)[0])
      const c = step?.geometry?.coordinates
      if (!ref || !Array.isArray(c) || !c.length) continue
      raus.push({ ref, punkte: c.map(([lng, lat]) => ({ lat, lng })) })
    }
  }
  return raus
}

/** Strassen-Refs aus OSRM-Legs (A/B/L/K/St). Gemeinsam genutzt von roadRefs und den Alternativen. */
export function refsAusLegs(legs) {
  const refs = new Set()
  for (const leg of legs ?? []) {
    for (const step of leg.steps ?? []) {
      for (const part of String(step.ref ?? "").split(/[;,/]/)) {
        const n = normRoadRef(part)
        if (n) refs.add(n)
      }
    }
  }
  return refs
}

// Anfangspeilung a->b (0=Nord, 90=Ost) — fuer Fahrbahnseiten-bearings.
function bearing(a, b) {
  const rad = Math.PI / 180
  const la1 = a.lat * rad
  const la2 = b.lat * rad
  const dlo = (b.lng - a.lng) * rad
  const y = Math.sin(dlo) * Math.cos(la2)
  const x = Math.cos(la1) * Math.sin(la2) - Math.sin(la1) * Math.cos(la2) * Math.cos(dlo)
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360
}

// Pro Wegpunkt die Reiserichtung (Vorgaenger->Nachfolger) mit +-rng Toleranz. OSRM snappt dann auf
// die Fahrbahn IN Fahrtrichtung statt auf die Gegenfahrbahn -> keine U-Turn-Loops auf getrennten
// Fahrbahnen (Autobahn/zweispurige B-Strassen).
function routeBearings(wp, rng = 90) {
  const n = wp.length
  return wp
    .map((_, i) => {
      const a = i > 0 ? wp[i - 1] : wp[i]
      const b = i < n - 1 ? wp[i + 1] : wp[i]
      return a.lat === b.lat && a.lng === b.lng ? "0,180" : `${Math.round(bearing(a, b))},${rng}`
    })
    .join(";")
}

export function createOsrm({
  // T-338: KEINE stille Default-URL auf den öffentlichen OSRM-Demoserver (Routen-/Bewegungsdaten
  // dürfen nicht ungewollt zu einem Dritt-Dienst gehen, und der Demoserver ist nicht produktiv).
  // Ohne konfigurierte (self-hosted) OSRM_URL ist der Router deaktiviert (→ null); der Aufrufer
  // nutzt dann den deterministischen Geometrie-Fallback.
  baseUrl = process.env.OSRM_URL || "",
  timeoutMs = Number(process.env.EXTERNAL_TIMEOUT_MS ?? 4000),
  fetchImpl = globalThis.fetch,
} = {}) {
  if (!baseUrl) return null
  return {
    /** @returns {{geometry:{lat:number,lng:number}[],distanzKm:number,dauerMin:number}|null} */
    async route(waypoints) {
      const coords = waypoints.map((p) => `${p.lng},${p.lat}`).join(";")
      // continue_straight=true: an Zwischen-Wegpunkten NICHT wenden (kein „hinfahren und zurück").
      // Für unsere geordneten Korridor-Wegpunkte gewünscht — und ein langer Transport kann an einem
      // Wegpunkt ohnehin keine enge Kehre fahren. (Ist beim Auto-Profil bereits Default; explizit
      // gesetzt = robust gegen Profiländerungen.) Echte LKW-Kurvenradien bräuchten ein HGV-Profil.
      const base = `${baseUrl.replace(/\/$/, "")}/route/v1/driving/${coords}?overview=full&geometries=geojson&continue_straight=true`
      // bearings = Fahrtrichtung je Wegpunkt → korrekte Fahrbahnseite (gegen U-Turn-Loops). Fallback
      // OHNE bearings, falls OSRM mit dem Richtungs-Constraint keinen Snap/Route findet (NoSegment).
      for (const url of [`${base}&bearings=${routeBearings(waypoints)}`, base]) {
        const data = await fetchJson(url, {
          timeoutMs,
          fetchImpl,
          headers: { "User-Agent": "setreo-roadmap/1.0" },
        }).catch(() => null)
        const route = data?.code === "Ok" ? data.routes?.[0] : null
        const coordsOut = route?.geometry?.coordinates
        if (Array.isArray(coordsOut) && coordsOut.length >= 2) {
          return {
            geometry: coordsOut.map(([lng, lat]) => ({ lat, lng })),
            distanzKm: route.distance / 1000,
            dauerMin: route.duration / 60,
          }
        }
      }
      return null
    },

    /**
     * Wie route(), aber mit ALTERNATIVEN: OSRM liefert bis zu `anzahl` echte Varianten
     * derselben Verbindung (andere Korridore, nicht nur Feinvarianten).
     *
     * Fuer die Streckensuche ist das der billigste Weg zu Vielfalt: ein Aufruf, mehrere
     * Korridore, keine geratenen Via-Punkte. OSRM liefert Alternativen nur ohne
     * Zwischenpunkte (zwei Wegpunkte) — mit mehr Punkten faellt es still auf eine Route
     * zurueck, deshalb hier bewusst nur Start und Ziel einer KANTE.
     * @returns {{geometry:{lat,lng}[],distanzKm:number,dauerMin:number}[]}
     */
    async routeAlternativen(von, nach, { anzahl = 3, mitStrassen = false } = {}) {
      const coords = `${von.lng},${von.lat};${nach.lng},${nach.lat}`
      // steps=true kostet auf langen Strecken spuerbar Zeit — deshalb nur, wenn der
      // Aufrufer die befahrenen Strassen wirklich braucht (Verbot des Nutzers).
      const url =
        `${baseUrl.replace(/\/$/, "")}/route/v1/driving/${coords}` +
        `?overview=full&geometries=geojson&alternatives=${Math.max(1, Math.min(Number(anzahl) || 3, 5))}` +
        (mitStrassen ? "&steps=true" : "")
      const data = await fetchJson(url, { timeoutMs: mitStrassen ? Math.max(timeoutMs, 30000) : timeoutMs, fetchImpl, headers: { "User-Agent": "setreo-roadmap/1.0" } }).catch(() => null)
      if (data?.code !== "Ok" || !Array.isArray(data.routes)) return []
      return data.routes
        .map((r) => {
          const c = r?.geometry?.coordinates
          if (!Array.isArray(c) || c.length < 2) return null
          const strassen = mitStrassen ? refsAusLegs(r.legs) : null
          // Abschnitte mit Strassennummer UND eigener Geometrie: nur damit laesst sich
          // sagen, WO genau eine bestimmte Strasse befahren wird — die Voraussetzung,
          // um ein Verbot in umfahrbare Punkte zu uebersetzen.
          const abschnitte = mitStrassen ? abschnitteAusLegs(r.legs) : null
          return { geometry: c.map(([lng, lat]) => ({ lat, lng })), distanzKm: r.distance / 1000, dauerMin: r.duration / 60, strassen, abschnitte }
        })
        .filter(Boolean)
    },

    /**
     * Menge der Straßen-Refs (A/B/L/K/St), die die Route tatsächlich befährt — aus den OSRM-Steps.
     * Für den Überführungs-Filter (T-601): ein Punkt-Bauwerk auf einer Straße, die NICHT in dieser
     * Menge ist, wird vom Transport nur gekreuzt, nicht befahren. Null bei Fehler/Timeout (→ Filter
     * greift dann nicht, konservativ). @returns {Set<string>|null}
     */
    async roadRefs(waypoints) {
      const wp = (Array.isArray(waypoints) ? waypoints : []).filter((p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lng))
      if (wp.length < 2) return null
      const coords = wp.map((p) => `${p.lng},${p.lat}`).join(";")
      const url = `${baseUrl.replace(/\/$/, "")}/route/v1/driving/${coords}?overview=false&steps=true&continue_straight=true`
      // T-602: steps=true auf sehr langen Routen (800+ km) ist langsam — großzügiges Timeout, damit
      // der Überführungsfilter auch im Worker-Rerun (Default 4 s) greift und nicht still degradiert.
      // Einmaliger Batch-Call je Route, nicht latenzkritisch.
      const data = await fetchJson(url, { timeoutMs: Math.max(timeoutMs, 30000), fetchImpl, headers: { "User-Agent": "setreo-roadmap/1.0" } }).catch(() => null)
      if (data?.code !== "Ok") return null
      return refsAusLegs(data.routes?.[0]?.legs)
    },

    /** Leichter Erreichbarkeits-Ping für /api/health (T-471). Kurzer Timeout, wirft nie. */
    async ping() {
      // Stuttgart (lng,lat) — liegt sicher im DE-Graph. /nearest ist billiger als /route.
      const url = `${baseUrl.replace(/\/$/, "")}/nearest/v1/driving/9.18,48.78?number=1`
      const data = await fetchJson(url, {
        timeoutMs: 2000,
        fetchImpl,
        headers: { "User-Agent": "setreo-roadmap/1.0" },
      }).catch(() => null)
      return data?.code === "Ok"
    },
  }
}
