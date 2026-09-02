// Daten-Hygiene: abgelaufene Hindernisse aus der Auswertung nehmen.
//
// Regel (Max 2026-06-13): ein Hindernis mit gesetztem gueltig_bis wird 7 Tage
// nach Ablauf automatisch deaktiviert (aktiv=false) — gilt für IMPORTIERTE wie
// für MANUELLE (Kunden-)Einträge gleichermaßen. gueltig_bis = NULL ("offen")
// bleibt unbegrenzt aktiv.
//
// Soft-Delete (aktiv=false) statt Hard-Delete: die Zeile (fachId, Historie,
// Notification-Bezug) bleibt erhalten, ist aber aus allen Auswertungen, der
// Funde-Suche und der Hindernis-Übersicht verschwunden (Engine + Listen filtern
// auf aktiv=true). Reaktivierung ist jederzeit möglich (z.B. Vollbestand-Reimport).

const EXPIRE_SQL = `UPDATE obstacles
     SET aktiv = false, updated_at = now()
   WHERE aktiv = true
     AND gueltig_bis IS NOT NULL
     AND gueltig_bis < (CURRENT_DATE - ($1::int * INTERVAL '1 day'))
   RETURNING id, tenant_id, quellen_id, name, gueltig_bis`

/**
 * Deaktiviert Hindernisse, deren gueltig_bis länger als `graceDays` Tage zurückliegt.
 * @returns {Promise<Array>} die deaktivierten Rows (für Statistik/Logging)
 */
export async function expireObstacles(db, { graceDays = 7 } = {}) {
  const { rows } = await db.query(EXPIRE_SQL, [graceDays])
  return rows
}

// Hard-Purge lang-inaktiver IMPORTIERTER Hindernisse (Audit 2026-06-22, FIX-4).
// Reconcile/Hygiene setzt nicht mehr im Feed vorhandene bzw. abgelaufene Importe auf aktiv=false
// (Soft-Delete). Bleiben sie ewig liegen, sammelt sich toter Ballast (z.B. 9.606 Zeilen aus einer
// revertierten 0123-BAYSIS-Connector-Version) — irreführend in Roh-Counts, unnötige Last bei den
// Vollbestand-Loads (EXISTING_ALL_SQL je Lauf). Nach `days` Tagen ohne Reaktivierung sind sie
// definitiv stale → hart löschen. FK-sicher: obstacle_id ist bewusst OHNE FK (Snapshots in
// findings/notifications/hidden_findings überleben). Scope strikt: NUR globale Importe
// (tenant_id IS NULL AND quellen_id IS NOT NULL) — Kunden-/Mandanten-Einträge bleiben unangetastet.
const PURGE_SQL = `DELETE FROM obstacles
   WHERE aktiv = false
     AND tenant_id IS NULL
     AND quellen_id IS NOT NULL
     AND updated_at < (now() - ($1::int * INTERVAL '1 day'))
   RETURNING id, quellen_id`

/**
 * Löscht importierte Hindernisse, die seit `days` Tagen inaktiv sind, endgültig.
 * @returns {Promise<Array>} die gelöschten Rows (für Logging/Statistik)
 */
export async function purgeStaleInactive(db, { days = 30 } = {}) {
  const { rows } = await db.query(PURGE_SQL, [days])
  return rows
}

// T-662: die Anreicherungstabelle folgt dem Punkt nicht ins Grab. purgeStaleInactive loescht
// importierte Hindernisse 30 Tage nach ihrer Deaktivierung HART — und anreicherung.ziel_id ist
// bewusst ohne Fremdschluessel (dieselbe Entscheidung wie bei findings/notifications, damit
// Snapshots ueberleben). Fuer die Anreicherung stimmt diese Begruendung aber nicht: ihre Zeilen
// sind kein Schnappschuss, sondern Ableitungen AUS einem Punkt. Ist der Punkt weg, beziehen sie
// sich auf nichts mehr, und sie kommen auch nie wieder zu ihm zurueck — eine geloeschte Zeile
// bekommt beim Reimport eine neue UUID.
//
// Gemessen am 02.09.2026: 0 Waisen. Die Luecke ist noch nicht aufgegangen, weil die Anreicherung
// erst seit Ende August laeuft und die 30-Tage-Uhr fuer die ersten Punkte noch nicht abgelaufen
// ist. Bei rund 15 Zeilen je Punkt und dem taeglichen Ablauf von Baustellen waeren es sonst
// schnell Millionen — genau die Sorte Ballast, gegen die purgeStaleInactive ueberhaupt gebaut
// wurde.
//
// BATCHWEISE, weil der Vergleich o.id::text = a.ziel_id keinen Index nutzen kann: lieber jede
// Nacht ein begrenztes Stueck als ein Lauf, der eine 235.000-Zeilen-Tabelle minutenlang haelt.
// Was heute nicht drankommt, kommt morgen dran.
const PURGE_VERWAISTE_ANREICHERUNG_SQL = `DELETE FROM anreicherung
   WHERE ctid IN (
     SELECT a.ctid FROM anreicherung a
      LEFT JOIN obstacles o ON o.id::text = a.ziel_id
      WHERE a.ziel_typ = 'obstacle' AND o.id IS NULL
      LIMIT $1)
   RETURNING id`

