// One-off: prüft den Gegenfahrbahn-Filter gegen ECHTE Strecken + echte Hindernisse,
// OHNE etwas zu schreiben. Listet jede Linien-Meldung, die wegfiele, samt Richtungstext
// zum Gegenprüfen. Self-contained (nur pg + DATABASE_URL) — läuft im api-Container.
//   docker cp scripts/verify_richtungsfilter.mjs <api>:/app/ && docker exec -w /app <api> node verify_richtungsfilter.mjs
import pg from "pg"

const DEG = Math.PI / 180
const M_PER_DEG_LAT = 111_320
const CORRIDOR_M = 20
const OPPOSITE_DEG = 120
const PROJECTS = ["14c0b60b-9c35-493f-b962-8034122e7742", "cccccccc-0000-4000-8000-000000000001"]

const haversineKm = (a, b) => {
  const dLat = (b.lat - a.lat) * DEG, dLng = (b.lng - a.lng) * DEG
  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(a.lat * DEG) * Math.cos(b.lat * DEG)
  return 2 * 6371 * Math.asin(Math.sqrt(h))
}
const cumulativeKm = (pts) => { const c = [0]; for (let i = 1; i < pts.length; i++) c.push(c[i - 1] + haversineKm(pts[i - 1], pts[i])); return c }
function nearestOnRoute(point, geo, cum) {
  const mLng = M_PER_DEG_LAT * Math.cos(point.lat * DEG)
  let best = { distM: Infinity, km: 0 }
  for (let i = 0; i < geo.length - 1; i++) {
    const a = geo[i], b = geo[i + 1]
    const ax = (a.lng - point.lng) * mLng, ay = (a.lat - point.lat) * M_PER_DEG_LAT
    const bx = (b.lng - point.lng) * mLng, by = (b.lat - point.lat) * M_PER_DEG_LAT
    const dx = bx - ax, dy = by - ay, lenSq = dx * dx + dy * dy
    const t = lenSq === 0 ? 0 : Math.min(1, Math.max(0, -(ax * dx + ay * dy) / lenSq))
    const distM = Math.hypot(ax + t * dx, ay + t * dy)
    if (distM < best.distM) best = { distM, km: cum[i] + t * (cum[i + 1] - cum[i]) }
  }
  return best
}
function bbox(geo, m) {
  let minLat = 1e9, maxLat = -1e9, minLng = 1e9, maxLng = -1e9
  for (const p of geo) { minLat = Math.min(minLat, p.lat); maxLat = Math.max(maxLat, p.lat); minLng = Math.min(minLng, p.lng); maxLng = Math.max(maxLng, p.lng) }
  const latPad = m / M_PER_DEG_LAT
  const lngPad = m / (M_PER_DEG_LAT * Math.max(0.2, Math.cos(Math.max(Math.abs(minLat), Math.abs(maxLat)) * DEG)))
  return { minLat: minLat - latPad, maxLat: maxLat + latPad, minLng: minLng - lngPad, maxLng: maxLng + lngPad }
}
const bearingDeg = (a, b) => {
  const y = Math.sin((b.lng - a.lng) * DEG) * Math.cos(b.lat * DEG)
  const x = Math.cos(a.lat * DEG) * Math.sin(b.lat * DEG) - Math.sin(a.lat * DEG) * Math.cos(b.lat * DEG) * Math.cos((b.lng - a.lng) * DEG)
  return (Math.atan2(y, x) / DEG + 360) % 360
}
function pointAtKm(geo, cum, km) {
  const total = cum[cum.length - 1]
  if (km <= 0) return geo[0]; if (km >= total) return geo[geo.length - 1]
  for (let i = 1; i < cum.length; i++) if (cum[i] >= km) {
    const seg = cum[i] - cum[i - 1], t = seg === 0 ? 0 : (km - cum[i - 1]) / seg
    return { lat: geo[i - 1].lat + t * (geo[i].lat - geo[i - 1].lat), lng: geo[i - 1].lng + t * (geo[i].lng - geo[i - 1].lng) }
  }
  return geo[geo.length - 1]
}
function lineBearingDeg(pts, minKm = 0.12) {
  if (!Array.isArray(pts) || pts.length < 2) return null
  const a = pts[0], b = pts[pts.length - 1]
  return haversineKm(a, b) < minKm ? null : bearingDeg(a, b)
}
function routeBearingAtKm(geo, cum, km, w = 0.3) {
  const total = cum[cum.length - 1]
  const a = pointAtKm(geo, cum, Math.max(0, km - w)), b = pointAtKm(geo, cum, Math.min(total, km + w))
  return haversineKm(a, b) < 1e-4 ? null : bearingDeg(a, b)
}
const angleDeltaDeg = (a, b) => { const d = Math.abs((a - b) % 360); return d > 180 ? 360 - d : d }
// gleiche Logik wie engine/geometry.js obstacleRouteRelation
function obstacleRouteRelation(pts, geo, cum, corridorM, oppositeDeg) {
  if (!Array.isArray(pts) || pts.length < 2) return { rel: "none", parKm: 0, oppKm: 0 }
  const parallelMax = 180 - oppositeDeg
  let parallelKm = 0, oppositeKm = 0
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], segKm = haversineKm(a, b)
    if (segKm === 0) continue
    const mid = { lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2 }
    const near = nearestOnRoute(mid, geo, cum)
    if (near.distM > corridorM) continue
    const rBear = routeBearingAtKm(geo, cum, near.km)
    if (rBear == null) continue
    const d = angleDeltaDeg(bearingDeg(a, b), rBear)
    if (d > oppositeDeg) oppositeKm += segKm
    else if (d < parallelMax) parallelKm += segKm
  }
  const rel = parallelKm >= 0.1 ? "parallel" : oppositeKm > 0 ? "opposite" : "none"
  return { rel, parKm: parallelKm, oppKm: oppositeKm }
}
function geomPoints(geom) {
  if (!geom || typeof geom !== "object") return []
  const out = []
  const add = (line) => { if (Array.isArray(line)) for (const p of line) if (Array.isArray(p) && isFinite(p[0]) && isFinite(p[1])) out.push({ lat: p[1], lng: p[0] }) }
  if (geom.type === "LineString") add(geom.coordinates)
  else if (geom.type === "MultiLineString") geom.coordinates.forEach(add)
  return out
}
const vonNach = (b) => (String(b ?? "").match(/([A-Za-zÄÖÜäöüß.\- ]+->[A-Za-zÄÖÜäöüß.\- ]+)/)?.[1] ?? "").trim()

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 3 })

