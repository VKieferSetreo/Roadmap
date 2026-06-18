-- 031 — Lizenzmodell: Seats pro Mandant via Seat-Codes, Laufzeit, Disclaimer-Akzeptanz.
--
-- Verkaufsmodell (Vorgabe Max 2026-06-18): kein Billing in der App, die Buchhaltung
-- rechnet extern. Eine Lizenz = Plan + max_seats + Laufzeit (valid_until). Pro Seat ein
-- Seat-Code. Der Nutzer registriert sich selbst (setreo-auth-extern: Konto + Mail-
-- Verification), loest dann seinen Seat-Code ein. Das belegt einen Seat, legt die
-- tenant_members-Zuordnung an und gibt den Zugriff frei.
-- Eine E-Mail gehoert weiterhin genau EINEM Mandanten (tenant_members.email UNIQUE).

-- ── Lizenz-Felder am Mandanten ────────────────────────────────────────────────
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS plan        text NOT NULL DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS max_seats   int  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valid_until date;

-- ── Seat-Codes (ein Key pro Seat) ─────────────────────────────────────────────
-- frei = used_by_email IS NULL. Die Einloesung setzt used_by_email + used_at und legt
-- in derselben Transaktion den tenant_members-Eintrag an.
CREATE TABLE IF NOT EXISTS seat_codes (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code           text NOT NULL UNIQUE,
  used_by_email  text,
  used_at        timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS seat_codes_tenant_id_idx ON seat_codes (tenant_id);

-- ── Disclaimer-Akzeptanz (pro Person, versioniert) ────────────────────────────
-- Neue Disclaimer-Version erfordert eine erneute Bestaetigung (PK email + version).
CREATE TABLE IF NOT EXISTS disclaimer_acceptances (
  email        text NOT NULL,
  version      text NOT NULL,
  accepted_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (email, version)
);
