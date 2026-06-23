# Datenquellen-Katalog — LÄNDER OST (Berlin, Brandenburg, MV, Sachsen, Sachsen-Anhalt, Thüringen)

> **Projekt:** Roadmap (Setreo) — Routenanalyse für Großraum- und Schwertransporte (GST) in DE.
> **Scope dieses Dokuments:** Die sechs östlichen Bundesländer. Pro Land: Verkehrsinfo-/Baustellen-Portal + Feed, Landesbetrieb Straßenbau, Open-Data-Portal, Geoportal/GDI (WFS/WMS), DATEX-II via Mobilithek, GST-Negativkarte.
> **Stand:** 2026-06-13. Recherche via WebSearch + WebFetch; OGC-Endpunkte wo möglich per Live-`GetCapabilities` (curl HTTP-Status + Layer-Namen) verifiziert.
> **Lesehilfe:** `verifiziert=ja` = Endpunkt live (HTTP 200) oder per offizieller Metadaten/Doku bestätigt. `zu-bestätigen` = Portal gefunden, exakter API-Endpunkt unklar / nicht öffentlich / hinter CAPTCHA → `apiEndpunkt=null`.
> **Rechte-Hinweis:** Lizenz/Zugang sind ehrlich markiert. „Erlaubt oder nicht" ist hier NICHT das Kriterium — Rechte werden separat besorgt. Alles auflisten.
> **Wichtige Querschnitts-Erkenntnis:** Die Roadworks-/Baustellen-Feeds liefern Sperrungen/Umleitungen, aber so gut wie NIE strukturierte GST-Restriktionen (Höhe/Breite/Gewicht/Achslast). Diese kommen aus (a) OSM (`maxheight/maxweight/maxwidth/maxaxleload`), (b) GST-Negativkarten der Straßenbauverwaltung (Brücken-Traglast) und (c) Bauwerks-WFS (nur Geometrie/Identität, KEINE Traglast). Die ATKIS/INSPIRE-Verkehrsnetz-WFS liefern Netzgeometrie, nicht Restriktionen.

---

## Schnellübersicht je Land (Anzahl Quellen + wichtigste offene verifizierte Treffer)

| Land | Quellen | Offene verifizierte Top-Treffer |
|------|--------:|----------------------------------|
| **Berlin** | 6 | VIZ Berlin WFS+2× GeoJSON (live 200), Detailnetz-Bauwerke WFS @ gdi.berlin.de (live 200) |
| **Brandenburg** | 5 | INSPIRE Verkehrsnetze WFS @ inspire.brandenburg.de (live 200, dl-de/by-2.0), ALKIS WMS (live 200) |
| **Mecklenburg-Vorp.** | 5 | Straßenbaustellen-WFS + Verkehrsnetz-WFS @ geodaten-mv.de (live 200, tagesaktuell) |
| **Sachsen** | 6 | Baustellen-WMS @ geodienste.sachsen.de (live 200, CC-BY-4.0), GST-Negativkarte (PDF, offen), INSPIRE-TN-WFS (live 200, dl-de/by-2.0) |
| **Sachsen-Anhalt** | 5 | LSBB-Sperrinfo-WFS (live 200, GeoJSON, ABER non-commercial), INSPIRE-TN-WFS @ geodatenportal (live 200) |
| **Thüringen** | 5 | Klassif.-Straßennetz-WFS + INSPIRE-TN-RO-WFS @ geoproxy (live 200, dl-de/by-2.0) |

**Gemeinsame Bund-/Cross-Quellen** (NICHT hier dupliziert, siehe `quellen-bund.md`): Autobahn-GmbH-API (alle A in allen 6 Ländern), Mobilithek/DATEX-II (seit 01.01.2026 Meldepflicht RSA 21 → faktischer Live-Backbone aller Länder), OSM/Overpass + Geofabrik (GST-Restriktions-Layer maxheight/maxweight für alle Länder), WSV-GDWS GST-Brücken-WMS/WFS, BASt.

---

# 1. BERLIN

> **GDI-Wechsel beachten:** Das alte **FIS-Broker** wurde zum **01.12.2025 abgeschaltet** und durch **Geoportal Berlin** (`https://gdi.berlin.de/viewer/main/`) + **Geodatensuche Berlin** (`https://gdi.berlin.de/geonetwork/...`) ersetzt. OGC-Dienste laufen jetzt unter `gdi.berlin.de`. Alte FIS-Broker-URLs (`fbinter.stadt-berlin.de`) sind tot bzw. werden umgezogen — bei jeder FIS-Broker-Referenz neu prüfen.

### 1.1 VIZ Berlin — Baustellen/Sperrungen (WFS) — **P1, verifiziert**
- **quelle:** Berlin VIZ — Baustellen, Sperrungen und sonstige Störungen (mdhwfs)
- **betreiber:** Verkehrsinformationszentrale (VIZ) / Senatsverwaltung für Mobilität, Verkehr, Klimaschutz und Umwelt
- **datentyp:** Baustellen, Sperrungen, Störungen, Veranstaltungen (Disruptions). KEINE baulichen Lastdaten.
- **strassentyp:** Alle (Stadtgebiet)
- **format:** WFS 2.0 (GeoServer), Default GML, GeoJSON via `outputFormat=application/json`
- **apiEndpunkt (verifiziert, HTTP 200):**
  - `https://api.viz.berlin.de/geoserver/mdhwfs/wfs?service=WFS&version=2.0.0&request=GetCapabilities`
  - GeoJSON-GetFeature: `…/wfs?service=WFS&version=2.0.0&request=GetFeature&typeNames=mdhwfs:baustellen_sperrungen&outputFormat=application/json`
  - **Layer (live bestätigt):** `mdhwfs:baustellen_sperrungen` (+ Nebenlayer `parkdaten`, `leuchten_berlin`, `nextbike_*`, `sharenow_berlin`)
