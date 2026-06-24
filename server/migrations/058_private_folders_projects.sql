-- Private Ordner/Projekte: zweite Zone in der Sidebar (geteilt vs. privat).
-- owner_email IS NULL = geteilt (alle Mandanten-Mitglieder); gesetzt = privat nur für diese Person.
-- Sichtbar ist ein Eintrag, wenn owner_email NULL ist ODER = der eigenen E-Mail ODER der Betrachter
-- ein Setreo-Admin ist (Max-Entscheid 2026-06-24: Admins sehen beim Mandanten-Switch alles).
-- Additiv + nullable → Bestand bleibt geteilt (unverändertes Verhalten), bis Inhalte privat gezogen werden.
ALTER TABLE folders  ADD COLUMN IF NOT EXISTS owner_email text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS owner_email text;

-- Teil-Indizes nur auf die (wenigen) privaten Zeilen — der Normalfall (owner_email NULL) bleibt unindiziert.
CREATE INDEX IF NOT EXISTS folders_owner_idx  ON folders  (tenant_id, owner_email) WHERE owner_email IS NOT NULL;
CREATE INDEX IF NOT EXISTS projects_owner_idx ON projects (tenant_id, owner_email) WHERE owner_email IS NOT NULL;
