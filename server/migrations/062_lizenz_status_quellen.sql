-- 062 — Lizenz-Status je Quelle für das Quellenregister-Badge (T-589, Max-Regel 2026-06-25):
--   'ready'  (grün)  = Lizenz erlaubt kommerzielle Nutzung (dl-de/by, dl-de/zero, CC0, CC-BY, amtlich-frei)
--   'open'   (grau)  = Lizenz unklar / nicht ausgewiesen, kein explizites Verbot (Default für Unauditierte)
--   'intern' (rot)   = kommerzielle Nutzung EXPLIZIT verboten (NC / nur-intern)
-- Default 'open' = sicher (keine falsche "Ready"-Behauptung für unauditierte/neue Quellen).
ALTER TABLE quellen ADD COLUMN IF NOT EXISTS lizenz_status text NOT NULL DEFAULT 'open';

-- READY (55) — kommerziell nutzbar (dl-de/CC-BY/CC0/amtlich-frei), aus Audit T-589.
UPDATE quellen SET lizenz_status = 'ready' WHERE id IN (
  '0001','0110','0111','0112','0113','0114','0115','0116','0117','0118','0122','0123','0125','0128',
  '0129','0130','0131','0132','0133','0134','0143','0146','0147','0149','0150','0151','0152','0153',
  '0154','0155','0156','0157','0210','0211','0212','0213','0214','0215','0216','0217','0218','0219',
  '0220','0221','0222','0223','0224','0225','0226','0227','0228','0229','0230','0302','0303'
);

-- INTERN (3) — kommerziell explizit verboten (NC): 0120 LSBB ST "non-commercial only", 0142 VMZ
-- Bremen CC BY-NC-ND, 0158 VMZ Niedersachsen "© nur intern".
UPDATE quellen SET lizenz_status = 'intern' WHERE id IN ('0120','0142','0158');

-- OPEN (10, bleiben Default): 0119,0121,0124,0126,0127,0140,0141,0144,0145,0148 — Lizenz unklar,
-- kein explizites Verbot (Max-Klärung offen).
