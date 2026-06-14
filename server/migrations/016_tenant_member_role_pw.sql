-- 016 — Mandanten-Nutzerverwaltung v2: Rolle (admin|user) + Klartext-Passwort je Mitglied.
--
-- role: pro Mandant kennzeichnen, wer Mandanten-Admin ist und wer normaler Nutzer
--   (Metadaten/Anzeige; Login-Rechte steuert weiterhin das Auth-Gateway).
-- passwort_klar: für die Admin-„Klar-Ansicht" der Kunden-Zugänge (app.setreo-cloud.com),
--   damit Setreo den vergebenen Zugang einsehen/ändern kann. Nur für hier provisionierte
--   externe Konten gesetzt; interne Hub-Mitglieder bleiben NULL.
--   ⚠ Klartext bewusst (Vorgabe Max) — Zugriff nur Setreo-Admin über die Mandanten-Seite.

ALTER TABLE tenant_members
  ADD COLUMN IF NOT EXISTS role         text NOT NULL DEFAULT 'user',
  ADD COLUMN IF NOT EXISTS passwort_klar text;
