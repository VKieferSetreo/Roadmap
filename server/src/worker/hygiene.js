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
