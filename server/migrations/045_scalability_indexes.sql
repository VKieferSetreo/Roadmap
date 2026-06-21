-- Skalierungs-Indizes (Backlog-Sweep II, T-260/T-313/T-381 + T-371).
-- Additiv + idempotent. Plain CREATE INDEX (kein CONCURRENTLY — der Migrations-Runner fährt jede
-- Migration in EINER Transaktion; auf ~39k obstacles/kleinen projects ist der Build sub-Sekunde).

-- T-260/T-313/T-381: Bbox-Korridor-Scan der Engine + DB-Karte filtert lat/lng BETWEEN. Ohne
-- Composite-Index lief das als Box-Scan über den Einzelspalten-Index. (lat, lng) deckt beide Achsen.
CREATE INDEX IF NOT EXISTS obstacles_lat_lng_idx ON obstacles (lat, lng);

-- T-371: notifications-SCOPE_FILTER (eigene Projekte) und Home-Listen filtern projects.created_by.
CREATE INDEX IF NOT EXISTS projects_created_by_idx ON projects (created_by);
