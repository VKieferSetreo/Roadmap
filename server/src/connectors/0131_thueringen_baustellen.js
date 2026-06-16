// Connector Quelle 0131: Thüringen — Baustellen/Sperrungen (TLBV BIS, baustellen.tlbv.de).
// Kein WFS — die NOVASIB-BIS-App liefert GeoJSON über einen RPI_GI-JSON-POST (GetMapJson).
// 2-Call-Flow: GET /app/Bis/ setzt ASP.NET_SessionId-Cookie, dann POST mit diesem Cookie.
// Landesweit bis Gemeindeebene (A/B/L/K/G), EPSG:25832 → utmZuWgs84(.,.,32), LineString.
// Lizenz: dl-de/by-2.0 (Namensnennung TLBV). ZOOM_LEVEL ≥ 5 nötig (sonst "erst ab Level 5 sichtbar").

import { makeNormalized, reprojGeom, dateOnly, tonnageAusText, meterAusText, stabilHash } from "./_helpers.js"

const QUELLE = "0131"
const QUELLE_NAME = "Thüringen — Baustellen/Sperrungen (TLBV BIS)"
const QUELLE_URL = "https://baustellen.tlbv.de/app/Bis/"
const BASE = "https://baustellen.tlbv.de"
// MBR = Thüringen-weite Bounding-Box in EPSG:25832; ZOOM_LEVEL 5 passiert das Sichtbarkeits-Gate
// und liefert in einem Call den Landesbestand.
const MBR = [560000, 5550000, 760000, 5790000]

function refAus(s) { const m = String(s ?? "").match(/\b([ABLK])\s?(\d{1,4})\b/); return m ? `${m[1]}${m[2]}` : null }

function envelope() {
  return {
    INTERFACE: "RPI_GI", REM: "", VERSION: "1.0.0",
    METADATA: { OID: "", SESSIONID: "", ANSWER_TYPE: "JSON" },
    CATEGORY: {
      FUNCTION: "GetGISObjects", TIMESTAMP: "2026-01-01 00:00:00", USE_MBR: 1,
      TIMEFILTER: { TIMBEGIN: "2020-01-01 00:00:00", TIMEND: "2099-12-31 23:59:59" },
      ROUTING: { RTGBEGIN: 0, RTGEND: 0, RTGDIR: 0 },
    },
    GEODATA: { COORDS: [], MBR, NET_TYPE: "S", SUB_TYPE: "ABLKGSN", ZOOM_LEVEL: 5, RESOLUTION: 50, ROTATION: 0 },
    CACHEINFO: { FILE_NAME: "", FILE_PATH: "", PACK_DATA: 1 }, METAINFOS: { REG_CODE: 0 },
  }
}

async function ladeGeoJSON({ timeoutMs }) {
  const ua = { "user-agent": "roadmap-connector/1.0" }
  const g = await fetch(QUELLE_URL, { headers: ua, signal: AbortSignal.timeout(timeoutMs) })
  const sc = typeof g.headers.getSetCookie === "function" ? g.headers.getSetCookie() : [g.headers.get("set-cookie")]
  const cookie = (sc || []).filter(Boolean).map((c) => c.split(";")[0]).join("; ")
  const r = await fetch(`${BASE}/app/Bis/BisMap/GetMapJson`, {
    method: "POST",
    headers: { ...ua, "content-type": "application/json", "x-requested-with": "XMLHttpRequest", referer: QUELLE_URL, cookie },
    body: JSON.stringify({ requestJson: envelope(), mapFilter: {} }),
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!r.ok) return null
  const outer = await r.json()
  let gj = outer?.geojson ?? outer
  if (typeof gj === "string") { try { gj = JSON.parse(gj) } catch { return null } }
  return gj
}

export const thueringenBaustellenConnector = {
  quelleId: QUELLE,
  name: QUELLE_NAME,
  schedule: "0 8,12,18 * * *",
  vollbestand: true,

  async fetch({ timeoutMs = 60000, log = () => {} } = {}) {
    const gj = await ladeGeoJSON({ timeoutMs })
    const feats = gj?.features ?? []
    const obstacles = feats.map((f) => {
      const p = f.properties ?? {}
      const geom = reprojGeom(f.geometry, 32)
      let c = geom?.coordinates
      while (Array.isArray(c) && Array.isArray(c[0])) c = c[0]
      const [lng, lat] = Array.isArray(c) ? c : [null, null]
      const istLinie = geom?.type === "LineString" || geom?.type === "MultiLineString"
      const sperrtext = [p.BESCHRSP, p.ARTSP, p.TYPSP].filter(Boolean).join(" ")
      const vollsperrung = /vollsperr/i.test(sperrtext) || undefined
      const grund = [p.S_GRUND, p.S_ORTBEZ].filter(Boolean).join(" · ")
      const tonnage = tonnageAusText(grund)
      return makeNormalized({
        externeId: p.DOKSPERRID != null ? `tlbv#${p.DOKSPERRID}#${p.RID ?? ""}` : `tlbv#${stabilHash(lat, lng, p.S_GRUND)}`,
        kategorie: tonnage ? "gewicht" : vollsperrung ? "sperrung" : "baustelle",
        name: p.S_GRUND || p.S_STRBEZ || "Baustelle",
        beschreibung: grund || null,
        lat, lng,
        strassenRef: refAus(p.S_STRBEZ) ?? (p.S_STRBEZ || null),
        attrs: { maxGewichtT: tonnage, restbreiteM: meterAusText(grund, /breite|einengung/i), vollsperrung },
        gueltigVon: dateOnly(p.S_VON), gueltigBis: dateOnly(p.S_BIS), realerStart: dateOnly(p.S_VON),
        geom: istLinie ? geom : null,
        quelleName: QUELLE_NAME, quelleUrl: QUELLE_URL,
      })
    })
    log(`${QUELLE}: ${feats.length} Maßnahmen`)
    return { obstacles }
  },
}