- **update:** laufend
- **auth:** keine
- **kosten:** kostenlos
- **lizenz:** Berlin Open Data (Wiederverwendung garantiert kostenfrei); konkrete DL-DE-Stufe je Distribution prüfen
- **abdeckung:** Berliner Stadtgebiet, alle Störungstypen inkl. Events
- **zugang:** offen — direkt abrufbar, EPSG:25833 (UTM33N) → reprojizieren
- **verifiziert:** ja (GetCapabilities live 200, Layer-Name bestätigt)
- **url:** `https://daten.berlin.de/datensaetze?groups=verkehr` · `https://viz.berlin.de/`
- **prio:** P1
- **sonstiges:** Felder u.a. `subtype` (Baustelle/Störung), `severity`, `validity` (JSON `{from,to}` dd.mm.yyyy), `street`, `section`, `netrefs` (→ Detailnetz-Kanten). Restriktions-Limits ggf. nur im Freitext.

### 1.2 VIZ Berlin — Baustellen/Sperrungen (2× direkte GeoJSON-Feeds) — **P1, verifiziert**
- **quelle:** VIZ „Verkehrsredaktion" + „Landesmeldestelle (TIC3)" GeoJSON
- **betreiber:** VIZ Berlin (publiziert auch via Mobilithek/GovData)
- **datentyp:** Baustellen, Sperrungen (FeatureCollection)
- **format:** GeoJSON (statisch generierte JSON-Datei, einfacher als WFS)
- **apiEndpunkt (verifiziert, TIC3 live 200, valide GeoJSON):**
  - Verkehrsredaktion: `https://api.viz.berlin.de/daten/baustellen_sperrungen_viz.json`
  - Landesmeldestelle (TIC3): `https://api.viz.berlin.de/tic3/baustellen_sperrungen_tic.json`
- **update:** laufend (Distribution lt. GovData zuletzt 19.03.2026 gepflegt)
- **auth:** keine · **kosten:** kostenlos
- **lizenz:** Berlin Open Data; via Mobilithek publiziert
- **zugang:** offen — **einfachste Integration** (1 GET → fertiges GeoJSON, EPSG:4326)
- **verifiziert:** ja (TIC3-Endpunkt live, Struktur geprüft: `properties.subtype/severity/validity/street/section`)
- **url:** `https://www.govdata.de/suche/daten/baustellen-sperrungen-und-sonstige-storungen-von-besonderem-verkehrlichem-interesse`
- **prio:** P1

### 1.3 Detailnetz Berlin — Bauwerke (WFS) — **P2, verifiziert (neuer gdi.berlin.de-Host)**
- **quelle:** Detailnetz Berlin — Ingenieurbauwerke
- **betreiber:** Senatsverwaltung / GDI Berlin
- **datentyp:** Brücken, Tunnel (Geometrie/Identität) + Straßenabschnitte + Verbindungspunkte
- **format:** WFS 2.0 (GML)
- **apiEndpunkt (verifiziert, HTTP 200):**
  - `https://gdi.berlin.de/services/wfs/detailnetz?service=WFS&version=2.0.0&request=GetCapabilities`
  - **Layer (live bestätigt):** `detailnetz:b_bauwerke` (Brücken/Tunnel), `detailnetz:c_strassenabschnitte`, `detailnetz:a_verbindungspunkte`
- **update:** laufend (Fachanwendung)
- **auth:** keine · **kosten:** kostenlos
- **lizenz:** DL-DE/Zero-2.0 (keine Namensnennung nötig)
- **abdeckung:** Berlin, alle erfassten Brücken/Tunnel
- **zugang:** offen — nur GML-Output → WFS/GML-Parser
- **verifiziert:** ja (GetCapabilities live 200, Layer-Namen bestätigt)
- **url:** `https://daten.berlin.de/datensaetze/detailnetz-bauwerke-wfs`
- **prio:** P2
- **sonstiges:** **NUR Geometrie/Identität, KEINE Traglast/Brückenklasse.** `netrefs` der VIZ-Quelle matchen hierauf. Für Traglast → LASuV-Äquivalent / OSM / Bauwerksprüfdaten (restricted).

### 1.4 FIS-Broker / Geoportal Berlin — ALKIS Bauwerke & weitere WFS — **P2, zu-bestätigen (Migration)**
- **quelle:** Geoportal Berlin (Nachfolger FIS-Broker) — diverse OGC-Dienste (ALKIS-Bauwerke etc.)
- **betreiber:** SenSBW (Geodaten Berlin)
- **datentyp:** ALKIS-Bauwerke (Gebäude/Brücken-Geometrie), Adressen, Basiskarten
- **format:** WFS 1.0/1.1/2.0, WMS
- **apiEndpunkt:** null (Dienst-URLs migrieren von `fbinter.stadt-berlin.de` → `gdi.berlin.de`; je Datensatz in Geodatensuche auflösen)
- **auth:** keine · **kosten:** kostenlos · **lizenz:** DL-DE meist /Zero o. /BY-2.0
- **zugang:** offen — über **Geodatensuche Berlin** auflösen: `https://gdi.berlin.de/geonetwork/srv/ger/catalog.search#/home`
- **verifiziert:** zu-bestätigen (Migration läuft; konkrete Dienst-URL je Datensatz prüfen)
- **url:** `https://gdi.berlin.de/viewer/main/` · `https://www.berlin.de/sen/sbw/stadtdaten/geodaten-berlin/`
- **prio:** P2
### 1.6 Mobilithek / DATEX-II — Berlin Baustellen — **P2, verifiziert (Registrierung)**
- **quelle:** Mobilithek (BMDV) — Berlin-Publikation (DATEX II)
- **format:** DATEX II · **apiEndpunkt:** null (SOAP/Pull, institutionelle Registrierung + X.509-Zertifikat)
- **auth:** Registrierung + Zertifikat · **lizenz:** je Publikation prüfen
- **zugang:** Registrierung — `https://mobilithek.info`
- **verifiziert:** ja (Portal); konkrete Berlin-Publikation zu-bestätigen · **prio:** P2
- **sonstiges:** Berlin liefert primär über die offenen GeoJSON/WFS-Feeds (1.1/1.2) — Mobilithek meist redundant für Berlin.

