# Datenquellen-Katalog — LÄNDER SÜD (Baden-Württemberg + Bayern)

> **Projekt:** Roadmap (Setreo) — Routenanalyse für Großraum- und Schwertransporte (GST) in DE.
> **Scope dieses Dokuments:** Öffentliche Landesquellen für **Baden-Württemberg** und **Bayern** — Verkehrsinfo-/Baustellen-Portale + Feeds, Landesbetriebe Straßenbau, Open-Data-Portale, Geoportale/GDI (WFS/WMS für Straßen/Brücken/Restriktionen), DATEX-II-Lieferungen an die Mobilithek.
> **Stand:** 2026-06-13. Recherche via WebSearch + WebFetch, Endpunkte wo möglich live/per offizieller Doku verifiziert.
> **Lesehilfe:** `verifiziert=ja` = Endpunkt/Existenz live oder per offizieller Doku bestätigt. `zu-bestätigen` = Portal/Dienst gefunden, exakter API-Endpunkt unklar oder nicht öffentlich → `apiEndpunkt=null`.
> **Rechte-Hinweis:** Lizenz/Zugang sind ehrlich markiert. „Erlaubt oder nicht" ist hier NICHT das Kriterium — Rechte werden separat besorgt. Alles auflisten.

---

## Schnellübersicht (Priorisierung)

### Baden-Württemberg
| Prio | Quelle | Datentyp | Format | Status |
|------|--------|----------|--------|--------|
| **P1** | MobiData BW IPL — Baustellen (BEMaS) | Baustellen, Arbeitsstellen B/L/K | CIFS, GeoJSON, DATEX II, WFS, CSV | verifiziert (offen) |
| **P1** | MobiData BW IPL — Verkehrsmeldungen (LMS BW) | Sperrungen, Gefahren, Ereignisse | TIC3-XML, DATEX II | verifiziert (offen) |
| **P1** | MobiData BW Geoserver (WFS/WMS) | Mobilitätsdaten-Layer (u.a. roadworks) | WFS/WMS | verifiziert (offen) |
| **P2** | Straßennetz + Netzknoten BW (VM BW) | Klass. Straßennetz B/L/K + Netzknoten | GML, MIF/MID, CSV | verifiziert (offen) |
| **P2** | LGL-BW Open GeoData — ATKIS Basis-DLM / DLM50 Verkehrsnetz | Straßennetz-Topologie | WFS/WMS/Download | verifiziert (offen) |
| **P3** | INSPIRE-WFS BW Verkehrsnetze (LGL) | INSPIRE Road Transport Network | WFS (GML 4.0) | zu-bestätigen (Endpunkt) |
| **P3** | daten.bw (Open-Data-Portal BW) | Meta-Katalog | Portal | verifiziert |

### Bayern
| Prio | Quelle | Datentyp | Format | Status |
|------|--------|----------|--------|--------|
| **P1** | BAYSIS Bauwerke WFS/WMS | **Brücken + Tunnel + Trogbauwerke** | WFS/WMS (GeoJSON/GML) | verifiziert (offen, CC BY 4.0) |
| **P1** | BAYSIS Straßennetz + Straßenbestand WFS | Klass. Straßennetz, Fahrbahnbreiten, Bahnigkeit, OD/Freie Strecke | WFS/WMS | verifiziert (offen, CC BY 4.0) |
| **P1** | BayernInfo / ArbIS → Mobilithek — Baustellen | Arbeitsstellen A/B/L/K | DATEX II | verifiziert (Registrierung Mobilithek) |
| **P1** | BayernInfo / VIZ → Mobilithek — Verkehrsmeldungen | Stau, Sperrungen, Gefahren | DATEX II | verifiziert (Registrierung Mobilithek) |
| **P2** | BAYSIS Fachnetze WFS | Bedarfsabhängige Umleitungen | WFS/WMS | verifiziert (offen, CC BY 4.0) |
| **P2** | Bayerische Vermessungsverwaltung — ATKIS Basis-DLM | Straßennetz/Verkehr Topographie | Download + WFS/WMS | verifiziert (offen, CC BY 4.0) |
| **P3** | open.bydata.de (Open-Data-Portal Bayern) | Meta-Katalog | Portal | verifiziert |
| **P3** | Bayern GST-Negativkarte (Regierungspräsidien/ABD) | gesperrte Brücken für GST | unklar | zu-bestätigen (kein öff. Feed gefunden) |

---

# TEIL A — BADEN-WÜRTTEMBERG

> **Zentrale Erkenntnis BW:** Baden-Württemberg hat seine Verkehrsdaten konsolidiert. Die alte Straßenverkehrszentrale `svz-bw.de` wird **eingestellt**, Inhalte/Daten sind in die **MobiData BW Integrationsplattform (IPL)** migriert. MobiData BW ist damit der zentrale, **offene** Daten-Hub für BW — keine Registrierung, identifizieren via `User-Agent`-Header. Das ist für unser Projekt die wichtigste BW-Quelle (Baustellen + Verkehrsmeldungen in CIFS/GeoJSON/DATEX/TIC3, plus Geoserver-WFS).

