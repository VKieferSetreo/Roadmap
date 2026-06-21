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
// Diff-Schlüssel = INHALTS-Identität (Kategorie|Strecke|Bezeichnung|Straße|km-Raster), NICHT
// die obstacle_id. Grund (Bug 2026-06-21): die obstacle_id ist NICHT stabil über Re-Imports —
// liefert ein Connector keine stabile externe_id oder wird die DB voll neu geladen, bekommt
// dasselbe reale Hindernis eine neue id. Auf obstacle_id gekeyt galt derselbe Fund dann als
// „weggefallen" (alte id) UND „neu" (neue id) im selben Lauf. Die Inhalts-Identität überlebt das.

import { rowToProject } from "../map.js"
import { sendProjectNotificationMail } from "../mail/notify.js"
import { ENGINE_VERSION, runAnalysis, usableRoutes } from "./index.js"

const SEVERITY_RANK = { kritisch: 3, warnung: 2, hinweis: 1 }
const rank = (s) => SEVERITY_RANK[s] ?? 0
const normName = (s) => String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ")

/** Stabile Fund-Identität für den Diff — überlebt obstacle_id-Wechsel (Re-Import ohne stabile
 *  externe_id / Voll-Reload). km auf 1-km-Raster gerundet: toleriert die ~100-m-Wackler zwischen
 *  Läufen (0,8 ↔ 0,9), hält aber weit auseinander liegende gleichnamige Funde (generische Titel
 *  wie „Absicherung seitlicher Ausbau") getrennt. ponytail: Rest-Risiko = Wackeln exakt über eine
 *  0,5-km-Grenze; bei erneutem Auftreten auf km-Fuzzy-Match heben. */
function findingIdentity(f) {
  return [
    f.kategorie,
    normName(f.route_name),
    normName(f.titel),
    normName(f.strassen_ref),
    Math.round(Number(f.km ?? 0)),
  ].join("|")
}

const FINDINGS_SQL = `SELECT obstacle_id, severity, titel, kategorie, km, route_name,
    strassen_ref, gueltig_von, gueltig_bis
  FROM findings WHERE project_id = $1`

const NOTIFY_SQL = `INSERT INTO notifications
    (tenant_id, project_id, projekt_name, typ, severity, obstacle_id, kategorie,
     titel, beschreibung, km, route_name, strassen_ref, gueltig_von, gueltig_bis)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`

/** Findings-Rows → Map(Inhalts-Identität → schwerster Fund) — eine Nachricht je Stelle,
 *  kein Strecken-Spam, stabil über Re-Imports (siehe findingIdentity). */
