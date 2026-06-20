# Roadmap-Audit: Datenqualität · OPEX · Datensicherung · Gesamtarchitektur

**Datum:** 2026-06-19 · **Auditor:** Hauptauditor (Data/OPEX-Track), parallel zu UI/UX-, Compliance-, Scalability-Audits · **Ticket:** T-217
**Scope:** Ingest-Vollständigkeit pro Schnittstelle, Verarbeitung/Retention, Storage-Qualität, Kalkulationslogik, Darstellung, operative Effizienz, Datensicherung/Durability, Gesamtarchitektur-Flaws (intern + extern).
**Auftrag:** Nur Findings sammeln, keine Umsetzung. Tickets werden aus diesem Dokument abgeleitet (Sprints).

## Methode & Verifikationsstatus

Multi-Agent-Workflow (16 Befund-Dimensionen → adversariale Verify → Vollständigkeits-Kritiker). Welle 1 (Normalisierung, Storage/Schema, Kalkulation-Regeln, Kalkulation-Geometrie) lieferte **27 code-belegte Findings**, dann griff das **Session-Limit** (resettet 23:10). Verify-Runde + Wellen 2–4 (OPEX, Datensicherung, Architektur, Extern, Display, Daten-Inhalt, 6 Connector-Batches) liefen nicht mehr durch.

Konsequenz für die Belastbarkeit:
- **[A]** = Finder-Befund aus Welle 1, von mir (Hauptauditor) anhand der zitierten Datei **erstgelesen und gegengezeichnet**.
- **[H]** = **Eigen-Befund** des Hauptauditors aus der Erstlektüre des Kern-Codes (Normalisierung, Regelwerk, Engine, Geometrie, Repo, Importer, Schema, Worker, Auth) — die Dimensionen, die der Agent-Sweep nicht mehr erreichte.
- **[V]** = zusätzlich durch einen gezielten Shell-Check belegt.

**Severity:** kritisch = falsche kundenseitige Auswertung / Datenverlust / Leck · hoch = systematischer Qualitäts-/Effizienzverlust · mittel = lokaler Verlust/Ungenauigkeit · niedrig = Schliff · info = geprüft, kein Handlungsbedarf.

**Geprüft & entkräftet (kein Finding):** `certificate.p12` ist korrekt gitignored (`*.p12`, `mob_*.pem`) — kein Secret im Repo. UTM-Zone-33 wird von Connectoren explizit übergeben — kein Bug. `evaluate`-Zeit-Gating schließt am Rand korrekt ein (strikte `<`/`>`) — kein Rand-Verlust.

---

## 1 · Normalisierung & Freitext-Extraktion (`connectors/_helpers.js`)

### DA-01 · [kritisch] Tonnage ohne Kontext wird zum Fahrzeug-Gewichtslimit  `[A]`
`_helpers.js:13-17, 110-111` → `rules.js:166-188`. `tonnageAusText` greift **jede** „X t"-Zahl ohne Schlüsselwort; `extractStammdaten` übernimmt sie als `maxGewichtT`. „Einsatz eines 40 t Autokrans" → `maxGewichtT=40`. Fließt direkt in `ruleGewicht` (rot/gelb) und in `istReineInfrastruktur` (Behalten-Entscheidung).
**Impact:** Fabriziertes Streckenlimit → falsche Ampel/Reserve beim Disponenten, ggf. fälschlich „Last überschritten".
**Richtung:** An Kontext-Keyword binden (zul. Gesamtgewicht / Tragfähigkeit / Gewichtsbeschränkung / 7,5t-Schild-Vokabular), analog zur bereits keyword-gegateten Achslast/Höhe/Breite.

### DA-02 · [hoch] Bloßes „höhe" im Regex → Aufbau-/Gesamthöhe wird zur lichten Durchfahrtshöhe  `[A]`
`_helpers.js:108-109, 55-60`. Höhen-Keyword fällt auf generisches `h(?:ö|oe)he` zurück → „Gesamthöhe des Krans 60 m" → `maxHoeheM=60`, „Aufbauhöhe 2,0 m" → `maxHoeheM=2`. Steuert `ruleBauwerk`/`ruleAmpel`/`ruleBahnuebergang`.
**Impact:** Falsches Höhenlimit → falscher Alarm oder (bei großem Wert) Verdeckung einer echten Engstelle. Im höhensensiblen GST-Planer eine falsche Freigabe/Sperrung.
**Richtung:** Bloße `höhe`-Alternative entfernen oder auf Clearance-Begriffe (Durchfahrtshöhe, lichte Höhe, Höhenbeschränkung, max. Höhe) beschränken; Aufbau-/Bau-/Gesamthöhe per Negativ-Kontext ausschließen.

### DA-03 · [mittel] `richtung` wird extrahiert, aber nie persistiert  `[A]`
`_helpers.js:285, 325, 335-352` → `obstaclesRepo.js:145-197`. `EX_NICHT_ATTR` schließt `richtung` aus den attrs aus, das `makeNormalized`-Rückgabeobjekt hat aber kein `richtung`-Feld; INSERT/UPDATE schreiben die Spalte nicht. Bei jedem Import läuft `richtungAus`, setzt sogar `kiAufbereitet=true`, und das Ergebnis wird verworfen.
**Impact:** Verschwendete Arbeit + verfälschtes KI-Flag; Info über gerichtete Maßnahmen geht verloren.
**Richtung:** Entscheiden ob fachlich gebraucht (Engine nutzt rein geometrische Gegenfahrbahn-Erkennung). Falls ja: in Output + SQL aufnehmen (Freitext-Feld, **nicht** die CHECK-Spalte). Falls nein: `richtungAus` aus dem Live-Pfad entfernen.