## A1. MobiData BW IPL — Baustelleninformationen (BEMaS)

- **quelle:** MobiData BW Integrationsplattform (IPL) — Datensatz „Baustelleninformationen Baden-Württemberg"
- **betreiber:** NVBW (Nahverkehrsgesellschaft Baden-Württemberg) i.A. Verkehrsministerium BW; Quellsystem **BEMaS** (Baustellen- und Ereignis-Managementsystem BW)
- **datentyp:** Geplante + aktuelle Arbeits-/Baustellen (kurz- und langfristig) auf Bundes-, Landes- und Kreisstraßen
- **strassentyp:** B / L / K (klassifiziert) — **KEINE A** (BAB liegen bei Autobahn GmbH, siehe Bundesquellen-Katalog)
- **format:** CIFS-JSON, GeoJSON, DATEX II XML, CSV (über Geoserver)
- **apiEndpunkt (verifiziert):**
  - CIFS: `https://api.mobidata-bw.de/datasets/traffic/roadworks/roadworks_cifs.json`
  - GeoJSON: `https://api.mobidata-bw.de/datasets/traffic/roadworks/roadworks_geojson.json`
  - DATEX II: `https://api.mobidata-bw.de/datasets/traffic/roadworks/roadworks_svzbw.datex2.xml`
  - CSV (WFS-Export): `https://api.mobidata-bw.de/geoserver/MobiData-BW/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=MobiData-BW%3Aroadworks&maxFeatures=20000&outputFormat=csv`
- **update:** laufend (Datensatz zuletzt 2026-01-28 aktualisiert; betrieblich gepflegt)
- **auth:** keine (offen; `User-Agent`-Header empfohlen)
- **kosten:** keine
- **lizenz:** Datenlizenz Deutschland Namensnennung 2.0 (DL-DE/BY 2.0)
- **abdeckung:** Baden-Württemberg, klassifiziertes Netz B/L/K
- **zugang:** offen — direkt abrufbar, keine Registrierung
- **verifiziert:** ja (IPL-Doku + Datensatzseite, Endpunkt-Pfade bestätigt)
- **url:** `https://mobidata-bw.de/dataset/baustelleninformationen-baden-wurttemberg` · IPL: `https://api.mobidata-bw.de/`
- **prio:** P1
- **sonstiges:** GeoJSON = direkt geometrie-fähig für Routen-Verschnitt. Numerische Restriktionen (Höhe/Breite/Gewicht) typischerweise NICHT als saubere Felder — eher Freitext in Meldung; Parsing nötig (analog Autobahn-API).

## A2. MobiData BW IPL — Verkehrsmeldungen (LMS BW)

- **quelle:** MobiData BW IPL — Datensatz „Verkehrsmeldungen Baden-Württemberg"
- **betreiber:** Lagemeldesystem **LMS BW** (Ministerium des Inneren, für Digitalisierung und Kommunen BW); publiziert über MobiData BW
- **datentyp:** Staus, Baustellen, Unfälle, Veranstaltungen, Demonstrationen, **Gefahrenmeldungen, sonstige Sperrungen**, weitere Ereignisse im Straßenraum. Integriert zusätzlich DWD-Wetterwarnungen, HVZ-BW-Hochwasserwarnungen, Stuttgart-Störungen
- **strassentyp:** A / B / L / K (Autobahnen, Bundes-, Landes-, Kreisstraßen — Meldungen netzübergreifend)
- **format:** TIC3 XML, DATEX II XML (XSD verfügbar)
- **apiEndpunkt (verifiziert):**
  - TIC3: `https://api.mobidata-bw.de/datasets/traffic/incidents-bw/TIC3-Meldungen.xml`
  - DATEX II: `https://api.mobidata-bw.de/datasets/traffic/incidents/incidents_lmsbw.datex2.xml`
- **update:** alle ~10 Minuten
- **auth:** keine (offen)
- **kosten:** keine
- **lizenz:** Datenlizenz Deutschland Namensnennung 2.0 (DL-DE/BY 2.0)
- **abdeckung:** Baden-Württemberg, netzübergreifend
- **zugang:** offen — direkt abrufbar, keine Registrierung
- **verifiziert:** ja (Datensatzseite + Endpunkte bestätigt)
- **url:** `https://mobidata-bw.de/dataset/meldung` · GovData-Spiegel: `https://www.govdata.de/suche/daten/verkehrsmeldungen-baden-wurttemberg`
- **prio:** P1
- **sonstiges:** Entspricht inhaltlich dem alten VerkehrsInfo-BW / SVZ-BW-Bestand. „Sonstige Sperrungen" + „Gefahrenmeldungen" sind für GST-Routing relevant (kurzfristige Hindernisse). Restriktions-Details i.d.R. im Meldungstext.

## A3. MobiData BW — Geoserver (WFS/WMS)

