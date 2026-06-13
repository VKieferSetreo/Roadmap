# Quellen-Recherche: Schwertransport-spezifisch + Nationale Aggregatoren/Standards

> Recherche-Stand: **2026-06-13**
> Bereich: GST-spezifische Systeme (VEMAGS) und nationale Daten-Aggregatoren/Austauschstandards
> (Mobilithek/MDM, DATEX II, TIC, BASt-Bauwerksdaten, NAP/EU).
> Methode: WebSearch + WebFetch, jede URL einzeln aufgerufen und geprüft. Unsichere/nicht
> bestätigte URLs sind als `null` + „zu-bestätigen" markiert — **keine** erfundenen Endpunkte.

## Einleitung & Gesamtbild

Für Roadmap (Routenanalyse GST) gibt es in DE **drei** strukturell verschiedene Quell-Welten:

1. **GST-Genehmigungswelt (VEMAGS / GST.Autobahn / Statik-Modul).** Hier liegen die
   fachlich präzisesten Daten — Bauwerks-Tragfähigkeiten, Achslast-Statik, Auflagen,
   freigegebene Routen. **Aber: kein offener Daten-Feed.** Der Zugang ist
   registrierungs-/verfahrensgebunden; die einzige technische Tür ist die SOAP/XML-
   Schnittstelle **Xvemags** für zugelassene Drittsystem-Hersteller (Antragstellung,
   nicht Daten-Pull eines Restriktionskatalogs). Dahinter steckt das OKSTRA-Schema
   „Schwerlast" und ASB-ING-Bauwerksdaten.

2. **Nationaler Aggregator (Mobilithek = National Access Point DE).** Der NAP nach
   EU-ITS-Richtlinie. Sammelt DATEX-II-Baustellen/Verkehrsmeldungen aller Länder + Bund.
   Zugang: Mobilithek-Registrierung + (für die meisten Datensätze) Nutzungsvereinbarung
   pro Datensatz + Zertifikat. Der **eigentliche Schatz**: hier publizieren die
   Bundesländer ihre Baustellen-Feeds, die man sonst 16-fach einzeln suchen müsste.

3. **Bauwerks-/Infrastruktur-Stammdaten (BASt).** SIB-Bauwerke (= Software, nicht offener
   Datensatz) ist die Quelle, **abgeleitet öffentlich** ist die **Brückenkarte / Brücken-
   statistik** der BASt (via.bund.de) als CC-BY-Download — aber primär Zustand/Lage,
   Tragfähigkeit/lichte Höhe nur eingeschränkt.

**Faustregel fürs Projekt:** Höhen-/Breiten-/Gewichtsrestriktionen bekommt man **nicht
aus einer Quelle**. Baustellen → Mobilithek/Autobahn-API; Bauwerks-Grenzwerte → BASt-Karte
+ OSM-`maxheight`/`maxweight` als Lückenfüller; die „goldene" GST-Statik liegt hinter
VEMAGS und ist nur über das Genehmigungsverfahren selbst erreichbar.

---

## 1. VEMAGS — Verfahrensmanagement Großraum- und Schwertransporte

- **quelle:** VEMAGS® — bundesweit einheitliches Online-Genehmigungssystem für GST
- **betreiber:** Hessen Mobil – Straßen- und Verkehrsmanagement (Projektleitung VEMAGS),
  im Auftrag von Bund + allen 16 Ländern
- **datentyp:** Genehmigungs-/Antragsdaten, Routen, **Bauwerks-Restriktionen** (Statik-
  Modul: Tragfähigkeit, zulässige Achslasten/-abstände), Auflagen/Bedingungen je Genehmigung
- **strassentyp:** Alle (A/B/L/K — gesamtes Genehmigungs-relevantes Netz)
- **format:** SOAP/XML-Schnittstelle **Xvemags** (Varianten: `Xvemags-AB` Antragstellung,
  `Xvemags-FP` Fachprüfung durch Straßenbaubehörden, `Xvemags-EGB` Kassen/Gebühren).
  Fachschema: **OKSTRA „Schwerlast"**; Bauwerksdaten nach **ASB-ING (2013)**.
- **apiEndpunkt:** `null` (Anwendung: `https://applikation.vemags.de` — interaktiv, kein
  offener Daten-Endpunkt; Xvemags-WSDL nur für zugelassene Drittsysteme, URL **zu-bestätigen**)
- **update:** laufend (Verfahrens-/Genehmigungsdaten in Echtzeit im System)
- **auth:** Pflicht-Registrierung; Xvemags zusätzlich Hersteller-Zulassung/Vertrag
- **kosten:** Teilnahme kostenfrei; Xvemags-Anbindung über Projektleitung (Konditionen
  zu-bestätigen)
