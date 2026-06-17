# T-090 — Gap-Analyse + freie Quellen

*Stand: 2026-06-17. Basis: IST-Abdeckungsmatrix aus dem Connector-Code (`server/src/connectors/*.js`, `index.js` CONNECTORS-Array, `mobilithek.js` Feeds 0140–0146, Migrationen `*quelle*.sql`) + Quellen-Research je Bundesland.*

---

## Executive Summary

**Wo wir stehen.** Die Plattform deckt Baustellen flächendeckend ab — 14 von 16 Ländern haben eine landesweite, strukturierte Baustellenquelle (eigener WFS/API oder Mobilithek-Abo). Die bundesweite Basisschicht (0001 Autobahn-Baustellen, 0150 BAB-Lastbrücken mit Gewicht+Höhe, 0303 GST-WSV-Brücken) garantiert in *jedem* Land mindestens „teilweise"-Abdeckung bei Baustellen, Brücken und GST. Das ist ein solides Fundament.

**Wo die echten Lücken sind.** Die schwertransport-kritischen Bauwerks-Kategorien — Brücken-Lastwerte, Durchfahrtshöhe, Tunnel-Inventar, GST-Negativnetz — sind dünn und föderal stark fragmentiert. Landesweite Brücken *mit* Gewichtswerten gibt es nur in vier Ländern (Bayern 0123, NRW 0124, Hessen 0126, Sachsen 0121). Eine landesweite Durchfahrtshöhen-Quelle hat — Stand IST — *kein* Land eigenständig; Höhe kommt nur aus BAB (0150), BAYSIS (BY) oder Stadtschildern (Leipzig). Tunnel-Inventare existieren landesweit/stadtweit nur in BY, Berlin, Hamburg.

**Was der Research ändert.** Die Recherche hebt drei echte, sofort baubare Funde, die genau in die harten Lücken zielen:
1. **Bayern BAYSIS-Bauwerke-WFS** schließt in *einem* Pull Brücke+Gewicht, Höhe, Tunnel und GST — und ersetzt die heutige (vermutlich PDF-/Migration-basierte) 0123-Quelle durch einen sauberen Live-WFS mit den Feldern `Hoehenbeschraenkung`, `Gewichtsbeschraenkung`, `Brueckenklasse`, `Grundsaetzliche_Schwertransportsperre`.
2. **Hamburg Verkehrszeichen-WFS** liefert erstmals echte beschilderte Höhen- (Z265) und Gewichts-/Achslast-Limits (Z262/263/264) — schließt den HH-Höhen-Gap systematisch, frei (dl-de/by).
3. **Berlin Durchfahrtshöhe-WFS** (Straßenbefahrung 2014) bringt 23.201 fahrstreifenscharfe Höhenpunkte mit realen Maßen — das erste echte Landes-Höhenkataster überhaupt, frei (dl-de/zero).

**Größter Hebel.** Bayern BAYSIS ist der mit Abstand größte Einzelhebel: ein WFS, vier Kategorien, vier Bundesland-Felder von „teilweise/nein" potenziell auf „ja". Dahinter folgen NRW (last_bruecken1 + Autokran-Negativlisten als echtes GST-Negativnetz) und die Höhen-WFS in Berlin/Hamburg. Alles andere ist entweder bereits abgedeckt (Baustellen) oder strukturell verschlossen (SIB-Bauwerke/VEMAGS — verwaltungsintern, kein Open Data).

**Die ehrliche Grenze.** Außerhalb von Bayern, NRW, Hessen, Sachsen (+ punktuell HH/Berlin) ist Brücken-Last, Höhe, Tunnel und GST-Negativnetz **flächendeckend nicht über Open Data abbildbar**. Die Daten existieren — sie liegen in SIB-Bauwerke (DIN 1076) und VEMAGS, beide verwaltungsintern. Dort bleibt nur die bundesweite Autobahn-/WSV-Schicht plus formelle Datenanfrage. Das deckt sich exakt mit dem Brain-Befund `abdeckung-100-plan`.

---

## Abdeckungs-Matrix (IST)

Legende: **ja** = landesweite strukturierte Quelle · **teilweise** = nur BAB/WSV-Basis (0001/0150/0303), Stadt-Granularität oder Freitext-Ableitung · **nein** = keine Quelle.

