-- News-Eintrag: KI-Aufbereitung der Hindernisdaten (T-657/T-662). published_at = now() (Deploy-Zeit).
--
-- Bewusst OHNE konkrete Zahlen: der Bestand waechst jede Nacht, und eine Zahl von heute waere in
-- einer Woche falsch. Die bestehenden News-Eintraege halten es genauso.
INSERT INTO news (kategorie, titel, body, created_by) VALUES (
  'version',
  'Neu: Maße und Sperrungen werden automatisch aus den Meldungstexten gelesen',
  'Behörden melden Durchfahrtshöhen, Restbreiten, Gewichtsgrenzen und Sperrungsarten oft nur im Fließtext der Beschreibung — als eigenes Datenfeld fehlen sie. Diese Angaben werden jetzt automatisch aus dem Meldungstext gelesen und am Fund hinterlegt, sodass sie in Auswertungen und Routenprüfungen mitzählen.

Jede so gewonnene Angabe braucht einen Beleg: die Textstelle, auf die sie sich stützt, muss wörtlich in der Meldung stehen, und der Wert muss daraus folgen. Was diese Prüfung nicht besteht, wird verworfen statt übernommen. Angaben, die die Behörde selbst gemeldet hat, bleiben immer unangetastet — ergänzt wird nur, was fehlt.

Aufbereitete Funde tragen einen violetten Stern hinter dem Titel, aufbereitete Einzelwerte sind violett hervorgehoben. So bleibt jederzeit unterscheidbar, was gemeldet und was abgeleitet wurde. Die Aufbereitung läuft einmal täglich nachts über alle neu hinzugekommenen Meldungen.',
  NULL
);
