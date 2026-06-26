# Datenquellen-Katalog — LÄNDER WEST (NRW, Hessen, RLP, Saarland)

> **Projekt:** Roadmap (Setreo) — Routenanalyse für Großraum- und Schwertransporte (GST) in DE.
> **Scope dieses Dokuments:** Die vier westdeutschen Länder **Nordrhein-Westfalen, Hessen, Rheinland-Pfalz, Saarland** — Verkehrsinfo-/Baustellen-Portale + Feeds, Landesbetriebe Straßenbau, Open-Data-Portale, Geoportale/GDI (WFS/WMS/OAF), DATEX-II-Knoten, GST-Negativ-/Brückenkarten.
> **Stand:** 2026-06-13. Recherche via WebSearch + WebFetch, Endpunkte wo möglich live/per Doku verifiziert.
> **Lesehilfe:** `verifiziert=ja` = Endpunkt/Existenz live oder per offizieller Quelle bestätigt. `zu-bestätigen` = Portal/Existenz bestätigt, exakter API-Endpunkt unklar oder JS-gerendert → `apiEndpunkt=null`.
> **Rechte-Hinweis:** Lizenz/Zugang ehrlich markiert. „Erlaubt oder nicht" ist hier NICHT das Auswahlkriterium — Rechte werden separat besorgt. Alles auflisten.

---

## Schnellübersicht (Priorisierung, alle 4 Länder)

| Prio | Land | Quelle | Datentyp | Status |
|------|------|--------|----------|--------|
| **P1** | NRW | OpenGeodata.NRW / Straßen.NRW — **Bauwerke** (Brücken/Tunnel) + Straßennetz (WFS/WMS/Atom/Shape) | Bauwerke, Netzknoten, Abschnitte | **verifiziert (offen, dl-de/by-2-0)** |
| **P1** | NRW | **GST-Schwertransportkarte NRW** (lastbeschränkte Brücken, ArcGIS WebApp) | gesperrte/lastbeschränkte Brücken für GST | verifiziert (Karte offen; Rohdaten in Freigabe-Prüfung) |
| **P1** | NRW | MOBIDROM / Verkehr.NRW — DATEX-II Baustellen/Sperrungen | Baustellen, Sperrungen, temp. Restriktionen | verifiziert (Portal); Feed-Endpunkt zu-bestätigen |
| **P1** | RLP | **Mobilitätsatlas RLP / BaustellenInfo digital** | Baustellen, Sperrungen, Verkehrsmeldungen | verifiziert (Portal); Feed-URL zu-bestätigen |
| **P1** | Hessen | **Hessen Mobil — Lastbeschränkte Brücken** (PDF-Liste + SIB-Hessen-Online-Karte) | lastbeschränkte Brücken B/L/K | verifiziert (PDF/Karte; kein offenes WFS) |
| **P2** | Hessen | Hessen Mobil — **Positivkarten** GST (Gewichts-/Höhenklassen) | befahrbare/verbotene GST-Strecken | verifiziert (Karten; Format zu-bestätigen) |
| **P1** | Saarland | **baustellen.saarland** (LfS) — Baustellen/Sperrungen/Verkehrslage | Baustellen, Sperrungen, Verkehrslage | verifiziert (Portal); kein offener Feed gefunden |
| **P2** | alle | Mobilithek (BMDV) — DATEX-II-Angebote der Länder (NW/HE/RP/SL) | Baustellen/Sperrungen bundesweit gebündelt | verifiziert (NAP); je Feed Registrierung |

> **Kern-Muster (alle 4 Länder):** Straßennetz-Geometrie + Bauwerke ist offen (Geoportale, dl-de/by-2-0). Baustellen/Sperrungen sind als Portal+DATEX-II vorhanden (über Landesplattform → Mobilithek). **Die echte GST-Brückenrestriktion (Traglast/lichte Höhe) ist nur als abgeleitete Negativ-/Brückenkarte oder PDF-Liste öffentlich** — Rohdaten (SIB-Bauwerke) liegen beim Landesbetrieb und sind nicht offen (siehe Bundeskatalog Quelle 3).

