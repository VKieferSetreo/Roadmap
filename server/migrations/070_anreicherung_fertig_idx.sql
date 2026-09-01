-- Der Index, an dem der Bestandslauf nach 8,8 Stunden gescheitert ist (T-657).
--
-- SYMPTOM: "Error: Query read timeout" in der Kandidatenwahl, bei 33.200 von 73.197 Punkten.
-- Der Lauf lief zu diesem Zeitpunkt seit 526 Minuten und hatte 7.606 Angaben gefunden.
--
-- URSACHE, aus dem Plan:
--   Nested Loop Anti Join
--     Join Filter: (a.ziel_id = (o.id)::text)      <- Filter, kein Index-Lookup
--     -> Parallel Seq Scan on anreicherung          <- voller Scan, 703.908 Zeilen
--          rows=1596                                <- geschaetzt; tatsaechlich 33.200
--
-- Postgres schaetzt die Zahl der Fertig-Marken um das Zwanzigfache zu niedrig — es kennt die
-- Selektivitaet der Kombination (ziel_typ, modell, feld, wert) nicht und multipliziert die
-- Einzelwahrscheinlichkeiten. Mit dieser Schaetzung erscheint ein Seq Scan mit anschliessendem
-- Materialize billiger als 73.000 Index-Lookups, und die Abfrage wird quadratisch.
--
-- Die Statistik war dabei NICHT veraltet (autoanalyze lief 20 Minuten vor dem Absturz). Es ist
-- eine Schaetzschwaeche, kein Wartungsproblem — und deshalb hilft nur ein Index, der genau diese
-- Frage beantwortet.
--
-- PARTIELL auf die Marken: das sind 33.200 von 703.908 Zeilen, also ein Index von unter fuenf
-- Prozent der Tabellengroesse. Fuer die eine Frage, die er beantworten muss ("traegt dieser Punkt
-- die Fertig-Marke dieses Modells mit dieser Katalogversion?"), ist er damit sehr schnell.
--
-- Spaltenreihenfolge nach Selektivitaet: ziel_id trennt am staerksten (ein Punkt), dann modell,
-- dann wert (die Katalogversion).
CREATE INDEX IF NOT EXISTS anreicherung_fertig_idx
  ON anreicherung (ziel_id, modell, wert)
  WHERE feld = '_fertig';

COMMENT ON INDEX anreicherung_fertig_idx IS
  'Kandidatenwahl des Bestandslaufs: haelt den Anti-Join gegen die Fertig-Marken bei einem Index-Lookup statt einem Seq Scan ueber die ganze Tabelle. Ohne ihn lief der Lauf ab rund 30.000 Punkten in einen Query-Timeout.';

ANALYZE anreicherung;
