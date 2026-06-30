-- 065 — T-622: Pro-Account-Strecken-Sichtbarkeit im Viewer.
--
-- Im Karten-Viewer (Ebenen-Panel) kann ein Nutzer einzelne Projekt-Strecken ein-/ausblenden. Bisher war
-- das ephemerer React-State (bei jedem Reload zurückgesetzt). Diese Einstellung gehört PRO ACCOUNT (E-Mail)
-- und PRO PROJEKT gespeichert, damit sie session- und geräteübergreifend konstant bleibt — der Nutzer muss
-- nicht jedes Mal dieselben Strecken neu ausschalten.
--
-- Pro (project_id, email) EINE Zeile mit der Menge der AUSGEBLENDETEN route-ids (jsonb-Array). Default '[]'
-- = alles sichtbar → ein neues (Projekt, Nutzer)-Paar braucht keine Zeile. project-scoped + ON DELETE
-- CASCADE (wie hidden_findings); Mandanten-Isolation kommt über loadProjectRow (project_id global eindeutig
-- je Mandant). Pro Nutzer (email aus req.ctx, nie aus dem Body) — analog mail_prefs.
CREATE TABLE IF NOT EXISTS viewer_route_prefs (
  project_id       uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  email            text NOT NULL,
  hidden_route_ids jsonb NOT NULL DEFAULT '[]',  -- ausgeblendete ProjectRoute.id (Strings)
  updated_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, email)
);
