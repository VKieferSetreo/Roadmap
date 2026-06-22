// 0152 — BAB AlD (Arbeitsstellen längerer Dauer) Vorschau, Autobahn GmbH via Mobilithek/DATEX II.
//
// Warum ein EIGENER Connector statt eines env-Feeds (wie 0140-0147)? Der AlD-Feed ist riesig
// (~177 MB, ~18.800 Records) und überlappt fast vollständig mit dem direkten Autobahn-Connector 0001
// (aktueller Baustellenbestand) und 0145 (BAB AkD, kurze Dauer). Roh importiert gäbe es ~18.000
// Dubletten-Funde gegen 0001. Max-Vorgabe (2026-06-22): NUR das Zukunftsdelta — die künftig
// startenden Langzeit-Baustellen, die wir noch NICHT haben. Darum hier:
//   1. nur Records mit gueltigVon > heute (künftig startend) übernehmen,
//   2. gegen den Live-Bestand 0001/0145 dedupen (gleiche Autobahn + Lage ≤ 300 m) → nur NEUE.
// Es gibt kein gemeinsames Quell-ID-Schema zwischen DATEX-Situationen und der Autobahn-API → der
// Abgleich läuft über Lage+Straße, nicht über IDs.
//
// vollbestand:false: kein zerstörerischer Reconcile. Eine einmal geschriebene Vorschau-Baustelle
// bleibt bestehen, auch wenn sie aktiv wird (und damit aus dem Zukunftsfilter fällt) — sonst würde
// eine AlD-only-Sperrung (z.B. "A8 Perl-Borg, Sperrung für Schwertransport"), die 0001 NICHT führt,
// beim Aktivwerden verschwinden. Aufräumen übernimmt expireObstacles (7 Tage nach gueltig_bis).

import { makeMobilithekConnector } from "./mobilithek.js"

const ALD_URL =
  "https://mobilithek.info:8443/mobilithek/api/v1.0/subscription/1005520210240434176/clientPullService?subscriptionId=1005520210240434176"

// Bestehender BAB-Bestand, gegen den dedupt wird (direkte Autobahn-API + AkD-Vorschau).
const DEDUP_QUELLEN = ["0001", "0145"]
const DEDUP_RADIUS_M = 300

const base = makeMobilithekConnector({
  quelleId: "0152",
  name: "BAB AlD — Arbeitsstellen längerer Dauer, Vorschau (Autobahn GmbH, Mobilithek)",
  url: ALD_URL,
  schedule: "0 5 * * *", // 1× täglich — Planungsdaten ändern sich langsam, 177 MB nicht 3× ziehen
})

const norm = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "") // "A 5" → "A5"
/** Straßen-Ref bestimmen: strassenRef, sonst Autobahn-Nummer aus dem Namen ("A8 …" → "A8"). */
function roadKey(o) {
  if (o.strassenRef) return norm(o.strassenRef)
  const m = String(o.name || "").match(/\bA\s?\d+\b/i)
  return m ? norm(m[0]) : ""
}
function distM(aLat, aLng, bLat, bLng) {
  const R = 6371000, t = Math.PI / 180
  const dLa = (bLat - aLat) * t, dLo = (bLng - aLng) * t
  const x = Math.sin(dLa / 2) ** 2 + Math.cos(aLat * t) * Math.cos(bLat * t) * Math.sin(dLo / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(x))
}

export const babAldVorschauConnector = {
  ...base,
  vollbestand: false,
  async fetch(opts = {}) {
    const { db, log = () => {} } = opts
    const res = await base.fetch(opts)
    const all = Array.isArray(res?.obstacles) ? res.obstacles : []
    if (res?.unveraendert) return res // 304/204 unverändert durchreichen

    const today = new Date().toISOString().slice(0, 10)
    const future = all.filter((o) => o.gueltigVon && o.gueltigVon > today && Number.isFinite(o.lat) && Number.isFinite(o.lng))

    // Cross-Source-Dedup gegen Live-Bestand 0001/0145 (kein gemeinsamer ID-Schlüssel → Lage+Straße).
    let neu = future
    if (db && future.length) {
      const { rows } = await db.query(
        "SELECT lat, lng, strassen_ref FROM obstacles WHERE quellen_id = ANY($1) AND aktiv = true AND lat IS NOT NULL",
        [DEDUP_QUELLEN],
      )
      const byRoad = new Map()
      for (const r of rows) {
        const k = norm(r.strassen_ref)
        const arr = byRoad.get(k)
        if (arr) arr.push(r); else byRoad.set(k, [r])
      }
      neu = future.filter((o) => {
        const cands = byRoad.get(roadKey(o)) || []
        return !cands.some((r) => distM(o.lat, o.lng, Number(r.lat), Number(r.lng)) <= DEDUP_RADIUS_M)
      })
    }
    log(`0152: ${all.length} AlD-Records → ${future.length} künftig startend → ${neu.length} NEU (nach 0001/0145-Dedup)`)
    return { obstacles: neu }
  },
}
