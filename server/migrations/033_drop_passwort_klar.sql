-- 033 — Klartext-Passwort entfernen (DSGVO, T-151).
-- Seit der Self-Service-Auth (Registrierung + E-Mail-Verification + Passwort-Reset in
-- setreo-auth-extern) ist die Admin-Klartext-Ansicht obsolet. Passwoerter liegen
-- ausschliesslich als argon2-Hash in setreo-auth-extern, nie im Klartext in dieser DB.
ALTER TABLE tenant_members DROP COLUMN IF EXISTS passwort_klar;
