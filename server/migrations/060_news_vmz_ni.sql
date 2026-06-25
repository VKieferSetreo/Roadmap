-- News-Eintrag zur neuen Datenquelle VMZ Niedersachsen innerorts (0158, T-566).
-- Max-Regel: neue Datenquellen IMMER in den News-Feed. published_at = now() (Deploy-Zeit).
INSERT INTO news (kategorie, titel, body, created_by) VALUES (
  'datenquelle',
  'Neue Datenquelle: Niedersachsen innerorts (VMZ Niedersachsen)',
  'Neu angebunden sind innerörtliche und kommunale Baustellen sowie Sperrungen in Niedersachsen — Kreisstraßen und Stadtstraßen aus der Verkehrsmanagementzentrale Niedersachsen. Sie ergänzen die bereits eingebundenen Bundes- und Landesstraßen-Baustellen und fließen automatisch in jede Auswertung ein.',
  NULL
);