/**
 * Loescht Anreicherungszeilen, deren Hindernis es nicht mehr gibt.
 * @returns {Promise<number>} Anzahl geloeschter Zeilen.
 */
export async function purgeVerwaisteAnreicherung(db, { batch = 20000 } = {}) {
  const { rows } = await db.query(PURGE_VERWAISTE_ANREICHERUNG_SQL, [batch])
  return rows.length
}

// T-603 (Daten-Audit 2026-06-27): Funde werden persistent zum Projekt gespeichert; eine Re-Analyse
// überschreibt/bereinigt sie. Werden aber die Routen eines Projekts gelöscht/ersetzt OHNE Re-Analyse,
// bleiben die Fund-Zeilen als eingefrorener Geister-Snapshot zurück (Bsp. Borgentreich: 0 Routen, 679
// Funde = 49% des Gesamtbestands, inkl. abgelaufener/inaktiver/2030er-Treffer). Routen liegen als
// JSONB in projects.routes (kein FK möglich) → kein ON DELETE CASCADE. Dieser Reconcile löscht Funde,
// deren route_id nicht (mehr) in den aktuellen Projekt-Routen liegt — deckt Voll-Orphan (0 Routen) UND
// Teil-Löschung. Self-healing im Wartungszyklus. Verifiziert: trifft NUR losgelöste Funde, keine Live.
const PURGE_ORPHAN_FINDINGS_SQL = `DELETE FROM findings f
   USING projects p
   WHERE p.id = f.project_id
     AND (
       jsonb_array_length(COALESCE(p.routes, '[]'::jsonb)) = 0
       OR (f.route_id IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM jsonb_array_elements(COALESCE(p.routes, '[]'::jsonb)) rt
            WHERE rt->>'id' = f.route_id))
     )
   RETURNING f.id`

/** Löscht Funde, deren route_id nicht mehr in den Projekt-Routen existiert (Routen-/Projekt-Edit ohne
 *  Re-Analyse). @returns Anzahl gelöschter Geister-Funde. */
export async function purgeOrphanFindings(db) {
  const { rows } = await db.query(PURGE_ORPHAN_FINDINGS_SQL)
  return rows.length
}

// T-372: import_runs wächst ~139 Zeilen/Tag (≈50k/Jahr) ohne Pruning. Alte Runs löschen, aber je
// Quelle den JÜNGSTEN immer behalten (Health/Status + Quellen-Register lesen den letzten Run je
// Quelle, unabhängig vom Alter). keepDays großzügig → Historie auskunftsfähig, Bloat gekappt.
const PRUNE_IMPORT_RUNS_SQL = `DELETE FROM import_runs
   WHERE started_at < (now() - ($1::int * INTERVAL '1 day'))
     AND id NOT IN (SELECT DISTINCT ON (quelle_id) id FROM import_runs ORDER BY quelle_id, started_at DESC)
   RETURNING id`

/** Alte import_runs löschen (je Quelle bleibt der jüngste erhalten). @returns Anzahl gelöschter Zeilen. */
export async function pruneImportRuns(db, { keepDays = 90 } = {}) {
  const { rows } = await db.query(PRUNE_IMPORT_RUNS_SQL, [keepDays])
  return rows.length
}

// T-372: analytics_sessions + analytics_events enthalten E-Mail → Retention = Datenminimierung
// (Art.5e). 365 Tage Nutzungshistorie reicht der Admin-Übersicht; ältere Zeilen hart löschen.
const PRUNE_ANALYTICS_SESSIONS_SQL = `DELETE FROM analytics_sessions WHERE last_seen < (now() - ($1::int * INTERVAL '1 day')) RETURNING id`
const PRUNE_ANALYTICS_EVENTS_SQL = `DELETE FROM analytics_events WHERE created_at < (now() - ($1::int * INTERVAL '1 day')) RETURNING id`

