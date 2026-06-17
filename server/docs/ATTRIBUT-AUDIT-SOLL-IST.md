# Attribut-Audit SOLL/IST — Datenquellen-Connectoren

> Stand: 2026-06-17 · 48 auditierte Connectoren (Hamburg, Berlin, SH, MV, ST, BW, Bayern, NRW, Hessen, Saarland, Sachsen, Thüringen, Brandenburg, Autobahn, Mobilithek/DATEX-II sowie 15 kommunale Quellen)

## Executive Summary

Die Extraktion ist über alle 48 Connectoren hinweg **bei Identität, Ort und Zeitraum solide, aber bei den schwertransport-entscheidenden Attributen systematisch unterausgeschöpft**. Zwei Muster dominieren und sind quellenübergreifend: (1) **Geometrie-Degradation** — mindestens 13 Connectoren reduzieren einen vollständigen LineString/MultiLineString/Polygon via `ersterPunkt()` auf einen einzelnen Pin und reichen `geom` nie an `makeNormalized()` durch, womit Korridor-Clip, Linien-Render und Richtungsfilter (SAME_LANE) strukturell ausfallen. (2) **Freitext-Raten statt Struktur-Mapping** — bei mindestens 18 Connectoren liegt die Sperrart (Voll-/Teil-/Richtungssperrung) und teils der Grenzwert als sauberes kontrolliertes Vokabular bzw. dediziertes Feld vor (`severity`, `direction`, `BESCHRSP`, `Status_Fahrstreifen`, `sperrungstyp`, `KFZ_GEW`, `Sperrart_Klartext`, `display_type`), wird aber per `/vollsperr/i`-Regex aus dem Freitext erraten — das verfehlt Fahrtrichtungs-/Teilsperrungen zuverlässig. Die größten Einzelhebel: das geteilte **DATEX-II-Parser-Defizit** (Mobilithek 0140–0146 + NI: keine `maxLaengeM`, keine `vehicleCharacteristics`-Container, keine strukturierte Sperrart/Richtung), die **Brückenklasse als Tonnage-Proxy** in BAYSIS (0123, wo `Gewichtsbeschränkung` fast durchgängig leer ist) und die **echte GST-Sperr-Klassifikation** (`grundsaetzlicheGstSperre` vs. generisches `gesperrtKomplett`) bei Autobahn 0150. Echte Schwertransport-Limits (Höhe/Gewicht/Breite/Länge/Achslast) fehlen bei den kommunalen Baustellen-Quellen meist **strukturell** in der Quelle — dort ist nichts zu holen außer der Sperrart.

## Top-Hebel quer über alle Quellen

Reihenfolge nach Häufigkeit × Schwertransport-Relevanz:

