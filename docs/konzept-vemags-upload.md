# Konzept: VEMAGS-Bescheid-Upload → Routenrekonstruktion + Fahrzeug-Spec

Stand 2026-06-23 · Vision (Max): VEMAGS-Bescheid (PDF) hochladen → System zieht den Fahrtweg (Punkt 9)
heraus und baut über OSM/OSRM eine Route, die der amtlichen so gut wie möglich nachempfunden ist —
Wegpunkt für Wegpunkt je Streckenteil. Bonus: der Bescheid liefert auch die Transport-Maße.

## 1. Was ein VEMAGS-Bescheid liefert (verifiziert am Beispiel-PDF, 75 S.)

**Punkt 9 „Fahrtweg"** — semi-strukturiert, klar parsebar:
```
9. Fahrtweg
   Fahrtweg: 1
     Fahrtwegteil: 1.1 - Leerfahrt
        Start: 77743 Altenheim, L98 {GüG Eschau}
               GüG Eschau - L98 - B33a - AS Offenburg - A5 - AD Hattenbach - A7 - AD Walsrode -
               A27 - AK Bremen - A1 - AD Stuhr - A28 - AS Leer-Ost - B436 - Hesel - B72 - B210 - …
        Ziel:  26607 Aurich, Logistikparkplatz/ Kreihüttenmoorweg 25 {ELEC}
     Fahrtwegteil: 1.2 - Lastfahrt      ← der eigentliche Transport
        Start: …  <Wegpunkt-Sequenz>  Ziel: 34434 Borgentreich, K21 {WP Borgentreich-Hoppe, SÜD}
     Fahrtwegteil: 1.3 - Leerfahrt
```
- Ein Bescheid hat 1..n **Fahrtwege**, je 1..n **Fahrtwegteile** (Leerfahrt → Lastfahrt → Leerfahrt).
- Je Teil: **Start** (PLZ Ort, Straße {Landmark}) · **Wegpunkt-Sequenz** (dash-separiert) · **Ziel** (PLZ Ort).
- Die Sequenz **mischt** vier Token-Typen:
  - **Geokodierbare Punkte:** Orte (Hesel), Straßen/Adressen (Borsigstraße, Kreihüttenmoorweg), Start/Ziel.
  - **AB-Knoten:** `AS …` (Anschlussstelle), `AK …` (Kreuz), `AD …` (Dreieck) — die strukturgebenden Wegpunkte auf Autobahn.
  - **Straßennummern:** A5/A7/B210/L98/K29 — KEINE Wegpunkte, sondern die Verbindungsstraße (implizit durch die Knoten).
  - **Fahranweisungen:** „links im Gegenverkehr", „rechts über Sonderabfahrt", „Zufahrt B1" — Detail-Manöver, für Routing nicht reproduzierbar → Noise.

**Transport-Spezifikation** (Punkt 2–8, am Beispiel Z.54/91–97):
`Länge 14,3 m · Breite 4,99 m · Höhe 3,46 m · Masse 83,25 t` + **Achslasten** (7,7 / 7 / 9 / 9 / 11 / 11,5 …) + Achsabstände.
→ exakt die Felder, die unsere Analyse gegen Höhen/Gewicht/Breite/Achslast prüft.

**Metadaten:** Bescheid-/Antragsversion (20260017547_B_03), Behörde, Antragsteller, Gültigkeit.

## 2. Architektur-Einordnung

