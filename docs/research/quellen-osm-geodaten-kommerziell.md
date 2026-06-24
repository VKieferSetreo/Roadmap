# Datenquellen-Katalog — OSM + GEODATEN-INFRASTRUKTUR + KOMMERZIELL

> **Projekt:** Roadmap (Setreo) — Routenanalyse für Großraum- und Schwertransporte (GST) in DE.
> **Scope dieses Dokuments:** (1) OpenStreetMap (Tags, Zugriffswege, Lizenz), (2) Geodaten-Standards (INSPIRE, OGC, GovData/Mobilithek), (3) Freie/OSS-Routing-Engines mit Truck-/GST-Profil (openrouteservice, GraphHopper). Kostenpflichtige Kommerzielle (PTV/HERE/TomTom) auf Max-Wunsch entfernt (2026-06-13).
> **Stand:** 2026-06-13. Recherche via WebSearch + WebFetch. Endpunkte wo möglich live verifiziert.
> **Lesehilfe:** `verifiziert=ja` = Endpunkt/Existenz live (curl) oder per offizieller Doku bestätigt. `zu-bestätigen` = Portal/Produkt gefunden, exakter Endpunkt/Pricing nicht live geprüft.
> **Rechte-Hinweis:** Lizenz/Zugang sind ehrlich markiert. „Erlaubt oder nicht" ist hier NICHT das Kriterium — alle echten Quellen werden gelistet.

---

## Schnellübersicht (Priorisierung)

| Prio | Quelle | Bereich | Datentyp | Status |
|------|--------|---------|----------|--------|
| **P1** | OSM via Overpass API | OSM | maxheight/width/weight/axleload, hgv, bridge, tunnel, level_crossing, roundabout | verifiziert (live) |
| **P2** | openrouteservice (driving-hgv) | Kommerziell/OSS | height/width/length/weight/axleload + hazmat | verifiziert (Doku) |
| **P2** | GraphHopper Directions (truck/custom_model) | Kommerziell/OSS | max_height/width/weight, axle_load, hazmat | verifiziert (Doku) |
| **P2** | INSPIRE Transport Networks (DLM250) WFS/ATOM | Geodaten-Std | Straßen-/Schienennetz-Topologie (GML) | verifiziert (Doku) |
| **P2** | Mobilithek (BMDV, NAP) | Geodaten-Std | Katalog/Marktplatz für Verkehrs-Datensätze (DATEX II etc.) | verifiziert |
| **P2** | GovData.de (DCAT-AP.de) | Geodaten-Std | Bund-Open-Data-Katalog, CKAN-API | verifiziert |
| **P3** | QLever (OSM-SPARQL) | OSM | analytische Geo-Queries (GeoSPARQL) auf ganz OSM | verifiziert (Doku) |
| **P3** | Nominatim | OSM | Geocoding / Reverse / Lookup | verifiziert (Doku) |
| **P3** | OSM planet.osm + diffs | OSM | Voll-Dump + minütliche/täglich Replikation | verifiziert |

> **Hinweis mCLOUD:** Das früher relevante mCLOUD-Portal des BMDV wurde 2022 von der **Mobilithek** abgelöst (ebenso der MDM/Mobility Data Marketplace). mCLOUD ist nur noch historisch zu nennen.

---
---

# ABSCHNITT 1 — OPENSTREETMAP (OSM)

OSM ist für Setreo die mit Abstand **breiteste, kostengünstigste und feinkörnigste** Quelle für dauerhafte (bauliche/rechtliche) Restriktionen — aber Qualität ist crowdsourced und uneinheitlich. Die folgende Tag→Hindernis-Mapping-Tabelle ist das Herzstück.

## 1.0 OSM-Tag → Hindernis-Mapping (KERNTABELLE)

