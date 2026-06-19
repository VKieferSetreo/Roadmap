# Datenquellen-Katalog — KOMMUNAL / STÄDTE (Municipal)

> **Projekt:** Roadmap (Setreo) — Routenanalyse für Großraum- und Schwertransporte (GST) in DE.
> **Scope dieses Dokuments:** Großstädte mit eigenen offenen Daten-/Geo-Portalen + kommunale/regionale Aggregatoren (München, Köln, Frankfurt, Stuttgart, Düsseldorf, Ruhrgebiet/RVR, Leipzig, Dresden, Hannover, Nürnberg, Essen, Dortmund, Bremen, Karlsruhe, Münster, Bonn, Mannheim, Wiesbaden, Aachen, Rostock + Regional-Plattformen).
> **Stand:** 2026-06-13. Recherche via WebSearch + WebFetch + Live-curl-Verifikation der Endpunkte.
> **Lesehilfe:** `verifiziert=ja` = Endpunkt live abgerufen (HTTP 200 + Feature-Inhalt geprüft) ODER offizielle Doku bestätigt. `zu-bestätigen` = Portal/Datensatz gefunden, exakter API-Endpunkt unklar oder Portal-Bot-blockiert → `apiEndpunkt=null`.
> **Rechte-Hinweis:** Lizenz/Zugang sind ehrlich markiert. „Erlaubt oder nicht" ist NICHT das Auswahlkriterium — Rechte werden separat besorgt. Alles auflisten.
> **Warum innerorts wichtig:** Für GST sind die kritischsten Engstellen oft innerorts — enge Kreisverkehre/Schleppkurven, niedrige Durchfahrten, lastbeschränkte Stadtbrücken, kurzfristige Baustellen. Kommunale Baustellen-Feeds sind tagesaktuell und decken genau das ab, was Bundes-/Landesquellen (nur A/B) verfehlen.

---

## Schnellübersicht (Priorisierung)

| Prio | Stadt/Quelle | Datentyp | Format | Status |
|------|--------------|----------|--------|--------|
| **P1** | **Rostock — Großraum-/Schwertransportrouten** (opendata-hro) | GST-Routen + gesperrte Ingenieurbauwerke (Achslast/Masse §34 StVZO) | GeoJSON/WFS/WMS | **verifiziert (live)** |
| **P1** | **München — Baustellen** (geoportal.muenchen.de GeoServer) | Baustellen/Sperrungen, tagesaktuell, 5.880 Features | WFS-GeoJSON/CSV/SHP/WMS | **verifiziert (live)** |
| **P1** | **Karlsruhe/TRK — Baustellen** (mobil.trk.de GeoServer) | Baustellen 8+ Kommunen + DATEX | GeoJSON/SHP/DATEX-XML/GraphQL | **verifiziert (live)** |
| **P1** | **Dortmund — Baustellen** (Opendatasoft) | Baustellen tagesaktuell+geplant, Punkt+Fläche | GeoJSON/CSV/API v2.1 | **verifiziert (live)** |
| **P1** | **Düsseldorf — Verkehrsmeldungen** (opendata.duesseldorf.de) | Baustellen/Sperrungen, DATEX-II-Schema | GeoJSON/KML/CSV/XML | **verifiziert (live)** |
| **P1** | **Münster — Baustellen** (geo.stadt-muenster.de GeoServer) | Baustellen mit Verkehrseinschränkung | WFS/GeoJSON/CSV/KML/SHP/WMS | **verifiziert** |
| **P1** | **Leipzig — Verkehrsraumeinschränkungen** (geodienste.leipzig.de) | Baustellen/Sperrungen (Punkt+Polygon) + Verkehrszeichen | WFS/GeoJSON/CSV | **verifiziert** |
| **P1** | **MobiData BW** (Aggregator) — Baustellen BEMaS | Baustellen BW (Bundes-/Land-/Kreisstraßen, tlw. kommunal) | CIFS/GeoJSON/DATEX-II | **verifiziert** |
| **P2** | **Köln — Verkehrsbeeinträchtigungen** (offenedaten-koeln.de) | Baustellen/Events/Sperrungen, TYP-codiert | GeoJSON (EPSG:4326) | verifiziert (Doku) |
| **P2** | **Bonn — Baustellen tagesaktuell + geplant** (opengeodata-bonn) | Baustellen mit Verkehrsrelevanz, 30d/1J | GeoJSON | **verifiziert** |
| **P2** | **Aachen — Baustellen Stadtgebiet** (offenedaten.aachen.de) | Baustellen/Verkehrsstörungen, tagesaktuell | WFS/WMS/CSV (Punkt/Linie/Fläche) | verifiziert (Doku; CKAN tw. 502) |
| **P2** | **Frankfurt — Straßenverkehrsamt/IGLZ** (offenedaten.frankfurt.de) | Baustellen/Verkehrsmeldungen → auch via Mobilithek DATEX-II | WFS/GeoJSON + DATEX-II | zu-bestätigen |
| **P2** | **RVR/Geonetzwerk Ruhr** — Baustellen (geodaten.herne.de) | Baustellen Herne/Ruhr | WFS/GeoJSON/SHP | verifiziert (Doku) |
| **P2** | **Dresden — Themenstadtplan/Open Data** (opendata.dresden.de) | Straßenbaustellen/Umleitungen | WFS/GeoJSON | zu-bestätigen |
| **P2** | **Karlsruhe Geoportal — Brücken/Bauwerke** | Brücken, Bauwerke, Verkehrstechnik (eigene Kategorie!) | WFS/WMS (tlw. auf Anfrage) | zu-bestätigen |
| **P3** | **Hannover (Region) — Geoportal/HannIT** | Geodaten/Verkehr, INSPIRE | WMS/WFS/Atom | zu-bestätigen |
| **P3** | **Nürnberg — GeoPortal** | städtische Geodaten | WMS/WFS | zu-bestätigen |
| **P3** | **Stuttgart — Open Data/Geoportal** | Verkehr/Bauen | WMS/WFS | zu-bestätigen |
| **P3** | **Mannheim — Open Data (Opendatasoft) + Geoportal** | v.a. Verkehrszähler; Baustellen im sep. Bauportal | GeoJSON/CSV/WFS | zu-bestätigen (Baustellen) |
| **P3** | **Bremen — Transparenzportal/GeoPortal** (Land) | Geodaten, 3D-Brücken (DOM5) | WMS/WFS | zu-bestätigen |

---

## 1. Rostock — Großraum- und Schwertransportrouten ⭐ (Direkt-Treffer)

- **quelle:** OpenData.HRO — Datensatz „Großraum- und Schwertransportrouten"
- **betreiber:** Hanse- und Universitätsstadt Rostock, Kataster-, Vermessungs- und Liegenschaftsamt (geo.sv.rostock.de)
- **datentyp:** **(a)** empfohlene GST-Wege in Rostock + Umgebung; **(b)** Standorte der städtischen **Ingenieurbauwerke ohne Befahrungsmöglichkeit** durch GST — d.h. für Fahrzeuge/Kombinationen mit Achslasten und/oder Gesamtmassen über den zulässigen Werten gem. **§ 34 StVZO** zur Überfahrt gesperrt. (Genau die Brücken/Bauwerks-Sperrlogik, die das Projekt braucht.)
- **strassentyp:** innerorts + Umland (kommunale Straßen)
- **format:** GeoJSON, WFS, WMS, GML, KML, GeoRSS, CSV, XLSX, SHP
- **apiEndpunkt (verifiziert live):**
  - GST-Wege (GeoJSON): `https://geo.sv.rostock.de/download/opendata/grossraum_schwertransportrouten/grossraum_schwertransportrouten_wege.json`
  - Ingenieurbauwerke gesperrt (GeoJSON): `https://geo.sv.rostock.de/download/opendata/grossraum_schwertransportrouten/grossraum_schwertransportrouten_ingenieurbauwerke.json` (live: 19 Features, Attribute `uuid, bauwerksnummer, art, bezeichnung`)
  - WFS: `https://geo.sv.rostock.de/geodienste/grossraum_schwertransportrouten/wfs`
  - WMS: `https://geo.sv.rostock.de/geodienste/grossraum_schwertransportrouten/wms`
