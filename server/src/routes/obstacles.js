// Hindernis-Datenbank v3: globale Einträge (tenant_id NULL) + Kunden-Einträge
// (tenant_id gesetzt, nur im eigenen Mandanten sichtbar/wirksam).
//
// Rechte-Matrix (SPEC-backend-v3):
//   GET            jeder — global + eigener Tenant, Response-Feld herkunft
//   POST           jeder Tenant-Nutzer — legt tenant-eigen an (Quelle 0100, fachId auto);
//                  admin/roadmap kann mit body {global: true} global anlegen
//   PATCH/DELETE   eigene Tenant-Einträge: jeder Tenant-Nutzer; globale: admin/roadmap;
//                  fremder Tenant → 404 (kein Existenz-Orakel)
//   POST /import   wie bisher admin/roadmap, global

import { Router } from "express"
import { requireRole } from "../auth.js"
import { rowToObstacle } from "../map.js"
import {
  assignFachId, insertObstacle, insertParams, INSERT_SQL, KUNDEN_QUELLE, OBSTACLE_COLS,
  todayIso, validateObstacle,
} from "../obstaclesRepo.js"
import { ApiError, asyncHandler, isPlainObject, isUuid } from "../util.js"

// Schlanke Spalten (ohne roh/geom-Blobs) — die Übersichtskarte zieht ALLE Hindernisse.
const LIST_SQL = `SELECT ${OBSTACLE_COLS} FROM obstacles
  WHERE ($1::text IS NULL OR kategorie = $1)
    AND ($2::boolean IS NULL OR aktiv = $2)
    AND ($3::text IS NULL OR name ILIKE $3 OR beschreibung ILIKE $3
         OR strassen_ref ILIKE $3 OR zustaendig ILIKE $3)
    AND (tenant_id IS NULL OR tenant_id = $4::uuid)
  ORDER BY created_at DESC`

const mayWriteGlobal = (req) => {
  const roles = req.user?.roles ?? []
  return roles.includes("admin") || roles.includes("roadmap")
}

/**
 * Schreibrecht auf einen bestehenden Eintrag prüfen.
 * Fremder Tenant → 404 (kein Leak), globaler Eintrag ohne admin/roadmap → 403.
 */
function assertWriteAccess(req, row) {
  if (row.tenant_id != null) {
    if (req.ctx?.tenant?.id !== row.tenant_id) {
      throw new ApiError(404, "Hindernis nicht gefunden")
    }
    return // eigener Tenant-Eintrag: jede Rolle des Mandanten
  }
  if (!mayWriteGlobal(req)) throw new ApiError(403, "Keine Berechtigung")
}

/** GeoJSON-FeatureCollection (Punkte) → flache Obstacle-Inputs. */
function geojsonToInputs(body) {
  return (body.features ?? []).map((feat) => {
    if (feat?.geometry?.type !== "Point" || !Array.isArray(feat.geometry.coordinates)) {
      return { _invalid: "kein Punkt-Feature" }
    }
    const [lng, lat] = feat.geometry.coordinates
    return { ...(feat.properties ?? {}), lat, lng }
  })
}