| Hebel | Was passiert | Betroffene Connectoren (Auswahl) |
|---|---|---|
| **Geometrie auf Punkt kollabiert** | Vollständige Linie/Fläche vorhanden, aber nur `coords[0]` als Pin; `geom` nie durchgereicht → kein Korridor-Clip/Linien-Render/Richtungsfilter | 0110, 0113, 0114, 0115, 0116, 0117, 0118, 0122, 0125, 0213, 0210 (Polygon), 0215, 0302; teils 0114/0115 (LineString in GeometryCollection) |
| **Sperrart aus Freitext geraten statt Struktur** | `severity`/`direction`/`BESCHRSP`/`Status_Fahrstreifen`/`sperrungstyp`/`Sperrung_Art_Klartext`/`kind`/`display_type` liegen als kontrolliertes Vokabular vor, werden ignoriert; `/vollsperr/i` verfehlt Teil-/Fahrtrichtungssperrung | 0112, 0114, 0115, 0117, 0119, 0120, 0128, 0129, 0130, 0131, 0132, 0211, 0214, 0215, 0217, 0219, 0001 |
| **Fahrtrichtung (`direction`/`RICHTUNG`) ungemappt** | Strukturierte Richtung (BOTH/ONE, R/G, Stationierungsrichtung) verfällt; Gegenfahrbahn-Filter kann nicht greifen | 0110, 0113, 0114, 0115, 0117, 0122, 0128, 0131, 0221, datex2 |
| **Strukturierte Grenzwert-Felder ignoriert** | Dedizierte Tonnage/Breite/Länge-Spalten vorhanden, aber per Regex aus Freitext geschätzt | 0117 (`Höhenbeschränkung_in_m`), 0118 (3 GST-Felder), 0131 (`KFZ_GEW/BREITE/LAENGE`), 0123 (`Brückenklasse`), datex2 (`vehicleCharacteristics`) |
| **GST-Sperre nicht als `grundsaetzlicheGstSperre`** | „ST-Sperre"/„GST-Sperrvermerk" landet als generisches `gesperrtKomplett` oder `bezugsgewichtT`-Custom-Key, den der Routing-Check ignoriert | 0150, 0121, 0001 |
| **Abgelaufene/zukünftige Maßnahmen nicht gefiltert** | `IS_ABGELAUFEN`, `is_future`, `STATUS`, `anzeige`, `AKTIV`, `typ` (Event/Stau) → veraltete oder irrelevante Sätze als aktive Sperre | 0131 (486/994 stale!), 0114, 0115, 0128, 0212, 0214, 0228 |
| **Zuständigkeit (`zustaendig`) nie gesetzt** | Bauamt/Behörde/Auftraggeber/Träger vorhanden, `makeNormalized` bekommt keinen Wert | 0111, 0112, 0123, 0129, 0130, 0131, 0211, 0216, 0218, 0228, 0302, datex2 |
| **Quell-Aktualität durch `new Date()` überschrieben** | Echtes `letzteaktualisierung`/`Zeitstempel`/`version` ignoriert → Stale-Erkennung unmöglich | 0112, 0114, 0117, 0129, 0132 |

## DATEX-II (datex2.js → Mobilithek 0140–0146 + NI)

Der geteilte Parser ist der **strategisch wichtigste Single-Point**: er versorgt alle gebuchten Mobilithek-Abos. Nach der Bracket-Bereinigung steckt hier deutlich mehr Struktur als nur Freitext — aktuell wird sie nicht gehoben:

- **`maxLaengeM` fehlt komplett** (kritisch). Kein `tag('maximumLength'/'lengthLimit')` im Parser — für lange Ladung das Kernkriterium.
- **`vehicleCharacteristics`-Container werden nicht gelesen** (kritisch). Werte liegen in v2/v3 strukturiert unter `grossWeightCharacteristic/grossVehicleWeight`, `heightCharacteristic/vehicleHeight` mit `comparisonOperator`; der Parser greppt nur lose Tag-Namen und liefert deshalb oft `null` statt der echten Schranke. **Größter Hebel** — hier verlieren wir Gewicht/Höhe trotz vorhandener Struktur.
- **Sperrart unstrukturiert** (kritisch): `roadOrCarriagewayOrLaneManagementType` (carriagewayClosed/roadClosed/laneClosures) wird nicht in `gesperrtKomplett` gemappt; alles fällt auf grobes `kategorie='sperrung'`.
- **Fahrtrichtung fehlt** (hoch): `alertCDirectionCoded`, `directionBoundOnLinearSection`, `directionBound` ungenutzt → Gegenfahrbahn-Filter (vgl. Brain `gegenverkehr-rootcause`) greift bei DATEX-Linien nicht.
- **Spuren/Engstelle** (hoch): `numberOfLanesRestricted`/`totalNumberOfLanes`/`lanesAffected` ignoriert — wichtigstes Restbreiten-Surrogat ohne cm-Angabe.
- **Uhrzeit abgeschnitten** (hoch): `dateOnly()` wirft den Zeitanteil von `overallStartTime` und die `recurringTimePeriodOfDay` weg → Nacht-/Wochenendsperrungen verlieren ihr Zeitfenster (für Schwertransport-Slots entscheidend).
- **Umleitung/Zuständigkeit** (mittel): `diversion/detourRoute/advice` → `attrs.umleitung`; `managingOperatorReference/authority` → `zustaendig`.

