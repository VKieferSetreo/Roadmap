-- 074 — Saarbrücken und Bremer Durchfahrtshöhen aufnehmen (T-696).
--
-- Max, 06.09.2026: "lizenz egal hauptsache daten erstmal". Beide Quellen waren in Migration 073
-- ausdrücklich NICHT aufgenommen worden, weil ihre Lizenz kommerzielle Nutzung nicht deckt. Diese
-- Migration nimmt sie auf seine Entscheidung hin auf — und schreibt die Lage in `lizenz_status`,
-- damit sie nachvollziehbar bleibt und filterbar ist, statt in einer Zusage zu verschwinden.

-- 0231 Saarbrücken: die Stadt weist überhaupt keine Lizenz aus. Kein Verbot, aber auch keine
-- Erlaubnis → 'open', genau die Bedeutung, die Migration 062 dafür vergeben hat.
-- Das Saarland hatte bis heute 211 Einträge, die dünnste Abdeckung aller Flächenländer.
INSERT INTO quellen (id, name, typ, endpoint_url, aktiv, lizenz, lizenz_status)
VALUES ('0231', 'Saarbrücken — Baustellen (Landeshauptstadt Saarbrücken)', 'html',
        'https://www.saarbruecken.de/leben_in_saarbruecken/planen_bauen_wohnen/baustellen_bauprojekte_und_verkehr',
        true, 'keine Lizenzangabe der Stadt (Stand 06.09.2026)', 'open')
ON CONFLICT (id) DO NOTHING;

-- 0232 VMZ Bremen: CC BY-NC-ND, kommerzielle Nutzung ausdrücklich untersagt → 'intern', dieselbe
-- Einstufung, die 0142 (dieselbe Stelle, Mobilithek-Weg) seit Migration 062 trägt.
--
-- NUR DIE DURCHFAHRTSHÖHEN. Der Baustellen-Feed derselben Quelle ist bewusst abgeschaltet: die
-- Bremer Baustellen kommen bereits über 0142 (448 Einträge, täglicher Lauf), zwei Quellen für
-- dieselbe Meldung erzeugen zwei Funde an derselben Stelle. Der Gewinn liegt woanders: Bremen
-- hatte 567 Einträge und davon 22 mit einer Massangabe. 31 Durchfahrtshöhen zwischen 3,0 und
-- 4,0 m sind für einen Schwertransport genau die Zahl, auf die es ankommt.
INSERT INTO quellen (id, name, typ, endpoint_url, aktiv, lizenz, lizenz_status)
VALUES ('0232', 'VMZ Bremen — Durchfahrtshöhen (ASV Bremen)', 'geojson',
        'https://vmz.bremen.de/geojson/pois-vertical-clearance.geojson',
        true, 'CC BY-NC-ND (kommerzielle Nutzung laut Anbieter untersagt)', 'intern')
ON CONFLICT (id) DO NOTHING;