- **update:** laufend gepflegt
- **auth:** keine
- **kosten:** keine
- **lizenz:** **CC-Zero (CC0)** — voll frei, keine Namensnennung nötig
- **abdeckung:** Rostock + Umgebung
- **zugang:** offen — direkt abrufbar
- **verifiziert:** **ja (live abgerufen)**
- **url:** `https://www.opendata-hro.de/dataset/grossraum_schwertransportrouten`
- **prio:** **P1**
- **sonstiges:** Bestes kommunales Muster-Vorbild für das Projekt — eine Stadt veröffentlicht GST-Routen + gesperrte Bauwerke explizit offen. Als Schema-/UX-Referenz nutzen. OpenData.HRO ist Standard-CKAN → alle Datensätze via `/api/3/action/package_show?id=...` maschinell abrufbar. Weitere relevante HRO-Datensätze: `baustellen` (CC0, voller Formatsatz), `durchlaesse` (Durchlässe/Culverts).

---

## 2. München — Baustellen (GeoPortal/GeoServer) ⭐

- **quelle:** Open Data Portal München — „Baustellen – Temporäre Einschränkungen beim Gehen, Fahren und Parken (Opendata)"
- **betreiber:** Landeshauptstadt München, Baureferat / GeoPortal München (Mobilitätsreferat). Quellen: SWM, MVG, Baureferat, Münchner Stadtentwässerung, private Bauträger.
- **datentyp:** aktuelle + geplante Baustellen und Haltverbote, die in den kommenden 4 Wochen Einschränkungen verursachen. Felder (live geprüft): `strasse_hausnr, betroffene_bereiche, beschreibung, beeintraechtigung, art, weitere_info, kontakt_oeffentlich, beginn_datum_kombiniert, ende_datum_kombiniert, fachliche_id`.
- **strassentyp:** innerorts (Schwerpunkt Innenstadt + Hauptverkehrsachsen)
- **format:** WFS (GML/GeoJSON/CSV/SHP), WMS, XML-Metadaten
- **apiEndpunkt (verifiziert live):**
  - WFS GeoJSON: `https://geoportal.muenchen.de/geoserver/mor_wfs/ows?service=WFS&version=1.1.0&request=GetFeature&typeName=mor_wfs:baustellen_opendata&outputFormat=application/json` (live: 5.880 Features)
  - WFS CSV: `…&outputFormat=csv` (Layer `mor_wfs:baustellen_4_weeks_opendata` ebenfalls verfügbar)
  - WMS GetCapabilities: `https://geoportal.muenchen.de/geoserver/mor_wfs/baustellen_opendata/ows?service=WMS&version=1.3.0&request=GetCapabilities`
- **update:** **täglich**
- **auth:** keine
- **kosten:** keine
- **lizenz:** **Datenlizenz Deutschland Namensnennung 2.0 (dl-by-de/2.0)** — Namensnennung „Landeshauptstadt München"
- **abdeckung:** Stadtgebiet München (Schwerpunkt innerstädtisch)
- **zugang:** offen — direkt abrufbar
- **verifiziert:** **ja (live abgerufen)**
- **url:** `https://opendata.muenchen.de/dataset/baustellen_4_weeks_opendata` · GeoPortal: `https://geoportal.muenchen.de/portal/opendata/`
- **prio:** **P1**
- **sonstiges:** Höhen-/Breiten-/Gewichts-Limits NICHT als Zahlfelder — stecken ggf. im Freitext `beschreibung`/`beeintraechtigung` (Parsing nötig). Münchner GeoPortal hat zudem eine interaktive Baustellenkarte (Digitaler Zwilling). Kontakt: `baustellen.mor@muenchen.de`.

---

## 3. Karlsruhe / TechnologieRegion Karlsruhe (TRK) — Baustellen ⭐

- **quelle:** Transparenzportal Karlsruhe (CKAN) — Datensatz „Baustellen"; Daten vom TRK-GeoServer (mobil.trk.de)
- **betreiber:** Stadt Karlsruhe / TechnologieRegion Karlsruhe, Tiefbauamt (TBA)
- **datentyp:** aktuelle + Vorschau-Baustellen. Felder (live geprüft): `id, gemeinde, vorgangszeitraum_von, vorgangszeitraum_bis, art, lage, tagesbaustelle, verursacher, zusatzinfo, sperrung, projektnummer, vorgangsnummer, datenquelle, stand`.
- **strassentyp:** innerorts (8+ Kommunen)
- **format:** GeoJSON, SHP (SHAPE-ZIP), DATEX-II-XML, GraphQL
- **apiEndpunkt (verifiziert live):**
  - Baustellen aktuell (GeoJSON): `https://mobil.trk.de/geoserver/TBA/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=TBA%3Abaustellen_aktuell&outputFormat=application%2Fjson` (live, mit `sperrung`-Feld)
  - Baustellen Vorschau (GeoJSON): `…typeName=TBA%3Abaustellen_vorschau&outputFormat=application/json`
  - DATEX-II: `https://mobil.trk.de/datex/datex.xml`
  - SHAPE-ZIP: `…&outputFormat=SHAPE-ZIP`
  - GraphQL: `https://mobil.trk.de/graphiql`
- **update:** laufend
- **auth:** keine
- **kosten:** keine
- **lizenz:** **CC-BY 4.0** (Namensnennung)
- **abdeckung:** Karlsruhe, Ettlingen, Rastatt, Baden-Baden, Bruchsal, Rheinstetten, Stutensee + Collectivité européenne d'Alsace (grenzüberschreitend!)
- **zugang:** offen — direkt abrufbar
- **verifiziert:** **ja (live abgerufen)**
- **url:** `https://transparenz.karlsruhe.de/dataset/baustellen`
- **prio:** **P1**
- **sonstiges:** Regionaler Aggregator über die Stadtgrenze hinaus (8 Kommunen + Elsass) — ein Endpoint deckt eine ganze Region ab. Transparenzportal = Standard-CKAN 2.11.x → `/api/3/action/package_search` voll nutzbar. Karlsruhe nennt im Geoportal eine eigene Kategorie **„Brücken und Bauwerke"** und **„Verkehrstechnik"** (siehe §17).

---

## 4. Dortmund — Baustellen (Opendatasoft) ⭐

