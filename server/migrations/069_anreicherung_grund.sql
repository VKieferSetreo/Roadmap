-- Warum eine Angabe abgewiesen wurde (T-657).
--
-- Die erste Fassung schrieb nur "ok" und "leer". Damit liess sich zwar messen, WIE VIEL gefunden
-- wurde, aber nicht, was auf dem Weg verlorenging und warum. Genau das ist die interessantere
-- Frage: eine Angabe, die ein Riegel faelschlich abweist, sieht in der Statistik exakt aus wie
-- eine, die es nie gab.
ALTER TABLE anreicherung ADD COLUMN IF NOT EXISTS grund text;
ALTER TABLE anreicherung ADD COLUMN IF NOT EXISTS roh_wert text;

COMMENT ON COLUMN anreicherung.grund IS 'Bei stand=verworfen: welcher Riegel gegriffen hat. Die Grundlage jeder Verbesserung der Extraktion — ohne sie sieht ein zu Unrecht verworfener Wert aus wie ein nie gefundener.';
COMMENT ON COLUMN anreicherung.roh_wert IS 'Bei stand=verworfen: was das Modell geantwortet hat, unveraendert. Damit laesst sich pruefen, ob der Riegel richtig lag.';

-- Ein Ziel/Feld kann jetzt mehrere Verwerfungen haben (das Modell schlaegt manchmal zwei Werte
-- fuer dasselbe Feld vor). Der bisherige Eindeutigkeits-Index gilt deshalb nur noch fuer das,
-- was wirklich uebernommen wurde.
DROP INDEX IF EXISTS anreicherung_ziel_feld_modell_idx;
CREATE UNIQUE INDEX IF NOT EXISTS anreicherung_ziel_feld_modell_idx
  ON anreicherung (ziel_typ, ziel_id, feld, modell) WHERE stand IN ('ok', 'leer');

CREATE INDEX IF NOT EXISTS anreicherung_verworfen_idx ON anreicherung (feld, grund) WHERE stand = 'verworfen';