- **lizenz:** keine offene Lizenz — Verfahrensdaten, nicht open data
- **abdeckung:** bundesweit, alle Länder + Bund
- **zugang:** **eingeschränkt.** WIE: (a) als Antragsteller/Behörde registrieren auf
  vemags.de; (b) für maschinelle Anbindung Xvemags → Kontakt Projektleitung Hessen Mobil
  (Landesbeauftragte als Erstkontakt). Ein „Restriktions-Export" für Dritte ist **nicht**
  als Produkt vorgesehen — Anbindung zielt auf Antrags-Workflow, nicht Daten-Bezug.
- **verifiziert:** ja (Existenz, Betreiber, Xvemags-Varianten, OKSTRA/ASB-ING bestätigt);
  konkrete WSDL-URL + Daten-Pull-Rechte: **zu-bestätigen**
- **url:** https://www.vemags.de/ · https://www.vemags.de/verfahrens-modul/ ·
  https://www.vemags.de/statik-modul/
- **prio:** **HOCH** (fachlich beste GST-Daten) — aber Zugang ist das Risiko
- **sonstiges:** **Statik-Modul** = Bund/Länder-Entwicklung, standardisierte statische
  Beurteilung zur Bestimmung von Fahrbeschränkungen. **Routenmanagement** = Karten-Tool,
  Route digital erfassen → an Behörden. Praktisch der wertvollste, aber am schwersten
  zugängliche Datenschatz. Strategie-Empfehlung: früh Kontakt zur Projektleitung suchen
  und klären, ob ein lesender Zugang (z.B. auf Bauwerks-/Strecken-Restriktionen) überhaupt
  möglich ist — sonst bleibt VEMAGS eine Datenquelle „durch die Hintertür" (eigene Anträge).

---

## 2. GST.Autobahn (Autobahn GmbH) — Genehmigungs-/Befahrbarkeits-Tool

- **quelle:** GST.Autobahn — Tool der Autobahn GmbH für GST-Antragsprüfung auf BAB
- **betreiber:** Autobahn GmbH des Bundes (alle 10 Niederlassungen)
- **datentyp:** Befahrbarkeits-/Streckenbewertung BAB, weitgehend automatisierte
  Antragsprüfung; gibt im Anhörungsverfahren Stellungnahme zur „Streckenpassierbarkeit"
- **strassentyp:** A (nur Bundesautobahnen)
- **format:** internes Tool / Verfahren (kein offenes Format dokumentiert)
- **apiEndpunkt:** `null`
- **update:** laufend
- **auth:** behördenintern (Genehmigungsbehörden/Anhörung)
- **kosten:** n/a (intern)
- **lizenz:** keine offene
- **abdeckung:** bundesweit, BAB-Netz
- **zugang:** **eingeschränkt** — kein öffentlicher Datenzugang; nur im Verfahren.
  WIE: relevant nur als Kontext, dass die BAB-Befahrbarkeitslogik dort liegt; ein Daten-
  Export ist nicht bekannt.
- **verifiziert:** ja (Tool-Existenz, alle 10 NL, taggleiche Bearbeitung bestätigt)
- **url:** https://www.autobahn.de/fuer-unternehmen/allgemeines
- **prio:** mittel (Kontext/Vollständigkeit; kein nutzbarer Feed)
- **sonstiges:** Genehmigungs-Entscheid liegt bei den Ländern; Autobahn GmbH liefert
  Passierbarkeits-Statement für BAB-Abschnitte. Zeigt: die „Wahrheit" über GST-Routen
  entsteht erst im Verfahren, nicht in einem statischen Kataster.

---

## 3. Mobilithek (ehem. MDM) — Nationaler Zugangspunkt DE

- **quelle:** Mobilithek — National Access Point (NAP) Deutschland für Mobilitätsdaten
- **betreiber:** BMV/BMDV (Bundesministerium); technischer Betrieb über den NAP
- **datentyp:** Aggregator — Baustellen, Sperrungen, Verkehrsmeldungen, Parken,
  Ladeinfrastruktur u.v.m. der Länder + Bund; **DATEX II** als De-facto-Standard
- **strassentyp:** Alle (je nach publizierendem Datensatz; BAB über Autobahn GmbH,
  B/L/K über Landes-Verkehrszentralen)
- **format:** **DATEX II v2 + v3** (XML), Container-Format, beliebige Payloads;
  Transport: **HTTPS/REST**, **SOAP via HTTPS**, **OCIT-C** (für DATEX II)
- **apiEndpunkt:** Portal `https://mobilithek.info/` · Schnittstellen-Doku (TSSB)
  `https://mobilithek.info/cms/downloads/tssb-de` — der konkrete Daten-Endpunkt entsteht
  **pro abonniertem Datensatz** (Broker-URL), daher kein einzelner globaler `apiEndpunkt`