---

# 2. BRANDENBURG

### 2.1 LS Brandenburg — Baustelleninformationssystem — **P2, zu-bestätigen (Karte, kein dokumentierter Feed)**
- **quelle:** Landesbetrieb Straßenwesen Brandenburg (LS) — Baustelleninformationssystem
- **betreiber:** Landesbetrieb Straßenwesen Brandenburg (LS), Hoppegarten
- **datentyp:** Baustellen mit Sperrung >24h auf A/B/L + Kreisstraßen (Metropolregion BE-BB)
- **strassentyp:** A/B/L/K
- **format:** interaktive Web-Karte (kein öffentlich dokumentierter WFS/GeoJSON/DATEX-Export)
- **apiEndpunkt:** null
- **update:** laufend (Karte) · **auth:** keine (Karte) · **kosten:** keine
- **lizenz:** unklar (Karte) · **abdeckung:** Brandenburg A/B/L/K
- **zugang:** zu-bestätigen — Feed-Anfrage an `LS-Baustellen-Infosystem@LS.Brandenburg.de`, Tel. 03342 249 2997. BB-Baustellen kommen ansonsten über **Mobilithek/DATEX-II** (RSA-21-Meldepflicht).
- **verifiziert:** zu-bestätigen (kein API auf der Seite dokumentiert)
- **url:** `https://www.ls.brandenburg.de/ls/de/bauen/baustelleninformationssystem/` · Straßennetzviewer: `https://www.ls.brandenburg.de/ls/de/service/strassennetzviewer/`
- **prio:** P2

### 2.2 GeoBasis-BB / GDI-BB — INSPIRE Verkehrsnetze (Basis-DLM) WFS — **P1, verifiziert**
- **quelle:** INSPIRE-WFS Verkehrsnetze ATKIS Basis-DLM Brandenburg (`tn_bdlm_wfs`)
- **betreiber:** Landesvermessung und Geobasisinformation Brandenburg (LGB)
- **datentyp:** Verkehrsnetz-Topologie (Straße/Schiene/Wasser/Luft), INSPIRE-TN-Schema
- **strassentyp:** Alle (Netzgeometrie)
- **format:** WFS 2.0.0, GML 3.2.1; CRS u.a. EPSG:25832/25833/3857/4326
- **apiEndpunkt (verifiziert, HTTP 200):** `https://inspire.brandenburg.de/services/tn_bdlm_wfs?service=WFS&request=GetCapabilities&version=2.0.0`
- **update:** INSPIRE-Zyklus (LS-Daten alle 3 Monate aktualisiert)
- **auth:** keine · **kosten:** kostenlos
- **lizenz:** **dl-de/by-2.0** — Attribution „© GeoBasis-DE/LGB, dl-de/by-2-0"
- **abdeckung:** Land Brandenburg
- **zugang:** offen
- **verifiziert:** ja (GetCapabilities live 200; URL aus Geobroker-Produktvorschau)
- **url:** `https://geobroker.geobasis-bb.de/` (Produkt e48146bb-284b-4ac3-a946-9c96ffe8a341)
- **prio:** P1
- **sonstiges:** Netzgeometrie, KEINE GST-Restriktionen. Für Bauwerke/Brücken → ATKIS-Bauwerke-WFS der LGB (Geobroker, `bw_bdlm_wfs` o.ä. — zu-bestätigen).

