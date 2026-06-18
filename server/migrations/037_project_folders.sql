-- 037 — Projekt-Ordner (T-177): tenant-geteilte Ordnerstruktur für die Projektansicht.
-- Über-/Unterordner (self-ref parent_id), Projekte per folder_id zugeordnet.
-- Ordner löschen → Projekte bleiben (folder_id SET NULL), Unterordner kaskadieren.

CREATE TABLE IF NOT EXISTS folders (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  parent_id  uuid REFERENCES folders(id) ON DELETE CASCADE,
  name       text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS folders_tenant_idx ON folders (tenant_id);

ALTER TABLE projects ADD COLUMN IF NOT EXISTS folder_id uuid REFERENCES folders(id) ON DELETE SET NULL;
