-- Projekt-Archiv: archivierte Projekte bleiben erhalten (inkl. Funde/Shares),
-- werden im FE aus der Hauptliste ausgeblendet.
ALTER TABLE projects ADD COLUMN archived_at timestamptz;
