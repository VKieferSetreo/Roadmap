-- 073 — Zwei neue Quellen, zwei Stilllegungen (T-695).
--
-- Anlass war Max' Beobachtung "7 Quellen mit Fehler". Die Untersuchung hat mehr gefunden als die
-- sieben: zwei Quellen liefern seit Monaten still nichts, ohne je aufzufallen.

-- ── NEU ─────────────────────────────────────────────────────────────────────────────────────
-- 0135 Berlin Verkehrszeichen-Verbote. Gemessen am 06.09.2026: 1.454 Schilder, davon 966 Zeichen
-- 250 (Verbot für Fahrzeuge aller Art), 1 Zeichen 251, 487 Zeichen 253 (Lkw-Verbot über 3,5 t).
-- Berlin hat 10.591 Einträge im Bestand, aber die stammen fast alle aus Durchfahrtshöhen (0133);
-- rechtliche Durchfahrtsverbote fehlten. Lizenz dl-de/zero-2.0, aus dem Fees-Feld des Dienstes
-- selbst gelesen, nicht von einer Portalseite abgeleitet.
INSERT INTO quellen (id, name, typ, endpoint_url, aktiv, lizenz, lizenz_status)
VALUES ('0135', 'Berlin — Verkehrszeichen-Verbote (Straßenbefahrung, GDI-BE)', 'wfs',
        'https://gdi.berlin.de/services/wfs/strassenbefahrung', true, 'dl-de/zero-2.0', 'ready')
ON CONFLICT (id) DO NOTHING;

-- 0233 Freiburg Verkehrszeichenkataster. Gemessen: 371 Beschränkungen. Der Grund für diese Quelle
-- steht in der Abdeckungsmessung: Baden-Württemberg hat 2.344 Einträge, davon 205 mit einer
-- Maßangabe (9 Prozent). Wo ein Verkehrszeichenkataster angebunden ist (NRW, Berlin, Hamburg),
-- liegt der Anteil bei 76 bis 91 Prozent. Lizenz dl-de/by-2.0, Namensnennung ist Pflicht und
-- steht im Quellennamen.
INSERT INTO quellen (id, name, typ, endpoint_url, aktiv, lizenz, lizenz_status)
VALUES ('0233', 'Freiburg i. Br. — Verkehrszeichenkataster (Stadt Freiburg)', 'wfs',
        'https://geoportal.freiburg.de/wfs/digit_verkehrszeichen/digit_verkehrszeichen', true,
        'dl-de/by-2.0', 'ready')
ON CONFLICT (id) DO NOTHING;

-- ── STILLGELEGT ─────────────────────────────────────────────────────────────────────────────
-- Beide liefern nachweislich dauerhaft nichts. Seit T-694 respektiert das Scheduling aktiv=false,
-- eine Stilllegung legt also wirklich still — vorher lief 0151 trotz Migration 066 weiter.
--
-- 0121 GST-Negativkarten Sachsen: 187 Läufe, kein einziger Eintrag, Status durchgehend "ok".
-- Die Quelle hat vollbestand=false und umging deshalb jede Leer-Warnung. Die LASuV-Seite
-- antwortet mit HTTP 200 und trägt keinen einzigen PDF-Link mehr — der Betreiber hat sie
-- umgebaut. Reaktivieren, sobald jemand gefunden hat, wo die Negativkarten heute liegen.
UPDATE quellen SET aktiv = false WHERE id = '0121';

-- 0159 Hannover: 55 Läufe, kein einziger Eintrag. Anders als bei 0121 ist unsere Kette gesund —
-- der Abruf liefert HTTP 200, gültiges DATEX II und einen aktuellen publicationTime, der
-- Container ist aber leer. Zur Kontrolle über dieselbe Kette: 0141 Hessen liefert 21,9 MB.
-- Der Datengeber publiziert schlicht nichts. Reaktivieren, wenn er wieder meldet.
UPDATE quellen SET aktiv = false WHERE id = '0159';

-- ── NICHT AUFGENOMMEN, mit Absicht ──────────────────────────────────────────────────────────
-- Zwei weitere Connectoren wurden gebaut und liegen einsatzbereit im Repo, sind aber NICHT
-- registriert und NICHT in CONNECTORS eingetragen:
--
--   0232 VMZ Bremen (Durchfahrtshöhen, Baustellen): CC BY-NC-ND, kommerzielle Nutzung ausdrücklich
--   untersagt. Dieselbe Quelle steht bereits als 0142 im Register und ist dort seit Migration 062
--   als lizenz_status='intern' geführt. Ein zweiter Anlauf ändert die Lizenz nicht.
--
--   0231 Saarbrücken (Baustellen): die Stadt weist überhaupt keine Lizenz aus. Kein Verbot, aber
--   auch keine Erlaubnis. Für ein Produkt, das verkauft wird, ist das zu wenig.
--
-- Beide brauchen eine Freigabe durch den Datengeber, bevor sie laufen dürfen.
