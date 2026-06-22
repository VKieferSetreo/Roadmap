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