| Hindernis (Setreo) | Primärer OSM-Tag | Wert/Format | Sekundär-/Conditional-Tags | DE-Nutzung (Geofabrik taginfo, 2026-06-13) | Notizen |
|---|---|---|---|---|---|
| **Max. Höhe (rechtlich)** | `maxheight` | Zahl in m (default), `3.8` od. `3.8 m`, auch `6'7"` | `maxheight:hgv`, `maxheight:conditional` | **104.936** (86.433 ways, 18.385 nodes) | Default-Einheit = Meter. Sonderwerte `default`, `below_default`, `none`, `no_indications`, `unsigned` (v.a. in DE genutzt). |
| **Max. Höhe (physisch)** | `maxheight:physical` | Zahl in m | `maxheight:signed=no` | (Teilmenge von maxheight, kleiner) | Reale lichte Höhe ohne/abweichend vom Schild — für GST oft die *härtere* Grenze als das Schild. |
| **Max. Breite (rechtlich)** | `maxwidth` | Zahl in m | `maxwidth:physical`, `maxwidth:conditional` | **14.878** (6.148 ways, 8.727 nodes) | `maxwidth:physical` für Engstellen/Poller-Durchfahrten relevant. |
| **Max. Gewicht (tatsächl.)** | `maxweight` | t (default) | `maxweight:hgv`, `maxweight:signed`, `maxweight:conditional` | **87.247** (84.875 ways) | „Tatsächliches" Gewicht inkl. Ladung. Abgrenzen von `maxweightrating`! |
| **Max. zul. Gesamtgewicht** | `maxweightrating` | t | `maxweightrating:hgv`, `maxweightrating:hgv:conditional` | (deutlich seltener) | Bezieht sich auf zulässiges Gesamtgewicht laut Zulassung, nicht Ist-Gewicht. In FR Standard, in DE seltener. |
| **Max. Achslast** | `maxaxleload` | t (default) | `maxbogieweight` (Doppelachse) | **2.269** (2.247 ways) | **SCHWACH abgedeckt** — für GST-Brückenstatik aber zentral. Lücke! |
| **Brücke** | `bridge=yes` (+ Subtypen) | `yes`/`viaduct`/… | Höhe/Last am *darunter* führenden Way (`maxheight` auf Querung) | (sehr hoch) | WICHTIG: Lichte Höhe einer Brücke wird am **darunter** verlaufenden Way getaggt, nicht an der Brücke selbst. |
| **Tunnel** | `tunnel=yes` | `yes`/`building_passage`/… | `maxheight` am Tunnel-Way, `hazmat`/ADR | (hoch) | Lichte Höhe + ADR-Beschränkung am Tunnel-Way. |
| **Furt** | `ford=yes` | `yes`/`stepping_stones` | — | (mittel) | Für schwere Achslasten / Tiefe relevant. |
| **LKW-Zugang/-Verbot** | `hgv` | `yes`/`no`/`designated`/`destination` | `hgv:conditional`, `hgv_articulated` | **82.929** (79.369 ways) | `hgv=destination` = nur Anlieger; `hgv_articulated` speziell Sattelzug. |
| **Gefahrgut** | `hazmat` | `yes`/`no`/`destination` | `hazmat:water`, ADR-Tunnel-Kategorie | (mittel) | Für GST mit Gefahrgut-Komponente. |
| **Bahnübergang** | `railway=level_crossing` | node | `crossing:barrier`, `maxheight` (Oberleitung!) | (hoch) | Oberleitungs-Höhe oft via `maxheight` am Node. Auch `railway=crossing` (Fußweg). |
| **Kreisverkehr** | `junction=roundabout` | way (Ringgeometrie) | `highway=mini_roundabout` (node) | (hoch) | Radius/Schleppkurve NICHT direkt getaggt → aus Geometrie (Ringdurchmesser) ableiten. |
| **Verkehrsberuhigung/Engstelle** | `traffic_calming` | `bump`/`island`/`choker`/`chicane`/`table` | `width`, `maxwidth:physical` | (mittel) | `choker`/`chicane` = Fahrbahnverengung → GST-kritisch. |
| **Steigung** | (kein eigener Tag) | — | `incline` (`10%`, `up`, `down`) | (gering/uneinheitlich) | `incline` selten & unzuverlässig → besser aus DGM/Höhenmodell ableiten (extern). |

**Conditional-Restrictions-Syntax (OSM):** `<key>:conditional = <wert> @ <bedingung>`, z.B. `maxweight:conditional = none @ destination` oder `maxweight:hgv:conditional = 12 @ (axles=2)`. Bedingungen können Fahrzeug-Properties (weight, axleload, length, width, height mit `<,>,=,<=,>=`) oder Zweck (destination, delivery) sein. Für GST-Parsing relevant, aber komplex.

