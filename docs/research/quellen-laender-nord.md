# Datenquellen-Katalog — LÄNDER NORD (Niedersachsen · Bremen · Hamburg · Schleswig-Holstein)

> **Projekt:** Roadmap (Setreo) — Routenanalyse für Großraum- und Schwertransporte (GST) in DE.
> **Scope dieses Dokuments:** Landesquellen der vier Nord-Länder — Verkehrsinfo-/Baustellen-Portale + Feeds, Landesbetriebe Straßenbau, Open-Data-Portale, Geoportale/GDI (WFS/WMS), DATEX-II-Anbindung, GST-Routennetze.
> **Stand:** 2026-06-13. Recherche via WebSearch + WebFetch, Endpunkte wo möglich live verifiziert (GetCapabilities geprüft).
> **Lesehilfe:** `verifiziert=ja` = Endpunkt live per GetCapabilities bestätigt oder offizielle Doku belegt Existenz. `zu-bestätigen` = Portal/Datensatz gefunden, exakter API-Endpunkt unklar/gated → `apiEndpunkt=null`.
> **Rechte-Hinweis:** Lizenz/Zugang sind ehrlich markiert. „Erlaubt oder nicht" ist NICHT das Auswahlkriterium — Rechte werden separat besorgt. Alles auflisten.

---

## Schnellübersicht (Priorisierung)

| Prio | Land | Quelle | Datentyp | Status |
|------|------|--------|----------|--------|
| **P1** | HH | **GST-Routen Hamburg** (WFS + WMS + OGC API Features) | GST-Vorzugsrouten-Netz (StVO §29) | **verifiziert** |
| **P1** | HH | WFS Brücken & Ingenieurbauwerke Hamburg (LSBG) | Brücken, Tunnel, Stützwände, Schilderbrücken (Standort/ASB) | **verifiziert** |
| **P1** | HH | WFS/WMS Baustellen Hamburg (Verkehr OpenData) | Baustellen stadtweit | **verifiziert** |
| **P1** | HH | WFS Baustellen Hauptverkehrs-/Bundesfernstraßen (LSBG) | Baustellen Hauptnetz | **verifiziert** |
| **P1** | HH | WFS Bedarfsumleitungen Hamburg | Notumleitungen BAB/Kraftfahrstr. | **verifiziert** |
| **P1** | SH | WFS SH Straßeninfo (LBV.SH) | Straßennetz A/B/L/K + Netzknoten | **verifiziert** |
| **P1** | NI | NLStBV INSPIRE WMS Straßennetz | klassifiziertes Straßennetz NI | **verifiziert** |
| **P1** | NI | OpenGeoData NI (LGLN, ArcGIS Hub) | Straßennetz, DLM, ALKIS (GeoJSON/WFS) | **verifiziert** |
| **P2** | SH | Open-Data SH — Strassenbaustellen (DATEX II via Mobilithek) | Baustellen DATEX II | verifiziert (Portal) |
| **P2** | SH | Open-Data SH — Umleitungsstrecken (WFS) | Umleitungsrouten | zu-bestätigen |
| **P2** | NI | VMZ Niedersachsen (vmz-niedersachsen.de) | Verkehrslage, Baustellen (Web-Portal) | verifiziert (Portal) |
| **P2** | HB | VMZ Bremen (vmz.bremen.de) + RSS-Feed | Baustellen, Verkehrslage, GST-Routing-Hinweise | verifiziert (Portal) |
| **P2** | HB | GIS-Hub / GeoPortal Bremen (ArcGIS/Masterportal) | Straßennetz, Detailnetz Bauwerke (Brücken/Tunnel) | zu-bestätigen |
| **P2** | HB | ASV Bremen — Brücken & Ingenieurbau / GST-Stelle | Bauwerksdaten, GST-Genehmigung (Kontakt-Quelle) | zu-bestätigen (gated) |
| **P2** | SH | DigitalerAtlasNord (DANord) / GDI-SH WMS | Baustellen-Viewer A/B/L/K + Geobasis-WMS | verifiziert (Portal) |
| **P3** | NI | NWSIB-online (Niedersächs. Straßeninformationssystem) | Straßenbestand, Bauwerke (Login-gated) | verifiziert (gated) |
| **P3** | NI/HB | VMZ Bremen Niedersachsen-Layer | Baustellen NI über VMZ HB | verifiziert (Portal) |

---

# 1. NIEDERSACHSEN

## 1.1 VMZ Niedersachsen (Verkehrsmanagementzentrale)