- **update:** je Datensatz (Baustellen typ. minütlich–täglich, DATEX-II-„Push/Pull")
- **auth:** Mobilithek-Registrierung + **Zertifikatsauthentifizierung**; pro Datensatz
  i.d.R. **Nutzungsvereinbarung** (Broker-Modell). Einige Datensätze „öffentlich" ohne
  Zugangsbarriere, andere vertraglich.
- **kosten:** überwiegend kostenfrei (öffentliche Daten); abhängig von Datensatz-Lizenz
- **lizenz:** **je Datensatz** — häufig Datenlizenz Deutschland (dl-de/by-2.0), teils CC-BY
- **abdeckung:** bundesweit; Länder publizieren unterschiedlich vollständig (s. Lücken)
- **zugang:** **Registrierung.** WIE: Konto auf mobilithek.info anlegen → Datensätze im
  Katalog suchen → Nutzungsvereinbarung akzeptieren → Zertifikat einrichten → Broker-Bezug
  via REST/SOAP/OCIT-C. Technische Schnittstellenbeschreibung (TSSB) v1.3.1 (16.04.2025)
  ist öffentlich abrufbar.
- **verifiziert:** ja (NAP-Status, Protokolle REST/SOAP/OCIT-C, DATEX II v2/v3, TSSB-URL)
- **url:** https://mobilithek.info/ · https://mobilithek.info/cms/downloads/tssb-de
- **prio:** **HOCH** (zentraler Baustellen-/Meldungs-Aggregator, EU-konform, bundesweit)
- **sonstiges:** Bekannte konkrete Zulieferer/Profile: **Bayern** (ArbIS → Bayern-VIZ →
  DATEX II), **NRW** (MOBIDROM-Plattform, Roadworks-Profil, bidirektional mit Bund),
  **Baden-Württemberg** (svzbw/MobiData-BW, s. Quelle 5). „German Roadworks Profile"
  (v04-00-00) ist das gemeinsame DATEX-II-Baustellenprofil auf MDM/Mobilithek. Für
  Roadmap ist Mobilithek der natürliche „eine-Stelle-für-alle-Länder"-Einstieg statt
  16 Landesportale. Quellen-ID `0009` im Projekt-Register ist hierfür bereits reserviert.

---

## 4. DATEX II — Austauschstandard (Querschnitt)

- **quelle:** DATEX II — europäischer XML-Standard für Verkehrs-/Mobilitätsdaten
- **betreiber:** DATEX II Community / EU (CEN); in DE Pflicht-Lieferformat im NAP
- **datentyp:** **Profile relevant für GST:** `SituationPublication` (Roadworks/
  Baustellen, Closures, Ereignisse) · `NetworkRestriction` (dauerhafte Netz-Beschränkungen
  Höhe/Gewicht/Breite) · `TrafficViewPublication`/`MeasuredData` (Verkehrslage)
- **strassentyp:** Alle (modellseitig; Abdeckung hängt am Lieferanten)
- **format:** **DATEX II** (XML, v2 + v3), Profile-basiert
- **apiEndpunkt:** kein eigener — Standard, kein Datenanbieter (Bezug via NAP/Feeds)
- **update:** n/a (Format)
- **auth:** n/a
- **kosten:** Standard frei
- **lizenz:** offen (Spezifikation); Doku unter docs.datex2.eu
- **abdeckung:** EU-weit als Standard; DE-Profile auf Mobilithek
- **zugang:** **offen** (Doku/Schemas). WIE: Schemas + Profile-Verzeichnis auf
  datex2.eu/docs.datex2.eu frei; das **German Roadworks Profile** im DATEX-II-Profile-
  Directory.
- **verifiziert:** ja (Profile Roadworks/Network/Situation, German Roadworks Profile,
  v3.x Doku bestätigt)
- **url:** https://datex2.eu/ · https://docs.datex2.eu/ ·
  https://datex2.eu/profiles-directory/
- **prio:** **HOCH** (Roadmap muss DATEX II parsen können — es ist das Eingangsformat
  fast aller Länder-Baustellenfeeds)
- **sonstiges:** Für die Hindernis-DB ist `NetworkRestriction` das fachlich spannendste
  Paket (dauerhafte Höhen-/Gewichtslimits) — in DE aber **deutlich seltener befüllt** als
  Roadworks. Praktisch: Baustellen kommen verlässlich, statische Netzrestriktionen muss
  man oft aus Bauwerks-/OSM-Daten ergänzen. Parser sollte v2 UND v3 können.

---

## 5. MobiData BW / svzbw — Baustellen Baden-Württemberg (konkreter Länder-Feed)

- **quelle:** Baustelleninformationen Baden-Württemberg (svzbw / MobiData BW)
- **betreiber:** Land Baden-Württemberg (svzbw — Straßenverkehrszentrale BW)
- **datentyp:** geplante + aktuelle Baustellen/Arbeitsstellen
- **strassentyp:** B/L/K (Bundes-, Landes-, Kreisstraßen) — **nicht** BAB
- **format:** **DATEX II (XML)**, **GeoJSON**, **CIFS (JSON)**, **WMS/WFS**, **CSV**
- **apiEndpunkt (verifiziert, ohne Auth):**
  - DATEX II: `https://api.mobidata-bw.de/datasets/traffic/roadworks/roadworks_svzbw.datex2.xml`
  - GeoJSON: `https://api.mobidata-bw.de/datasets/traffic/roadworks/roadworks_geojson.json`
  - CIFS: `https://api.mobidata-bw.de/datasets/traffic/roadworks/roadworks_cifs.json`
  - WFS/CSV: `https://api.mobidata-bw.de/geoserver/MobiData-BW/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=MobiData-BW%3Aroadworks&outputFormat=csv`
  - GeoServer: `https://api.mobidata-bw.de/geoserver/web/`
- **update:** laufend (Datensatz zuletzt geändert 28.01.2026)
- **auth:** **keine** — direkter Abruf
- **kosten:** kostenfrei
- **lizenz:** **Datenlizenz Deutschland Namensnennung 2.0** (dl-de/by-2.0)
- **abdeckung:** Baden-Württemberg (B/L/K)
- **zugang:** **offen** — direkter HTTP-GET, keine Registrierung
- **verifiziert:** ja (Formate + Endpunkte über daten-bw.de-Detailseite bestätigt)
- **url:** https://www.daten-bw.de/daten/-/details/baustelleninformationen-baden-wurttemberg80208
- **prio:** **HOCH** (Referenz-/Musterfeed: zeigt, dass Länder die Daten teils auch
  AUSSERHALB der Mobilithek frei + ohne Auth + multi-format anbieten — ideal für Pilot)
- **sonstiges:** Dieser Feed ist ein **Goldstandard-Beispiel**: vier parallele Formate,
  keine Auth, dl-de/by-2.0. Wenn Roadmap Länder-für-Länder erschließt, lohnt es, jeweils
  zu prüfen, ob ein vergleichbares freies Landesportal existiert (oft günstiger als der
  Mobilithek-Broker-Vertrag). CIFS = Construction Information Sharing Format (Waze/Google-nah).

---

## 6. Autobahn GmbH API (verkehr.autobahn.de) — BAB Baustellen/Sperrungen

- **quelle:** Autobahn API (bundesAPI/„bund.dev")
- **betreiber:** Autobahn GmbH des Bundes
- **datentyp:** Baustellen (`roadworks`), Verkehrsmeldungen (`warning`), Sperrungen
  (`closure`), LKW-Parkplätze (`parking_lorry`), Ladestationen, Webcams
- **strassentyp:** A (nur Bundesautobahnen)
- **format:** **REST/JSON** (OpenAPI dokumentiert); zusätzlich WMS/WFS-Endpunkte erwähnt
- **apiEndpunkt (verifiziert):** Base `https://verkehr.autobahn.de/o/autobahn/`
  - Liste Autobahnen: `https://verkehr.autobahn.de/o/autobahn/`
  - Baustellen je BAB: `https://verkehr.autobahn.de/o/autobahn/{A}/services/roadworks`
  - Sperrungen: `https://verkehr.autobahn.de/o/autobahn/{A}/services/closure`
  - Warnungen: `https://verkehr.autobahn.de/o/autobahn/{A}/services/warning`
  - LKW-Parken: `https://verkehr.autobahn.de/o/autobahn/{A}/services/parking_lorry`
  - OpenAPI: `https://autobahn.api.bund.dev/openapi.yaml`
- **update:** laufend (Monitoring zeigt ~100% Verfügbarkeit; CORS aktiv)
- **auth:** **keine**
- **kosten:** kostenfrei
- **lizenz:** offen (im README nicht explizit benannt — i.d.R. dl-de; **zu-bestätigen**)
- **abdeckung:** bundesweit BAB-Netz
- **zugang:** **offen** — direkter HTTP-GET
- **verifiziert:** ja (Endpunkte + Services bestätigt; Höhen-/Gewichts-Restriktionen
  **nicht** enthalten — nur Baustellen/Sperrungen/Meldungen)
- **url:** https://github.com/bundesAPI/autobahn-api · https://autobahn.api.bund.dev/
- **prio:** **HOCH** (bereits Projekt-Quelle `0001`; einfachster offener BAB-Einstieg)
- **sonstiges:** **Wichtig:** liefert **keine** maxheight/maxweight/Restriktionen — nur
  Ereignisse (Baustellen/Sperrungen). Lücke „dauerhafte BAB-Bauwerksbeschränkung" bleibt.
  Für Restbreiten in Baustellen sind Detailfelder zu prüfen.

---

## 7. BASt Brückenkarte / Brückenstatistik (via.bund.de) — Bauwerksdaten Bund

- **quelle:** Interaktive Brückenkarte / Brückenstatistik Bundesfernstraßen
- **betreiber:** Bundesanstalt für Straßenwesen (BASt) / BMV-BMDV
- **datentyp:** Brücken der Bundesfernstraßen — Lage, Baustoff, **Zustandsnote (1–4)**,
  Bauwerksdaten; Download zur Weiterverwendung möglich
- **strassentyp:** A + B (Bundesfernstraßen)
- **format:** Karten-Anwendung mit **Export/Download** (Format im Detail zu-bestätigen,
  vermutl. CSV/GeoJSON über Export-Funktion)
- **apiEndpunkt:** `null` (Web-Anwendung + Export-Funktion; kein offener REST/WFS bestätigt)
- **update:** **halbjährlich** (biannual)
- **auth:** **keine**
- **kosten:** kostenfrei
- **lizenz:** **CC-BY 4.0** (offene Daten, laut GDI-DE-Metadatensatz)
- **abdeckung:** bundesweit, alle Bauwerke in Bundeszuständigkeit
- **zugang:** **offen** — Karte nutzen + „alle Bauwerksdaten herunterladen"
- **verifiziert:** ja (Existenz, CC-BY, halbjährlich, Zustandsnoten, Export-Funktion);
  exaktes Download-Format + ob **Traglast/lichte Höhe** enthalten: **zu-bestätigen**
- **url:** https://www.bmv.de/SharedDocs/DE/Artikel/StB/brueckenkarte.html?nn=12830 ·
  https://www.bast.de/DE/Ingenieurbau/Fachthemen/brueckenstatistik/brueckenstatistik.html ·
  GDI-DE-Metadaten: https://gdk.gdi-de.org/geonetwork/srv/api/records/699335644490391552
- **prio:** **HOCH** (einzige offene bundesweite Brücken-Stammdatenquelle)
- **sonstiges:** **Achtung Datentiefe:** Karte ist primär Zustands-/Lage-orientiert.
  Ob die **GST-relevanten** Felder (Tragfähigkeit/zul. Achslast, lichte Höhe) im Export
  stecken, ist **zu verifizieren** — wahrscheinlich NICHT in voller Tiefe, da die echten
  Statik-Werte in SIB-Bauwerke/VEMAGS liegen. Trotzdem bester offener Bauwerks-Anker;
  Projekt-Quelle `0002` (BASt SIB-Bauwerke) sollte konkret auf DIESE Karte/Export gemappt
  werden, nicht auf SIB-Bauwerke (= Software, kein Download, s. Quelle 8).

---

## 8. SIB-Bauwerke (ASB-ING) — Bauwerks-Fachsystem (NICHT offen)

- **quelle:** SIB-Bauwerke — Programmsystem Bund/Länder für Bauwerksdaten nach DIN 1076
- **betreiber:** Bund/Länder (IT-Koordinierung Straßenwesen); Vertrieb/Support
  **WPM-Ingenieure**
- **datentyp:** vollständige Bauwerksstammdaten — Konstruktion, **Tragfähigkeit/
  Nachrechnung**, Zustand, Verkehrsdaten, Wartungshistorie; Schema **ASB-ING (2013)**
- **strassentyp:** Alle klassifizierten Straßen mit Bauwerken
- **format:** Software-System (proprietär); Datenaustausch ASB-ING/OKSTRA
- **apiEndpunkt:** `null`
- **update:** laufend (durch Baulastträger gepflegt)
- **auth:** behördlich
- **kosten:** kommerziell (Software-Lizenz via WPM-Ingenieure)
- **lizenz:** **keine offene** — Daten gehören den Baulastträgern (Bund/Länder)
- **abdeckung:** bundesweit (Datenhaltung dezentral bei Ländern/Bund)
- **zugang:** **eingeschränkt/kommerziell.** WIE: kein öffentlicher Bulk-Download.
  Software/Daten über WPM-Ingenieure bzw. die jeweilige Straßenbauverwaltung. Einzelne
  **kommunale Bauwerkslisten** tauchen als Open Data auf (s. Quelle 9), aber **ohne**
  Höhe/Traglast.
- **verifiziert:** ja (Software-Charakter, WPM-Ingenieure, ASB-ING bestätigt)
- **url:** https://sib-bauwerke.de/ ·
  https://www.bast.de/DE/Themen/Digitales/HF_1/Massnahmen/bauwerksdaten.html
- **prio:** mittel (Wissensbasis: erklärt, warum Traglast-Daten NICHT offen sind)
- **sonstiges:** **Kernerkenntnis:** Die fachlich besten Bauwerksdaten (Tragfähigkeit,
  lichte Höhe) liegen hier — aber **nicht** als offener Datensatz. Der Weg dorthin führt
  über das **VEMAGS-Statik-Modul** (im Genehmigungsverfahren) oder direkten Behördenkontakt.
  Projekt-Register sollte `0002` von „SIB-Bauwerke" auf „BASt Brückenkarte" umbenennen,
  da SIB-Bauwerke selbst nicht abrufbar ist.

---

## 9. Kommunale Bauwerkslisten (Open Data, Muster: Aachen)

- **quelle:** z.B. „Bauwerksliste Aachen" (open.NRW / Open Data Portal Aachen)
- **betreiber:** Kommunen (hier Stadt Aachen, IUK)
- **datentyp:** Bauwerksverzeichnis nach DIN 1076 — Bauwerks-Nr., Name, Ort, Art,
  Konstruktion, Baujahr, Fläche (m²)
- **strassentyp:** K + kommunal
- **format:** **CSV**
- **apiEndpunkt:** `null` (Datei-Download über Portal)
- **update:** unregelmäßig (Stichtage 2017/2020/2021)
- **auth:** keine
- **kosten:** kostenfrei
- **lizenz:** **Datenlizenz Deutschland Namensnennung 2.0**
- **abdeckung:** punktuell, einzelne Kommunen
- **zugang:** **offen** (Open-Data-Portale der Kommunen / GovData / open.NRW)
- **verifiziert:** ja (Felder, CSV, dl-de/by-2.0 bestätigt — **keine** Höhe/Traglast)
- **url:** https://open.nrw/dataset/bauwerksliste-ac
- **prio:** niedrig (lückenhaft, ohne GST-Grenzwerte)
- **sonstiges:** Zeigt, dass kommunale Bauwerkslisten existieren, aber für GST **wertlos**
  ohne Höhe/Traglast. Nur als Lückenfüller für Existenz/Lage einzelner Bauwerke. Pro
  Stadt einzeln suchen (GovData-Stichwort „Bauwerksliste"/„Brücken").

---

## 10. OpenStreetMap / Overpass — maxheight/maxweight (Lückenfüller Restriktionen)

- **quelle:** OpenStreetMap via Overpass API + „Maxheight Map"-Analyse
- **betreiber:** OSM-Community
- **datentyp:** `maxheight`, `maxheight:physical`, `maxwidth`, `maxweight`, `maxlength`,
  `maxaxleload`, Brücken/Tunnel-Tags, Bahnübergänge (`railway=level_crossing`)
- **strassentyp:** Alle (Datenqualität variiert stark)
- **format:** **REST (Overpass QL → JSON/XML)**, OSM-XML, PBF
- **apiEndpunkt (verifiziert):** `https://overpass-api.de/api/interpreter` (öffentliche
  Overpass-Instanz; Doku: https://wiki.openstreetmap.org/wiki/DE:Key:maxheight)
- **update:** Echtzeit (Community-Edits; Overpass near-real-time)
- **auth:** keine (Fair-Use-Limits der öffentlichen Instanz)
- **kosten:** kostenfrei
- **lizenz:** **ODbL** (Open Database License) — Namensnennung + Share-alike beachten
- **abdeckung:** bundesweit, aber **unvollständig/uneinheitlich** (legal vs. physical mix)
- **zugang:** **offen** — Overpass QL gegen öffentliche Instanz oder eigenes Setup
- **verifiziert:** ja (Tags, Overpass, ODbL, „Maxheight Map" bestätigt)
- **url:** https://wiki.openstreetmap.org/wiki/DE:Key:maxheight ·
  https://wiki.openstreetmap.org/wiki/DE:Maxheight_Map
- **prio:** **HOCH als Lückenfüller** (oft die EINZIGE offene Quelle für lichte Höhen
  an Brücken/Tunneln auf B/L/K)
- **sonstiges:** Projekt-Quelle `0003` bereits reserviert. **Vorsicht:** `maxheight`
  ohne `:physical` ist die *rechtliche* Grenze (Schild), nicht die physische Durchfahrtshöhe.
  Für GST ist die physische Höhe entscheidend → `maxheight:physical` bevorzugen, sonst
  Sicherheitsabschlag. Qualität rechtfertigt manuelle Nachprüfung kritischer Punkte.

---

## 11. DATEX II German Roadworks Profile (Profil-Referenz)

- **quelle:** German Roadworks Profile (DATEX II Profile Directory)
- **betreiber:** DATEX II Community / DE-Lieferanten (auf MDM/Mobilithek)
- **datentyp:** standardisiertes Baustellen-/Sperrungs-Profil für DE
- **strassentyp:** Alle
- **format:** DATEX II (Profil v04-00-00)
- **apiEndpunkt:** `null` (Profil-Definition, kein Daten-Endpunkt)
- **update:** n/a
- **auth:** n/a
- **kosten:** frei
- **lizenz:** offen (Profil-Spezifikation)
- **abdeckung:** DE (Referenzprofil für Länder-Feeds)
- **zugang:** **offen** (Profil-Verzeichnis datex2.eu)
- **verifiziert:** ja (Profil-Existenz v04-00-00 bestätigt)
- **url:** https://repo.datex2.eu/implementations/profile_directory/german-roadworks-profile
- **prio:** mittel (Implementierungs-Referenz für den Parser, kein eigener Datenstrom)
- **sonstiges:** Beim Bau des DATEX-II-Parsers an genau diesem Profil orientieren —
  es definiert, welche Felder die DE-Länder in Roadworks befüllen.

---

## 12. PTV (xServer / Map&Guide / Developer) — kommerzielles GST-Routing

- **quelle:** PTV Group — Truck-/Schwertransport-Routing-Software
- **betreiber:** PTV Logistics GmbH (kommerziell)
- **datentyp:** LKW-/Schwertransport-Routing inkl. Truck-Attribute, Maut, Brücken-/
  Höhen-/Gewichtsrestriktionen, Umweltzonen; teils Genehmigungsroute-Unterstützung
- **strassentyp:** Alle (kommerzielles Kartenmaterial)
- **format:** **REST-API** (PTV Developer / xServer)
- **apiEndpunkt:** `null` (kommerziell; Endpunkt nach Lizenz/Account)
- **update:** kommerziell gepflegt
- **auth:** API-Key (kostenpflichtig)
- **kosten:** **kommerziell** (Lizenz/Abo)
- **lizenz:** proprietär
- **abdeckung:** DE + EU
- **zugang:** **kommerziell.** WIE: Account bei PTV Logistics; xServer 1 EOL 30.09.2026,
  Nachfolger **PTV Developer** (Cloud). Map&Guide für Truck-Routenplanung.
- **verifiziert:** ja (Produkte, Truck-Routing, EOL-Datum bestätigt)
- **url:** https://www.ptvlogistics.com/ · https://developer.myptv.com/ (**zu-bestätigen**)
- **prio:** niedrig (nur falls „make-or-buy" für Routing-Engine erwogen wird)
- **sonstiges:** Relevant nur als Benchmark/Alternative zur Eigenentwicklung. PTV nutzt
  intern bereits Brücken-/Restriktionsdaten — aber als Blackbox, nicht als Daten-Bezug.
  Nicht als Hindernis-Datenquelle nutzbar, sondern als konkurrierende Gesamtlösung.

---

## 13. NAPCORE / NAPSPAN — EU Cross-Border NAPs (niedrige Prio)

- **quelle:** NAPCORE (EU-Koordination der NAPs) / NAPSPAN (kommerzieller Multi-NAP-Layer)
- **betreiber:** EU-Projekt (NAPCORE) / privat (NAPSPAN)
- **datentyp:** Aggregation mehrerer nationaler Access Points; NAPSPAN bietet u.a.
  truck-aware Routing mit Brücken-Lichtraum/Gewichtslimits, ADR-Tunnel-Kategorien
- **strassentyp:** Alle (länderübergreifend)
- **format:** DATEX II (NAPs); NAPSPAN „eine API" über 6 NAPs (DE, FR, NL, BE, CH, DK)
- **apiEndpunkt:** `null` (NAPSPAN kommerziell; Endpunkt nach Account)
- **update:** je NAP
- **auth:** NAPSPAN kommerziell
- **kosten:** NAPCORE-Doku frei; NAPSPAN kommerziell
- **lizenz:** je Quelle
- **abdeckung:** EU / Grenzregionen
- **zugang:** NAPCORE **offen** (Doku); NAPSPAN **kommerziell**
- **verifiziert:** ja (NAPCORE-Projekt, NAPSPAN-6-NAP-Angebot bestätigt)
- **url:** https://napcore.eu/ · https://napspan.com/ ·
  https://transport.ec.europa.eu/transport-themes/smart-mobility/road/its-directive-and-action-plan/national-access-points_en
- **prio:** **niedrig** (nur Grenzregionen DE; für rein nationale GST-Routen irrelevant)
- **sonstiges:** Interessant, falls Roadmap je grenznahe/internationale Routen prüft.
  NAPSPAN zeigt, dass „Brücken-Lichtraum + Gewicht gegen Truck-Spec prüfen" bereits als
  kommerzielles Produkt existiert — Validierung des Roadmap-Use-Cases.

---

## Abdeckungslücken / Notizen

1. **Die GST-Goldquelle ist eingemauert.** Tragfähigkeit, zulässige Achslasten und
   freigegebene Routen liegen in **VEMAGS-Statik-Modul + SIB-Bauwerke** — beides **nicht**
   offen. Offene Quellen (BASt-Karte, OSM) liefern Lage/Zustand/teilweise Höhe, aber
   **nicht** die statische Tragfähigkeit. → Roadmap kann „Hindernis erkennen", aber
   „GST-Freigabe rechnen" nur mit VEMAGS-Anbindung oder Behörden-Datendeal.

2. **VEMAGS-Zugang früh klären.** Empfehlung: Projektleitung Hessen Mobil kontaktieren
   und prüfen, ob (a) ein lesender Restriktions-/Bauwerks-Zugang denkbar ist, oder (b)
   Xvemags nur Antrags-Workflow erlaubt. Realistisch ist Letzteres — dann ist VEMAGS
   keine Daten-Quelle, sondern ein Verfahrens-Endpunkt.

3. **Restriktionen ≠ Baustellen.** Offene Feeds (Mobilithek/Autobahn-API/Länder) sind
   stark auf **Ereignisse** (Baustellen/Sperrungen) optimiert. **Dauerhafte** Höhen-/
   Gewichts-/Breitenlimits (DATEX-II `NetworkRestriction`) sind in DE dünn befüllt →
   müssen aus BASt-Bauwerk + OSM `maxheight:physical` zusammengesetzt werden.

4. **Bauwerks-Tiefe der BASt-Karte unbestätigt.** Ob der via.bund.de-Export tatsächlich
   Traglast UND lichte Höhe pro Brücke liefert, ist **zu verifizieren** (nächster Schritt:
   Karte öffnen, Export ziehen, Felder prüfen). Wahrscheinlich nur Zustand/Lage/Baustoff.

5. **Länder publizieren uneinheitlich.** Manche Länder bieten freie Multi-Format-Feeds
   ohne Auth (BW/MobiData-BW = Goldstandard), andere nur über Mobilithek-Broker mit
   Vertrag. Pro Land prüfen, ob ein direkter offener Landesfeed existiert (spart Broker-
   Vertrag). Verifiziert offen: BW. Über Mobilithek bestätigt: Bayern (ArbIS), NRW
   (MOBIDROM).

6. **Projekt-Quellenregister-Korrekturen empfohlen:**
   - `0002` „BASt SIB-Bauwerke" → besser **„BASt Brückenkarte (via.bund.de)"**, da
     SIB-Bauwerke selbst kein Download ist.
   - `0009` Mobilithek: berücksichtigen, dass es **kein** globaler Endpunkt ist, sondern
     pro Datensatz ein Broker-Bezug mit Zertifikat/Nutzungsvereinbarung.
   - Neue Quelle erwägen: **MobiData-BW** als eigene `0004?` (offen, ohne Auth, multi-format).

7. **Bahnübergänge / Steigungen / Kreisverkehre / Engstellen:** Keine dedizierte
   bundesweite offene Quelle gefunden. → primär aus **OSM** ableiten
   (`railway=level_crossing`, `highway`-Geometrie für Schleppkurven/Radien,
   Höhenmodell/`incline` für Steigung) + manuelle Erfassung. DB/Bahn-Übergangsdaten
   sind nicht als offener GST-Feed verfügbar.

8. **CIFS** (Construction Information Sharing Format, Waze/Google-Format) taucht bei
   MobiData-BW auf — relevant, falls Roadmap je Daten an Navi-Dienste zurückspielen will,
   für den Import aber DATEX II/GeoJSON vorziehen.

9. **TIC/TIC3:** Kein konkreter aktiver DE-Datenanbieter im TIC3-Format gefunden, der
   für GST relevant wäre. In DE hat sich **DATEX II** als Austauschformat im NAP
   durchgesetzt; TIC3 spielt für GST-Hindernisdaten praktisch keine Rolle (→ niedrige Prio,
   nicht weiter verfolgt).

---

### Quellenverzeichnis (Web, geprüft 2026-06-13)

- VEMAGS: https://www.vemags.de/ · /verfahrens-modul/ · /statik-modul/
- GST.Autobahn: https://www.autobahn.de/fuer-unternehmen/allgemeines
- Mobilithek (NAP DE): https://mobilithek.info/ · TSSB: https://mobilithek.info/cms/downloads/tssb-de
- DATEX II: https://datex2.eu/ · https://docs.datex2.eu/ · https://datex2.eu/profiles-directory/
- German Roadworks Profile: https://repo.datex2.eu/implementations/profile_directory/german-roadworks-profile
- MobiData BW: https://www.daten-bw.de/daten/-/details/baustelleninformationen-baden-wurttemberg80208
- Autobahn API: https://github.com/bundesAPI/autobahn-api · https://autobahn.api.bund.dev/
- BASt Brückenkarte: https://www.bmv.de/SharedDocs/DE/Artikel/StB/brueckenkarte.html?nn=12830 · https://gdk.gdi-de.org/geonetwork/srv/api/records/699335644490391552
- SIB-Bauwerke: https://sib-bauwerke.de/ · https://www.bast.de/DE/Themen/Digitales/HF_1/Massnahmen/bauwerksdaten.html
- Kommunale Bauwerksliste (Aachen): https://open.nrw/dataset/bauwerksliste-ac
- OSM maxheight: https://wiki.openstreetmap.org/wiki/DE:Key:maxheight · https://wiki.openstreetmap.org/wiki/DE:Maxheight_Map
- PTV: https://www.ptvlogistics.com/
- NAPCORE/NAPSPAN: https://napcore.eu/ · https://napspan.com/ · https://transport.ec.europa.eu/transport-themes/smart-mobility/road/its-directive-and-action-plan/national-access-points_en
