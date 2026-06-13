# Datenquellen-Katalog — BUNDESQUELLEN (Federal)

> **Projekt:** Roadmap (Setreo) — Routenanalyse für Großraum- und Schwertransporte (GST) in DE.
> **Scope dieses Dokuments:** Bundesweite/föderale Datenquellen (Autobahn GmbH, BASt, BMDV/Mobilithek, WSV, DB, BKG/GDI-DE, GovData, DWD, VEMAGS).
> **Stand:** 2026-06-13. Recherche via WebSearch + WebFetch, Endpunkte wo möglich verifiziert.
> **Lesehilfe:** `verifiziert=ja` = Endpunkt/Existenz live oder per offizieller Doku bestätigt. `zu-bestätigen` = Portal gefunden, exakter API-Endpunkt unklar oder nicht öffentlich → `apiEndpunkt=null`.
> **Rechte-Hinweis:** Lizenz/Zugang sind ehrlich markiert. „Erlaubt oder nicht" ist hier NICHT das Kriterium — Rechte werden separat besorgt. Alles auflisten.

---

## Schnellübersicht (Priorisierung)

| Prio | Quelle | Datentyp | Status |
|------|--------|----------|--------|
| **P1** | Autobahn GmbH API (verkehr.autobahn.de) | Baustellen, Sperrungen, Warnungen, Gewichtslimit-Hinweise | verifiziert |
| **P1** | BASt BISStra (Bundesfernstraßennetz WMS/WFS) | Straßennetz/ASB-Bezug (Geometrie, Netzknoten) | verifiziert |
| **P1** | BASt SIB-Bauwerke / ASB-ING (Brückendaten: Traglast, lichte Höhe) | Brücken, Tunnel, Stützwände — Bauwerksrestriktionen | zu-bestätigen (restricted) |
| **P1** | VEMAGS INS-GST Webservice | Routen-Anreicherung mit ASB-Abschnitten + Brücken-Prüfstellen | zu-bestätigen (restricted) |
| **P1** | Mobilithek (BMDV, NAP) — DATEX-II Baustellen/Verkehr | Baustellen, Sperrungen bundesweit (Bund + Länder) | verifiziert (Registrierung) |
| **P2** | ELWIS / GDWS (WSV) — Brückendurchfahrtshöhen Wasserstraßen | lichte Höhe über Wasserstraßen (PDF) | verifiziert |
| **P2** | DB / DB InfraGO Open Data — Bahnübergänge, Streckennetz | Bahnübergänge, Strecken (GeoJSON) | zu-bestätigen |
| **P2** | BKG Geodatenzentrum — INSPIRE Verkehrsnetze (DLM250) | Straßen-/Schienennetz-Topologie | verifiziert |
| **P2** | GovData / open.NRW — „Lastbeschränkte Brücken NRW / Schwertransportkarte" | gesperrte Brücken für GST | verifiziert |
| **P2** | PEGELONLINE (WSV) REST-API | Wasserstand (indirekt lichte Höhe unter Brücken) | verifiziert |
| **P3** | DWD API (dwd.api.bund.dev) | Wetterwarnungen (Sturm/Glätte) | verifiziert |
| **P3** | bund.dev / deutschland (Python) — API-Katalog | Meta: Sammelstelle für Bundes-APIs | verifiziert |

---

## 1. Autobahn GmbH des Bundes — verkehr.autobahn.de API

