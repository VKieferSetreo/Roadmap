# Research-Deepdive: Brücken / Tunnel / Gewicht-GST — neue offene Quellen

**Stand:** 2026-06-22 · **Methodik:** Agent-Swarm-Workflow (44 Agenten, 2,8 M Tokens) — 10 multi-modale Discovery-Dimensionen → Dedup gegen Bestand + NRW-Ausschluss → Pro-Kandidat-Verifikation per echtem Fetch → Synthese. NRW ausgeklammert (Max). GDI/WFS-Dimension per Einzel-Agent nachgeholt (Swarm-529).

Brain? — Reine Research-Synthese-Aufgabe; die 33 Kandidaten sind bereits verifiziert mitgeliefert, kein Brain-Lookup nötig.
Save? — Erst nach Report-Abnahme durch Max (Connector-Backlog → Kanban/Brain).
Web? — Kein Web-Bedarf; alle Fundstellen sind bereits live-verifiziert, ich synthetisiere nur.

# Open-Data-Research GST-Restriktionen — Quellen-Bewertung (15 Bundesländer ohne NRW)

## 1. Neue nutzbare Quellen (verdict = NEU_NUTZBAR)

Vier Treffer, gruppiert nach Datentyp. Priorisiert nach Coverage-Gewinn × geringem Aufwand (Quick Wins zuerst).

### Brücke

**[QW-1] BASt Brückenstatistik Deutschland — ArcGIS FeatureServer (bundesweit, alle 15 Fokus-Länder)**
- Bundesland: bundesweit (Brücken der Bundesfernstraßen: BAB + Bundesstraßen)
- URL: `https://services2.arcgis.com/jUpNdisbWqRpMo35/arcgis/rest/services/Br%C3%BCckenstatistik_Deutschland/FeatureServer/0`
- Format: ArcGIS REST FeatureServer, nativ `f=geojson` (FeatureCollection, WGS84-lon/lat) und `f=json` (EPSG:3857); CQL-artige `where`-Queries, `groupBy`, `returnCountOnly`
- Zugang: offen, CC BY 4.0 / Datenlizenz DE Namensnennung 2.0, kein Token, kein Vertrag (Item `da031936bbaa4aad8302b3bcbf9494b5`, access=public)
- Coverage-Gewinn: **hoch**
- Aufwand: **M**

Dies ist die mit Abstand stärkste Neuquelle. Real verifiziert: **52.553 Features**, davon `sperrung_sv='ja'` = **3.294 Teilbauwerke** (Schwerverkehrs-Sperrung als hartes Ja/Nein-Flag = echte, evaluierbare GST-Restriktion). Die `groupBy bl`-Verteilung der Sperrungen liegt exakt auf den schwachen Fokus-Ländern:

> BY 663, NW 358, NI 315, HE 309, SN 290, BW 288, BB 255, ST 205, RP 144, TH 141, MV 113, SH 85, BE 27, HH 25, SL 18, HB 10.

Felder: `sperrung_sv` (ja/nein), `trag_l_idx` (Traglastindex I–V), `zn` (Zustandsnote), `laenge`, `breite`, `bauwerksname`, `bl`, `ort`, `kreis`, X/Y. **Caveats für den Connector** (load-bearing): `zn` kommt skaliert ×10 (`23` = Zustandsnote 2.3); `breite` (1275/983) ist NICHT plausible Meter trotz Alias „(m)" → vermutlich cm/skaliert, muss normalisiert werden. **Kein** Tonnage-Limit (t), **keine** Brückenklasse (BK), **keine** Durchfahrtshöhe je Bauwerk — die Restriktion ist das binäre `sperrung_sv`-Flag plus die Index-Signale `trag_l_idx`/`zn`. Ergänzt 0150 (Autobahn) um die Bundesstraßen-Brücken.

*Hinweis: Die beiden BASt-FeatureServer-Einträge in der Kandidatenliste (Coverage „mittel" bzw. „hoch") sind dieselbe Quelle, zweifach unabhängig verifiziert. Als ein Connector behandeln.*

### Gewicht/GST (Verkehrszeichen-Kataster mit Maßwerten)

**[QW-2] Rostock Verkehrszeichen-Kataster — opendata-hro (Mecklenburg-Vorpommern)**
- Bundesland: Mecklenburg-Vorpommern (Stadtgebiet Rostock)
- URL Dataset: `https://www.opendata-hro.de/dataset/verkehrszeichen` · GeoJSON: `https://geo.sv.rostock.de/download/opendata/verkehrszeichen/verkehrszeichen.json` · CSV: `https://geo.sv.rostock.de/download/opendata/verkehrszeichen/verkehrszeichen.csv`
- Format: WFS 2.0.0 + GeoJSON/CSV-Direktdownload (CSV 5,94 MB, 18.219 Datensätze). **Wichtig:** WFS-`outputFormat=application/json` gibt HTTP 400 → Pull via GeoJSON-/CSV-Direktdownload, nicht WFS-JSON.
- Zugang: offen, CC0 1.0, keine Registrierung
- Coverage-Gewinn: **niedrig–mittel**
- Aufwand: **S**

