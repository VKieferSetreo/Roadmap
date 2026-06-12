// Analyse-Engine v2: pro Projekt-Route (routes[]) Hindernisse im Korridor matchen
// → Regelwerk anwenden → Ergebnis transaktional persistieren (Findings ersetzen,
// Projekt updaten). EINE Gesamt-Auswertung über alle Strecken; jeder Fund kennt
// seine Route (routeId/routeName) und seine km-Position auf SEINER Route.
//
// Der Legacy-startziel-Pfad (resolveRoute.js inkl. OSRM/Nominatim-Kaskade) bleibt
// im Code, wird vom FE aber nicht mehr erzeugt — Routen kommen als Punktlisten.

import { rowToObstacle } from "../map.js"
import { downsample } from "./fallback.js"
import { bboxWithBuffer, cumulativeKm, nearestOnRoute, totalKm } from "./geometry.js"
import { evaluate } from "./rules.js"
import { ApiError, isFiniteNumber } from "../util.js"

export const ENGINE_VERSION = "2.0.0"

const round1 = (n) => Math.round(n * 10) / 10
const sanePoint = (p) => p && isFiniteNumber(p.lat) && isFiniteNumber(p.lng)

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

  const findings = []
  let distanzKm = 0

  for (const route of routes) {
    const geometry = downsample(route.points.map((p) => ({ lat: p.lat, lng: p.lng })))
    const cum = cumulativeKm(geometry)
    distanzKm += totalKm(geometry)

    // Bbox-Vorfilter in SQL, exaktes Korridor-Matching danach in JS
    const bbox = bboxWithBuffer(geometry, corridorM)
    const { rows } = await db.query(
      "SELECT * FROM obstacles WHERE aktiv = true AND lat BETWEEN $1 AND $2 AND lng BETWEEN $3 AND $4",
      [bbox.minLat, bbox.maxLat, bbox.minLng, bbox.maxLng],
    )

    for (const row of rows) {
      const obstacle = rowToObstacle(row)
      const near = nearestOnRoute({ lat: obstacle.lat, lng: obstacle.lng }, geometry, cum)
      if (near.distM > corridorM) continue
      const verdict = evaluate(obstacle, project.transport, project.zeitraum)
      if (!verdict) continue
      findings.push({
        obstacleId: obstacle.id,
        kategorie: obstacle.kategorie,
        severity: verdict.severity,
        titel: verdict.titel,
        beschreibung: verdict.beschreibung,
        detail: verdict.detail,
        lat: obstacle.lat,
        lng: obstacle.lng,
        km: round1(near.km), // Position auf SEINER Route
        routeId: route.id,
        routeName: route.name,
        strassenRef: obstacle.strassenRef,
        gueltigVon: obstacle.gueltigVon,
        gueltigBis: obstacle.gueltigBis,
        quelle: obstacle.quelle,
        zustaendig: obstacle.zustaendig,
      })
    }
  }
  findings.sort((a, b) => a.km - b.km)

  distanzKm = round1(distanzKm)
  const kritisch = findings.filter((f) => f.severity === "kritisch").length
  const warnung = findings.filter((f) => f.severity === "warnung").length
  // deterministische Fahrzeit: Summe(km)/55·60 + Zuschläge über ALLE Funde
  const fahrzeitMin = Math.round((distanzKm / 55) * 60 + kritisch * 25 + warnung * 10)

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
export async function runAnalysis({ db, project, corridorM = 120 }) {
  const runRes = await db.query(
    "INSERT INTO analysis_runs (project_id, status, engine_version) VALUES ($1, $2, $3) RETURNING id",
    [project.id, "running", ENGINE_VERSION],
  )
  const runId = runRes.rows[0].id

  try {
    const result = await analyze({ db, project, corridorM })

    // Alte Findings ersetzen + Projekt aktualisieren — atomar
    await db.tx(async (q) => {
      await q.query("DELETE FROM findings WHERE project_id = $1", [project.id])
      for (const f of result.findings) {
        await q.query(
          `INSERT INTO findings (project_id, obstacle_id, kategorie, severity, titel, beschreibung,
             lat, lng, km, detail, strassen_ref, gueltig_von, gueltig_bis, quelle, zustaendig,
             route_id, route_name)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
          [
            project.id, f.obstacleId, f.kategorie, f.severity, f.titel, f.beschreibung,
            f.lat, f.lng, f.km, JSON.stringify(f.detail ?? {}), f.strassenRef ?? null,
            f.gueltigVon ?? null, f.gueltigBis ?? null,
            f.quelle != null ? JSON.stringify(f.quelle) : null, f.zustaendig ?? null,
            f.routeId ?? null, f.routeName ?? null,
          ],
        )
      }
      await q.query(
        `UPDATE projects SET status = $2, distanz_km = $3, fahrzeit_min = $4,
           updated_at = now() WHERE id = $1`,
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