> Hinweis: `sampleStatus = mtls-blocked` — der Parser konnte nicht gegen einen echten Feed-Response verifiziert werden. Empfehlung am Ende.

## Ranking: Connectoren mit dem größten ungenutzten Potenzial

Sortiert nach Anzahl kritischer + hoher Gaps (eigene IST-Schwächen, struktur-bedingte Quell-Lücken ohne Hebel ausgeklammert).

| Connector | Format | #krit+hoch Gaps | Top-fehlendes Feld |
|---|---|---:|---|
| datex2.js (0140–0146 + NI) | DATEX-II | 6 | `vehicleCharacteristics` (Gewicht/Höhe) + `maxLaengeM` |
| 0131 thueringen_baustellen | ArcGIS-GeoJSON | 6 | `KFZ_GEW/BREITE/LAENGE` + `BESCHRSP` + `IS_ABGELAUFEN`-Filter |
| 0114 viz_berlin_baustellen | WFS | 5 | `severity` (Voll-/Fahrtrichtungssperrung) + `direction` |
| 0115 viz_berlin_geojson_feeds | GeoJSON | 5 | LineString-Strecke + `severity` + `direction` |
| 0117 baustellen_sh | WFS | 5 | `Höhenbeschränkung_in_m` + MultiLineString-geom |
| 0001/0150 autobahn | JSON / ArcGIS | 5 | `display_type` + `SIB_BW_Sperrvermerk`/GST-Sperre + Verbund-Limits |
| 0112 baustellen_hamburg | WFS | 4 | `umfang`/`iststoerung`-Fehlmapping + `umleitungsbeschreibung` |
| 0118 umleitungsstrecken_sh | WFS | 4 | 3 GST-Schemafelder + `GEEIGNET_FÜR` (12% Rad/PKW-only) |
| 0128 mobidata_bw_baustellen | GeoJSON | 4 | `direction`-Enum (100% gesetzt) + `subtype`/`type` |
| 0130 sachsen_baustellen | GeoJSON | 4 | `Sperrung_Art_Klartext` (LKW-Sperre) + `Umleitung_ueber` |
| 0228 duisburg_baustellen | ArcGIS-GeoJSON | 4 | `BESCHREIBUNG`-Feld (falscher beschreibung-Input) |
| 0110 gst_routen_hamburg | OGC Features | 3 | LineString-Korridor-`geom` + `richtung` |
| 0122 mobidata_bw_lms | TIC3-XML | 3 | `TmcEvent/Quantifier` + Polyline + `Direction` |
| 0132 brandenburg_baustellen | WFS | 4 | `Status_Fahrstreifen` + `Art` + `Laenge_m` |
| 0214 stuttgart_baustellen | WFS | 3 | `VERKEHRSAUSWIRKUNG` (Teilsperrung) + `STATUS` |
| 0219 karlsruhe_trk | WFS | 2 | `sperrung`-Enum + `art` (Brückenbau/3.5t) |
| 0124 gst_schwertransportkarte_nrw | ArcGIS | 1 | `klasse` (Bauwerks-/Straßenklasse) |
| 0123 baysis_bauwerke | WFS | 2 | `Brückenklasse` (DIN BK 30/60 = Tonnage-Proxy) |
| 0121 gst_negativkarte_sachsen | HTML-Scrape | 2 | **Connector tot** — Migration auf geoportal-sbv nötig |

## Konkrete Empfehlungen je betroffenem Connector

