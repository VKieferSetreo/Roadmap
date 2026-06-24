# Research-Welle 2: Statische/strukturierte GST-Quellen + One-Time-Pulls

**Stand:** 2026-06-22 · **Workflow:** 79 Agenten (14 Discovery + bis 70 Verify + Synthese), 2-mal am Session-/Rate-Limit resumed bis vollständig. NRW ausgeklammert.

The task is to synthesize a report from already-verified data. No code, no research. Ponytail noted, not relevant here. I'll deduplicate the 64-candidate JSON down to unique sources and write the report directly as my return value.

Deduplicating the verified findings: the JSON has heavy repetition (BAYSIS Bauwerke appears ~12 times, Leipzig-VZ ~10 times, Bremen-VMZ ~7 times, Bremen-ASV-PDF ~5 times, NI-Baustellenliste ~5 times). Unique sources distilled below.

---

# Welle-2-Report: Statische & strukturierte GST-Restriktionsquellen

**Scope:** Hindernis-Daten mit echten, evaluierbaren Restriktionen (Tonnage, Brückenklasse, lichte Höhe/Breite, GST-Sperre). Fokus auf statische/One-Time-Pulls zusätzlich zu Live-APIs. NRW ausgeklammert. Stand 2026-06-22.

---

## 1. Neue nutzbare Quellen (Welle 2)

Nach Deduplizierung der 64 geprüften Kandidaten: **9 distinkte Neu-Funde** (`NEU_NUTZBAR`). Quick Wins (hoher Gewinn × geringer Aufwand) zuerst.

### Quick Wins — sofort einbackbar

| # | Quelle | BL | Datentyp | Bezugsart | Format | Gewinn | Aufwand |
|---|--------|-----|----------|-----------|--------|--------|---------|
| 1 | **Bremen ASV — Gewichtsbeschränkte Straßen & Brücken** | HB | gewicht/brücke (Tonnage + Brücken-/Durchlass-t + Durchfahrtshöhen VZ265) | **one-time-download (PDF)** | PDF, 40 S., Stand 22.11.2022 | **hoch** | **S** |
| 2 | **NLStBV D34 — Baustellen-Durchfahrtsbreiten** | NI | durchfahrtsbreite + Vollsperrung + Last-/Brückenhinweise | **one-time-download (täglich re-pullbar)** | XLSX (5 Sheets B/L/K) + PDF | **hoch** | **S** |
| 3 | **BASt Brückenstatistik FeatureServer (Re-Audit: sperrung_sv + breite)** | alle 15 | brücke (GST-Sperr-Flag + Brückenbreite) | live-api (je BL als One-Time abziehbar) | ArcGIS REST GeoJSON | **hoch** | **M** |

**Detail Quick Wins:**

- **(1) Bremen ASV-PDF** — `https://www.asv.bremen.de/sixcms/media.php/13/Stra%C3%9Fenverzeichnis%20%2702%20gewichts.-Stra%C3%9Fen.pdf` (894 KB, HTTP/2 200). Spalten: `Straßenname | Bezirk | t | Brücke/t | Durchlass/t | VZ 253`. ~588 Zeilen mit echten Tonnagen (2,5/3,5/6/7,5/9/12/16/20/30 t), eigene Brücken-Spalte (z.B. "Bürgermeister-Smidt-Brücke 30/30", "Karl-Carstens-Brücke 20/20") plus eingebettete Durchfahrtshöhen ("Teerhofbrücke 3,80m", "Tunnel nur 3,50m"). Companion: `gewichts.-Plätze.pdf` (193 KB). Parsebar **exakt wie Bestand 0126 Hessen**. Geocoding über Straßenname + Bremen via vorhandenem `/api/geocode`-Proxy. **HB war Null-Abdeckung für Restriktionen — echtes Gap-Closing für das schwächste Zielland.** Zugang offen, keine Registrierung.