---

# ═══════════════════════════════════════════
# NORDRHEIN-WESTFALEN (NRW)
# ═══════════════════════════════════════════

## NRW-1. OpenGeodata.NRW / Straßen.NRW — Straßennetz inkl. **Bauwerke** (Brücken/Tunnel)

- **quelle:** „Straßennetz Landesbetrieb Straßenbau NRW" — Geodatensatz mit Layer **Bauwerke** (Brücken, Tunnel, sonstige Bauwerke), Abschnitte/Äste, Netzknoten, Nullpunkte, Ortsdurchfahrten, Fahrstreifen, Verkehrswerte, Zählstellen, Unfälle, Dienststellen, Verwaltungen
- **betreiber:** Landesbetrieb Straßenbau NRW (Straßen.NRW), techn. Kontakt Dieter Schüller (Köln)
- **datentyp:** **Bauwerke** = Brücken/Tunnel/Bauwerke (Geometrie + Stammdaten); Straßennetz-Topologie (Abschnitte, Netzknoten, Stationierung), Verkehrswerte, Zählstellen
- **strassentyp:** A + B + L + K (öffentliche Straßen NRW: Bundesfern-, Landes-, Kreisstraßen) → **Alle** (klassifiziertes Netz)
- **format:** WFS (GML), WMS, **Atom-Feed**, Shapefile-Download (EPSG:25832)
- **apiEndpunkt (verifiziert):**
  - **WFS GetCapabilities:** `https://www.wfs.nrw.de/wfs/strassen_nrw?REQUEST=GetCapabilities&SERVICE=WFS` (live; FeatureType `Bauwerke` bestätigt, 13–14 FeatureTypes)
  - **WMS GetCapabilities:** `https://www.wms.nrw.de/wms/strassen_nrw_wms?REQUEST=GetCapabilities&SERVICE=WMS`
  - **Atom-Feed:** `http://www.gis-rest.nrw.de/atomFeed/rest/atom/f4affc5e-a01a-4531-895c-5c6e59685ed1`
  - **Shape-Direktdownload Bauwerke:** `https://www.opengeodata.nrw.de/produkte/transport_verkehr/strassennetz/Bauwerke_EPSG25832_Shape.zip`
  - weitere Shapes analog (`AbschnitteAeste_…`, `Netzknoten_…`, `Nullpunkte_…`, `Ortsdurchfahrten_…`, `Fahrstreifen_…`, `Verkehrswerte_…`, `Zaehlstellen_…`, `Unfaelle_…`, `Dienststellen_…`, `Verwaltungen_…` jeweils `_EPSG25832_Shape.zip`)
  - **Datenbeschreibung (PDF):** `https://www.opengeodata.nrw.de/produkte/transport_verkehr/strassennetz/datenbeschreibung_strassennetz.pdf`
- **update:** vierteljährlich; Shapes zuletzt 12.06.2026 (sehr aktuell)
- **auth:** keine
- **kosten:** keine
- **lizenz:** **Datenlizenz Deutschland Namensnennung 2.0** (dl-de/by-2-0) — Quelle + Abrufdatum nennen
- **abdeckung:** ganz NRW, klassifiziertes Straßennetz
- **zugang:** **offen** — direkter Download + offene WFS/WMS, keine Registrierung
- **verifiziert:** **ja** (WFS-Capabilities live, FeatureType `Bauwerke` bestätigt; Open.NRW-Datensatz + Shape-URLs bestätigt)
- **url:**
  - Produktseite: `https://www.opengeodata.nrw.de/produkte/transport_verkehr/strassennetz/`
  - Open.NRW-Datensatz: `https://open.nrw/dataset/ac8a18de-29d2-4bd4-ba75-6a1d4b4aabff`
  - WFS-Metadaten (GDI-DE): `https://gdk.gdi-de.org/geonetwork/srv/api/records/ad12519f-cee1-4f8d-9631-1ef3da869cbc`
  - Karten-Viewer: `https://www.geoportal.nrw/?activetab=map&referer=opennrw&wms=https://www.wms.nrw.de/wms/strassen_nrw_wms`
