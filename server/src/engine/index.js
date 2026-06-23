// Analyse-Engine v2: pro Projekt-Route (routes[]) Hindernisse im Korridor matchen
// → Regelwerk anwenden → Ergebnis transaktional persistieren (Findings ersetzen,
// Projekt updaten). EINE Gesamt-Auswertung über alle Strecken; jeder Fund kennt
// seine Route (routeId/routeName) und seine km-Position auf SEINER Route.
//
// Der Legacy-startziel-Pfad (resolveRoute.js inkl. OSRM/Nominatim-Kaskade) bleibt
// im Code, wird vom FE aber nicht mehr erzeugt — Routen kommen als Punktlisten.

import { rowToObstacle } from "../map.js"
import { BATCH_ROWS, chunk, placeholders } from "../dbBatch.js"
import { OBSTACLE_COLS } from "../obstaclesRepo.js"
import { downsample } from "./fallback.js"
import {
  bboxWithBuffer, buildRouteGrid, clipGeomToCorridor, cumulativeKm, haversineKm, nearestOnRoute, obstacleRouteRelation, totalKm,
} from "./geometry.js"
import { AUSWERTUNG_AUSGESCHLOSSEN, evaluate } from "./rules.js"
import { ApiError, isFiniteNumber } from "../util.js"

export const ENGINE_VERSION = "2.0.0"

// Findings-Persistenz (T-330): Spalten an einer Stelle für den Multi-Row-INSERT-Batch.
const FINDING_COLS = `project_id, obstacle_id, kategorie, severity, titel, beschreibung,
  lat, lng, km, detail, strassen_ref, gueltig_von, gueltig_bis, quelle, zustaendig,
  route_id, route_name, geom`
const FINDING_COL_COUNT = 18
const findingParams = (projectId, f) => [
  projectId, f.obstacleId, f.kategorie, f.severity, f.titel, f.beschreibung,
  f.lat, f.lng, f.km, JSON.stringify(f.detail ?? {}), f.strassenRef ?? null,
  f.gueltigVon ?? null, f.gueltigBis ?? null,
  f.quelle != null ? JSON.stringify(f.quelle) : null, f.zustaendig ?? null,
  f.routeId ?? null, f.routeName ?? null, f.geom != null ? JSON.stringify(f.geom) : null,
]

const round1 = (n) => Math.round(n * 10) / 10
const sanePoint = (p) => p && isFiniteNumber(p.lat) && isFiniteNumber(p.lng)

/** Alle Stützpunkte einer GeoJSON-Linie/MultiLinie als {lat,lng} (GeoJSON-Reihenfolge [lng,lat]). */
function geomPoints(geom) {
  if (!geom || typeof geom !== "object") return []
  const out = []
  const addLine = (line) => {
    if (!Array.isArray(line)) return
    for (const p of line) {
      if (Array.isArray(p) && isFiniteNumber(p[0]) && isFiniteNumber(p[1])) out.push({ lat: p[1], lng: p[0] })
    }
  }
  if (geom.type === "LineString") addLine(geom.coordinates)
  else if (geom.type === "MultiLineString" && Array.isArray(geom.coordinates)) geom.coordinates.forEach(addLine)
  return out
}

// Schrittweite für den (rein DARSTELLENDEN) Korridor-Clip an die Linienlänge koppeln: clip
// densifiziert alle stepM Meter einen Punkt und prüft je Punkt nearestOnRoute (O(Routenpunkte)) →
// Kost ≈ (Länge / stepM) × Routenpunkte. Bei festem stepM=15 blockierte eine ~50-km-Linie ~2 s.
// stepM so wählen, dass ~max. CLIP_SAMPLES Dense-Punkte entstehen → gedeckelte Kost; auf Karten-
// Zoom optisch unverändert und OHNE Einfluss auf Bewertung/severity (clip = nur gerenderte Linie).
const CLIP_SAMPLES = 300
function clipStepM(obstaclePts) {
  let lenM = 0
  for (let i = 1; i < obstaclePts.length; i++) lenM += haversineKm(obstaclePts[i - 1], obstaclePts[i]) * 1000
  return Math.max(15, Math.round(lenM / CLIP_SAMPLES))
}

