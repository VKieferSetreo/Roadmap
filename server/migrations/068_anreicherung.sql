-- Angereicherte Stammdaten (T-657).
--
-- Max, 31.08.2026: "allgemein um Stammdaten zu fuellen, die man ablesen koennte, die aber nicht
-- geschrieben werden. Damit bekommen wir bessere Datenqualitaet als Rohdaten und schaffen echten
-- Mehrwert gegenueber NUR auslesen."
--
-- WARUM EINE EIGENE TABELLE UND KEINE SPALTEN AN obstacles:
-- Ein abgeleiteter Wert und ein gemeldeter Wert sind nicht dasselbe, auch wenn beide "A7" sagen.
-- Schriebe man sie in dieselben Felder, waere nach dem ersten Lauf nicht mehr feststellbar, was
-- die Behoerde geliefert und was ein Modell herausgelesen hat. Genau diese Unterscheidung ist
-- aber die Grundlage jeder spaeteren Korrektur: faellt auf, dass ein Modell systematisch daneben
-- lag, muss man seine Werte wegwerfen koennen, ohne die Quelldaten zu beschaedigen.
-- Deshalb steht hier NUR das Abgeleitete, und der Leser entscheidet, ob er es benutzt.
--
-- Der Import ueberschreibt obstacles regelmaessig komplett. Eine Spalte dort waere ohnehin beim
-- naechsten Lauf weg.

CREATE TABLE IF NOT EXISTS anreicherung (
  id             bigserial PRIMARY KEY,
  ziel_typ       text NOT NULL,
  ziel_id        text NOT NULL,
  feld           text NOT NULL,
  wert           text,
  beleg          text,
  konfidenz      real,
  modell         text NOT NULL,
  quelle_hash    text NOT NULL,
  stand          text NOT NULL DEFAULT 'ok',
  geprueft       boolean,
  erstellt_am    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT anreicherung_stand_chk CHECK (stand IN ('ok', 'leer', 'verworfen', 'fehler'))
);

COMMENT ON TABLE anreicherung IS 'Aus Freitext abgeleitete Stammdaten, streng getrennt von den gemeldeten Rohdaten. Ein Eintrag je (Ziel, Feld, Modell). Wer diese Werte liest, MUSS sie als abgeleitet kennzeichnen.';
COMMENT ON COLUMN anreicherung.ziel_typ IS 'obstacle | finding | projekt. Absichtlich Text und kein Fremdschluessel: die Tabelle soll auch Ziele aufnehmen koennen, die beim naechsten Import neu angelegt werden.';
COMMENT ON COLUMN anreicherung.feld IS 'Name des Zielfelds, z.B. getrageneStrasse, gekreuzteStrasse, maxHoeheM.';
COMMENT ON COLUMN anreicherung.wert IS 'Der abgeleitete Wert, bereits normalisiert. NULL bei stand=leer (das Modell hat nichts gefunden) oder stand=fehler.';
COMMENT ON COLUMN anreicherung.beleg IS 'Die WOERTLICHE Textstelle aus der Quelle, auf die sich der Wert stuetzt. Ohne Beleg wird nicht uebernommen: er ist der Riegel gegen erfundene Angaben, denn er muss im Quelltext vorkommen.';
COMMENT ON COLUMN anreicherung.quelle_hash IS 'Hash des Quelltexts, aus dem abgeleitet wurde. Aendert die Quelle ihren Text, ist die Ableitung ungueltig und wird neu gerechnet, statt still zu veralten.';
COMMENT ON COLUMN anreicherung.stand IS 'ok = Wert steht. leer = Modell hat nichts gefunden (wird vermerkt, damit der naechste Lauf ihn nicht erneut anfasst). verworfen = Wert kam, hielt aber der Pruefung nicht stand. fehler = Aufruf fehlgeschlagen.';
COMMENT ON COLUMN anreicherung.geprueft IS 'Von Hand bestaetigt oder verworfen. NULL = noch niemand angesehen.';

-- Ein Ziel/Feld je Modell genau einmal. Der Lauf ist damit wiederaufnehmbar: was schon dasteht,
-- wird uebersprungen, und ein Neustart nach Tagen kostet nichts.
CREATE UNIQUE INDEX IF NOT EXISTS anreicherung_ziel_feld_modell_idx
  ON anreicherung (ziel_typ, ziel_id, feld, modell);

-- Der Lesepfad der Engine: alle Felder eines Ziels auf einmal.
CREATE INDEX IF NOT EXISTS anreicherung_ziel_idx ON anreicherung (ziel_typ, ziel_id) WHERE stand = 'ok';