- **quelle:** MobiData BW IPL Geoserver
- **betreiber:** NVBW / MobiData BW
- **datentyp:** Visualisierungs-/Vektor-Layer der Mobilitätsdaten (u.a. `MobiData-BW:roadworks`); weitere Layer je nach Bestand
- **strassentyp:** abhängig vom Layer (roadworks = B/L/K)
- **format:** WFS, WMS
- **apiEndpunkt (verifiziert):**
  - Geoserver Web/UI: `https://api.mobidata-bw.de/geoserver/web/`
  - WFS-Basis (OWS): `https://api.mobidata-bw.de/geoserver/MobiData-BW/ows` (GetCapabilities: `?service=WFS&version=2.0.0&request=GetCapabilities`)
- **update:** laufend (an Quell-Datensätze gekoppelt)
- **auth:** keine (offen)
- **kosten:** keine
- **lizenz:** je Layer (roadworks: DL-DE/BY 2.0)
- **abdeckung:** Baden-Württemberg
- **zugang:** offen
- **verifiziert:** ja (Geoserver + WFS-Export-URL bestätigt; vollständige Layer-Liste via GetCapabilities abzurufen)
- **url:** `https://api.mobidata-bw.de/geoserver/web/`
- **prio:** P1
- **sonstiges:** GetCapabilities abrufen, um den vollständigen Layer-Katalog (ggf. Restriktions-Layer) zu inventarisieren — TODO für Implementierung.

## A4. Straßennetz und Netzknoten Baden-Württemberg

- **quelle:** Datensatz „Straßennetz und Netzknoten Baden-Württemberg" (über MobiData BW / daten.bw)
- **betreiber:** Verkehrsministerium Baden-Württemberg
- **datentyp:** Klassifiziertes Straßennetz (B/L/K) + Netzknoten (ASB-Bezug, Stationierung) — Grundnetz, an das Restriktionen gehängt werden können
- **strassentyp:** B / L / K — **KEINE A** (Autobahn GmbH separat)
- **format:** GML (+ XSD), MapInfo MIF/MID, CSV, Style-Files (QML/SLD); INSPIRE-konform
- **apiEndpunkt (verifiziert, Download):**
  - GML Straßennetz: `https://mobidata-bw.de/vm/Strassennetz_Netzknoten_BW/GML_Strassennetz_250101.zip`
  - GML Netzknoten: `https://mobidata-bw.de/vm/Strassennetz_Netzknoten_BW/GML_Netzknoten_250101.zip`
  - (Datums-Suffix `250101` = Datenstand 01.01.2025; CSV-Varianten analog im selben Pfad)
- **update:** jährlich (zuletzt Stand 2025-10-29 publiziert; Datenstand 01.01.2025)
- **auth:** keine
- **kosten:** keine
- **lizenz:** Datenlizenz Deutschland Namensnennung 2.0 (DL-DE/BY 2.0)
- **abdeckung:** Baden-Württemberg, klassifiziertes Netz
- **zugang:** offen (Download)
- **verifiziert:** ja (Datensatzseite + Download-URLs bestätigt)
- **url:** `https://mobidata-bw.de/dataset/strassennetz-netzknoten-baden-wuerttemberg`
- **prio:** P2
- **sonstiges:** Statisches Grundnetz (Download), kein Live-Dienst. Datumsteil der URL ändert sich pro Jahrgang — vor Abruf aktuellen Datensatz-Stand prüfen.

## A5. LGL-BW Open GeoData / GDI-BW (Geobasis WFS/WMS)

- **quelle:** Landesamt für Geoinformation und Landentwicklung BW (LGL-BW) — Open GeoData & GDI-BW
- **betreiber:** LGL-BW (benutzerservice@lgl.bwl.de)
- **datentyp:** Geobasis — u.a. ATKIS Basis-DLM / DLM50 (Objektart Verkehr/Straßen), Straßennetzkarte 1:100.000, Amtliche Straßenkarte 1:200.000, ALKIS; INSPIRE-Dienste (Verkehrsnetze, Gebäude, Bodennutzung)
- **strassentyp:** Alle (topographisches Verkehrsnetz)
- **format:** WMS, WMTS (Darstellung); WFS, WCS (Vektor/Raster); GeoPackage, Shapefile (Download)
- **apiEndpunkt:** null — exakte GetCapabilities-Pfade über GDI-BW-Katalog / Open-GeoData-Portal aufzulösen (siehe url). Beispiel-Namenskonvention bestätigt: `WMS_INSP_BW_Verkehrsnetz_ALKIS`, `WFS_INSP_BW_Verkehrsnetz_ATKIS_DLM50`
- **update:** periodisch (Geobasis-Fortführung)
- **auth:** Standard-Open-Data offen; Sonderformate/-zuschnitte ggf. aufwandsabhängiges Service-Entgelt
- **kosten:** Standard-Downloads/-Dienste frei
- **lizenz:** Open Data mit Namensnennung (Quellenangabe LGL-BW erforderlich; konkrete Lizenz-Codes je Produkt prüfen — DL-DE/BY oder CC BY)
- **abdeckung:** Baden-Württemberg flächendeckend
- **zugang:** offen (Open GeoData Portal `opengeodata.lgl-bw.de`); Dienst-URLs über Geoportal-BW-Katalog
- **verifiziert:** zu-bestätigen (Existenz + Namenskonventionen bestätigt; konkrete GetCapabilities-URLs noch aufzulösen)
- **url:**
  - Open GeoData: `https://www.lgl-bw.de/Produkte/Open-Data/index.html`
  - Geodatendienste: `https://www.lgl-bw.de/Produkte/Geodatendienste/index.html`
  - Geoportal-BW Katalog: `https://metadaten.geoportal-bw.de/`
  - Open-GeoData-Portal: `https://opengeodata.lgl-bw.de/`
