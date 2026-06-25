-- 059 — Quelle 0158: VMZ Niedersachsen Baustellen innerorts/kommunal (T-566).
-- Offenes GeoJSON-Backend (vmz-niedersachsen.de), Nutzung NUR INTERN freigegeben (Max 2026-06-25,
-- "© VMZ Niedersachsen", keine kommerzielle Weitergabe). A/B/L-Anteil = Dublette zu 0140 → der
-- Connector emittiert nur die innerörtliche/kommunale Schicht (K + Stadtstraßen). FK-Anker für
-- 0158_vmz_ni_baustellen.js.

-- nur_intern: Quelle hat nur eine Freigabe für INTERNE Nutzung (keine kommerzielle Lizenz) → das
-- Quellenregister zeigt dafür ein rotes "Intern"-Badge (Max 2026-06-25, gilt für alle solchen Quellen).
ALTER TABLE quellen ADD COLUMN IF NOT EXISTS nur_intern boolean NOT NULL DEFAULT false;

INSERT INTO quellen (id, name, typ, tier, provenienz, abruf_intervall, nur_intern) VALUES
  ('0158', 'VMZ Niedersachsen — Baustellen innerorts/kommunal', 'api', 'T2', 'amtlich', '0 7,13 * * *', true)
ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, nur_intern=EXCLUDED.nur_intern;
