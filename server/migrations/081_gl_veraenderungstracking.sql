-- GL-Änderungstracking: die GL bezweifelte "so viele Änderungen an Baustellen/Sperrungen
-- kann es nicht geben" — ab jetzt wird jede echte inhaltliche Änderung eines Hindernisses
-- protokolliert (neu/weggefallen sind aus obstacles selbst able, brauchen keine eigene
-- Tabelle: created_at ist ein echter Einfüge-Zeitstempel, aktiv=false+updated_at ist die
-- Reconcile-Deaktivierung, beide unberührt vom T-738-Bug unten).
--
-- change_hash trägt den Hash der "Sachfelder", die eine ECHTE Änderung ausmachen (obstaclesRepo.js
-- changeRelevantHash). Der Importer stempelt UPDATE_SACHFELDER_SQL bei JEDEM Re-Import
-- bedingungslos updated_at = now() (T-738) — 76.721 von 77.715 Zeilen täglich, obwohl nur ~7.861
-- wirklich anderen Inhalt tragen (T-737-Messung 07.09.). updated_at ist deshalb KEIN Änderungssignal;
-- der Hash-Vergleich beim Update ist es.
ALTER TABLE obstacles ADD COLUMN IF NOT EXISTS change_hash text;

-- Nur "geaendert"-Ereignisse: eine Zeile je Tag, an dem sich der relevante Inhalt eines
-- Hindernisses wirklich geändert hat (nicht bei jedem Re-Import). gueltig_von/bis als Snapshot
-- vom Erkennungszeitpunkt, damit eine spätere weitere Änderung die Historie nicht überschreibt.
CREATE TABLE IF NOT EXISTS obstacle_aenderungen (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  obstacle_id  uuid NOT NULL,
  kategorie    text NOT NULL,
  quellen_id   text,
  strassen_ref text,
  gueltig_von  date,
  gueltig_bis  date,
  erkannt_am   date NOT NULL DEFAULT current_date,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Ein Import läuft mehrmals täglich (08:00/16:00 UTC) — pro Hindernis nur EIN "geaendert" je Tag.
CREATE UNIQUE INDEX IF NOT EXISTS obstacle_aenderungen_once_per_day_ux
  ON obstacle_aenderungen (obstacle_id, erkannt_am);
CREATE INDEX IF NOT EXISTS obstacle_aenderungen_erkannt_idx ON obstacle_aenderungen (erkannt_am DESC);

-- "neu" liest obstacles.created_at im Fenster; "weggefallen" liest aktiv=false + updated_at im
-- Fenster (Reconcile ist der EINZIGE Pfad, der aktiv auf false setzt — WHERE aktiv=true davor
-- macht das eine einmalige, saubere Zustandsänderung, kein Dauerstempel).
CREATE INDEX IF NOT EXISTS obstacles_created_at_idx ON obstacles (created_at);
CREATE INDEX IF NOT EXISTS obstacles_inaktiv_updated_idx ON obstacles (updated_at) WHERE aktiv = false;
