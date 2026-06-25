-- 061 — Lizenz-Audit (T-589): Quellen mit EXPLIZIT kommerziell-verbotener Lizenz als nur_intern
-- markieren (rotes "Intern"-Badge). Max-Regel 2026-06-25: nur die explizit verbotenen, nicht die
-- unklaren.
--   0120 LSBB Sperrinfo Sachsen-Anhalt: WFS-AccessConstraints "This service is for non-commercial
--        use only." (service.ifak.eu/sperrinfo/wfs).
--   0142 VMZ Bremen (Mobilithek-Baustellen/Sperrungen): CC BY-NC-ND (Nicht-Kommerziell, Keine
--        Bearbeitung) — quellen-laender-nord.md.
-- (0158 VMZ Niedersachsen ist bereits nur_intern, Migration 059.)
UPDATE quellen SET nur_intern = true WHERE id IN ('0120', '0142');