| Bundesland | Baustellen | Brücken/Gewicht | Höhe | Tunnel | GST |
|---|---|---|---|---|---|
| Baden-Württemberg | ja | teilweise | teilweise | teilweise | teilweise |
| Bayern | teilweise | ja | ja | ja | ja |
| Berlin | ja | teilweise | teilweise | ja | teilweise |
| Brandenburg | ja | teilweise | teilweise | nein | teilweise |
| Bremen | ja | teilweise | teilweise | nein | teilweise |
| Hamburg | ja | teilweise | teilweise | ja | ja |
| Hessen | ja | ja | teilweise | nein | ja |
| Mecklenburg-Vorpommern | ja | teilweise | teilweise | teilweise | teilweise |
| Niedersachsen | ja | teilweise | teilweise | nein | teilweise |
| Nordrhein-Westfalen | ja | ja | teilweise | teilweise | ja |
| Rheinland-Pfalz | ja | teilweise | teilweise | nein | teilweise |
| Saarland | ja | teilweise | teilweise | nein | teilweise |
| Sachsen | ja | ja | teilweise | teilweise | ja |
| Sachsen-Anhalt | ja | teilweise | teilweise | nein | teilweise |
| Schleswig-Holstein | ja | teilweise | teilweise | nein | teilweise |
| Thüringen | ja | teilweise | teilweise | nein | teilweise |

**Verdichtung je Kategorie:**
- **Baustellen:** 15× ja, 1× teilweise (nur Bayern — hängt an BAB+Städten, keine landesweite Liste).
- **Brücken/Gewicht:** 4× ja (BY/NRW/HE/SN), 12× teilweise. Keine „nein".
- **Höhe:** 1× ja (BY), 15× teilweise. Höhe ist die schwächste Bauwerks-Kategorie.
- **Tunnel:** 3× ja/teilweise mit Inventar (BY/Berlin/HH), 4× teilweise (Stadt), 9× nein.
- **GST:** 5× ja (BY/HH/NRW/HE/SN), 11× teilweise.

---

## Direkt anbindbare freie Quellen (priorisiert)

Nur Funde mit `direkt_anbindbar = ja` oder `mit-Aufwand`. Sortiert nach Nutzen (echter Gap-Closer zuerst, Vollständigkeits-/Bereits-abgedeckt zuletzt).

