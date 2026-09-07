-- 078 — Transportzeitraum: eine Schlüsselform statt zweier (T-705).
--
-- BEFUND: Von 82 Projekten tragen 20 {von,bis}, 8 {von,bis,ganztaegig}, 52 ein leeres Objekt —
-- und 2 tragen {gueltigVon, gueltigBis}. Die Engine las ausschließlich von/bis, sah dort
-- undefined und fiel auf den Heute-Anker zurück: 103 Funde, davon 10 kritisch, wurden gegen
-- HEUTE statt gegen den Transporttermin geprüft, und im Detail stand „Kein Transportzeitraum
-- gesetzt", obwohl der Nutzer einen gesetzt hatte.
--
-- Die Engine liest jetzt beide Formen. Das allein reicht aber nicht, und der Grund ist erst beim
-- Nachmessen aufgefallen: die Engine rechnete danach richtig, die OBERFLÄCHE zeigte den Zeitraum
-- weiterhin nicht an, weil die Anlage nur von/bis liest. Für die beiden Projekte hieße das:
-- die Funde verschwinden (der Termin liegt im Juli 2026, also in der Vergangenheit), und daneben
-- steht kein Zeitraum, der das erklärt. Eines der beiden verlor dabei alle 11 kritischen Funde.
--
-- Deshalb hier die Daten geradeziehen statt jeden Leser einzeln zu belehren. `gueltigVon`/
-- `gueltigBis` sind die Feldnamen von FUNDEN und HINDERNISSEN und dort völlig richtig; beim
-- Transportzeitraum eines Projekts heißen sie von/bis. Keine aktive Schreibseite erzeugt die
-- alte Form (geprüft über src/ und server/src/), es sind Altlasten.
--
-- Die Engine-Sonderbehandlung bleibt trotzdem stehen: sie kostet nichts und fängt einen
-- Altbestand, der hier nicht erfasst ist — etwa aus einem Backup-Einspielen.
UPDATE projects
SET zeitraum = (zeitraum - 'gueltigVon' - 'gueltigBis')
             || jsonb_build_object('von', zeitraum ->> 'gueltigVon', 'bis', zeitraum ->> 'gueltigBis')
WHERE zeitraum ? 'gueltigVon' OR zeitraum ? 'gueltigBis';