### 2.3 GeoBasis-BB — ALKIS WMS/WFS — **P2, verifiziert (WMS live)**
- **quelle:** ALKIS Brandenburg (WMS/WFS)
- **betreiber:** LGB · **datentyp:** Liegenschaftskataster (Gebäude/Bauwerks-Geometrie, Flurstücke)
- **format:** WMS (live), WFS (ALKIS vereinfacht / NAS-konform)
- **apiEndpunkt (verifiziert, WMS HTTP 200):** `https://isk.geobasis-bb.de/ows/alkis_wms?service=WMS&request=GetCapabilities`
- **auth:** keine · **kosten:** kostenlos · **lizenz:** dl-de/by-2.0 („© GeoBasis-DE/LGB")
- **zugang:** offen (Brandenburger LGB-Geodaten sind seit 2023 OpenData)
- **verifiziert:** ja (WMS live 200); WFS-Pfad je Produkt aus Geobroker
- **url:** `https://geobasis-bb.de/lgb/de/geodaten/geodienste/`
- **prio:** P2

### 2.4 Geoportal Brandenburg / Open Data BB — **P3, verifiziert (Portal)**
- **quelle:** Geoportal Brandenburg (GDI-BB) — >100 Anbieter, WMS/WFS/WCS + Metadaten
- **betreiber:** GDI-BB · **format:** Portal/CSW + diverse OGC-Dienste
- **apiEndpunkt:** null (Dienste je Thema im Portal auflösen)
- **zugang:** offen — `https://geoportal.brandenburg.de/`
- **verifiziert:** ja (Portal) · **prio:** P3
- **sonstiges:** Open-Data-Geodaten BB auch in MetaVer (`https://metaver.de/`).
---

# 3. MECKLENBURG-VORPOMMERN

### 3.1 LS M-V — Straßenbaustellen (WFS) — **P1, verifiziert**
- **quelle:** Straßenbaustellen MV (WFS) — `wfs_baustellenmv`
- **betreiber:** Landesamt für Straßenbau und Verkehr M-V (LS M-V / SBV), Rostock
- **datentyp:** verkehrseinschränkende Baustellen auf Bundes- und Landesstraßen
- **strassentyp:** A/B/L (+ wichtige K, lt. Themenkarte)
- **format:** WFS 1.0/1.1/2.0
- **apiEndpunkt (verifiziert, HTTP 200):**
  - `https://www.geodaten-mv.de/dienste/wfs_baustellenmv?service=WFS&request=GetCapabilities`
  - **Layer (live bestätigt):** `baustellen:Baustellen`
  - WMS-Variante: `https://www.geodaten-mv.de/dienste/baustellen_lsbv_wms?service=WMS&request=GetCapabilities` (live 200)
- **update:** **tagesaktuell** (Anbieterdaten)
- **auth:** keine · **kosten:** kostenlos
- **lizenz:** AccessConstraints = „Urheberrecht" (keine harte Sperre; Nutzungsbed. LS M-V prüfen)
- **abdeckung:** Mecklenburg-Vorpommern
- **zugang:** offen
- **verifiziert:** ja (GetCapabilities live 200, Layer bestätigt)
- **url:** `https://www.geoportal-mv.de/portal/Geowebdienste/Fachthemen/Verkehr` · Metadaten: `…/Details/Stra%C3%9Fenbaustellen%20MV%20(WFS)/097ce665-0ec2-41d8-abb5-bda4f59deaeb`
- **prio:** P1
- **sonstiges:** **Technisch beste MV-Direktquelle** für Baustellen. „Urheberrecht" = Lizenz für kommerziell vor Nutzung klären (LS M-V: lsmv@sbv.mv-regierung.de).

### 3.2 LS M-V — Klassifiziertes Straßennetz (WFS/WMS) — **P2, verifiziert**
- **quelle:** Klassifiziertes Straßennetz Land M-V (`verkehrsnetz_lsbv_wfs`)
- **betreiber:** LS M-V · **datentyp:** klassifiziertes Straßennetz (A/B/L) ASB-bezogen
- **format:** WFS / WMS
- **apiEndpunkt (verifiziert, WFS HTTP 200):**
  - `https://www.geodaten-mv.de/dienste/verkehrsnetz_lsbv_wfs?service=WFS&request=GetCapabilities`
  - WMS: `https://www.geodaten-mv.de/dienste/verkehrsnetz_lsbv_wms`
- **auth:** keine · **kosten:** kostenlos · **lizenz:** „Urheberrecht" (s.o.)
- **zugang:** offen · **verifiziert:** ja (WFS live 200)
- **url:** `…/Details/Klassifiziertes%20Stra%C3%9Fennetz%20Land%20M-V%20(WFS)/22679943-4cb7-4dc2-bd08-8900190347e6`
- **prio:** P2 · **sonstiges:** auch Verkehrsmengen-WMS `verkehrsmengen_lsbv_wms`.

### 3.3 GeoPortal.MV / LAiV — INSPIRE Verkehrsnetze + Basis-DLM (WFS) — **P2, verifiziert (Metadaten)**
- **quelle:** INSPIRE-WFS MV Verkehrsnetze ATKIS Basis-DLM + WFS Basis-DLM NAS-konform
- **betreiber:** Landesamt für innere Verwaltung M-V (LAiV M-V), geodatenservice@laiv-mv.de
- **datentyp:** Verkehrsnetz-Topologie (INSPIRE TN), Basis-DLM (~70 Objektarten inkl. Straßen, Bahn, Wasser)
- **format:** WFS 2.0 (GML)
- **apiEndpunkt:** null (Metadaten-IDs: `495d1f90-4b52-438f-9a0a-7f8d9de548f3` TN; `7420e63e-…` Basis-DLM NAS — exakte Dienst-URL über GeoPortal.MV CapabilitiesViewer auflösen)
- **auth:** keine · **kosten:** kostenlos (Geobasis-Open-Data MV)
- **lizenz:** dl-de/by-2.0 (Geobasis MV)
- **zugang:** offen — `https://www.geoportal-mv.de/portal/Geowebdienste/CapabilitiesViewer`
- **verifiziert:** zu-bestätigen (Metadaten bestätigt, raw URL noch aufzulösen)
- **url:** `https://www.geoportal-mv.de/portal/Geodatenviewer/Datenuebersicht`
- **prio:** P2

### 3.4 Open Data MV (MetaVer) / Verkehrsinformationen LS M-V — **P3, verifiziert (Portal)**
- **quelle:** „Verkehrsinformationen LS M-V" (Themenkarte) + Open-Data MV via MetaVer
- **format:** Portal/Themenkarte + OGC-Dienste · **apiEndpunkt:** null
- **zugang:** offen — `https://metaver.de/` · Themenkarte `…/Themenkarten/Details?id=4`
- **verifiziert:** ja (Portal) · **prio:** P3
---

# 4. SACHSEN

### 4.1 LASuV / Baustelleninformationssystem Sachsen — WMS — **P1, verifiziert (CC-BY-4.0)**
- **quelle:** Baustelleninformationen Sachsen (SPERRINFOSYS) — `wms_list_baustellen`
- **betreiber:** Landesamt für Geobasisinformation Sachsen (GeoSN) / LASuV; Quelle „Baustelleninformationssystem Sachsen"
- **datentyp:** tagesaktuelle Baustellen-Maßnahmen, zukünftige Sperrungen + Umleitungen
- **strassentyp:** A/B/L/K (inkl. Autobahndaten seit Erweiterung)
- **format:** WMS 1.3.0 (GetMap/GetFeatureInfo)
- **apiEndpunkt (verifiziert, HTTP 200):**
  - `https://geodienste.sachsen.de/wms_list_baustellen/guest?REQUEST=GetCapabilities&SERVICE=WMS&VERSION=1.3.0`
  - **Layer (live bestätigt):** `sperrungen`, `umleitungen`
  - WFS-Variante `wfs_list_baustellen/guest` existiert, antwortet aber **HTTP 403** (eingeschränkt) → null
- **update:** **täglich** · **auth:** keine (WMS) · **kosten:** kostenlos
- **lizenz:** **CC BY 4.0** — Namensnennung „Baustelleninformationssystem Sachsen" (zusätzlich „keine Zugriffsbeschränkungen")
- **abdeckung:** Freistaat Sachsen
- **zugang:** offen (WMS); auch via MDM/Mobilithek
- **verifiziert:** ja (GetCapabilities live 200, Layer bestätigt)
- **url:** `https://www.baustellen.sachsen.de/` · GDI-DE: `…/records/1df0701f-be33-4d96-ab02-6b884fb071a8`
- **prio:** P1
- **sonstiges:** WMS liefert Darstellung; für strukturierte Attribute GetFeatureInfo nötig. Offener WFS = 403 → für Vektordaten ggf. MDM/Mobilithek-Pull.

