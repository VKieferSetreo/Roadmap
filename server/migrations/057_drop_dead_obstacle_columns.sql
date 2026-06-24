-- T-261: tote obstacles-Spalten + ungenutzte Indizes droppen (aus 006_obstacles_v1format).
-- Verifiziert: 0 Referenzen in server/src, server/test UND Frontend für alle elf Spalten.
-- BEHALTEN (genutzt): geom, richtung, roh, zeitfenster, confidence, status; abgerufen_am bleibt
-- reserviert für die Quell-Aktualität (T-259). DROP COLUMN ist eine Metadaten-Op (kein Table-Rewrite),
-- IF EXISTS = idempotent. Indizes auf gedroppten Spalten fallen ohnehin, hier explizit zuerst.
DROP INDEX IF EXISTS obstacles_cluster_idx;
DROP INDEX IF EXISTS obstacles_master_aktiv_idx;
DROP INDEX IF EXISTS obstacles_strklasse_idx;

ALTER TABLE obstacles
  DROP COLUMN IF EXISTS cluster_id,
  DROP COLUMN IF EXISTS is_master,
  DROP COLUMN IF EXISTS strassenklasse,
  DROP COLUMN IF EXISTS baulasttraeger,
  DROP COLUMN IF EXISTS vnk,
  DROP COLUMN IF EXISTS nnk,
  DROP COLUMN IF EXISTS station_von,
  DROP COLUMN IF EXISTS station_bis,
  DROP COLUMN IF EXISTS manuell_korrigiert,
  DROP COLUMN IF EXISTS rangscore,
  DROP COLUMN IF EXISTS befristung;
