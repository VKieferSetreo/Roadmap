-- 066 — T-626/T-633: Registry-Hygiene — tote/entfernte Quellen aus dem aktiven Register nehmen.
--
-- Der Data-Quality-Audit (T-626) legte über den neuen Staleness-Monitor offen, dass mehrere
-- quellen-Registry-Einträge auf aktiv=true stehen, obwohl kein Connector sie (mehr) bedient — sie
-- erscheinen dadurch im Register als „aktive Quelle" und triggern Dauer-Staleness-Alarme:
--   0122  MobiData BW LMS   — von Max 2026-06-14 entfernt (reine Live-/Ad-hoc-Verkehrsmeldungen)
--   0217  Düsseldorf VM     — von Max 2026-06-14 entfernt (reine Live-/Ad-hoc-Verkehrsmeldungen)
--   0151  Baustellen SH     — Mobilithek-DATEX-Subscription dead-on-arrival (53/53 Läufe 0 Records);
--                             der Datensatz ist offen nur als GDI-SH-WFS publiziert, nicht via Mobilithek
--   0002, 0009              — nie aktivierte Registry-Stubs (kein Connector, 0 Zeilen)
--
-- NON-DESTRUKTIV: nur aktiv=false (Soft-Deaktivierung, jederzeit reversibel). Keine obstacles/findings
-- betroffen (diese Quellen haben ohnehin 0 aktive Zeilen). Das Connector-Scheduling liest aus der
-- Code-Registry, NICHT aus quellen.aktiv — diese Änderung betrifft ausschließlich Register-Anzeige +
-- Staleness-Monitor. Idempotent (WHERE aktiv = true).
UPDATE quellen SET aktiv = false
 WHERE id IN ('0002', '0009', '0122', '0151', '0217')
   AND aktiv = true;
