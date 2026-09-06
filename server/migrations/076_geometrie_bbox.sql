-- 076 — Die Bounding-Box der GEOMETRIE als Spalten (T-700).
--
-- DER FEHLER, DEN DAS BEHEBT. Der Vorfilter in analyze() zieht Hindernis-Kandidaten über
-- `lat BETWEEN ... AND lng BETWEEN ...`, und das ist der ANKERPUNKT des Hindernisses. Bei einem
-- Punkt ist das richtig. Bei einer Linie ist es der Anfangs- oder Mittelpunkt, und die Linie kann
-- von dort aus beliebig weit laufen.
--
-- Gemessen am 06.09.2026: 13,3 Prozent aller 35.315 aktiven Linien-Hindernisse reichen mehr als
-- einen Kilometer über ihren Anker hinaus. In einer Stichprobe von 500 Geometrien liegt bei 88
-- (17,6 Prozent) der Anker AUSSERHALB der eigenen Bbox; die größte Spanne beträgt 0,386 Grad,
-- also rund 43 km.
--
-- Folge im Betrieb, über alle 67 ausgewerteten Projekte nachgezählt: 172 (Projekt, Hindernis)-
-- Paare in 42 von 67 Projekten liegen im 20-m-Korridor der Route, werden aber nie geladen, weil
-- ihr Anker die Routen-Bbox verfehlt. 17 davon mit sicherer Restbreiten-Verletzung.
-- Beispiel 20280_DO-Unna: "A1 | Hamm/Bergkamen – Unna", Anker 12,45 km jenseits der Bbox, die
-- Geometrie berührt die Route mit 0,0 m Abstand, Restbreite 3,75 m bei 5,00 m Transportbreite.
-- Das Projekt zeigte genau EINEN Fund.
--
-- Das ist der einzige Fehlertyp, der einen Transport losschickt, der physisch nicht durchpasst.

-- WARUM GENERIERTE SPALTEN und nicht Trigger oder Pflege im Code: `geom` wird an mindestens fünf
-- Stellen geschrieben (obstaclesRepo INSERT/UPDATE/Batch-Upsert, worker/importer, routes/obstacles).
-- Eine generierte Spalte greift bei allen, auch bei jeder künftigen. Sie kann nicht vergessen
-- werden, und es gibt keinen Backfill, der schiefgehen könnte.
--
-- KOSTEN GEMESSEN, bevor das hier lief: der Ausdruck braucht 4 ms für 2.000 Geometrien, der
-- Rewrite der 153-MB-Tabelle ist damit eine Sache von Sekunden, nicht Minuten.

-- Der Pfad findet die Koordinatenpaare in JEDER GeoJSON-Verschachtelung: LineString (40.384),
-- MultiLineString (15.346), Polygon (6.616), MultiPolygon (1.092) — alle vier Typen gegengeprüft.
-- Die Bedingung `@[0].type() == "number"` trifft genau die [lng, lat]-Paare und nicht die
-- Zwischen-Arrays.
CREATE OR REPLACE FUNCTION geom_grenze(g jsonb, welche text)
RETURNS double precision LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $fn$
  SELECT CASE welche
           WHEN 'minlat' THEN min((p->>1)::float8)
           WHEN 'maxlat' THEN max((p->>1)::float8)
           WHEN 'minlng' THEN min((p->>0)::float8)
           WHEN 'maxlng' THEN max((p->>0)::float8)
         END
  FROM jsonb_path_query(
    g, '$.coordinates.**{0 to 3} ? (@.type() == "array" && @[0].type() == "number")') AS p
$fn$;

-- COALESCE auf lat/lng, mit Absicht: so sind die Spalten IMMER gefüllt, auch bei den 50.504
-- Punkt-Hindernissen ohne Geometrie. Der Vorfilter braucht dann kein COALESCE zur Laufzeit und
-- bleibt eine schlichte Bereichsbedingung — ein Index darauf ist nutzbar, ein Ausdruck mit
-- COALESCE über zwei Spalten wäre es nicht.
ALTER TABLE obstacles
  ADD COLUMN geom_min_lat double precision
    GENERATED ALWAYS AS (COALESCE(geom_grenze(geom, 'minlat'), lat)) STORED,
  ADD COLUMN geom_max_lat double precision
    GENERATED ALWAYS AS (COALESCE(geom_grenze(geom, 'maxlat'), lat)) STORED,
  ADD COLUMN geom_min_lng double precision
    GENERATED ALWAYS AS (COALESCE(geom_grenze(geom, 'minlng'), lng)) STORED,
  ADD COLUMN geom_max_lng double precision
    GENERATED ALWAYS AS (COALESCE(geom_grenze(geom, 'maxlng'), lng)) STORED;

-- Für die Überschneidungsfrage "Hindernis-Box schneidet Routen-Box" sind die beiden OBEREN
-- Grenzen die selektiven: eine Route deckt in Deutschland nie mehr als ein paar Breitengrade ab,
-- und geom_max_lat >= minLat siebt den Großteil schon aus.
CREATE INDEX IF NOT EXISTS obstacles_geom_bbox_idx
  ON obstacles (geom_max_lat, geom_max_lng);