### DA-04 · [mittel] String-attrs werden still verworfen (asymmetrisch zu Extraktions-Strings)  `[A]`
`_helpers.js:310-316, 323-327`. `cleanAttrs` filtert auf `number|boolean` → ein Connector, der `attrs={sperrart:"Vollsperrung", spurInfo:"2 von 3 frei"}` setzt, verliert beide lautlos. Asymmetrie: `extractStammdaten`-Strings (`zeitfenster`, `medium`) werden danach über einen ungetypten Merge-Loop wieder eingefügt und haben sogar FE-Labels (`findingMeta.ts`). Zwei Klassen von String-attrs.
**Impact:** Datenverlust ohne Spur; latente Falle für jeden neuen Connector; inkonsistentes Datenmodell. (Wiederkehrender Befund, vgl. Brain „makeNormalized droppt String-attrs".)
**Richtung:** Filter vereinheitlichen — Connector-String-attrs zulassen (mit Trim/Längen-Guard) **oder** beide Klassen droppen + Text in dedizierte Felder; mindestens `note()`-Log beim Verwerfen.

### DA-05 · [mittel] Datums-Heuristik fasst Plan-Stand-/Revisionsdatum als Gültigkeitsbeginn auf  `[A]`
`_helpers.js:156-164`. Bei ≥2 Daten gilt blind kleinstes=Start. Der „Stand:"-Schutz greift nur im Einzeldatum-Pfad. „gültig vom 01.03.2026, Plan-Stand 15.12.2025, Fertigstellung bis 30.09.2026" → `gueltigVon=2025-12-15`.
**Impact:** Falscher `gueltigVon` verschiebt Befristungs-/Aktualitäts- und Hygiene-Expire-Logik; FE-Zeitfenster/Export betroffen.
**Richtung:** `hatKontext`-Logik auf den Mehr-Datum-Pfad ausweiten (nur Daten mit vom/ab/bis/Baubeginn-Marker in der Nähe als Start/Ende; Stand-/Druckdatum per Negativ-Kontext raus).

### DA-06 · [niedrig] Dedup-Gruppierung über `toFixed(3)`-Grid statt Distanz → positionsabhängig  `[A]`
`_helpers.js:196-202`. Hartes 0.001°-Bucket statt Radius: drei „Baustelle B252" bei 51.0000/.0007/.0020 → 3 Outputs; zwei 40 m entfernte über einer Zellgrenze mergen nicht.
**Impact:** Gestapelte Pins / Doppel-Findings am Zellrand. Lokalisierungs-Artefakt, kein falscher Stammdatenwert (Drift-Fuzzy-Match ~300 m fängt einen Teil nach).
**Richtung:** Distanzbasiertes Greedy-Clustering (~100–150 m Haversine) statt fixem Bucket.

### DA-07 · [niedrig] `quelle.aktualisiertAm` = immer Fetch-Zeit → echte Quell-Aktualität verloren  `[A]`
`_helpers.js:351`, `datex2.js:189,234`, `autobahn.js:127`. Immer Laufzeit-Zeitstempel; DATEX `publicationTime`/`versionTime` und Autobahn-Änderungszeit ignoriert. Ungenutzte Spalte `abgerufen_am` (006) existiert sogar für den Fetch-Zeitpunkt.
**Impact:** „aktualisiert am" zeigt Abrufzeit, nicht Behörden-Änderung → Datenfrische als Vertrauenssignal entwertet; Staleness nicht erkennbar.
**Richtung:** Echte Quell-Zeitstempel in `aktualisiertAm` durchreichen, Fetch-Zeit getrennt in `abgerufen_am`.

---

## 2 · Storage & Schema-Integrität

### DA-08 · [hoch] Bbox-Vorfilter ohne zusammengesetzten/räumlichen Index (+ geom-jsonb-Last)  `[A][H]`
`engine/index.js:132-138`, `geometry.js:237`, `001_init.sql:64-66`, `obstaclesRepo.js:24-26`, `rerunAll.js:102`. Pro Route: `lat BETWEEN .. AND lng BETWEEN ..` über nur **getrennte** btree(lat)/btree(lng); kein Composite, kein GiST (Managed-PG ohne PostGIS). Lange Diagonalrouten ziehen ein DE-breites Rechteck; alle Treffer inkl. `geom`-jsonb landen im JS-Heap. Genau hier dokumentiert `rerunAll.js:102` das OOM-Risiko, weshalb der Rerun auf Concurrency 1 gezwungen wurde.
**Impact:** Latenz/Heap skaliert mit Bbox-**Fläche** statt Korridor-Länge → Timeout-Risiko, OOM, künstlich serialisierter Auto-Rerun.
**Richtung:** Partial-Composite `obstacles(lat,lng) WHERE aktiv`, ggf. `btree_gist`/`cube` 2D-Index; alternativ Vorfilter pro Route-Segment ODER-verknüpfen; `geom` erst nach dem Korridor-Match nachladen statt für alle Bbox-Treffer. Plan per EXPLAIN ANALYZE gegen Realbestand prüfen.

### DA-09 · [mittel] ~14 tote Spalten + 3 ungenutzte Indizes aus Migration 005/006  `[A]`
`006_obstacles_v1format.sql:6-31`, `obstaclesRepo.js:172-175`. Angelegt aber nie geschrieben/gelesen: `cluster_id, is_master, strassenklasse, baulasttraeger, vnk, nnk, station_von, station_bis, zeitfenster(jsonb-Spalte), roh, befristung, richtung, status, manuell_korrigiert, rangscore, confidence, abgerufen_am` + Indizes `obstacles_cluster_idx/master_aktiv_idx/strklasse_idx`. Jeder Insert defaultet sie stumm (`is_master=true`, `status='bestaetigt'`…).
**Impact:** Falsche Schema-Erwartung (laden zu Ad-hoc-Joins ein), Write-Amplification durch nie gelesene Indizes, Schema-Drift zum dokumentierten v1.0-Format.
**Richtung:** Tote Spalten + Indizes per Migration droppen (oder in `HINDERNIS-DATENFORMAT.md` als reserviert markieren); `idx_scan=0` aus `pg_stat_user_indexes` vorab belegen.

### DA-10 · [mittel] `fach_id` trägt fachliche Eindeutigkeit, ist aber durch kein DB-Constraint geschützt  `[A]`
`obstaclesRepo.js:50-51,199-212`, `importer.js:104-108,166-175`. Kein UNIQUE auf `fach_id`; Eindeutigkeit hängt allein am Advisory-Lock + `MAX(index)+1`. Jeder Bypass (manueller SQL-Fix, Demo-Seed mit hartem `fach_id`, künftiger Zweit-Writer) kann eine Dublette erzeugen, die die DB stumm akzeptiert.
**Impact:** `fach_id` ist die kunden-/PDF-sichtbare Referenz — Dubletten dort = Vertrauensschaden.
**Richtung:** `CREATE UNIQUE INDEX obstacles_fach_id_ux ON obstacles(fach_id) WHERE fach_id IS NOT NULL` (partial); vorher auf Bestands-Dubletten prüfen.

### DA-11 · [mittel] Importer nutzt `validateObstacle` lenient — keine lat/lng-Bounds, kein Name-Minimum  `[A]`
`obstaclesRepo.js:106-143`, `importer.js:113`, `routes/obstacles.js:111,153,195`. Strict-Pfad (Bounds, name≥3, ISO) nur beim Kunden-POST; Import/PATCH/Bulk lenient → nur `isFiniteNumber`. Einzige DE-Plausibilität ist `inDeBbox` in `makeNormalized` (grobe Box 47.2–55.1/5.8–15.1) — lat/lng-Swap, der noch in der Box landet, passiert ungeprüft; ein Connector, der `makeNormalized` umgeht, hätte gar keine Bounds.
**Impact:** Müll-Koords in der groben Box → falsche/fehlende Korridor-Treffer. Namenlose Items (name=null erlaubt) umgehen den Drift-Fuzzy-Match → churnen jeden Reconcile.
**Richtung:** Harte lat/lng-Bounds + Mindest-Plausibilität ins Repo ziehen (gilt dann für alle Pfade); namenlose Importe verwerfen/markieren.

### DA-12 · [niedrig] Migrations-Nummern-Kollision (doppeltes `008`) + interne/Datei-Nummer-Drift (005 vs 006)  `[A]`
`008_demo_projekt.sql` + `008_ki_aufbereitet.sql`; `migrate.js:19` sortiert rein lexikografisch und keyed auf Dateiname. `006_…sql:1` trägt intern „005". Solange additiv/idempotent bricht nichts, aber bei reihenfolgeabhängigen Migrationen ist die Ordnung bei Doppel-Präfix undeterministisch.
**Richtung:** Eindeutige monoton steigende Präfixe; interne Kommentar-Nummer angleichen (Umbenennen nur mit Bedacht — `_migrations` keyed auf Dateiname).

### DA-13 · [info] `obstacles.lat/lng` double vs. `km/distanz` numeric — Typ-Inkonsistenz  `[A]`
`001_init.sql:49-50,28-30,12`. double für Koords ist korrekt; numeric kommt aus node-postgres als String, daher das defensive `Number()` (map.js:45,68). Konsistent gehandhabt, nur konzeptionell uneinheitlich. **Kein Handlungsbedarf** außer Kommentar-Doku.

---

## 3 · Kalkulationslogik — Regelwerk (`engine/rules.js`)

### DA-14 · [kritisch] `ruleBaustelle` liest `attrs.vollsperrung` nicht — Vollsperrungen als Kategorie „baustelle" werden nie kritisch  `[A]`
`rules.js:231,244,256` vs. `rules.js:276` (nur `ruleSperrung` liest es). Connectoren setzen Kategorie hart auf „baustelle" + `vollsperrung=true`: `0112` Hamburg, `0210` München, `0211` Aachen, `0214` Stuttgart, `0216` Dortmund, `0302` RVR. Nur `autobahn.js`/`datex2.js` promoten echte Vollsperrungen in Kategorie „sperrung". Zusätzlich setzt `extractStammdaten` (`_helpers.js:132`) `vollsperrung=true` für jede Kategorie — bei „baustelle" wirkungslos.
**Impact:** Real voll gesperrte Straße aus kommunaler Quelle = bestenfalls gelbe Warnung, nie rotes K.o. → Disponent plant über dichte Strecke. >6 Großstadt-Connectoren betroffen.
**Richtung:** In `ruleBaustelle` die Vollsperr-Logik aus `ruleSperrung` ergänzen (`vollsperrung && overlap → kritisch`) **oder** vollsperrungs-getragene Baustellen im Importer in Kategorie „sperrung" umklassifizieren. Vorher SOLL/IST-0112-Überflaggen prüfen.

### DA-15 · [hoch] ~11 extrahierte attrs werden gespeichert + im Popup gezeigt, aber von keiner Regel bewertet  `[A]`
`_helpers.js:114,119,123,137,142,145-148,154` vs. `rules.js`. `maxAchslastT, sperrlaengeM, zeitfenster, halbseitig, fahrbahnVerengt, anzahlFahrstreifen, umleitung, einbahnstrasse, sackgasse, havarie, medium` werden nirgends in `rules.js` gelesen — nur als FE-Labels (`findingMeta.ts`). `fahrbahnVerengt`/`anzahlFahrstreifen` sind laut Kommentar „wichtigstes Restbreiten-Surrogat", fließen aber nicht in die Bewertung. `sackgasse`/`einbahnstrasse`/`havarie` sind GST-kritisch, ohne Severity-Wirkung.
**Impact:** Aufwendig gehobene Schwertransport-Blocker erhöhen die Bewertung nie; Fund bleibt „hinweis" und wird bei Infrastruktur sogar ausgeblendet (`evaluate:381`).
**Richtung:** Pro Signal entscheiden — `fahrbahnVerengt`/`anzahlFahrstreifen=1` als Restbreiten-Surrogat → mind. warnung; `sackgasse`/`einbahnstrasse`/`havarie` als eigener warnung-Trigger; rein-informative (`medium`, `zeitfenster`) als solche dokumentieren.

### DA-16 · [hoch] Ohne geplanten Transport-Zeitraum überlappt nichts → Baustelle/Sperrung fällt auf hinweis/warnung  `[A]`
`rules.js:61,64,276,279`, `map.js:29`. `overlapsZeitraum` gibt bei `!zVon && !zBis` → `false`. Transport-Zeitraum ist optional. Dann wird selbst `vollsperrung && overlap` nie kritisch, und `ruleBaustelle` fällt in den else-Zweig „außerhalb". Inkonsistent zum Hindernis-ohne-Datum (das via 0000..9999 **immer** überlappt) — der Default kippt je nachdem, welche Seite das Datum fehlt.
**Impact:** Projekt ohne gepflegten Zeitraum (zulässig) entwertet still die gesamte Baustellen-/Sperrungs-Bewertung → falsch-grünes Bild ohne Hinweis.
**Richtung:** Symmetrie — fehlender Transport-Zeitraum wie „gilt immer" (overlap=true / zeit-agnostisch) behandeln; mindestens harte Vollsperrung zeit-unabhängig kritisch.

### DA-17 · [mittel] Tunnel nutzt `ruleBauwerk` (nur Höhe/Gewicht/GST-Sperre) — keine Breiten-/Längen-/Gefahrgut-Bewertung  `[A]`
`rules.js:84,346-347`. `case "tunnel"` routet exakt wie Brücke; `transport.breite`/`transport.laenge` werden für Tunnel nie herangezogen; keine RID-Tunnelkategorie (A–E).
**Impact:** Überbreiter/Gefahrgut-Transport durch gesperrten Tunnel wird nur über Höhe bewertet → reale Sperrwirkung unbewertet.
**Richtung:** Eigene `ruleTunnel` mit Breiten-/Gefahrgut-Check wenn Quellen das liefern (Berlin/HH-Höhenkataster prüfen); sonst Lücke in `HINDERNIS-DATENFORMAT.md` dokumentieren.

### DA-18 · [mittel] Restbreiten-Bewertung ohne Puffer und inkonsistent zu `ruleEngstelle`  `[A]`
`rules.js:244,277` vs. `rules.js:154`. Baustelle/Sperrung: nur binär `rb < transport.breite` (Gleichstand = ok, bewusste Max-Vorgabe). Engstelle: gestufte Marge `sev3(marge<0.10, marge<0.50)` mit „knapp"-Warnung. Gleiche Physik, je Kategorie unterschiedlich bewertet; „exakt passt" (0 Spiegel-/Begleitspielraum) erzeugt bei Baustelle keinerlei Warnung.
**Richtung:** `ruleBaustelle`/`ruleSperrung` um dieselbe gestufte Marge ergänzen (Gleichstand/knapp → warnung); Schwellenwert mit Max abstimmen.

### DA-19 · [niedrig] Steigungs-/Kreisverkehr-Schwellen ohne dokumentierte fachliche Herleitung  `[A]`
`rules.js:201-202,220`. `pct≥8 → gewicht>60?kritisch:warnung; pct≥5 → gewicht>100?warnung:hinweis`; Kreisverkehr `laenge>2.2r/1.6r`. Keine Quelle/Faustregel kommentiert (anders als Breiten-Schwellen mit Max-Begründung). 7,9 % bei 55 t → „hinweis" → bei Infrastruktur ausgeblendet.
**Richtung:** Schwellen an Norm/Faustregel (RAS/Schleppkurve, Anfahrvermögen) binden oder als bewusste Heuristik kennzeichnen.

### DA-20 · [info] Zeit-Gating verwirft am Zeitraum-Rand nicht (geprüft, korrekt)  `[A]`
`rules.js:333,338` — strikte `<`/`>`, Gleichstand bleibt relevant. Der vermutete Rand-Verlust tritt nicht ein. **Kein Handlungsbedarf** (Hinweis: `dateOnly` = Tag-Granularität; nur relevant falls je stundengenaue Slots gefordert).

---

## 4 · Kalkulationslogik — Korridor-Matching & Geometrie (`engine/index.js`, `geometry.js`)

### DA-21 · [hoch] Grob geokodierte Punkt-Hindernisse (Landkreis-Zentroid) fallen strukturell aus dem 20-m-Korridor  `[A]`
`engine/index.js:148,154`, `0121_gst_negativkarte_sachsen.js:74,86`, `rules.js:25`. Connector 0121 emittiert `kategorie:'gewicht'`-Punkte auf Landkreis-Zentroiden/Sachsen-Landesmitte (ohne `geom`). `near.distM` ist immer ≫ 20 m → `continue` → der Fund erscheint nie. „gewicht" ist nicht in `AUSWERTUNG_AUSGESCHLOSSEN`, soll also bewertet werden.
**Impact:** Rechtlich harte Info („im Landkreis X GST-Brücken gesperrt") existiert als Zeile, taucht bei keiner Analyse auf. Systematischer, stiller Coverage-Verlust für alle grob geokodierten Quellen (PDF-Karten).
**Richtung:** Genauigkeits-Flag (`attrs.genauigkeit='kreis-grob'`) durchreichen → entweder gebiets-/Punkt-in-Polygon-Match statt 20-m-Korridor oder separate Anzeige als „gebietsweiser Hinweis", statt still zu verschlucken.

### DA-22 · [mittel] `dropCrossSourceDuplicates` löscht den schwächeren Fund ohne Titel-Vergleich  `[A]`
`engine/index.js:84-95`. Drop nur über Route+Kategorie+`|Δkm|≤0.15`+andere Quelle — **keine** Identitäts-/Titel-Prüfung (anders als `dedupeFindings`, das `normName(titel)` nutzt). Zwei fachlich verschiedene Funde gleicher Kategorie binnen 150 m aus zwei Feeds → der mildere echte wird gelöscht.
**Impact:** In dichten Korridoren verschwindet ein real existierendes Hindernis. 150 m ist für GST-Engstellen viel.
**Richtung:** Vor dem Drop inhaltliche Identität fordern (Titel ähnlich / gleiche `strassenRef` / externe-ID-Wurzel) oder DUP_KM im Cross-Source-Fall enger ziehen.

### DA-23 · [niedrig] `downsample` auf 2000 Punkte kappt Kurven-Innenseiten  `[A]`
`fallback.js:43-47`, `projects.js:50`, `engine/index.js:126`. Gleichmäßige Index-Ausdünnung (nicht krümmungsadaptiv); bei 700-km-Route ~350 m Sehnenabstand → in engen Kurven kann ein Hindernis am Außenrand >20 m von der Sehne messen.
**Impact:** Seltener, lokaler Match-Verlust nur an scharfen Kurven sehr langer Routen; auf Geraden irrelevant.
**Richtung:** Krümmungserhaltend ausdünnen (Douglas-Peucker) oder Korridor-Match adaptiv puffern. Niedrig.

### DA-24 · [info] Fahrzeit pauschal `distanzKm/50*60` — OSRM-Fahrzeit ungenutzt  `[A]`
`engine/index.js:213,210`, `resolveRoute.js:124`. Bewusste Max-Vereinfachung (frühere Fund-Zuschläge bliesen die Zeit auf). Reine Anzeigegröße, kein Datenverlust.
**Richtung (optional):** Vorliegende OSRM-`dauer_min` übernehmen oder km/h nach Straßenklasse differenzieren. Niedrig/optional.

---

## 5 · OPEX / Operative Effizienz  `[H]`

### DA-25 · [hoch] `rerunAll` rechnet bei jedem geänderten Import ALLE Projekte neu (Churn) → Concurrency künstlich auf 1  `[H][V]`
`worker/index.js:56-64,115` (`scheduleRerun` debounced, getriggert nach jedem Import mit geänderten Stats), `engine/rerunAll.js:102`. Jeder Rerun löscht + reinsertet sämtliche Findings jedes Projekts; wegen der Bbox-Heap-Last (DA-08) musste der Rerun auf Concurrency 1 gedrosselt werden.
**Impact:** Write-Amplification auf `findings`; Skaliert nicht mit Projektzahl × Importfrequenz (3×/Tag × ~46 Connectoren); langer serieller Rerun blockiert Aktualität.
**Richtung:** Inkrementell rerunnen (nur Projekte, deren Korridor von den geänderten Obstacles berührt ist) statt global; nach DA-08-Indexfix wieder parallelisieren; Findings-Diff statt DELETE+Reinsert.

### DA-26 · [mittel] `EXTERNAL_TIMEOUT_MS` Default 4000 ms wird an paginierte WFS durchgereicht → stille Teilabschnitte  `[H][V]`
`worker/importer.js:70`, `0123_baysis_bauwerke.js:51` (`fetchAllFeatures(pageSize:1500, maxPages:500, timeoutMs)`). 4 s/Seite ist für große WFS-Seiten knapp; Timeout → `getJson`→`null` → `feats=[]` → `fetchAllFeatures` bricht früh ab → **Teil-/Leerbestand**. Verbindet sich mit DA-31 (Reconcile deaktiviert dann den Rest).
**Impact:** Quellen mit großen Seiten liefern still unvollständig; je nach Reconcile-Pfad Datenverlust oder Lücke.
**Richtung:** Timeout für Voll-Abrufe entkoppeln (eigener, höherer Wert für `fetchAllFeatures`); bei Seiten-Timeout hart fehlschlagen statt „leere letzte Seite" anzunehmen.

### DA-27 · [mittel] Sync-Fortschritt als In-Memory-Job-Map → nicht multi-instanz-/restart-fest  `[H]`
`sync.js` (In-Memory-Job-Map + Locks). Bei zwei API-Replicas oder Restart geht Fortschritt verloren / Doppel-Import. (Deckungsgleich mit Architektur DA-33; vgl. Brain T-162.)
**Richtung:** Job-State in die DB (oder Redis) auslagern; Single-Run-Lock als DB-Advisory-Lock.

### DA-28 · [niedrig] Soft-Delete-Wachstum ohne Hard-Delete/VACUUM-Strategie  `[H]`
`worker/hygiene.js` (expire = `aktiv=false`), `importer.js` Reconcile (= `aktiv=false`). `aktiv=false`-Zeilen akkumulieren unbegrenzt; jede Bbox-Query filtert sie zwar per `aktiv=true`, aber Tabelle/Index wachsen, Bloat steigt.
**Richtung:** Periodischer Hard-Delete sehr alter inaktiver Zeilen (nach Backup-Fenster) + `VACUUM`/Autovacuum-Tuning.

---

## 6 · Datensicherung & Durability  `[H]`

### DA-29 · [hoch] `API/Bundesweit/mobilithek/mobilithek.env` u.a. sind git-getrackt → potenzielle Credential-Exposure  `[H][V]`
`git ls-files`: `API/Bundesweit/mobilithek/mobilithek.env`, `API/Sonstige/graphhopper/graphhopper.env`, `API/Sonstige/openrouteservice/openrouteservice.env` sind versioniert. `.gitignore` `.env` matcht den Dateinamen `*.env` **nicht** (nur exakt `.env`). Inhalte ungeprüft (nicht geöffnet), aber `*.env` neben mTLS-/API-Diensten = klassischer Secret-Träger.
**Impact:** Falls Tokens/Keys enthalten → Leak im Repo-Verlauf (überlebt Löschen). Security + Datensicherung.
**Richtung:** Inhalte prüfen; bei Secrets: aus Tracking nehmen, Keys rotieren, History scrubben; `.gitignore` auf `*.env` erweitern.

### DA-30 · [hoch] Reconcile deaktiviert bei Teil-/Timeout-Feed den nicht gesehenen Restbestand  `[H]`
`worker/importer.js:41-44,181-185`. `RECONCILE_SQL` setzt bei Vollbestand-Feeds alles `aktiv=false`, was nicht in `seen` ist. Guard ist nur `seen.size>0` — schützt **nicht** gegen einen Feed, der die Hälfte liefert (z.B. Timeout ab Seite N, DA-26). `fetchAllFeatures` gibt eine Teilliste ohne Vollständigkeits-Signal zurück.
**Impact:** Ein partiell antwortender Vollbestand-Feed deaktiviert stumm echten Bestand → fehlende Funde beim Kunden bis zum nächsten vollständigen Lauf.
**Richtung:** `fetchAllFeatures` muss Vollständigkeit signalisieren (`numberMatched` erreicht? alle Seiten ok?); Reconcile nur bei **nachweislich vollständigem** Abruf laufen lassen, sonst überspringen + Run als „partial" markieren.

### DA-31 · [mittel] Kein Audit-Trail / keine Historie für Obstacle-Mutation & -Löschung  `[H]`
`obstaclesRepo.js` (`UPDATE_SACHFELDER_SQL` überschreibt in place), Reconcile/Hygiene (Soft-Delete). `tenant_audit_log` (Migration 034) deckt nur Mandanten-Operationen, nicht Obstacle-Änderungen. Vorwerte sind nach Überschreiben weg.
**Impact:** Falsch-Import/Fehl-Reconcile nicht nachvollziehbar/wiederherstellbar; keine forensische Spur für Datenstreit.
**Richtung:** History-/Change-Log-Tabelle für obstacles (alt→neu, Quelle, Zeit) oder zumindest `updated_at`-getriebener Append-Log für kunden-/PDF-sichtbare Felder.

### DA-32 · [niedrig/info] Kein PITR/WAL-Archiv — Datenverlustfenster bis zum nächsten Dump  `[H]`
Backup laut Brain: systemd-Timer 12:00/20:00, keep-2 → bis ~16 h zwischen den Dumps ohne Point-in-Time-Recovery. (Überschneidung mit Scalability-Auditor.)
**Richtung:** WAL-Archivierung/PITR für die Produktiv-DB erwägen; Backup-Frequenz an die Importfrequenz (3×/Tag) koppeln; Restore regelmäßig testen.

---

## 7 · Gesamtarchitektur  `[H]`

### DA-33 · [hoch] roadmap-api ist durch In-Memory-State nicht horizontal skalierbar  `[H]`
`sync.js` (Job-Map + Locks im Prozess). Zwei Replicas = Doppel-Import, inkonsistenter Fortschritt, konkurrierende Reruns. (Brain T-162.)
**Richtung:** Statelessness herstellen — Job-/Lock-State in DB/Redis; dann erst Replicas möglich.

### DA-34 · [hoch] Single-Worker-SPOF für alle Importe, Reruns und Hygiene  `[H]`
`worker/index.js` plant per `croner` alle Connector-Schedules + Hygiene + Auto-Rerun in **einem** Prozess. Fällt er aus, veraltet der gesamte Datenbestand still (kein Alerting im Code).
**Richtung:** Worker-Health/Heartbeat + Alerting; Import-Idempotenz erlaubt Failover; mittelfristig Queue-basierte Verteilung.

### DA-35 · [mittel] `API/_lib/format.mjs` ist eine parallele Normalisierungs-Kopie von `_helpers.js`  `[H][V]`
`_helpers.js:1` („Port aus API/_lib/format.mjs"); `API/_lib/format.mjs` existiert (8762 B), wird in `server/src` **nicht** importiert. Zwei Implementierungen derselben Normalisierungslogik (inkl. Extraktion/Dedup) können auseinanderlaufen.
**Impact:** Falls die `API/`-Katalog-Cronjobs noch live sind, normalisieren zwei Codepfade unterschiedlich → inkonsistente Daten. Falls tot → Dead-Code, der bei Audits verwirrt.
**Richtung:** Klären ob `API/` noch produktiv läuft. Wenn ja: gemeinsame Quelle (ein Modul) statt Kopie. Wenn nein: `API/`-Laufzeit-Artefakte archivieren/entfernen.

### DA-36 · [mittel] FE/BE-Vertrag über Repo-Grenze (FE aus `setreo-intern-hub`) ohne geteilten Contract  `[H]`
BE-Mapping in `map.js`; FE wird aus separatem Repo gebaut/deployt (Brain). Feldumbenennung im BE = stiller Anzeigeverlust, kein gemeinsamer Typ-/Schema-Check über die Grenze.
**Richtung:** Geteiltes Contract-Artefakt (OpenAPI/Typen-Paket) oder Contract-Test im CI beider Repos.

### DA-37 · [mittel] Cross-Tenant-Isolation nur applikativ (`tenant_id IS NULL OR = $1`), kein RLS  `[H]`
`engine/index.js:135` u.a. Jede Obstacle-/Findings-Query muss den Tenant-Filter selbst mitführen; ein vergessener Filter = Cross-Tenant-Leak. Keine DB-Row-Level-Security als zweite Schicht. (Überschneidung mit Compliance/Security-Auditor & Brain T-215 „Single-Layer-Trust".)
**Richtung:** RLS-Policies auf tenant-behaftete Tabellen als Defense-in-Depth; zentrale Query-Helper, die den Filter erzwingen.

---

## 8 · Externe Systeme & Trust-Boundaries  `[H]`

### DA-38 · [hoch] Header-Trust einschichtig — `X-Auth-*`/`X-Provision-Secret` nur durch Proxy-Strip geschützt  `[H]`
`auth.js`, `routes/internal.js`. roadmap-api vertraut den vom Proxy gesetzten Identitäts-Headern; erreicht ein Request die API am Proxy vorbei (Netz-Misconfig, interner Aufruf), sind die Header client-kontrolliert → Auth-/Tenant-Bypass. **Bereits als T-215 (Compliance/Security) erfasst** — hier nur zur Architektur-Vollständigkeit, **kein Doppel-Ticket**.
**Richtung:** Zweite Vertrauensschicht (signiertes Proxy-Token / mTLS intern), siehe T-215.

### DA-39 · [mittel] Ausgehende Fehlerbehandlung schluckt Fehler still (`getJson`→null)  `[H]`
`_helpers.js:355-375`, `external/http.js`. `getJson`/`getText`/`getBuffer` geben bei jedem Fehler `null` zurück, ohne Unterscheidung Timeout vs. 4xx/5xx vs. leerer Feed. Speist DA-26/DA-30 (stiller Teilbestand → Fehl-Reconcile).
**Richtung:** Fehlerklasse durchreichen (Timeout/HTTP-Status), im Importer als Run-`error`/`partial` werten statt als leeren Feed.

### DA-40 · [niedrig] SSRF-Fläche über admin-gesetzte Quell-URLs  `[H]`
`quellen.endpoint_url` ist admin-pflegbar; Connector-fetch folgt der URL ohne Allowlist. Risiko niedrig (admin-only), aber unbeschränkt.
**Richtung:** Schema-/Host-Allowlist für ausgehende Connector-URLs; interne Adressbereiche blocken.

---

## 9 · Darstellung / Retention & Daten-Inhaltsqualität  `[H]`

### DA-41 · [mittel] Retention-Lücke Display/Export — nicht alle gespeicherten Felder erreichen Popup/PDF/CSV  `[H]`
`map.js` (`rowToFinding`/`rowToShareData`), FE `findingMeta.ts`. Aus DA-15 folgt: Labels existieren für `zeitfenster`/`medium`, aber ob `strassenRef`, `sperrlaengeM`, `anzahlFahrstreifen`, `zustaendig`, `gueltigVon/bis` durchgängig in Popup **und** PDF/CSV-Export erscheinen (inkl. Umlaut-Encoding), wurde wegen Session-Limit nicht agentengeprüft.
**Richtung:** End-to-End-Abgleich gespeicherte Felder ↔ Anzeige/Export; fehlende relevante Felder ergänzen; CSV-UTF-8/BOM prüfen. (Dimension noch nicht agententief auditiert.)

### DA-42 · [mittel] Brücken/Tunnel/Engstellen ohne hinterlegte Maße sind unsichtbar (Coverage-Lücke)  `[H]`
`rules.js:381` blendet „hinweis" für Nicht-Event-Kategorien aus → ein Bauwerk ohne Höhe/Gewicht/Breite erzeugt keinen Fund. Bewusste Max-Vorgabe (kein „Brücke ohne Maße"-Flut), aber faktisch verschwinden alle maßlosen Bauwerke aus der Auswertung.
**Impact:** Strukturelle Coverage-Lücke proportional zur Maß-Unvollständigkeit der Quellen (laut `ATTRIBUT-AUDIT-SOLL-IST.md` erheblich).
**Richtung:** Maß-Vollständigkeit je Quelle quantifizieren; für GST-relevante Bauwerke ohne Maß zumindest einen „Maße unbekannt, vor Ort prüfen"-Hinweis auf der Route zeigen statt komplett auszublenden.

---

## Offen / noch nicht agenten-tief auditiert (Session-Limit)

Aus eigener Erstlektüre adressiert, aber **nicht** durch den vollen Multi-Agent-Sweep + Verify gelaufen — Kandidaten für einen zweiten Lauf nach Reset:
- **Connector-Ingest pro Schnittstelle** (6 Batches, ~46 Quellen): „Bekommen wir alles?" — Feld-für-Feld-Abgleich Quelle↔Mapping, Paginierungs-Caps, Kategorie-Zuordnung, geom-Durchreichung je Connector. Bisher nur Stichproben (0112/0210/0211/0214/0216/0302 Vollsperrung als „baustelle"; 0121 Zentroide; 0123 Timeout).
- **Display/Export** (DA-41) Feld-für-Feld.
- **Daten-Inhaltsqualität** quantitativ (DA-42): Maß-/Geokodier-Vollständigkeit aus dem Live-Bestand (braucht DB-Zugriff).

---

## Zählung

| Severity | Anzahl (mit Ticket) |
|---|---|
| kritisch | 2 (DA-01, DA-14) |
| hoch | 9 (DA-02, DA-08, DA-15, DA-16, DA-21, DA-25, DA-29, DA-30, DA-33, DA-34) |
| mittel | 17 |
| niedrig | 6 |
| info (kein Ticket) | 3 (DA-13, DA-20, DA-24) |

Tickets werden aus den Findings DA-01…DA-42 abgeleitet (ohne die 3 info-Befunde).

---

# Nachtrag · Connector-Ingest-Tiefenpass (2. Lauf)

**Frage Max:** „Bekommen wir alles von jeder Schnittstelle?" — Feld-für-Feld-Abgleich Quelle↔Mapping. Agenten-Sweep über die **Bundes-/Länder-Connectoren** (Batches 1–4: Autobahn, DATEX2, Mobilithek, GST-NRW, GST-WSV, 0150, Hamburg, Berlin, SH, MV, Sachsen-Anhalt, BAYSIS, NRW, Hessen, Saarland, BW-BEMaS, RLP, Sachsen, Thüringen, Brandenburg). **25 Findings, 4 agentenverifiziert, Rest vom Hauptauditor gegengezeichnet.** Batches 5–6 (kommunale Connectoren München/Aachen/Köln/Dresden/Stuttgart/Münster/Dortmund/Bonn/Karlsruhe/Leipzig/Rostock/Ingolstadt/Osnabrück/Freiburg/Heidelberg/Duisburg/RVR) + Display/Export-E2E **noch offen** (erneutes Rate-Limit).

## Zwei systemische Muster

1. **Linien-geom-Regression (DA-47):** Beim Port aus den ursprünglichen `*.cron.mjs` ging in **5 Connectoren** die `geom`-Durchreichung verloren — `0112` Hamburg, `0118` SH-Umleitungen (~173), `0120` LSBB-ST (~168), `0119` MV (latent), `0127` Saarland (Linien-Feeds ganz entfernt). Linien-/Flächenmaßnahmen kollabieren zum Punkt → kein Linien-Render, Korridor-Clip + Gegenfahrbahn-Filter greifen nicht.
2. **Strukturierte Sperrart-/Richtungs-Felder verworfen:** mehrere Connectoren liefern strukturierte Felder, die der Connector ignoriert und stattdessen aus Freitext rät — `0128` direction-Enum (100% gesetzt), `0130` „Sperrung für LKW", `0132` Status_Fahrstreifen/Länge, `0114`/`0117`/`0110` Richtungsfelder.

## Findings & Tickets

| Ticket | DA | Sev | Connector | Kurz |
|---|---|---|---|---|
| T-427 | DA-43 | hoch | 0001 Autobahn | `/services/warning` nie abgerufen → Gewichts-/Verengungs-Schilder fehlen |
| T-428 | DA-44 | mittel | 0001 Autobahn | WEIGHT_LIMIT_35-Closure als Vollsperrung statt gewicht/maxGewichtT |
| T-429 | DA-45 | hoch | datex2 | NetworkRestriction-Profile (vehicleHeight/grossVehicleWeight/Width) verfehlt |
| T-430 | DA-46 | niedrig | datex2 | Richtungs-Enum als tote String-attr |
| T-431 | DA-47 | hoch | 0112/0118/0119/0120/0127 | Linien-geom-Regression (Port-Verlust) |
| T-432 | DA-48 | hoch | 0114/0115 VIZ Berlin | `/gesperrt/`-Overmatch → Einzelspur fälschlich kritisch |
| T-433 | DA-49 | mittel | 0114 VIZ Berlin | direction-Feld „Beidseitig" verworfen |
| T-434 | DA-50 | mittel | 0115 VIZ Berlin | externeId ohne stabilHash → Kollision/Reconcile-Risiko |
| T-435 | DA-51 | niedrig | 0115 VIZ Berlin | geomLinie ohne Polygon-Zweig (Inkonsistenz zu 0114) |
| T-436 | DA-52 | niedrig | 0114/0115 | subtype Gefahr/Störung → Catch-all „sperrung" |
| T-437 | DA-53 | niedrig | 0110 GST-HH | richtung + Gegen-Fahrstreifen verworfen |
| T-438 | DA-54 | niedrig | 0111 Brücken-HH | Schilderbrücke→„ampel" ohne Höhenwert (irreführend) |
| T-439 | DA-55 | niedrig | 0117 SH | toter maxHoeheM-Key + Fahrtrichtung verworfen |
| T-440 | DA-56 | niedrig | 0126 Hessen | kein Bezugsgewicht je Brücke (Upstream-Lücke, verifiziert) |
| T-441 | DA-57 | hoch | 0128 BW-BEMaS | direction-Enum (ONE/BOTH) verworfen |
| T-442 | DA-58 | mittel | 0128 BW-BEMaS | `.001`-Segment-Suffix zersplittert Baustelle |
| T-443 | DA-59 | hoch | 0130 Sachsen | „Sperrung für LKW" fällt durch (Literal-Match) |
| T-444 | DA-60 | mittel | 0132 Brandenburg | Struktur-Felder (Länge/Fahrstreifen) ignoriert |
| T-445 | DA-61 | niedrig | 0131 Thüringen | KFZ_LAENGE→maxLaengeM unbewertet + RICHTUNG ungemappt |

**Sauber befunden (kein Ticket):** 0150 (gesperrtKomplett-Logik korrekt, nur Kommentar-Drift), 0116 Detailnetz Berlin, 0133 Berlin-Durchfahrtshöhe, 0134 Hamburg-VZ, 0121 GST-Sachsen, 0123 BAYSIS, 0124 GST-NRW, 0125 NRW-Bauwerke, 0303 GST-WSV, tmcResolver, mobilithek-Wrapper (erbt nur die datex2-Lücken).

**Noch offen (Rate-Limit):** Connector-Batches 5–6 (kommunale Quellen) — aus DA-14 ist bekannt, dass 0210/0211/0214/0216 Vollsperrung als „baustelle" hartkodieren; das feldgenaue Mapping der Stadt-Connectoren steht aus. Display/Export-E2E (DA-41) ebenfalls. Workflow-Skript `roadmap-connector-ingest-deepdive-wf_358ef4b9-01e.js` liegt bereit zum Resume.

---

# Nachtrag 2 · Kommunale Connectoren + Display/Export-E2E (3. Lauf, vollständig)

**26 Findings, 23 verifiziert, 3 widerlegt.** Stadt-Connectoren (Batch 5+6) + Display/Export. Tickets **T-450…T-463** (DA-62…DA-75).

**Widerlegt (kein Ticket):** `ING-0212-TYP` (typ-Code-Dekodierung — Freitext reicht), `0221-VZ-WERTVERLUST` (Wert-Extraktion überzeichnet), `0228-MASS-NUR-TONNAGE` (Quelle liefert keine Maße). **Positiv/info:** `0213` Dresden ist die **Referenz-Implementierung** (Voll-Abruf, LineString-geom, saubere Voll/Halb-Trennung), `0224` Ingolstadt, `0226` Freiburg (Polygon bewusst auf Punkt), `DISP-07` (KategorieBar-Drift, Beobachtung).

| Ticket | DA | Sev | Wo | Kurz |
|---|---|---|---|---|
| T-450 | DA-62 | hoch | 0212 Köln | nur ArcGIS-Layer 0 (Punkte) — Strecken-/Flächen-Layer 1/2/3 ignoriert |
| T-451 | DA-63 | hoch | 0210/0214/0216/0219/0302 | DA-14 connector-seitig: Vollsperrung → kategorie „baustelle" (5 Stadt-Connectoren) |
| T-452 | DA-64 | mittel | 0214 Stuttgart | `gueltigBis` verloren — ENDE ist Freitext („Ende Dez. 2029"), kein Monats-Parser |
| T-453 | DA-65 | mittel | 0215 Münster | „Teilsperrung" → kategorie sperrung (Substring-Overmatch) |
| T-454 | DA-66 | mittel | 0218 Bonn | `massnahme` nicht kategorisiert + Teilsperrung/Gehweg-Sperrung als KFZ-sperrung |
| T-455 | DA-67 | niedrig | 0211 Aachen | `strassen`-Feld ungemappt |
| T-456 | DA-68 | niedrig | 0220 Leipzig-VRE | strukturiertes `sperrart`/`sparte` nur regex-geprüft |
| T-457 | DA-69 | niedrig | 0302 RVR | `auftraggeber` (Zuständigkeit) verworfen |
| T-458 | DA-70 | hoch | 0221 Leipzig-VZ | VZ 263 (Achslast)/266 (Länge) auf nie-bewertete attrs (vgl. DA-15) |
| T-459 | DA-71 | mittel | map.js/Engine | **rowToFinding reicht `obstacle.attrs` nicht durch** → nicht-bewertete Felder fehlen in Auswertung/PDF/CSV (Kern von DA-41) |
| T-460 | DA-72 | niedrig | _helpers.js | string-attrs zeitfenster/medium umgehen den number\|boolean-Filter (Inkonsistenz zu DA-04) |
| T-461 | DA-73 | niedrig | DashboardTab | CSV-Export ohne `detail`/Grenzwerte (Asymmetrie zum PDF) |
| T-462 | DA-74 | niedrig | ReportView/StreckenBand | unsichere `KATEGORIE_META[]`-Direktzugriffe → Crash bei unbekannter Kategorie |
| T-463 | DA-75 | niedrig | findingMeta.ts | boolean-attrs `grundsaetzlicheGstSperre`/`gesperrtKomplett` ohne ATTR_LABEL (Roh-Key im Popup) |

**DA-41 aufgelöst:** Display-Pfad ist für die kuratierten Felder sauber, aber `rowToFinding` reicht bewusst nur `detail` durch (DA-71) → genau die nicht-bewerteten attrs aus DA-15 erreichen die Oberfläche nicht. `DISP-01` (richtung im Normalizer verworfen) bestätigt **DA-03** display-seitig.

---

# Coverage-Gap (Stand 2026-06-20, Audit abgeschlossen)

Was dieser Audit **abdeckt**: der gesamte statische Code-Pfad Ingest → Normalisierung → Storage → Kalkulation → Display über **alle ~46 Connectoren** + Engine + Schema + FE-Display. **77 Findings → 71 Tickets** (DA-01…DA-75 minus 4 info; `audit-data`).

Was **strukturell offen** bleibt (nicht statisch auditierbar — braucht Laufzeit/Prod-Zugriff):
1. **Quantitative Daten-Inhaltsqualität:** wie viele Bauwerke real ohne Maße (DA-42), Geokodier-Genauigkeit je Quelle (DA-21), Cross-Source-Dubletten im Live-Bestand — braucht DB-Abfragen gegen `obstacles`.
2. **Query-Pläne:** DA-08 (fehlender Spatial-Index) per `EXPLAIN ANALYZE` gegen den echten Bestand verifizieren, bevor der Index gesetzt wird.
3. **Live-API-Feldabgleich:** einige Connector-Findings (Köln Layer 1/2 „fehlt evtl. ganz", 0224/0226 Maß-Felder) sind nur gegen eine echte Quell-Antwort final beweisbar.
4. **Backup-Restore-Test** (DA-32) + tatsächliche Import-Mengengerüste/Worker-Last (DA-25/DA-34) — nur im Betrieb messbar.
5. **OPEX/Datensicherung/Architektur/Extern** (DA-25…DA-40) stammen aus der Erstlektüre des Hauptauditors, nicht aus dem adversarial verifizierten Agenten-Sweep (Connector-/Kern-Findings sind verifiziert).
