-- T-416: Akzeptanz-Log forensisch härten. Bisher nur (email, version, accepted_at) — für einen
-- belastbaren Vertragsschluss-Nachweis fehlen Herkunft (IP) und Mandantenkontext zum Zeitpunkt der
-- Zustimmung. Beide additiv + nullable (Bestandszeilen bleiben gültig; kein Backfill möglich).
ALTER TABLE disclaimer_acceptances ADD COLUMN IF NOT EXISTS ip text;
ALTER TABLE disclaimer_acceptances ADD COLUMN IF NOT EXISTS tenant_id text;