- **quelle:** Open Data Dortmund (Opendatasoft) — Fachbereich 66 (Tiefbauamt)
- **betreiber:** Stadt Dortmund, FB66
- **datentyp:** Baustellen tagesaktuell + geplant, jeweils als Punkt- und Flächendatensatz. Felder (live geprüft, Punkt): `art_der_baumassnahme, auftraggeber, einschrankung, zeitraum, von, bis, stadtbezirk, status, kommune`.
- **strassentyp:** innerorts
- **format:** GeoJSON, CSV, JSON, Shapefile + Opendatasoft Explore API v2.1
- **apiEndpunkt (verifiziert live):**
  - tagesaktuell Punkte (GeoJSON-Export): `https://open-data.dortmund.de/api/explore/v2.1/catalog/datasets/fb66-baustellen-tagesaktuell/exports/geojson` (live; Dataset-IDs: `fb66-baustellen-tagesaktuell`, `fb66-baustellen-tagesaktuell-flachen`, `fb66-baustellen-geplant`, `fb66-baustellen-geplant-flachen`)
  - Records-API (paginierbar): `…/datasets/fb66-baustellen-tagesaktuell/records?limit=100`
  - Katalog-Discovery: `https://open-data.dortmund.de/api/explore/v2.1/catalog/datasets?where=search("baustelle")`
- **update:** **täglich** (zuletzt modifiziert 2026-06-13)
- **auth:** keine
- **kosten:** keine
- **lizenz:** **Datenlizenz Deutschland – Zero 2.0 (dl-zero-de/2.0)** — voll frei, keine Namensnennung
- **abdeckung:** Stadtgebiet Dortmund
- **zugang:** offen — direkt abrufbar
- **verifiziert:** **ja (live abgerufen)**
- **url:** `https://open-data.dortmund.de/explore/?q=baustelle`
- **prio:** **P1**
- **sonstiges:** Opendatasoft = sehr saubere REST-API (filter/where/exports). `einschrankung`-Freitextfeld enthält ggf. Höhen/Breiten/Gewichtshinweise. Selbes Plattform-Muster wie Mannheim (s.u.).

---

## 5. Düsseldorf — Verkehrsmeldungen (Mobilitätsdaten) ⭐

- **quelle:** Open Data Düsseldorf — „Verkehrsmeldungen (Mobilitätsdaten)"
- **betreiber:** Landeshauptstadt Düsseldorf, Amt für Verkehrsmanagement
- **datentyp:** Baustellen, verkehrsrelevante Ereignisse, Verkehrsstörungen im strategischen Verkehrsnetz. **DATEX-II-Schema** (live geprüft): `latitude, longitude, distanceAlong, roadName, roadNumber, situationRecord_type, comment, lane, numberOfLanesRestricted, trafficConstrictionType, probabilityOfOccurrence, publicEventType, roadOrCarriagewayOrLaneManagementType, overallEndTime, overallStartTime, situationVersionTime`.
- **strassentyp:** innerorts (strategisches Verkehrsnetz)
- **format:** XML (DATEX-II), GeoJSON, KML, CSV, JSON
- **apiEndpunkt (verifiziert live):**
  - GeoJSON: `https://opendata.duesseldorf.de/sites/default/files/publ-2056000_Verkehrsmeldungen_Geodaten.geojson` (live, HTTP 200)
  - XML (DATEX-II): `https://opendata.duesseldorf.de/sites/default/files/publ-2056000_Verkehrsmeldungen.xml`
  - KML: `…_Verkehrsmeldungen_Geodaten.kml`
  - CSV: `…_Verkehrsmeldungen_Geodaten_1.csv`
  - JSON: `…_Verkehrsmeldungen.json`
- **update:** häufig (statische Dateien werden regelmäßig regeneriert)
- **auth:** keine
- **kosten:** keine
- **lizenz:** Open.NRW / dl-de-by (über Open.NRW veröffentlicht) — exakte Variante bei Düsseldorf bestätigen
- **abdeckung:** Stadtgebiet Düsseldorf
- **zugang:** offen — direkt abrufbar (statische Files)
- **verifiziert:** **ja (GeoJSON live abgerufen)**
- **url:** `https://opendata.duesseldorf.de/dataset/verkehrsmeldungen-mobilitätsdaten` · GovData: `https://www.govdata.de/web/guest/daten/-/details/verkehrsmeldungen-mobilitatsdaten`
- **prio:** **P1**
- **sonstiges:** `trafficConstrictionType` + `roadOrCarriagewayOrLaneManagementType` sind strukturierte DATEX-II-Enums (Spurreduktion etc.). Achtung: statische Dateien (keine Live-WFS-Abfrage), Aktualität via `situationVersionTime` prüfen.

---

## 6. Münster — Baustellen (GeoServer/MapServer) ⭐

- **quelle:** Open Data Münster — Datensatz „Baustellen"
- **betreiber:** Stadt Münster (geo.stadt-muenster.de)
- **datentyp:** aktuelle + geplante Baustellen mit Einschränkungen für den Straßenverkehr
- **strassentyp:** innerorts
- **format:** GeoJSON, CSV, KML, Shapefile, WMS, WFS (1.0.0/1.1.0/2.0.0)
- **apiEndpunkt (verifiziert):**
  - GeoJSON (WFS): `https://geo.stadt-muenster.de/mapserv/odbaustellen_serv?SERVICE=WFS&VERSION=1.1.0&REQUEST=GetFeature&TYPENAME=baustellen&OUTPUTFORMAT=geojson&SRSNAME=EPSG:4326`
  - Weitere Resource-IDs (WFS 1.0/1.1/2.0, WMS, CSV, KML, SHP) gelistet auf der Datensatzseite
- **update:** regelmäßig (tagesaktuell-nah)
- **auth:** keine
- **kosten:** keine
- **lizenz:** **dl-by-de/2.0** — Namensnennung „Stadt Münster"
- **abdeckung:** Stadtgebiet Münster
- **zugang:** offen — direkt abrufbar
- **verifiziert:** **ja (Endpunkt aus Portal extrahiert)**
- **url:** `https://opendata.stadt-muenster.de/dataset/baustellen`
- **prio:** **P1**
- **sonstiges:** Münster-Portal ist DKAN/Drupal — die CKAN-`/api/3/action`-Pfade antworten teils mit 302/404, aber die Resource-URLs (geo.stadt-muenster.de MapServer) sind direkt nutzbar.

---

## 7. Leipzig — Verkehrsraumeinschränkungen + Verkehrszeichen ⭐

- **quelle:** Open Data Portal Leipzig — „Verkehrsraumeinschränkungen" (Punkte + Polygone), „Verkehrszeichen Stadt Leipzig"
- **betreiber:** Stadt Leipzig, Amt für Geoinformation und Bodenordnung (geodienste.leipzig.de, GeoServer)
- **datentyp:** aktuelle Verkehrsraumeinschränkungen (= Baustellen/Sperrungen) als Punkt + Polygon; zusätzlich **Verkehrszeichen** (enthalten Höhen-/Breiten-/Gewichts-Beschränkungszeichen!)
- **strassentyp:** innerorts
- **format:** WFS, GeoJSON, CSV
- **apiEndpunkt (verifiziert):**
  - Einschränkungen Punkte (GeoJSON): `https://geodienste.leipzig.de/l3/OpenData//wfs?VERSION=1.3.0&REQUEST=getFeature&typeName=OpenData%3Averkehrsraumeinschraenkungen_point&outputFormat=application/json`
  - Einschränkungen Polygone (GeoJSON): `…typeName=OpenData%3Averkehrsraumeinschraenkungen&outputFormat=application/json`
  - Verkehrszeichen (GeoJSON): `https://geodienste.leipzig.de/l3/OpenData//wfs?VERSION=1.3.0&REQUEST=getFeature&typeName=OpenData%3Averkehrszeichen&outputFormat=application/json`
  - WFS GetCapabilities: `https://geodienste.leipzig.de/l3/OpenData/verkehrsraumeinschraenkungen/wfs?REQUEST=GetCapabilities&SERVICE=WFS`
