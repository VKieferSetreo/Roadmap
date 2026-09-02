-- Die Fertig-Marke bekommt einen eigenen Zustand (T-657).
--
-- WARUM: am 02.09.2026 hat eine Aufraeumroutine 1,4 Millionen "veraltete" Leermeldungen geloescht
-- und dabei 61.271 Fertig-Marken mitgenommen — weil die technisch dasselbe waren (stand='leer').
-- Damit galten 61.000 laengst bearbeitete Punkte wieder als offen. Der Loeschbefehl trug sogar
-- ausdruecklich ein `AND stand = 'leer'` als Schutz; es half nicht, weil die Marke diesen Zustand
-- teilte.
--
-- Ein Kommentar haette das nicht verhindert, ein eigener Zustand schon: 'marke' ist keine
-- Leermeldung, kann also von keiner Abfrage getroffen werden, die auf Leermeldungen zielt.
-- Das ist der Unterschied zwischen "wir muessen daran denken" und "es kann nicht passieren".
ALTER TABLE anreicherung DROP CONSTRAINT IF EXISTS anreicherung_stand_chk;
ALTER TABLE anreicherung ADD CONSTRAINT anreicherung_stand_chk
  CHECK (stand IN ('ok', 'leer', 'verworfen', 'fehler', 'marke'));

COMMENT ON COLUMN anreicherung.stand IS 'ok = Wert steht. leer = Modell hat zu diesem Feld nichts gefunden. verworfen = Wert kam, hielt aber der Pruefung nicht stand. fehler = Aufruf fehlgeschlagen. marke = kein Feld, sondern der Vermerk "dieser Punkt ist durch" (feld=''_fertig''); bewusst ein eigener Zustand, damit keine Aufraeumroutine fuer Leermeldungen sie erwischt.';

-- Bestehende Marken umstellen.
UPDATE anreicherung SET stand = 'marke' WHERE feld = '_fertig' AND stand = 'leer';

-- Der Eindeutigkeits-Index muss den neuen Zustand kennen, sonst koennte ein Punkt zwei Marken
-- desselben Modells bekommen.
DROP INDEX IF EXISTS anreicherung_ziel_feld_modell_idx;
CREATE UNIQUE INDEX IF NOT EXISTS anreicherung_ziel_feld_modell_idx
  ON anreicherung (ziel_typ, ziel_id, feld, modell) WHERE stand IN ('ok', 'leer', 'marke');

-- Der Index fuer die Kandidatenwahl (migrations/070) filtert auf feld='_fertig' und ist vom
-- Zustandswechsel nicht betroffen — er bleibt, wie er ist.
