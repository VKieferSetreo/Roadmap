// Analyse-Engine v2: pro Projekt-Route (routes[]) Hindernisse im Korridor matchen
// → Regelwerk anwenden → Ergebnis transaktional persistieren (Findings ersetzen,
// Projekt updaten). EINE Gesamt-Auswertung über alle Strecken; jeder Fund kennt
// seine Route (routeId/routeName) und seine km-Position auf SEINER Route.
//
// Der Legacy-startziel-Pfad (resolveRoute.js inkl. OSRM/Nominatim-Kaskade) bleibt
// im Code, wird vom FE aber nicht mehr erzeugt — Routen kommen als Punktlisten.

import { rowToObstacle } from "../map.js"
import { OBSTACLE_COLS } from "../obstaclesRepo.js"
import { downsample } from "./fallback.js"
import {
  bboxWithBuffer, cumulativeKm, nearestOnRoute, obstacleRouteRelation, totalKm,
} from "./geometry.js"
import { AUSWERTUNG_AUSGESCHLOSSEN, evaluate } from "./rules.js"
import { ApiError, isFiniteNumber } from "../util.js"

export const ENGINE_VERSION = "2.0.0"

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
  return kept.map(({ __key, ...f }) => f)
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

  let findings = []
  let distanzKm = 0

  for (const route of routes) {
    const geometry = downsample(route.points.map((p) => ({ lat: p.lat, lng: p.lng })))
    const cum = cumulativeKm(geometry)
    distanzKm += totalKm(geometry)

    // Bbox-Vorfilter in SQL, exaktes Korridor-Matching danach in JS.
    // v3: globale Hindernisse + Kunden-Einträge des Projekt-Tenants.
    const bbox = bboxWithBuffer(geometry, corridorM)
    const { rows } = await db.query(
      `SELECT ${OBSTACLE_COLS}, geom FROM obstacles WHERE aktiv = true
         AND (tenant_id IS NULL OR tenant_id = $1::uuid)
         AND lat BETWEEN $2 AND $3 AND lng BETWEEN $4 AND $5
         AND kategorie <> ALL($6::text[])`, // Bauwerke raus — macht das Strecken-Engineering
      [project.tenantId ?? null, bbox.minLat, bbox.maxLat, bbox.minLng, bbox.maxLng, AUSWERTUNG_AUSGESCHLOSSEN],
    )

    for (const row of rows) {
      const obstacle = rowToObstacle(row)
      const obstaclePts = geomPoints(obstacle.geom)
      // Punkt-Hindernis: Abstand des Punkts zur Route. Strecken-Hindernis (geom = Linie):
      // den Linien-Stützpunkt nehmen, der der Route am NÄCHSTEN ist — so greift eine an der
      // Route entlanglaufende Maßnahme auch dann, wenn ihr Mittel-/Ankerpunkt versetzt liegt,
      // und ein Punkt 16 m neben der Route fällt sauber raus.
      let near = nearestOnRoute({ lat: obstacle.lat, lng: obstacle.lng }, geometry, cum)
      for (const p of obstaclePts) {
        if (near.distM <= corridorM) break // schon im Korridor — günstig, kein Weitersuchen nötig
        const n = nearestOnRoute(p, geometry, cum)
        if (n.distM < near.distM) near = n
      }
      if (near.distM > corridorM) continue

      // Gegenfahrbahn-Filter: Strecken-Meldungen (Linien-Geometrie, faktisch nur Autobahn)
      // laufen je Fahrbahn als eigene Linie in REISERICHTUNG (Daten geprüft: Koordinaten-
      // Reihenfolge = Fahrtrichtung). Läuft die Linie im Korridor ÜBERWIEGEND gegen die
      // Reiserichtung (Gegenfahrbahn), passiert der Transport sie nicht → ausblenden.
      // obstacleRouteRelation gewichtet segmentweise nach Länge mit lokalem Kurs; Punkte
      // und nur-quer/zweideutig liegende Linien → "none"/"parallel" → bleiben IMMER drin.
      if (obstacleRouteRelation(obstaclePts, geometry, cum, corridorM, OPPOSITE_DEG) === "opposite") {
        continue
      }
      const verdict = evaluate(obstacle, project.transport, project.zeitraum)
      if (!verdict) continue
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
        geom: obstacle.geom ?? null, // GeoJSON-Strecke (Linie) für FE-Rendering, sonst Punkt
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
  findings = dedupeFindings(findings) // klare Dubletten (quellenübergreifend / beide Richtungen) rausschneiden
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
             route_id, route_name, geom)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
          [
            project.id, f.obstacleId, f.kategorie, f.severity, f.titel, f.beschreibung,
            f.lat, f.lng, f.km, JSON.stringify(f.detail ?? {}), f.strassenRef ?? null,
            f.gueltigVon ?? null, f.gueltigBis ?? null,
            f.quelle != null ? JSON.stringify(f.quelle) : null, f.zustaendig ?? null,
            f.routeId ?? null, f.routeName ?? null, f.geom != null ? JSON.stringify(f.geom) : null,
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