Echte, inline kodierte Restriktionswerte (kein location-only): StVO 265 Durchfahrtshöhe (19 mit Wert: 265-4 / 265-3,9m / 265-2,1 …), 262 Gewicht (26 mit Wert: 262-16t/10t/7,5t/12t/18 t), 263 Achslast (263-5t), 266 Länge (266-8m). 63/63 mit WGS84-Koordinaten, punktgenau, kein Geocoding nötig. **Parsing-Caveat (load-bearing):** Wert steckt im Feld `stvo_nummer` als Suffix `<vz>-<wert>(t|m)`, Kodierung inkonsistent — `262-16t` (kein Space) vs `262-18 t` (Space) vs `262-3,0` (ohne Einheit, Komma-Dezimal) vs `265-3,9m`. Parser muss Komma→Punkt, optionales Space+Einheit strippen, Einheit aus StVO-Basiscode ableiten; ~30 wertlose bare-Schilder (265/266 ohne Wert) verwerfen. Muster identisch zu Bestand Hamburg 0134 und Leipzig 0221 → Code wiederverwendbar.

**Bewertungs-Korrektur:** Der dritte Kandidaten-Eintrag „Verkehrszeichen in Heidelberg" (CKAN datenplattform.heidelberg.de) ist trotz Titel-Behauptung „durchfahrtshoehe" als **TOT_LEER** verifiziert — die Spalte „Art" trägt nur Park-/Halt-Kategorien, keine StVO-Nummern, keinen Höhen-/Tonnage-Wert. **Nicht** als Neuquelle führen.

### Tunnel / Durchfahrtshöhe (landesweit)

Keine neue nutzbare Quelle. Alle Tunnel- und Durchfahrtshöhen-Kandidaten sind Sackgassen (siehe §2).

---

## 2. Bestätigte Sackgassen (nicht erneut verfolgen)