export function indexByIdentity(rows) {
  const map = new Map()
  for (const f of rows) {
    const key = findingIdentity(f)
    const prev = map.get(key)
    if (!prev || rank(f.severity) > rank(prev.severity)) map.set(key, f)
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

// Wie viele Projekt-Reruns gleichzeitig laufen. SEQUENZIELL (=1, Max 2026-06-18):
// jede runAnalysis zieht den vollen Bounding-Box-Bestand (inkl. geom-jsonb) in den
// Heap — schon ×2 parallel über alle Mandanten ließ den Container bei vielen Strecken
// OOMen (sah aus wie DB-Crash). Bei künftig ~100 Strecken muss der Auto-Lauf eine
// Strecke nach der anderen abarbeiten, statt DB-Pool/Heap parallel zu fluten.
// Langsamer, aber robust — die Batch-Schleife unten läuft mit 1 trivial sequenziell.
const RERUN_CONCURRENCY = 1

// Prozessübergreifende Rerun-Sperre (siehe rerunAffectedProjects).
const RERUN_LOCK_KEY = "roadmap_rerun_global"

/** Ein Projekt neu auswerten + Fund-Diff → Benachrichtigungen (Glocke + Mail). */
async function rerunOne({ db, row, corridorM, log, env, fetchImpl }) {
  const project = rowToProject(row, [], null)
  const before = await db.query(FINDINGS_SQL, [row.id])
  const beforeMap = indexByIdentity(before.rows)

  try {
    await runAnalysis({ db, project, corridorM })
  } catch (err) {
    log(`rerun ${row.id} (${project.name}) fehlgeschlagen: ${err?.message ?? err}`)
    return { done: false, events: 0 }
  }

  const after = await db.query(FINDINGS_SQL, [row.id])
  const events = diffFindings(beforeMap, indexByIdentity(after.rows))
  if (events.length > 0) {
    await persistEvents(db, project, events)
    log(`${project.name}: ${events.length} Änderung(en) → Benachrichtigungen`)
    // Zusätzlich zur Glocke: Mail an die Mandanten-Mitglieder (minus Opt-out).
    // Additiv + fehlertolerant — sendMail/notify werfen nie, die Glocke bleibt bestehen.
    const mail = await sendProjectNotificationMail({ db, project, events }, { env, fetchImpl, log })
    if (mail?.sent > 0) log(`${project.name}: ${mail.sent} Mail(s) versendet`)
  }
  return { done: true, events: events.length }
}

/**
 * Fährt alle nicht-archivierten, bereits ausgewerteten Projekte (status='fertig')
 * mit ≥1 nutzbarer Strecke SEQUENZIELL (eine nach der anderen) neu und erzeugt
 * Benachrichtigungen aus dem Fund-Diff.
 *
 * Serialisiert prozessübergreifend über einen nicht-blockierenden Session-Advisory-Lock:
 * API-Sync-Rerun (sync.js) und Worker-Auto-Rerun (worker/index.js) laufen in GETRENNTEN
 * Prozessen — ihre In-Memory-Locks greifen nur prozessintern. Ohne geteilte Sperre liefen
 * beide vollen Reruns (je Schwer-SELECTs + tx-Last) gleichzeitig auf derselben DB → sie
 * kippt. Bekommt ein Lauf den Lock nicht, überspringt er (der nächste Sync/Cron holt es nach).
 *
 * T-333/T-342: SESSION-Lock auf dedizierter Connection (db.session, KEINE Transaktion) statt
 * XACT-Lock — der frühere xact-Lock band die Sperre an den COMMIT und hielt die Connection für
 * die GESAMTE Rerun-Dauer "idle in transaction" (bei wachsender Projektzahl / Provider-Hang ein
 * Pool-/Lock-Leak). Der Session-Lock hält dieselbe 1 Connection, aber NICHT als offene Tx → er
 * blockiert keine DB-Schreiber. Explizites pg_advisory_unlock im finally (wirft nie); stirbt die
 * Session, fällt der Lock automatisch (Muster wie withConnectorLock, T-323). Der eigentliche
 * Abbruch eines hängenden Provider-fetch passiert am AbortController in mailer.js (T-339/T-340).
 *
 * @returns {Promise<{geprueft, neuAusgewertet, mitAenderung, benachrichtigungen, skipped?}>}
 */
export async function rerunAffectedProjects(opts) {
  const { db, log = () => {} } = opts
  return db.session(async (lockq) => {
    const got = await lockq.query("SELECT pg_try_advisory_lock(hashtext($1)) AS ok", [RERUN_LOCK_KEY])
    if (!got.rows[0]?.ok) {
      log("Rerun läuft bereits (anderer Prozess) — übersprungen")
      return {
        engineVersion: ENGINE_VERSION, geprueft: 0, neuAusgewertet: 0,
        mitAenderung: 0, benachrichtigungen: 0, skipped: true,
      }
    }
    try {
      return await runRerun(opts)
    } finally {
      // Session-Lock MUSS explizit fallen (anders als xact-Lock beim COMMIT). Wirft das unlock,
      // fällt der Lock spätestens mit der Session — niemals den Rerun daran scheitern lassen.
      try {
        await lockq.query("SELECT pg_advisory_unlock(hashtext($1))", [RERUN_LOCK_KEY])
      } catch (err) {
        log(`Rerun-Unlock fehlgeschlagen (Lock fällt mit Session): ${err?.message ?? err}`)
      }
    }
  })
}

async function runRerun({
  db, corridorM = 20, log = () => {}, env = process.env, fetchImpl = globalThis.fetch,
}) {
  const { rows } = await db.query(
    "SELECT * FROM projects WHERE archived_at IS NULL AND status = 'fertig'",
  )
  const eligible = rows.filter((row) => usableRoutes(rowToProject(row, [], null).routes).length > 0)

  let neuAusgewertet = 0
  let mitAenderung = 0
  let benachrichtigungen = 0

  for (let i = 0; i < eligible.length; i += RERUN_CONCURRENCY) {
    const batch = eligible.slice(i, i + RERUN_CONCURRENCY)
    const results = await Promise.all(
      batch.map((row) => rerunOne({ db, row, corridorM, log, env, fetchImpl })),
    )
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
