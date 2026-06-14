// Auto-Re-Auswertung nach DB-Aktualisierung: fährt alle ausgewerteten Projekte
// neu, vergleicht die Funde vor/nach dem Lauf und erzeugt Benachrichtigungen
// (Nachrichtenzentrum/Glocke) für jedes betroffene Projekt.
//
// Ausgelöst nach einem Import-/Sync-Lauf, der den Datenbestand verändert hat.
// NICHT nach manueller Nutzer-Analyse (da schaut der Nutzer ohnehin hin).
//
// Policy (Max 2026-06-13 — alle vier Fälle melden):
//   neu         — Fund war vorher nicht da (Severity des neuen Funds)
//   weggefallen — Fund ist verschwunden (Baustelle vorbei/abgesagt) → "Entspannung"
//   geaendert   — Severity oder Gültigkeitszeitraum eines bestehenden Funds geändert
//
// Diff-Schlüssel = obstacle_id. Matcht ein Hindernis mehrere Strecken, zählt der
// schwerste Fund (eine Nachricht je Hindernis, kein Strecken-Spam).

import { rowToProject } from "../map.js"
import { ENGINE_VERSION, runAnalysis, usableRoutes } from "./index.js"

const SEVERITY_RANK = { kritisch: 3, warnung: 2, hinweis: 1 }
const rank = (s) => SEVERITY_RANK[s] ?? 0

const FINDINGS_SQL = `SELECT obstacle_id, severity, titel, kategorie, km, route_name,
    strassen_ref, gueltig_von, gueltig_bis
  FROM findings WHERE project_id = $1`

const NOTIFY_SQL = `INSERT INTO notifications
    (tenant_id, project_id, projekt_name, typ, severity, obstacle_id, kategorie,
     titel, beschreibung, km, route_name, strassen_ref, gueltig_von, gueltig_bis)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`

/** Findings-Rows → Map(obstacle_id → schwerster Fund). obstacle_id-lose ignoriert. */
function indexByObstacle(rows) {
  const map = new Map()
  for (const f of rows) {
    if (!f.obstacle_id) continue
    const prev = map.get(f.obstacle_id)
    if (!prev || rank(f.severity) > rank(prev.severity)) map.set(f.obstacle_id, f)
  }
  return map
}

const sameDate = (a, b) => String(a ?? "") === String(b ?? "")

/** Vergleicht zwei Funde desselben Hindernisses → Änderungsbeschreibung | null. */
function describeChange(before, after) {
  const parts = []
  if (before.severity !== after.severity) {
    parts.push(`Bewertung ${before.severity} → ${after.severity}`)
  }
  if (!sameDate(before.gueltig_von, after.gueltig_von) ||
      !sameDate(before.gueltig_bis, after.gueltig_bis)) {
    parts.push("Zeitraum geändert")
  }
  return parts.length ? parts.join(", ") : null
}

/** Diff zweier Fund-Maps → Liste von Notification-Events. */
export function diffFindings(beforeMap, afterMap) {
  const events = []
  for (const [oid, after] of afterMap) {
    const before = beforeMap.get(oid)
    if (!before) {
      events.push({
        typ: "neu", severity: after.severity, finding: after,
        beschreibung: "Neuer Fund auf der Strecke",
      })
    } else {
      const change = describeChange(before, after)
      if (change) events.push({ typ: "geaendert", severity: after.severity, finding: after, beschreibung: change })
    }
  }
  for (const [oid, before] of beforeMap) {
    if (!afterMap.has(oid)) {
      events.push({
        typ: "weggefallen", severity: "info", finding: before,
        beschreibung: "Hindernis ist entfallen — Strecke entspannt sich",
      })
    }
  }
  return events
}

async function persistEvents(db, project, events) {
  if (events.length === 0) return
  // Atomar: alle Benachrichtigungen eines Projekt-Diffs oder keine (kein halber
  // Stand bei DB-Fehler mitten im Loop).
  await db.tx(async (q) => {
    for (const e of events) {
      const f = e.finding
      await q.query(NOTIFY_SQL, [
        project.tenantId, project.id, project.name, e.typ, e.severity,
        f.obstacle_id, f.kategorie, f.titel ?? "(ohne Titel)", e.beschreibung,
        f.km ?? null, f.route_name ?? null, f.strassen_ref ?? null,
        f.gueltig_von ?? null, f.gueltig_bis ?? null,
      ])
    }
  })
}

// Wie viele Projekt-Reruns gleichzeitig laufen. Parallel (Max-Wunsch), aber
// gedeckelt, damit der pg-Pool (max 10) nicht erschöpft wird und die API
// während eines Syncs weiter Requests bedienen kann.
const RERUN_CONCURRENCY = 4

/** Ein Projekt neu auswerten + Fund-Diff → Benachrichtigungen. */
async function rerunOne({ db, row, corridorM, log }) {
  const project = rowToProject(row, [], null)
  const before = await db.query(FINDINGS_SQL, [row.id])
  const beforeMap = indexByObstacle(before.rows)

  try {
    await runAnalysis({ db, project, corridorM })
  } catch (err) {
    log(`rerun ${row.id} (${project.name}) fehlgeschlagen: ${err?.message ?? err}`)
    return { done: false, events: 0 }
  }

  const after = await db.query(FINDINGS_SQL, [row.id])
  const events = diffFindings(beforeMap, indexByObstacle(after.rows))
  if (events.length > 0) {
    await persistEvents(db, project, events)
    log(`${project.name}: ${events.length} Änderung(en) → Benachrichtigungen`)
  }
  return { done: true, events: events.length }
}

/**
 * Fährt alle nicht-archivierten, bereits ausgewerteten Projekte (status='fertig')
 * mit ≥1 nutzbarer Strecke PARALLEL (gebündelt) neu und erzeugt Benachrichtigungen
 * aus dem Fund-Diff.
 *
 * @returns {Promise<{geprueft, neuAusgewertet, mitAenderung, benachrichtigungen}>}
 */
export async function rerunAffectedProjects({ db, corridorM = 50, log = () => {} }) {
  const { rows } = await db.query(
    "SELECT * FROM projects WHERE archived_at IS NULL AND status = 'fertig'",
  )
  const eligible = rows.filter((row) => usableRoutes(rowToProject(row, [], null).routes).length > 0)

  let neuAusgewertet = 0
  let mitAenderung = 0
  let benachrichtigungen = 0

  for (let i = 0; i < eligible.length; i += RERUN_CONCURRENCY) {
    const batch = eligible.slice(i, i + RERUN_CONCURRENCY)
    const results = await Promise.all(batch.map((row) => rerunOne({ db, row, corridorM, log })))
    for (const r of results) {
      if (r.done) neuAusgewertet += 1
      if (r.events > 0) {
        mitAenderung += 1
        benachrichtigungen += r.events
      }
    }
  }

  return {
    engineVersion: ENGINE_VERSION,
    geprueft: eligible.length,
    neuAusgewertet,
    mitAenderung,
    benachrichtigungen,
  }
}