- **(2) NLStBV D34 Baustellenliste** — `https://s3.eu-central-1.amazonaws.com/d34-baustellenliste-public/baustellenliste.xlsx` (+ `.pdf`, öffentlicher S3-Bucket, kein Login). 3 Datenblätter B/L/K (~96 Arbeitsstellen). Spalten: `Str | AoA | von/bis NK-Name | von/bis Ort | von/bis St.(m) | Anfang/Ende | B ges.(m) | Aufw.(m) | B HFS(m) | FR | Kommentar`. 28 Einträge mit echter Durchfahrtsbreite (2,56–4,25 m), 6–11 explizite Vollsperrungen ("Vollsperrung - kein Großraum-/Schwertransport möglich"), Last-Hinweise im Kommentar ("L111 Bützfleth: 24 t Lastbeschränkung. Für GST ab 24 t voll gesperrt"). **Erste NI-Quelle mit echten evaluierbaren GST-Werten** (NWSIB-NI war location-only). Mappt direkt auf vorhandene Engine-Baustellen-Zeitraum-/Vollsperrungs-Logik (T-265ff). **Caveat:** keine Koordinaten → Verortung über Netzknoten-Name + Ort + Stationierung; temporäre Baustellen, kein permanentes Bauwerkskataster; NI-Haftungsausschluss seit 01.02.2018.

- **(3) BASt Brückenstatistik FeatureServer — Re-Audit** — `https://services2.arcgis.com/jUpNdisbWqRpMo35/arcgis/rest/services/Br%C3%BCckenstatistik_Deutschland/FeatureServer/0/query`. **Wichtige Korrektur ggü. Welle 1:** Die ASCII-URL ist TOT (HTTP 400); Service jetzt URL-encoded (Umlaut ü), Layer = `Brueckenstatistik25`. **Zwei verwertbare Felder:** `sperrung_sv` (echte 'ja'/'nein' = harte GST-Sperrung) UND `breite` (in cm kodiert, z.B. 1325=13,25 m — bislang NICHT extrahiert, zweite harte Restriktion). SV-Sperrungen in Zielländern: BW 288, BY 663, HE 309, NI 315, SN 290, ST 205, TH 141 u.a. — Summe ~3.000. **Caveat bestätigt:** `trag_l_idx` ist KEINE Tonnage (nur Index I–V), keine Durchfahrtshöhe.

### Bauwerks-Kataster mit Brückenklasse/GST-Sperre

| # | Quelle | BL | Datentyp | Bezugsart | Format | Gewinn | Aufwand |
|---|--------|-----|----------|-----------|--------|--------|---------|
| 4 | **BAYSIS Bauwerke (separater MapServer-Layer)** | BY | brücke+tunnel (Brückenklasse + Höhe + GST-Sperre) | live-api / one-time-download (GPKG/SHP/CSV/GeoJSON) | WFS 2.0.0, 12.288 Bauwerke | **hoch** | **M** |

- **(4) BAYSIS Bauwerke** — `https://gisportal-stmb.bayern.de/server/services/WFS/BAYSIS_Bauwerke/MapServer/WFSServer` bzw. REST `.../MapServer/0/query?f=geojson`. **ACHTUNG DUBLETTEN-PRÜFUNG ZWINGEND VOR UMSETZUNG:** Die Hälfte der Verifikationsläufe meldet diese Quelle als **DUBLETTE zu Bestand-Connector `0123_baysis_bauwerke.js`** (identischer Endpoint, identische Feld-Mappings `maxHoeheM`/`maxGewichtT`/`grundsaetzlicheGstSperre`, vollbestand=true). Die andere Hälfte meldet sie als NEU mit der Begründung, 0123 ziehe nur Straßen-/Verkehrsdaten und der `Bauwerke`-Layer sei un-ingested. **Auflösung: `0123`-Ingest-Code prüfen.** Wenn die Felder `Brückenklasse`/`Grundsätzliche_Schwertransportsperre` dort bereits gemappt sind → keine Aktion. Falls nicht → Layer-Erweiterung am bestehenden Connector, **kein neuer Connector**. Werte real: Brückenklasse durchgängig befüllt ('DIN: 30/60', 'LMM'), GST-Sperre 'vorhanden' bei ~124/12.288, Höhenbeschränkung sparse ('3,60 m'). Brückenklasse NICHT als Tonnage-Proxy nutzen (Revert efcd717, Import-Explosion).

### GST-Auflagen-Netz nach Krangewichtsklasse (stärkster echter Neu-Fund)