**Geometrie durchreichen** (jeweils `geom: f.geometry` bzw. reprojizierter LineString/Polygon an `makeNormalized`):
- 0110, 0113, 0118 → LineString-Korridor (`geom`), nicht `ersterPunkt()`
- 0114, 0115 → LineString aus `GeometryCollection` extrahieren (~95 % der Features tragen ihn)
- 0116, 0125 → MultiLineString via `reprojGeom(geom,33)` (Helper existiert)
- 0117 → MultiLineString (`Höhenbeschränkung_in_m` zusätzlich → `attrs.maxHoeheM`)
- 0122 → bereits eingesammelte Polyline (`alleKoords`) als `geom` setzen statt verwerfen
- 0210 → reprojizierten MultiPolygon-Umring als `geom` (Baustellen-Fläche)
- 0213, 0215, 0302 → LineString durchreichen

**Sperrart strukturiert mappen** (statt `/vollsperr/i`-Regex):
- 0112 → `umfang` parsen; `attrs.vollsperrung = iststoerung` **entfernen** (Fehlmapping, überflaggt jede Baustelle)
- 0114/0115 → `severity` → Vollsperrung/Fahrtrichtungssperrung; `direction` → `attrs.richtung`; `closed_lanes/total_lanes` → Spuren
- 0117 → `Verkehrseinschränkung` → `vollsperrung`/`fahrbahnVerengt`; `Betroffene_Fahrtrichtung` → `richtung`
- 0119 → `erlaeuterung` → `gesperrtKomplett`/`teilsperrung` (Regex verschluckt „halbseitige Sperrung")
- 0120 → `kind/kind_description` → `gesperrtKomplett`; `diversion` → `umleitung`; `bab_direction*` → `richtung`
- 0128 → `direction`-Enum → `attrs.richtung` (BOTH/ONE); `subtype`/`type` → `sperrungArt`
- 0129 → `sperrungstyp='roadClosed'` → `vollsperrung=true`; `typ`-Suffix `_GEPLANT` → Status; `ansprechpartner` → `zustaendig`
- 0130 → `Sperrung_Art_Klartext` (insb. „Sperrung für LKW" + Richtungsfahrbahn); `Umleitung_ueber` → `umleitung`; `Strassenklasse` → `strassenRef`; `Behörde` → `zustaendig`
- 0131 → `BESCHRSP`-Enum + `KFZ_GEW/BREITE/LAENGE` strukturiert; `RICHTUNG`; **`IS_ABGELAUFEN=1` (486/994) filtern**; `STRNAME` statt `S_STRBEZ` für `strassenRef`
- 0132 → `Status_Fahrstreifen` + `Art` + `Anzahl_Fahrstreifen(_gesperrt)` + `Laenge_m` direkt mappen
- 0211 → `symbol` (Voll-/Teilsperrung + „abgelaufen"); `strassen` → `strassenRef` (heute hart null); `einschraen` → `umleitung`
- 0214 → `VERKEHRSAUSWIRKUNG` (Teilsperrung/Einbahn); `STATUS` (im Bau vs. geplant); Monatsname-Parser für `ENDE`
- 0215 → `typ_bez`/`typ_id` → `gesperrtKomplett`/`halbseitig` (14 Teilsperrungen ungeflaggt)
- 0217 → `trafficConstrictionType=lanesBlocked` → Teilsperrung; `lane` (rightLane/leftLane)
- 0219 → `sperrung`-Enum (inkl. „Sperrung in eine Fahrtrichtung"); `art` (Brückenbau / „B13 Poids Max 3.5t")

**Strukturierte Grenzwerte/Proxys heben:**
- 0123 → **`Brückenklasse` (DIN BK 30/60) als Tonnage-Proxy** mappen (`Gewichtsbeschränkung` fast immer leer); `Bauamt/Kontakt` → `zustaendig`; ASB-Verortung (Abschnitt/Station/VNK/NNK)
- 0118 → `HÖHENBESCHRÄNKUNG_IN_M`/`GEWICHTSBESCHRÄNKUNG_IN_T`/`Verbleibende_Restbreite_in_m` → `attrs.*`; **`GEEIGNET_FÜR` auswerten** (25/202 sind Rad/PKW-only = für Schwerlast unbrauchbar)
- 0150 → `SIB_BW_Sperrvermerk` lesen; „ST-Sperre"/„GST-Sperrvermerk" → **`grundsaetzlicheGstSperre`** (nicht generisches `gesperrtKomplett`); Verbund-Limits (Breite/Tonnage) vollständig parsen
- 0001 → `display_type` (CLOSURE vs. CLOSURE_ENTRY_EXIT — Auffahrt vs. Strecke); `routeRecommendation` → `umleitung`; `future` → aktiv/geplant trennen
- 0121 → **Connector neu anbinden**: LASuV-Seite hat von PDFs auf GeoViewer (geoportal-sbv, stateId-GUIDs 48/60/68 t) migriert, `.pdf`-Regex matcht 0 → 0 Hindernisse; `bezugsgewichtT` → `maxGewichtT` umbenennen
- 0124 → `klasse` → `attrs.bauwerksart` (G/W/F = faktisch nicht befahrbar)

**Filter gegen Datenverschmutzung:**
- 0212 → `typ`-Domain dekodieren; Codes 4–15 (Stau/Hochwasser/Karneval/Events) + `anzeige=0` droppen
- 0228 → `beschreibung = [BESCHREIBUNG, UMFANG, UMLEITUNG, VERLAENGERUNG_BAUZEIT]` joinen (heute nur `ANLASS_TXT_BM` → ST-Anreicherung läuft ins Leere); `AKTIV=1`/`FREIGABESTATUS`-Filter
- 0224 → `SONDERINFO` (reichstes Feld, komplett verworfen) in `beschreibung` + `extractStammdaten` speisen; `SPERR_ART`-Code mappen

**Quell-Aktualität:** 0112/0114/0117/0129/0132 → echtes Quell-Datum (`letzteaktualisierung`/`tstore`/`Letztes_Aktualisierungsdatum`/`version`/`Zeitstempel`) auf `quelle.aktualisiertAm` statt `new Date()`.

## Quellen ohne `live-ok`-Sample — manuelle Prüfung nötig

| Connector | Status | Was zu prüfen ist |
|---|---|---|
| **datex2.js** (0140–0146 + NI) | `mtls-blocked` | Parser gegen echten mTLS-Feed-Response verifizieren — vor jeder Erweiterung muss ein realer DATEX-v2/v3-Payload her, um die `vehicleCharacteristics`-Container-Struktur und Sperrart-/Richtungs-Tags am Live-XML zu bestätigen (heute nur Schema-Annahme). Höchste Priorität, da es alle Mobilithek-Abos versorgt. |
| **0126 Hessen lastbeschränkte Brücken** | `sample-json` | Aus Behörden-PDF geparst, kein Live-Endpoint. Snapshot vollständig gemappt; bei nächstem PDF-Stand `nach_nk`/`teilbauwerk`/`stand` ergänzen. Tonnage/Höhe sind echte Quell-Lücken (in der PDF nicht vorhanden). |
| **0121 gst_negativkarte_sachsen** | `live-ok`, aber **0 Treffer** | Seite ist live, liefert aber faktisch nichts mehr (PDF→GeoViewer-Migration). Manuell die geoportal-sbv stateId-GUIDs auflösen und den dahinterliegenden WFS/ArcGIS-Layer der 48/60/68-t-Teilnetze identifizieren. |
| **0110 LIEGT_OBEN_ASW / 0303** | `live-ok`, Feld im Sample leer | Befüllungsquote von `LIEGT_OBEN_ASW` (0303) bzw. Richtungs-/Spurfeldern über ein größeres Sample verifizieren, bevor Mapping gebaut wird. |

Alle übrigen 44 Connectoren sind `live-ok` und direkt umsetzbar.