for (const pid of PROJECTS) {
  const pr = await pool.query("SELECT name, tenant_id, routes FROM projects WHERE id=$1", [pid])
  if (!pr.rows.length) { console.log(`\n### ${pid}: nicht gefunden`); continue }
  const { name, tenant_id, routes } = pr.rows[0]
  console.log(`\n${"=".repeat(80)}\n### ${name}  (tenant=${tenant_id ?? "—"})`)

  for (const route of routes) {
    const geo = (route.points ?? []).filter((p) => isFinite(p.lat) && isFinite(p.lng))
    if (geo.length < 2) continue
    const cum = cumulativeKm(geo)
    const bb = bbox(geo, CORRIDOR_M)
    const { rows } = await pool.query(
      `SELECT id, kategorie, strassen_ref, name, beschreibung, lat, lng, geom FROM obstacles
         WHERE aktiv AND (tenant_id IS NULL OR tenant_id=$1::uuid)
         AND lat BETWEEN $2 AND $3 AND lng BETWEEN $4 AND $5`,
      [tenant_id, bb.minLat, bb.maxLat, bb.minLng, bb.maxLng],
    )
    let punkteMatched = 0, lineKept = 0, lineDropped = 0
    const drops = [], keptLines = []
    for (const o of rows) {
      const pts = geomPoints(o.geom)
      let near = nearestOnRoute({ lat: o.lat, lng: o.lng }, geo, cum)
      for (const p of pts) { if (near.distM <= CORRIDOR_M) break; const n = nearestOnRoute(p, geo, cum); if (n.distM < near.distM) near = n }
      if (near.distM > CORRIDOR_M) continue
      if (pts.length < 2) { punkteMatched++; continue } // Punkt → immer behalten
      const { rel, parKm, oppKm } = obstacleRouteRelation(pts, geo, cum, CORRIDOR_M, OPPOSITE_DEG)
      if (rel === "none") { punkteMatched++; continue } // keine Korridor-Überlappung → behalten (wie Punkt)
      const rec = { ref: o.strassen_ref, name: o.name, vonNach: vonNach(o.beschreibung), rel, parKm: parKm.toFixed(2), oppKm: oppKm.toFixed(2), km: near.km.toFixed(1) }
      if (rel === "opposite") { lineDropped++; drops.push(rec) } else { lineKept++; keptLines.push(rec) }
    }
    console.log(`\nRoute "${route.name}" (${geo.length} Pkt): Punkte behalten=${punkteMatched}, Linien behalten=${lineKept}, Linien GEDROPPT=${lineDropped}`)
    if (drops.length) {
      console.log(`  — GEDROPPT (Gegenfahrbahn, oppKm>parKm):`)
      for (const d of drops) console.log(`    [${d.ref}] km${d.km} par=${d.parKm} opp=${d.oppKm}km  «${d.vonNach}»  ${d.name}`)
    }
    if (keptLines.length) {
      console.log(`  — behaltene Linien (par≥opp = gleiche Richtung überwiegt):`)
      for (const d of keptLines) console.log(`    [${d.ref}] km${d.km} par=${d.parKm} opp=${d.oppKm}km  «${d.vonNach}»`)
    }
  }
}
await pool.end()
