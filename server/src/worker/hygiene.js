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
