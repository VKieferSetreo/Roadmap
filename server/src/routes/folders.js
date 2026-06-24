// Projekt-Ordner (T-177) — tenant-geteilt, req.ctx.tenant gescoped (fremde Ordner = 404).
// Über-/Unterordner (parent_id). Rename via PATCH; Verschieben von Ordnern bewusst NICHT
// (Spec: Projekte wandern per Drag-n-Drop, Ordner werden in-place angelegt) → kein Zyklus-Risiko.

import { Router } from "express"
import { ApiError, asyncHandler, isUuid } from "../util.js"

function rowToFolder(row) {
  // owner = null → geteilt (alle Mandanten-Mitglieder); gesetzt → privat (nur diese Person).
  return { id: row.id, name: row.name, parentId: row.parent_id ?? null, sortOrder: row.sort_order ?? 0, owner: row.owner_email ?? null }
}

// Sichtbarkeits-Prädikat: geteilt ODER eigen-privat ODER Betrachter ist Setreo-Admin (sieht alles).
// Liefert {clause, params} passend ab Parameter-Index $start.
function visibleClause(ctx, start) {
  return { clause: `(owner_email IS NULL OR owner_email = $${start} OR $${start + 1})`, params: [ctx.email ?? "", ctx.isAdmin === true] }
}

/** Lädt den (sichtbaren) Überordner für owner-Vererbung; null wenn parentId null. 404 wenn fremd/unsichtbar. */
async function getParent(db, parentId, ctx) {
  if (parentId == null) return null
  if (!isUuid(parentId)) throw new ApiError(400, "parentId ungültig")
  const vis = visibleClause(ctx, 3)
  const { rows } = await db.query(
    `SELECT * FROM folders WHERE id = $1 AND tenant_id = $2 AND ${vis.clause}`,
    [parentId, ctx.tenant.id, ...vis.params],
  )
  if (!rows[0]) throw new ApiError(404, "Überordner nicht gefunden")
  return rows[0]
}

export function foldersRouter({ db }) {
  const r = Router()

  r.get("/", asyncHandler(async (req, res) => {
    // Nur sichtbare Ordner: geteilt + eigen-privat (+ alle für Admin). Private fremder Nutzer raus.
    const vis = visibleClause(req.ctx, 2)
    const { rows } = await db.query(
      `SELECT * FROM folders WHERE tenant_id = $1 AND ${vis.clause} ORDER BY sort_order ASC, name ASC`,
      [req.ctx.tenant.id, ...vis.params],
    )
    res.json({ folders: rows.map(rowToFolder) })
  }))

  r.post("/", asyncHandler(async (req, res) => {
    const name = req.body?.name
    if (typeof name !== "string" || !name.trim()) throw new ApiError(400, "name erforderlich")
    const parentId = req.body?.parentId ?? null
    const parent = await getParent(db, parentId, req.ctx)
    // owner: in einem Ordner → dessen Zone erben; auf Wurzelebene → private-Flag des Requests entscheidet.
    const owner = parent ? parent.owner_email : req.body?.private === true ? req.ctx.email : null
    const { rows } = await db.query(
      "INSERT INTO folders (tenant_id, parent_id, name, owner_email) VALUES ($1, $2, $3, $4) RETURNING *",
      [req.ctx.tenant.id, parentId, name.trim(), owner],
    )
    res.status(201).json(rowToFolder(rows[0]))
  }))

  r.patch("/:id", asyncHandler(async (req, res) => {
    if (!isUuid(req.params.id)) throw new ApiError(404, "Ordner nicht gefunden")
    const vis = visibleClause(req.ctx, 3)
    const cur = await db.query(
      `SELECT * FROM folders WHERE id = $1 AND tenant_id = $2 AND ${vis.clause}`,
      [req.params.id, req.ctx.tenant.id, ...vis.params],
    )
    const folder = cur.rows[0]
    if (!folder) throw new ApiError(404, "Ordner nicht gefunden")

    const name = req.body?.name !== undefined ? String(req.body.name).trim() : folder.name
    if (!name) throw new ApiError(400, "name darf nicht leer sein")

    // Verschieben (Drag-n-Drop): parentId = null (Wurzel) oder ein anderer Ordner.
    // owner-Zone: in einen Ordner → dessen Zone erben; auf Wurzel → private-Flag (true=privat/false=geteilt);
    // ohne Angabe bleibt die bisherige Zone (reiner Rename).
    let parentId = folder.parent_id
    let owner = folder.owner_email
    // Tenant-Ordnerliste EINMAL (Zyklus-Check + Kaskade).
    const all = await db.query("SELECT id, parent_id FROM folders WHERE tenant_id = $1", [req.ctx.tenant.id])
    const childrenOf = new Map()
    for (const r2 of all.rows) {
      if (!childrenOf.has(r2.parent_id)) childrenOf.set(r2.parent_id, [])
      childrenOf.get(r2.parent_id).push(r2.id)
    }
    const descendants = new Set()
    const stack0 = [folder.id]
    while (stack0.length) {
      for (const c of childrenOf.get(stack0.pop()) ?? []) {
        if (!descendants.has(c)) {
          descendants.add(c)
          stack0.push(c)
        }
      }
    }

    if (req.body?.parentId !== undefined) {
      parentId = req.body.parentId ?? null
      if (parentId != null) {
        if (parentId === folder.id) throw new ApiError(400, "Ordner kann nicht in sich selbst")
        if (descendants.has(parentId)) throw new ApiError(400, "Ordner kann nicht in einen eigenen Unterordner verschoben werden")
        const parent = await getParent(db, parentId, req.ctx)
        owner = parent.owner_email // Zone des Zielordners erben
      } else {
        owner = req.body?.private === true ? req.ctx.email : req.body?.private === false ? null : folder.owner_email
      }
    } else if (req.body?.private !== undefined) {
      // Reiner Zonen-Wechsel (Wurzelordner zwischen den Zonen gezogen, ohne Parent-Änderung).
      owner = req.body.private === true ? req.ctx.email : null
    }

    await db.query("UPDATE folders SET name = $2, parent_id = $3, owner_email = $4 WHERE id = $1", [folder.id, name, parentId, owner])

    // Kaskade: bei Zonen-Wechsel owner der gesamten Unterstruktur (Ordner + enthaltene Projekte) angleichen.
    if (owner !== folder.owner_email) {
      const subtree = [folder.id, ...descendants]
      await db.query("UPDATE folders SET owner_email = $2 WHERE tenant_id = $1 AND id = ANY($3::uuid[])", [req.ctx.tenant.id, owner, subtree])
      await db.query("UPDATE projects SET owner_email = $2 WHERE tenant_id = $1 AND folder_id = ANY($3::uuid[])", [req.ctx.tenant.id, owner, subtree])
    }
    const out = await db.query("SELECT * FROM folders WHERE id = $1 AND tenant_id = $2", [folder.id, req.ctx.tenant.id])
    res.json(rowToFolder(out.rows[0]))
  }))

  r.delete("/:id", asyncHandler(async (req, res) => {
    if (!isUuid(req.params.id)) throw new ApiError(404, "Ordner nicht gefunden")
    const vis = visibleClause(req.ctx, 3)
    const result = await db.query(
      `DELETE FROM folders WHERE id = $1 AND tenant_id = $2 AND ${vis.clause}`,
      [req.params.id, req.ctx.tenant.id, ...vis.params],
    )
    if (result.rowCount === 0) throw new ApiError(404, "Ordner nicht gefunden")
    res.status(204).end()
  }))

  return r
}