- **Neuer Upload-Modus** als 4. Option neben Datei / Google-Link / Start-Ziel (gleiche Maske, neuer Tab „VEMAGS-Bescheid").
- **PDF-Parsing läuft SERVER-seitig** (neuer Endpoint, z.B. `POST /api/route/vemags`): PDF-Textextraktion gibt es im Browser nicht zuverlässig, und wir haben bisher KEINEN PDF-Parser (bewusst, siehe deferred file-Quellen). → eine PDF-Text-Lib serverseitig nötig (Kandidaten: `pdfjs-dist` (bereits FE-Dep-nah) oder `pdf-parse`; reine Text-Extraktion, keine OCR — VEMAGS-PDFs sind Text-PDFs, `pdftotext -layout` reicht als Referenz).
- **Wiederverwendet:** `api.route.waypoints` → OSRM (Routing durch geordnete Wegpunkte, identisch zum Start-Ziel-/gmaps-Flow), die Projekt+Strecken+Analyse-Pipeline, die Fahrzeug-Spec-Felder, der Geocode-Proxy.

## 3. Pipeline

1. **PDF → Text** (server, Text-PDF; Layout-erhaltend).
2. **Punkt 9 isolieren** (zwischen „9. Fahrtweg" und „10.") → Fahrtweg(e) → Fahrtwegteile. Parser keyt auf `Fahrtwegteil:`, `Start:`, `Ziel:`; die Sequenz = alles zwischen Start-Zeile und `Ziel:` (mehrzeilig zusammenfügen, an ` - ` splitten).
3. **Wegpunkte klassifizieren + filtern:** Start → [Sequenz-Punkte ohne reine Straßennummern (`^[ABLK]\s?\d`) und ohne Anweisungs-Token (links|rechts|Gegenverkehr|Zufahrt|Sonderabfahrt|über|teilweise)] → Ziel. AB-Knoten behalten (Präfix `AS|AK|AD|Anschlussstelle|Kreuz|Dreieck` markieren).
4. **Geocoding** (Reihenfolge erhalten):
   - Start/Ziel: „PLZ Ort" → präzise (getestet: 77743 Altenheim ✓, 26607 Aurich ✓).
   - Orte/Adressen: direkt (Hesel ✓).
   - AB-Knoten: Plain „Anschlussstelle X" findet NICHTS → **Präfix strippen, Ortsteil geokodieren** (getestet: Beckum/Stuhr/Hattenbach/Walsrode ✓ — der Knoten liegt am gleichnamigen Ort); „Dreieck Stuhr" traf sogar direkt einen `motorway_junction`. **v2:** OSM-`motorway_junction`-Gazetteer (Overpass-One-Time-Pull aller benannten AB-Knoten DE → präzise Lookup-Tabelle).
   - Nicht auflösbare Token überspringen (Route wird gröber, bleibt aber zusammenhängend).
5. **OSRM-Route je Fahrtwegteil** durch die geordneten Wegpunkte → eine Strecke je Teil.
6. **Maße extrahieren** → Fahrzeug-Spec (Breite/Höhe/Länge/Masse/Achslast) des Projekts vorbefüllen.
7. **Projekt anlegen**: Name aus Bescheid-Nr/Antragsteller, n Strecken (1.1/1.2/1.3, Lastfahrt markiert), Spec gesetzt → normale **Analyse** läuft → Funde (inkl. der neuen SEVAS-Höhen/Brücken-Tonnage) gegen den ECHTEN Transport.

## 4. Genauigkeit & Grenzen (ehrlich)

- **Approximation, „so gut es geht":** Knoten-Wegpunkte (v1 ortsgenau) zwingen OSRM grob auf den vorgeschriebenen Korridor (Autobahn-Reihenfolge). Zwischen zwei Knoten wählt OSRM die Straße selbst — kann minimal von der vorgeschriebenen (A5/B210) abweichen, folgt ihr aber meist, weil die Knoten die einzige plausible Verbindung sind.
- **Verloren:** Detail-Manöver (Gegenverkehr-Abschnitte, Sonderabfahrten, „rechts/links") — nicht aus Namen reproduzierbar.
- **Knoten-Präzision** ist der größte Hebel: ortsgenau (v1) reicht für die Korridor-Form; für km-genaue Treffer braucht es den Junction-Gazetteer (v2).
- Der Nutzer kann die rekonstruierte Strecke danach im **vorhandenen Strecken-Editor** (T-197/T-229) nachziehen — die Wegpunkte sind schon gesetzt.

## 5. OSM-Einordnung
Diese Funktion nutzt OSM bewusst (OSRM-Routing + Nominatim-Geocoding der Wegpunkte) — von Max für genau diesen Zweck gewünscht („per OSM eine Route bauen"); konsistent mit dem bestehenden Start-Ziel-/gmaps-Upload und den Karten-Tiles. Der optionale Junction-Gazetteer wäre ebenfalls OSM (motorway_junction-Knoten).

## 6. Risiken
- **PDF-Format-Varianz:** verschiedene Genehmigungsbehörden/VEMAGS-Versionen → Layout-Abweichungen. Parser tolerant + auf „Fahrtwegteil/Start/Ziel"-Anker bauen; Fehlerfall sichtbar machen (kein stiller Teil-Parse). Mehrere echte Bescheide zum Testen nötig.
- **Knoten-Geocoding-Treffer** schwanken; Fallback-Kette + „nicht aufgelöst"-Report.
- **Gegenverkehr/Sonderfälle** nicht abbildbar → Hinweis im Ergebnis („rekonstruiert, vor Fahrt prüfen").

## 7. Phasen
- **v1 (MVP):** PDF-Parse Punkt 9 + Maße → Wegpunkte (ortsgenaue Knoten) → OSRM je Fahrtwegteil → Projekt+Spec+Analyse. Fokus Lastfahrt, Leerfahrten als zusätzliche Strecken.
- **v2:** OSM-motorway_junction-Gazetteer (km-genaue AB-Knoten) + robustere Maß-/Achslast-Extraktion + Format-Härtung über mehrere Bescheide.
- **v3:** Editor-Feinschliff der rekonstruierten Route; Abgleich „beschiedener Fahrtweg vs. unsere Restriktionen" als Plausi-Report.

## 8. Entscheidungen für Max
1. **Welche Fahrtwegteile laden?** GEKLÄRT (Max 2026-06-23): **1 Strecke je Fahrtwegteil — alle laden.** Begriff: der Bescheid hat „Fahrtweg: 1" mit 3 Fahrtwegteilen (1.1 Leerfahrt / 1.2 Lastfahrt / 1.3 Leerfahrt) = praktisch 3 eigenständige Strecken. Mehrere „Fahrtweg: N" → alle Teile zu Strecken ausflachen (2×3 = 6 Strecken). Lastfahrt wird markiert.
2. **Maße automatisch in die Fahrzeug-Spec?** GEKLÄRT: **ja** — sofern extrahierbar (ist es: L/B/H/Masse + Achslasten), direkt übernehmen.
3. **Knoten-Präzision?** GEKLÄRT: **maximal** — OSM-`motorway_junction`-Gazetteer (km-genaue AB-Knoten), Aufwand ok, Quali vor Tempo.
4. **PDF-Lib?** GEKLÄRT: neue Dependency ok. **HARTE AUFLAGE: PDF NIEMALS speichern** — rein in-memory parsen (Buffer), Daten extrahieren, PDF sofort verwerfen (kein Disk/DB/Log). Bescheid = sensible Kundendaten.

Bezug: [[router-und-link-startziel-upload]], [[gmaps-strukturierte-wegpunkte-t564]], [[vipnrw-geoserver-wfs]], [[beschaffung-vemags-bast]].