- **prio:** **P1**
- **sonstiges:** **Stärkste offene Strukturquelle der Region.** ACHTUNG: Der Layer `Bauwerke` enthält Bauwerksgeometrie/-stammdaten — ob er die **GST-relevanten Attribute (Traglast/Brückenklasse, lichte Höhe)** als saubere Felder führt, ist aus den Capabilities NICHT verifiziert (Datenbeschreibungs-PDF ist CID-codiert, Felder nicht extrahierbar → **Feldliste am Live-Datensatz prüfen** via `GetFeature`/Shape-Attributtabelle). Die echten Lastbeschränkungen kommen separat aus NRW-2.

## NRW-2. GST-Schwertransportkarte NRW — **lastbeschränkte / gesperrte Brücken** (Straßen.NRW + Autobahn GmbH)

- **quelle:** „Lastbeschränkte Brücken NRW — Schwertransportkarte" (digitale Karte aller für GST gesperrten Bauwerke)
- **betreiber:** Landesbetrieb Straßenbau NRW (Straßen.NRW); umfasst Bauwerke von Straßen.NRW **und** Autobahn GmbH (Niederlassung Westfalen/Rheinland)
- **datentyp:** **Für GST gesperrte/lastbeschränkte Bauwerke** — Brücken, Verkehrszeichenbrücken/-kragarme, Tunnel und weitere statisch/maßlich zu prüfende Bauwerke (7-stellige Bauwerksnummer als ID)
- **strassentyp:** A + B + L + K (Straßen.NRW-Netz + BAB) → **Alle**
- **format:** Web-Portal (ArcGIS WebApp Viewer); Rohdaten-Format noch offen (Freigabe in Prüfung)
- **apiEndpunkt:** **null** (ArcGIS WebApp JS-gerendert; zugrundeliegender REST-MapServer/FeatureServer nicht öffentlich abgeleitet) → `zu-bestätigen` (möglicher `…/arcgis/rest/services/…` an `giscloud.nrw.de` — am Live-Netzwerk-Traffic der WebApp zu lokalisieren)
- **update:** kurzfristige Änderungen jederzeit möglich (betrieblich gepflegt)
- **auth:** keine (Karte offen aufrufbar)
- **kosten:** keine
- **lizenz:** lt. Govdata-Eintrag — Lizenz „derzeit in Prüfung", Nutzungsbedingungen siehe externe Kartenansicht; Rohdaten-Freigabe ausdrücklich in Bearbeitung
- **abdeckung:** ganz NRW
- **zugang:** **offen (Karte)** — Rohdatenbezug: Kontakt über Open.NRW/Straßen.NRW (Freigabe in Prüfung) → `eingeschränkt` für maschinellen Bezug
- **verifiziert:** **ja** (Karte existiert, Govdata-Eintrag bestätigt); Rohdaten-Endpunkt `zu-bestätigen`
- **url:**
  - Govdata: `https://www.govdata.de/suche/daten/lastbeschrankte-brucken-nrw-schwertransportkarte`
  - WebApp-Viewer: `https://www.giscloud.nrw.de/arcgis/apps/webappviewer/index.html?id=35c61ce20f2c4639a333be830891e207`
  - Metadaten (TTL): `https://www.govdata.de/ckan/dataset/lastbeschrankte-brucken-nrw-schwertransportkarte.ttl`
  - Straßen.NRW Infoseite: `https://www.strassen.nrw.de/de/lastbeschraenkte-bruecken.html`