| # | Quelle | BL | Datentyp | Bezugsart | Format | Gewinn | Aufwand |
|---|--------|-----|----------|-----------|--------|--------|---------|
| 5 | **LSBB Sachsen-Anhalt — Fahrauflagen GST-Kran-Routennetz** | ST | GST-Auflagen/Negativnetz je Krangewichtsklasse | **one-time-download (ArcGIS REST query, f=json)** | ArcGIS MapServer, 8 Layer × 2.220 Features | **hoch** | **M** |

- **(5) LSBB Fahrauflagen 2018** — `https://www.geodatenportal.sachsen-anhalt.de/arcgis/rest/services/Geofachdaten/LSBB_Fahrauflagen_2018/MapServer`. **Der substantiellste Neu-Fund der Welle 2.** 8 Krangewichtsklassen-Layer (24t–108t), Feld `AUFLAGE` trägt echte eskalierende Restriktion: 'Fahrverbot' (65 Brücken im 108t-Layer, 42 im 96t), '16 - Polizeibegleitung erforderlich', 'Einzelfahrt', '15A - LKW-Überholverbot', 'Klärung im Einzelfall'. Feld `PROJEKT` = Gewichtsklasse, `BW_NAME`/`ORT` + Polygon-Geometrie. **Restriktion eskaliert korrekt mit Krangewicht → direkt engine-evaluierbar** (Fahrverbot→kritisch, Einzelfahrt/Polizeibegleitung→Auflage, Überholverbot→Hinweis). Echte Records: {Elbebrücke Hohenwarthe, A2, 96t, 'LKW-Überholverbot'}. Voll offen abfragbar (NICHT die SN-LASuV-Sackgasse), DL-DE/BY-2.0, maxRecordCount 1 Mio → 1 Pull/Layer. **ST war Top-schwaches Land — substanzieller Coverage-Zugewinn.**

### VZ-Kataster (Wert im Schild-Suffix, Pattern wie 0134/0223)

| # | Quelle | BL | Datentyp | Bezugsart | Format | Gewinn | Aufwand |
|---|--------|-----|----------|-----------|--------|--------|---------|
| 6 | **Leipzig Verkehrszeichen-Kataster** | SN | VZ 262/263/264/265/266 (Gewicht/Achslast/Breite/Höhe/Länge) | live-api (WFS) / one-time (CSV/GeoJSON) | WFS 2.0, EPSG:25833 | **mittel** | **S–M** |
| 7 | **Bremen VMZ — Durchfahrtshöhen** | HB | durchfahrtshöhe | **one-time-download (static GeoJSON)** | GeoJSON, 31 Features | **mittel** | **S** |
| 8 | **Rostock VZ-Kataster — Restriktions-Erweiterung** | MV | VZ 262/263/265/266 (Gewicht/Achslast/Höhe/Länge) | Erweiterung Bestand-Connector | CSV/JSON, 18.219 Features | **niedrig** | **S** |

- **(6) Leipzig-VZ** — `https://geodienste.leipzig.de/l3/OpenData/wfs` (typeName `OpenData:verkehrszeichen`, outputFormat csv/`application/json`), Datensatzseite `https://opendata.leipzig.de/de/dataset/verkehrszeichen-stadt-leipzig`. **WICHTIGER WIDERSPRUCH IN DEN VERIFIKATIONEN:** Die meisten Läufe bestätigen echte Werte (Z265 Höhe in `vz_zus_tx`: '3,9 m (am Brückenbauwerk)', '3,65m', '4,0 m'; Z262 Gewicht in `vz_var`/`vz_bez`: '3,5t', '16t'; Z263 '9t'; Z264 '2m'; ~213–334 Restriktionspunkte). **EIN Lauf widerlegt das explizit** (`LOCATION_ONLY`): `vz_gr` sei nur Schildgröße ('600x600'), kein dediziertes Wertfeld. **Auflösung: Vor Connector-Bau Filter `vz_nr IN (262,263,264,265,266)` gegen Live-WFS fahren und prüfen, ob `vz_var`/`vz_zus_tx`/`vz_bez` den Wert tragen** (Mehrheit der Belege sagt ja). DL-DE/BY-2.0, wöchentlich aktualisiert. **Caveat (Connector-Audit):** makeNormalized darf String-Attribute nicht droppen.