| Bundesland | Kategorie | Quelle | Endpoint | Format | Lizenz | Aufwand |
|---|---|---|---|---|---|---|
| Bayern | Brücke/Gewicht + Höhe + Tunnel + GST | BAYSIS Bauwerke (StMB) — Felder Hoehenbeschraenkung, Gewichtsbeschraenkung, Brueckenklasse, Grundsaetzliche_Schwertransportsperre | `gisportal-stmb.bayern.de/server/services/WFS/BAYSIS_Bauwerke/MapServer/WFSServer` | WFS 2.0.0 (GeoJSON/GML), Layer `bauwerke` | CC-BY 4.0, kein Login | **ja** (1 Pull, 4 Kategorien) |
| Berlin | Höhe | Straßenbefahrung 2014 — Durchfahrtshöhe (GDI-BE) | `gdi.berlin.de/services/wfs/strassenbefahrung` (TypeName `strassenbefahrung:al_durchfahrtshoehe`) | WFS 2.0.0 (GeoJSON/GML) | dl-de/zero-2.0 | **ja** (23.201 Pkt, Feld `hoehe`) |
| Hamburg | Höhe | Verkehrszeichen HH (LGV) — Filter `vz_nr=265` (Z265) | `geodienste.hamburg.de/wfs_verkehrszeichen` | WFS 2.0.0 | dl-de/by-2.0 | **ja** (Freitext-Parser für `variabler_text`) |
| Hamburg | Brücke/Gewicht | Verkehrszeichen HH (LGV) — Filter `vz_nr=262/263/264` (Gewicht/Achslast/Breite) | `geodienste.hamburg.de/wfs_verkehrszeichen` | WFS 2.0.0 | dl-de/by-2.0 | **ja** (Freitext-Parser) |
| NRW | Brücke/Gewicht | Straßen.NRW — Lastbeschränkte Brücken (Schwertransportkarte) | `arcgishostedserver.nrw.de/arcgis/rest/services/Hosted/last_bruecken1/FeatureServer/0` (`/query?where=1=1&f=geojson`) | ArcGIS-REST | other-open (open.nrw) | **mit-Aufwand** (von DE-IP verifizieren — US-Egress 500/Timeout) |
| NRW | GST | Straßen.NRW — Negativliste 36t Autokran | `arcgishostedserver.nrw.de/arcgis/rest/services/Hosted/Negativliste_36t_AK/FeatureServer/17` | ArcGIS-REST | other-open | **mit-Aufwand** (gleiches Gateway-Caveat) |
| NRW | GST | Straßen.NRW — Negativliste 48t Autokran | über open.nrw App-Item → FeatureServer auflösen (analog 36t) | ArcGIS-REST | other-open | **mit-Aufwand** (App-Item-Resolve nötig) |
| Hamburg | GST | GST-Routen HH (LBV) — Live-Endpoint statt Archiv-Snapshot | `geodienste.hamburg.de/HH_WFS_Grossraum_und_Schwertransport_Routen` (FT `de.hh.up:grossraum_schwertransport_netz`) | WFS 2.0.0 | dl-de/by-2.0 | **ja** (0150 von Archiv-URL auf Live umstellen) |
| Rheinland-Pfalz | GST | Mobilitätsatlas RLP / SPERRINFOSYS — Attribut `typ=N` (LKW-/Schwerverkehrssperre) explizit auswerten | `maps.mobilitaetsatlas.de/geoserver/ows` (TypeName `mwvlw:baustelle`) | WFS 2.0.0 (GeoJSON) | dl-de/by-2.0 | **ja** (kein neuer Connector — Feld-Mapping in 0129 schärfen) |
| Bayern | Baustellen | BayernInfo / VIZ-BY (ArbIS) — landesweite Baustellen aller Straßenklassen | Distribution via Mobilithek (mobilithek.info) | DATEX-II XML (Roadworks) | frei, teils Datenüberlassungsvertrag | **mit-Aufwand** (Mobilithek-Abo/Freigabe, kein neuer Connector-Typ) |
| Sachsen | Brücke/Gewicht | GDI-SBV — TT-SIB Gast-WMS, Layer `Bauwerke` (Brücken+Stützbauwerke) | `list.smwa.sachsen.de/wss/service/ttsib-wms/guest` | WMS 1.3.0 (GetFeatureInfo) | dl-de/by-2.0 | **mit-Aufwand** (GetFeatureInfo pro Korridor-Tile; Attribut-Ertrag am 1. Treffer prüfen) |
| Bayern | Baustellen (Kontext) | BAYSIS Fachnetze — Bedarfsumleitungen Bundesfernstraßen | `gisportal-stmb.bayern.de/server/services/WFS/BAYSIS_Fachnetze/MapServer/WFSServer` | WFS 2.0.0 | CC-BY 4.0 | **ja** (geringer ROI, Kontext-Layer) |
| Hamburg | Baustellen (Kontext) | Bedarfsumleitungen HH (BWVI) — Z460/Z455 | `geodienste.hamburg.de/HH_WFS_Bedarfsumleitungen` | WFS 2.0.0 | dl-de/by-2.0 | **ja** (optional, Baustellen bereits abgedeckt) |

**Bereits abgedeckt / nur Vollständigkeit (kein neuer Hebel):** M-V Baustellen-WFS (`geodaten-mv.de/dienste/wfs_baustellenmv`, frei), Sachsen-Anhalt ifak Sperrinfo (`service.ifak.eu/sperrinfo/wfs` — **non-commercial-Lizenz = Blocker für kommerzielles Setreo-Produkt**), TH baustellen.tlbv.de (=0131). Diese liefern keinen Mehrwert für die harten Gaps und/oder sind lizenzblockiert.

---

## Strukturelle Lücken ohne freie Quelle

Hier gibt Open Data nichts her. Ehrlich benannt, damit kein Aufwand in Sackgassen fließt.

