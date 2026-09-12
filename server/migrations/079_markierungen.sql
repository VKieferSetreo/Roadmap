-- 079 — Punkt-Ebenen am Projekt (T-739).
--
-- Ein Projekt trägt neben Strecken jetzt eigene STANDORTE: Parkplätze, Windräder, Kranstellflächen
-- — hochgeladen als KML/KMZ/GeoJSON/Shapefile-ZIP/GeoPackage, je Datei bzw. je Layer eine Ebene.
-- Sie sind rein visuell: die Auswertung fasst sie nicht an, sie erscheinen nur als eigene
-- Karten-Ebene. Deshalb entsteht hier auch KEINE Beziehung zu findings/obstacles.
--
-- DIESELBE BAUFORM WIE `routes` (002_v2.sql:40): ein jsonb-Array am Projekt, NOT NULL DEFAULT '[]'.
-- Jede bestehende Zeile bedeutet damit sofort „keine Ebenen" statt NULL, und kein Leser braucht
-- eine Sonderbehandlung. Keine eigene Tabelle, weil eine Ebene immer als Ganzes geschrieben und
-- gelesen wird (PATCH ersetzt das Array); es gibt keine Abfrage nach einzelnen Punkten.
--
-- WARUM DIE MENGENGRENZEN NICHT ALS CHECK HIER STEHEN: 5.000 Punkte je Ebene, 50 Ebenen je
-- Projekt, 30 Attribute je Punkt werden in normalizeMarkierungen (server/src/routes/projects.js)
-- durchgesetzt. Dort können sie eine verständliche deutsche Meldung erzeugen und einzelne
-- kaputte Punkte verwerfen, statt den ganzen Schreibvorgang mit einem Constraint-Fehler
-- abzubrechen. Ein CHECK über jsonb-Tiefe wäre teuer und stumm zugleich.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS markierungen jsonb NOT NULL DEFAULT '[]';

COMMENT ON COLUMN projects.markierungen IS
  'Punkt-Ebenen (T-739): [{id,name,fileName?,farbe,oeffentlich?,punkte:[{lat,lng,name?,attribute?}]}]. Rein visuell, fließt nicht in die Auswertung ein. Grenzen setzt normalizeMarkierungen durch.';
