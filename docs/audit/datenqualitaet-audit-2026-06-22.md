# Daten-Qualitäts-Audit (adversarial) — Hypothesen A–D

**Stand:** 2026-06-22 · **Methodik:** 9-Agent-Workflow (4 Angreifer je Hypothese → 4 unabhängige Verteidiger/Adjudikatoren → Synthese), geerdet auf Prod-Snapshot (`/tmp/audit_baseline.txt`) + Code (`server/src/`) + READ-ONLY Live-Reads. **Es wurde nichts geändert — reine Dokumentation.**

## Verdikt-Bilanz: 16 widerlegt · 1 in Arbeit · 4 bestätigte Fehler

| Hypothese | Gesamtaussage | Widerlegt | In Arbeit | Bestätigt |
|---|---|---|---|---|
| **A — fehlende Quellen** | Pauschal **nicht haltbar**. Leer-Quellen = bewusstes Design / Open-Data-Realität; Bayern/NRW landesweit = transparent dokumentierter Backlog. | 3 | 1 | 1 |
| **B — fehlende Einträge** | **Nicht haltbar**. Alle großen Drops by-design (Infra-Filter / Live-Filter / TMC-koordinatenlos), kein verdeckter Verlust. | 4 | 0 | 1 |
| **C — fehlende Attribute** | **Nicht haltbar**. Connectoren lesen korrekt was die Quellen hergeben; fehlende Zahl = Quelle führt keine ODER Block-Flag statt Zahl. | 5 | 0 | 1 |
| **D — falsche Attribute** | **Nur im Sonderfall haltbar** (0133-Höhen). D-2…D-5 widerlegt. | 4 | 0 | 1 |

**Kernaussage:** Kein systemischer Defekt in Ingest oder Engine. Die 4 bestätigten Fehler sind eng umgrenzt; nur **einer** (0133) erzeugt aktiv falsche Engine-Verdikte.

## Bestätigte Fehler — Fix-Plan (alle Aufwand S)

### FIX-1 [HOCH] 0133 Berlin: physikalisch unmögliche Durchfahrtshöhen → harter Fehlalarm
- `0133_berlin_durchfahrtshoehe.js:50` filtert nur `hoehe > 0` → 0,10 m passiert als `maxHoeheM` (kategorie `bruecke`, aktiv). Prod: 8 Punkte <1 m, 13 <2 m (n=9624), min 0,10 m.
- Engine (`rules.js` ruleBauwerk): `evaluate(0.1, transport 4.0)` → spielraum −3,9 → **sev3 = kritisch**. Schon bei Transporthöhe 2,5 m. **Jeder reale Transport** kollidiert an diesen ~8–13 Punkten. Ursache: Straßenbefahrungs-Messartefakt (Bordstein-/Bodenpunkt).
- **Fix:** Höhenfilter Z.50 auf fachliche Untergrenze `hoehe >= 2.0`; optional zentraler Sanity-Guard (`maxHoeheM < 1.5` oder `> 25` verwerfen) in `obstaclesRepo`/`importer` (deckt 0134/0123 mit ab). Re-Import 0133 → Punkte fallen beim Reconcile raus.

### FIX-2 [MITTEL] Abdeckungs-Matrix: WSV 0303 als 25–35%-Brückenquelle in 10 Ländern, liefert 0 evaluierbare Funde
- `0303` zieht 1007 Features, alle landen im Infra-Filter (location-only, keine Maße) → 0 aktiv. Korrekt by-design. **Aber** `abdeckung.js` führt 0303 in 10 Ländern (BW,BB,HB,MV,NI,RP,SL,ST,SH,TH) als Brücken-/Tunnel-/Gewicht-Quelle mit ist 25–35 % → irreführende redaktionelle Aussage (Trust-Risiko).
- **Fix:** In den 10 Zellen Begründung präzisieren („Standortinventar, location-only, 0 evaluierbare Funde") + ist-Werte auf ehrlichen Stand absenken; `ABDECKUNG_STAND` hoch. Rein redaktionell, eine Datei. *(Kein Engine-/Connector-Eingriff.)*

### FIX-3 [MITTEL] False-Positive `halbseitig` aus „einseitiger Kragträger"
- `_helpers.js extractStammdaten:191` matcht `einseitig` bloß-anwesend → „Verkehrszeichenbrücke, einseitiger Kragträger" wird als halbseitige Sperrung gedeutet. Folge: 215 (0125 NRW) + 17 (0111 HH) restriktionslose Bauwerke werden (a) fälschlich als Hindernis gespeichert und (b) in der Engine als Halbsperrung gewertet.
- **Fix:** `einseitig` nur bei Sperr-/Fahrbahn-Kontext werten (`/einseitig\w*\s+(?:gesperrt|sperrung|…fahrbahn|fahrstreifen)/i`), Bauteil-Komposita („Kragträger") per Negativ-Lookahead aus. Re-Import 0125+0111.

### FIX-4 [NIEDRIG] 0123 BAYSIS: 9.606 tote inaktive Zeilen (DB-Hygiene, kein Serving-Impact)
- Aus revertierter BK-Proxy-Connector-Version (Commit efcd717), alle am 2026-06-17 in einem Reconcile deaktiviert. Erreichen die Engine nie (`WHERE aktiv=true`), aber toter Ballast (bläht 0123 auf 9.789 physische Zeilen, Last bei Vollbestand-Loads).
- **Fix:** `DELETE FROM obstacles WHERE quellen_id='0123' AND aktiv=false AND updated_at < now()-interval '14 days'`; generalisierbar als `purgeStaleInactive(quelle, days)`-Hygiene-Job. 14-Tage-Fenster wahrt den Reaktivierungs-Pfad.

### Optionales Folge-Ticket (kein Fehler)
- **0140 NI TMC-Resolver:** 140 NI-Records koordinatenlos verworfen (BASt-LCL deckt ~78 % ab). Kein DB-Defekt, externe Resolver-Grenze. LCL-Version heben → Aufwand M.

## Auditgerechte Verteidigungslinie
1. **Kein verdeckter Datenverlust** — jeder große Drop ist bewusst & gezählt (BAYSIS 12.288 → 183 echte Restriktionen, 12.105 als `stats.infrastruktur` übersprungen).
2. **Connectoren lesen korrekt** — über 5 geprüfte Brückenquellen kein Lesefehler; attributarme WFS-Feeds führen objektiv keine Maße.
3. **Block-Flag statt Zahl ist kein fehlendes Attribut** — GST-Sperre (0124 156/156, 0126 133/133) ist der schärfste Engine-Block.
4. **„Tote" BAYSIS-Zeilen erreichen die Engine nie** — Hygiene, kein Serving-Defekt.
5. **Bayern/NRW landesweit sind dokumentierter Backlog** (`abdeckung.js` ist/max), keine verschwiegene Lücke.

**Einzige echte Konzession:** FIX-1 (0133) — echter, engine-wirksamer Fehlalarm. FIX-2 (0303-Matrix) — berechtigte Trust-Kritik an der Darstellung, nicht an der Datenlage.