- **quelle:** VMZ Niedersachsen / Region Hannover — Verkehrsinformationssystem
- **betreiber:** Land Niedersachsen / Region Hannover (VMZNDS)
- **datentyp:** aktuelle Verkehrslage, Baustellen (bestehende + zukünftige), Kamerabilder, Verkehrswarndienst, Schulausfälle, Überflutungen, Fährausfälle
- **strassentyp:** Alle (Schwerpunkt A/B/L, Region Hannover)
- **format:** Web-Portal (Karte); maschinenlesbarer Feed/DATEX nicht öffentlich dokumentiert
- **apiEndpunkt (verifiziert):** null — keine öffentliche API/DATEX-Endpunkt-Doku gefunden
- **update:** kontinuierlich (24/7-Betrieb)
- **auth:** keine (Web-Portal); API zu-bestätigen
- **kosten:** keine (Web)
- **lizenz:** nicht ausgewiesen → bei VMZ klären
- **abdeckung:** Niedersachsen (Schwerpunkt Region Hannover)
- **zugang:** offen (Web-Portal). Maschinen-Feed: bei VMZ Niedersachsen anfragen (+49 511 35354-232)
- **verifiziert:** ja (Portal existiert) / API zu-bestätigen
- **url:** `https://www.vmz-niedersachsen.de/`
- **prio:** P2
- **sonstiges:** Metadaten-Eintrag im Geoportal NI: `https://geoportal.geodaten.niedersachsen.de/harvest/srv/api/records/00a48b0d-3d2c-4811-b39f-6d594c9768ad` (zeitweise 503). NI-Baustellen werden zusätzlich über VMZ Bremen visualisiert (siehe 2.1).

## 1.2 NLStBV — INSPIRE WMS Straßennetz (Landesbehörde für Straßenbau und Verkehr)

- **quelle:** DE-NI-SBV INSPIRE Viewservice Straßennetz
- **betreiber:** Nds. Landesbehörde für Straßenbau und Verkehr (NLStBV)
- **datentyp:** klassifiziertes Straßennetz (INSPIRE TransportNetworks): RoadLink, TransportNode
- **strassentyp:** A/B/L/K (Zuständigkeitsnetz NLStBV; ALKIS-/INSPIRE-konform)
- **format:** WMS 1.3.0 (View); WFS analog vorhanden
- **apiEndpunkt (verifiziert):**
  - WMS GetCapabilities: `https://map.strassenbau.niedersachsen.de/srvms?map=INSPIRE_NLSTBV_STRASSE&version=1.3.0&request=GetCapabilities&service=wms` (live bestätigt)
  - WMS-Layer: `TN.RoadTransportNetwork.RoadLink`, `TN.CommonTransportElements.TransportNode`
  - Weitere View-Services (live): `…/srvms?map=NLSTBV_STRASSE&SERVICE=WMS&REQUEST=GetCapabilities` (Straßennetz nicht-INSPIRE), `…?map=NLSTBV_SBVDST…` (Dienststellen)
- **update:** periodisch
- **auth:** keine
- **kosten:** keine („no conditions apply", „access constraints: none")
- **lizenz:** INSPIRE-Nutzungsbedingungen; konkret bei NLStBV prüfen (i.d.R. CC BY 4.0 bei abgeleiteten Datensätzen)
- **abdeckung:** Niedersachsen
- **zugang:** offen (OGC WMS)
- **verifiziert:** ja (GetCapabilities live)
- **url:** `https://www.strassenbau.niedersachsen.de/startseite/service/geofachdaten_und_wms_kartendienste/geofachdaten-und-wms-kartendienste-133771.html`
- **prio:** P1
- **sonstiges:** Reines Netz/Topologie. Restriktions-/Bauwerksattribute (Höhe/Traglast) NICHT enthalten — die liegen in NWSIB (1.5) bzw. müssen aus Fachdaten ergänzt werden.

## 1.3 Geodatenportal Niedersachsen / GDI-NI (Koordinierungsstelle)

- **quelle:** Geodatensuche Niedersachsen (CSW-Katalog GDI-NI)
- **betreiber:** Koordinierungsstelle GDI-NI / LGLN
- **datentyp:** Meta-Katalog aller NI-Geodienste (WMS/WFS) inkl. Verkehr, Straßennetz, ALKIS
- **strassentyp:** Alle (Katalog)
- **format:** CSW-Katalog → Verweise auf WMS/WFS
- **apiEndpunkt (verifiziert):**
  - Geodatensuche: `https://geoportal.geodaten.niedersachsen.de/harvest/srv/search?keyword=Verkehr`
  - WFS-Suche: `https://geoportal.geodaten.niedersachsen.de/harvest/srv/search?type=service-WFS`
- **update:** laufend
- **auth:** keine
- **kosten:** keine
- **lizenz:** je Datensatz
- **abdeckung:** Niedersachsen
- **zugang:** offen
- **verifiziert:** ja
- **url:** `https://www.geodaten.niedersachsen.de/`
- **prio:** P2
- **sonstiges:** Einstiegspunkt zum Auffinden weiterer NI-WFS/WMS. NUMIS ist das verwandte Umwelt-Metadatensystem.