- **update:** laufend
- **auth:** keine
- **kosten:** keine
- **lizenz:** Lizenz im CKAN nicht explizit gesetzt → **bei Stadt Leipzig bestätigen** (Portal: freie Nutzung, Namensnennung der Lizenzbedingung)
- **abdeckung:** Stadtgebiet Leipzig
- **zugang:** offen — direkt abrufbar
- **verifiziert:** **ja (Endpunkt aus CKAN extrahiert)**
- **url:** `https://opendata.leipzig.de/dataset/verkehrsraumeinschrankungen-punkte-stadt-leipzig` · Karten-App „Baustellen in Leipzig" verlinkt
- **prio:** **P1**
- **sonstiges:** **Verkehrszeichen-Datensatz besonders wertvoll** — VZ 262 (Gewicht), 263 (Achslast), 264/265 (Breite/Höhe), 266 (Länge) verorten genau die GST-relevanten Beschränkungen. Selbe Goldgrube in jeder Stadt mit offenem VZ-Kataster.

---

## 8. MobiData BW — Baustellen-Aggregator (BEMaS) ⭐ (überregional)

- **quelle:** MobiData BW (Integrationsplattform IPL) — „Baustelleninformationen Baden-Württemberg"
- **betreiber:** Ministerium für Verkehr Baden-Württemberg / NVBW; Quelle: BEMaS (Baustellen- und Ereignismanagementsystem) der SVZ-BW
- **datentyp:** geplante + aktuelle Baustellen auf Bundes-, klassifizierten Land- und Kreisstraßen in BW (tlw. kommunal eingespeist)
- **strassentyp:** A/B/L/K (überwiegend außerorts, aber relevant für BW-weite Abdeckung)
- **format:** **CIFS** (Waze-Closure-Format), GeoJSON, DATEX-II
- **apiEndpunkt (verifiziert):**
  - GeoJSON: `https://api.mobidata-bw.de/datasets/traffic/roadworks/roadworks_geojson.json`
  - CIFS: `https://api.mobidata-bw.de/datasets/traffic/roadworks/roadworks_cifs.json`
  - DATEX-II: `https://api.mobidata-bw.de/datasets/traffic/roadworks/roadworks_svzbw.datex2.xml`
- **update:** laufend (BEMaS-Speisung)
- **auth:** keine (IPL offen; einige IPL-Dienste registrierungspflichtig — Baustellen-Endpunkte offen)
- **kosten:** keine
- **lizenz:** über MobiData BW / daten.bw — meist CC-BY/dl-by, je Datensatz prüfen
- **abdeckung:** Baden-Württemberg landesweit
- **zugang:** offen
- **verifiziert:** **ja (Doku + Endpunktpfade bestätigt)**
- **url:** `https://mobidata-bw.de/dataset/baustelleninformationen-baden-wurttemberg`
- **prio:** **P1** (als BW-Sammelquelle; ergänzt die Bundesquellen)
- **sonstiges:** Muster „Land-/Regional-Aggregator statt N Stadt-Endpunkte". CIFS ist ein closure-orientiertes Format (Waze) — gut für Sperrungs-Geometrien. Für Stuttgart/Mannheim/Karlsruhe innerorts trotzdem die Stadt-Feeds bevorzugen (BEMaS = klassifizierte Straßen).

---

## 9. Köln — Verkehrsbeeinträchtigungen

- **quelle:** Offene Daten Köln — „Verkehrsbeeinträchtigungen Stadt Köln"
- **betreiber:** Stadt Köln
- **datentyp:** Verkehrsbeeinträchtigungen durch Großveranstaltungen, Messen, Baustellen. `TYP`-codiert, u.a. „Baustelle", „Baustelle, Verbot der Einfahrt", „Aktuelle Verkehrsnachricht: Achtung". Geometrie WGS84 (EPSG:4326).
- **strassentyp:** innerorts
- **format:** GeoJSON (Drupal/DKAN-Resource)
- **apiEndpunkt:** Resource-Seite vorhanden, direkter stabiler GeoJSON-Link über Portal (Drupal-basiert; `/api/3/action`-Pfad liefert HTML statt JSON) → **apiEndpunkt = null (über Portal-Resource ziehen)**. Resource-Seite: `https://offenedaten-koeln.de/dataset/verkehrsbeeinträchtigungen-stadt-köln/resource/9c1897d1-de5b-47ea-92ef-1858bc1040df`
- **update:** laufend
- **auth:** keine
- **kosten:** keine
- **lizenz:** Offene Daten Köln (i.d.R. dl-de-by / CC-BY — je Datensatz prüfen)
- **abdeckung:** Stadtgebiet Köln
- **zugang:** offen
- **verifiziert:** **verifiziert (Existenz + Felder per Doku); exakter Direkt-Link zu-bestätigen**
- **url:** `https://offenedaten-koeln.de/dataset/verkehrsbeeinträchtigungen-stadt-köln`
- **prio:** **P2**
- **sonstiges:** Köln-Portal ist Drupal-OpenData (kein klassisches CKAN-API). Es existiert ein ArcGIS-Hub-Showcase „Baustellenkalender" auf ESRI-Basis als Alternativ-Bezug. Weitere Köln-Datensätze: `radverkehrsnetz`, `mobilitaetsrelevantes-verkehrsnetz-mrv` (MRV, via open.nrw).

---

## 10. Bonn — Baustellen tagesaktuell + geplant