- **(7) Bremen VMZ Durchfahrtshöhen** — `https://vmz.bremen.de/geojson/pois-vertical-clearance.geojson` (HTTP 200, 27.664 B). FeatureCollection, 31 Features (26 mit Point-Geom EPSG:4326, 5 ohne → Adress-Geocode-Fallback wie 0126). Feld `height_restriction` auf allen 31 befüllt + Höhe redundant im `name` ("Gustav-Deetjen-Tunnel: 3,1m", "Findorff-Tunnel: 3,5m"). Werte 3,0–4,0 m. **LIZENZ-CAVEAT:** VMZ-Bremen-Footer = CC BY-NC-ND (nicht-kommerziell, keine Bearbeitung). Faktendaten der Straßenbaubehörde kaum schutzfähig, aber Bereitstellung trägt NC-ND → **kurze Behördenanfrage an ASV Bremen vor kommerziellem Einbacken empfohlen** (analog Sachsen LASuV). Tonnage-/Nachtfahrverbot-Layer NICHT als GeoJSON exponiert (404).

- **(8) Rostock-VZ Erweiterung** — `https://geo.sv.rostock.de/download/opendata/verkehrszeichen/verkehrszeichen.csv` (CC0). **Kein neuer Connector** — Bestand 0223 zieht nur GST-Positivrouten. Restriktionswert im `stvo_nummer`-Suffix (Pattern 0134): Z262 Gewicht 31 Schilder ('262-16t'), Z263 Achslast 2, Z265 Höhe 22 ('265-3,5'), Z266 Länge ~10. **Umsetzung = vz_nr-Allowlist am bestehenden Pull erweitern**, analog HH-0134. Parse-Nuance: inkonsistente Einheiten-Suffixe (z.B. '265-3,5t' bei Höhe falsch) → auf führende StVO-Nummer keyen.

### GST-Streckenkarten mit eingebetteten Restriktions-Labels

| # | Quelle | BL | Datentyp | Bezugsart | Format | Gewinn | Aufwand |
|---|--------|-----|----------|-----------|--------|--------|---------|
| 9 | **BW Großraum-/Schwerlaststreckenkarte (Verkehrsministerium)** | BW | gst-routennetz (lichte Höhe + Tonnage je Korridor) | **one-time-download (PDF)** | PDF, Textlayer parsebar | **niedrig–mittel** | **M** |
| 9b | **Hessen GST-Positivkarten je Landkreis** | HE | gst-routennetz nach Gewichtsklasse | **one-time-download (Vektor-PDF)** | PDF (gelayert, MapInfo) | **mittel** | **L** |

- **(9) BW-Streckenkarte** — `https://vm.baden-wuerttemberg.de/fileadmin/redaktion/m-mvi/intern/Dateien/MobiZ/GrossraumSchwerlaststreckenkarteBW.pdf` (3,7 MB). **WIDERSPRUCH:** Mehrere Läufe extrahieren via `pdftotext -layout` 11 explizite Labels "Lichte Höhe X,XX m, YYY t" (4,40–7,00 m / 80/218/290 t) mit Routen-Anker + Ortsnamen. **EIN Lauf** meldet die Datei als gescanntes Rasterbild/location-only. Datei trägt laut Mehrheit Adobe-PDF-Textlayer → parsebar. **BW war als schwächstes Land markiert.** Restriktion route-verankert (benannte Endpunkte, keine Koordinaten-Geometrie) → eher Enabler-Netz als Punkt-Hindernis, daher Gewinn niedrig–mittel.

- **(9b) Hessen GST-Positivkarten** — `https://mobil.hessen.de/verkehr/grossraum-und-schwertransporte/positivkarten`. Vektor-PDF je Landkreis nach Gewichtsklasse 36/48/60/72t + Höhenvariante "bis 4,20m". Dateimuster `/sites/mobil.hessen.de/files/2023-03/<landkreis>_<36|48|60|72>t[_h].pdf`. Eingebettete OCG-Layer (Autobahnen/Bundes-/Land-/Kreisstraßen, TK_Gitter, geo_höhe) + echter Text (Ortsnamen, Netzknotennummern). **Distinkt von 0126** (0126 = Tabelle; dies = Linien-Routennetz). Aufwand L wegen Linienextraktion + Georeferenzierung über TK_Gitter-Passpunkte.