/** Nutzungs-Sessions + -Events nach `keepDays` löschen (PII-Retention). @returns {{sessions,events}}. */
export async function pruneAnalytics(db, { keepDays = 365 } = {}) {
  const s = await db.query(PRUNE_ANALYTICS_SESSIONS_SQL, [keepDays])
  const e = await db.query(PRUNE_ANALYTICS_EVENTS_SQL, [keepDays])
  return { sessions: s.rows.length, events: e.rows.length }
}

// T-373: Screenshot-Blobs (base64-JPEG, ≤6 MB inline) aufgelöster bug_reports nach `keepDays`
// entfernen. Report-Text/Status/Verlauf bleiben — nur der schwere Blob fällt weg → Disk-Wachstum
// gekappt. Die LIST-Query selektiert den Blob ohnehin nicht (nur has_screenshot).
const PRUNE_BUGREPORT_SHOTS_SQL = `UPDATE bug_reports SET screenshot = NULL
   WHERE screenshot IS NOT NULL AND resolved_at IS NOT NULL
     AND resolved_at < (now() - ($1::int * INTERVAL '1 day')) RETURNING id`

/** Screenshots aufgelöster, gealterter bug_reports nullen. @returns Anzahl bereinigter Reports. */
export async function pruneBugReportScreenshots(db, { keepDays = 180 } = {}) {
  const { rows } = await db.query(PRUNE_BUGREPORT_SHOTS_SQL, [keepDays])
  return rows.length
}

// T-277: Glocken-Benachrichtigungen wachsen sonst unbegrenzt (kein Retention). GELESENE löschen, wenn
// älter als keepDays; UNGELESENE bleiben immer (der Nutzer hat sie noch nicht gesehen).
const PRUNE_NOTIFICATIONS_SQL = `DELETE FROM notifications
   WHERE read_at IS NOT NULL
     AND created_at < (now() - ($1::int * INTERVAL '1 day')) RETURNING id`

/** Gelesene, gealterte Notifications löschen. @returns Anzahl gelöschter Zeilen. */
export async function pruneNotifications(db, { keepDays = 120 } = {}) {
  const { rows } = await db.query(PRUNE_NOTIFICATIONS_SQL, [keepDays])
  return rows.length
}

// T-277: nach den großen Retention-DELETEs den Tabellen-Bloat zurückgewinnen. VACUUM (ANALYZE) ist
// non-blocking (KEIN VACUUM FULL — das nähme ACCESS EXCLUSIVE). Tabellennamen hartcodiert (keine
// Injection). VACUUM läuft NICHT in einer Transaktion → eigene db.query (autocommit), pro Tabelle
// fehlertolerant. Autovacuum reicht meist; dies ist die explizite Absicherung nach dem Retention-Lauf.
// anreicherung steht seit T-662 mit dabei: seit der Waisen-Lauf dort loescht, entsteht auch dort
// Churn. Ohne den Eintrag waere die groesste Tabelle des Systems (413 MB) die einzige, um die sich
// nach einem Retention-Lauf niemand kuemmert.
const VACUUM_TABLES = ["obstacles", "findings", "notifications", "import_runs", "analytics_events", "anreicherung"]
export async function vacuumChurnedTables(db, { log = () => {} } = {}) {
  let ok = 0
  for (const t of VACUUM_TABLES) {
    try {
      await db.query(`VACUUM (ANALYZE) ${t}`)
      ok++
    } catch (e) {
      log(`VACUUM ${t} fehlgeschlagen: ${e?.message ?? e}`)
    }
  }
  return ok
}

