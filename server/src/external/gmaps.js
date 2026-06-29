// Extrahiert geordnete Wegpunkte (Stopps) aus einem Google-Maps-Link. Liefert NUR die
// Stopps (Start / Zwischenstopps / Ziel), NICHT die Straßen-Geometrie — die rechnet danach
// der Router (OSRM). Kurz-Links (maps.app.goo.gl, goo.gl/maps, g.co) werden server-seitig
// aufgelöst; im Browser ginge das wegen CORS nicht.

// "lat,lng" (Google nutzt im Pfad und in ?api=1 die Reihenfolge lat,lng).
const COORD = /^(-?\d{1,3}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)$/
const SHORT_HOST = /(^|\.)(goo\.gl|maps\.app\.goo\.gl|g\.co)$/i
// BEWUSST KEIN Browser-UA: bei maps.app.goo.gl (Firebase Dynamic Links) liefert Google einem
// Desktop-Browser-UA ein JS-Interstitial (HTTP 200, kein Redirect) → Link bleibt unaufgelöst.
// Mit einem Nicht-Browser-UA kommt das saubere 302 auf die echte google.de/maps/dir/-URL.
const UA = "roadmap-route-resolver/1.0 (+https://setreo-cloud.com)"

/** Kurz-Link server-seitig auf die volle Maps-URL auflösen (Redirects folgen).
 *  WICHTIG: KEINEN CONSENT-Cookie mitschicken. Bei maps.app.goo.gl (Firebase Dynamic Links)
 *  führt `Cookie: CONSENT=YES+` dazu, dass Google statt eines 302 auf die Maps-URL ein
 *  JS-Interstitial (HTTP 200) ausliefert → der Link bleibt unaufgelöst. Ohne den Cookie
 *  kommt das saubere 302 auf google.de/maps/dir/…. Landet man doch auf consent.google.com,
 *  steckt die echte Ziel-URL im continue-Param (Fallback unten). */
// T-301 (SSRF-Netz): resolveShort wird NUR für Google-Kurz-Hosts aufgerufen (SHORT_HOST-Gate beim
// Aufrufer) → der initiale Request geht immer an Google, und Google-Kurz-Links leiten nur auf Google
// weiter (ein Angreifer kann goo.gl nicht auf eine interne IP umbiegen). Als Netz prüfen wir die
// FINALE URL gegen eine Google-Allowlist (blockt IP-Literale/Nicht-Google) und geben sonst nichts
// zurück. KEIN manuelles Hop-für-Hop-Folgen: Google macht einen cookie-losen Consent-/ucbcb-Bounce
// (google.de ⇄ consent.google.de), der OHNE Cookie-Persistenz endlos schleift — undici 'follow'
// löst ihn auf, manuelles Folgen lief in eine Endlosschleife (Regression, live verifiziert 2026-06-21).
const ALLOW_HOST = /(^|\.)(google\.[a-z.]+|goo\.gl|g\.co)$/i
function hostErlaubt(u) {
  const h = safeHost(u)
  if (!h) return false
  if (h.includes(":")) return false // IPv6-Literal (auch ::1) nie erlauben
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) return false // IPv4-Literal (RFC1918/loopback/metadata) nie
  return ALLOW_HOST.test(h)
}

