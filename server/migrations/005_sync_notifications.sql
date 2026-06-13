-- 005 — Nachrichtenzentrum/Glocke: Benachrichtigungen aus dem automatischen
-- Re-Auswerten nach DB-Aktualisierung (neue/weggefallene/geänderte Funde je Projekt).
-- Läuft transaktional über scripts/migrate.js (_migrations-Tabelle = Idempotenz).
--
-- Lifecycle (manuelle + importierte Hindernisse) braucht KEIN neues Feld:
-- aktiv=false (Soft-Delete) + bestehendes gueltig_bis reichen. Die Hygiene-Jobs
-- (server/src/worker/hygiene.js) und der Reconcile im Importer arbeiten darüber.

-- ── Benachrichtigungen (pro Mandant, optional projektbezogen) ──────────────────
-- obstacle_id bewusst OHNE FK: das Hindernis kann später wegfallen, die Nachricht
-- (Snapshot der relevanten Felder) bleibt als Historie bestehen.

CREATE TABLE notifications (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenants ON DELETE CASCADE,
  project_id   uuid REFERENCES projects ON DELETE CASCADE,
  projekt_name text,
  typ          text NOT NULL,            -- 'neu' | 'weggefallen' | 'geaendert'
  severity     text,                     -- kritisch | warnung | hinweis | info
  obstacle_id  uuid,                     -- Referenz (kein FK — Snapshot überlebt Löschung)
  kategorie    text,
  titel        text NOT NULL,
  beschreibung text,                     -- was sich geändert hat (Mensch-lesbar)
  km           numeric(7,1),
  route_name   text,
  strassen_ref text,
  gueltig_von  date,
  gueltig_bis  date,
  created_at   timestamptz NOT NULL DEFAULT now(),
  read_at      timestamptz,
  emailed_at   timestamptz              -- für späteren Mail-Versand (vorerst NULL)
);

CREATE INDEX notifications_tenant_idx ON notifications (tenant_id, created_at DESC);
CREATE INDEX notifications_unread_idx ON notifications (tenant_id) WHERE read_at IS NULL;