---

## 1.1 Overpass API (Haupt-Zugriffsweg für gezielte Abfragen)

- **quelle:** Overpass API — read-only Query-Engine über OSM-Daten
- **betreiber:** FOSSGIS e.V. (Hauptinstanz) + diverse Mirrors
- **datentyp:** alle o.g. Tags, gefiltert nach Bbox/Tag/Geometrie
- **strassentyp:** Alle (A/B/L/K + Wege), soweit in OSM getaggt
- **format:** Overpass-QL (→ Output JSON / GeoJSON / CSV / XML)
- **apiEndpunkt (verifiziert):**
  - Hauptinstanz: `https://overpass-api.de/api/interpreter` (FOSSGIS, v0.7.62.11, **live getestet ✓**)
  - Mirror Private.coffee: `https://overpass.private.coffee/api/interpreter` (kein Rate-Limit angegeben)
  - Mirror kumi.systems: `https://overpass.kumi.systems/api/interpreter` (frei, kein hartes Limit)
  - Mirror VK Maps (RU): `https://maps.mail.ru/osm/tools/overpass/api/interpreter`
  - Geofabrik (kostenpflichtig, API-Key): `https://overpass.geofabrik.de/{API_KEY}/api/interpreter`
- **update:** minütlich (Hauptinstanz repliziert von planet diffs, „timestamp_osm_base" im Output)
- **auth:** keine (User-Agent/Referer-Header gefordert)
- **kosten:** keine (Hauptinstanz). Faustregel: <10.000 Queries/Tag UND <1 GB/Tag = unkritisch. Über diesem Volumen → eigene Instanz hosten.
- **lizenz:** Daten unter **ODbL 1.0** (siehe §1.7). Output enthält Copyright-Hinweis explizit.
- **abdeckung:** weltweit; DE sehr gut (siehe taginfo-Zahlen oben)
- **zugang:** offen — direkt abrufbar, keine Registrierung
- **verifiziert:** **ja (live)** — Test-Query lieferte 166 `maxheight`-Ways in winziger Berlin-Mitte-Bbox; Output ODbL-markiert, osm_base 2026-06-13T12:19Z
- **url:** `https://wiki.openstreetmap.org/wiki/Overpass_API` · QL-Doku: `https://dev.overpass-api.de/overpass-doc/`
- **prio:** P1
- **Beispiel-Query-Konzept (nicht implementieren, nur Skizze):**
  ```
  [out:json][timeout:60];
  area["ISO3166-1"="DE"]->.de;
  way(area.de)["maxheight"];   // analog maxweight/maxwidth/maxaxleload/hgv
  out tags geom;
  ```
  Für Brücken-Querungen: `way["bridge"]` + benachbarte `way["maxheight"]`-Korrelation.
- **Abdeckungslücken/Notizen:** Overpass ist ideal für **gezielte/inkrementelle** Abfragen, NICHT für DE-weiten Bulk-Export (Timeout/Last). `/api/status` braucht passenden Accept-Header (gibt sonst HTTP 406), Interpreter funktioniert aber einwandfrei.

---
---

## 1.3 OSM Planet + Diffs (Voll-Dump / Replikation)

- **quelle:** planet.openstreetmap.org
- **betreiber:** OpenStreetMap Foundation (OSMF)
- **datentyp:** kompletter weltweiter OSM-Datenbestand + Änderungs-Diffs
- **format:** `.osm.pbf` (~80 GB), `.osm.bz2`; Diffs als `.osc.gz`
- **apiEndpunkt (verifiziert):**
  - Planet: `https://planet.openstreetmap.org/pbf/`
  - Minütliche Diffs: `https://planet.openstreetmap.org/replication/minute/`
  - Tägliche Diffs: `https://planet.openstreetmap.org/replication/day/`
- **update:** Planet wöchentlich; Diffs minütlich/stündlich/täglich
- **auth:** keine · **kosten:** keine · **lizenz:** **ODbL 1.0**
- **abdeckung:** weltweit
- **zugang:** offen
- **verifiziert:** ja (Doku) · **prio:** P3 (für DE reicht Geofabrik)
- **url:** `https://planet.openstreetmap.org/`
- **Notizen:** Nur relevant wenn man eine selbst-aktualisierende Mirror-DB betreiben will (Diffs einspielen). Für DE-Scope ist Geofabrik effizienter.

---

## 1.4 QLever (OSM als SPARQL / GeoSPARQL)

- **quelle:** QLever SPARQL-Engine (RDF-Repräsentation von OSM)
- **betreiber:** Universität Freiburg (AD-Lehrstuhl) / qlever.dev
- **datentyp:** ganz OSM analytisch abfragbar; GeoSPARQL (`ogc:sfContains`, `ogc:sfIntersects`)
- **format:** SPARQL → JSON/TSV/CSV
- **apiEndpunkt (verifiziert):** UI `https://qlever.dev/` (OSM-Datensatz wählbar); SPARQL-Endpoint pro Datensatz
- **update:** OSM wöchentlich repliziert
- **auth:** keine · **kosten:** keine · **lizenz:** Daten ODbL
- **zugang:** offen
- **verifiziert:** ja (Doku) · **prio:** P3
- **url:** `https://wiki.openstreetmap.org/wiki/QLever`
- **Notizen:** Stark für **analytische** Cross-DE-Auswertungen („alle Brücken mit maxheight<4 m an B-Straßen"), die in Overpass timeouten würden. Lernkurve SPARQL. Nice-to-have, kein Muss.

---

## 1.5 Nominatim (Geocoding)

- **quelle:** Nominatim
- **betreiber:** OSMF (offizielle Instanz) + self-host möglich
- **datentyp:** Geocoding (Name→Koordinate), Reverse, Lookup nach OSM-ID
- **format:** REST → JSON/XML/GeoJSON
- **apiEndpunkt (verifiziert):** `https://nominatim.openstreetmap.org/search` · `/reverse` · `/lookup`
- **update:** kontinuierlich (offizielle Instanz)
- **auth:** keine, aber **strikte Nutzungsbedingungen** (max 1 req/s, kein Bulk) auf der offiziellen Instanz
- **kosten:** keine (offiziell); für Volumen self-host
- **lizenz:** Daten ODbL
- **zugang:** offen (mit Usage Policy)
- **verifiziert:** ja (Doku) · **prio:** P3
- **url:** `https://nominatim.org/release-docs/latest/api/Overview/`
- **Notizen:** Für Start-/Zieladressen-Auflösung im Routing. Bei Volumen self-host oder kommerziellen Geocoder.

---

## 1.6 OSM-Tag-Zuverlässigkeit in DE (Bewertung)

Aus Geofabrik-taginfo (DE-Subset, 2026-06-13, live abgefragt):

| Tag | Objekte DE | Bewertung für GST |
|---|---|---|
| `maxheight` | **104.936** | **Sehr gut** — DE ist taginfo-weit Spitzenreiter; auch Sonderwerte (default/below_default) DE-typisch gepflegt. |
| `maxweight` | **87.247** | **Sehr gut** — flächendeckend an Brücken/Ortsdurchfahrten. |
| `hgv` | **82.929** | **Sehr gut** — LKW-Verbote breit erfasst. |
| `maxwidth` | 14.878 | **Mittel** — lückenhaft, oft nur an offensichtlichen Engstellen. |
| `maxaxleload` | **2.269** | **Schwach** — kritische Lücke für GST-Brückenstatik; ergänzen aus Brückenbüchern/SIB-Bauwerke (Bund/Land). |

**Fazit OSM-Tragfähigkeit:** Für **dauerhafte** Restriktionen (Höhe, Gewicht, LKW-Verbote) ist OSM in DE **tragfähig als Basis-Layer** — breit, aktuell (täglich), feinkörnig, kostenlos. Schwächen: Achslast dünn, Breite lückenhaft, Steigung unzuverlässig (besser DGM), Schleppkurven nur aus Geometrie ableitbar. OSM sollte als **Grundgerüst** dienen, das durch amtliche/kommerzielle Quellen (Achslast, Brückenstatik, Schwertransport-Listen) **veredelt** wird — nicht als alleinige Wahrheit.

---

## 1.7 ODbL — Lizenz-Implikationen (WICHTIG fürs Produkt)

- **Lizenz:** Open Database License (ODbL) 1.0 — gilt für ALLE OSM-abgeleiteten Quellen oben (Overpass, Geofabrik, planet, QLever, Nominatim-Daten).
- **Kernpflichten:**
  - **Attribution:** „© OpenStreetMap contributors" muss sichtbar sein, wo OSM-Daten/-Karten genutzt werden.
  - **Share-Alike:** Wird eine **„Derived Database"** öffentlich verbreitet, muss sie ebenfalls unter ODbL stehen. **„Produced Works"** (z.B. eine berechnete Route, ein Kartenbild) sind davon **nicht** betroffen — nur die Datenbank selbst.
  - Kommerzielle Nutzung ist **ausdrücklich erlaubt**.
- **Konsequenz für Setreo:** Solange Setreo OSM intern verarbeitet und als Output **Routen/Analysen (Produced Works)** liefert, greift Share-Alike nicht auf das Setreo-Produkt durch. Würde Setreo aber eine **angereicherte Restriktions-DB als Datenprodukt** weitergeben, müsste man die ODbL-Implikationen (Share-Alike auf den OSM-abgeleiteten Teil) sauber prüfen. **→ Juristisch vor Produktentscheidung absichern.** Attribution ist Pflicht.
- **url:** `https://opendatacommons.org/licenses/odbl/`

---
---

# ABSCHNITT 2 — GEODATEN-INFRASTRUKTUR-STANDARDS

Dieser Abschnitt beschreibt **Zugriffsmuster** (Standards) und **Kataloge**, über die Landes-/Kommunal-/Bundes-Geodaten systematisch auffindbar/abrufbar sind. Die konkreten Landes-Quellen sind Sache anderer Recherche-Stränge; hier geht es um „WIE finde/zugreife ich".

## 2.1 INSPIRE — Transport Networks Theme

- **quelle:** INSPIRE (EU-Richtlinie 2007/2/EG), Theme **Transport Networks (TN)**, Annex I
- **betreiber:** EU-weit verpflichtend; in DE umgesetzt über GDI-DE & Landes-Geodienste; zentral via BKG (DLM250-Bereitstellung)
- **datentyp:** Verkehrsnetz-Topologie (Road/Rail/Water/Air/Cable Networks): Geometrie, Netzknoten, teils Attribute. **Keine** feinen GST-Restriktionen wie Achslast — eher Netz-Backbone.
- **strassentyp:** Alle (im DLM250-Maßstab 1:250.000 generalisiert)
- **format:** **WFS 2.0.0** (GML 3.2.1) und **ATOM** (Predefined Dataset Download); Metadaten via CSW
- **apiEndpunkt (verifiziert):**
  - BKG INSPIRE-WFS DLM250 (TN/HY/AU/PS): Service-Eintrag über `https://gdz.bkg.bund.de/` bzw. Geodatenkatalog `https://gdk.gdi-de.org/`
  - Datensatz-Record (DLM250, INSPIRE): `https://gdk.gdi-de.org/geonetwork/srv/api/records/CE94CE46-9843-4D14-80C3-89446AD2FFBC`
  - exakte WFS-GetCapabilities-URL: **zu-bestätigen** (über Katalog-Record auflösen)
- **update:** periodisch (DLM250 jährlich aktualisiert)
- **auth:** überwiegend offen; manche Download-Services Registrierung
- **kosten:** i.d.R. keine (INSPIRE = offene Geodaten)
- **lizenz:** je Anbieter, häufig **DL-DE/BY-2.0** (Namensnennung) oder GeoNutzV
- **abdeckung:** DE-weit (DLM250-Maßstab) bzw. EU-weit harmonisiert
- **zugang:** offen / teils Registrierung → über CSW-Katalog (Geodatenkatalog.de) auffindbar
- **verifiziert:** ja (Doku/Record) · **prio:** P2
- **url:** `https://www.gdi-de.org/` · Data Spec TN v3.1 (INSPIRE-MIF Technical Guidelines)
- **Abdeckungslücken/Notizen:** TN liefert das **Netz-Gerüst**, NICHT die feinen Restriktionen. Maßstab 1:250.000 ist grob — für GST-Detailrouting zu generalisiert. Nützlich als referenzierbares amtliches Netz (Netzknoten/ASB-Bezug) und um Landes-Detail-Datensätze via Katalog zu finden. **OGC WFS/WMS/OGC API Features als allgemeines Zugriffsmuster** auf nahezu alle Landes-/Kommunal-Geodienste — bei jeder Landesquelle nach `GetCapabilities` (WFS/WMS) bzw. `/collections` (OGC API Features) suchen.

---

## 2.2 OGC-Zugriffsmuster (WFS / WMS / OGC API Features) — Methode

- **quelle:** OGC-Standards (kein einzelner Anbieter — Zugriffsmuster)
- **datentyp:** Vektordaten (WFS / OGC API Features → GeoJSON/GML), Rasterkarten (WMS/WMTS)
- **format:** WFS 2.0 (GML/GeoJSON), WMS 1.3.0, WMTS, **OGC API – Features** (REST/JSON, moderner Nachfolger des WFS)
- **apiEndpunkt:** je Land/Kommune unterschiedlich — Muster:
  - WFS: `…?SERVICE=WFS&REQUEST=GetCapabilities` → Liste der `FeatureType`s
  - OGC API Features: `…/collections` → `…/collections/{id}/items?f=json&bbox=…`
- **zugang:** offen bis Registrierung, je Betreiber
- **verifiziert:** ja (Standard) · **prio:** P2 (Methode, kein Endpunkt)
- **Notizen:** **Das** generische Werkzeug, um Landes-/Kommunal-Restriktionsdaten (z.B. „lastbeschränkte Brücken NRW", Schwertransportkarten) maschinell zu ziehen. Immer zuerst GetCapabilities/collections abfragen, dann gezielt FeatureType laden.

---

## 2.3 Mobilithek (BMDV) — Nationaler Zugangspunkt (NAP)

- **quelle:** Mobilithek — zentrale Mobilitätsdaten-Plattform des Bundes
- **betreiber:** BMDV (Bundesministerium für Digitales und Verkehr)
- **datentyp:** Mobilitäts-/Verkehrsdaten: Baustellen, Sperrungen, LKW-Verkehrsportal, Stellplatz-Infodienst, DATEX-II-Feeds von Bund + Ländern
- **format:** DATEX II, diverse; Katalog + Daten-Bereitstellung (Push/Pull-Container)
- **apiEndpunkt (verifiziert):** Portal `https://mobilithek.info/`; Daten über registrierte Container/Abos
- **update:** je Datenangebot (viele Echtzeit-nah)
- **auth:** **Registrierung** (Organisations-Account; Zertifikat für manche Feeds)
- **kosten:** Open-Data-Teil kostenlos; manche Angebote restricted
- **lizenz:** je Datengeber
- **abdeckung:** DE-weit (Bund + Länder)
- **zugang:** Registrierung → Open + restricted Bereiche
- **verifiziert:** ja · **prio:** P2 (überschneidet sich mit Bundesquellen-Strang)
- **url:** `https://mobilithek.info/`
- **Abdeckungslücken/Notizen:** **Ersetzt mCLOUD + MDM** (seit 2022). Verlinkt zu GovData und Mobility Data Space (MDS). Systematischer Einstieg, um DATEX-II-Verkehrs-/Baustellenfeeds für GST zu finden. LKW-Verkehrsportal ist GST-relevant.

---

## 2.4 GovData.de — Offene-Daten-Portal Deutschland

- **quelle:** GovData — nationales Open-Data-Portal
- **betreiber:** Bund/Länder gemeinsam (FITKO)
- **datentyp:** Metadaten-Katalog über ALLE Verwaltungs-Datensätze DE (inkl. Verkehr/Geo)
- **format:** Metadaten nach **DCAT-AP.de**; **CKAN-API** für maschinelle Suche
- **apiEndpunkt (verifiziert):**
  - Portal/Suche: `https://www.govdata.de/`
  - CKAN-API (Datensatz-Suche): `https://www.govdata.de/ckan/api/3/action/package_search?q=…`
- **update:** kontinuierlich (harvestet Landes-/Kommunalportale)
- **auth:** keine (Lese-API offen)
- **kosten:** keine
- **lizenz:** je Datensatz (oft DL-DE-BY/Zero, CC)
- **abdeckung:** DE-weit (föderal)
- **zugang:** offen
- **verifiziert:** ja · **prio:** P2
- **url:** `https://www.govdata.de/`
- **Abdeckungslücken/Notizen:** **Systematische Such-Strategie:** CKAN-`package_search` mit Stichworten (`Brücke`, `Schwertransport`, `lastbeschränkt`, `Durchfahrtshöhe`, `LKW`) + Filter `groups:tran` (Verkehr). GovData ist ein **Katalog/Index**, nicht selbst Datenquelle — führt zu den eigentlichen Landes-/Kommunal-WFS/Downloads.

> **mCLOUD (historisch):** Hatte eine REST-Export-API (`https://mcloud.de/export/`, RDF/DCAT-AP.de/CSV). **Abgelöst durch Mobilithek** — nicht mehr als aktive Quelle einplanen.

---
---

# ABSCHNITT 3 — KOMMERZIELLE ANBIETER (Truck-/GST-Attribute)

Hier nur **freie / Open-Source-Routing-Engines** mit LKW-/GST-Profil (self-hostbar, kostenlos). Kostenpflichtige kommerzielle Anbieter (PTV, HERE, TomTom) wurden auf Wunsch von Max (2026-06-13) aus dem Katalog entfernt.

## 3.4 openrouteservice (ORS) — driving-hgv (OSS + Hosted)

- **quelle:** openrouteservice, Profil `driving-hgv`
- **betreiber:** HeiGIT gGmbH / Uni Heidelberg (basiert auf OSM-Daten)
- **datentyp:** HGV-Routing mit `profile_params.restrictions`: **length, width, height, axleload, weight** (alle in m bzw. t) + **`hazmat: true`** + `vehicle_type` (hgv/bus/agricultural/…). Berücksichtigt OSM-Tags (z.B. `maxheight`) im Routing.
- **strassentyp:** Alle (OSM-basiert → Qualität = OSM-Qualität, siehe §1.6)
- **format:** REST-JSON / GeoJSON
- **apiEndpunkt (verifiziert):**
  - Hosted: `https://api.openrouteservice.org/v2/directions/driving-hgv`
  - Self-host: eigene Instanz (Docker), beliebige OSM-Region
- **update:** Hosted-Instanz repliziert OSM regelmäßig
- **auth:** **API-Key** (kostenlos, Registrierung) für Hosted
- **kosten:** **Hosted Free-Tier** (Tages-/Minuten-Limits, z.B. ~2.000 Requests/Tag für directions); Self-host **kostenlos & unlimitiert** (eigene Hardware)
- **lizenz:** Software Apache-2.0; Daten ODbL (OSM)
- **abdeckung:** weltweit/DE = OSM-Abdeckung
- **zugang:** offen (Free-Tier) / Self-host
- **verifiziert:** ja (Doku: HGV-Restrictions + hazmat bestätigt)
- **url:** `https://openrouteservice.org/` · `https://giscience.github.io/openrouteservice/`
- **prio:** P2
- **Abdeckungslücken/Notizen:** **Bester Weg, OSM-Restriktionen sofort routbar zu machen** ohne eigene Engine. Da OSM-basiert: gleiche Lücken (Achslast dünn) wie §1.6. Self-host = volle Kontrolle + kein Limit, ideal wenn Setreo OSM ohnehin als Basis nutzt. ORS-Restrictions decken GST-Dimensionen direkt ab.

---

## 3.5 GraphHopper — Directions API (truck / custom_model)

- **quelle:** GraphHopper Directions API
- **betreiber:** GraphHopper GmbH (DE) — OSS-Engine + Hosted-Service
- **datentyp:** Built-in-Profile `truck` + `small_truck`; **custom_model** mit Encoded Values `max_width`, `max_height`, `max_weight`, `max_length`, `axle_load`, `hazmat`, `surface`, `toll`. Eigene Truck-Profile mit Dimensionen/Speed konfigurierbar.
- **strassentyp:** Alle (OSM-basiert)
- **format:** REST-JSON
- **apiEndpunkt (verifiziert):**
  - Hosted: `https://graphhopper.com/api/1/route`
  - Custom Profiles (Hosted): Profil mit Prefix `cp_` erstellbar
  - Self-host: eigene Instanz (OSS, Apache-2.0)
- **update:** Hosted repliziert OSM; Self-host nach eigenem Import
- **auth:** **API-Key** (Hosted)
- **kosten:** Hosted mit Free-Tier (Tageslimit) + Paid-Pläne; **Truck-Routing teils Premium-Add-on** → bei GraphHopper verifizieren. Self-host kostenlos.
- **lizenz:** Engine Apache-2.0; Daten ODbL (OSM)
- **abdeckung:** weltweit/DE = OSM
- **zugang:** offen (Free-Tier) / kommerziell / Self-host
- **verifiziert:** ja (Doku: truck-Profil + custom_model Encoded Values bestätigt)
- **url:** `https://docs.graphhopper.com/openapi/routing` · `https://www.graphhopper.com/`
- **prio:** P2
- **Abdeckungslücken/Notizen:** Sehr flexibel (custom_model pro Request). OSM-basiert → gleiche Datenlücken. DE-Anbieter, gute Doku. Truck-Profil im Hosted-Tarif ggf. kostenpflichtig — Konditionen prüfen. Self-host für volle Kontrolle.

---

## 3.6 Spezial-/Heavy-Anbieter (Hinweis)

- (Kostenpflichtige Heavy/Spezial-Anbieter wie PTV wurden auf Max-Wunsch entfernt — nicht weiter betrachtet.)
- Daneben existieren GST-/Routing-Aggregatoren und Behörden-Verfahren (VEMAGS, ESTW etc.) — diese sind im **separaten Recherche-Strang „Schwertransport-Aggregatoren"** (`quellen-schwertransport-aggregatoren.md`) abgedeckt, daher hier nicht dupliziert.
- **prop2osm (gis-ops):** Dienstleistung/Tooling, das proprietäre Datensätze (TomTom/HERE) in FOSS-Routing-Engines (ORS/GraphHopper) routbar macht — relevant falls man kommerzielle Attribute mit eigener Engine kombinieren will. URL: `https://github.com/gis-ops/prop2osm-public`.

---
---

# QUERSCHNITT — Empfehlung & Lücken

**Empfohlene Schichtung (Daten-Strategie):**
1. **Basis-Layer:** OSM (Geofabrik-PBF → eigene PostGIS) für dauerhafte Restriktionen — breit, gratis, täglich, ODbL.
2. **Routbar machen:** ORS/GraphHopper self-host auf demselben OSM-Stand (driving-hgv).
3. **Veredeln/Validieren:** Achslast/Tunnel-Kategorien/Gefahrgut (wo OSM dünn ist) aus **amtlichen** Quellen ziehen (BASt SIB-Bauwerke, Länder-Brückenbücher, GST-Negativkarten) statt kostenpflichtiger Kommerzieller.
4. **Kataloge zur Quellenfindung:** GovData (CKAN-API) + Mobilithek + INSPIRE/OGC-WFS für amtliche Landes-Detaildaten (Brückenlast/Schwertransportkarten).

**Größte Lücken:**
- **Achslast** (`maxaxleload`) in OSM extrem dünn (2.269 DE) → kritisch für GST-Brückenstatik. Muss aus amtlichen Brückenbüchern (SIB-Bauwerke/Land-Brückenlisten) kommen.
- **Schleppkurven/Kreisverkehr-Radien** nirgends als Attribut → aus Geometrie ableiten.
- **Steigung** unzuverlässig → DGM/Höhenmodell extern.
- **ODbL-Share-Alike** rechtlich prüfen, falls angereicherte DB als Datenprodukt weitergegeben wird.

---

## Quellen (verifiziert)

OSM: wiki.openstreetmap.org (Key:maxheight, maxweight, maxwidth, maxaxleload, hgv, Overpass_API, QLever, Conditional_restrictions), taginfo.geofabrik.de/europe:germany (live counts), download.geofabrik.de/europe/germany.html, planet.openstreetmap.org, nominatim.org, opendatacommons.org/licenses/odbl. **Overpass live getestet** (overpass-api.de/api/interpreter, 2026-06-13).
Geodaten-Std: gdi-de.org, gdk.gdi-de.org, mobilithek.info, govdata.de, INSPIRE-MIF Technical Guidelines (Transport Networks v3.1).
Freie Engines: openrouteservice.org + giscience.github.io/openrouteservice, docs.graphhopper.com.
