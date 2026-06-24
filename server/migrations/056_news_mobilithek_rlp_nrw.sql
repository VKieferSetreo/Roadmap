-- News-Eintrag zu den zwei neuen Datenquellen (RLP 0148 + NRW 0149, Mobilithek).
-- Max-Regel: neue Datenquellen IMMER in den News-Feed. published_at = now() (Deploy-Zeit).
INSERT INTO news (kategorie, titel, body, created_by) VALUES (
  'datenquelle',
  'Neue Datenquellen Rheinland-Pfalz und Nordrhein-Westfalen',
  'Neu angebunden sind die Arbeitsstellen im klassifizierten Straßennetz von Rheinland-Pfalz (Landesbetrieb Mobilität) sowie im nachgeordneten Netz von Nordrhein-Westfalen (Straßen.NRW). Beide Quellen fließen automatisch in jede Auswertung ein.',
  NULL
);