> **Ebenfalls neu (gleiche Klasse, separat dokumentiert):** Hessen Mobil "Breiten für GST in Baustellen" PDF `https://mobil.hessen.de/sites/mobil.hessen.de/files/2026-06/20260612_baustellenliste-b.pdf` (Stand 19.06.2026, 48 B-Straßen-Arbeitsstellen, Breiten 3,00–6,50 m / Vollsperrung). Parsebar wie 0126, **distinkt von 0126**. Sachsen-Anhalt ifak Sperrinfo-WFS `https://service.ifak.eu/sperrinfo/wfs` (BAB-Durchfahrtsbreiten) — **WIDERSPRUCH:** ein Lauf NEU_NUTZBAR (Felder `bab_direction1/2_width` mit GeoJSON/CSV-Output), zwei Läufe LOCATION_ONLY (Breitenfelder in 0/171 Live-Features gefüllt) → **vor Umsetzung Live-Fill-Rate gegen BAB-Baustellen prüfen.**

### OSM-Beschränkungs-Tags — flächige Schicht für die Schwachländer

| # | Quelle | BL | Datentyp | Bezugsart | Format | Gewinn | Aufwand |
|---|--------|-----|----------|-----------|--------|--------|---------|
| 10 | **OSM maxheight/maxweight/maxwidth via Overpass** | alle, v.a. SH/NI/MV/BB/HB/SL/ST/TH/RP/BW | Höhe/Gewicht/Breite/Achslast an Brücken/Tunneln | **one-time-download (Overpass-Export, lokal einbacken)** | Overpass QL → GeoJSON | **hoch (potenziell)** | **M** |

- **(10) OSM-Tags** — `https://overpass-api.de/api/interpreter`. **Eingeschränkt durch Brain-Veto BKG/OSM.** Real verifiziert: SH 2.450 ways mit maxheight, NI 19.315 ways mit (maxweight OR maxheight), MV 1.766, BB 3.056, HB 1.266, SL 1.307. Echte Werte (SL verbatim: maxheight 3.6/3.8, maxweight 3.5/2.8). **Wichtig:** Geofabrik FREE shp/gpkg-Schema (`gis_osm_roads`) trägt KEINE maxweight/maxheight-Spalte — Werte liegen nur im PBF-Tag-Rohbestand oder via Overpass. **Das OSM-Veto galt nur dem reinen Bauwerk-Inventar; die *-Tags sind die einzige flächige Restriktionsschicht für HB/SL/MV/NI/SH/BB**, die keine offene attributierte Landesquelle haben. **Entscheidung Max:** als ergänzende, nicht-autoritative Schicht je Land einbacken (wie 0126), oder Veto aufrechterhalten. Caveat: urbane Parkhaus-Unterführungen filtern; crowdsourced; ST/TH/SH timeouten auf öffentlicher Overpass-Instanz → je Land splitten oder Geofabrik-PBF lokal filtern.

---

## 2. Behördenanfrage-Kandidaten (wertvoll, aber verschlossen)