- **quelle:** OpenGeoData:Bonn — „Baustellen tagesaktuell mit Ortsangabe" + „Geplante Straßenbaustellen 30 Tage und 1 Jahr"
- **betreiber:** Stadt Bonn, Tiefbauamt (stadtplan.bonn.de)
- **datentyp:** **(a)** tagesaktuelle Baustellen mit signifikantem Verkehrseinfluss; **(b)** geplante Baustellen (≥1 Woche bzw. verkehrlich bedeutsam) für die nächsten 30 Tage / 1 Jahr aus dem Masterplan
- **strassentyp:** innerorts
- **format:** GeoJSON
- **apiEndpunkt (verifiziert):**
  - tagesaktuell (GeoJSON): `https://stadtplan.bonn.de/geojson?Thema=14403`
  - geplant: eigener `Thema=`-Parameter (Datensatzseite „Geplante Straßenbaustellen 30 Tage und 1 Jahr")
- **update:** **täglich** (tagesaktuell); geplant laufend gepflegt
- **auth:** keine
- **kosten:** keine
- **lizenz:** **CC0** (Public Domain)
- **abdeckung:** Stadtgebiet Bonn
- **zugang:** offen — direkt abrufbar
- **verifiziert:** **ja (Endpunkt + Lizenz aus Portal)**
- **url:** `https://opengeodata-bonn.de/baustellen-tagesaktuell-mit-ortsangabe-bonn/` · geplant: `https://opengeodata-bonn.de/geplante-straßenbaustellen-30-tage-und-1-jahr-mit-ortsangabe-bonn/`
- **prio:** **P2**
- **sonstiges:** Einfaches `?Thema=<id>`-GeoJSON-Muster über stadtplan.bonn.de — weitere Themen (Netztopologie Stadtplan, Baumstandorte) über dieselbe API. Netztopologie ggf. nützlich fürs Routing.

---

## 11. Aachen — Baustellen Stadtgebiet

- **quelle:** Open Data Portal Aachen (CKAN) — „Baustellen Stadtgebiet Aachen"
- **betreiber:** Stadt Aachen
- **datentyp:** amtlich erfasste Straßenbaustellen — Ort, Art/Grund der Maßnahme, Start/Ende, Bemerkungen. Inkl. weiterer Verkehrsstörungen.
- **strassentyp:** innerorts
- **format:** WFS, WMS, CSV (Punkt / Linie / Fläche)
- **apiEndpunkt:** über CKAN-Resources (`https://offenedaten.aachen.de/api/3/action/package_show?id=baustellen-stadtgebiet-aachen`) — **CKAN-API war beim Test transient 502** → exakte WFS-URL **zu-bestätigen** (Resource-Liste enthält WFS/WMS/CSV). Geoportal: `https://geoportal.aachen.de/extern`
- **update:** **täglich**
- **auth:** keine
- **kosten:** keine
- **lizenz:** Open Data Aachen (über open.nrw, i.d.R. dl-de-by) — bestätigen
- **abdeckung:** Stadtgebiet Aachen
- **zugang:** offen
- **verifiziert:** **verifiziert (Doku); exakter Endpunkt zu-bestätigen (Portal 502 z.Zt.)**
- **url:** `https://offenedaten.aachen.de/dataset/baustellen-stadtgebiet-aachen` · Mobilitätsdashboard: `https://open.nrw/open-data/showroom/mobilitaetsdashboard-der-stadt-aachen`
- **prio:** **P2**
- **sonstiges:** Standard-CKAN (`/api/3/action/...`) — sobald Portal wieder erreichbar, Resource-URLs maschinell ziehbar. Kontakt: `opendata@mail.aachen.de`.

---

## 12. Ruhrgebiet — RVR / GEONETZWERK.RUHR + Herne-Baustellen

- **quelle:** GEONETZWERK.RUHR (vormals Geonetzwerk.metropoleRuhr) / Open Data RVR; Baustellen-Beispiel über Herne-GeoServer
- **betreiber:** Regionalverband Ruhr (RVR), Essen — im Auftrag von 11 kreisfreien Städten + 4 Kreisen der Metropole Ruhr
- **datentyp:** Baustellen (Beispiel Herne: aktuelle + geplante Baustellen mit Verkehrseinschränkung); regional gebündelte Geodaten (Bebauungspläne, Radnetz 43.000 km, Luftbilder)
- **strassentyp:** innerorts (regionsweit)
- **format:** WFS (2.0.0/1.1.0/1.0.0), GeoJSON, SHP; INSPIRE-Dienste
- **apiEndpunkt (verifiziert via Doku):**
  - Herne Baustellen WFS: `https://geodaten.herne.de/geoserver/verkehr/baustellen`
  - GeoJSON: `https://geodaten.herne.de/geoserver/verkehr/baustellen?SERVICE=WFS&REQUEST=GetFeature&TYPENAME=baustelle&OUTPUTFORMAT=GeoJSON&SRSNAME=EPSG:25832`
  - SHP: `…&OUTPUTFORMAT=shp&SRSNAME=EPSG:25832`
  - RVR-INSPIRE WFS (Beispiel): `https://geodaten.metropoleruhr.de/inspire/bodennutzung/metropoleruhr?REQUEST=GetCapabilities&SERVICE=WFS`
- **update:** Herne-Baustellen: zuletzt 2026-03-11
- **auth:** keine (WFS offen)
- **kosten:** keine
- **lizenz:** **ACHTUNG** Herne-Baustellen über open.nrw als „Andere geschlossene Lizenz / nicht offen" markiert → **Nutzung für Herne klären**. RVR-Geonetzwerk-Daten überwiegend offen, je Datensatz prüfen.
- **abdeckung:** Metropole Ruhr (Essen, Dortmund, Bochum, Herne, Gelsenkirchen, Duisburg … 11 Städte + 4 Kreise)
- **zugang:** offen (technisch); Lizenz teils restriktiv
- **verifiziert:** **verifiziert (Herne-Endpunkt); RVR-Aggregat-Endpunkte je Thema zu-bestätigen**
- **url:** `https://open.nrw/dataset/baustellen-rvr` · `https://www.rvr.ruhr/daten-digitales/geodaten/geonetzwerk/`
- **prio:** **P2**
- **sonstiges:** RVR ist der wichtigste regionale Aggregator für das gesamte Ruhrgebiet (Essen + Dortmund + Bochum etc.). Einzelne Städte (z.B. Dortmund, §4) führen zusätzlich eigene Portale. „baustellen-rvr" auf open.nrw zeigt faktisch auf Herne — d.h. je Stadt eigener GeoServer hinter dem Aggregator.

---

## 13. Frankfurt am Main — Straßenverkehrsamt / IGLZ

- **quelle:** Offene Daten Portal Frankfurt (CKAN) + GDI-FFM Geoportal; Verkehrsmeldungen via Integrierte Gesamtverkehrsleitzentrale (IGLZ)
- **betreiber:** Stadt Frankfurt, Straßenverkehrsamt / IGLZ
- **datentyp:** Baustellen, Verkehrsmeldungen, Verkehrsmengen, Bewohnerparken (Geoportal-Kategorie Mobilität & Verkehr). IGLZ speist Baustellen/Parken/Verkehrsmeldungen/Detektordaten standardisiert in die **Mobilithek (DATEX-II)** ein.
- **strassentyp:** innerorts
- **format:** WFS, GeoJSON (Geoportal); DATEX-II (über Mobilithek)
- **apiEndpunkt:** **zu-bestätigen** — Portal `offenedaten.frankfurt.de` hat TLS-Zertifikatsmismatch beim `www.`-Host und liefert dem Crawler tw. 404; Datensätze existieren (Organisation „Straßenverkehrsamt", Tags `Baustelle`/`Verkehrsmeldung`/`Verkehrsdaten`). DATEX-II-Baustellen Frankfurt am ehesten über Mobilithek/IGLZ. → `apiEndpunkt = null`
- **update:** laufend
- **auth:** keine (offene Daten); Mobilithek registrierungspflichtig
- **kosten:** keine
- **lizenz:** Offene Daten Frankfurt (dl-de-by / CC-BY je Datensatz) — bestätigen
- **abdeckung:** Stadtgebiet Frankfurt (+ Region via Regionalverband FrankfurtRheinMain Geoportal)
- **zugang:** offen (Portal); IGLZ-DATEX über Mobilithek (Registrierung)
- **verifiziert:** **zu-bestätigen** (Portal existiert, exakte Resource-URL durch Cert/404-Problem nicht live geholt)
- **url:** `https://offenedaten.frankfurt.de/organization/strassenverkehrsamt` · `https://offenedaten.frankfurt.de/dataset?tags=Verkehrsdaten` · Region: `https://www.region-frankfurt.de/Services/Geoportal`
- **prio:** **P2**
- **sonstiges:** Cross-Ref zu `quellen-bund.md`/Mobilithek: Frankfurt-IGLZ-Baustellen kommen **auch** bundesweit über Mobilithek (DATEX-II) — ggf. einfacher dort abgreifen als über das Stadt-Portal. Regionalverband FrankfurtRheinMain bietet zusätzlich Open-Data-WMS/WFS.

---

## 14. Dresden — Themenstadtplan / Open Data

- **quelle:** OpenDataPortal Dresden (>1.100 Datensätze) + Themenstadtplan (verkehrsportal.dresden.de)
- **betreiber:** Landeshauptstadt Dresden, Straßen- und Tiefbauamt; Smart City Dresden (Urban Platform)
- **datentyp:** Straßenbaustellen & Umleitungen (Verantwortung Straßen- und Tiefbauamt: Baustellen in Straßen, Gehwegen, Brücken), Verkehrsdaten
- **strassentyp:** innerorts
- **format:** WFS, GeoJSON (Portal gibt „standardisiert, maschinenlesbar" an)
- **apiEndpunkt:** **zu-bestätigen** — Portal `opendata.dresden.de` bestätigt, exakter Baustellen-WFS/GeoJSON-Endpunkt nicht live geholt. → `apiEndpunkt = null`
- **update:** laufend
- **auth:** keine
- **kosten:** keine
- **lizenz:** Dresden Open Data — kommerziell + nichtkommerziell erlaubt, Namensnennung der Lizenzbedingungen
- **abdeckung:** Stadtgebiet Dresden
- **zugang:** offen
- **verifiziert:** **zu-bestätigen**
- **url:** `https://opendata.dresden.de/` · Themenstadtplan: `https://www.dresden.de/stadtplan` · Verkehrsportal: `https://verkehrsportal.dresden.de/`
- **prio:** **P2**
- **sonstiges:** Dresden-Portal ist Teil der Urban Platform (Connected Urban Twins). >1.100 Datensätze → Baustellen-/Verkehrs-WFS sehr wahrscheinlich vorhanden, im Katalog gezielt nach „Verkehr"/„Baustelle" suchen.

---

## 15. Hannover (Region) — Geoportal / HannIT

- **quelle:** Geoportal der Region Hannover + Open GeoData LH Hannover
- **betreiber:** Region Hannover (Geodatenportal) / HannIT (kommunaler IT-Dienstleister, Bereich Mobilität & GIS); LH Hannover FB Planen & Stadtentwicklung
- **datentyp:** gebündelte Geodaten/Geodienste verschiedener Fachbereiche; Verkehr/Infrastruktur; INSPIRE-Verkehrsnetze
- **strassentyp:** innerorts + Region
- **format:** WMS, WFS, ATOM-Feeds (INSPIRE-konform via pmINSPIRE)
- **apiEndpunkt:** **zu-bestätigen** — Geoportal + Geodatendienste bestätigt, dedizierter Baustellen-Endpunkt nicht isoliert. INSPIRE-WFS: `https://geoportal.de/info/d05b0b56-cd9b-4f3a-a40c-7233796d3122` (Region Hannover Download-Dienst). → `apiEndpunkt = null` (für Baustellen)
- **update:** je Dienst
- **auth:** keine (Open GeoData)
- **kosten:** keine
- **lizenz:** Open GeoData (dl-de / CC-BY je Dienst)
- **abdeckung:** Region Hannover (21 Kommunen) + LH Hannover
- **zugang:** offen
- **verifiziert:** **zu-bestätigen**
- **url:** `https://www.hannover.de/.../Geodatenportal-der-Region-Hannover` · HannIT: `https://hannit.de/bereiche/mobilitaet-und-gis/` · OpenGeoData NI: `https://ni-lgln-opengeodata.hub.arcgis.com/`
- **prio:** **P3**
- **sonstiges:** Region Hannover = überregionaler kommunaler Verbund (Muster wie RVR/TRK). HannIT betreut Mobilität/GIS — Ansprechpartner für Baustellen-Feed. Niedersachsen-OpenGeoData (ArcGIS Hub) ergänzt landesweit.

---

## 16. Nürnberg — GeoPortal

- **quelle:** GeoPortal Nürnberg (Amt für Geoinformation und Bodenordnung)
- **betreiber:** Stadt Nürnberg
- **datentyp:** städtische Geodaten (GIS); ÖPNV separat über VAG-OpenData / VGN (GTFS)
- **strassentyp:** innerorts
- **format:** WMS, WFS
- **apiEndpunkt:** **zu-bestätigen** — GeoPortal bestätigt, dedizierter offener Baustellen-WFS nicht nachgewiesen. → `apiEndpunkt = null`
- **update:** je Dienst
- **auth:** unklar (teils auf Anfrage)
- **kosten:** unklar
- **lizenz:** je Datensatz
- **abdeckung:** Stadtgebiet Nürnberg
- **zugang:** eingeschränkt/zu-bestätigen
- **verifiziert:** **zu-bestätigen**
- **url:** `https://www.nuernberg.de/internet/geoinformation_bodenordnung/geoportal.html` · VAG-OpenData: `https://opendata.vag.de/` · VGN: `https://www.vgn.de/web-entwickler/open-data/`
- **prio:** **P3**
- **sonstiges:** Bayern-Muster: Stadt-Geoportal eher schmal/offen-arm; viel läuft über Bayern-Landesdienste (BayernAtlas, SDDI-Katalog Bayern, BAYSIS für Straßen-WFS) — siehe `quellen-laender.md` (Bayern). SDDI-Katalog listet u.a. „GeoPortal Servicekarte Baustellen München".

---

## 17. Karlsruhe Geoportal — Brücken & Bauwerke / Verkehrstechnik (separat vom Baustellen-Feed)

- **quelle:** Geoportal Karlsruhe (zentrale Geodaten-Sammelstelle der Stadtverwaltung)
- **betreiber:** Stadt Karlsruhe, Liegenschaftsamt/Geoinformation
- **datentyp:** explizite Kategorien **„Brücken und Bauwerke"**, **„Verkehrstechnik"**, **„Baustellenmanagement"** (im Geoportal gelistet) — potenziell Brücken-Standorte, Bauwerksdaten, Verkehrszeichen/Signalanlagen
- **strassentyp:** innerorts
- **format:** WMS, WFS, GeoJSON, CSV (produktabhängig); manche WMS „für internen Gebrauch auf Anfrage"
- **apiEndpunkt:** **zu-bestätigen** — Kategorien bestätigt, konkrete Brücken-WFS-URL nicht isoliert (Geoportal ≠ Transparenzportal-CKAN). → `apiEndpunkt = null`
- **update:** je Produkt
- **auth:** teils offen (Open Data), teils „auf Anfrage" (interne WMS)
- **kosten:** Open-Data-Teil kostenlos
- **lizenz:** Open Data (Landesinformationsfreiheitsgesetz / OpenGovernment)
- **abdeckung:** Stadtgebiet Karlsruhe
- **zugang:** offen (Open-Data-Teil) / eingeschränkt (interne Dienste)
- **verifiziert:** **zu-bestätigen**
- **url:** `https://www.karlsruhe.de/mobilitaet-stadtbild/bauen-und-immobilien/geoportal-karlsruhe/fachplaene` · eService/Open Data: `.../geoportal-karlsruhe/e-service-und-open-data`
- **prio:** **P2** (wegen expliziter Brücken/Bauwerk-Kategorie — selten offen!)
- **sonstiges:** Eine der wenigen Städte mit ausgewiesener „Brücken und Bauwerke"-Geodaten-Kategorie. Hier gezielt nach Traglast/lichter Höhe nachhaken. Ergänzt den verifizierten Karlsruhe-Baustellen-Feed (§3).

---

## 18. Mannheim — Open Data (Opendatasoft) + Geoportal + Mobilitäts-/Bauportal

- **quelle:** Stadt Mannheim Open Data (mannheim.opendatasoft.com, ~34 Datensätze) + Geoportal Mannheim + Mobilitätsportal
- **betreiber:** Stadt Mannheim
- **datentyp:** im offenen Portal v.a. **Verkehrszähler (Eco-Counter)**, Straßennamen/Straßentypen; **Baustellen leben im separaten „Baustellen-Online-Portal"** (digitale Aufgrabungs-/Genehmigungsanträge) + Mobilitätsportal (Echtzeit-Verkehr inkl. Baustellen) — nicht zwingend als offener Datensatz exportiert
- **strassentyp:** innerorts
- **format:** GeoJSON, CSV, Opendatasoft-API (Open Data); WMS/WFS (Geoportal)
- **apiEndpunkt (Open-Data-Katalog verifiziert):**
  - Katalog-API: `https://mannheim.opendatasoft.com/api/explore/v2.1/catalog/datasets`
  - z.B. `strassentypen-in-mannheim`, `strassennamen-in-mannheim` (dl-de-by 2.0)
  - Baustellen-Open-Dataset: **nicht gefunden** → `apiEndpunkt = null` für Baustellen
- **update:** je Datensatz
- **auth:** keine (Open Data)
- **kosten:** keine
- **lizenz:** **dl-de-by 2.0**
- **abdeckung:** Stadtgebiet Mannheim
- **zugang:** offen (Open Data); Bau-/Mobilitätsportal sind Web-Anwendungen
- **verifiziert:** **verifiziert (Katalog live); Baustellen-Open-Feed zu-bestätigen**
- **url:** `https://mannheim.opendatasoft.com/explore/` · Geoportal: `https://geoportal-mannheim.de/` · Mobilitätsportal: `https://gis-mannheim.de/mannheim_mobi/`
- **prio:** **P3**
- **sonstiges:** Selbes Opendatasoft-Muster wie Dortmund — saubere REST-API. Für Baustellen: Mobilitätsportal-Backend / Geoportal-WFS prüfen oder über MobiData BW (§8) / Land BW abgreifen.

---

---

## 20. Stuttgart — Open Data / Geoportal

- **quelle:** Open Data Portal LH Stuttgart + Geoportal Stuttgart
- **betreiber:** Landeshauptstadt Stuttgart
- **datentyp:** Stadtpläne, Basiskarten, Themen Planung/Umwelt/Verkehr/Freizeit; Open Geodata & Testdaten
- **strassentyp:** innerorts
- **format:** WMS/WMTS (Darstellung), WFS/WCS (Download) — produktabhängig
- **apiEndpunkt:** **zu-bestätigen** — Geoportal + Open-Data-Portal bestätigt, dedizierter offener Baustellen-Endpunkt nicht nachgewiesen. → `apiEndpunkt = null`
- **update:** je Dienst
- **auth:** keine (Open Data)
- **kosten:** keine
- **lizenz:** je Datensatz (dl-de / CC-BY)
- **abdeckung:** Stadtgebiet Stuttgart
- **zugang:** offen
- **verifiziert:** **zu-bestätigen**
- **url:** `https://www.stuttgart.de/service/digitalisierung/open-data-portal/open-data-portal` · Geoportal Open Data: `https://www.stuttgart.de/en/leben/bauen/geoportal/open-data-und-testdaten`
- **prio:** **P3**
- **sonstiges:** Für Stuttgart Baustellen am ehesten über **MobiData BW (§8)** / daten.bw / Land BW. Stuttgart-eigene offene Baustellen unklar — Geoportal-WFS-Katalog prüfen.

---


## 22. Essen — (Stadt + RVR-Sitz)

- **quelle:** Stadt Essen Geodaten + GEONETZWERK.RUHR (RVR sitzt in Essen)
- **betreiber:** Stadt Essen / RVR
- **datentyp:** Baustellen/Verkehr über RVR-Geonetzwerk-Verbund (Essen ist eine der 11 RVR-Städte)
- **strassentyp:** innerorts
- **format:** WFS/WMS (über RVR-Muster)
- **apiEndpunkt:** **zu-bestätigen** — Essen liefert in den RVR-Verbund; eigener offener Baustellen-Endpunkt analog Herne-Muster wahrscheinlich (`geodaten.essen.de`-GeoServer), nicht live verifiziert. → `apiEndpunkt = null`
- **update:** je Dienst
- **auth:** keine (technisch)
- **kosten:** keine
- **lizenz:** je Datensatz (RVR-Verbund; teils restriktiv wie Herne)
- **abdeckung:** Stadtgebiet Essen
- **zugang:** offen/zu-bestätigen
- **verifiziert:** **zu-bestätigen**
- **url:** über `https://www.rvr.ruhr/daten-digitales/geodaten/geonetzwerk/` und open.nrw-Suche „Essen"
- **prio:** **P3**
- **sonstiges:** Pragmatisch über RVR (§12) abdecken statt Einzelstadt. Jede RVR-Stadt betreibt oft einen eigenen GeoServer (`geodaten.<stadt>.de/geoserver/verkehr/baustellen`) — dieses Pfad-Muster systematisch durchprobieren (Herne ist verifiziertes Beispiel).

---

## Übertragbare Muster (für viele Städte gültig)

Diese Muster erlauben es, neue Städte schnell zu erschließen, ohne jede einzeln manuell zu recherchieren:

### M1 — Standard-CKAN-API (`/api/3/action/...`)
Viele Stadt-Open-Data-Portale laufen auf **CKAN**. Maschinelle Discovery:
- `https://<portal>/api/3/action/package_search?q=baustelle` → Datensätze finden
- `https://<portal>/api/3/action/package_show?id=<slug>` → Resourcen (Format + URL) auslesen
- **Verifizierte CKAN-Portale:** Karlsruhe (`transparenz.karlsruhe.de`), Rostock (`opendata-hro.de`), Leipzig (`opendata.leipzig.de`), Aachen (`offenedaten.aachen.de`).
- **Achtung Ausnahmen:** Köln (`offenedaten-koeln.de`) und Münster (`opendata.stadt-muenster.de`) laufen auf **Drupal/DKAN** — `/api/3/action` liefert HTML/302; Resource-URLs direkt von der Datensatzseite ziehen.

### M2 — Opendatasoft Explore API (`/api/explore/v2.1/...`)
- `https://<portal>/api/explore/v2.1/catalog/datasets?where=search("baustelle")` → Discovery
- `…/datasets/<id>/exports/geojson` bzw. `…/records?limit=100` → Daten
- **Verifizierte ODS-Portale:** Dortmund (`open-data.dortmund.de`), Mannheim (`mannheim.opendatasoft.com`).

### M3 — Kommunaler GeoServer mit `/geoserver/<workspace>/ows`
Städte mit eigener GDI hosten WFS auf einem GeoServer; GeoJSON via `outputFormat=application/json`:
- München: `geoportal.muenchen.de/geoserver/mor_wfs/ows`
- Karlsruhe/TRK: `mobil.trk.de/geoserver/TBA/ows`
- Leipzig: `geodienste.leipzig.de/l3/OpenData/wfs`
- Herne/RVR: `geodaten.herne.de/geoserver/verkehr/baustellen`
- Münster: `geo.stadt-muenster.de/mapserv/...` (UMN MapServer, analog)
- **Stadt-Pfad-Heuristik:** `geodaten.<stadt>.de/geoserver/verkehr/baustellen?...OUTPUTFORMAT=GeoJSON` lohnt systematisches Durchprobieren (besonders im RVR-Raum).

### M4 — Regionale Aggregatoren (1 Endpoint = N Kommunen)
Statt N Stadt-Endpunkte zu pflegen, einen Verbund anzapfen:
- **TechnologieRegion Karlsruhe (TRK)** — 8 Kommunen + Elsass, ein GeoServer.
- **RVR / GEONETZWERK.RUHR** — 11 Städte + 4 Kreise (Ruhrgebiet).
- **Region Hannover** — 21 Kommunen, INSPIRE-Dienste.
- **MobiData BW** — Land BW, Baustellen als CIFS/GeoJSON/DATEX-II.
- **Regionalverband FrankfurtRheinMain** — Rhein-Main Open-Data-WMS/WFS.

### M5 — DATEX-II / Mobilithek als überregionaler Backbone
Größere Städte (Frankfurt-IGLZ, Düsseldorf, Karlsruhe) liefern Baustellen **standardisiert in DATEX-II** — oft auch in die **Mobilithek** (Bund, siehe `quellen-bund.md`). Vorteil: einheitliches Schema (`trafficConstrictionType`, `roadOrCarriagewayOrLaneManagementType`, Spurreduktion), oft einfacher zentral abzugreifen als N Stadt-Portale. Format-Trio bei Aggregatoren: **CIFS** (Waze-Sperrungen) + **GeoJSON** + **DATEX-II**.

### M6 — Verkehrszeichen-Kataster = strukturierte Restriktionen
Wo eine Stadt ihr **Verkehrszeichen-Kataster** offen stellt (verifiziert: Leipzig), stecken dort die GST-relevanten Limits als VZ-Codes: VZ 262 (zul. Gesamtmasse), 263 (Achslast), 264 (Breite), 265 (Höhe), 266 (Länge). Das ist die sauberste strukturierte Quelle für Durchfahrtsbeschränkungen innerorts — gezielt nach „Verkehrszeichen"/„VZ-Kataster"/„Beschilderung" suchen.

### M7 — GovData / data.gov.de / open.NRW als Meta-Aggregatoren
- **GovData** (`govdata.de` / `data.gov.de`) harvested viele Kommunal-Portale → eine Suche `format=geojson groups=tran` findet stadtübergreifend Verkehrs-/Baustellen-Datensätze.
- **open.NRW** (`open.nrw`) bündelt alle NRW-Kommunen (Köln, Düsseldorf, Dortmund, Aachen, RVR …). NRW-Städte zuerst hier suchen.
- **daten.bw** bündelt Baden-Württemberg (Stuttgart, Karlsruhe, Mannheim).

### M8 — Brücken/Bauwerks-Geodaten als eigene Kategorie (selten, aber Gold)
Die meisten Städte stellen **keine** Brücken-Traglast/lichte-Höhe offen. Ausnahmen mit explizitem Bezug:
- **Rostock** — gesperrte Ingenieurbauwerke für GST (§34 StVZO) als GeoJSON (CC0) — Direkt-Treffer.
- **Karlsruhe Geoportal** — Kategorie „Brücken und Bauwerke" + „Verkehrstechnik".
- **Bremen** — DOM5 3D-Oberflächenmodell inkl. Brücken (lichte Höhe ableitbar).
Wo offen, hat dieser Datentyp höchste Priorität fürs Projekt.

---

## Abdeckungslücken (was kommunal fehlt / unsicher ist)

1. **Brücken-Traglast & lichte Höhe fast nirgends offen.** Außer Rostock (GST-Bauwerke), Karlsruhe (Kategorie vorhanden, Endpunkt offen) und indirekt Bremen (DOM5) gibt es kommunal **keine** strukturierten Brücken-Restriktionsdaten. Hauptquelle bleibt Bund/Land (BASt SIB-Bauwerke, VEMAGS) — siehe `quellen-bund.md`. Kommunale Brücken (Stadtbrücken, oft schwächste Glieder!) sind die größte Lücke.

2. **Numerische Limits stecken im Freitext.** Baustellen-Feeds (München `beschreibung`, Dortmund `einschrankung`, Aachen Bemerkungen) nennen Höhen/Breiten/Gewichts-Sperren meist **nur als Freitext** — NLP/Parsing nötig, keine sauberen Zahlfelder. Ausnahme: DATEX-II-Quellen (Düsseldorf) mit teil-strukturierten Enums.

3. **Engstellen / Kreisverkehre / Schleppkurven / Bahnübergänge / Steigungen — kommunal praktisch nicht als Fachdaten.** Diese müssen aus Geobasis/OSM/Geländemodellen abgeleitet werden, nicht aus Stadt-Open-Data. Bahnübergänge → DB InfraGO (Bund). Steigungen → DGM/Höhenmodelle (Land/BKG).

4. **Tunnel & Durchfahrtshöhen innerorts** selten als Datensatz; am ehesten im Verkehrszeichen-Kataster (M6, nur Leipzig verifiziert) oder Geländemodell. Rostock `durchlaesse` (Durchlässe) ist ein seltenes positives Beispiel.

5. **Lizenz-Heterogenität.** Spektrum von CC0 (Rostock, Bonn), dl-zero-de (Dortmund) über CC-BY/dl-by-de (München, Karlsruhe, Münster, Mannheim) bis **„nicht offen"** (Herne-Baustellen via RVR). Pro Quelle einzeln klären; kein einheitliches kommunales Lizenzregime.

6. **Bayern & Hessen: Stadt-Open-Data dünn.** Nürnberg, Wiesbaden (und tlw. Stuttgart) haben schmale offene Stadtdaten; viel läuft über Landesdienste (BayernAtlas/BAYSIS, Geoportal Hessen) oder Aggregatoren (MobiData BW). Für diese Städte Land-/Aggregator-Pfad bevorzugen.

7. **Portal-Erreichbarkeit/Technik wackelig.** Aachen-CKAN lieferte beim Test 502; Frankfurt-Portal hat TLS-Cert-Mismatch (`www.`) + 404-für-Crawler; Köln/Münster nicht klassisches CKAN. Für Produktion: Retry-Logik + portal-spezifische Adapter einplanen, nicht auf ein einheitliches API-Schema verlassen.

8. **Nicht jede Stadt exportiert ihren Baustellen-Live-Stand als offenen Datensatz.** Mannheim/Wiesbaden/Stuttgart haben Baustellen primär in internen Bau-/Mobilitätsportalen (Web-Apps), nicht zwingend als offenen GeoJSON/WFS-Feed → ggf. nur über Aggregator/DATEX oder gar nicht offen verfügbar.

---

## Cross-Referenzen

- **`quellen-bund.md`** — Mobilithek (DATEX-II Sammelpunkt für Frankfurt-IGLZ u.a.), BASt SIB-Bauwerke (Brücken), VEMAGS, DB InfraGO (Bahnübergänge), BKG (Geobasis/Höhen).
- **`quellen-schwertransport-aggregatoren.md`** — kommerzielle/Routing-Aggregatoren, ggf. überlappende Baustellen-Feeds.
- **`quellen-laender.md`** (falls vorhanden) — Land BW (MobiData BW), Bayern (BAYSIS), Hessen, NRW (open.NRW), Sachsen (Dresden/Leipzig Landesbezug), Bremen (Stadtstaat).
