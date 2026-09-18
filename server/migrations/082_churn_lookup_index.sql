-- T-747-Nachbesserung: "neu"/"weggefallen" muss echte Quellen-Rotation herausrechnen (siehe
-- routes/veraenderungen.js, echte_neu/echte_weg-CTEs). Der Anti-Join dort filtert nach
-- quellen_id+kategorie+aktiv, dann lat/lng-Bereich — dieser Index deckt die Gleichheits-
-- Praedikate ab, lat/lng-Range laeuft ueber die bestehenden obstacles_lat_idx/obstacles_lng_idx.
CREATE INDEX IF NOT EXISTS obstacles_churn_lookup_idx ON obstacles (quellen_id, kategorie, aktiv);
