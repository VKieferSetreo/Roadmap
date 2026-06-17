-- 022 — Ausgeblendete Funde: pro Projekt manuell ausgeblendete Auswertungs-Funde.
--
-- Der Nutzer kann in der Auswertung einen Fund über "X" ausblenden (mit Grund). Ausgeblendete
-- Funde zählen NICHT mehr in die Aggregate (Severity-Zähler/Donut/Karte) und erscheinen NICHT
-- im öffentlichen Share. Persistiert pro Projekt an einer STABILEN Fund-Identität (finding_key),
-- weil findings.id bei jeder Re-Analyse neu vergeben wird — der finding_key (obstacle_id|route_id
-- bzw. Content-Hash) überlebt Reload + Re-Analyse.
--
-- kontext = Snapshot des Funds zum Ausblend-Zeitpunkt (kategorie/titel/quelleName/strassenRef) für
-- die /debug-Triage ("welche Quelle produziert die meisten Falsch-Funde") — überlebt obstacle-Löschung.
-- grund: falsche_fahrbahn | falsche_daten | nicht_relevant | dublette | bereits_erledigt | sonstiges.

CREATE TABLE hidden_findings (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  finding_key text NOT NULL,                 -- stabile Fund-Identität (obstacle_id|route_id oder Content-Hash)
  obstacle_id uuid,                          -- Komfort/Join (kann NULL sein)
  grund       text NOT NULL,                 -- Ausblend-Grund (Enum, app-seitig validiert)
  grund_text  text,                          -- Freitext (Pflicht bei grund='sonstiges')
  kontext     jsonb NOT NULL DEFAULT '{}',   -- Fund-Snapshot (kategorie/titel/quelleName/strassenRef)
  hidden_by   text,                          -- E-Mail (aus req.ctx)
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX hidden_findings_proj_key_ux ON hidden_findings (project_id, finding_key);
CREATE INDEX hidden_findings_grund_idx ON hidden_findings (grund);