### 4.2 LASuV — GST-Negativkarte (gesperrte Brücken) — **P1, verifiziert (offen, ABER PDF)**
- **quelle:** Großraum- und Schwertransporte — gesperrte Brücken (GST-Negativkarten Sachsen)
- **betreiber:** Landesamt für Straßenbau und Verkehr (LASuV), Dresden
- **datentyp:** **Brücken mit begrenzter Tragfähigkeit / für GST gesperrt** (das gesuchte GST-Kerndatum!), zzgl. Achslastkollektive (Befahrbarkeitsbewertung)
- **strassentyp:** B/L (+ A im Verfahren) — Bezug bis 68 t Gesamt / 12 t Achslast
- **format:** **PDF je Landkreis** (8 LK, ~19–44 MB, Stand 16.10.2025) — KEIN WFS/GeoJSON
- **apiEndpunkt:** null (Direkt-PDF-Downloads auf der Seite)
- **update:** periodisch (Stand 10/2025; seit 01.09.2025 zentrale Bearbeitung Dresden)
- **auth:** keine · **kosten:** keine
- **lizenz:** keine explizite Open-Data-Auszeichnung (Behörden-Referenzdokumente, frei abrufbar)
- **abdeckung:** Landkreise Bautzen, Erzgebirgskreis, Görlitz, Meißen, Mittelsachsen, Sächs. Schweiz-Osterzgebirge, Vogtlandkreis, Zwickau
- **zugang:** offen (frei downloadbar) — aber **nur PDF** → Geo-Extraktion (PDF→Georeferenz) nötig
- **verifiziert:** ja (Downloads bestätigt)
- **url:** `https://www.lasuv.sachsen.de/gst-negativkarten.html` · Hintergrund: `https://www.medienservice.sachsen.de/medien/news/1090980`
- **prio:** P1
- **sonstiges:** **Inhaltlich die wertvollste GST-Brücken-Quelle der Ost-Länder**, aber Format (PDF) macht maschinelle Nutzung aufwändig. Maschinenlesbare Variante bei LASuV erfragen (presse@lasuv.sachsen.de).

### 4.3 GeoSN — Offene Geodaten Sachsen: INSPIRE Verkehrsnetze WFS — **P2, verifiziert**
- **quelle:** GeoSN INSPIRE/ATKIS Basis-DLM — Verkehrsnetze (TN)
- **betreiber:** Landesamt für Geobasisinformation Sachsen (GeoSN)
- **datentyp:** Verkehrsnetz-Topologie (INSPIRE TN, ATKIS Basis-DLM)
- **format:** WFS 2.0
- **apiEndpunkt (verifiziert, HTTP 200):**
  - `https://geodienste.sachsen.de/aaa/public_inspire/atkis-bdlm/tn/dls/wfs?SERVICE=WFS&REQUEST=GetCapabilities`
  - ALKIS vereinfacht (live 200): `https://geodienste.sachsen.de/aaa/public_alkis/vereinf/wfs?request=GetCapabilities&service=WFS`
- **update:** GeoSN-Zyklus · **auth:** keine · **kosten:** kostenfrei
- **lizenz:** **dl-de/by-2.0** — Quelle „Geodaten Sachsen" („keine Zugriffsbeschränkungen")
- **abdeckung:** Freistaat Sachsen
- **zugang:** offen
- **verifiziert:** ja (GetCapabilities live 200; Lizenz aus Capabilities bestätigt)
- **url:** `https://www.geodaten.sachsen.de/` (Offene Geodaten / GeoSN)
- **prio:** P2 · **sonstiges:** Netzgeometrie, KEINE Restriktionen. WebAtlasSN-WMS (`wms_webatlas_color`) als Basemap = 403 (registrierungspflichtig).

