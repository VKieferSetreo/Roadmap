// Analyse-Engine: Route auflösen → Hindernisse im Korridor matchen → Regelwerk
// anwenden → Ergebnis transaktional persistieren (Findings ersetzen, Projekt updaten).
// Deterministisch bis auf die Provider-Wahl; Provider-Ausfälle führen in Fallbacks.

import { rowToObstacle } from "../map.js"
import { bboxWithBuffer, cumulativeKm, nearestOnRoute } from "./geometry.js"
import { resolveRoute } from "./resolveRoute.js"
import { evaluate } from "./rules.js"

export const ENGINE_VERSION = "1.0.0"

const round1 = (n) => Math.round(n * 10) / 10

/** Reine Analyse (ohne Persistenz): liest Hindernisse via db, berechnet Findings. */
export async function analyze({ db, project, deps, corridorM }) {
  const resolved = await resolveRoute(db, project.route, deps)
  const geometry = resolved.geometry
  if (!Array.isArray(geometry) || geometry.length < 2) {
    throw new Error("Route konnte nicht aufgelöst werden")
  }
  const cum = cumulativeKm(geometry)

  // Bbox-Vorfilter in SQL, exaktes Korridor-Matching danach in JS
  const bbox = bboxWithBuffer(geometry, corridorM)
  const { rows } = await db.query(
    "SELECT * FROM obstacles WHERE aktiv = true AND lat BETWEEN $1 AND $2 AND lng BETWEEN $3 AND $4",
    [bbox.minLat, bbox.maxLat, bbox.minLng, bbox.maxLng],
  )

  const findings = []
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
      km: round1(near.km),
      strassenRef: obstacle.strassenRef,
      gueltigVon: obstacle.gueltigVon,
      gueltigBis: obstacle.gueltigBis,
      quelle: obstacle.quelle,
      zustaendig: obstacle.zustaendig,
    })
  }
  findings.sort((a, b) => a.km - b.km)

  const distanzKm = round1(resolved.distanzKm)
  const kritisch = findings.filter((f) => f.severity === "kritisch").length
  const warnung = findings.filter((f) => f.severity === "warnung").length
  // deterministische Fahrzeit: 55 km/h Schnitt + Zuschläge je Fund-Schwere
  const fahrzeitMin = Math.round((distanzKm / 55) * 60 + kritisch * 25 + warnung * 10)

  return {
    geometry,
    findings,
    distanzKm,
    fahrzeitMin,
    provider: resolved.provider,
    stats: {
      findings: findings.length,
      kritisch,
      warnung,
      hinweis: findings.length - kritisch - warnung,
      distanzKm,
    },
  }
}

/**
 * Kompletter Analyse-Lauf inkl. analysis_runs-Record und transaktionaler
 * Persistenz. Wirft bei Fehlern (Projekt bleibt dann unverändert, Run = error).
 */
export async function runAnalysis({ db, project, deps, corridorM = 120 }) {
  const runRes = await db.query(
    "INSERT INTO analysis_runs (project_id, status, engine_version) VALUES ($1, $2, $3) RETURNING id",
    [project.id, "running", ENGINE_VERSION],
  )
  const runId = runRes.rows[0].id

  try {
    const result = await analyze({ db, project, deps, corridorM })

    // Alte Findings ersetzen + Projekt aktualisieren — atomar
    await db.tx(async (q) => {
      await q.query("DELETE FROM findings WHERE project_id = $1", [project.id])
      for (const f of result.findings) {
        await q.query(
          `INSERT INTO findings (project_id, obstacle_id, kategorie, severity, titel, beschreibung,
             lat, lng, km, detail, strassen_ref, gueltig_von, gueltig_bis, quelle, zustaendig)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
          [
            project.id, f.obstacleId, f.kategorie, f.severity, f.titel, f.beschreibung,
            f.lat, f.lng, f.km, JSON.stringify(f.detail ?? {}), f.strassenRef ?? null,
            f.gueltigVon ?? null, f.gueltigBis ?? null,
            f.quelle != null ? JSON.stringify(f.quelle) : null, f.zustaendig ?? null,
          ],
        )
      }
      await q.query(
        `UPDATE projects SET status = $2, route_geometry = $3, distanz_km = $4,
           fahrzeit_min = $5, updated_at = now() WHERE id = $1`,
        [project.id, "fertig", JSON.stringify(result.geometry), result.distanzKm, result.fahrzeitMin],
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
