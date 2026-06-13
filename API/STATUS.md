# API-Katalog — Status-Gesamtübersicht

> Auto-generiert aus den `abdeckung.txt` aller Ordner. **127 Quellen** gesamt.

**Legende:** 🟢 offen + live getestet (70) · 🟡 offen, Endpunkt/Parsing zu bestätigen (34) · 🔑 Account/Key nötig — Max beschafft (12) · ⚪ nur Portal/PDF (11)

| Status | Ebene | Quelle | Datentyp | Format | Zugang |
|---|---|---|---|---|---|
| 🟢 | Bundesweit | Autobahn GmbH API (verkehr.autobahn.de) | Baustellen (roadworks), Sperrung | REST-JSON | offen |
| 🟡 | Bundesweit | SIB-Bauwerke / ASB-ING — Bauwerks-Fachsystem (Br | DIE Kern-Bauwerksrestriktionen — | Fachdatenformat ASB-ING  | eingeschränkt |
| 🟢 | Bundesweit | BASt BISStra — Bundesfernstraßennetz (ASB-basier | Straßennetz Bundesfernstraßen mi | WFS, WMS (OGC), zusätzli | offen |
| 🟡 | Bundesweit | BASt Brückenkarte / Brückenstatistik (Bundesfern | Brücken der Bundesfernstraßen —  | Web-Karte mit Export/Dow | offen |
| 🟢 | Bundesweit | BKG Geodatenzentrum — INSPIRE Verkehrsnetze (DLM | Straßen- und Schienennetz-Topolo | WFS, WMS (OGC, INSPIRE-k | offen |
| 🟢 | Bundesweit | bund.dev / bundesAPI "deutschland" — API-Katalog | Meta — kuratierter Katalog von > | OpenAPI 3 (YAML/JSON); P | offen |
| ⚪ | Bundesweit | DATEX II — europäischer Austauschstandard (Verke | Format/Profile (KEIN Datenanbiet | DATEX II XML (v2 + v3),  | offen |
| 🟢 | Bundesweit | DB InfraGO — Schienennetz (INSPIRE Verkehrsnetze | Streckennetz/Schienennetz-Topolo | WFS (GML, INSPIRE tn-ra) | offen |
| 🟢 | Bundesweit | DWD — Wetterwarnungen (DWD GeoServer WFS / Open  | Wetterwarnungen (Sturm, Glätte,  | WFS (GeoJSON/GML), zusät | offen |
| ⚪ | Bundesweit | ELWIS / GDWS (WSV) — Brückendurchfahrtshöhen übe | Lichte Höhe (Durchfahrtshöhe) +  | PDF-Dokumente (statisch) | offen |
| 🟡 | Bundesweit | Lastbeschränkte Brücken NRW — Schwertransportkar | Bauwerke (Brücken), die für Schw | Web-Karte (ArcGIS WebApp | offen |
| 🟡 | Bundesweit | GST.Autobahn — Genehmigungs-/Befahrbarkeits-Tool | Befahrbarkeits-/Streckenbewertun | internes Tool / Verfahre | eingeschränkt |
| 🔑 | Bundesweit | Mobilithek — Nationaler Zugangspunkt (NAP) Deuts | Bundesweite Verkehrs-/Mobilitäts | DATEX II (v2 + v3, XML); | account |
| 🟢 | Bundesweit | PEGELONLINE — Gewässerkundliches Informationssys | Wasserstände an >640 Pegeln an B | REST-JSON | offen |
| 🔑 | Bundesweit | VEMAGS — Verfahrensmanagement Großraum- und Schw | Genehmigungs-/Antragsdaten, Rout | SOAP/XML — Xvemags (Xvem | eingeschränkt |
| 🟡 | Baden-Württemberg | INSPIRE-WFS/WMS BW Verkehrsnetze (ATKIS Basis-DL | INSPIRE Road Transport Network ( | WFS (GML 4.0) / WMS | eingeschränkt |
| 🟡 | Baden-Württemberg | LGL-BW Open GeoData / GDI-BW — Geobasis (WFS / W | Geobasis — ATKIS Basis-DLM / DLM | WMS / WMTS / WFS / WCS / | offen |
| 🟢 | Baden-Württemberg | MobiData BW IPL — Baustelleninformationen (BEMaS | Baustellen / Arbeitsstellen (gep | CIFS-JSON / GeoJSON / DA | offen |
| 🟢 | Baden-Württemberg | MobiData BW IPL — Geoserver (WFS / WMS) | Vektor-/Visualisierungs-Layer de | WFS / WMS | offen |
| 🟢 | Baden-Württemberg | MobiData BW IPL — Verkehrsmeldungen (LMS BW) | Sperrungen / Gefahrenmeldungen / | TIC3 XML / DATEX II XML | offen |
| 🟢 | Baden-Württemberg | Straßennetz und Netzknoten Baden-Württemberg | Klassifiziertes Straßennetz (B/L | GML (+XSD) / MapInfo MIF | offen |
| ⚪ | Baden-Württemberg | daten.bw — Open-Data-Portal Baden-Württemberg (M | Meta-Katalog (Verweis auf MobiDa | Web-Portal | offen |
| 🟡 | Baden-Württemberg › Stadt Karlsruhe | Karlsruhe Geoportal — Brücken & Bauwerke / Verke | explizite Kategorien 'Brücken un | WMS / WFS / GeoJSON / CS | offen |
| 🟢 | Baden-Württemberg › Stadt Karlsruhe | Karlsruhe / TechnologieRegion Karlsruhe (TRK) —  | Baustellen aktuell + Vorschau (r | GeoJSON / SHAPE-ZIP / DA | offen |
| 🟡 | Baden-Württemberg › Stadt Mannheim | Mannheim — Open Data (Opendatasoft) + Geoportal  | offen v.a. Verkehrszähler (Eco-C | GeoJSON / CSV / Opendata | offen |
| 🟡 | Baden-Württemberg › Stadt Stuttgart | Stuttgart — Open Data / Geoportal | Stadtpläne, Basiskarten, Themen  | WMS/WMTS (Darstellung),  | offen |
| 🟢 | Bayern | BAYSIS Bauwerke — WFS / WMS (Brücken + Tunnel +  | Brücken + Tunnel- + Trogbauwerke | WFS (GML / GeoJSON / Sha | offen |
| 🟢 | Bayern | BAYSIS Fachnetze (+ Verkehrsdaten / Verwaltungsg | Fachnetze = bedarfsabhängige Uml | WFS (GML / GeoJSON) / WM | offen |
| 🟢 | Bayern | BAYSIS Straßennetz + Straßenbestand — WFS / WMS | Straßennetz (klass. Netz B/St/K  | WFS (GML / GeoJSON) / WM | offen |
| 🟡 | Bayern | Bayerische Vermessungsverwaltung (LDBV/BVV) — AT | ATKIS Basis-DLM (topographisches | Download (Shapefile / Ge | offen |
| 🔑 | Bayern | BayernInfo / ArbIS → Mobilithek — Baustellen (DA | Arbeits-/Baustellen (geplant + a | DATEX II XML (HTTPS/SOAP | registrierung |
| 🔑 | Bayern | BayernInfo / VIZ → Mobilithek — Verkehrsmeldunge | Verkehrsmeldungen — Stau, Sperru | DATEX II XML (HTTPS/SOAP | registrierung |
| ⚪ | Bayern | open.bydata — Open-Data-Portal Bayern (Meta-Kata | Meta-Katalog (verlinkt BAYSIS-,  | Web-Portal | offen |
| 🟢 | Bayern › Stadt München | München — Baustellen (Temporäre Einschränkungen, | Baustellen + Haltverbote (aktuel | WFS (GeoJSON / GML / CSV | offen |
| 🟡 | Bayern › Stadt Nürnberg | Nürnberg — GeoPortal | städtische Geodaten (GIS); ÖPNV  | WMS / WFS | offen |
| 🟢 | Berlin | Detailnetz Berlin — Ingenieurbauwerke (Brücken,  | Brücken, Tunnel (Geometrie/Ident | WFS 2.0 (GML) | offen |
| 🟡 | Berlin | Geoportal Berlin (Nachfolger FIS-Broker) — diver | ALKIS-Bauwerke (Gebäude/Brücken- | WFS 1.0/1.1/2.0, WMS | offen |
| 🔑 | Berlin | Mobilithek (BMDV) — Berlin-Publikation (DATEX II | Baustellen, Verkehrsmeldungen (D | DATEX II (SOAP/Pull) | registrierung |
| 🟢 | Berlin | OpenStreetMap via Overpass / Geofabrik-Extrakt — | GST-Restriktionen — maxheight, m | OSM-JSON → GeoJSON | offen |
| 🟢 | Berlin | Berlin VIZ — Baustellen, Sperrungen und sonstige | Baustellen, Sperrungen, Störunge | WFS 2.0 (GeoServer), Def | offen |
| 🟢 | Berlin | VIZ Berlin — "Verkehrsredaktion" + "Landesmeldes | Baustellen, Sperrungen (FeatureC | GeoJSON (statisch generi | offen |
| 🟢 | Brandenburg | ALKIS Brandenburg (WMS/WFS) | Liegenschaftskataster (Gebäude/B | WMS (live), WFS (ALKIS v | offen |
| ⚪ | Brandenburg | Geoportal Brandenburg (GDI-BB) — >100 Anbieter,  | Diverse Geodaten (Verkehr, Bauwe | Portal/CSW + diverse OGC | offen |
| 🟢 | Brandenburg | INSPIRE-WFS Verkehrsnetze ATKIS Basis-DLM Brande | Verkehrsnetz-Topologie (Straße/S | WFS 2.0.0, GML 3.2.1; CR | offen |
| 🟡 | Brandenburg | Landesbetrieb Straßenwesen Brandenburg (LS) — Ba | Baustellen mit Sperrung >24h auf | interaktive Web-Karte (k | zu-bestätigen |
| 🟢 | Brandenburg | OpenStreetMap via Overpass / Geofabrik-Extrakt — | GST-Restriktionen — maxheight, m | OSM-JSON → GeoJSON | offen |
| 🟡 | Bremen | ASV Bremen — Amt für Straßen und Verkehr (Brücke | 502 Brücken-Bauteile + Tunnel, S | Web (Bauwerksportal brue | eingeschränkt |
| 🟡 | Bremen | GeoPortal Bremen + GIS-Hub (GDI-HB) | Geobasis, Luftbilder, 3D-Bauwerk | WMS, WFS (über GeoPortal | offen |
| 🟡 | Bremen | Transparenzportal Bremen — Offene Daten | Querschnitt (Umwelt, Geo, Verkeh | CSV/JSON/XML; Geo-Datens | offen |
| 🟡 | Bremen | VMZ Bremen (Verkehrsmanagementzentrale) | Verkehrslage, Baustellen (Übersi | Web-Portal; RSS-Pfad ref | offen |
| 🟢 | Hamburg | Großraum- und Schwertransport-Routen in Hamburg  | GST-Vorzugsrouten-Netz (Routen f | WFS (GML/CSV/GeoJSON), W | offen |
| 🟢 | Hamburg | Transparenzportal Hamburg — Gruppe "Transport un | ~100+ Geodatensätze Transport/Ve | CKAN-API (JSON); Datensä | offen |
| 🟢 | Hamburg | Baustellen Hamburg (stadtweit) — Verkehrsdaten O | Baustellen (bis zu 50 größte Bau | WFS 1.1.0/2.0.0 (GML 3.1 | offen |
| 🟡 | Hamburg | Baustellen auf Hauptverkehrs- und Bundesfernstra | Baustellen auf Haupt-/Bundesfern | WFS (GML), WMS | offen |
| 🟢 | Hamburg | WFS Bedarfsumleitungen Hamburg | ausgeschilderte Notumleitungen f | WFS 1.1.0/2.0.0 (GML 3.1 | offen |
| 🟢 | Hamburg | WFS Brücken und sonstige Ingenieurbauwerke Hambu | Straßenbrücken, Fußgängerbrücken | WFS 1.1.0 / 2.0.0 (GML/C | offen |
| 🟢 | Hamburg | WFS Straßen- und Wegenetz Hamburg (HH-SIB, Knote | Straßen-/Wegenetz mit verschiede | WFS 1.1.0/2.0.0 (GML) | offen |
| 🟢 | Hessen | Geoportal Hessen / GDI-HE — INSPIRE-WFS Verkehrs | Straßennetz-Topologie / Verkehrs | OGC API Features (GeoJSO | offen |
| ⚪ | Hessen | Hessen Mobil — Lastbeschränkte Brücken (B/L/K) + | Lastbeschränkte Brücken (zul. Ge | PDF-Liste (Stand 2026-02 | offen |
| ⚪ | Hessen | Hessen Mobil — Positivkarten GST (Gewichts-/Höhe | GST-befahrbare Strecken nach Gew | PDF-Karten (je Landkreis | offen |
| 🟢 | Hessen | opendata.hessen.de — zentrales Open-Data-Portal  | Detektor-/Induktionsschleifen-Ro | CKAN-API (JSON); je Date | offen |
| 🟡 | Hessen › Stadt Frankfurt | Frankfurt am Main — Straßenverkehrsamt / IGLZ | Baustellen, Verkehrsmeldungen, V | WFS / GeoJSON (Geoportal | offen |
| 🟡 | Hessen › Stadt Wiesbaden | Wiesbaden — Geoportal / Open Data | v.a. Bauleitplanung (WMS/WFS, tä | WMS / WFS | offen |
| 🟡 | Mecklenburg-Vorpommern | INSPIRE-WFS MV Verkehrsnetze ATKIS Basis-DLM + W | Verkehrsnetz-Topologie (INSPIRE  | WFS 2.0 (GML) | offen |
| 🟢 | Mecklenburg-Vorpommern | Klassifiziertes Straßennetz Land M-V (verkehrsne | klassifiziertes Straßennetz (A/B | WFS / WMS | offen |
| 🟢 | Mecklenburg-Vorpommern | Straßenbaustellen MV (WFS) — wfs_baustellenmv | verkehrseinschränkende Baustelle | WFS 1.0/1.1/2.0 | offen |
| 🟢 | Mecklenburg-Vorpommern | OpenStreetMap via Overpass / Geofabrik-Extrakt — | GST-Restriktionen — maxheight, m | OSM-JSON → GeoJSON | offen |
| ⚪ | Mecklenburg-Vorpommern | "Verkehrsinformationen LS M-V" (Themenkarte) + O | Verkehrsinformationen (Themenkar | Portal/Themenkarte + OGC | offen |
| 🟢 | Mecklenburg-Vorpommern › Stadt Rostock | Rostock — Baustellen (OpenData.HRO) | Baustellen Stadtgebiet Rostock | GeoJSON / WFS / WMS / GM | offen |
| 🟢 | Mecklenburg-Vorpommern › Stadt Rostock | Rostock — Großraum- und Schwertransportrouten (O | (a) empfohlene GST-Wege Rostock  | GeoJSON / WFS / WMS / GM | offen |
| 🟡 | Niedersachsen | Geodatensuche Niedersachsen (CSW-Katalog GDI-NI) | Meta-Katalog aller NI-Geodienste | CSW-Katalog → Verweise a | offen |
| 🔑 | Niedersachsen | Mobilithek (Bund) — NI als Datengeber (DATEX-II  | Baustellen, Sperrungen, temporär | DATEX II (v2/v3, XML) | registrierung |
| 🟢 | Niedersachsen | NLStBV INSPIRE WMS Straßennetz (DE-NI-SBV INSPIR | Klassifiziertes Straßennetz (INS | WMS 1.3.0 (View); WFS an | offen |
| 🔑 | Niedersachsen | NWSIB-online (Niedersächsisches Straßeninformati | Straßenbestand, Bauwerke (Brücke | Web-Auskunft (Login); Ex | eingeschränkt |
| 🟡 | Niedersachsen | OpenGeoData Niedersachsen (LGLN ArcGIS Hub) | Klassifiziertes Straßennetz, DLM | CSV, KML, ZIP, GeoJSON,  | offen |
| 🟡 | Niedersachsen | VMZ Niedersachsen (Verkehrsmanagementzentrale) | Verkehrslage, Baustellen (besteh | Web-Portal (Karte); masc | offen |
| 🟡 | Niedersachsen › Stadt Hannover | Hannover (Region) — Geoportal / HannIT | gebündelte Geodaten/Geodienste;  | WMS / WFS / ATOM-Feeds ( | offen |
| 🟢 | Nordrhein-Westfalen | GST-Schwertransportkarte NRW — lastbeschränkte / | Für GST gesperrte/lastbeschränkt | ArcGIS REST FeatureServe | offen |
| 🟢 | Nordrhein-Westfalen | NRW.Mobidrom Datenplattform / mobilitaetsdaten.n | Baustellen, Sperrungen, temporär | CKAN-Katalog (JSON) + je | offen |
| 🟢 | Nordrhein-Westfalen | OpenGeodata.NRW / Straßen.NRW — Straßennetz inkl | Bauwerke (Brücken/Tunnel/Bauwerk | WFS (GML 3.2), WMS, Atom | offen |
| 🟡 | Nordrhein-Westfalen › Stadt Aachen | Aachen — Baustellen Stadtgebiet Aachen | amtlich erfasste Straßenbaustell | WFS / WMS / CSV (Punkt / | offen |
| 🟢 | Nordrhein-Westfalen › Stadt Bonn | Bonn — Baustellen tagesaktuell + geplant | (a) tagesaktuelle Baustellen mit | GeoJSON | offen |
| 🟢 | Nordrhein-Westfalen › Stadt Dortmund | Dortmund — Baustellen (tagesaktuell + geplant, O | Baustellen tagesaktuell + geplan | GeoJSON / CSV / JSON / S | offen |
| 🟢 | Nordrhein-Westfalen › Stadt Düsseldorf | Düsseldorf — Verkehrsmeldungen (Mobilitätsdaten) | Baustellen, verkehrsrelevante Er | GeoJSON / XML (DATEX-II) | offen |
| 🟡 | Nordrhein-Westfalen › Stadt Essen | Essen — Geodaten / Baustellen (über RVR-Verbund) | Baustellen/Verkehr über RVR-Geon | WFS / WMS (über RVR-Must | offen/zu-bestäti |
| 🟡 | Nordrhein-Westfalen › Stadt Köln | Köln — Verkehrsbeeinträchtigungen Stadt Köln | Verkehrsbeeinträchtigungen durch | GeoJSON (EPSG:4326), übe | offen |
| 🟢 | Nordrhein-Westfalen › Stadt Münster | Münster — Baustellen (GeoServer/MapServer) | aktuelle + geplante Baustellen m | GeoJSON / CSV / KML / Sh | offen |
| 🟢 | Rheinland-Pfalz | GeoPortal.rlp.de — Straßennetz LBM (OGC API Feat | Straßennetz: Autobahnen, Bundes- | OGC API Features (GeoJSO | offen |
| ⚪ | Rheinland-Pfalz | LBM RLP — Brücken & Schwertransporte (Restriktio | Brückenprüfung/Traglast (statisc | Web-Info (Themenseiten); | eingeschränkt |
| 🔑 | Rheinland-Pfalz | LBM RLP — DATEX-II-Knoten (Verkehrsdaten-Austaus | Verkehrsmeldungen / Baustellen / | DATEX II (XML) | eingeschränkt |
| 🟡 | Rheinland-Pfalz | Mobilitätsatlas RLP / BaustellenInfo digital — B | Baustellen (Land, Autobahn GmbH, | Web-Portal/Karte (JS); D | offen |
| 🟢 | Saarland | baustellen.saarland (LfS) — Baustellen, Sperrung | Baustellen (Punkt + Linie), Verk | GeoJSON (Leaflet-Feeds,  | offen |
| 🟢 | Saarland | GeoPortal Saarland (GDI-SL) — Verkehr_WFS + INSP | Verkehrs-Geodaten (Strassennetz, | OGC API Features (OAF) / | offen |
| ⚪ | Saarland | LfS Saarland — GST / Schwertransport (Restriktio | Bauwerke (Brücken/Kreisverkehre) | Web-Info; operative Bauw | eingeschränkt |
| 🔑 | Sachsen | GDI-SBV — Geodaten der Sächs. Straßenbauverwaltu | Straßenbauverwaltungs-Fachdaten  | WFS 2.0/1.1.0 | eingeschränkt |
| 🟢 | Sachsen | GeoSN INSPIRE/ATKIS Basis-DLM — Verkehrsnetze (T | Verkehrsnetz-Topologie (INSPIRE  | WFS 2.0 | offen |
| 🟢 | Sachsen | Baustelleninformationen Sachsen (SPERRINFOSYS) — | tagesaktuelle Baustellen-Maßnahm | WMS 1.3.0 (GetMap/GetFea | offen |
| 🟢 | Sachsen | Großraum- und Schwertransporte — gesperrte Brück | Brücken mit begrenzter Tragfähig | PDF je Landkreis (8 LK,  | offen |
| 🟢 | Sachsen | OpenStreetMap via Overpass / Geofabrik-Extrakt — | GST-Restriktionen — maxheight, m | OSM-JSON → GeoJSON | offen |
| 🟡 | Sachsen › Stadt Dresden | Dresden — Themenstadtplan / Open Data | Straßenbaustellen & Umleitungen  | WFS / GeoJSON (Portal: ' | offen |
| 🟢 | Sachsen › Stadt Leipzig | Leipzig — Verkehrsraumeinschränkungen (Punkte +  | aktuelle Verkehrsraumeinschränku | WFS / GeoJSON / CSV | offen |
| 🟢 | Sachsen › Stadt Leipzig | Leipzig — Verkehrszeichen-Kataster | Verkehrszeichen-Kataster (enthäl | WFS / GeoJSON / CSV | offen |
| 🟢 | Sachsen-Anhalt | LSBB Sperrinfo (SPERRINFOSYS ST) — service.ifak. | Baustellen, Sperrungen, Umleitun | WFS 1.1.0/2.0, GeoJSON ( | eingeschränkt |
| 🟡 | Sachsen-Anhalt | Geodatenportal Sachsen-Anhalt (LVermGeo) — Open- | ATKIS-Bauwerke (Brücken-Geometri | WFS 2.0 / ATOM-Download  | offen |
| 🟢 | Sachsen-Anhalt | INSPIRE-WFS ST Verkehrsnetze ATKIS Basis-DLM (ow | Verkehrsnetz-Topologie (INSPIRE  | WFS 2.0.0 (AdV-WFS-Profi | offen |
| 🔑 | Sachsen-Anhalt | Mobilithek (DATEX-II ST-Baustellen, RSA-21-Melde | Baustellen, Verkehrsmeldungen (D | DATEX II (SOAP/Pull) bzw | registrierung |
| 🟢 | Sachsen-Anhalt | OpenStreetMap via Overpass / Geofabrik-Extrakt — | GST-Restriktionen — maxheight, m | OSM-JSON → GeoJSON | offen |
| 🟡 | Schleswig-Holstein | DigitalerAtlasNord (DANord) — Präsentationskompo | zentraler Geo-Viewer; interaktiv | WMS (Geobasis), Web-View | offen |
| 🟡 | Schleswig-Holstein | GDI-SH Geoportal + Offene Geobasisdaten (OpenGBD | Geobasis (DTK, ALKIS, DGM/DOM),  | WMS, WFS, ATKIS/Download | offen |
| 🟢 | Schleswig-Holstein | Open-Data SH — Straßenbaustellen (WFS Baustellen | Straßenbaustellen (Linien + Punk | WFS 2.0.0 (GML); DATEX I | offen |
| 🟢 | Schleswig-Holstein | Umleitungsstrecken Schleswig-Holstein (WFS Baust | Umleitungsstrecken (Diversion Ro | WFS 2.0.0 (GML) | offen |
| 🟢 | Schleswig-Holstein | WFS SH Straßeninfo (Downloaddienst Verkehrsnetze | Straßennetz (Bundesfernstraßen,  | WFS 2.0.0 (GML); CRS EPS | offen |
| ⚪ | Thüringen | Geoproxy Thüringen — freie WMS/WFS opendata Geob | Geobasisdaten (ALKIS/ATKIS/DOP/D | WMS/WFS (z.B. DGM-WMS …/ | offen |
| 🟢 | Thüringen | INSPIRE TH Verkehrsnetze ATKIS Basis-DLM — Straß | INSPIRE-TN-RO Straßennetz (Road, | WFS 2.0 (INSPIRE tn-ro/4 | offen |
| 🟢 | Thüringen | Klassifiziertes Straßennetz Thüringen (STRNETZ_w | klassifiziertes Straßennetz nach | WFS 2.0 | offen |
| 🟢 | Thüringen | OpenStreetMap via Overpass / Geofabrik-Extrakt — | GST-Restriktionen — maxheight, m | OSM-JSON → GeoJSON | offen |
| 🟡 | Thüringen | Baustelleninformationssystem Thüringen (TLBV) | aktuelle Baustellen auf Thüringe | Web-App (GWT) | eingeschränkt |
| 🟢 | Sonstige | Geofabrik Deutschland-Extrakte (.osm.pbf Bulk) | Komplettes OSM-Datenset fuer DE  | .osm.pbf (primaer, ~4,5  | offen |
| 🟢 | Sonstige | GovData.de (Offene-Daten-Portal Deutschland, CKA | Metadaten-KATALOG ueber ALLE Ver | Metadaten nach DCAT-AP.d | offen |
| 🔑 | Sonstige | GraphHopper — Directions API (truck / custom_mod | Built-in-Profile truck + small_t | REST-JSON | account |
| 🟢 | Sonstige | INSPIRE Transport Networks (TN) — BKG DLM250 WFS | Verkehrsnetz-Topologie (Road/Rai | WFS 2.0.0 (GML 3.2.1); a | offen |
| 🟢 | Sonstige | Nominatim (OSM Geocoding) | Geocoding (Name->Koordinate), Re | REST -> JSON / jsonv2 /  | offen |
| 🔑 | Sonstige | openrouteservice (ORS) — Profil driving-hgv | HGV-Routing mit profile_params.r | REST-JSON / GeoJSON | account |
| 🟢 | Sonstige | OSM Planet + Diffs (Voll-Dump / Replikation) | Kompletter weltweiter OSM-Datenb | .osm.pbf (~80 GB), .osm. | offen |
| 🟢 | Sonstige | Overpass API (OpenStreetMap Query-Engine) | Restriktionen aus OSM-Tags: maxh | Overpass-QL (POST/GET) - | offen |
| 🟢 | Sonstige | QLever (OSM als SPARQL / GeoSPARQL) | Ganz OSM analytisch abfragbar (R | SPARQL (POST) -> JSON (s | offen |
| 🟢 | Sonstige | RVR / GEONETZWERK.RUHR — Baustellen (Beispiel He | Baustellen mit Verkehrseinschrän | WFS (2.0.0/1.1.0/1.0.0)  | offen |