### 4.4 GDI-SBV (Straßenbauverwaltung Sachsen) — Fach-WFS — **P3, verifiziert (RESTRICTED)**
- **quelle:** GDI-SBV — Geodaten der Sächs. Straßenbauverwaltung (FIS/Fachverfahren, inkl. Bauwerke/Straßenbäume etc.)
- **betreiber:** LISt GmbH (i.A. LASuV/SMIL), Hainichen
- **datentyp:** Straßenbauverwaltungs-Fachdaten (potenziell inkl. Bauwerke/Restriktionen)
- **format:** WFS 2.0/1.1.0
- **apiEndpunkt:** `https://gdi-sbv.list.smwa.sachsen.de/fisbaum/sbv/wfs?` (Beispiel-Dienst)
- **auth:** **nur im Sächs./Komm. Verwaltungsnetz (SVN/KDN) erreichbar**
- **kosten:** – · **lizenz:** „Nur für Dienstgebrauch der Sächs. Straßenbauverwaltung, keine private/kommerzielle Nutzung" (ohne SMIL-/LASuV-Freigabe)
- **zugang:** **eingeschränkt** — nicht aus öffentlichem Internet; Freigabe via LISt GmbH (geoinformationen@list.sachsen.de)
- **verifiziert:** ja (Existenz/Restriktion bestätigt) · **url:** `https://www.list.smwa.sachsen.de/771.htm`
- **prio:** P3
- **sonstiges:** **Wäre die reichste Sachsen-Fachquelle (inkl. Bauwerke), aber netz-/lizenzgesperrt.** Nur über behördliche Kooperation/Freigabe nutzbar.
---

# 5. SACHSEN-ANHALT
> Vertiefung/Verifikation der Erst-Recherche (`data/blockade-quellen/sachsen-anhalt.json`).

### 5.1 LSBB — Sperrinfo (Baustellen/Sperrungen/Umleitungen) WFS — **P1 technisch / P3 kommerziell, verifiziert**
- **quelle:** LSBB Sperrinfo (SPERRINFOSYS ST) — `service.ifak.eu/sperrinfo`
- **betreiber:** Landesstraßenbaubehörde Sachsen-Anhalt (LSBB); techn. Betrieb ifak/movi.de
- **datentyp:** Baustellen, Sperrungen, Umleitungen
- **strassentyp:** B/L/K (+ Kommunen)
- **format:** WFS 1.1.0/2.0, GeoJSON (`outputFormat=application/json; subtype=geojson`), EPSG:4326 nativ
- **apiEndpunkt (verifiziert, HTTP 200):**
  - `https://service.ifak.eu/sperrinfo/wfs?SERVICE=WFS&VERSION=1.1.0&REQUEST=GetCapabilities`
  - WMS: `https://service.ifak.eu/sperrinfo/wms`
  - **Layer (live bestätigt):** `roadworks`, `roadwork_symbols`, `diversions`
- **update:** regelmäßig (Behörden/Kommunen pflegen)
- **auth:** keine · **kosten:** 0
- **lizenz/zugang:** **AccessConstraints (live bestätigt) = „This service is for non-commercial use only."** → **kommerziell NUR mit schriftlicher Freigabe MLV/LSBB.**
- **abdeckung:** klass. Netz Sachsen-Anhalt (B/L/K)
- **verifiziert:** ja (GetCapabilities live 200, Layer + non-commercial-Constraint bestätigt)
- **url:** `https://lsbb.sachsen-anhalt.de/service/baustellen-und-umleitungen` · App: `http://www.movi.de/sperrinfo/`
- **prio:** P1 technisch / P3 kommerziell
- **sonstiges:** **Technisch beste ST-Direktquelle** (sauberes GeoJSON, EPSG:4326). Freigabe-Mail MLV/LSBB = schnellster kommerzieller Unlock. Ohne Freigabe → Baustellen via Mobilithek/DATEX-II (RSA-21-Meldepflicht).

### 5.2 LVermGeo ST — INSPIRE Verkehrsnetze ATKIS Basis-DLM WFS — **P2, verifiziert**
- **quelle:** INSPIRE-WFS ST Verkehrsnetze ATKIS Basis-DLM (`ows_INSPIRE_LVermGeo_ATKIS_TN_WFS`)
- **betreiber:** Landesamt für Vermessung und Geoinformation Sachsen-Anhalt (LVermGeo)
- **datentyp:** Verkehrsnetz-Topologie (INSPIRE TN)
- **format:** WFS 2.0.0 (AdV-WFS-Profil 2.0)
- **apiEndpunkt (verifiziert, HTTP 200):** `https://geodatenportal.sachsen-anhalt.de/ows_INSPIRE_LVermGeo_ATKIS_TN_WFS?service=wfs&version=2.0.0&request=getcapabilities`
- **update:** regelmäßig · **auth:** keine
- **kosten:** Open-Data-Dienste kostenfrei (Fees-Feld nennt allg. Kostenverordnung — der OpenData-TN-Dienst ist frei)
- **lizenz:** Nutzungsbedingungen LVermGeo (`https://www.lvermgeo.sachsen-anhalt.de/de/nutzungsbedingungen.html`); OpenData-Variante dl-de/by
- **abdeckung:** Sachsen-Anhalt
- **zugang:** offen (OpenData-Rubrik)
- **verifiziert:** ja (GetCapabilities live 200)
- **url:** `https://www.lvermgeo.sachsen-anhalt.de/de/gdp-open-data.html`
- **prio:** P2 · **sonstiges:** Netzgeometrie; Bauwerke (ATKIS, seit 05/2024 LoD2/CityGML) separat über GDP. KEINE Traglast.

