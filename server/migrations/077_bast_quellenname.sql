-- 077 — Quelle 0153 heißt, was sie liefert (T-703).
--
-- Der Name „schwerverkehrsgesperrte Brücken" behauptet eine Sperrung. Die Auswertung macht daraus
-- seit T-601 bewusst KEINE Sperrung, sondern „auflagenpflichtig — Tragfähigkeit für GST prüfen".
-- Damit widersprach das Quellenregister dem Fund, den es erklären soll, und zwar in der schärferen
-- Richtung: der Disponent liest „gesperrt" und findet „auflagenpflichtig".
--
-- Nachgeprüft am 06.09.2026, warum die Regel und nicht der Name recht hat:
--   1. Das zugrunde liegende Feld sperrung_sv steht NICHT in der BASt-Brückenstatistik. Deren
--      offizielle CSV führt 17 Spalten (id_nr, bauwerk, bauwerksart_text, stadium_text, bwnr,
--      tbwnr, jast_lage, baujahr, laenge, breite, flaeche, trag_l_idx, laengenklasse,
--      baustoffklasse, altersklasse, zustandsnote, zustandsnotenklasse) — sperrung_sv ist keine.
--   2. Der Dienst gehört esri_DE_content (Esri Deutschland), nicht der BASt. Deren
--      Item-Beschreibung erklärt jede einzelne Zustandsnotenklasse, zu sperrung_sv kein Wort.
--      Die BASt-Seite dokumentiert es ebenfalls nicht.
--   3. Die Verteilung widerlegt jede Zustands-Lesart: bei sperrung_sv='ja' trägt der Traglastindex
--      2.073 mal Stufe I ("keine Tragfähigkeits-Defizite") und nur 190 mal Stufe V. Umgekehrt
--      haben 2.187 Bauwerke mit Stufe V ein sperrung_sv='nein'. Wäre das Feld eine Folge des
--      Bauzustands, sähe es genau andersherum aus. 3.294 von 52.553 Bauwerken tragen 'ja'.
--
-- Der Name sagt jetzt das, was durch die Daten gedeckt ist. Schärfer darf er erst werden, wenn
-- jemand eine Auskunft der BASt zum Feld hat — nicht auf eine neue Vermutung hin.
UPDATE quellen
SET name = 'BASt Brückenstatistik — Brücken mit Auflagen für Schwertransporte (bundesweit)'
WHERE id = '0153';