- **prio:** P2
- **sonstiges:** ATKIS Basis-DLM Verkehrsnetz = Topographie-Grundlage (Höhen/Restriktionen nicht das Hauptmerkmal, aber Netz-Geometrie + Klassifizierung).

## A6. INSPIRE-WFS BW Verkehrsnetze (ATKIS Basis-DLM)

- **quelle:** „INSPIRE-WFS/WMS BW Verkehrsnetze ATKIS Basis-DLM" (Metadaten Geoportal-BW)
- **betreiber:** LGL Baden-Württemberg
- **datentyp:** INSPIRE Road Transport Network (GML Application Schema v4.0) — Straßenverkehrsnetz
- **strassentyp:** Alle
- **format:** WFS (GML 4.0), WMS
- **apiEndpunkt:** null — Metadatensatz verweist auf Record-Formatter, nicht direkt auf OGC-Endpunkt; GetCapabilities über GDI-BW-Katalogeintrag aufzulösen
- **update:** periodisch
- **auth:** zu-bestätigen
- **kosten:** zu-bestätigen
- **lizenz:** **Achtung restriktiv:** Metadaten nennen „Copyright" + „Einräumung von Nutzungsrechten gemäß VwVNutzHeo. Der Empfänger darf die Daten nur zum vereinbarten Zweck verwenden." + „Other restrictions" → **vor Produktivnutzung mit LGL-BW klären** (anders als die offenen MobiData-Feeds!)
- **abdeckung:** Baden-Württemberg
- **zugang:** eingeschränkt (Nutzungsrechte-Vereinbarung möglich nötig)
- **verifiziert:** zu-bestätigen (Metadatensatz existiert; Endpunkt + genaue Zugangsbedingungen offen)
- **url:** `https://metadaten.geoportal-bw.de/geonetwork/srv/api/records/53cfcf0b-8dae-9c07-e97a-2ff9ed7af6d1`
- **prio:** P3
- **sonstiges:** Lizenz-Constraint hier strenger als bei A1–A4 — sauber trennen. Für reine Netz-Geometrie ist ATKIS auch über A5 (Open GeoData) erreichbar.

## A7. daten.bw — Open-Data-Portal Baden-Württemberg (Meta)

- **quelle:** daten.bw — zentrales Open-Data-Portal BW
- **betreiber:** Ministerium des Inneren, für Digitalisierung und Kommunen BW
- **datentyp:** Meta-Katalog (Verweis auf MobiData-BW-, LGL-, Kommunal-Datensätze); Filter nach Format (CSV/GeoJSON/DATEX II/WMS-WFS)
- **strassentyp:** —
- **format:** Portal (CKAN-ähnlich), verlinkt diverse Formate
- **apiEndpunkt:** null (Portal; ggf. CKAN-API zu-bestätigen)
- **update:** laufend
- **auth:** keine (Browsing)
- **kosten:** keine
- **lizenz:** je Datensatz
- **abdeckung:** Baden-Württemberg
- **zugang:** offen
- **verifiziert:** ja (Portal live)
- **url:** `https://www.daten-bw.de/` · gefilterte Suche (CSV/GeoJSON/DATEX/WMS-WFS): `https://www.daten-bw.de/daten/-/searchresult/f/format:csv,format:geojson,format:datex+ii,format:wms%252Fwfs,type:dataset/s/title_asc`
- **prio:** P3
- **sonstiges:** Discovery-Werkzeug — neue kommunale Restriktions-Datensätze hier periodisch nachscannen.

### Abdeckungslücken / Notizen — Baden-Württemberg
- **BAB fehlen** in allen Landes-Baustellen/-Netz-Quellen (A1, A4) → A-Netz über Autobahn GmbH (Bundesquellen-Katalog) ergänzen.
- **Brücken-/Bauwerksdaten mit Traglast + lichte Höhe:** BW hat **kein** offen verifiziertes Brücken-Restriktions-WFS gefunden (anders als Bayern via BAYSIS Bauwerke!). Bauwerksdaten liegen bei Regierungspräsidien / Landesstelle für Straßentechnik; SIB-Bauwerke-Bestand i.d.R. nicht offen. → **Lücke** — bei RP / LST BW anfragen oder Bund-SIB-Bauwerke (Bundesquellen) nutzen. Ggf. zusätzlich BASt SIB-Bauwerke / ASB-ING (Bund).
- **GST-Negativkarte BW:** Keine öffentliche digitale Negativkarte/-feed gefunden (im Gegensatz zu Sachsen, das eine GST-Negativkarte online stellt). BW arbeitet mit flächendeckenden Dauererlaubnissen (Erlass 2023); Negativ-/Sperrlisten bei Regierungspräsidien. → bei RP anfragen.
- **Höhen-/Gewichtsbeschränkungen als strukturierte Felder:** in BW-Feeds primär Freitext → Parsing nötig.