// Nur ECHT redundante Punkt-Dubletten zusammenfassen: gleiche Route + Kategorie + (normalisierte)
// Bezeichnung + ko-lokalisiert (Δkm ≤ DUP_KM) = dasselbe reale Hindernis doppelt gemeldet.
// WICHTIG: Einträge mit eigener Linien-Geometrie (geom) werden NIE zusammengefasst — das sind
// distinkte Strecken, oft die zwei Fahrtrichtungen/Fahrbahnen derselben Maßnahme. Die bleiben
// beide erhalten ("nicht dass die rausgehen") und das FE stellt sie als EINEN aufsplittbaren
// Marker mit Tabs dar. Behalten wird der schwerste Fund.
const DUP_KM = 0.15 // 150 m — nur wirklich ko-lokalisierte Punkt-Dubletten
const SEV_RANK = { kritisch: 3, warnung: 2, hinweis: 1 }
// Gegenfahrbahn-Filter: ab dieser Winkeldifferenz (Grad) zwischen Hindernis-Linie und
// Route-Richtung gilt die Linie als Gegenfahrbahn → für diese Fahrtrichtung irrelevant.
// 120° = klar entgegengesetzt; alles darunter (parallel/quer/zweideutig) bleibt drin.
const OPPOSITE_DEG = 120
// Enger "Same-Lane"-Radius für den Gegenfahrbahn-Filter: Segmente ≤ SAME_LANE_M gelten
// richtungsunabhängig als unsere Fahrbahn. MUSS kleiner sein als der Match-Korridor (corridorM,
// ~20 m) — sonst fällt die nur wenige Meter daneben liegende Gegenfahrbahn unter "unsere
// Fahrbahn" und würde nie ausgeblendet (genau der Gegenverkehr-Bug). 8 m ≈ Fahrstreifenbreite.
const SAME_LANE_M = Number(process.env.SAME_LANE_M ?? 8)
const normName = (s) => String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ")

export function dedupeFindings(findings) {
  const kept = []
  for (const f of findings) {
    const key = `${f.routeId}|${f.kategorie}|${normName(f.titel)}`
    // Strecken-Funde (beide mit geom) NICHT mergen → Fahrtrichtungen bleiben getrennt.
    const dup = kept.find(
      (k) => k.__key === key && Math.abs(k.km - f.km) <= DUP_KM && !(k.geom && f.geom),
    )
    if (!dup) {
      kept.push({ ...f, __key: key })
      continue
    }
    const fr = SEV_RANK[f.severity] ?? 0
    const dr = SEV_RANK[dup.severity] ?? 0
    if (fr > dr || (fr === dr && f.geom && !dup.geom)) Object.assign(dup, f, { __key: key })
  }
  // eslint-disable-next-line no-unused-vars
  const same = kept.map(({ __key, ...f }) => f)
  return dropCrossSourceDuplicates(same)
}

// #22 (Max 2026-06-21): Dieselbe reale Stelle (obstacleId) wird oft von VIELEN Strecken eines
// Projekts passiert — bei z.B. 100 hochgeladenen Strecken über dieselbe Baustelle meldete die
// Engine 100 separate Funde. Über das ganze Projekt auf EINEN Fund je Stelle zusammenfassen
// (den schwersten behalten; bei Gleichstand den ersten = niedrigste km). Die km-/Routen-Zuordnung
// des behaltenen Funds bleibt erhalten (eine Strecke ist Repräsentant). Funde ohne obstacleId
// (sollte es nicht geben) bleiben unangetastet.
export function dedupeByObstacle(findings) {
  const byId = new Map()
  const out = []
  for (const f of findings) {
    if (f.obstacleId == null) {
      out.push(f)
      continue
    }
    const prev = byId.get(f.obstacleId)
    if (!prev) {
      byId.set(f.obstacleId, f)
      out.push(f)
      continue
    }
    // schwereren Fund behalten (in-place, Referenz in out bleibt erhalten)
    if ((SEV_RANK[f.severity] ?? 0) > (SEV_RANK[prev.severity] ?? 0)) Object.assign(prev, f)
  }
  return out
}