**Das wiederkehrende Muster:** Die fachlich richtigen Daten (Brücken-Tragfähigkeit, lichte Höhe, GST-Negativnetz) leben in **SIB-Bauwerke (DIN 1076)** und **VEMAGS** — beide verwaltungsintern, kein offener Endpoint. Zugang nur über formelle Datenanfrage (~6–12 Monate Behördenarbeit) oder das Genehmigungsverfahren. Das ist Beschaffung, kein Connector.

| Land(er) | Kategorie | Befund |
|---|---|---|
| BW | Brücke/Last, Höhe, Tunnel, GST | LUBW-Bauwerksinventar (Shapefile, frei) hat NUR Geometrie+Typ, keine Restriktionswerte. Lastdaten in SIB-BW (verschlossen). GST nur als PDF-Übersichtskarte. |
| Brandenburg | Brücke/Last, Höhe, Tunnel, GST | BBSIB-Bauwerke nur per E-Mail-Datenabgabe. Straßennetz-WFS ohne Bauwerksattribute. ATKIS-Höhen nicht belastbar gepflegt. Kein Tunnel-Inventar. |
| Bremen | Brücke/Last, Höhe, Tunnel, GST | TT-SIB-Straßennetz (frei) ohne Restriktionsfelder. VMZ-LKW-Karte führt Höhe/Tonnage, aber nur als mapsight-View ohne abrufbaren Endpoint (Scraping fragil). Kein Tunnel. GST nur 1 prosaische Route (CC BY-NC-ND). |
| Hessen | Höhe, Tunnel | Brücken-Last vorhanden (0126 PDF), aber Höhe nur 0150, kein Tunnel-Inventar. ATKIS/Geoportal ohne Höhen-/Lastattribut. |
| Niedersachsen | Brücke/Last, Höhe, Tunnel, GST | NWSIB nur WMS (location-only, kein WFS). NLStBV-Open-Data = 0 Treffer für Brücke/Last/Höhe/Tunnel/GST. GST nur 42-MB-PDF-Karte. |
| NRW | Höhe, Tunnel | ms:Bauwerke-WFS (frei) führt keine Höhe/Last — nur Standort+Typ. Nicht-BAB-Höhe/Tunnel-Profil über Open Data nicht erreichbar. |
| Rheinland-Pfalz | Brücke/Last, Höhe, Tunnel | 5.700 Brücken / 28 Tunnel — alles in SIB-Bauwerke (verschlossen). Geoportal-WFS ohne Restriktionsfelder. |
| Saarland | Brücke/Last, Höhe, Tunnel, GST | Verkehr-WFS (frei) ohne Bauwerks-/Höhen-/Lastlayer. Negativliste verwaltungsintern. Open-Data-Portal SL erst Q4/2026 (Beobachtungskandidat). |
| Sachsen | Höhe, Tunnel, GST-Netz | Vektor-WFS mit echten Attributen ist SVN/KDN-gesperrt (403 aus dem Internet). GST-Negativkarten nur als Viewer ohne Download. Bauwerke-Layer nur via WMS-GetFeatureInfo. |
| Sachsen-Anhalt | Brücke/Last, Höhe, Tunnel, GST | LSBB-Viewer führt Durchfahrtshöhen-Layer (seltener Fund!) + Bauwerke, aber Backing-Service login-gated (HTTP 303). Bauwerks-Attribut = nur Zustandsnote, keine Tonnage. ifak-Baustellen non-commercial. |
| Schleswig-Holstein | Brücke/Last, Höhe, Tunnel, GST | CKAN 0 Treffer für Durchfahrtshöhe/Tunnel. Straßeninfo-WFS nur Topologie. GST über VEMAGS. |
| Thüringen | Brücke/Last, Höhe, Tunnel, GST | STRNETZ + INSPIRE-WFS ohne RestrictionForVehicles/Bridge. Nur 3 Tunnel (Bestandszahl, keine Geodaten). GST nur VEMAGS. |
| Berlin | Brücke/Last, GST | Detailnetz-Bauwerke (0116) nur Standort, kein Lastfeld. GST-Netz VEMAGS-intern. (Höhe & Tunnel hingegen frei lösbar — s.o.) |
| M-V | Brücke/Last (Land), GST (Land) | Nur Rostock-Stadt (0223). Landesweit nichts Freies; Land-WFS lizenzblockiert (nur private Nutzung). |
| bundesweit | Höhe/Last allgemein | BKG-Produkt „Begrenzungen im Straßenverkehr" wäre fachlich passend, fällt aber unter das bestehende **BKG/OSM-Veto** → nicht nutzen. |