- **quelle:** Autobahn-API (Verkehrsdaten Bundesautobahnen)
- **betreiber:** Autobahn GmbH des Bundes (Doku/Wrapper kuratiert über bund.dev / bundesAPI-Community)
- **datentyp:** Baustellen (roadworks), Vollsperrungen (closure), Verkehrswarnungen (warning, inkl. Gewichtsbeschränkungs-Hinweise via `display_type=WEIGHT_LIMIT_35`), Lkw-Parkplätze (parking_lorry), Ladesäulen (electric_charging_station), Webcams (webcam)
- **strassentyp:** A (nur Bundesautobahnen — KEINE B/L/K, siehe bundesAPI Issue #39)
- **format:** REST-JSON
- **apiEndpunkt (verifiziert):**
  - Basis: `https://verkehr.autobahn.de/o/autobahn`
  - Alle Autobahnen auflisten: `GET https://verkehr.autobahn.de/o/autobahn/`
  - Baustellen: `GET /{roadId}/services/roadworks` (z.B. `…/A1/services/roadworks`)
  - Sperrungen: `GET /{roadId}/services/closure`
  - Warnungen: `GET /{roadId}/services/warning`
  - Lkw-Parken: `GET /{roadId}/services/parking_lorry`
  - Ladesäulen: `GET /{roadId}/services/electric_charging_station`
  - Webcams: `GET /{roadId}/services/webcam`
  - Detail je Objekt: `GET /details/{service}/{id}` (z.B. `/details/roadworks/{id}`)
- **update:** kontinuierlich (Echtzeit-nah, betrieblich gepflegt)
- **auth:** keine (CORS aktiviert, frei abrufbar)
- **kosten:** keine
- **lizenz:** Daten der Autobahn GmbH; Doku/Wrapper unter bundesAPI. Konkrete Nutzungslizenz der Rohdaten nicht explizit in API-Doku ausgewiesen → für kommerzielle Nutzung **bei Autobahn GmbH klären**.
- **abdeckung:** alle BAB bundesweit
- **zugang:** offen — direkt abrufbar, keine Registrierung. Offizielle Doku/OpenAPI siehe url.
- **verifiziert:** ja (OpenAPI-Spec + Live-Endpunktstruktur bestätigt)
- **url:**
  - Offizielle Doku: `https://autobahn.api.bund.dev/`
  - OpenAPI: `https://autobahn.api.bund.dev/openapi.yaml`
  - GitHub: `https://github.com/bundesAPI/autobahn-api`
- **prio:** P1
- **sonstiges / REALE Restriktions-Felder (WICHTIG):** Die Objekte (roadworks/warning/closure) haben **KEINE strukturierten numerischen Felder** für max. Breite/Höhe/Gewicht. Felder sind: `extent, identifier, coordinate (lat/long), title, subtitle, description (multiline, Freitext), icon, isBlocked, display_type, lorryParkingFeatureIcons, future, startTimestamp, routeRecommendation`. Restriktionen kommen über:
  - `display_type` Enum: u.a. `WEIGHT_LIMIT_35` (3,5-t-Beschränkung), `ROADWORKS`, `CLOSURE`, `CLOSURE_ENTRY_EXIT`, `SHORT_TERM_ROADWORKS`, `WARNING`, `WEBCAM`, `PARKING`, `ELECTRIC_CHARGING_STATION`, `STRONG_ELECTRIC_CHARGING_STATION`
  - `icon`-Codes (z.B. `262-2` = „Max. 3,5 t", `123` = Bauarbeiten)
  - `isBlocked` (bool) und `description`-Freitext (oft sind Höhen/Breiten/Gewichts-Limits NUR im Freitext genannt → NLP/Parsing nötig)
  - **Konsequenz fürs Projekt:** Höhen-/Breiten-/Achslast-Limits aus der Autobahn-API müssen aus Freitext extrahiert werden; nicht als saubere Zahlfelder erwartbar.

---

## 2. BASt — BISStra (Bundesinformationssystem Straße) / Bundesfernstraßennetz

- **quelle:** BISStra — Geodienste Bundesfernstraßennetz (ASB-basiert)
- **betreiber:** Bundesanstalt für Straßenwesen (BASt), GeoK BASt, Bergisch Gladbach
- **datentyp:** Straßennetz Bundesfernstraßen mit ASB-Bezug — Netzknoten, Nullpunkte, Sektoren, Geometrien. (Grundlage, an die Bauwerks-/Restriktionsdaten via ASB-Stationierung gehängt werden.)
- **strassentyp:** A + B (Bundesfernstraßen = BAB + Bundesstraßen). KEINE L/K.
- **format:** WMS, WFS (OGC), zusätzlich Datensatz-Download (ZIP)
- **apiEndpunkt (verifiziert):**
  - WMS GetCapabilities: `https://inspire.bast.de/bisstra/strasse_wms?service=WMS&request=GetCapabilities&version=1.3.0` (live bestätigt)
  - WMS-Layer (bestätigt): `bisstra.strasse:grl_BFStr`, `…:tbl_BFStr_Sektor_BAB`, `…:tbl_BFStr_Sektor_BStr`, `…:tbl_BFStr_NK_BAB/BStr` (Netzknoten), `…:tbl_BFStr_NP_BAB/BStr` (Nullpunkte)
  - WFS (analog, Bundesfernstraßennetz): `https://inspire.bast.de/bisstra/...` — exakter WFS-Pfad **zu-bestätigen** (GDI-DE-Katalogeintrag vorhanden, siehe url)
  - Download Datensatz Bundesfernstraßennetz: ZIP (~51 MB, Stand 17.02.2026) über BASt-Datenseite (siehe url)
- **update:** periodisch (Netzdaten); Download-Datensatz datiert
- **auth:** keine (WMS offen abrufbar)
- **kosten:** keine
- **lizenz:** Nutzungs-Disclaimer im WMS: „Daten sind **nicht für Produktionszwecke oder Navigation** geeignet. Verwendung hierfür ist untersagt. Nutzung auf eigene Gefahr." → **kritisch für Produktivsystem**: explizite Freigabe/Lizenz bei BASt einholen.
- **abdeckung:** bundesweit Bundesfernstraßennetz
- **zugang:** offen (WMS); für produktive/kommerzielle Nutzung Klärung mit BASt (post@bast.de, +49 2204 43-0)
- **verifiziert:** ja (WMS-GetCapabilities live; WFS zu-bestätigen)
- **url:**
  - Maßnahme/Info: `https://www.bast.de/DE/Themen/Digitales/HF_1/Massnahmen/bisstra.html`
  - Datensatz-Download: `https://www.bast.de/SharedDocs/Daten-TB/Daten-BISStra.html`
  - GDI-DE WFS-Katalog: `https://gdk.gdi-de.org/geonetwork/srv/api/records/E068415C-D7B1-4D96-B8A0-FA1C23DF5CC7`
- **prio:** P1
- **sonstiges:** **WICHTIG — Abdeckungslücke:** Der öffentliche BISStra-WMS liefert NUR das Straßennetz (Netzknoten/Sektoren/Geometrie), **NICHT die Bauwerksattribute (Brücken-Traglast, lichte Höhe)** als Layer. Diese liegen in SIB-Bauwerke/ASB-ING (siehe Quelle 3) und sind dem öffentlichen WMS nicht beigefügt. BISStra ist damit der **Netz-Grundriss** (ASB-Stationierung), an den man Restriktionen hängt — nicht selbst die Restriktionsquelle.

---

## 3. BASt — SIB-Bauwerke / ASB-ING (Brücken- und Bauwerksdaten: Traglast, lichte Höhe)

- **quelle:** SIB-Bauwerke (Zentrale Bauwerksdatenbank) + ASB-ING (Anweisung Straßeninformationsbank — Bauwerksdaten)
- **betreiber:** Straßenbauverwaltungen Bund + Länder (Eigentümer des IT-Produkts); Fachpflege u.a. LISt (Sachsen), gis-consult; Regelwerk via BASt
- **datentyp:** **Die Kern-Bauwerksrestriktionen** — Brücken (Traglast/Tragfähigkeit, lichte Höhe/Durchfahrtshöhe, Stützweiten), Tunnel/Trogbauwerke, Stützwände, Lärmschutzbauwerke, Verkehrszeichenbrücken. Brücken = Hauptbestandteil. Zustand + Tragfähigkeit pro Bauwerk.
- **strassentyp:** A + B (Bundesfernstraßen) sowie L/K wo Länder einpflegen → potenziell **Alle**
- **format:** Fachdatenformat ASB-ING; Austausch via TT-SIB / NW-SIB (Master-Straßendatenbanken der Länder). Kein offener REST/WFS-Endpunkt öffentlich.
- **apiEndpunkt:** **null** (keine öffentliche API — internes Behördensystem)
- **update:** laufend durch Bauwerksprüfungen (DIN 1076)
- **auth:** restricted — Behördensystem; Zugang über Straßenbaulastträger
- **kosten:** n/a (kein offenes Produkt)
- **lizenz:** nicht öffentlich lizenziert; Daten der Straßenbauverwaltungen
- **abdeckung:** bundesweit, alle Bauwerke im klassifizierten Straßennetz (Bund + Länder, soweit erfasst)
- **zugang:** **eingeschränkt.** Daten sind NICHT offen abrufbar. Realistischer Zugang fürs Projekt: (a) über VEMAGS INS-GST (Quelle 4) als angehörte Stelle / Datennutzer, (b) per Datenlieferungsvereinbarung mit einzelnen Landesbetrieben/Autobahn GmbH, (c) als Straßenbaulastträger im Verfahren. **Direkter Bezug für privaten Routenplaner: Kooperation/Vertrag nötig.**
- **verifiziert:** zu-bestätigen (System + Dateninhalt bestätigt; öffentlicher Datenbezug nicht möglich)
- **url:**
  - BASt Bauwerksdaten: `https://www.bast.de/DE/Themen/Digitales/HF_1/Massnahmen/bauwerksdaten.html`
  - ASB-ING Regelwerk (PDF): `https://www.bast.de/DE/Publikationen/Regelwerke/Verkehrstechnik/Downloads/B01a-Bauwerke.pdf`
  - SIB-Bauwerke Produkt: `https://sib-bauwerke.de/`
  - LISt (Sachsen) Zentrale Bauwerksdatenbank: `https://www.list.sachsen.de/sib-bauwerke-zentrale-bauwerksdatenbank.html`
- **prio:** P1 (inhaltlich der Goldstandard für Brückenrestriktionen — aber Zugang ist die Hürde)
- **sonstiges:** Dies ist die **eigentliche Quelle** für Traglast + lichte Höhe. Strategisch: nicht direkt anzapfbar, sondern über VEMAGS INS-GST oder Länderkooperationen. Negativkarten einzelner Länder (z.B. Sachsen GST-Negativkarten, NRW Schwertransportkarte — Quelle 9) sind die öffentlich sichtbaren Ableitungen daraus.

---

## 4. VEMAGS — INS-GST Webservice (Routenprüfung GST, Bund-Länder)

- **quelle:** VEMAGS® (VErfahrensMAnagement für Großraum- und Schwertransporte) + Modul INS-GST + Schnittstelle Xvemags
- **betreiber:** eGovernment-Produkt unter Federführung Land Hessen; Projektleitung bei Hessen Mobil. Bundeseinheitlich für alle 16 Länder + Bund.
- **datentyp:** **Direkt projektrelevant** — Anreicherung einer beantragten Route mit den durchfahrenen ASB-Teilabschnitten + Anbindung der fachlichen Prüfmodule (Brücken-/Bauwerksprüfung nach ASB). De-facto die zentrale GST-Routenprüfungs-Infrastruktur Deutschlands. Genau der Use-Case dieses Projekts.
- **strassentyp:** Alle (Bund + Länder, soweit ASB erfasst)
- **format:** XML — Schnittstelle **Xvemags** (Xvemags-AB für Antragsteller, Xvemags-FP für fachliche Prüfung); INS-GST als Webservice (SOAP/XML)
- **apiEndpunkt:** **null** (kein offener öffentlicher Endpunkt; Zugang vertraglich/registriert über VEMAGS-Projektleitung)
- **update:** laufend (an SIB der Länder gekoppelt)
- **auth:** Registrierung/Zulassung als Drittsystem bzw. Verfahrensteilnehmer; Xvemags öffnet Verfahren für Drittsystemhersteller
- **kosten:** Teilnahme am Antrags-/Genehmigungsverfahren für Antragsteller kostenfrei; Drittsystem-Anbindung über Schnittstelle = projektspezifisch zu klären
- **lizenz:** behördliches Verfahren, keine offene Datenlizenz
- **abdeckung:** bundesweit, >90 % aller GST-Genehmigungen laufen über VEMAGS
- **zugang:** **eingeschränkt → der strategisch wichtigste Zugangsweg.** Konkret: Kontakt zur VEMAGS-Projektleitung (Hessen Mobil) bzgl. Xvemags-Schnittstelle / INS-GST-Anbindung. Drittsystemhersteller können über Xvemags andocken. **Empfehlung: hier offiziell anfragen — das ist die offizielle Bund-Länder-Datendrehscheibe für genau dieses Projekt.**
- **verifiziert:** zu-bestätigen (System + Webservice + Xvemags bestätigt; Endpunkt nicht öffentlich)
- **url:**
  - VEMAGS Start: `https://www.vemags.de/`
  - INS-GST Webservice: `https://www.vemags.de/ins-gst-modul/ins-gst-webservice-3/`
  - INS-GST Info: `https://www.vemags.de/ins-gst-modul/informationen/`
  - Fachliche Prüfmodule: `https://www.vemags.de/ins-gst-modul/fachliche-pruefmodule/`
  - Schnittstelle Xvemags: `https://www.vemags.de/verfahrens-modul/schnittstelle/`
  - BMDV MFUND-Projekt „GST 4.0" (Digitalisierung): `https://bmdv.bund.de/SharedDocs/DE/Artikel/DG/mfund-projekte/gst4.html`
- **prio:** P1
- **sonstiges:** INS-GST verbindet VEMAGS-Routen mit den Straßeninformationsbanken der Länder und erfasst Prüfstellen (u.a. Brücken) nach ASB-Regeln automatisiert. Das BMDV-Projekt „GST 4.0" treibt die Digitalisierung weiter — relevant für künftige Schnittstellen/Datenverfügbarkeit. Quergedanke: statt Brückendaten selbst zu sammeln, könnte das Projekt Konsument/Drittsystem an VEMAGS werden.

---

## 5. BMDV / Mobilithek — Nationaler Zugangspunkt (NAP), DATEX-II

- **quelle:** Mobilithek (Nachfolger des Mobilitäts Daten Marktplatz / MDM)
- **betreiber:** Bundesministerium für Digitales und Verkehr (BMDV/BMV); Betrieb über die Mobilithek-Plattform
- **datentyp:** Bundesweite Verkehrs-/Mobilitätsdaten als DATEX-II-Feeds — **Baustellen, Sperrungen, Verkehrsmeldungen, Parkdaten, Detektordaten** (u.a. eingespeist von der Integrierten Gesamtverkehrs-Leitzentrale IGLZ sowie Ländern/Kommunen). Auch statische/dynamische Ladesäulendaten (DATEX-II-Pflicht ab 14.04.2026).
- **strassentyp:** Alle (je nach Datengeber — Bund, Länder, Kommunen)
- **format:** DATEX II (v2 und v3 verfügbar), teils weitere; Abruf als Feed/Pull bzw. Push
- **apiEndpunkt:** **null** als generischer Endpunkt — Mobilithek ist ein **Katalog/Broker**: jeder Datengeber hat einen eigenen Feed, Zugang nach Registrierung + ggf. Nutzungsvereinbarung pro Angebot. Feed-URLs werden nach Freischaltung im Konto sichtbar.
- **update:** je Feed (Baustellen/Verkehr oft minütlich–stündlich)
- **auth:** Registrierung auf mobilithek.info (Nutzerkonto); je Datenangebot ggf. Freischaltung durch Datengeber (Zertifikat/Token je nach Feed)
- **kosten:** überwiegend kostenfrei (offene Mobilitätsdaten); je Angebot prüfen
- **lizenz:** je Datengeber unterschiedlich (oft dl-de/zero oder CC-BY) — pro Feed im Katalog ausgewiesen
- **abdeckung:** bundesweit, aber **lückenhaft je nach teilnehmenden Ländern/Kommunen** (nicht jede Behörde liefert vollständig)
- **zugang:** Registrierung. Vorgehen: Konto auf mobilithek.info anlegen → Katalog nach „Baustellen"/„DATEX II"/„Verkehrslage" durchsuchen → Datenangebot abonnieren → Feed-Zugang erhalten.
- **verifiziert:** ja (Plattform als NAP + DATEX-II-Bereitstellung bestätigt; konkrete Feed-URLs sind kontogebunden)
- **url:**
  - Plattform: `https://mobilithek.info/`
  - DATEX-II-FAQ: `https://mobilithek.info/help/faq-datex-ii`
  - DATEX-II v3 Info: `https://mobilithek.info/blog/datex-2-version-3`
- **prio:** P1
- **sonstiges:** Der **offizielle nationale Zugangspunkt** — hier laufen die DATEX-II-Baustellen-/Verkehrsfeeds vieler Länder zusammen. Für temporäre Restriktionen (Baustellen/Sperrungen) bundesweit die zentrale Adresse neben der Autobahn-API. DATEX-II liefert teils strukturierte Restriktionsfelder (z.B. Gewichts-/Maßbeschränkungen) — besser maschinenlesbar als der Autobahn-API-Freitext. **Empfehlung: Konto anlegen und Feed-Katalog inventarisieren (eigene Folge-Recherche pro Feed).**

---

## 6. ELWIS / GDWS (WSV) — Brückendurchfahrtshöhen über Wasserstraßen

- **quelle:** ELWIS (Elektronischer Wasserstraßen-Informationsservice) — „Technische Daten" / Brückendurchfahrtshöhen
- **betreiber:** Generaldirektion Wasserstraßen und Schifffahrt (GDWS) / Wasserstraßen- und Schifffahrtsverwaltung (WSV); IT via ITZBund
- **datentyp:** Lichte Höhe (Durchfahrtshöhe) und Durchfahrtsbreite von **Brücken über Bundeswasserstraßen** — relevant für Brücken, unter denen Straßen-GST durchfahren? Nein: primär für Schifffahrt. **Indirekt relevant**, wenn eine GST-Route eine Brücke ÜBER eine Wasserstraße nutzt (Traglast/Höhe der Straßenbrücke kommt aber aus SIB-Bauwerke, nicht ELWIS). ELWIS = Höhen der Bauwerke aus Schifffahrtssicht.
- **strassentyp:** n/a (Wasserstraßen-Bauwerke; nur mittelbar straßenrelevant)
- **format:** PDF-Dokumente (statisch), pro Wasserstraße/Region; KEIN API/CSV
- **apiEndpunkt:** **null** (nur PDF-Downloads)
- **update:** unregelmäßig; gefundene Dokumente 2017–2020
- **auth:** keine
- **kosten:** keine
- **lizenz:** Bundesbehörde; Nutzungsbedingungen ELWIS prüfen
- **abdeckung:** Dortmund-Ems-Kanal, Rhein-Herne-Kanal, Datteln-Hamm-Kanal, Wesel-Datteln-Kanal, Donau, Main, Main-Donau-Kanal, Elbe, Oder-Havel-/Spree-Havel-Bereich u.a.
- **zugang:** offen (PDF)
- **verifiziert:** ja (Datenseite + Beispiel-PDFs bestätigt)
- **url:**
  - ELWIS Technische Daten: `https://www.elwis.de/DE/Service/Daten-und-Fakten/Technische-Daten/Technische-Daten-node.html`
  - GDWS Bauwerke/Anlagen: `https://www.gdws.wsv.bund.de/DE/wasserstrassen/02_bauwerke-anlagen/bauwerke-anlagen-node.html`
- **prio:** P2 (Nische; nur für Brücken über Wasserstraßen relevant, und auch dort ist die Straßen-Traglast woanders)
- **sonstiges:** Geringer direkter Routen-Nutzen, da PDF + Schifffahrtsperspektive. Eher Plausibilitäts-/Kontextquelle.

---

## 7. PEGELONLINE (WSV) — REST-API Wasserstände

- **quelle:** PEGELONLINE — Gewässerkundliches Informationssystem der WSV
- **betreiber:** WSV / ITZBund
- **datentyp:** Wasserstände an >640 Pegeln an Bundeswasserstraßen. **Indirekt:** aktuelle lichte Höhe unter Brücken über Wasserstraßen schwankt mit dem Wasserstand — für Straßen-GST nur randständig relevant.
- **strassentyp:** n/a
- **format:** REST-JSON
- **apiEndpunkt (verifiziert):** `https://www.pegelonline.wsv.de/webservices/rest-api/v2` — u.a. `GET /stations.json`, `GET /stations/{station}.json`, `GET /stations/{station}/{timeseries}/measurements.json`, `GET /waters.json`
- **update:** bis 30 Tage rückwirkend; nahezu Echtzeit; HTTP-Caching unterstützt
- **auth:** keine
- **kosten:** keine
- **lizenz:** offen (Bundesbehörde; GovData-gelistet)
- **abdeckung:** bundesweit Bundeswasserstraßen
- **zugang:** offen
- **verifiziert:** ja (User's Guide + Endpunkte bestätigt)
- **url:**
  - Doku: `https://www.pegelonline.wsv.de/webservice/dokuRestapi`
  - User's Guide: `https://www.pegelonline.wsv.de/webservice/guideRestapi`
  - bund.dev: `https://pegel-online.api.bund.dev/`
- **prio:** P3 (für Straßen-GST nur Spezialfall)
- **sonstiges:** Saubere, frei nutzbare REST-API. Aufnehmen falls dynamische Durchfahrtshöhen unter Wasserstraßenbrücken je relevant werden.

---

## 8. Deutsche Bahn / DB InfraGO — Open Data (Bahnübergänge, Streckennetz)

- **quelle:** DB Open Data Portal + DB InfraGO Infrastrukturdaten + IPID + DB API Marketplace
- **betreiber:** Deutsche Bahn AG / DB InfraGO AG
- **datentyp:** **Bahnübergänge** (Lage/Standort als Geoobjekte am Streckennetz), Streckennetz (Strecken), Bauwerkstypen (Tunnel, Bahnübergänge, Brücken als Objekte am Netz), Stationsdaten (StaDa/RIS — weniger relevant). Bahnübergänge sind direkter GST-Hindernistyp (Wartezeit, Schleppkurven, Aufsetzen).
- **strassentyp:** Kreuzungspunkte Schiene×Straße (Bahnübergänge) — netzübergreifend
- **format:** GeoJSON (Streckennetz/Geoobjekte); StaDa/RIS = REST-JSON über DB API Marketplace
- **apiEndpunkt:**
  - DB Open Data Portal: `https://data.deutschebahn.com/` (Datensatz-Listing — exakte Bahnübergang-Datensatz-URL **zu-bestätigen**, da generische Listing-URLs 404 lieferten)
  - StaDa (Stationsdaten, Marketplace): `https://developers.deutschebahn.com/db-api-marketplace/apis/product/stada`
  - RIS::Stations: `https://developers.deutschebahn.com/db-api-marketplace/apis/product/ris-stations`
  - IPID (Infrastrukturdaten): `https://www.dbinfrago.com/...` (Portal)
- **update:** je Datensatz unterschiedlich
- **auth:** Open-Data-Portal: keine; DB API Marketplace (StaDa/RIS): Registrierung + API-Key/OAuth
- **kosten:** Open Data kostenfrei; Marketplace-APIs teils kostenfreie Kontingente
- **lizenz:** Open Data häufig CC-BY 4.0 / nach GeoZG (für kommerzielle + nicht-kommerzielle Nutzung); pro Datensatz prüfen
- **abdeckung:** bundesweit Schienennetz DB InfraGO (Bahnübergänge der Strecken; private EVU/NE-Bahnen evtl. nicht enthalten)
- **zugang:** Open-Data-Portal offen; Marketplace per Registrierung
- **verifiziert:** zu-bestätigen (Portal + Bahnübergang-Bezug bestätigt; exakter Datensatz-Endpunkt für Bahnübergänge noch zu lokalisieren)
- **url:**
  - Open Data: `https://data.deutschebahn.com/opendata`
  - Developer Docs: `https://developer-docs.deutschebahn.com/apis`
  - DB InfraGO Schienennetz (GDI-DE): `https://gdk.gdi-de.org/geonetwork/srv/api/records/55134453-193d-47ea-9b20-0f7016702c91`
- **prio:** P2
- **sonstiges:** Bahnübergänge sind ein klar abgegrenzter Hindernistyp. **Folge-Recherche:** exakten Open-Data-Datensatz „Bahnübergänge"/„Streckennetz mit Bauwerkstypen" im DB-Portal identifizieren (Listing-Seiten waren in dieser Recherche teils 404 → direkt im Portal suchen). Alternativ Bahnübergänge auch aus OSM (`railway=level_crossing`) ableitbar (siehe Länder-/OSM-Katalog).

---

## 9. GovData / open.NRW — „Lastbeschränkte Brücken NRW / Schwertransportkarte"

> Bundesweites Portal (GovData) mit länderspezifischem, aber GST-spezifischem Inhalt — hier gelistet, weil GovData der föderale Daten-Kataloghub ist und dieser Datensatz exakt das Projekt-Thema trifft.

- **quelle:** „Lastbeschränkte Brücken NRW — Schwertransportkarte" (Negativkarte gesperrter Brücken für GST)
- **betreiber:** Straßen.NRW / Autobahn GmbH (NRW); veröffentlicht über open.NRW (CKAN) und gespiegelt auf GovData
- **datentyp:** **Direkt GST-relevant** — Bauwerke (Brücken), die für Schwertransporte gesperrt sind (Negativkarte). „Schwertransport" = Fahrzeuge, deren Gewicht/Achslasten StVZO überschreiten.
- **strassentyp:** A + Landstraßen NRW (Zuständigkeit Straßen.NRW + Autobahn GmbH)
- **format:** Web-Karte / WMS; Rohdaten-Bereitstellung laut Datensatz „in Prüfung" (per Kontakt anfragbar)
- **apiEndpunkt:** **null** (Kartendienst; Rohdaten auf Anfrage)
- **update:** laufend gepflegt (Negativkarte)
- **auth:** keine (Karte); Rohdaten per Kontakt
- **kosten:** keine
- **lizenz:** open.NRW/GovData — i.d.R. dl-de; pro Datensatz prüfen
- **abdeckung:** NRW (nur ein Bundesland — aber Muster für DE: viele Länder haben eigene GST-Negativkarten, z.B. Sachsen LASuV)
- **zugang:** Karte offen; Rohdaten: Kontaktadresse im Datensatz anschreiben
- **verifiziert:** ja (GovData- + open.NRW-Eintrag bestätigt)
- **url:**
  - GovData: `https://www.govdata.de/suche/daten/lastbeschrankte-brucken-nrw-schwertransportkarte`
  - open.NRW (CKAN): `https://www.open.nrw/dataset/lastbeschr__nkte_br__cken_nrw___schwertransportkarte__1653989836`
  - Sachsen GST-Negativkarten (Pendant): `https://www.lasuv.sachsen.de/gst-negativkarten.html`
- **prio:** P2
- **sonstiges:** **Wichtiges Muster:** Die SIB-Bauwerke-Daten (Quelle 3) sind nicht offen — ABER mehrere Länder publizieren daraus abgeleitete **GST-Negativkarten** öffentlich. Diese sind die praktisch zugänglichste Brückenrestriktions-Quelle. → In den Länder-Katalog gehört eine systematische Liste aller 16 Landes-GST-Negativkarten. GovData (`govdata.de` / `data.gov.de`) ist der zentrale Sucheinstieg dafür.

---

## 10. BKG — Geodatenzentrum (INSPIRE Verkehrsnetze, DLM250)

- **quelle:** BKG Geodatenzentrum — INSPIRE Verkehrsnetze (Digitales Landschaftsmodell 1:250.000)
- **betreiber:** Bundesamt für Kartographie und Geodäsie (BKG), Zentrale Stelle für Geotopographie (ZSGT) i.A. der AdV
- **datentyp:** Straßen- und Schienennetz-**Topologie** (Verkehrsnetze) aus ATKIS DLM250; thematisch verknüpft mit Verwaltungseinheiten, Gewässernetz, Schutzgebieten. **Nur Netz/Geometrie**, KEINE Restriktionsattribute (keine Traglast/lichte Höhe).
- **strassentyp:** Alle (Netzklassen im DLM250, generalisiert 1:250.000)
- **format:** WFS, WMS (OGC, INSPIRE-konform)
- **apiEndpunkt:**
  - WFS: Dienst `wfs_dlm250_inspire` (INSPIRE-WFS DLM250) — exakte Endpunkt-URL **zu-bestätigen** über Produktseite/gdz.bkg.bund.de
  - WMS: Dienst `wms_dlm250_inspire`
- **update:** periodisch (ATKIS-Fortführung)
- **auth:** überwiegend keine (offene Dienste/Open Data BKG)
- **kosten:** kostenfrei
- **lizenz:** BKG Open Data; Namensnennung (GeoNutzV / dl-de) — pro Dienst prüfen
- **abdeckung:** bundesweit, 1:250.000 (grob — nicht straßenfein)
- **zugang:** offen
- **verifiziert:** ja (Dienst-Existenz + Quelle bestätigt; konkrete Endpunkt-URL zu-bestätigen)
- **url:**
  - INSPIRE Verkehrsnetze: `https://gdz.bkg.bund.de/index.php/default/inspire/inspire-verkehrsnetze.html`
  - INSPIRE-Übersicht: `https://gdz.bkg.bund.de/index.php/default/inspire.html`
  - Geodatenzentrum: `https://gdz.bkg.bund.de/`
- **prio:** P2
- **sonstiges:** Wegen Maßstab 1:250.000 zu grob als primäres Routennetz, aber nützlich als **bundesweite, einheitliche, frei lizenzierte Netz-Basisgeometrie** (Lückenfüller/Referenz). Für detailliertes Routing eher BISStra (A/B) + OSM (Alle).

---

## 11. DWD — Wetter-API (Warnungen)

- **quelle:** Deutscher Wetterdienst — Wetterwarnungen / Open Data (CDC)
- **betreiber:** Deutscher Wetterdienst (DWD)
- **datentyp:** Wetterwarnungen (Sturm, Glätte, Starkregen) — für GST **dynamische, wetterbedingte Fahr-Restriktionen** (Windlast bei großvolumiger Ladung, Brückensperrung bei Sturm).
- **strassentyp:** Alle (flächig/Warngebiete)
- **format:** GeoJSON, weitere; Open-Data-Files auf CDC-Server
- **apiEndpunkt (verifiziert):**
  - bund.dev Proxy: `https://dwd.api.proxy.bund.dev/v30/...` (z.B. `stationOverviewExtended?stationIds=...`)
  - CDC Open Data: `https://opendata.dwd.de/`
- **update:** laufend (Warnungen near-realtime)
- **auth:** keine
- **kosten:** keine
- **lizenz:** DWD Open Data (GeoNutzV; Namensnennung)
- **abdeckung:** bundesweit
- **zugang:** offen
- **verifiziert:** ja
- **url:**
  - Doku: `https://dwd.api.bund.dev/`
  - GitHub: `https://github.com/bundesAPI/dwd-api`
  - Open Data FAQ: `https://www.dwd.de/DE/leistungen/opendata/faqs_opendata.html`
- **prio:** P3 (wetterbedingte Restriktionen — niedrige Prio laut Auftrag)
- **sonstiges:** Nur relevant, wenn das System dynamische Wetter-Sperrkriterien (Wind/Brückensperrung) modellieren soll.

---

## 12. bund.dev / „deutschland" (Python) — API-Katalog (Meta-Quelle)

- **quelle:** bund.dev (API-Übersicht der Bundesverwaltung) + GitHub `bundesAPI/deutschland` (Python-Paket)
- **betreiber:** Community-Initiative (bundesAPI / Lilith Wittmann u.a.); dokumentiert offizielle Bundes-APIs
- **datentyp:** **Meta** — kuratierter Katalog von >30 Bundes-APIs inkl. Autobahn, DWD, PEGELONLINE, NINA u.a., als OpenAPI-3-Specs.
- **strassentyp:** n/a (Verzeichnis)
- **format:** OpenAPI 3 (YAML/JSON); Python-Wrapper
- **apiEndpunkt:** je gelistete API; Sammelseite `https://bund.dev/apis`
- **update:** laufend (Community)
- **auth:** n/a
- **kosten:** keine
- **lizenz:** Doku offen (GitHub); je API unterschiedlich
- **abdeckung:** bundesweit (Verzeichnis)
- **zugang:** offen
- **verifiziert:** ja
- **url:**
  - `https://bund.dev/`
  - `https://github.com/bundesAPI/deutschland`
  - `https://github.com/bundesapi`
- **prio:** P3 (Einstiegs-/Discovery-Quelle, kein Datenlieferant selbst)
- **sonstiges:** Nützlich, um weitere Bundes-APIs zu entdecken (OpenAPI-Specs direkt nutzbar). Empfehlung: `bundesAPI`-Org als Quelle für sauber dokumentierte Endpunkte im Auge behalten.

---

## Abdeckungslücken & Notizen (Synthese)

### Kern-Erkenntnis: Der „offene Layer" vs. der „echte Datenlayer"
- **Temporäre Restriktionen (Baustellen/Sperrungen)** sind **gut offen verfügbar**: Autobahn-API (BAB, Freitext) + Mobilithek/DATEX-II (bundesweit Bund+Länder, strukturierter). → P1, sofort nutzbar.
- **Dauerhafte Bauwerksrestriktionen (Brücken-Traglast, lichte Höhe, Tunnel, Engstellen)** sind die **eigentlich entscheidende Datenklasse für GST** — und liegen NICHT offen. Sie stecken in **SIB-Bauwerke / ASB-ING** (Behördensystem). Öffentlich sichtbar werden sie nur als **abgeleitete GST-Negativkarten** der Länder (z.B. NRW, Sachsen) oder über **VEMAGS INS-GST**.

### Strategische Empfehlung (Bund-Ebene)
1. **VEMAGS INS-GST / Xvemags** ist der naheliegendste offizielle Weg an die echten Brücken-/Bauwerksrestriktionen bundesweit — als Drittsystem andocken. **Offiziell anfragen** (Hessen Mobil / Projektleitung). Dazu BMDV-Projekt „GST 4.0" beobachten.
2. **Mobilithek-Konto** anlegen und den DATEX-II-Feed-Katalog systematisch inventarisieren (eigene Folge-Recherche pro Feed) — strukturierte Baustellen/Restriktionen bundesweit.
3. **Autobahn-API** sofort anbinden, aber einplanen: Höhen/Breiten/Gewicht meist nur als **Freitext** (`description`) + `display_type`/`icon` → Parsing-Pipeline nötig.
4. **GST-Negativkarten aller 16 Länder** als pragmatischste offene Brückenquelle systematisch erfassen — gehört in den Länder-Katalog; GovData/`data.gov.de` ist der Sucheinstieg.

### Konkrete Lücken / „zu-bestätigen"
- **BASt BISStra WFS-Endpunkt** (exakte URL) — WMS verifiziert (`https://inspire.bast.de/bisstra/strasse_wms`), WFS-Pfad noch zu lokalisieren (GDI-DE-Katalogeintrag vorhanden).
- **BKG DLM250 WFS/WMS** — Dienstnamen bekannt (`wfs_/wms_dlm250_inspire`), konkrete GetCapabilities-URL über Produktseite zu holen.
- **DB Bahnübergänge** — Open-Data-Datensatz existiert (DB InfraGO Geoobjekte), aber Listing-URLs lieferten 404 → exakten Datensatz im DB-Portal direkt lokalisieren. OSM (`railway=level_crossing`) als Fallback.
- **SIB-Bauwerke / VEMAGS / GST-Negativkarten-Rohdaten** — alle „eingeschränkt", Zugang nur per Anfrage/Vertrag (kein offener Endpunkt).

### Datenformat-Hinweis (für das Hindernis-Schema)
- Autobahn-API liefert **keine** sauberen Restriktions-Zahlfelder → Freitext-Extraktion einplanen.
- DATEX II (Mobilithek) hat **strukturierte** Restriktions-Elemente (gewicht/breite/höhe) → bevorzugt für maschinelle Auswertung temporärer Restriktionen.
- Bauwerksdaten (Traglast/lichte Höhe) sind in ASB-ING streng strukturiert — aber nur über VEMAGS/Länder erreichbar.

### Nicht (oder nur randständig) relevant auf Bundesebene
- ELWIS/PEGELONLINE: Wasserstraßen-Perspektive, für Straßen-GST nur Spezialfälle.
- DWD: nur wenn wetterbedingte dynamische Sperrungen modelliert werden (P3).
- BKG DLM250: zu grob (1:250.000) fürs feine Routing, gut als Referenznetz.

---

*Erstellt: 2026-06-13. Bereich Bundesquellen. Länderquellen + OSM/Overpass + kommerzielle Quellen werden in separaten Katalogen behandelt.*