export function obstaclesRouter({ db }) {
  const r = Router()
  const importGuard = requireRole("admin", "roadmap")

  r.get("/", asyncHandler(async (req, res) => {
    const { kategorie, q, aktiv } = req.query
    const aktivParam = aktiv === "true" ? true : aktiv === "false" ? false : null
    const { rows } = await db.query(LIST_SQL, [
      kategorie || null,
      aktivParam,
      q ? `%${q}%` : null,
      req.ctx?.tenant?.id ?? null,
    ])
    res.json({ obstacles: rows.map(rowToObstacle) })
  }))

  r.post("/", asyncHandler(async (req, res) => {
    const wantsGlobal = req.body?.global === true
    if (wantsGlobal && !mayWriteGlobal(req)) {
      throw new ApiError(403, "Globale Einträge nur mit Rolle admin/roadmap")
    }
    if (!wantsGlobal && !req.ctx?.tenant) throw new ApiError(403, "kein-mandant")

    const check = validateObstacle(req.body, { strict: true })
    if (!check.ok) throw new ApiError(400, check.reason)
    const value = check.value

    if (!wantsGlobal) {
      // Kunden-Eintrag: tenant-eigen, Defaults nur wenn nicht gesetzt
      value.tenantId = req.ctx.tenant.id
      value.quellenId = value.quellenId ?? KUNDEN_QUELLE
      value.quelle = value.quelle ?? { name: `Eigener Eintrag (${req.ctx.tenant.name})` }
      value.demo = false
    }

    const row = await db.tx(async (q) => {
      if (!value.fachId && value.quellenId) {
        // realerStart Default = heute (= Datums-Segment der vergebenen fachId)
        value.realerStart = value.realerStart ?? todayIso()
        value.fachId = await assignFachId(q, {
          quellenId: value.quellenId, realerStart: value.realerStart,
        })
      }
      return insertObstacle(q, value)
    })
    res.status(201).json(rowToObstacle(row))
  }))

  r.patch("/:id", asyncHandler(async (req, res) => {
    if (!isUuid(req.params.id)) throw new ApiError(404, "Hindernis nicht gefunden")
    const { rows: existing } = await db.query("SELECT * FROM obstacles WHERE id = $1", [req.params.id])
    if (!existing[0]) throw new ApiError(404, "Hindernis nicht gefunden")
    assertWriteAccess(req, existing[0])

    // Merge auf camelCase-Ebene, dann komplett validieren und zurückschreiben.
    // tenant_id/externe_id sind NICHT patchbar (UPDATE fasst sie nicht an).
    const merged = { ...rowToObstacle(existing[0]), ...req.body }
    const check = validateObstacle(merged)
    if (!check.ok) throw new ApiError(400, check.reason)
    const { rows } = await db.query(
      `UPDATE obstacles SET kategorie = $2, name = $3, beschreibung = $4, lat = $5, lng = $6,
         strassen_ref = $7, zustaendig = $8, quelle = $9, attrs = $10, gueltig_von = $11,
         gueltig_bis = $12, fach_id = $13, quellen_id = $14, realer_start = $15,
         aktiv = $16, demo = $17, updated_at = now()
       WHERE id = $1 RETURNING *`,
      // insertParams = [kategorie … demo, tenant_id, externe_id] — die letzten beiden
      // (Index 16/17) sind bewusst NICHT patchbar, daher slice auf die ersten 16.
      [req.params.id, ...insertParams(check.value).slice(0, 16)],
    )
    res.json(rowToObstacle(rows[0]))
  }))

  r.delete("/:id", asyncHandler(async (req, res) => {
    if (!isUuid(req.params.id)) throw new ApiError(404, "Hindernis nicht gefunden")
    const { rows: existing } = await db.query("SELECT * FROM obstacles WHERE id = $1", [req.params.id])
    if (!existing[0]) throw new ApiError(404, "Hindernis nicht gefunden")
    assertWriteAccess(req, existing[0])
    await db.query("DELETE FROM obstacles WHERE id = $1", [req.params.id])
    res.status(204).end()
  }))

  r.post("/import", importGuard, asyncHandler(async (req, res) => {
    const body = req.body
    let inputs
    if (isPlainObject(body) && body.type === "FeatureCollection") {
      inputs = geojsonToInputs(body)
    } else if (isPlainObject(body) && Array.isArray(body.obstacles)) {
      inputs = body.obstacles
    } else {
      throw new ApiError(400, "Erwartet {obstacles: [...]} oder GeoJSON-FeatureCollection")
    }

    const valid = []
    const reasons = []
    inputs.forEach((input, index) => {
      if (input?._invalid) {
        reasons.push({ index, reason: input._invalid })
        return
      }
      const check = validateObstacle(input)
      if (check.ok) valid.push(check.value) // tenantId/externeId bleiben null → global
      else reasons.push({ index, reason: check.reason })
    })

    await db.tx(async (q) => {
      for (const o of valid) await q.query(INSERT_SQL, insertParams(o))
    })
    res.json({ imported: valid.length, skipped: reasons.length, reasons })
  }))

  return r
}
