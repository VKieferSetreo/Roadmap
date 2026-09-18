-- T-747-Nachbesserung (Max, 18.09.): Anti-Join in routes/veraenderungen.js bekommt eine ZWEITE
-- Bedingung (Name-Gleichheit, nicht nur Geo-Nähe) — fängt Quellen-Rotation, deren Referenzpunkt
-- weiter als der Geo-Radius wandert, aber deren Name identisch bleibt. Ohne Index scannt der
-- Name-Abgleich pro Zeile den kompletten Quellen-Bestand.
CREATE INDEX IF NOT EXISTS obstacles_quelle_kat_name_idx ON obstacles (quellen_id, kategorie, name);