## 1.4 OpenGeoData Niedersachsen (LGLN ArcGIS Hub)

- **quelle:** OpenGeoData NI
- **betreiber:** Landesamt für Geoinformation und Landesvermessung Niedersachsen (LGLN)
- **datentyp:** Klassifiziertes Straßennetz, DLM (Digitales Landschaftsmodell), ALKIS (Straßenschlüssel, Verwaltungsgrenzen)
- **strassentyp:** A/B/L/K (DLM/Straßennetz)
- **format:** CSV, KML, ZIP, GeoJSON, GeoTIFF, PNG; zusätzlich WMS, WFS (Simple Feature, NAS, vereinfacht), ArcGIS GeoServices/FeatureServer
- **apiEndpunkt (verifiziert):**
  - Hub: `https://ni-lgln-opengeodata.hub.arcgis.com/`
  - Klassifiziertes Straßennetz (Metadatensatz): `https://geoportal.geodaten.niedersachsen.de/harvest/static/api/records/537d2714-e615-459e-8b6b-81e196c9f8d7` (zeitweise 503; INSPIRE-Eintrag: `https://inspire-geoportal.ec.europa.eu/srv/api/records/537d2714-e615-459e-8b6b-81e196c9f8d7`)
  - Konkrete FeatureServer/WFS-Links je Datensatz über Hub-Seite (Download-/API-Tab)