---

# TEIL B — BAYERN

> **Zentrale Erkenntnis Bayern:** Bayern trennt sauber zwei Welten:
> 1. **Dynamische Verkehrsdaten** (Baustellen via ArbIS, Verkehrsmeldungen via VIZ Bayern) → werden in **DATEX II** an die **Mobilithek** geliefert; Zugang dort i.d.R. mit Registrierung. Portal-Frontend = **BayernInfo**.
> 2. **Geobasis/Fachdaten** (Straßen, **Brücken/Tunnel/Trogbauwerke**) → **BAYSIS Geodatendienste** als **offene WFS/WMS unter CC BY 4.0, ohne Registrierung**.
>
> **Das absolute Highlight für unser Projekt: `BAYSIS Bauwerke` (WFS/WMS) — Brücken + Tunnel + Trogbauwerke der bayerischen Straßenbauverwaltung, offen, CC BY 4.0, GeoJSON-Output.** Das ist eine echte, strukturierte Bauwerks-Hindernisquelle und übertrifft, was wir in BW offen gefunden haben.

## B1. BAYSIS Bauwerke — WFS / WMS (Brücken + Tunnel + Trogbauwerke) ⭐

- **quelle:** Bayerisches Straßeninformationssystem (BAYSIS) — Geodatendienst „Bauwerke"
- **betreiber:** Bayerische Straßenbauverwaltung (StMB; Dienste über gisportal-stmb.bayern.de)
- **datentyp:** **Brücken sowie Tunnel- und Trogbauwerke** der Straßenbauverwaltung (bauliche Konstruktionen im Straßenverlauf, ab ≥ 2,00 m lichter Weite) — Kern-Hindernisdaten für GST
- **strassentyp:** Bauwerke an Straßen der bayerischen Straßenbauverwaltung (B/St + ggf. weitere)
- **format:** WFS (GML, **GeoJSON**, Shapefile, KML, CSV, GeoPackage), WMS
- **apiEndpunkt (verifiziert):**
  - WFS GetCapabilities: `https://gisportal-stmb.bayern.de/server/services/WFS/BAYSIS_Bauwerke/MapServer/WFSServer?request=GetCapabilities&service=WFS&version=2.0.0`
  - FeatureType: `BAYSIS_Bauwerke:bauwerke`
  - WMS-Server: `https://gisportal-stmb.bayern.de/server/services/WMS/BAYSIS_Bauwerke/MapServer/WMSServer`