// Quellenübergreifende Dubletten: dieselbe Maßnahme aus ZWEI externen Quellen (z.B. Autobahn-Live
// + BAB-AkD-Planung über Mobilithek) erscheint doppelt — gleiche Route+Kategorie, km ≤ DUP_KM,
// aber unterschiedliche Quelle und meist unterschiedlicher Titel (greift der Titel-Dedup oben NICHT).
// Regel (Max 2026-06-19): den schwächeren Fund droppen, den KRITISCHEREN behalten. Gleich-schwere
// bleiben beide (könnten zwei Fahrtrichtungen oder echte Doppelmaßnahmen sein). Eigene Einträge
// (herkunft 'eigen') werden NIE automatisch gedroppt.
function dropCrossSourceDuplicates(findings) {
  const drop = new Set()
  for (const f of findings) {
    if (f.herkunft === "eigen" || drop.has(f)) continue
    for (const g of findings) {
      if (g === f || g.herkunft === "eigen" || drop.has(g)) continue
      if (f.routeId !== g.routeId || f.kategorie !== g.kategorie) continue
      if (Math.abs(f.km - g.km) > DUP_KM) continue
      if (normName(f.quelle?.name) === normName(g.quelle?.name)) continue // gleiche Quelle → behalten
      const rf = SEV_RANK[f.severity] ?? 0
      const rg = SEV_RANK[g.severity] ?? 0
      if (rf < rg) {
        drop.add(f)
        break
      }
      if (rg < rf) drop.add(g)
    }
  }
  return findings.filter((x) => !drop.has(x))
}

/** Analysierbare Routen: nur die mit ≥2 validen Punkten (Geometrie = points). */
export function usableRoutes(routes) {
  return (Array.isArray(routes) ? routes : [])
    .map((r) => ({
      ...r,
      points: Array.isArray(r?.points) ? r.points.filter(sanePoint) : [],
    }))
    .filter((r) => r.points.length >= 2)
}