### 5.3 LVermGeo ST — Geodatenportal / Open Data (Bauwerke, Basis-DLM, ATOM) — **P2, verifiziert (Portal)**
- **quelle:** Geodatenportal Sachsen-Anhalt (LVermGeo) — Open-Data-Rubrik
- **datentyp:** ATKIS-Bauwerke (Brücken-Geometrie), Basis-DLM, weitere Geobasis
- **format:** WFS 2.0 / ATOM-Download / WMS · **apiEndpunkt:** null (je Dienst in OpenData-Rubrik wählen; viele Nicht-OpenData-Dienste sind 403)
- **auth:** keine (OpenData) · **kosten:** kostenfrei (OpenData) · **lizenz:** dl-de/by-2.0 („© GeoBasis-DE/LVermGeo LSA")
- **zugang:** offen (OpenData-Rubrik) — `https://www.lvermgeo.sachsen-anhalt.de/de/gdp-open-data.html`
- **verifiziert:** zu-bestätigen (Portal ja; exakte Bauwerks-WFS-URL auflösen) · **prio:** P2
- **sonstiges:** Bauwerks-WFS = nur Geometrie/Identität, KEINE Traglast/Brückenklasse.

### 5.4 Mobilithek / DATEX-II + Open Data ST (MetaVer) — **P1 Feed / P3 Portal, verifiziert**
- **quelle:** Mobilithek (DATEX-II ST-Baustellen, RSA-21-Meldepflicht seit 01.01.2026) + Open-Data ST via MetaVer
- **format:** DATEX II (SOAP/Pull) bzw. Portal · **apiEndpunkt:** null (Registrierung + Zertifikat)
- **auth:** Registrierung + X.509 · **lizenz:** je Publikation prüfen
- **zugang:** Registrierung — `https://mobilithek.info` · `https://metaver.de/`
- **verifiziert:** ja (Portale) · **prio:** P1 (Feed-Backbone) / P3 (Portal)
---

# 6. THÜRINGEN

### 6.1 TLBV — Baustelleninformationssystem — **P2, zu-bestätigen (CAPTCHA, kein offener Feed)**
- **quelle:** Baustelleninformationssystem Thüringen (TLBV)
- **betreiber:** Thüringer Landesamt für Bau und Verkehr (TLBV), Erfurt + Straßenverkehrsbehörden
- **datentyp:** aktuelle Baustellen auf Thüringer Straßen (**ohne Bundesautobahnen** — die via Autobahn-GmbH)
- **strassentyp:** B/L/K (A = Autobahn-GmbH)
- **format:** Web-App (GWT) · **apiEndpunkt:** null
- **auth:** keine (App), **aber Link11/CAPTCHA-Schutz** → kein maschineller Zugriff, curl-Test = blockiert
- **kosten:** keine · **lizenz:** unklar
- **zugang:** zu-bestätigen — Feed-Anfrage TLBV; TH-Baustellen ansonsten über **Mobilithek/DATEX-II** (RSA 21)
- **verifiziert:** zu-bestätigen (App existiert, CAPTCHA blockiert API)
- **url:** `https://baustelleninfo.thueringen.de/` · `https://bau-verkehr.thueringen.de/verkehr/strassenverkehr/baustellen`
- **prio:** P2

### 6.2 TLBV / Geoproxy — Klassifiziertes Straßennetz (WFS) — **P1, verifiziert**
- **quelle:** Klassifiziertes Straßennetz Thüringen (`STRNETZ_wfs`)
- **betreiber:** TLBV (Daten); GDI-Th / Thür. Ministerium für Digitales und Infrastruktur (Dienst)
- **datentyp:** klassifiziertes Straßennetz nach ASB (A/B/L), Netzknoten, Nullpunkte, Euronetz
- **strassentyp:** A/B/L (ASB-Netz)
- **format:** WFS 2.0
- **apiEndpunkt (verifiziert, HTTP 200):**
  - `https://www.geoproxy.geoportal-th.de/geoproxy/services/STRNETZ_wfs?service=WFS&request=GetCapabilities`
  - **Layer (live bestätigt):** `tlbv:Klassifiz_StrNetz`, `tlbv:Euronetz_StrNetz`, `tlbv:Netzknoten_StrNetz`, `tlbv:Nullpunkte_StrNetz`
- **update:** n/a (lt. Metadaten unspezifiziert)
- **auth:** keine · **kosten:** kostenlos
- **lizenz:** **dl-de/by-2.0** — Quelle „© GDI-Th"
- **abdeckung:** Freistaat Thüringen
- **zugang:** offen
- **verifiziert:** ja (GetCapabilities live 200, Layer bestätigt)
- **url:** `https://geomis.geoportal-th.de/geonetwork/srv/api/records/468059de-07f6-4510-8920-aedb9feb319e`
- **prio:** P1
- **sonstiges:** ASB-Netz als Anker für Stationierung/Matching (analog BASt-BISStra). KEINE GST-Restriktionen.

### 6.3 Geoproxy Thüringen — INSPIRE Verkehrsnetze (Straße) WFS — **P2, verifiziert**
- **quelle:** INSPIRE TH Verkehrsnetze ATKIS Basis-DLM — Straße (`INSPIREtn-ro_wfs`)
- **betreiber:** Thüringer Landesamt für Bodenmanagement und Geoinformation (TLBG)
- **datentyp:** INSPIRE-TN-RO Straßennetz (Road, RoadLink, ERoad, FunctionalRoadClass, NumberOfLanes …)
- **format:** WFS 2.0 (INSPIRE tn-ro/4.0 GML)
- **apiEndpunkt (verifiziert, HTTP 200):**
  - `https://www.geoproxy.geoportal-th.de/geoproxy/services/INSPIREtn-ro_wfs?service=WFS&request=GetCapabilities`
  - **Layer (live bestätigt):** `tn-ro:Road`, `tn-ro:RoadLink`, `tn-ro:ERoad`, `tn-ro:FunctionalRoadClass`, `tn-ro:NumberOfLanes`, `tn-ro:FormOfWay`, `tn-ro:RoadArea`, `tn-ro:RoadServiceArea` (+ weitere TN-WFS für Schiene/Wasser/Luft/Seilbahn)
- **update:** halbjährlich · **auth:** keine · **kosten:** kostenlos
- **lizenz:** **dl-de/by-2.0**
- **abdeckung:** Thüringen
- **zugang:** offen
- **verifiziert:** ja (GetCapabilities live 200, INSPIRE-Layer bestätigt)
- **url:** `https://geomis.geoportal-th.de/geonetwork/inspire/api/records/e98cb550-e246-4b9b-8a29-49029a51f5cc`
- **prio:** P2

### 6.4 Geoproxy Thüringen / Open Data — WMS Geobasis (ALKIS/ATKIS/DOP/DGM) — **P2/P3, verifiziert (Portal)**
- **quelle:** Geoproxy Thüringen — freie WMS/WFS opendata Geobasisdaten (TLBG)
- **format:** WMS/WFS (z.B. DGM-WMS `…/services/DGM`) · **apiEndpunkt:** null (je Thema im Geoproxy)
- **auth:** keine (opendata-Dienste) · **kosten:** kostenfrei · **lizenz:** dl-de/by-2.0
- **zugang:** offen — `https://www.geoportal-th.de/de-de/Geoproxy` · Viewer `https://geoportal.thueringen.de/geoproxy`
- **verifiziert:** ja (Geoproxy-Dienstgruppe) · **prio:** P2/P3
- **sonstiges:** ATKIS-Bauwerke ggf. hier; nur Geometrie, KEINE Traglast.
---

## Querschnitt: Lücken & wichtigste Erkenntnisse

**Was verifiziert & sofort offen nutzbar ist (Top-Treffer):**
- **Berlin:** VIZ-WFS + 2× direkte GeoJSON-Feeds (live, einfachste Integration), Detailnetz-Bauwerke-WFS @ neuem `gdi.berlin.de`. Bestes Bundesland datenseitig.
- **Sachsen:** Baustellen-WMS (CC-BY-4.0, täglich), **GST-Negativkarte mit gesperrten Brücken** (inhaltlich das wertvollste GST-Datum der Ost-Länder — aber nur PDF), offener INSPIRE-TN-WFS (dl-de/by-2.0).
- **MV:** Straßenbaustellen-WFS tagesaktuell + Verkehrsnetz-WFS (beide live, „Urheberrecht"-Lizenz prüfen).
- **Brandenburg / Thüringen:** offene Geobasis-/Verkehrsnetz-WFS (dl-de/by-2.0, live), aber Baustellen-Feeds nicht offen dokumentiert → Mobilithek-Backbone.
- **Sachsen-Anhalt:** LSBB-Sperrinfo-WFS = technisch beste Baustellenquelle (sauberes GeoJSON), aber **non-commercial** — Freigabe MLV/LSBB nötig.

**Lücken (das fehlt / ist nicht offen):**
1. **GST-Brücken-Traglast / Negativkarten** existieren als offene maschinenlesbare Daten **nur ansatzweise**: Sachsen = PDF (nicht WFS), Brandenburg/MV/ST/TH = **keine** offene GST-Brücken-/Negativkarte gefunden (nur Verfahrens-PDFs bzw. VEMAGS). → Maschinenlesbare Brücken-Traglast bleibt der härteste Engpass; Quelle bundesweit = WSV-GDWS-GST-Brücken-WMS/WFS (siehe `quellen-bund.md`) + Behörden-Freigabe.
2. **Baustellen-Direktfeeds** in **Brandenburg** und **Thüringen** nicht öffentlich dokumentiert (BB = nur Karte; TH = CAPTCHA-geschützt) → für diese beiden Länder ist **Mobilithek/DATEX-II** der primäre Live-Weg (RSA-21-Meldepflicht seit 01.01.2026).
3. **Bauwerks-WFS aller Länder** liefern nur **Geometrie/Identität**, KEINE Traglast/Brückenklasse/lichte Höhe → Restriktionen müssen aus OSM + GST-Negativkarten + (restricted) Fachverfahren kommen.
4. **Restricted Fachquellen:** Sachsen GDI-SBV (reichste Sachsen-Fachdaten inkl. Bauwerke) nur im Verwaltungsnetz/Dienstgebrauch; ST LSBB-Sperrinfo non-commercial. Beide nur via behördliche Freigabe kommerziell nutzbar.
5. **FIS-Broker-Migration Berlin** (seit 01.12.2025): alte `fbinter.stadt-berlin.de`-Dienst-URLs neu unter `gdi.berlin.de` auflösen.

**Empfehlung Integrationsreihenfolge je Land:**
Baustellen-Layer → (Berlin GeoJSON, MV WFS, Sachsen WMS, ST LSBB-WFS) direkt; Brandenburg+Thüringen via Mobilithek.
Netzgeometrie → INSPIRE-TN-/Klassif.-Straßennetz-WFS je Land (alle offen, dl-de/by-2.0).
GST-Restriktionen → OSM (alle Länder) + Sachsen-GST-PDFs + WSV-Bund + Behörden-Freigaben.
