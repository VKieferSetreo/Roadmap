-- T-760: "Geändert" heißt ab hier nur noch, was die QUELLE an einer bestehenden Maßnahme
-- geändert hat. Max, 22.09.2026: "wir wollen nur das wenn quelle X eine baustelle bsp vom
-- 01-03 meldet und dann auf 01-05 verlängert das das als veränderung zählt. nicht was WIR
-- mit den Daten machen."
--
-- Gemessen vor dem Fix: 572 Einträge am 21.09., 302 am 22.09.; auf dem Dashboard standen 381.
-- Erwartet sind 2 bis 10. Zwei Ursachen, beide hausgemacht:
--   1. Ein Worker-Deploy am 21.09. 16:00 UTC ließ 47 Quellen gleichzeitig anlaufen; weil sich
--      die Vergleichslogik geändert hatte, meldete der gesamte Bestand sich einmal als
--      geändert (458 Einträge in einer Minute, 351 davon auf längst bestehenden Zeilen).
--   2. Laufend: unser Parser. Die Autobahn-Beschreibung listet jeden Termin einer
--      wiederkehrenden Maßnahme; wir nehmen den ersten als Beginn. Fällt der abgelaufene
--      Termin über Nacht aus dem Text, wandert der Beginn — ohne Zutun der Behörde.
--      258 der 302 Einträge vom 22.09. hatten gueltig_von == Erkennungstag.

-- Der zuletzt von der QUELLE gemeldete Stand, als Objekt statt als Hash: derselbe Vergleich
-- liefert damit auch den Beleg. Anfangs NULL = "noch nie verglichen" → der erste Lauf je
-- Quelle stempelt still, ohne Meldung. Genau daran fehlte es am 21.09.
ALTER TABLE obstacles ADD COLUMN IF NOT EXISTS quell_stand jsonb;

-- Der Beleg je Änderung: {"gueltigBis": ["2026-03-01", "2026-05-01"]}. Ohne ihn ließ sich nicht
-- nachsehen, WAS sich geändert hatte — die Tabelle trug nur den Zustand danach.
ALTER TABLE obstacle_aenderungen ADD COLUMN IF NOT EXISTS aenderung jsonb;

-- Der Altbestand wandert ins Archiv, er wird NICHT gelöscht. Beim Vorgängerfix (T-749) hat
-- genau so eine Archivtabelle die einzige belastbare Vorher/Nachher-Messung dieses Falls
-- geliefert (628 an zwei Tagen wiederholt gemeldete Hindernisse, davon 8 mit wirklich bewegtem
-- Enddatum). Wer die nächste Definition prüfen will, braucht denselben Vergleich.
-- Die 874 Zeilen entstanden unter der alten, weiten Definition und sind unter der neuen keine
-- Ereignisse; sie stehen deshalb nicht mehr im Dashboard.
ALTER TABLE IF EXISTS obstacle_aenderungen RENAME TO obstacle_aenderungen_vor_t760;
CREATE TABLE obstacle_aenderungen (LIKE obstacle_aenderungen_vor_t760 INCLUDING ALL);

-- change_hash bleibt eine Migration lang stehen: solange der vorherige Code noch laufen könnte
-- (Rollback), schreibt er die Spalte weiter. Sie wird in 088 entfernt, sobald ein Tag grün ist.