// T-626 Staleness-Monitor: der systemische blinde Fleck des Audits — ein eingefrorener/toter Feed
// erzeugt dauerhaft grüne Sync-Runs, sodass eine ausgefallene Quelle (0124 NRW-Schwertransportkarte:
// ArcGIS verlangt seit 2026-06-29 Token; 0122/0217 aus dem Schedule gefallen; 0121 Sachsen viewer-tot)
// unbemerkt veraltet und das Tool jahrealte Daten als „aktuell" zeigt. Dieser Job MUTIERT NICHTS — er
// prüft je Quelle den jüngsten import_run + den aktiven Bestand und liefert die auffälligen Quellen für
// eine WARN-Zeile im täglichen Cleanup (durabler Breadcrumb im Worker-Log). Drei eindeutige Signale:
//   - kein_lauf_seit: jüngster Run älter als staleDays → Quelle synct gar nicht mehr
//   - letzter_lauf_fehlgeschlagen: jüngster Run status warn/error → Feed tot/kaputt/leer
//   - keine_aktiven_daten: Quelle aktiv, hat gelaufen, aber 0 aktive obstacles → No-Op/Pipeline-Bruch
// (Bewusst NICHT: Churn-Freeze-Heuristik „nichts ändert sich seit N Läufen" — die würde statische
//  Referenzquellen wie 0153 BASt-Brücken / 0150 fälschlich flaggen. Der 0114-Fall „ok-Läufe, aber
//  Upstream ein Jahr alt" bleibt daher manuell; er ist ohne Upstream-Frische-Signal nicht sicher erkennbar.)
// T-626/T-633: verifiziert by-design ertraglose Quellen (Endpoint-Recherche 2026-07-04) — reine
// Bauwerks-/Netz-Kataster OHNE Restriktionsdaten (0110 GST-Routen HH, 0111 Brücken HH, 0116 Detailnetz
// Berlin, 0125 NRW-Bauwerke, 0303 WSV-Kreuzungsbauwerke). Sie liefern strukturell 0 verwertbare
// Hindernisse (der istReineInfrastruktur-Skip ist KORREKT) und sind auf wöchentlich gedrosselt → aus dem
// Staleness-Monitor ausgeklammert, sonst Dauer-Fehlalarm. Neue 0-aktiv-Quellen werden weiterhin geflaggt.
const STALE_IGNORE = ["0110", "0111", "0116", "0125", "0303"]

const STALE_SOURCES_SQL = `
  WITH last_run AS (
    SELECT DISTINCT ON (quelle_id) quelle_id, status, started_at
    FROM import_runs ORDER BY quelle_id, started_at DESC
  ),
  aktiv AS (
    SELECT quellen_id, count(*) AS n FROM obstacles WHERE aktiv GROUP BY quellen_id
  )
  SELECT q.id, q.name, lr.status AS last_status,
         to_char(lr.started_at, 'YYYY-MM-DD HH24:MI') AS last_run,
         EXTRACT(EPOCH FROM (now() - lr.started_at))/86400 AS age_days,
         COALESCE(a.n, 0) AS aktiv_n
  FROM quellen q
  LEFT JOIN last_run lr ON lr.quelle_id = q.id
  LEFT JOIN aktiv a ON a.quellen_id = q.id
  WHERE q.aktiv = true
    AND q.typ IS DISTINCT FROM 'manuell'         -- manuelle Kunden-Quelle (0100) hat nie Import-Runs
    AND NOT (q.id = ANY($2::text[]))             -- by-design ertraglose Kataster (STALE_IGNORE)
    AND (
      lr.started_at IS NULL
      OR lr.started_at < now() - ($1::int * INTERVAL '1 day')
      OR lr.status IN ('warn', 'error')
      OR COALESCE(a.n, 0) = 0
    )
  ORDER BY lr.status IN ('warn','error') DESC, age_days DESC NULLS FIRST`

/**
 * Findet Quellen, die veraltet/tot/ertraglos wirken (siehe SQL). Reiner Read + WARN-Log, keine Mutation.
 * @returns {Promise<Array>} auffällige Quellen mit { id, name, last_status, last_run, age_days, aktiv_n, grund }
 */
export async function detectStaleSources(db, { staleDays = 3, ignore = STALE_IGNORE, log = () => {} } = {}) {
  const { rows } = await db.query(STALE_SOURCES_SQL, [staleDays, ignore])
  const flagged = rows.map((r) => {
    const age = r.age_days == null ? null : Math.round(Number(r.age_days))
    let grund
    if (r.last_run == null) grund = "nie gelaufen"
    else if (r.last_status === "error" || r.last_status === "warn") grund = `letzter Lauf ${r.last_status}`
    else if (Number(r.aktiv_n) === 0) grund = "0 aktive Hindernisse"
    else grund = `kein Lauf seit ${age} Tagen`
    return { ...r, aktiv_n: Number(r.aktiv_n), age_days: age, grund }
  })
  if (flagged.length) {
    log(`WARN Staleness (T-626): ${flagged.length} auffällige Quellen — ` +
        flagged.map((f) => `${f.id} (${f.grund}, ${f.aktiv_n} aktiv, letzter ${f.last_run ?? "—"})`).join("; "))
  }
  return flagged
}

