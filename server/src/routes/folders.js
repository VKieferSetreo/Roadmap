// Projekt-Ordner (T-177) — tenant-geteilt, req.ctx.tenant gescoped (fremde Ordner = 404).
// Über-/Unterordner (parent_id). Rename via PATCH; Verschieben von Ordnern bewusst NICHT
// (Spec: Projekte wandern per Drag-n-Drop, Ordner werden in-place angelegt) → kein Zyklus-Risiko.

import { Router } from "express"
import { ApiError, asyncHandler, isUuid } from "../util.js"

function rowToFolder(row) {
  return { id: row.id, name: row.name, parentId: row.parent_id ?? null, sortOrder: row.sort_order ?? 0 }
}

/** Prüft, dass parentId (falls gesetzt) ein Ordner desselben Mandanten ist. */
async function assertParent(db, parentId, tenantId) {
  if (parentId == null) return
  if (!isUuid(parentId)) throw new ApiError(400, "parentId ungültig")
  const { rows } = await db.query(
    "SELECT id FROM folders WHERE id = $1 AND tenant_id = $2",
    [parentId, tenantId],
  )
  if (!rows[0]) throw new ApiError(404, "Überordner nicht gefunden")
}

export function foldersRouter({ db }) {
  const r = Router()

  r.get("/", asyncHandler(async (req, res) => {
    const { rows } = await db.query(
      "SELECT * FROM folders WHERE tenant_id = $1 ORDER BY sort_order ASC, name ASC",
      [req.ctx.tenant.id],
    )
    res.json({ folders: rows.map(rowToFolder) })
  }))

  r.post("/", asyncHandler(async (req, res) => {
    const name = req.body?.name
    if (typeof name !== "string" || !name.trim()) throw new ApiError(400, "name erforderlich")
    const parentId = req.body?.parentId ?? null
    await assertParent(db, parentId, req.ctx.tenant.id)
    const { rows } = await db.query(
      "INSERT INTO folders (tenant_id, parent_id, name) VALUES ($1, $2, $3) RETURNING *",
      [req.ctx.tenant.id, parentId, name.trim()],
    )
    res.status(201).json(rowToFolder(rows[0]))
  }))

  r.patch("/:id", asyncHandler(async (req, res) => {
    if (!isUuid(req.params.id)) throw new ApiError(404, "Ordner nicht gefunden")
    const cur = await db.query(
      "SELECT * FROM folders WHERE id = $1 AND tenant_id = $2",
      [req.params.id, req.ctx.tenant.id],
    )
    const folder = cur.rows[0]
    if (!folder) throw new ApiError(404, "Ordner nicht gefunden")

    const name = req.body?.name !== undefined ? String(req.body.name).trim() : folder.name
    if (!name) throw new ApiError(400, "name darf nicht leer sein")

    // Verschieben (Drag-n-Drop): parentId = null (Wurzel) oder ein anderer Ordner.
    let parentId = folder.parent_id
    if (req.body?.parentId !== undefined) {
      parentId = req.body.parentId ?? null
      if (parentId != null) {
        if (parentId === folder.id) throw new ApiError(400, "Ordner kann nicht in sich selbst")
        await assertParent(db, parentId, req.ctx.tenant.id)
        // Zyklus verhindern: das Ziel darf kein Nachfahre dieses Ordners sein.
        const all = await db.query(
          "SELECT id, parent_id FROM folders WHERE tenant_id = $1",
          [req.ctx.tenant.id],
        )
        const childrenOf = new Map()
        for (const r2 of all.rows) {
          if (!childrenOf.has(r2.parent_id)) childrenOf.set(r2.parent_id, [])
          childrenOf.get(r2.parent_id).push(r2.id)
        }
        const descendants = new Set()
        const stack = [folder.id]
        while (stack.length) {
          for (const c of childrenOf.get(stack.pop()) ?? []) {
            if (!descendants.has(c)) {
              descendants.add(c)
              stack.push(c)
            }
          }
        }
        if (descendants.has(parentId)) {
          throw new ApiError(400, "Ordner kann nicht in einen eigenen Unterordner verschoben werden")
        }
      }
    }

    const { rows } = await db.query(
      "UPDATE folders SET name = $2, parent_id = $3 WHERE id = $1 RETURNING *",
      [folder.id, name, parentId],
    )
    res.json(rowToFolder(rows[0]))
  }))

  r.delete("/:id", asyncHandler(async (req, res) => {
    if (!isUuid(req.params.id)) throw new ApiError(404, "Ordner nicht gefunden")
    const result = await db.query(
      "DELETE FROM folders WHERE id = $1 AND tenant_id = $2",
      [req.params.id, req.ctx.tenant.id],
    )
    if (result.rowCount === 0) throw new ApiError(404, "Ordner nicht gefunden")
    res.status(204).end()
  }))

  return r
}
