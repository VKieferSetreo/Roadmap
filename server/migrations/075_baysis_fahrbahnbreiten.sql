-- 075 — Bayerische Fahrbahnbreiten aufnehmen (T-696).
--
-- Bayern war die größte Lücke der Abdeckungsmessung: 12.341 Einträge, davon 304 mit einer
-- Massangabe (2 Prozent). Der Grund liegt nicht an unseren Connectoren, sondern an der Quelllage,
-- und das ist nachgemessen: die schon angebundenen BAYSIS-Bauwerke (0123) führen 12.295 Bauwerke,
-- davon ganze 49 mit Höhen- und 25 mit Gewichtsbeschränkung.
--
-- Ein Verkehrszeichenkataster gibt es in Bayern nicht. Geprüft wurden alle sieben BAYSIS-WFS, das
-- ArcGIS-Verzeichnis des Innenministeriums, open.bydata.de (ein einziger Treffer auf
-- "Verkehrszeichen", die Umweltzone München), GovData, der GDI-DE-Katalog (101 Verkehrszeichen-
-- Datensätze, keiner aus Bayern) sowie die Kataloge von München, Nürnberg und Würzburg.
--
-- Was es stattdessen gibt, ist der ASB-Fahrbahnquerschnitt des klassifizierten Netzes: Element für
-- Element mit linkem und rechtem Abstand zur Straßenachse. Daraus lässt sich die schmalste
-- durchgehend befahrbare Breite je Station ableiten — für einen Schwertransport genau die Zahl,
-- an der eine Engstelle hängt. Gemessen: 3.654 Engstellen unter 4,50 m, alle mit Koordinate,
-- Median 3,75 m, 476 davon unter 3,50 m.
--
-- Das Feld ist maxBreiteM und nicht restbreiteM, mit Absicht: restbreiteM steht in auflagen.js für
-- die Restbreite einer BAUSTELLE und löst "Abstimmung mit dem Baustellenbetreiber" aus. Hier ist
-- es gebaute Straße. Gegengeprüft an der Engine: ein 3,00-m-Transport passt durch 3,50 m (kein
-- Fund), ein 3,60-m-Transport wird kritisch mit Marge −0,10 m.
--
-- Lizenz CC BY 4.0, aus dem GetCapabilities des Dienstes selbst gelesen (ows:AccessConstraints,
-- Fees "none"). Kommerzielle Nutzung erlaubt, Namensnennung Pflicht und im Quellennamen geführt.
INSERT INTO quellen (id, name, typ, endpoint_url, aktiv, lizenz, lizenz_status)
VALUES ('0234', 'Bayern — Fahrbahnbreiten (Bayerische Straßenbauverwaltung, BAYSIS)', 'wfs',
        'https://gisportal-stmb.bayern.de/server/services/WFS/BAYSIS_Strassenbestand/MapServer/WFSServer',
        true, 'CC BY 4.0 (Namensnennung: Bayerische Straßenbauverwaltung — BAYSIS)', 'ready')
ON CONFLICT (id) DO NOTHING;