/** Reine Analyse (ohne Persistenz): liest Hindernisse via db, berechnet Findings. */
export async function analyze({ db, project, corridorM }) {
  const routes = usableRoutes(project.routes)
  if (routes.length === 0) {
    throw new ApiError(422, "Keine Strecke mit Punkten vorhanden — Strecke hochladen")
  }

  // T-330: Geometrie/Korridor je Route einmal vorbereiten, dann EIN SELECT über die OR-Verknüpfung
  // aller Routen-Bboxen statt R einzelner Queries — jedes Hindernis (inkl. geom-Blob) wird so nur
  // einmal aus der DB gezogen, auch wenn es im Korridor mehrerer Teilstrecken liegt. Bewusst die
  // OR-Verknüpfung der kleinen Boxen, NICHT die umschließende Gesamt-Bbox: bei weit auseinander
  // liegenden Teilstrecken (mehrere Bundesländer) würde die Hüll-Box halb Deutschland in den Heap ziehen.
  const routeCtx = routes.map((route) => {
    const geometry = downsample(route.points.map((p) => ({ lat: p.lat, lng: p.lng })))
    // Gitter-Index je Route einmal bauen → nearestOnRoute/clip prüfen nur nahe Segmente statt aller
    // ~2000 (Hauptkost bei langen Routen mit vielen Kandidaten-Hindernissen). Gleiche Treffer.
    return { route, geometry, cum: cumulativeKm(geometry), bbox: bboxWithBuffer(geometry, corridorM), grid: buildRouteGrid(geometry) }
  })

  let findings = []
  let distanzKm = routeCtx.reduce((sum, c) => sum + totalKm(c.geometry), 0)

  // v3: globale Hindernisse + Kunden-Einträge des Projekt-Tenants. Bbox-Vorfilter in SQL, exaktes
  // Korridor-Matching danach in JS — pro Route gegen ihre eigene Bbox (gleiche Funde wie zuvor).
  const params = [project.tenantId ?? null]
  const boxSql = routeCtx
    .map((c) => {
      const i = params.push(c.bbox.minLat, c.bbox.maxLat, c.bbox.minLng, c.bbox.maxLng) - 4
      return `(lat BETWEEN $${i + 1} AND $${i + 2} AND lng BETWEEN $${i + 3} AND $${i + 4})`
    })
    .join(" OR ")
  const exclIdx = params.push(AUSWERTUNG_AUSGESCHLOSSEN)
  const { rows } = await db.query(
    `SELECT ${OBSTACLE_COLS}, geom FROM obstacles WHERE aktiv = true
       AND (tenant_id IS NULL OR tenant_id = $1::uuid)
       AND (${boxSql})
       AND kategorie <> ALL($${exclIdx}::text[])`, // Bauwerke raus — macht das Strecken-Engineering
    params,
  )
  const obstacles = rows.map(rowToObstacle)

  // Event-Loop-Schonung: Das Matching ist reine CPU (nearestOnRoute über die ganze Geometrie je
  // Hindernis, KEIN await im Loop) und lief bei langen Mehr-Strecken-Projekten ~70 s am Stück — das
  // blockiert den single-threaded Node-Loop, die API antwortet währenddessen NIEMANDEM (Health/Seiten/
  // andere Nutzer „gehen in die Knie"). Daher ~alle 40 ms den Loop freiwillig freigeben (setImmediate):
  // andere Requests werden zwischen den Häppchen bedient, die Analyse wird nur minimal länger.
  // ponytail: kooperatives Yielding (eine CPU / ein Loop). Echte Parallelität vieler schwerer Analysen
  // bräuchte eine Job-Queue / Worker-Thread — erst bauen, wenn gleichzeitige Langläufe real auftreten.
  let lastYield = Date.now()
  // Gibt den Event-Loop frei, wenn seit dem letzten Yield > ~40 ms CPU vergangen sind. Wird sowohl
  // je Hindernis als auch im inneren Stützpunkt-Scan aufgerufen — ein einzelnes langes Linien-
  // Hindernis (viele geom-Punkte) im großen Korridor-Bbox scannte sonst ~2 s am Stück (Lag-Spike).
  const maybeYield = async () => {
    if (Date.now() - lastYield > 40) {
      await new Promise((r) => setImmediate(r))
      lastYield = Date.now()
    }
  }
  for (const { route, geometry, cum, bbox, grid } of routeCtx) {
    for (const obstacle of obstacles) {
      await maybeYield()
      // nur Hindernisse in der Bbox DIESER Route prüfen (inkl., wie BETWEEN zuvor).
      if (
        obstacle.lat < bbox.minLat || obstacle.lat > bbox.maxLat ||
        obstacle.lng < bbox.minLng || obstacle.lng > bbox.maxLng
      ) continue
      const obstaclePts = geomPoints(obstacle.geom)
      // Punkt-Hindernis: Abstand des Punkts zur Route. Strecken-Hindernis (geom = Linie):
      // den Linien-Stützpunkt nehmen, der der Route am NÄCHSTEN ist — so greift eine an der
      // Route entlanglaufende Maßnahme auch dann, wenn ihr Mittel-/Ankerpunkt versetzt liegt,
      // und ein Punkt 16 m neben der Route fällt sauber raus.
      let near = nearestOnRoute({ lat: obstacle.lat, lng: obstacle.lng }, geometry, cum, grid)
      for (let pi = 0; pi < obstaclePts.length; pi++) {
        const p = obstaclePts[pi]
        if (near.distM <= corridorM) break // schon im Korridor — günstig, kein Weitersuchen nötig
        if ((pi & 63) === 0) await maybeYield() // alle 64 Stützpunkte den Loop atmen lassen
        const n = nearestOnRoute(p, geometry, cum, grid)
        if (n.distM < near.distM) near = n
      }
      if (near.distM > corridorM) continue

      // Gegenfahrbahn-Filter: Strecken-Meldungen (Linien-Geometrie, faktisch nur Autobahn)
      // laufen je Fahrbahn als eigene Linie in REISERICHTUNG (Daten geprüft: Koordinaten-
      // Reihenfolge = Fahrtrichtung). Läuft die Linie im Korridor ÜBERWIEGEND gegen die
      // Reiserichtung (Gegenfahrbahn), passiert der Transport sie nicht → ausblenden.
      // obstacleRouteRelation gewichtet segmentweise nach Länge mit lokalem Kurs; Punkte
      // und nur-quer/zweideutig liegende Linien → "none"/"parallel" → bleiben IMMER drin.
      // coincidentM = enger Same-Lane-Radius (NICHT der 20-m-Match-Korridor!), damit die nur
      // wenige Meter daneben liegende Gegenfahrbahn in den Bearing-Check-Ring fällt und als
      // gegenläufig ausgeblendet wird; relationM weiter, um den Mittelstreifen-Abstand zu erfassen.
      const relation = obstacleRouteRelation(obstaclePts, geometry, cum, {
        coincidentM: Math.min(SAME_LANE_M, corridorM),
        relationM: Math.max(corridorM * 3, 60),
        oppositeDeg: OPPOSITE_DEG,
      })
      if (relation === "opposite") continue
      const verdict = evaluate(obstacle, project.transport, project.zeitraum)
      if (!verdict) continue
      // Linien-Geometrie auf den Routen-Korridor clippen → nur der durchfahrene Teil der Baustelle
      // wird gerendert (nicht die ganze, oft kilometerlange Quell-Linie). Fallback auf die volle
      // Linie, falls der Clip leer ausfällt — nie die Info ganz verlieren.
      // Perf/Stabilität: clipGeomToCorridor kostet ~ (Quell-Stützpunkte × Routenpunkte) und lief bei
      // sehr langen Linien-Hindernissen (~1700 Punkte) ~2 s synchron = der verbliebene Event-Loop-
      // Spike. Da der Clip NUR die gerenderte Linie bestimmt (keine Bewertung/severity), die Quelle
      // vorher auf ≤300 Punkte ausdünnen — auf Karten-Zoom optisch identisch. Yield direkt davor.
      await maybeYield()
      const geomFuerFund = obstacle.geom
        ? (clipGeomToCorridor(obstacle.geom, geometry, cum, Math.max(corridorM * 3, 60), { stepM: clipStepM(obstaclePts), grid }) ?? obstacle.geom)
        : null
      findings.push({
        obstacleId: obstacle.id,
        kategorie: obstacle.kategorie,
        severity: verdict.severity,
        titel: verdict.titel,
        // Popup zeigt den ECHTEN Quelltext (z.B. Autobahn-GmbH-Meldung), nicht unseren generierten
        // Satz. Die Bewertung steckt in severity + detail. Fallback auf den Regeltext, falls die Quelle
        // keinen Beschreibungstext liefert.
        beschreibung: (obstacle.beschreibung && obstacle.beschreibung.trim()) || verdict.beschreibung,
        detail: verdict.detail,
        lat: obstacle.lat,
        lng: obstacle.lng,
        geom: geomFuerFund, // auf den Routen-Korridor geclippte Strecke (nur durchfahrener Teil), sonst Punkt
        km: near.km, // Position auf SEINER Route — bereits deterministisch in nearestOnRoute() gerundet (#9)
        routeId: route.id,
        routeName: route.name,
        strassenRef: obstacle.strassenRef,
        gueltigVon: obstacle.gueltigVon,
        gueltigBis: obstacle.gueltigBis,
        quelle: obstacle.quelle,
        zustaendig: obstacle.zustaendig,
        herkunft: obstacle.herkunft, // 'global'|'eigen' — nur für Dedup (nicht persistiert)
      })
    }
  }
  findings = dedupeFindings(findings) // klare Dubletten (quellenübergreifend / beide Richtungen) rausschneiden
  findings = dedupeByObstacle(findings) // #22: dieselbe Stelle über viele Strecken → EIN Fund
  findings.sort((a, b) => a.km - b.km)

  distanzKm = round1(distanzKm)
  const kritisch = findings.filter((f) => f.severity === "kritisch").length
  const warnung = findings.filter((f) => f.severity === "warnung").length
  // Reine Fahrzeit-Schätzung über die Strecke (≈50 km/h Schnitt für Schwertransport).
  // KEIN Zuschlag je Fund mehr — bei vielen Funden hätte das die Zeit unrealistisch
  // aufgebläht (734 km → 156 h war Unsinn).
  const fahrzeitMin = Math.round((distanzKm / 50) * 60)

  return {
    findings,
    distanzKm,
    fahrzeitMin,
    provider: { router: "upload", fallback: false },
    stats: {
      findings: findings.length,
      kritisch,
      warnung,
      hinweis: findings.length - kritisch - warnung,
      distanzKm,
      routen: routes.length,
    },
  }
}