**LOCATION_ONLY** (Standort/Identität ohne Restriktionswert — wertlos für GST):
- NWSIB Niedersachsen Bauwerke — WMS-only, WFS hart deaktiviert; GetFeatureInfo liefert nur Lage/Name/Nummer + 70 Kartografie-Felder, **null** Restriktionsattribute. `https://www.nwsib-niedersachsen.de/NWSIBGeoserver/wms` (Hypothese „lichte Höhe via GetFeatureInfo" durch Direktaufruf widerlegt).
- Rostock GST-Routen + gesperrte Ingenieurbauwerke (`grossraum_schwertransportrouten/wfs`) — Bauwerks-Layer = Dublette zu Bestand 0223; Wege-Layer neu aber restriktionsfrei.
- WInD WSV (`via.bund.de/wsv/wind`) — Restriktionsfelder im Datenmodell benannt, aber **leer** (Traglastindex=None).
- BASt Interaktive Brückenkarte/Viewer (`via.bund.de/bast/br/map`) — Traglastindex ist laut BMV explizit **keine** Tonnage-Grenze und **keine** BK-Abbildung; Viewer zudem in Wartung. (Der dahinterliegende ArcGIS-FeatureServer ist die nutzbare Quelle, siehe QW-1.)
- BISStra/ASB INSPIRE-WFS (`inspire.bast.de/bisstra`) — nur Netzgeometrie, kein Bauwerks-FeatureType.
- INSPIRE Verkehrsnetze ATKIS Basis-DLM (alle Länder, z. B. `geodaten-mv.de/dienste/inspire_tn_atkis_bdlm_download`) — EU-harmonisiertes TN-Modell ohne Last-/Höhen-/BK-Feld; gilt strukturell für jedes Fokus-Land.
- Sachsen-Anhalt LVermGeo ATKIS-Bauwerke — Brücken nur als LoD2-Geometrie, keine Ingenieurattribute.
- BMV ADR-Gefahrgut-Tunnelliste (`bmv.de/.../strassentunneln-gemaess-adr.html`) — Kategorie B–E beschränkt nur den **Gefahrgut-Inhalt**, NICHT Höhe/Breite/Gewicht; für Normallast-GST irrelevant. Fachliche Annahme „Kat. E = GST-relevant" widerlegt.
- PEGELONLINE DFH — schifffahrtsbezogene Live-Durchfahrtshöhe an 2 Donaubrücken (Passau), falsche Mess-Achse.
- Niedersachsen GST-Karte (`strassenbau.niedersachsen.de`) — nur Zuständigkeits-PDF (44,5 MB) + JS-Viewer ohne Daten-Endpunkt.

**LOGIN_VERTRAG** (kein offener Datenzugang):
- VEMAGS (`vemags.de`) — zentrales Genehmigungssystem Bund + 16 Länder, harte Login-Wall; Xvemags-Schnittstelle nur per Kooperationsvereinbarung, ist Write-Kanal, kein lesbarer Restriktionsdatensatz. **Strukturelle Ursache**, warum die Länder-Brückensperrungen nicht offen publiziert sind.
- BB/SL/HB/RP GST — nur Prozess-PDFs + VEMAGS; keine offenen Restriktionsnetze (`ls.brandenburg.de`, `lbm.rlp.de`, `geo.bremen.de`).
- Sachsen LASuV GST-Negativkarten 48t/48–60t (`lasuv.sachsen.de/gst-negativkarten.html`) — **echte** Restriktionen (mit Achslastkollektiven!), aber nur als con-terra-GeoViewer per server-side `stateId`; kein dokumentierter Download/WFS, Backend-guest-WMS exponiert die GST-Layer nicht. (Inhaltlich wertvoll, technisch verschlossen — Kandidat für Behördenanfrage.)

**TOT_LEER** (existiert, aber 0 verwertbare Restriktion):
- BASt Brückenstatistik-CSV (`bast.de/.../Brueckenstatistik-csv.csv`) — 52.625 Per-Bauwerk-Zeilen, aber **ohne Koordinaten** und ohne Last/BK/Höhe (`trag_l_idx` ist Längen-/Tragwerks-Code, keine Tonne); schlechter als location-only. Der ArcGIS-FeatureServer (QW-1) ist die verortete Variante derselben Daten.
- ELWIS Brückendurchfahrtshöhen (`elwis.de`) — PDF-only, Stand 2017, Höhe bezogen auf HSW = Schiffspassage, falsche Achse.
- Heidelberg VZ-Kataster (`ckan.datenplattform.heidelberg.de`) — nur Park-/Halt-Schilder, kein Maßwert.
- Mobilithek-Katalog-Scan / GovData — kein neues landesweites Brücken-Last-/Höhen-/BK-Set für BW/RP/SL/ST/SH/TH/BB/HB.
- OSM Maxheight Map (`maxheight.bplaced.net`) — nur GPX-Export der sichtbaren Punkte, kein Bulk/API; Hobby-Hosting.
- BGL/BSK Branchenverbände — nur Web-Tools + PDFs hinter Mitglieder-Login.
- EU Abnormal-Transport-Guidelines — reiner Policy-Leitfaden, kein Datensatz.

**DUBLETTE** (deckungsgleich mit Bestand):
- WSV-Brücken GST WMS/WFS (`via.bund.de/wsv/gst`) — identisches WADABA-Backend wie Bestand 0303, location-only.
- Rostock gesperrte Ingenieurbauwerke — = Bestand 0223.
- Hessen Mobil lastbeschränkte Brücken PDF (Stand 27.02.2026, 136 Brücken) — = Bestand 0126; **aber:** das ist die aktuellere Datei (alte 0126-URL = 26.11.2025/137 Brücken). **Empfehlung: 0126-Quell-URL auf `2026-02/...stand_2026-02-27_0.pdf` aktualisieren.**
- „GST-Schwerlaststreckenkarte BW" PDF (`vm.baden-wuerttemberg.de/.../GrossraumSchwerlaststreckenkarteBW.pdf`) — Dateiname trügt: Inhalt ist **Hessen** (Ortsliste/L-3xxx/B-Nummern), identisch zu 0126. **Kein** BW-Datensatz.
- Leipzig VZ-Kataster (`geodienste.leipzig.de`) — = Bestand 0221.

---

## 3. Abdeckungs-Wirkung (rote Bundesland × Datentyp-Zellen)

Die heute roten Zellen in den 10 schwächsten Ländern, die durch die Neuquellen real steigen:

| Land | Brücke | Tunnel | GST/Gewicht | Durchfahrtshöhe |
|---|---|---|---|---|
| **BW** | ↑ QW-1 (288 SV-Sperrungen) | — | — | — |
| **BB** | ↑ QW-1 (255) | — | — | — |
| **HB** | ↑ QW-1 (10) | — | — | — |
| **MV** | ↑ QW-1 (113) | — | ↑ QW-2 (Rostock VZ: Gewicht/Achslast/Länge) | ↑ QW-2 (Rostock VZ: 19× StVO 265) |
| **NI** | ↑ QW-1 (315) | — | — | — |
| **RP** | ↑ QW-1 (144) | — | — | — |
| **SL** | ↑ QW-1 (18) | — | — | — |
| **ST** | ↑ QW-1 (205) | — | — | — |
| **SH** | ↑ QW-1 (85) | — | — | — |
| **TH** | ↑ QW-1 (141) | — | — | — |

Wirkungs-Bewertung:
- **Brücke** steigt in **allen 10** roten Ländern — von vorher null offener Brücken-Restriktion (außer BAB via 0150) auf binäre Schwerverkehrs-Sperrungen plus Traglastindex je Bundesstraßenbrücke. Das ist der einzige flächendeckende Hebel.
- **MV (GST + Durchfahrtshöhe)** steigt punktuell durch Rostock — aber nur Stadtgebiet, nicht landesweit (niedrige Coverage).
- **Tunnel** bleibt in allen 10 Ländern **rot**. Keine offene Quelle liefert Tunnel-Durchfahrtshöhe/Breite/GST-Beschränkung mit Maßwert — die einzige bundesweite Tunnelliste (BMV ADR) ist fachlich irrelevant.
- **GST-Negativnetze/Durchfahrtshöhen-Kataster** bleiben in BW, BB, HB, NI, RP, SL, ST, SH, TH **rot** — kein landesweites offenes Kataster existiert. Sachsens technisch wertvolle 48t-Negativkarten sind viewer-verschlossen.

---

## 4. Fazit zur These

**Die These wird im Kern bestätigt, aber mit einer signifikanten, quantifizierbaren Einschränkung — sie ist nicht absolut wahr.**

**Bestätigt** — strukturell verschlossen sind:
- **Maßgenaue Brücken-Restriktionen** (Tonnage in t, Brückenklasse BK, lichte Höhe je Bauwerk): Diese liegen ausschließlich in VEMAGS / SIB-Bauwerke / ASB-ING, also behördenintern hinter Login/Vertrag (`vemags.de`, LSBB-Bürgerauskunft kostenpflichtig). Kein offener Landes-WFS außerhalb NRW/BY/BE/HH/HE/SN exponiert diese Felder. Belegt durch die durchgängig leeren oder fehlenden Restriktionsfelder bei NWSIB (NI), LVermGeo (ST), WInD (Bund), INSPIRE-TN (alle Länder).
- **Tunnel-Restriktionen**: vollständig unverfügbar über Open Data in allen 10 schwachen Ländern.
- **GST-Negativnetze/Routennetze**: nur als PDF (NI) oder verschlossener Viewer (Sachsen LASuV) — nicht maschinenlesbar offen.

**Eingeschränkt / widerlegt** — eben NICHT verfügbar war bisher unterschätzt:
1. **Ein bundesweiter, offener, maschinenlesbarer Brücken-Restriktionsdatensatz existiert doch**: der **BASt-ArcGIS-FeatureServer** mit dem binären `sperrung_sv`-Flag (3.294 SV-gesperrte Teilbauwerke, CC BY 4.0, GeoJSON, kein Vertrag) — verteilt über alle 15 Fokus-Länder. Das ist keine maßgenaue Tonnage, aber eine echte, GST-evaluierbare Sperr-Restriktion und damit mehr als „nur ein Standort-Inventar". Fundstelle: `services2.arcgis.com/jUpNdisbWqRpMo35/.../Br%C3%BCckenstatistik_Deutschland/FeatureServer/0`, verifiziert via `returnCountOnly` und `groupBy bl`.
2. **Kommunale VZ-Kataster** liefern in Open-Data-Städten echte Höhen-/Gewichts-/Achslastwerte (Rostock für MV, analog Leipzig/Hamburg im Bestand) — punktuell, nicht landesweit.

**Präzisierte These:** Außerhalb NRW/BY/BE/HH/HE/SN sind **maßgenaue** Brücken-/Tunnel-/GST-Restriktionen über Open Data strukturell nicht verfügbar (Ursache: VEMAGS-Monopol). **Binäre** Schwerverkehrs-Brückensperrungen sind hingegen bundesweit offen verfügbar (BASt) und sollten als Quick Win integriert werden; kommunale VZ-Maßwerte ergänzen punktuell. Tunnel bleiben die größte unschließbare Lücke.

**Empfohlene Umsetzungsreihenfolge:** QW-1 (BASt FeatureServer, hoher Hebel über alle Länder) → QW-2 (Rostock VZ, MV-Punktwerte) → 0126-URL-Refresh (Hessen-PDF auf Stand 27.02.2026). Sachsen LASuV-Negativkarten als Behördenanfrage vormerken (Daten existieren, nur technisch verschlossen).