async function resolveShort(url, fetchImpl) {
  try {
    const res = await fetchImpl(url, {
      redirect: "follow", // undici folgt inkl. Googles Consent-/Cookie-Bounce bis zur Maps-URL
      headers: { "User-Agent": UA, "Accept-Language": "de" },
      signal: AbortSignal.timeout(8000),
    })
    let final = res?.url || url
    if (/(^|\.)consent\.google\./i.test(safeHost(final))) {
      const cont = safeParam(final, "continue")
      if (cont) final = cont
    }
    return hostErlaubt(final) ? final : url // finale URL muss Google sein, sonst Original
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
    // 2) /maps/dir/<a>/<b>/.../@center/data=... — der Pfad trägt nur Start+Ziel als Namen;
    //    ZWISCHENstopps stehen NUR im data=-Blob als geordnete !1d<lng>!2d<lat>-Paare.
    //    Liefert der data-Blob ≥2 Koordinaten und mind. so viele wie die Pfad-Namen, nehmen
    //    wir diese exakten (geordneten) Koordinaten — sonst die Pfad-Namen (zu geokodieren).
    const after = u.pathname.split("/maps/dir/")[1] || ""
    const nameStops = []
    for (const seg of after.split("/")) {
      if (!seg || seg.startsWith("@") || seg.startsWith("data=")) continue
      const s = toStop(seg)
      if (s) nameStops.push(s)
    }
    // (A) ECHTE Google-Share-Links kodieren die VOLLSTÄNDIGE geordnete Wegpunktliste (Start +
    //     ZWISCHENstopps + Ziel) STRUKTURIERT im data=-Blob: jeder Stopp als !2m2!1d<lng>!2d<lat>
    //     (Start/Ziel) bzw. !1m2!1d<lng>!2d<lat> (Zwischenstopps). Die Pfad-Namen nennen oft NUR
    //     Start+Ziel — die per Hand gezogenen Zwischenpunkte stehen AUSSCHLIESSLICH hier. Diese
    //     strukturierten Koordinaten sind autoritativ (präzise + komplett inkl. Vias) → bevorzugen.
    //     (Bug 2026-06-23: vorher wurden bei 2 Pfad-Namen + N data-Koordinaten ALLE Vias verworfen
    //     und nur Start/Ziel-Namen geokodiert → OSRM rechnete eine komplett andere A→B-Route.)
    const structured = [...finalUrl.matchAll(/!(?:1m2|2m2)!1d(-?\d+\.\d+)!2d(-?\d+\.\d+)/g)]
      .map((m) => ({ lat: Number(m[2]), lng: Number(m[1]) }))
      .filter((p) => Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180)
    // Strukturierte Koordinaten nur dann als autoritativ nehmen, wenn sie MINDESTENS so viele
    // Stopps liefern wie die Pfad-Namen — sonst (z.B. ein Pfad-Stopp ohne aufgelöste Koordinate
    // im Blob) lieber die vollständigen Pfad-Namen, um keinen Stopp zu verlieren.
    if (structured.length >= 2 && structured.length >= nameStops.length) return structured
    // (A2) Häufiger Share-Fall: Start+Ziel stehen als KOORDINATEN im Pfad (/maps/dir/<lat,lng>/<lat,lng>/),
    //     die per Hand GEZOGENEN Zwischenstopps NUR im Blob als !1m2!1d<lng>!2d<lat>. Dann liefert (A)
    //     zu wenige strukturierte Stopps (nur die Vias, ohne Start/Ziel) und (B) verwirft sie wegen
    //     Anzahl-Ungleichheit → das Tool fuhr Start→Ziel direkt und ließ den gezogenen Umweg weg
    //     (Bug 2026-06-29). Korrekt: die !1m2-Vias (in Blob-Reihenfolge) zwischen die Pfad-Stopps setzen.
    const vias = [...finalUrl.matchAll(/!1m2!1d(-?\d+\.\d+)!2d(-?\d+\.\d+)/g)]
      .map((m) => ({ lat: Number(m[2]), lng: Number(m[1]) }))
      .filter((p) => Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180)
    if (nameStops.length >= 2 && vias.length >= 1 && structured.length < nameStops.length) {
      return [...nameStops.slice(0, -1), ...vias, nameStops[nameStops.length - 1]]
    }
    // (B) Fallback für einfachere Links OHNE strukturierten Blob: bare !1d!2d. Der data=-Blob kann
    //     hier ZUSÄTZLICHE !1d!2d (Karten-Mitte/Viewport/POI) tragen → mehr Koordinaten als echte
    //     Wegpunkte. Darum bare-Koordinaten NUR bei exakter Anzahl-Übereinstimmung mit den
    //     Pfad-Namen (sauberer Blob), sonst die kompletten Pfad-Namen — so geht kein Stopp verloren.
    const dataCoords = [...finalUrl.matchAll(/!1d(-?\d+\.\d+)!2d(-?\d+\.\d+)/g)]
      .map((m) => ({ lat: Number(m[2]), lng: Number(m[1]) }))
      .filter((p) => Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180)
    if (nameStops.length >= 2) {
      return dataCoords.length === nameStops.length ? dataCoords : nameStops
    }
    if (dataCoords.length >= 2) return dataCoords
    stops.push(...nameStops)
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
