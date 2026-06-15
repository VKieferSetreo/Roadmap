// Extrahiert geordnete Wegpunkte (Stopps) aus einem Google-Maps-Link. Liefert NUR die
// Stopps (Start / Zwischenstopps / Ziel), NICHT die Straßen-Geometrie — die rechnet danach
// der Router (OSRM). Kurz-Links (maps.app.goo.gl, goo.gl/maps, g.co) werden server-seitig
// aufgelöst; im Browser ginge das wegen CORS nicht.

// "lat,lng" (Google nutzt im Pfad und in ?api=1 die Reihenfolge lat,lng).
const COORD = /^(-?\d{1,3}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)$/
const SHORT_HOST = /(^|\.)(goo\.gl|maps\.app\.goo\.gl|g\.co)$/i
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"

/** Kurz-Link server-seitig auf die volle Maps-URL auflösen (Redirects folgen).
 *  Auf DE/EU-Hosts leitet Google sonst auf consent.google.com um statt auf die Maps-Seite
 *  → CONSENT-Cookie mitschicken; landet man trotzdem auf der Consent-Seite, steckt die echte
 *  Ziel-URL im continue-Param. */
async function resolveShort(url, fetchImpl) {
  try {
    const res = await fetchImpl(url, {
      redirect: "follow",
      headers: { "User-Agent": UA, "Accept-Language": "de", Cookie: "CONSENT=YES+" },
      signal: AbortSignal.timeout(8000),
    })
    let final = res?.url || url
    if (/(^|\.)consent\.google\./i.test(safeHost(final))) {
      const cont = safeParam(final, "continue")
      if (cont) final = cont
    }
    return final
  } catch {
    return url // nicht auflösbar → Original versuchen
  }
}

const safeHost = (u) => {
  try {
    return new URL(u).hostname
  } catch {
    return ""
  }
}
const safeParam = (u, key) => {
  try {
    return new URL(u).searchParams.get(key)
  } catch {
    return null
  }
}

/** Ein Pfad-/Param-Segment → Stopp {lat,lng} (Koordinate) oder {name} (zu geokodieren). */
function toStop(raw) {
  if (!raw) return null
  const dec = decodeURIComponent(raw.replace(/\+/g, " ")).trim()
  if (!dec) return null
  const m = dec.match(COORD)
  if (m) {
    const lat = Number(m[1])
    const lng = Number(m[2])
    if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return { lat, lng }
  }
  return { name: dec }
}

/** Stopps aus einer bereits aufgelösten Maps-URL ziehen (in Reihenfolge). */
function parseStops(finalUrl) {
  let u
  try {
    u = new URL(finalUrl)
  } catch {
    return []
  }
  const sp = u.searchParams
  const stops = []

  // 1) Offizielle Maps-URLs-API: ?api=1&origin=..&waypoints=a|b&destination=..
  if (sp.get("origin") || sp.get("destination") || sp.get("waypoints")) {
    const add = (v) => {
      const s = toStop(v)
      if (s) stops.push(s)
    }
    add(sp.get("origin"))
    for (const w of (sp.get("waypoints") || "").split("|").filter(Boolean)) add(w)
    add(sp.get("destination"))
  } else if (u.pathname.includes("/maps/dir/")) {
    // 2) /maps/dir/<a>/<b>/.../@center/data=... — Pfad-Segmente sind die Stopps.
    //    "@lat,lng,zoom" = Kartenmitte (KEIN Stopp), "data=..." = Metadaten → überspringen.
    const after = u.pathname.split("/maps/dir/")[1] || ""
    for (const seg of after.split("/")) {
      if (!seg || seg.startsWith("@") || seg.startsWith("data=")) continue
      const s = toStop(seg)
      if (s) stops.push(s)
    }
  } else if (u.pathname.includes("/maps/place/")) {
    // 3) Einzel-Ort: kein Routen-Link, aber Koordinate (falls @lat,lng) als EIN Stopp.
    const at = u.pathname.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/)
    if (at) stops.push({ lat: Number(at[1]), lng: Number(at[2]) })
  }

  // 4) Fallback: aufgelöste Koordinaten im data=-Blob (!3d<lat>!4d<lng>), nur wenn die
  //    Pfad-/Param-Extraktion keine zwei Stopps lieferte. Best-effort (undokumentiert),
  //    daher nur als Rettung statt 0 Stopps.
  if (stops.length < 2) {
    const pairs = [...finalUrl.matchAll(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/g)]
      .map((m) => ({ lat: Number(m[1]), lng: Number(m[2]) }))
      .filter((p) => Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180)
    if (pairs.length >= 2) return pairs
  }
  return stops
}

/**
 * @param {string} url roher Google-Maps-Link (kurz oder lang)
 * @returns {Promise<{stops: Array<{lat?:number,lng?:number,name?:string}>, resolvedUrl: string}>}
 */
export async function extractMapsStops(url, { fetchImpl = globalThis.fetch } = {}) {
  const raw = String(url || "").trim()
  if (!raw) return { stops: [], resolvedUrl: raw }
  let u
  try {
    u = new URL(raw)
  } catch {
    return { stops: [], resolvedUrl: raw }
  }
  const resolvedUrl = SHORT_HOST.test(u.hostname) ? await resolveShort(raw, fetchImpl) : raw
  return { stops: parseStops(resolvedUrl), resolvedUrl }
}