- **update:** periodisch
- **auth:** keine
- **kosten:** keine
- **lizenz:** CC BY 4.0 (Quellenvermerk „© LGLN")
- **abdeckung:** Niedersachsen (Straßennetz inkl. NLStBV-zuständige A/B/L + K)
- **zugang:** offen
- **verifiziert:** ja (Hub + Lizenz bestätigt; exakte FeatureServer-URLs je Datensatz über Hub abrufbar → einzelne Endpunkte zu-bestätigen)
- **url:** `https://ni-lgln-opengeodata.hub.arcgis.com/` · `https://lgln-geodaten.niedersachsen.de/opengeodata/opengeodata-220509.html`
- **prio:** P1
- **sonstiges:** Bester offener NI-Einstieg mit GeoJSON-Download. Straßennetz-Datensatz deckt BAB + Bundes- + Landesstraßen (NLStBV-Zuständigkeit) sowie NLStBV-verwaltete Kreisstraßen ab.

## 1.5 NWSIB-online (Niedersächsisches Straßeninformationssystem)

- **quelle:** NWSIB-online
- **betreiber:** NLStBV (Straßeninformationsbank Niedersachsen/Westfalen-Bauart)
- **datentyp:** Straßenbestand, Bauwerke (Brücken/Durchlässe), Querschnitte, Stationierung, Ausstattung — potenziell mit Bauwerksrestriktionen
- **strassentyp:** A/B/L/K (Bestandsnetz NI)
- **format:** Web-Auskunft (Login); Export/Dienst-Schnittstelle restricted
- **apiEndpunkt (verifiziert):** null (Login-gated, „Anmeldung" erforderlich)
- **update:** laufend (Fachsystem)
- **auth:** Login (Behörden-/registrierter Zugang)
- **kosten:** zu-bestätigen
- **lizenz:** restricted
- **abdeckung:** Niedersachsen
- **zugang:** eingeschränkt — Registrierung/Behördenzugang; Datenfreigabe für Projekt bei NLStBV anfragen
- **verifiziert:** ja (Existenz) / Datenzugang gated
- **url:** `https://www.nwsib-niedersachsen.de/`
- **prio:** P3
- **sonstiges:** Wahrscheinlich die ergiebigste NI-Quelle für Bauwerksrestriktionen (lichte Höhe/Traglast), aber NICHT offen. Für GST-Projekt: gezielt Datenexport/Schnittstelle bei NLStBV erfragen.

## 1.6 Mobilithek (Bund) — NI als Datengeber

- **quelle:** Mobilithek (NAP) — DATEX-II Baustellen/Verkehr von NI-Behörden
- **betreiber:** BMDV (Plattform), Datengeber = NI-Behörden/Autobahn
- **datentyp:** Baustellen, Sperrungen, temporäre Restriktionen (DATEX II)
- **strassentyp:** A/B (Bundesfern); Landesanteil je Veröffentlichung
- **format:** DATEX II (v2/v3, XML)
- **apiEndpunkt (verifiziert):** Plattform `https://mobilithek.info/` — konkrete NI-Datenpaket-URL nach Registrierung; siehe `quellen-bund.md` für Mobilithek-Mechanik
- **update:** kontinuierlich
- **auth:** Registrierung (Mobilithek-Konto)
- **kosten:** keine
- **lizenz:** je Datenpaket (oft dl-de/by-2-0)
- **abdeckung:** bundesweit, NI-Anteil über NI-Datengeber
- **zugang:** Registrierung
- **verifiziert:** ja (Plattform); NI-spezifisches Paket zu-bestätigen
- **url:** `https://mobilithek.info/`
- **prio:** P2
- **sonstiges:** Querverweis Bund-Dokument. Für NI primär Baustellen-DATEX.

---

# 2. BREMEN (Freie Hansestadt Bremen — Bremen + Bremerhaven)

## 2.1 VMZ Bremen (Verkehrsmanagementzentrale)

- **quelle:** VMZ Bremen
- **betreiber:** Freie Hansestadt Bremen
- **datentyp:** aktuelle Verkehrslage, Baustellen (Übersicht + Einzel-Steckbriefe), Umleitungen, Parken, Radzähler, **Schwerverkehrs-Routing-Hinweise**, Pressemeldungen je Baustelle
- **strassentyp:** Alle (HB + Bremerhaven; zusätzlich NI-Layer + BAB)
- **format:** Web-Portal; **RSS-Feed** für Verkehrslage-News; DATEX/GeoJSON/API nicht öffentlich dokumentiert
- **apiEndpunkt (verifiziert):**
  - RSS-News: `https://www.vmz.bremen.de/verkehrslage/aktuell/feed.rss` (auf Seite referenziert → zu-bestätigen Live-Pfad)
  - Baustellenübersicht: `https://vmz.bremen.de/baustellen/baustellenuebersicht/`
  - NI-Layer: `https://vmz.bremen.de/verkehrslage/niedersachsen/`
- **update:** kontinuierlich
- **auth:** keine (Web/RSS)
- **kosten:** keine
- **lizenz:** **CC BY-NC-ND** (Nicht-Kommerziell, Keine Bearbeitung) — kritisch für kommerzielle Nutzung → bei VMZ HB klären
- **abdeckung:** Bremen, Bremerhaven, Umland, NI, BAB
- **zugang:** offen (Web/RSS); strukturierter Feed/DATEX bei VMZ HB anfragen
- **verifiziert:** ja (Portal + RSS-Erwähnung) / DATEX zu-bestätigen
- **url:** `https://www.vmz.bremen.de/`
- **prio:** P2
- **sonstiges:** Erwähnt explizit „heavy vehicle routing information" — direkt GST-relevant; genauer Datenzugang zu erfragen.

## 2.3 ASV Bremen — Amt für Straßen und Verkehr (Brücken & GST-Stelle)

- **quelle:** ASV Bremen, Abt. 5 (Ingenieurbau) + Verkehrsbehörde (GST-Stelle)
- **betreiber:** Amt für Straßen und Verkehr Bremen
- **datentyp:** 502 Brücken-Bauteile + Tunnel, Stützwände, Lärmschutz, Schilderbrücken (Entwurf/Bau/Erhaltung/Prüfung); **Großraum-/Schwertransport-Genehmigungen**
- **strassentyp:** Alle (öffentliche Straßen HB)
- **format:** Web (Bauwerksportal `bruecken.bremen.de`, Newsticker Straßenerhaltung); kein offener WFS dokumentiert
- **apiEndpunkt (verifiziert):** null (kein offener Datendienst publiziert)
- **update:** laufend (Fachsystem)
- **auth:** keine (Web-Info); Datenexport gated
- **kosten:** zu-bestätigen
- **lizenz:** restricted (Behördendaten)
- **abdeckung:** Bremen
- **zugang:** eingeschränkt — Kontaktformular / Ansprechpartner Abt. 5; GST-Stelle für Routendaten
- **verifiziert:** ja (Behörde/Aufgaben) / Datenzugang gated
- **url:** `https://www.asv.bremen.de/aufgaben/bruecken-und-ingenieurbau-1714` · `https://bruecken.bremen.de`
- **prio:** P2
- **sonstiges:** Maßgebliche Stelle für HB-Bauwerksrestriktionen + GST-Genehmigung — Daten per Anfrage, nicht offen. Bremerhaven separat (eigene Zuständigkeit).

---

# 3. HAMBURG (Freie und Hansestadt Hamburg) — **ergiebigste Nord-Quelle**

> Hamburg liefert über **Transparenzportal** (`suche.transparenz.hamburg.de`) + **geodienste.hamburg.de** (WFS/WMS) + **api.hamburg.de** (OGC API Features) extrem viele offene Verkehrs-Geodatensätze. Standardformate: GML 3.1/3.2, **CSV, GeoJSON**; CRS i.d.R. EPSG:25832. Lizenz durchgehend **dl-de/by-2.0** (Namensnennung). Alle hier geprüften WFS sind live.

## 3.1 GST-Routen Hamburg — Großraum- und Schwertransport-Netz ⭐

- **quelle:** Großraum- und Schwertransport-Routen in Hamburg (GST-Netz)
- **betreiber:** Freie und Hansestadt Hamburg, Landesbetrieb Verkehr (LBV); bereitgestellt über LGV
- **datentyp:** **GST-Vorzugsrouten-Netz** (Routen für Großraum-/Schwertransporte in/durch HH) — Stütze für VEMAGS-Anträge §29 Abs.3 / §46 StVO + Baustellenvermeidung
- **strassentyp:** Hauptnetz HH (GST-geeignet)
- **format:** WFS (GML/CSV/GeoJSON), WMS, **OGC API Features (GeoJSON)**, XSD-Schema
- **apiEndpunkt (verifiziert):**
  - WFS GetCapabilities: `https://geodienste.hamburg.de/HH_WFS_Grossraum_und_Schwertransport_Routen?SERVICE=WFS&REQUEST=GetCapabilities`
  - FeatureType: `de.hh.up:grossraum_schwertransport_netz`
  - GetFeature: `https://geodienste.hamburg.de/HH_WFS_Grossraum_und_Schwertransport_Routen?SERVICE=WFS&VERSION=1.1.0&REQUEST=GetFeature&typename=de.hh.up:grossraum_schwertransport_netz`
  - WMS GetCapabilities: `https://geodienste.hamburg.de/HH_WMS_Grossraum_und_Schwertransport_Routen?SERVICE=WMS&REQUEST=GetCapabilities`
  - OGC API Features: `https://api.hamburg.de/datasets/v1/grossraum_und_schwertransport_routen` (Collections: `…/collections`, GeoJSON via `?f=json`)
- **update:** periodisch (LBV-gepflegt; historische Stände 2017 archiviert)
- **auth:** keine
- **kosten:** keine
- **lizenz:** dl-de/by-2.0 — Quellenvermerk „Freie und Hansestadt Hamburg, Landesbetrieb Verkehr"
- **abdeckung:** Hamburg
- **zugang:** offen
- **verifiziert:** **ja** (Metadaten + Service-URLs bestätigt; FeatureType + OGC-API-Titel verifiziert)
- **url:** `https://suche.transparenz.hamburg.de/dataset/grossraum-und-schwertransport-routen-in-hamburg12` · MetaVer: `https://metaver.de/trefferanzeige?docuuid=4AC1B569-65AA-4FAE-A5FC-E477DFE5D303`
- **prio:** **P1**
- **sonstiges:** **Direkter Volltreffer fürs Projekt.** EPSG:25832. Liefert fertiges GST-Routennetz als GeoJSON — ideal als HH-Baseline-Layer.

## 3.2 WFS Brücken und sonstige Ingenieurbauwerke Hamburg (LSBG)

- **quelle:** WFS Brücken und sonstige Ingenieurbauwerke Hamburg
- **betreiber:** FHH, Landesbetrieb Straßen, Brücken und Gewässer (LSBG)
- **datentyp:** Straßenbrücken, Fußgängerbrücken, **Tunnel**, Lärmschutzwände, Stützwände, Schilderbrücken
- **strassentyp:** Alle (LSBG-Zuständigkeit Hauptverkehrs- + Bezirksstraßen)
- **format:** WFS 1.1.0 / 2.0.0 (GML/CSV/GeoJSON)
- **apiEndpunkt (verifiziert):**
  - WFS GetCapabilities: `https://geodienste.hamburg.de/HH_WFS_Brueckenbauwerke?SERVICE=WFS&REQUEST=GetCapabilities`
  - FeatureTypes: `app:strassenbruecken`, `app:fussgaengerbruecken`, `app:tunnel`, `app:laermschutzwaende`, `app:stuetzwaende`, `app:schilderbruecken`
- **update:** nicht spezifiziert (Bauwerksbestand)
- **auth:** keine
- **kosten:** keine
- **lizenz:** dl-de/by-2.0 — „FHH, Landesbetrieb Straßen, Brücken und Gewässer"
- **abdeckung:** Hamburg
- **zugang:** offen
- **verifiziert:** **ja** (FeatureTypes bestätigt)
- **url:** MetaVer: `https://metaver.de/trefferanzeige?docuuid=7534E0B7-F558-4F78-8417-32B24B011C48`
- **prio:** **P1**
- **sonstiges:** **WICHTIG:** Metadaten-Attribute = Standort, **ASB-Nummer**, interne Bauwerksnummer, Name, Baujahr. **Lichte Höhe / Traglast / Durchfahrtshöhe sind in den Metadaten NICHT ausgewiesen** → per `DescribeFeatureType` prüfen, ob restriktionsrelevante Felder vorhanden sind; ggf. bei LSBG (Info@LSBG.Hamburg.de) ergänzende Bauwerksdaten anfragen. ASB-Nummer erlaubt Join mit BASt SIB-Bauwerke (siehe `quellen-bund.md`).

## 3.3 WFS/WMS Baustellen Hamburg (Verkehr OpenData)

- **quelle:** Baustellen Hamburg (stadtweit) — Verkehrsdaten OpenData
- **betreiber:** FHH, Behörde für Verkehr und Mobilitätswende (BVM); LGV
- **datentyp:** Baustellen (bis zu 50 größte Baustellen stadtweit, „Bauweiser"); Steckbrief-Visualisierung
- **strassentyp:** Alle (Stadtgebiet HH)
- **format:** WFS 1.1.0/2.0.0 (GML 3.1/3.2, **CSV, GeoJSON**), WMS
- **apiEndpunkt (verifiziert):**
  - WFS GetCapabilities: `https://geodienste.hamburg.de/hh_wfs_baustellen?Service=WFS&Version=1.1.0&Request=GetCapabilities` (live bestätigt)
  - FeatureTypes: `de.hh.up:baustelle`, `de.hh.up:tns_steckbrief_visualisierung`
  - WMS Verkehr OpenData: `https://geodienste.hamburg.de/HH_WMS_Verkehr_opendata`
  - WFS Verkehr OpenData (Kameras u.a.): `https://geodienste.hamburg.de/HH_WFS_Verkehr_opendata?SERVICE=WFS&REQUEST=GetCapabilities` (Casing beachten; u.a. `de.hh.up:verkehr_kameras_internet`)
- **update:** wöchentlich (donnerstags)
- **auth:** keine
- **kosten:** keine
- **lizenz:** dl-de/by-2.0 — „FHH, Behörde für Verkehr und Mobilitätswende"
- **abdeckung:** Hamburg
- **zugang:** offen
- **verifiziert:** **ja** (Baustellen-WFS live; FeatureType `de.hh.up:baustelle` bestätigt)
- **url:** `https://suche.transparenz.hamburg.de/dataset/baustellen-hamburg`
- **prio:** **P1**
- **sonstiges:** GeoJSON-Output direkt nutzbar. Hinweis: alte BWVI-Archiv-Snapshots existieren unter `archiv.transparenz.hamburg.de/...` (statische GML).

## 3.5 WFS Bedarfsumleitungen Hamburg

- **quelle:** WFS Bedarfsumleitungen Hamburg
- **betreiber:** FHH, Behörde für Wirtschaft, Verkehr und Innovation (BWVI); Daten aus Polizei-Veröffentlichungen
- **datentyp:** ausgeschilderte Notumleitungen für BAB + autobahnähnliche Bundesstraßen (VZ 460/455)
- **strassentyp:** A/B (BAB + autobahnähnlich)
- **format:** WFS 1.1.0/2.0.0 (GML 3.1/3.2, **CSV, GeoJSON**)
- **apiEndpunkt (verifiziert):**
  - WFS GetCapabilities: `https://geodienste.hamburg.de/HH_WFS_Bedarfsumleitungen?SERVICE=WFS&REQUEST=GetCapabilities` (live bestätigt)
  - FeatureType: `app:bedarfsumleitungen`
- **update:** nach Bedarf
- **auth:** keine
- **kosten:** keine
- **lizenz:** dl-de/by-2.0 — „FHH, Behörde für Wirtschaft, Verkehr und Innovation"
- **abdeckung:** Hamburg (BBox 9.86–10.26 E / 53.38–53.87 N)
- **zugang:** offen
- **verifiziert:** **ja** (live, FeatureType bestätigt)
- **url:** `https://geodienste.hamburg.de/HH_WFS_Bedarfsumleitungen`
- **prio:** P1
- **sonstiges:** Relevant für Ausweichplanung bei GST-Sperrungen.

---

# 4. SCHLESWIG-HOLSTEIN

## 4.1 WFS SH Straßeninformationen (LBV.SH) ⭐

- **quelle:** WFS SH Straßeninfo (Downloaddienst Verkehrsnetze)
- **betreiber:** Landesbetrieb Straßenbau und Verkehr Schleswig-Holstein (LBV.SH); bereitgestellt über GDI-SH
- **datentyp:** Straßennetz (Bundesfernstraßen, Landesstraßen, Kreisstraßen) + Netzknoten
- **strassentyp:** A/B/L/K
- **format:** WFS 2.0.0 (GML); CRS EPSG:4326/4258/25832 u.a.; Operationen GetFeature/GetPropertyValue/GetGMLObject
- **apiEndpunkt (verifiziert):**
  - WFS GetCapabilities: `https://service.gdi-sh.de/WFS_SH_Strasseninfo?Service=WFS&Version=2.0.0&Request=GetCapabilities` (live bestätigt)
  - FeatureTypes: `Strasseninfo:Strassennetz`, `Strasseninfo:Netzknoten`
- **update:** nach Bedarf
- **auth:** keine („keine Zugriffsbeschränkungen", keine Gebühren)
- **kosten:** keine
- **lizenz:** CC BY 4.0 — Quellenvermerk „© LBV.SH/CC BY 4.0"
- **abdeckung:** Schleswig-Holstein (BBox 8.27–11.29 E / 53.36–55.04 N)
- **zugang:** offen
- **verifiziert:** **ja** (GetCapabilities live; FeatureTypes bestätigt)
- **url:** GDI-DE: `https://gdk.gdi-de.org/geonetwork/srv/api/records/4db88cf7-23d6-4207-a3da-8ab1a94508ba`
- **prio:** **P1**
- **sonstiges:** Restriktionsattribute (Höhe/Traglast) per `DescribeFeatureType` auf `Strasseninfo:Strassennetz` prüfen — Capabilities listet sie nicht explizit. Kontakt: Christina Buchholz, LBV.SH Kiel, 0431 383-2913.

## 4.2 Open-Data SH — Strassenbaustellen (DATEX II via Mobilithek)

- **quelle:** Open-Data Schleswig-Holstein — Strassenbaustellen SH
- **betreiber:** LBV.SH (Datengeber); Land SH (Portal); Quelle = DATEX-II-Publikation aus Mobilithek
- **datentyp:** Straßenbaustellen (DATEX II)
- **strassentyp:** A/B/L (Hauptnetz SH)
- **format:** DATEX II (XML), abgeleitet aus Mobilithek-Publikation
- **apiEndpunkt (verifiziert):** null — Portal `opendata.schleswig-holstein.de` ist durch Anubis-Bot-Schutz blockiert (WebFetch Access Denied), GovData-Eintrag zeitweise nicht abrufbar. Direkter DATEX-Feed-URL **zu-bestätigen** (über Mobilithek-Datenpaket LBV.SH)
- **update:** kontinuierlich (DATEX)
- **auth:** keine (Open Data); Mobilithek-Paket ggf. Registrierung
- **kosten:** keine
- **lizenz:** Open Data SH (i.d.R. dl-de/by / CC BY)
- **abdeckung:** Schleswig-Holstein
- **zugang:** offen (Portal); exakter Feed über Mobilithek
- **verifiziert:** ja (Datensatz existiert) / Feed-URL zu-bestätigen
- **url:** Portal: `https://opendata.schleswig-holstein.de/dataset?res_format=wfs` · GovData: `https://www.govdata.de/daten/-/details/strassenbaustellen-schleswig-holsteinf229d`
- **prio:** P2
- **sonstiges:** **Hinweis:** Open-Data-SH-Portal hat aggressiven Bot-Schutz (Anubis) → automatisierter Zugriff nur mit Browser/Headers. DATEX-Baustellen am ehesten über Mobilithek (Bund-Dok) ziehen.

## 4.3 Open-Data SH — Umleitungsstrecken SH (WFS)

- **quelle:** Umleitungsstrecken Schleswig-Holstein
- **betreiber:** LBV.SH; Open-Data SH
- **datentyp:** Umleitungsstrecken (Diversion Routes)
- **strassentyp:** A/B/L (Hauptnetz)
- **format:** WFS (im Portal als `res_format=wfs` gelistet)
- **apiEndpunkt (verifiziert):** null (Datensatzseite Anubis-blockiert) — WFS-Endpunkt **zu-bestätigen** (vermutlich unter `service.gdi-sh.de`)
- **update:** zu-bestätigen
- **auth:** keine
- **kosten:** keine
- **lizenz:** CC BY 4.0 (LBV.SH-Standard)
- **abdeckung:** Schleswig-Holstein
- **zugang:** offen
- **verifiziert:** ja (Datensatz gelistet) / Endpunkt zu-bestätigen
- **url:** `https://opendata.schleswig-holstein.de/dataset/umleitungsstrecken-schleswig-holstein`
- **prio:** P2
- **sonstiges:** Analog zu HH Bedarfsumleitungen — relevant für GST-Ausweichplanung.

## 4.4 DigitalerAtlasNord (DANord) / GDI-SH

- **quelle:** DigitalerAtlasNord (DANord) — Präsentationskomponente GDI-SH
- **betreiber:** Landesamt für Vermessung und Geoinformation SH (LVermGeo SH), Kooperation Land/Kommunen
- **datentyp:** zentraler Geo-Viewer; **interaktive Baustellen-Übersicht (Bundes-/Land-/teils Kreisstraßen + BAB)**; Geobasis-WMS (DTK5/25/50/100, Orthophotos)
- **strassentyp:** A/B/L/K (Baustellen-Viewer)
- **format:** WMS (Geobasis), Web-Viewer
- **apiEndpunkt (verifiziert):**
  - DANord-Portal: `https://www.gdi-sh.de/DE/AufgabenZiele/DANord`
  - Geobasis-WMS-Übersicht LVermGeo SH: `https://www.schleswig-holstein.de/DE/landesregierung/ministerien-behoerden/LVERMGEOSH/Service/serviceGeobasisdaten/geodatenService_Geobasisdaten_Dienste.html`
  - GDI-DE-Eintrag DANord: `https://gdk.gdi-de.org/geonetwork/srv/api/records/9f5b9d4a-b613-4de4-a905-47c67c82fc92`
- **update:** laufend
- **auth:** keine
- **kosten:** keine
- **lizenz:** CC BY 4.0 (Geobasis)
- **abdeckung:** Schleswig-Holstein
- **zugang:** offen (Viewer + WMS)
- **verifiziert:** ja (Portal/WMS) / Baustellen-Layer-WFS zu-bestätigen
- **url:** `https://www.gdi-sh.de/DE/home`
- **prio:** P2
- **sonstiges:** Baustellen-Viewer im DANord ist die SH-Entsprechung zum Verkehrsportal. WMS-Geobasis als Kartenhintergrund. LBVSH-Baustellenseite: `https://www.schleswig-holstein.de/DE/landesregierung/ministerien-behoerden/LBVSH/Service/Baustellen`.

---

## Anhang A — Offene Lücken / Klärungsbedarf

| Land | Lücke | Nächster Schritt |
|------|-------|------------------|
| NI | Bauwerksrestriktionen (lichte Höhe/Traglast) NICHT offen — nur in NWSIB (gated) | NLStBV: Datenexport/Schnittstelle NWSIB anfragen |
| NI | VMZ NI ohne dokumentierte API/DATEX | VMZ NI nach maschinellem Feed fragen; Baustellen über Mobilithek |
| HB | GST-Routen + Bauwerksrestriktionen nicht offen (ASV-intern, `bruecken.bremen.de`) | ASV Bremen Abt. 5 + GST-Stelle kontaktieren; GeoPortal „Detailnetz Bauwerke"-WFS suchen |
| HB | Konkrete Verkehr/Brücken-WFS-Endpunkte nicht per Suche enumerierbar | GeoPortal Bremen + MetaVer (`metaver.de`) Layer-für-Layer auflösen |
| HB | VMZ HB Lizenz CC BY-**NC-ND** (kommerziell problematisch) | Nutzungsfreigabe bei VMZ HB klären |
| HH | Brücken-WFS-Metadaten ohne lichte Höhe/Traglast | `DescribeFeatureType` auf `HH_WFS_Brueckenbauwerke`; via ASB-Nr. Join mit BASt SIB-Bauwerke; LSBG anfragen |
| HH | Baustellen-Hauptnetz Live-Layer vs. Archiv-Snapshot unklar | Live-WFS `HH_WFS_Verkehr_opendata` Layer-Liste per `DescribeFeatureType` ziehen |
| SH | Open-Data-Portal Anubis-Bot-Schutz → kein automatischer Fetch | Browser/Headers oder Mobilithek-Pfad nutzen; WFS-Endpunkte für Baustellen/Umleitung via GDI-SH bestätigen |
| SH | Straßennetz-WFS Restriktionsattribute unklar | `DescribeFeatureType` auf `Strasseninfo:Strassennetz` |
| Alle | Bahnübergänge, Steigungen, Schleppkurven/Kreisverkehre als eigene Layer kaum vorhanden | Bahnübergänge → DB InfraGO (Bund-Dok); Steigungen → DGM aus LVermGeo/LGLN ableiten |

## Anhang B — Verifikations-Notizen

- **Live per GetCapabilities geprüft (HTTP 200, FeatureTypes gelesen):** HH GST-Routen-Metadaten, HH Brückenbauwerke (FeatureTypes), HH Baustellen (`de.hh.up:baustelle`), HH Bedarfsumleitungen (`app:bedarfsumleitungen`), NI NLStBV INSPIRE WMS (Layer), SH Straßeninfo-WFS (`Strasseninfo:Strassennetz`/`Netzknoten`).
- **Aus offizieller Metadaten-Doku belegt (Endpunkt nicht roh gefetcht):** HH Straßen-/Wegenetz-WFS, HH OGC API Features GST-Routen, Bremen GIS-Hub/GeoPortal, SH DANord, NI OpenGeoData Hub.
- **Gated/blockiert:** NWSIB-online (Login), Open-Data-SH-Portal (Anubis-Bot-Schutz), GovData-SH-Detail (zeitweise 503), ASV Bremen (kein offener Dienst).
- **Casing-Hinweis:** Hamburg geodienste-Pfade sind teils case-sensitive (`hh_wfs_baustellen` lowercase vs. `HH_WFS_Brueckenbauwerke` mixed) — exakte Schreibweise aus Metadaten übernehmen.