/**
 * Kompletter Analyse-Lauf inkl. analysis_runs-Record und transaktionaler
 * Persistenz. Wirft bei Fehlern (Projekt bleibt dann unverändert, Run = error).
 */
export async function runAnalysis({ db, project, corridorM = 20 }) {
  // T-467: verwaiste 'running'-Läufe (Prozess-Crash ohne finished_at) zuerst freigeben, sonst
  // blockiert der Partial-Unique-Index dauerhaft. 15 Min > jede reale Analyse (statement_timeout 2 Min).
  // WICHTIG: Der Reclaim MUSS zeit-prädikat-gebunden bleiben (nur Waisen >15 Min). Der
  // Partial-Unique-Index analysis_runs_one_running — NICHT dieser UPDATE — ist die Mutual-Exclusion;
  // ein Reclaim ohne Zeit-Prädikat ('alle running freigeben') öffnete ein Doppel-Run-Loch.
  await db.query(
    "UPDATE analysis_runs SET status = 'error', error = $2, finished_at = now() " +
      "WHERE project_id = $1 AND status = 'running' AND started_at < now() - interval '15 minutes'",
    [project.id, "stale (reclaimed)"],
  )
  let runRes
  try {
    runRes = await db.query(
      "INSERT INTO analysis_runs (project_id, status, engine_version) VALUES ($1, $2, $3) RETURNING id",
      [project.id, "running", ENGINE_VERSION],
    )
  } catch (err) {
    // analysis_runs_one_running (Partial-Unique-Index): es läuft bereits eine Auswertung für
    // dieses Projekt (Doppelklick / zweiter Disponent / Kollision mit Nacht-Rerun) → 409.
    if (err?.code === "23505") throw new ApiError(409, "Für dieses Projekt läuft bereits eine Auswertung")
    throw err
  }
  const runId = runRes.rows[0].id

  try {
    const result = await analyze({ db, project, corridorM })

    // Alte Findings ersetzen + Projekt aktualisieren — atomar
    await db.tx(async (q) => {
      await q.query("DELETE FROM findings WHERE project_id = $1", [project.id])
      // T-330: Findings als wenige Multi-Row-INSERTs statt eines INSERT-Round-Trips pro Fund.
      for (const part of chunk(result.findings, BATCH_ROWS)) {
        await q.query(
          `INSERT INTO findings (${FINDING_COLS}) VALUES ${placeholders(part.length, FINDING_COL_COUNT)}`,
          part.flatMap((f) => findingParams(project.id, f)),
        )
      }
      // updated_at NICHT anfassen: die Analyse (v.a. der nächtliche Auto-Rerun über ALLE
      // Projekte) ist keine Nutzer-Bearbeitung. Würde sie updated_at hochziehen, landeten
      // alle Projekte auf der Sync-Zeit und die „zuletzt bearbeitet"-Sortierung auf Home
      // wäre wertlos. updated_at bleibt damit = letzte echte Nutzer-Änderung (T-181).
      await q.query(
        `UPDATE projects SET status = $2, distanz_km = $3, fahrzeit_min = $4 WHERE id = $1`,
        [project.id, "fertig", result.distanzKm, result.fahrzeitMin],
      )
    })

    await db.query(
      `UPDATE analysis_runs SET status = $2, provider = $3, stats = $4, error = $5,
         finished_at = now() WHERE id = $1`,
      [runId, "done", JSON.stringify(result.provider), JSON.stringify(result.stats), null],
    )
    return result
  } catch (err) {
    await db.query(
      `UPDATE analysis_runs SET status = $2, provider = $3, stats = $4, error = $5,
         finished_at = now() WHERE id = $1`,
      [runId, "error", null, null, String(err?.message ?? err)],
    )
    throw err
  }
}