- **update:** zu-bestätigen (BAYSIS-Bestand wird laufend gepflegt; Bauwerke-Layer kein tagesaktueller Stempel bestätigt)
- **auth:** keine (offen, keine Registrierung)
- **kosten:** keine
- **lizenz:** **CC BY 4.0** — Namensnennung: „Datenquelle: Bayerische Straßenbauverwaltung - BAYSIS (https://www.baysis.bayern.de)"
- **abdeckung:** Bayern, Netz der bayerischen Straßenbauverwaltung
- **zugang:** offen — direkt per WFS/WMS, keine Registrierung
- **verifiziert:** ja (WFS GetCapabilities live: FeatureType `bauwerke`, CRS EPSG:25832 default + 4326/3857/4258/31467/25833, Output u.a. GeoJSON, paging aktiv)
- **url:**
  - WFS-Übersicht: `https://www.baysis.bayern.de/internet/geodaten_dienste/wfs/`
  - WMS-Übersicht: `https://www.baysis.bayern.de/internet/geodaten_dienste/wms/index.html`
- **prio:** **P1 (Top-Treffer)**
- **sonstiges / WICHTIG:** Konkrete Attribut-Felder (Traglast/Tragfähigkeit, lichte Höhe/Durchfahrtshöhe, Breite) **nicht** aus GetCapabilities ersichtlich → per `DescribeFeatureType` abrufen:
  `…/BAYSIS_Bauwerke/MapServer/WFSServer?request=DescribeFeatureType&service=WFS&version=2.0.0`
  **TODO Implementierung:** DescribeFeatureType + Beispiel-GetFeature (GeoJSON) ausführen und prüfen, ob lichte Höhe / Traglast / Brückenklasse als strukturierte Felder vorhanden sind. Falls ja → strukturierte Brücken-Restriktionsquelle (selten!). Falls nur Bauwerksgeometrie/-typ → mit Bund-SIB-Bauwerke (BASt) kreuzen.

## B2. BAYSIS Straßennetz + Straßenbestand — WFS / WMS

- **quelle:** BAYSIS Geodatendienste „Straßennetz", „Straßenbestand", „Straßennetz nach ASB"
- **betreiber:** Bayerische Straßenbauverwaltung
- **datentyp:**
  - *Straßennetz:* klassifiziertes Netz (Bundes-, Staats-, Kreisstraßen) mit Abschnitten + Stationen (ASB)
  - *Straßenbestand:* **tagesaktuell** — Baulast, Bahnigkeit, Ortsdurchfahrt/Freie Strecke, **Fahrbahnbreiten**, Fahrstreifen
- **strassentyp:** B / St (Staatsstraßen, bayer. „L"-Äquivalent) / K — klassifiziert
- **format:** WFS (GML/GeoJSON), WMS
- **apiEndpunkt (verifiziert):**
  - Straßennetz WFS: `https://gisportal-stmb.bayern.de/server/services/WFS/BAYSIS_Strassennetz/MapServer/WFSServer?request=GetCapabilities&service=WFS&version=2.0.0`
  - Straßenbestand WFS: `https://gisportal-stmb.bayern.de/server/services/WFS/BAYSIS_Strassenbestand/MapServer/WFSServer?request=GetCapabilities&service=WFS&version=2.0.0`
  - Straßennetz-nach-ASB WMS: `https://gisportal-stmb.bayern.de/server/services/WMS/BAYSIS_Strassennetz_ASB/MapServer/WMSServer`
  - Straßenbestand WMS: `https://gisportal-stmb.bayern.de/server/services/WMS/BAYSIS_Strassenbestand/MapServer/WMSServer`
- **update:** **täglich** (Straßenbestand + Straßennetz „tagesaktuell")
- **auth:** keine (offen)
- **kosten:** keine
- **lizenz:** CC BY 4.0 (Namensnennung BAYSIS, s.o.)
- **abdeckung:** Bayern, klassifiziertes Netz
- **zugang:** offen — keine Registrierung
- **verifiziert:** ja (WFS-Liste bestätigt; täglicher Stand angegeben)
- **url:** `https://www.baysis.bayern.de/internet/geodaten_dienste/wfs/`
- **prio:** P1
- **sonstiges:** **Fahrbahnbreiten** im Straßenbestand sind direkt GST-relevant (Breiten-Engstellen). „Bahnigkeit" = ein-/zweibahnig. ASB-Stationierung = Anknüpfpunkt für Bauwerks- (B1) und Restriktionsverschnitt.

## B3. BAYSIS Fachnetze + weitere — WFS / WMS

- **quelle:** BAYSIS Geodatendienste „Fachnetze", „Bedarfsplan", „Verkehrsdaten", „Verwaltungsgrenzen"
- **betreiber:** Bayerische Straßenbauverwaltung
- **datentyp:**
  - *Fachnetze:* bedarfsabhängige Umleitungen (für GST-Routing als Alternativrouten interessant)
  - *Verkehrsdaten:* Verkehrszähldaten (Stand 2021)
  - *Verwaltungsgrenzen:* Grenzen Staatliche Bauämter / Straßenmeistereien
- **strassentyp:** abhängig vom Layer
- **format:** WFS (GML/GeoJSON), WMS
- **apiEndpunkt (verifiziert):**
  - Fachnetze WFS: `https://gisportal-stmb.bayern.de/server/services/WFS/BAYSIS_Fachnetze/MapServer/WFSServer?request=GetCapabilities&service=WFS&version=2.0.0`
  - Verkehrsdaten WFS: `https://gisportal-stmb.bayern.de/server/services/WFS/BAYSIS_Verkehrsdaten/MapServer/WFSServer?request=GetCapabilities&service=WFS&version=2.0.0`
  - Verwaltungsgrenzen WFS: `https://gisportal-stmb.bayern.de/server/services/WFS/BAYSIS_Verwaltungsgrenzen/MapServer/WFSServer?request=GetCapabilities&service=WFS&version=2.0.0`
- **update:** je Layer (Fachnetze/Verwaltungsgrenzen periodisch; Verkehrsdaten Stand 2021)
- **auth:** keine (offen)
- **kosten:** keine
- **lizenz:** CC BY 4.0 (BAYSIS)
- **abdeckung:** Bayern
- **zugang:** offen
- **verifiziert:** ja (WFS-Liste bestätigt)
- **url:** `https://www.baysis.bayern.de/internet/geodaten_dienste/wfs/`
- **prio:** P2
- **sonstiges:** „Fachnetze" (bedarfsabhängige Umleitungen) ggf. als kuratierte Lkw-/Schwerlast-tauglichere Routen nutzbar — Inhalt per GetFeature prüfen.

## B4. BayernInfo / ArbIS → Mobilithek — Baustellen (DATEX II)

- **quelle:** BayernInfo (Frontend) / Quellsystem **ArbIS** (Arbeitsstelleninformationssystem) → VIZ Bayern → Mobilithek
- **betreiber:** Bayerische Straßenbauverwaltung / VIZ Bayern (Verkehrsinformationszentrale); ArbIS gepflegt von Autobahn GmbH, 19 Straßenmeistereien/Bauämtern + diversen Landkreisen
- **datentyp:** Arbeits-/Baustellen (geplant + aktuell)
- **strassentyp:** A / B / St / K (ArbIS deckt zunehmend auch Sekundärnetz ab)
- **format:** DATEX II XML (HTTPS/SOAP-Übertragung)
- **apiEndpunkt (verifiziert, Mobilithek-Angebot):** `https://mobilithek.info/offers/110000000002507001` (Angebots-ID; tatsächlicher Datenabruf nach Mobilithek-Registrierung/Vertrag)
- **update:** alle ~3 Minuten
- **auth:** **Registrierung Mobilithek** (Bund-NAP; Nutzungsbedingungen + ggf. Datennutzungsvertrag je Angebot)
- **kosten:** kostenfrei
- **lizenz:** je Mobilithek-Angebot (Nutzungsbedingungen des Anbieters/Mobilithek)
- **abdeckung:** Bayern, netzweit
- **zugang:** eingeschränkt-offen — über Mobilithek-Konto (Registrierung), dann frei
- **verifiziert:** ja (BayernInfo-Datenangebot + Mobilithek-Angebots-ID bestätigt)
- **url:**
  - Datenangebot: `https://www.bayerninfo.de/en/about-bayerninfo-1/data-offer/private-transport-data`
  - Mobilithek-Angebot: `https://mobilithek.info/offers/110000000002507001`
- **prio:** P1
- **sonstiges:** Pendant zu BW-A1, aber Zugang über Mobilithek statt offenem HTTP. **Bayern hat KEINEN offenen Baustellen-GeoJSON-Feed** wie BW gefunden — der offene Weg in Bayern führt über Mobilithek (dynamisch) + BAYSIS-WFS (Geobasis). ArbIS selbst ist eine interne Anwendung.

## B5. BayernInfo / VIZ → Mobilithek — Verkehrsmeldungen (DATEX II)

- **quelle:** BayernInfo / VIZ Bayern → Mobilithek — „Traffic Reports"
- **betreiber:** VIZ Bayern (Verkehrsinformationszentrale Bayern)
- **datentyp:** Verkehrsmeldungen — Stau, **Sperrungen**, Gefahrenmeldungen, Ereignisse
- **strassentyp:** A / B / St / K
- **format:** DATEX II XML (HTTPS/SOAP)
- **apiEndpunkt (verifiziert, Mobilithek):** `https://mobilithek.info/offers/110000000002506000`
- **update:** alle ~3 Minuten
- **auth:** Registrierung Mobilithek
- **kosten:** kostenfrei
- **lizenz:** je Mobilithek-Angebot
- **abdeckung:** Bayern, netzweit
- **zugang:** eingeschränkt-offen (Mobilithek-Konto)
- **verifiziert:** ja
- **url:** `https://www.bayerninfo.de/en/about-bayerninfo-1/data-offer/private-transport-data` · `https://mobilithek.info/offers/110000000002506000`
- **prio:** P1
- **sonstiges:** Weitere BayernInfo-Mobilithek-Angebote (sekundär): Autobahn-Sensordaten CSV `https://mobilithek.info/offers/748580849261105152`, Verkehrssteuerungs-Schaltdaten DATEX II `…/763374701385560064` & `…/748573584302952448`, Lkw-Parkplatz-Belegung DATEX II `https://mobilithek.info/offers/804366929910210560`, Webcams (API). Lkw-Parken nur am Rande GST-relevant.

## B6. Bayerische Vermessungsverwaltung (LDBV/BVV) — ATKIS Basis-DLM / Geobasis

- **quelle:** Bayerische Vermessungsverwaltung (BVV) / LDBV — OpenData Geobasis
- **betreiber:** Landesamt für Digitalisierung, Breitband und Vermessung (LDBV) / BVV
- **datentyp:** ATKIS Basis-DLM (topographisches Landschaftsmodell, inkl. Objektbereich **Verkehr/Straßen** als Vektor); INSPIRE-WMS „Verkehrsnetze ATKIS Basis-DLM"
- **strassentyp:** Alle (Topographie)
- **format:** Download (Shapefile/GeoPackage), WFS, WMS, WMTS
- **apiEndpunkt:** null — über OpenData-Seite der BVV / Dienste-Seite aufzulösen (ATKIS-Download-Detailseite vorhanden, siehe url; INSPIRE-WMS Verkehrsnetze existiert laut INSPIRE-Geoportal-Record)
- **update:** periodisch (Geobasis-Fortführung)
- **auth:** keine (OpenData-Initiative Bayern)
- **kosten:** ausgewählte Datensätze/Dienste kostenfrei
- **lizenz:** **CC BY 4.0** — „Datenquelle: Bayerische Vermessungsverwaltung – www.geodaten.bayern.de"
- **abdeckung:** Bayern flächendeckend
- **zugang:** offen (OpenData-Seite der BVV)
- **verifiziert:** ja (CC-BY-4.0 + OpenData bestätigt); exakte Dienst-URLs zu-bestätigen
- **url:**
  - Dienste: `https://www.ldbv.bayern.de/produkte/dienste/geodatendienste.html`
  - ATKIS Download: `https://geodaten.bayern.de/opengeodata/OpenDataDetail.html?pn=atkis_basis_dlm`
  - INSPIRE-WMS Verkehrsnetze (Record): `https://inspire-geoportal.ec.europa.eu/srv/api/records/459d9c1c-4996-4076-8de3-5540ff16886a`
- **prio:** P2
- **sonstiges:** Geobasis-Verkehrsnetz für Bayern offen CC BY 4.0 — günstiger lizenziert als das BW-INSPIRE-Pendant (A6). Höhen/Restriktionen nicht das Hauptmerkmal; Netz-Geometrie + Klassifizierung.

## B7. open.bydata.de — Open-Data-Portal Bayern (Meta)

- **quelle:** open.bydata — zentrales Open-Data-Portal Bayern
- **betreiber:** Bayerisches Digitalministerium / Kompetenzstelle Open Data Bayern
- **datentyp:** Meta-Katalog (verlinkt BAYSIS-, BVV-, kommunale Datensätze)
- **strassentyp:** —
- **format:** Portal
- **apiEndpunkt:** null (Portal; CKAN-/DCAT-API zu-bestätigen)
- **update:** laufend
- **auth:** keine (Browsing)
- **kosten:** keine
- **lizenz:** je Datensatz
- **abdeckung:** Bayern
- **zugang:** offen
- **verifiziert:** ja (Portal live; einzelne Datensatzseiten rendern serverseitig, per Browser/CKAN-API auslesen)
- **url:** `https://open.bydata.de/`
- **prio:** P3
- **sonstiges:** Discovery für neue kommunale Restriktions-/Brücken-Datensätze. Einzelne Datensatz-Detailseiten (z.B. `/datasets/<uuid>`) waren per WebFetch nicht render-bar (Client-seitiges JS) → in Implementierung via CKAN/DCAT-API (`/api/...`) abfragen.

### Abdeckungslücken / Notizen — Bayern
- **Brücken-Attribut-Tiefe offen:** `BAYSIS Bauwerke` liefert Brücken/Tunnel/Trog als Geometrie + Typ — ob **Traglast/Brückenklasse und lichte Höhe** als strukturierte Felder enthalten sind, ist noch per `DescribeFeatureType`/`GetFeature` zu prüfen (siehe B1 TODO). Falls nicht enthalten → Bund-SIB-Bauwerke (BASt) ergänzen.
- **Kein offener Baustellen-GeoJSON wie BW:** Bayerns dynamische Daten (Baustellen B4, Meldungen B5) gehen über **Mobilithek (Registrierung)** — kein direkter offener HTTP-Feed gefunden. ArbIS ist intern.
- **GST-Negativkarte Bayern:** Keine öffentliche digitale Negativkarte/-feed gefunden. Tragfähigkeits-/Sperrlisten bei Regierungen / Staatlichen Bauämtern (ABD); Genehmigung über VEMAGS. → bei zuständiger Stelle anfragen (Bayern strebt schnellere GST-Genehmigungen an — laufende Digitalisierung beobachten).
- **Höhenkontrollen/Durchfahrtshöhen:** Punktuelle Höhenkontroll-Anlagen (z.B. Tunnel Eching/Etterschlag, 4,40 m) sind betrieblich dokumentiert, aber kein landesweiter offener Datensatz „Durchfahrtshöhen Bayern" gefunden. BAYSIS Bauwerke ist die nächstbeste strukturierte Quelle.
- **Bahnübergänge / Steigungen:** Nicht in BAYSIS-Diensten abgedeckt (Bahnübergänge → DB InfraGO, Bund-Katalog; Steigungen → aus DGM/Höhenmodell ableiten, BVV DGM).

---

## Gesamtfazit Süd (BW + Bayern)

| Aspekt | Baden-Württemberg | Bayern |
|---|---|---|
| **Dynamik (Baustellen/Meldungen)** | **Offen, direkt** (MobiData BW: CIFS/GeoJSON/DATEX/TIC3, keine Reg.) ✅ stärkste offene Lage | Über **Mobilithek (Registrierung)**, DATEX II |
| **Brücken/Bauwerke (Traglast/Höhe)** | **Lücke** — kein offenes Brücken-WFS gefunden | **BAYSIS Bauwerke WFS offen, CC BY 4.0** ✅ Top-Treffer |
| **Straßennetz (Geometrie)** | GML-Download (DL-DE/BY) + LGL-ATKIS | **BAYSIS Straßennetz/-bestand WFS, täglich, CC BY 4.0** ✅ + BVV-ATKIS |
| **Lizenz dynamische Feeds** | DL-DE/BY 2.0 (offen) | je Mobilithek-Angebot |
| **GST-Negativkarte** | nicht öffentlich (RP) | nicht öffentlich (Regierungen/ABD) |

**Komplementär:** BW glänzt bei **offenen dynamischen Feeds** (Baustellen/Meldungen ohne Registrierung), Bayern glänzt bei **offenen strukturierten Fach-Geodaten** (Bauwerke/Straßenbestand via WFS). Für ein bundeslandübergreifendes GST-System beide Stärken kombinieren — und in beiden Ländern die **Bauwerks-Traglast-/Negativkarten-Lücke** über die jeweiligen Straßenbaulastträger (RP BW / Regierungen + ABD Bayern) bzw. Bund-SIB-Bauwerke (BASt) schließen.