// fach_id-Dedup/Renumber (T-262). Root-Cause war ein Index-Überlauf >9999: MAX_INDEX_SQL las nur die
// ersten 4 Stellen der fachId → bei >9999 Einträgen/Quelle (5-stelliger Index, 15-stellige fachId)
// hing der Zähler bei 9999 → Folge-Importe vergaben Index 10000+ ERNEUT → Dubletten. Der
// Präventions-Fix (substring … length-10 in importer.js + obstaclesRepo.js) stoppt NEUE Fälle; diese
// Funktion heilt den Bestand und ist die laufende Sicherung:
//   - pro betroffener Quelle die überzähligen Zeilen je fachId neu nummerieren. Die KANONISCHE Zeile
//     (aktivste, dann älteste) behält ihre fachId; nur die Extras bekommen frische Indizes oberhalb
//     des KORREKT berechneten MAX. QUELLE+DDMMYY (letzte 10 Zeichen) bleiben erhalten — nur das
//     Index-Feld wechselt.
//   - idempotent: findet sie keine Dubletten, ändert sie nichts.
//   - läuft im Worker-Hygiene-Zyklus → tritt je wieder eine Dublette auf (= Prävention-Lücke),
//     gibt es eine WARNUNG im Log und sofortige Selbstheilung.
// updated_at wird BEWUSST nicht angefasst (Maintenance-Korrektur, kein Inhalts-Update; hält die
// purgeStaleInactive-Uhr für inaktive Zeilen stabil).
const DUP_GROUPS_SQL = `SELECT quellen_id, fach_id,
     array_agg(id ORDER BY aktiv DESC, created_at ASC, id ASC) AS ids
   FROM obstacles
   WHERE fach_id IS NOT NULL AND quellen_id IS NOT NULL
   GROUP BY quellen_id, fach_id
   HAVING count(*) > 1`

const CORRECT_MAX_SQL = `SELECT COALESCE(MAX(substring(fach_id FROM 1 FOR (length(fach_id) - 10))::int), 0) AS m
   FROM obstacles WHERE quellen_id = $1 AND fach_id ~ '^[0-9]{4}'`

/**
 * Findet fachId-Dubletten und nummeriert die überzähligen Zeilen je Quelle neu durch.
 * @returns {Promise<{groups:number, renumbered:number}>}
 */
export async function reconcileFachIdDupes(db, { log = () => {} } = {}) {
  const { rows: groups } = await db.query(DUP_GROUPS_SQL)
  if (groups.length === 0) return { groups: 0, renumbered: 0 }

  const byQuelle = new Map()
  for (const g of groups) {
    const arr = byQuelle.get(g.quellen_id) ?? []
    arr.push(g)
    byQuelle.set(g.quellen_id, arr)
  }

  let renumbered = 0
  for (const [quelle, gs] of byQuelle) {
    // Advisory-Lock je Quelle (wie die Import-fachId-Vergabe) → kein Race mit laufendem Import.
    await db.tx(async (q) => {
      await q.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`roadmap_fachid_${quelle}`])
      const { rows: mx } = await q.query(CORRECT_MAX_SQL, [quelle])
      let nextIndex = Number(mx[0]?.m ?? 0) + 1
      for (const g of gs) {
        const suffix = String(g.fach_id).slice(-10) // QUELLE(4)+DDMMYY(6) bleibt erhalten
        for (const id of g.ids.slice(1)) { // ids[0] = kanonisch (behält fachId)
          const neu = String(nextIndex++).padStart(4, "0") + suffix
          await q.query("UPDATE obstacles SET fach_id = $1 WHERE id = $2", [neu, id])
          renumbered++
        }
      }
    })
  }
  // WARN: nach dem Präventions-Fix sollte das NIE wieder anschlagen — Auftreten ist ein Signal.
  log(`WARN fach_id-Dedup: ${groups.length} Dubletten-Gruppen, ${renumbered} Zeilen neu nummeriert. ` +
      `Sollte nach dem Präventions-Fix (T-262) nicht erneut auftreten — bitte Ursache prüfen.`)
  return { groups: groups.length, renumbered }
}
