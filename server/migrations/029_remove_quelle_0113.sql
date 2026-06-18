-- 029: 0113 (Bedarfsumleitungen Hamburg, BWVI) endgültig aus dem Quellen-Register entfernen.
-- Connector wurde bereits aus dem Code genommen, der Altbestand deaktiviert — die Quelle soll
-- aber auch nicht mehr im Register erscheinen. import_runs zuerst löschen (FK quelle_id → quellen),
-- dann die Registry-Zeile. Idempotent (DELETE … WHERE = 0 Zeilen bei erneutem Lauf).

DELETE FROM import_runs WHERE quelle_id = '0113';
DELETE FROM quellen WHERE id = '0113';