- **prio:** **P1** (das bekannte „GST-Negativkarte NRW offen"-Lead — bestätigt: Karte offen, Rohdaten-Freigabe läuft)
- **sonstiges:** Inhaltlich der **GST-Goldstandard für NRW** (genau die gesperrten Bauwerke). Strategie: (a) ArcGIS-REST-Service der WebApp ermitteln (DevTools/Network) und direkt abfragen, falls offen; (b) parallel Rohdaten-Freigabe bei Straßen.NRW/Open.NRW anstoßen. Ergänzt NRW-1 (Geometrie/Stammdaten) um die eigentliche Restriktion.

## NRW-3. MOBIDROM / Verkehr.NRW — Mobilitätsdatenplattform & DATEX-II (Baustellen/Sperrungen)

- **quelle:** NRW.Mobidrom Datenplattform (zentrale Mobilitätsdaten NRW) + Verkehrsinformationsportal Verkehr.NRW
- **betreiber:** NRW.Mobidrom GmbH (Landesgesellschaft, Betrieb seit 23.05.2025); Verkehr.NRW vom Land NRW / Straßen.NRW
- **datentyp:** Baustellen, Sperrungen, temporäre Verkehrsbeschränkungen, Verkehrslage (+ ÖPNV/Sharing/Parken). DATEX-II-Profile „Roadworks" und „Parking Publication light"
- **strassentyp:** A + kommunal + Land (alle meldenden Baulastträger; ab 01.01.2027 Pflicht zur Baustellen-Koordinationsplattform für alle Baulastträger NRW) → **Alle**
- **format:** DATEX II (XML), GTFS/GTFS-RT, GBFS, MDS, TRIAS
- **apiEndpunkt:** **null** — konkreter öffentlicher DATEX-II-Feed-/API-Endpunkt nicht direkt aus den Portalseiten ableitbar (`zu-bestätigen`). Zugang über MOBIDROM-Datenplattform bzw. Mobilithek (NAP). Hinweis: zusätzliches **CKAN-Open-Data-Portal** `https://www.mobilitaetsdaten.nrw/` (DATEX-II-Datenprofil-Datensätze, z. B. Parken) gefunden → dort Feed-Katalog inventarisieren
- **update:** Echtzeit-nah / kontinuierlich
- **auth:** Plattform „diskriminierungsfrei + kostenfrei"; konkrete Bezugskonditionen je Datensatz (teils Registrierung an der Plattform/Mobilithek)
- **kosten:** kostenfrei (lt. MOBIDROM)
- **lizenz:** je Datensatz (über Plattform/Mobilithek ausgewiesen) — zu prüfen
- **abdeckung:** ganz NRW
- **zugang:** **offen/Registrierung** — Daten kostenfrei bereitgestellt; B2B-Bezug ggf. über Plattform-/Mobilithek-Konto. Kontakt Produkt: Pascal Wett, `pascal.wett@mobidrom.nrw`
- **verifiziert:** ja (Plattform + Standards bestätigt); konkreter Feed-Endpunkt **zu-bestätigen**
- **url:**
  - Verkehrsportal: `https://www.verkehr.nrw/`
  - MOBIDROM Plattform: `https://www.mobidrom.nrw/produkte/mobidrom-datenplattform`
  - Daten bereitstellen (Standards): `https://www.mobidrom.nrw/produkte/mobidrom-datenplattform/daten-bereitstellen`
  - **Open-Data-CKAN:** `https://www.mobilitaetsdaten.nrw/`
  - Land.NRW PM Baustellenkoordination: `https://www.land.nrw/pressemitteilung/nordrhein-westfalen-verbessert-die-baustellenkoordination`
- **prio:** **P1** (temporäre Restriktionen NRW)
- **sonstiges:** Folge-Recherche: (1) `mobilitaetsdaten.nrw` CKAN-API systematisch nach DATEX-II-Baustellen/Sperrungs-Datensätzen durchsuchen; (2) Mobilithek-Angebote „Straßen.NRW/Mobidrom Roadworks" identifizieren. NRW liefert ihre Daten auch an die Mobilithek (→ Bundeskatalog).

---

# ═══════════════════════════════════════════
# HESSEN
# ═══════════════════════════════════════════

## HE-1. Hessen Mobil — **Lastbeschränkte Brücken** (B/L/K) + SIB-Hessen-Online-Karte

- **quelle:** „Lastbeschränkte Brücken im Zuge von Bundes-, Landes- und Kreisstraßen" + Online-Bauwerkskarte SIB-Hessen
- **betreiber:** Hessen Mobil — Straßen- und Verkehrsmanagement
- **datentyp:** **Lastbeschränkte Brücken** (zulässiges Gesamtgewicht je Bauwerk; 2. Liste = anhörungspflichtige GST). Bauwerkssuche per 7-stelliger Bauwerksnummer; Lage auf Karte
- **strassentyp:** B + L + K (separate Liste für BAB via Autobahn GmbH) → B/L/K (Hessen-Mobil-Netz)
- **format:** **PDF-Liste** (Stand 27.02.2026) + Web-Portal (SIB-Hessen Online-Karte). Kein offenes WFS/CSV/JSON
- **apiEndpunkt:** **null** (PDF + JS-Kartenanwendung)
- **update:** laufend; „kurzfristige Änderungen jederzeit möglich"; PDF manuell datiert
- **auth:** keine
- **kosten:** keine
- **lizenz:** nicht offen lizenziert (Behörden-PDF/Kartenanwendung; Nutzung als Planungshilfe)
- **abdeckung:** ganz Hessen (B/L/K)
- **zugang:** **offen** (PDF + Karte frei abrufbar); maschinenlesbar nur via PDF-Parsing → für strukturierten Bezug Hessen Mobil kontaktieren (`schwertransporte@mobil.hessen.de`)
- **verifiziert:** **ja** (PDF-URL + SIB-Hessen-Karte bestätigt)
- **url:**
  - Infoseite + PDF: `https://mobil.hessen.de/verkehr/wirtschaftsverkehr/grossraum-und-schwertransporte/lastbeschraenkte-bruecken-im-zuge-von-bundes-landes-und-kreisstrassen`
  - PDF direkt: `https://mobil.hessen.de/sites/mobil.hessen.de/files/2026-02/lastbeschraenkte_bruecken_in_hessen_stand_2026-02-27_0.pdf`
  - SIB-Hessen Online-Karte: `https://sibhessen.de/online/application.jsp`
- **prio:** **P1** (Hessen-Pendant zur NRW-Negativkarte — die echte GST-Brückenrestriktion)
- **sonstiges:** PDF-Liste ist die maschinell zugänglichste Form (Parsing nötig). SIB-Hessen-Online ist das Hessen-SIB-Bauwerke-Frontend → möglicher Service dahinter (`sibhessen.de`) am Live-Traffic prüfen. **Goldstandard-Restriktion Hessen.**

## HE-2. Hessen Mobil — **Positivkarten** GST (Gewichts-/Höhenklassen)

- **quelle:** Positivkarten GST (befahrbare Strecken nach Gewichts-/Höhenklassen)
- **betreiber:** Hessen Mobil
- **datentyp:** GST-Strecken nach Gewichtsklassen (36/48/60/72 t) bei max. Höhe 4,20 m; Farbcodierung: orange = nur mit BF3-Begleitung („Gebotsstrecken"), violett = „Verbotsstrecken". Je Regierungsbezirk (Darmstadt, Gießen, Kassel)
- **strassentyp:** Hessen-Mobil-Netz (B/L/K, ggf. + ausgewählte Strecken) → B/L/K
- **format:** Karten (Format PDF/GIS nicht eindeutig ausgewiesen) → zu-bestätigen
- **apiEndpunkt:** **null**
- **update:** periodisch (Planungshilfe; ergänzt, ersetzt nicht die RGST-2013-Tabellen)
- **auth:** keine
- **kosten:** keine
- **lizenz:** Behörden-Planungshilfe (nicht offen lizenziert)
- **abdeckung:** RB Darmstadt, Gießen, Kassel (ganz Hessen)
- **zugang:** **offen** (über Webseite); strukturierter Bezug via Hessen Mobil (`schwertransporte@mobil.hessen.de`, +49 611 366 3486)
- **verifiziert:** **ja** (Inhalt/Existenz bestätigt); Datei-Format/URL **zu-bestätigen**
- **url:** `https://mobil.hessen.de/verkehr/grossraum-und-schwertransporte/positivkarten`
- **prio:** **P2** (ergänzt HE-1 um routenfähige Klassifizierung)
- **sonstiges:** Liefert direkt GST-routenrelevante Klassen (Gewicht/Höhe/BF3-Pflicht) — wertvoll, falls als GIS/Geometrie beziehbar. Datei-Links auf der Seite konkret prüfen.

> **Hessen-Hinweis VEMAGS:** Hessen Mobil betreibt das bundesweite VEMAGS-Verfahren (GST-Antragsbearbeitung). VEMAGS-INS-GST ist die offizielle Routenprüfung gegen Bauwerksrestriktionen → siehe **Bundeskatalog Quelle 4** (restricted, Zugang per Anfrage). Allgemein-Info: `https://mobil.hessen.de/verkehr/wirtschaftsverkehr/grossraum-und-schwertransporte/allgemeine-informationen-und-vemags`

---

# ═══════════════════════════════════════════
# RHEINLAND-PFALZ (RLP)
# ═══════════════════════════════════════════

## RP-2. Mobilitätsatlas RLP / BaustellenInfo digital — Baustellen & Verkehrsmeldungen

- **quelle:** Mobilitätsatlas Rheinland-Pfalz (verkehr.rlp.de) + „BaustellenInfo digital Rheinland-Pfalz"
- **betreiber:** Land RLP (MWTEK) + LBM RLP; BaustellenInfo bündelt LBM + Kreise/Kommunen
- **datentyp:** Baustellen (Land, Autobahn GmbH, Kommunen), Sperrungen, Verkehrsmeldungen, Verkehrszählungen, Unfallhäufungsstellen, Ladesäulen, ÖV-Haltestellen
- **strassentyp:** A + B + L + K + kommunal → **Alle** (meldende Baulastträger)
- **format:** Web-Portal/Karte; Daten an Mobilithek weitergegeben (für Navi-Hersteller/Apps) → DATEX II via LBM-Knoten
- **apiEndpunkt:** **null** (Portal); öffentlicher Feed-Endpunkt nicht direkt sichtbar (`zu-bestätigen`) — Bezug über Mobilithek
- **update:** Echtzeit-nah
- **auth:** Portal offen; Daten-/Feed-Bezug ggf. über Mobilithek (Registrierung)
- **kosten:** Portal frei
- **lizenz:** je Bezugsweg (Mobilithek) zu prüfen
- **abdeckung:** ganz RLP
- **zugang:** **offen (Portal)** / Feed via Mobilithek
- **verifiziert:** ja (Portale bestätigt); Feed-Endpunkt **zu-bestätigen**
- **url:**
  - Mobilitätsatlas (LBM): `https://lbm.rlp.de/themen/verkehrssteuerung/mobilitaetsatlas`
  - Mobilitätsatlas (MWTEK): `https://mwtek.rlp.de/themen/verkehr/mobilitaetsatlas-rheinland-pfalz`
  - BaustellenInfo digital: `https://baustelleninfo.rlp.de/`
  - Verkehrsportal: `https://www.verkehr.rlp.de/`
- **prio:** **P1** (temporäre Restriktionen RLP)
- **sonstiges:** Konkreten DATEX-II-Feed über die Mobilithek-Angebote des LBM auflösen.

## RP-3. LBM RLP — Brücken & Schwertransporte (Restriktions-Stelle)

- **quelle:** LBM RLP Themenseiten „Brücken" und „Großraum- und Schwerverkehr"
- **betreiber:** Landesbetrieb Mobilität RLP (LBM)
- **datentyp:** Brückenprüfung/Traglast (statischer Nachweis je Bauwerk), Genehmigungs-/Anhörungsverfahren GST. Keine öffentliche maschinenlesbare Negativ-/Brückenliste gefunden (im Ggs. zu NRW/Hessen)
- **strassentyp:** A + B + L + K
- **format:** Web-Info (Themenseiten); operative Daten in LBM-/SIB-Systemen (nicht offen)
- **apiEndpunkt:** **null**
- **update:** laufend (Bauwerksprüfung)
- **auth:** restricted (interne Systeme); Routenprüfung über VEMAGS
- **kosten:** n/a
- **lizenz:** nicht offen
- **abdeckung:** ganz RLP
- **zugang:** **eingeschränkt** — GST-Routenprüfung über VEMAGS (Antrag); Kreisverwaltungen/kreisfreie Städte erteilen Genehmigungen. Direkter Datenbezug nur per LBM-Anfrage/Kooperation
- **verifiziert:** ja (Zuständigkeit/Verfahren bestätigt); **keine offene Brückenliste** verifiziert (anders als NRW/HE)
- **url:**
  - Brücken: `https://lbm.rlp.de/themen/bruecken`
  - GST: `https://lbm.rlp.de/themen/verkehrsrecht/grossraum-und-schwerverkehr`
- **prio:** **P2** (Restriktion vorhanden, aber nicht offen — Lücke ggü. NRW/HE)
- **sonstiges:** **Lücke RLP:** keine öffentliche GST-Negativ-/Brückenkarte wie NRW (NRW-2) oder Hessen (HE-1) auffindbar. Beim LBM gezielt nach „lastbeschränkte Brücken RLP"-Liste anfragen; sonst nur via VEMAGS-INS-GST (Bundeskatalog Q4).
---

# ═══════════════════════════════════════════
# SAARLAND
# ═══════════════════════════════════════════

## SL-2. LfS / baustellen.saarland — Baustellen, Sperrungen, Verkehrslage

- **quelle:** „baustellen.saarland" (LfS-Baustellenportal) + „Wo wird gebaut" (saarland.de)
- **betreiber:** Landesbetrieb für Straßenbau (LfS), Neunkirchen. Kontakt `poststelle@lfs.saarland.de`
- **datentyp:** Baustellen, Verkehrswarndienst (Sperrungen), Verkehrslage (frei/stockend/zäh/Stau)
- **strassentyp:** B + L (LfS-Netz; BAB via Autobahn GmbH) — kommunal je Meldung
- **format:** Web-Portal (Listen-/Tabellenansicht); **kein** offener API/DATEX/GeoJSON-Feed gefunden
- **apiEndpunkt:** **null** (kein maschinenlesbarer Export im Portal sichtbar) → `zu-bestätigen` (intern evtl. JSON-Backend; am Live-Traffic prüfen)
- **update:** laufend
- **auth:** keine (Portal)
- **kosten:** keine
- **lizenz:** nicht ausgewiesen (Behördenportal)
- **abdeckung:** ganz Saarland
- **zugang:** **offen (Portal)**; maschineller Bezug unklar → LfS anfragen bzw. Mobilithek prüfen
- **verifiziert:** ja (Portal + Betreiber bestätigt); offener Feed **zu-bestätigen**
- **url:**
  - Baustellenportal: `https://baustellen.saarland/`
  - LfS „Wo wird gebaut": `https://www.saarland.de/lfs/DE/aktuelles/wo_wird_gebaut`
  - LfS Startseite: `https://www.saarland.de/lfs/DE/home/home_node.html`
- **prio:** **P1** (temporäre Restriktionen Saarland)
- **sonstiges:** Saarland kleinstes Netz; LfS verwaltet ~1.490 km L + ~300 km B + zahlreiche Bauwerke (Brücken/Kreisverkehre). Prüfen, ob baustellen.saarland an die Mobilithek liefert (DATEX II) bzw. ob ein JSON-Backend abgreifbar ist.

---

## Abdeckungs-Synthese & Lücken (Länder West)

### Was OFFEN + verifiziert vorliegt (sofort nutzbar)
- **Straßennetz-Geometrie aller 4 Länder** als WFS/OAF/Shape unter dl-de/by-2-0:
  - **NRW:** `wfs.nrw.de/wfs/strassen_nrw` inkl. **Bauwerke**-Layer (Brücken/Tunnel) + Shape-Download (12.06.2026, sehr aktuell) — **stärkste Quelle**.
  - **RLP:** GeoPortal.rlp.de OAF (`spatial-objects/513`, GeoJSON) — A/B/L/K, modern.
  - **Hessen:** Geoportal Hessen INSPIRE-WFS Verkehrsnetze (`/722`, `/723`, OKSTRA).
  - **Saarland:** GeoPortal Saarland Verkehr_WFS (`/242`) + INSPIRE Verkehrsnetze (`/413`, `/326`).
- **GST-Brückenrestriktion offen sichtbar in 2 von 4 Ländern:**
  - **NRW:** GST-Schwertransportkarte (lastbeschränkte/gesperrte Brücken, ArcGIS WebApp) — **Karte offen, Rohdaten-Freigabe in Prüfung**. ← bestätigtes Lead.
  - **Hessen:** Hessen Mobil PDF-Liste lastbeschränkte Brücken + SIB-Hessen-Online-Karte + Positivkarten (Gewichts-/Höhenklassen).
- **Temporäre Restriktionen (Baustellen/Sperrungen)** als Portal in allen 4 Ländern; DATEX-II-Lieferung an Mobilithek (NRW via MOBIDROM, RLP via LBM-Knoten, HE via Hessen Mobil, SL via LfS).

### Konkrete „zu-bestätigen"-Punkte (Folge-Recherche)
1. **NRW Bauwerke-Feldliste:** Enthält der offene `Bauwerke`-Layer die GST-Attribute (Traglast/Brückenklasse, lichte Höhe)? → per `GetFeature`/Shape-Attributtabelle prüfen (PDF-Datenbeschreibung war CID-codiert, nicht parsebar).
2. **NRW Schwertransportkarte ArcGIS-REST-Service:** WebApp ist JS — den zugrundeliegenden `…/arcgis/rest/services/…`-Endpunkt (an `giscloud.nrw.de`) via Browser-Network-Trace ermitteln; falls offen → direkt abfragbar.
3. **DATEX-II-Feed-Endpunkte (alle 4):** Portale gefunden, aber keine direkten Feed-URLs exponiert. Auflösung über **Mobilithek-Angebotskatalog** (je Land) bzw. `mobilitaetsdaten.nrw` CKAN-API (NRW hat zusätzliches offenes Datenportal).
4. **Hessen opendata CKAN:** Portal blockt Bot-Fetch (403) → via `package_search`-API weitere Hessen-Mobil-Datensätze (Baustellen/Bauwerke) finden.
5. **Hessen Positivkarten-Format:** PDF oder GIS? Datei-Links auf der Positivkarten-Seite konkret abgreifen.

### Echte Lücken (kein offener Treffer)
- **RLP + Saarland: keine öffentliche GST-Negativ-/Brückenkarte** (anders als NRW + Hessen). Restriktion nur über VEMAGS-INS-GST (Bund, restricted) oder direkte LBM-/LfS-Anfrage.
- **Brücken-Traglast/lichte-Höhe als offene Rohdaten** existiert in KEINEM der 4 Länder offen — überall nur abgeleitete Karten/Listen (NRW/HE) oder gar nicht (RLP/SL). Die Rohquelle bleibt **SIB-Bauwerke / ASB-ING** (Bundeskatalog Q3, eingeschränkt) bzw. **VEMAGS-INS-GST** (Q4).

### Strategische Empfehlung (Länder West)
1. **NRW sofort anbinden:** OpenGeodata.NRW Bauwerke-Shape/WFS (offen) + GST-Schwertransportkarte (ArcGIS-REST ermitteln) — die mit Abstand reichste offene Region.
2. **Hessen:** PDF-Brückenliste parsen + SIB-Hessen-Online-Backend prüfen + INSPIRE-Verkehrsnetz-WFS für Netzgeometrie.
3. **RLP + Saarland:** Netzgeometrie offen via OAF/WFS nutzen; GST-Brückenrestriktion proaktiv bei LBM bzw. LfS anfragen (keine offene Karte) — oder über VEMAGS-INS-GST bundesweit lösen.
4. **DATEX-II-Baustellen:** zentral über **Mobilithek** je Land beziehen (ein Bezugsweg statt vier Portale); NRW zusätzlich `mobilitaetsdaten.nrw`.

---

*Erstellt: 2026-06-13. Bereich: Länder West (NRW, Hessen, RLP, Saarland). Bundesquellen siehe `quellen-bund.md`; Aggregatoren/kommerziell siehe `quellen-schwertransport-aggregatoren.md`. Übrige Länder in separaten Katalogen.*
