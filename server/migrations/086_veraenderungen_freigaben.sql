-- Externer Freigabelink fuer die Aenderungsauswertung (Max 2026-09-21).
--
-- Ein Link, kein Login, jederzeit widerrufbar. Der Token IST das Geheimnis: 32 Byte aus
-- crypto.randomBytes, base64url. Deshalb nur der SHA-256 in der Datenbank -- wer die Tabelle
-- liest, kann daraus keinen gueltigen Link bauen. Dieselbe Ueberlegung wie bei Passwoertern,
-- nur ohne Passwort.
--
-- Bewusst NICHT an `shares` angehaengt: die Tabelle haengt ueber project_id/tenant_id an einem
-- Projekt eines Mandanten. Die Aenderungsauswertung ist mandantenuebergreifend und projektlos,
-- ein NULLable-Fremdschluessel dort waere eine Luege ueber das Datenmodell.
CREATE TABLE IF NOT EXISTS veraenderungen_freigaben (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash      text NOT NULL UNIQUE,   -- sha256(token), hex. Der Token selbst steht nirgends.
  name            text,                   -- wofuer der Link gedacht ist, rein zur Wiedererkennung
  tage            int  NOT NULL DEFAULT 30 CHECK (tage BETWEEN 1 AND 365),
  erstellt_von    text,
  erstellt_am     timestamptz NOT NULL DEFAULT now(),
  widerrufen_am   timestamptz,
  letzter_zugriff timestamptz,
  zugriffe        bigint NOT NULL DEFAULT 0
);

-- Der Lesepfad sucht ausschliesslich ueber den Hash und nur nach aktiven Freigaben.
CREATE INDEX IF NOT EXISTS veraenderungen_freigaben_aktiv_idx
  ON veraenderungen_freigaben (token_hash) WHERE widerrufen_am IS NULL;