**Kernaussage:** Außerhalb BY/NRW/HE/SN (+ punktuell HH/Berlin für Höhe/Tunnel) ist die schwertransport-kritische Bauwerksschicht über Open Data nicht zu schließen. Realistischer Restweg dort: Mobilithek-Abos (Baustellen) + formelle SIB-Datenanfragen (Beschaffung, nicht Code).

---

## Empfohlene nächste Connectoren (Top 8, nach Nutzen × Aufwand)

| # | Connector | Land/Kategorie | Hebel | Aufwand | Begründung |
|---|---|---|---|---|---|
| 1 | **BAYSIS Bauwerke WFS** | BY — Brücke/Gewicht+Höhe+Tunnel+GST | sehr hoch | niedrig (1 WFS-Pull) | Größter Einzelhebel: 4 Kategorien in einem freien CC-BY-WFS mit exakt passenden Feldern. Ersetzt/härtet 0123 auf Live-Endpoint. **Sofort bauen.** |
| 2 | **RLP `typ=N`-Mapping** | RLP — GST | hoch | sehr niedrig | Kein neuer Connector — nur Feld-Mapping in 0129 (`typ=N`→`gst`/`sperrung`). Macht das RLP-LKW-Negativnetz aus bereits gezogenen Daten strukturiert. Schnellster Win. |
| 3 | **Berlin Durchfahrtshöhe WFS** | Berlin — Höhe | hoch | niedrig | 23.201 fahrstreifenscharfe Höhenpunkte, dl-de/zero, Feld `hoehe`. Erstes echtes Landes-Höhenkataster. Hebt Berlin-Höhe „teilweise"→„ja". |
| 4 | **Hamburg Verkehrszeichen WFS** | HH — Höhe + Gewicht | hoch | niedrig-mittel | Z265/262/263/264 als Punkte; einzige freie systematische Quelle für beschilderte Höhen-/Gewichtslimits in HH. Freitext-Parser nötig (wie posList). |
| 5 | **NRW last_bruecken1** | NRW — Brücke/Gewicht | hoch | mittel | Zentraler GST-Lastbrücken-Datensatz (Straßen.NRW + Autobahn GmbH). Gateway-Caveat: Feldliste/Count von DE-IP verifizieren. Härtet 0124. |
| 6 | **NRW Autokran-Negativlisten (36t/48t)** | NRW — GST | mittel-hoch | mittel | Echtes GST-Negativnetz für genehmigungsfreie Autokran-Konfigs. 48t-FeatureServer über App-Item auflösen. Gleiches Gateway-Caveat. |
| 7 | **Hamburg GST-Routen Live-WFS** | HH — GST | mittel | niedrig | 0150 von Archiv-Snapshot auf Live-Endpoint umstellen — Aktualitätsgewinn ohne neuen Connector-Typ. |
| 8 | **Bayern BayernInfo Baustellen (Mobilithek)** | BY — Baustellen | mittel | mittel (Abo/Freigabe) | Schließt die einzige Baustellen-„teilweise"-Lücke (Bayern landesweit alle Straßenklassen). DATEX-II → passt zum bestehenden Mobilithek-Connector. |

**Bewusst NICHT empfohlen:** Sachsen TT-SIB-WMS (GetFeatureInfo-Connector, unsicherer Attribut-Ertrag — erst 1. Treffer prüfen, dann entscheiden); LUBW/BISStra/BASt-Netze (frei, aber ohne Restriktionsattribute = kein Gap-Closer); ifak Sachsen-Anhalt (non-commercial-Blocker); alle SIB-Bauwerke/VEMAGS-Quellen (verschlossen → Beschaffung, kein Connector).

---

*Konsistent mit Brain-Notes: `abdeckung-100-plan`, `bruecke-tunnel-research`, `freie-quellen-bruecke-tunnel-mobilithek`, `baustellen-quellen-audit`.*
