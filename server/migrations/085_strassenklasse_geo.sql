-- Straßenklasse aus der KOORDINATE (Max 2026-09-20: "kannst ja über Koordinaten die Straße
-- auslesen"). Hintergrund: 32.905 von 78.808 aktiven Hindernissen (41,8 %) tragen gar kein
-- strassen_ref — dort hilft keine Textregel mehr. Eine Stichprobe über 60 zufällige dieser
-- Einträge löste per OSRM 92 % auf (80 % Gemeindestraße, 7 % Bundes-, 3 % Autobahn, 2 % Kreis).
--
-- Zwei getrennte Dinge, mit Absicht:
--   1. geo_strassenklasse — Cache je GERUNDETER Koordinate (4 Nachkommastellen ≈ 11 m), NICHT
--      je Hindernis. Mehrere Hindernisse an derselben Stelle (Bauphasen, Segmente, Dubletten
--      verschiedener Quellen) teilen sich damit einen OSRM-Abruf.
--   2. obstacles.strassen_klasse — das aufgelöste Ergebnis am Hindernis, damit die Auswertung
--      ohne Join und ohne Laufzeit-Abruf arbeitet.
-- strassen_ref bleibt unangetastet: das ist die Angabe der QUELLE und wird nicht überschrieben.
CREATE TABLE IF NOT EXISTS geo_strassenklasse (
  lat_r        numeric(8,4) NOT NULL,
  lng_r        numeric(8,4) NOT NULL,
  klasse       text NOT NULL,
  ref          text,
  strassenname text,
  erkannt_am   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (lat_r, lng_r)
);

ALTER TABLE obstacles ADD COLUMN IF NOT EXISTS strassen_klasse text;

-- Nur die Zeilen, die der Resolver ueberhaupt anfassen muss.
CREATE INDEX IF NOT EXISTS obstacles_ohne_klasse_idx ON obstacles (id)
  WHERE aktiv = true AND strassen_klasse IS NULL AND (strassen_ref IS NULL OR btrim(strassen_ref) = '');