| Quelle | BL | Warum verschlossen | Hebel |
|--------|-----|--------------------|-------|
| **BKG "Begrenzungen im Straßenverkehr"** (`wms_begrenzstrassenv`) | bundesweit | **LOGIN_VERTRAG.** Inhaltlich ideal (Durchfahrtshöhe + Breite + zul. Gesamtgewicht für Brücken/Unterführungen, bundesweit). Aber: nur WMS-Raster (keine Feature-Werte), HERE/Logiball-lizenziert, Zugang nur Bundesbehörden + Zuwendungsempfänger §4 V-GeoBund. GetCapabilities 403. Setreo (privat) nicht zugangsberechtigt. | Doppelt disqualifiziert (kein offener Zugang + keine maschinellen Werte). Kein realistischer Hebel ohne Behördenstatus. |
| **VMZ Bremen Durchfahrtshöhen — Lizenz** (Fund #7) | HB | Daten technisch offen abrufbar, aber CC BY-NC-ND (Bereitstellung). | **Kurze Anfrage an ASV Bremen** für kommerzielle Freigabe der Faktendaten. |
| **Sachsen LASuV GST-Negativkarten** (Welle 1, bestätigt) | SN | GeoViewer-verschlossen; TT-SIB WMS `guest` (`https://www.list.smwa.sachsen.de/wss/service/ttsib-wms/guest`) führt KEINEN Bauwerke-Layer (Re-Capabilities-Check widerlegt Welle-1-Hypothese), nur Netz/Zähldaten. Kein WFS. | Behördenanfrage einziger Weg für SN-Negativnetz. |
| **Sachsen-Anhalt LSBB Bauwerksdaten/Bürgerauskunft** | ST | Viewer-only, pro Bauwerk nur Zustandsnote/Lage/Fläche, kein Last-/Höhenfeld, Download nur per kostenpflichtigem Antrag. | (Fahrauflagen-Netz #5 ist der offene ST-Hebel; Bauwerks-Tonnage bleibt Anfrage.) |
| **TLBV Thüringen "Tragfähigkeit"** (SIB-Bauwerke/Traglastindex) | TH | Internes SIB, kein Open-Download. | Behördenanfrage. |
| **NWSIB-NI "für Dritte"** (Welle 1) | NI | WMS location-only, vertrags-gated. | (Baustellenliste #2 ist der offene NI-Hebel.) |

---

## 3. Bestätigte Sackgassen Welle 2 (knapp)

- **BASt Zustandsnoten-XLSX / Brückenstatistik-CSV** — real geparst: nur Zustandsnote (1,0–4,0) + Traglastindex (I–V), keine Koordinaten, keine Tonnage/BK/Höhe. `trag_l_idx` ≠ Tonnage. Nicht-räumliche Teilmenge des bereits vorhandenen FeatureServers (Fund #3). **DUBLETTE/location-only.**
- **GDI-SBV Sachsen Straßennetz-GeoPackage** (`list.smwa.sachsen.de/.../Strassennetz-Netzknoten`) — real entpackt: nur Netz-/Topologie-Layer (klasse, vnk/nnk), kein Bauwerks-/Restriktionsfeld. **location-only.**
- **Hamburg LSBG "Brücken u. Ingenieurbauwerke"** (Transparenzportal CSV/GeoJSON/GML) — real entpackt: nur Bauwerksnummer/-art/Baujahr/Baulast(=Baulastträger, false friend), keine Höhe/Last/BK. HH ohnehin via 0134 gedeckt. **location-only.**
- **Hamburg/Berlin GST-Routennetze** (`api.hamburg.de` OGC, `gdi.berlin.de` Straßenbefahrung) — Routenkorridore bzw. bereits Bestand 0133. **location-only/DUBLETTE.**
- **Sachsen-Anhalt ALRIS Verkehrsschilder FeatureServer** — 9.520 Features, aber `ZEICHEN`-Feld nur Lenk-/Zonen-/Wegweiser-Zeichen; Query auf Z262–266 = 0 Treffer. **kein Restriktionswert.**
- **NI/BW Großraum-Karten als Raster-PDF** (NLStBV 1:250.000, 42–44 MB) — gescannte Übersichtskarten ohne parsbare Tabelle (anders als Hessen-0126). **location-only** (BW-Streckenkarte #9 ist die Ausnahme mit Textlayer).
- **xDataToGo / MMVNet (mFUND)** — Prozessmodelle/Prototypen, kein publizierter Datensatz. Beleg, dass kommunale Restriktionsdaten existieren → nur via IFG erschließbar. **TOT_LEER.**
- **CORRECTIV/SZ/ZEIT "marode Brücken"** — leiten alle auf BASt-Zustandsnote zurück; ZEIT-Daten = Eisenbahnbrücken (Schiene, außer Scope). **location/condition-only.**
- **difu "Geodatenbank aller Brücken"** — OSM-abgeleitet (nur Länge/Fläche für Kostenschätzung) + OSM-Veto. **Sackgasse.**
- **DB "Geo-Brücke" ArcGIS** — delisted (HTTP 404). **TOT.**
- **Bremen/Saarland/MV/SH/TH/RLP Landes-Geoportale** — Geobasis/ATKIS/ALKIS, kein Restriktionslayer. Bestätigt Welle-1-Befund "alle 10 Landes-WFS location-only".
- **Saarland LfS Baustellenliste-PDF** — real (Akamai-Bot-Wall, Browser=200), aber Durchfahrtsbreite-Spalte leer; nur 2 Freitext-GST-Treffer (B41 Johannisbrücke 3,25 m/3,5t-Sperre, L176 Mettlach). Sehr dünn, zeitgebunden → **niedrig** (grenzwertig NEU, faktisch kaum verwertbar).
- **data.europa "Bridge heights/deck heights"** — Finnland (SYKE) bzw. Schweden (Trafikverket), nicht DE. **irrelevant.**
- **Heidelberg/München kommunale VZ-Kataster** — nur Park/Halt bzw. Umweltzone, kein Z262–266. **location-only.**

---

## 4. Konsolidiertes Gesamtbild Welle 1+2

### Rote Zellen, die jetzt real bewegt werden können

| Bundesland | Vorher (W1) | Jetzt bewegbar durch (W2) | Restriktionstyp |
|------------|-------------|---------------------------|-----------------|
| **HB** (schwächstes) | Null-Abdeckung (nur Mobilithek-Idee, NC) | **#1 ASV-PDF** (Tonnage + Brücken-t + Höhen), **#7 VMZ-GeoJSON** (Höhe) | gewicht + durchfahrtshöhe |
| **NI** | NWSIB location-only/gated | **#2 Baustellenliste** (Breite + Vollsperrung + Last) | breite + GST-Sperre |
| **ST** | LSBB Viewer-only | **#5 Fahrauflagen-Netz** (Kran-Gewichtsklassen, Fahrverbot/Einzelfahrt) | GST-Auflagen-Netz |
| **SN** | LASuV viewer-locked | **#6 Leipzig-VZ** (Höhe/Gewicht/Achslast/Breite, vorbehaltlich Wert-Check) | VZ-Restriktionen |
| **MV** | nur Rostock-GST-Positiv | **#8 Rostock-VZ-Erweiterung** (Gewicht/Höhe/Länge) | VZ-Restriktionen |
| **BY** | 0123 (Verkehr) | **#4 BAYSIS Bauwerke** (BK + GST-Sperre + Höhe) — *vorbehaltlich 0123-Dubletten-Check* | brücke/BK/GST-Sperre |
| **HE** | 0126 (Tabelle) | **#9b Positivkarten** + Baustellen-Breiten-PDF | gst-routennetz + breite |
| **BW** (schwach) | nur MobiData (Verkehr) | **#9 Streckenkarte-PDF** (Höhe + Tonnage je Korridor) | gst-routennetz |
| **alle 15** | — | **#3 BASt FeatureServer** breite-Feld neu + URL-Fix; **#10 OSM-Tags** (falls Veto fällt) | brücke-Breite + GST-Sperre; flächig Höhe/Gewicht/Breite |

### Was strukturell zu bleibt

- **Maßgenaue Tonnage (zulässiges Gesamtgewicht in t je Bauwerk)** — bleibt verschlossen außerhalb der Quellen, die es ohnehin tragen (BAYSIS-Brückenklasse als Proxy, Bremen-PDF kommunal, Mobilithek-Baustellen). Die autoritativen statewide-Tonnagen liegen in **VEMAGS/SIB-Bauwerke** (Login-Wall / Behördenantrag). Welle 2 hat das **nicht** geknackt — alle BASt-Familie führt nur Index/Zustandsnote, kein t-Wert.
- **Tunnel-Restriktionen (Durchfahrtshöhe/-breite/Gefahrgut je Tunnel)** — bleibt der schwächste Layer. Außer punktuell (BAYSIS Tunnel/Trog 4/12.288, Bremen-VMZ-Tunnel, VZ-Z265 an Tunnelportalen) gibt es **keinen systematischen Tunnel-Maßkatalog** als Open Data. BMV-ADR-Liste = nur Gefahrgut-Kategorie ohne Maße (W1-Sackgasse).
- **Flächige Brückenklasse außerhalb BY** — kein anderes Land exponiert die DIN-1072-BK offen wie BAYSIS. Restliche Länder nur über sperrung_sv (binär) + OSM (crowdsourced) abdeckbar.

---

## 5. Aktualisiertes Fazit zur These

**Präzisierte These (Welle 1): "Maßgenaue Tonnage = VEMAGS-zu; binäre/SV-Sperrung = offen."**

**Welle 2 bestätigt diese These weiter und schärft sie an zwei Punkten — ohne sie zu brechen:**

1. **Die VEMAGS-Wand hält.** Kein einziger Welle-2-Fund liefert maßgenaue Pro-Bauwerk-Tonnagen statewide aus offener Quelle. Die BASt-Familie (XLSX/CSV/FeatureServer) wurde dreifach gegengeprüft: nur Index + binäres `sperrung_sv` + jetzt `breite`. BKG-Begrenzstrassenv (das einzige bundesweite Maß-Dataset) ist Vertrags-/Behörden-gated und nur Raster. **Bestätigt.**

2. **Neuer Riss — aber kein Tonnage-Riss, sondern ein Auflagen-Riss (positiv):** Der **LSBB-ST-Fahrauflagen-Fund (#5)** zeigt eine **dritte, evaluierbare Restriktionsklasse jenseits von binär-SV und maßgenau-Tonnage**: behördlich vergebene **GST-Auflagen je Krangewichtsklasse** (Fahrverbot/Einzelfahrt/Polizeibegleitung/Überholverbot). Das ist offen, georeferenziert und engine-evaluierbar — und es ist näher an der tatsächlichen Genehmigungs-Realität als eine reine Tonnenzahl. **Erweiterung der These:** Neben "binär offen / maßgenau zu" existiert eine **mittlere Schicht — staatlich kuratierte GST-Auflagen-Netze — die punktuell offen ist** (bisher nur ST verifiziert; SN/SH-Pendants viewer-locked).

3. **Schärfung beim "binär offen":** Die offene binäre Schicht ist breiter als gedacht — nicht nur `sperrung_sv`, sondern auch (a) Brückenbreite (BASt, neu), (b) BAYSIS GST-Sperre-Flag + Brückenklasse, (c) kommunale VZ-Kataster mit echten m/t-Werten in mehreren Schwachländern, (d) Baustellen-Breiten/Vollsperrungen (NI/HE). **Die Abdeckung der Schwachländer HB/NI/ST/SN/MV/BW lässt sich mit Welle-2-Funden real anheben** — alle über statische/One-Time-Pulls im bewährten 0126-Muster.

**Netto:** Die These bleibt korrekt. Welle 2 hat die maßgenaue Tonnage **nicht** geöffnet (erwartungskonform), aber den **binär/teilquantitativen Layer in 6 Schwachländern materiell aufgefüllt** und mit dem ST-Auflagen-Netz eine neue, wertvolle Zwischenkategorie freigelegt. Strukturell zu bleiben: maßgenaue Tonnage statewide + systematischer Tunnel-Maßkatalog.

---

**Empfohlene Umsetzungsreihenfolge (Quick Wins first):**
1. **#1 Bremen ASV-PDF** + **#2 NI-Baustellenliste** (beide S, hoher Gewinn, 0126-Muster, schließen die zwei rotesten Zellen HB/NI)
2. **#5 LSBB-ST-Fahrauflagen** (M, hoher Gewinn, neuer Auflagen-Typ)
3. **#3 BASt breite-Feld + URL-Fix** (bestehende Quelle, geringe Ergänzung)
4. **#4 BAYSIS Bauwerke** — *erst 0123-Dubletten-Check*, dann ggf. Layer-Erweiterung
5. **#6 Leipzig-VZ** (erst Wert-Check `vz_nr IN(262..266)`), **#8 Rostock-VZ-Allowlist** (Connector-Erweiterung)
6. **#7 Bremen-VMZ** (erst NC-ND-Klärung ASV), **#9/#9b** BW/HE-Streckenkarten (höherer Parse-Aufwand)
7. **#10 OSM-Tags** — Max-Entscheidung zum Veto erforderlich
