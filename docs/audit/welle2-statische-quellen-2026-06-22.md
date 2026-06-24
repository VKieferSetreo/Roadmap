# Welle-2 Statische/One-Time-Pull Quellen-Audit (2026-06-22)

Fokus: STATISCHE Dateien + One-Time-Pulls für GST-Hindernisse (Brücke/Tunnel/Gewicht), NRW ausgeklammert.

## Verifizierte Funde (echter Aufruf)

- **BASt "Brückenstatistik Deutschland" ArcGIS FeatureServer** (services2.arcgis.com/jUpNdisbWqRpMo35 .../Brückenstatistik_Deutschland/FeatureServer/0)
  Schema verifiziert (40 Felder): `sperrung_sv` (Sperrung Schwerverkehr!), `trag_l_idx` (Traglastindex ≠ Tonnage), `zn` (Zustandsnote), `breite`, `laenge`, X/Y. KEIN Brückenklasse/Tonnage-Feld. Download als GPKG/CSV/SHP/GeoJSON/Excel direkt verfügbar (api/download/v1/items/da031936bbaa4aad8302b3bcbf9494b5). DUBLETTE = haben wir schon (Welle 1).

- **Großraum- u Schwertransport-Routen Hamburg WFS** (geodienste.hamburg.de/HH_WFS_Grossraum_und_Schwertransport_Routen, typename de.hh.up:grossraum_schwertransport_netz)
  GetFeature verifiziert: Felder = wegenummer/strassenname/fahrstreifenanzahl/geschwindigkeit/wegeart/richtung + geom. KEINE Gewicht/Höhe/Breite/Achslast-Restriktion. = LOCATION_ONLY (Routen-Korridor ohne Restriktionswert). Offen (dl-de/by-2.0).

- **Verkehrszeichen Hamburg** (transparenz.hamburg, GML/WFS/JSON/OAF, Update 06.06.2026, vollst. StVO §39ff Inventar, vz_nr) = DUBLETTE unseres 0134.

## Bestätigte (neue) Sackgassen Welle 2

- BASt Brückenstatistik PDF/XLSX/CSV = aggregierte Statistik (Datei "BASt_Statistik_2026_03_Teil_1.xlsx"), keine Per-Brücke-Koordinaten. (= Welle-1 bestätigt.)
- DB "Geo-Brücke" (ArcGIS, Stand 2019) = aus Esri-DE OpenData-Feed (461 DS) DELISTED; verbliebene DB-Layer = Streckennetz/Haltestellen (Bahn), keine Straßen-Durchfahrtshöhe.
- NLStBV Niedersachsen Geofachdaten: nur klassifiziertes Straßennetz/Zählstellen — keine Brücken/Restriktions-Layer öffentlich (NWSIB vertrags-gated bleibt).
- LSBB Sachsen-Anhalt Geodienste: nur Straßennetz/Zählstellen/SWIS/Kompensation — keine Brücken/Höhen.
- GovData Volltext: "durchfahrtshöhe" 0 Treffer, "brückenklasse" 0 Treffer. "schwertransport" → nur HH-GST-Routen (location-only), Rostock-GST (haben wir), NRW-Karten (ausgeklammert).
- Municipal VZ-Kataster (Zeichen 265 Durchfahrtshöhe parsebar): nur Rostock (haben wir, 0223) + Metropole Ruhr (NRW, ausgeklammert) als echte Downloads gefunden. Leipzig/Dresden/Berlin OpenData: kein Brücken-/VZ-Höhen-Datensatz.
- INSPIRE Atom-Feeds: nur DOM/Höhenmodelle, keine Brücken-Restriktion.

## Bestes NEUES Lead (UNKLAR — Behördenanfrage)

- **VMZ Bremen "Durchfahrtshöhen" / LKW-Führungsnetz** (vmz.bremen.de/lkw/durchfahrtshoehen, /lkw-fuehrung)
  Legende bestätigt: Netz mit "vorhandenen Verkehrseinschränkungen (Durchfahrtshöhen, Tonnagen, Nachtfahrverbote)". HB = schwächstes Land.
  ABER: Vektordaten liegen hinter WMS-Raster-Proxy (gdi1.geo.bremen.de/mapproxy/LKW, keine public GetCapabilities) + generischem POI-Such-Index (/apps/pois-search-api.php = Gewerbegebiete/Straßen/Parken, keine Höhen). Kein offenes GeoJSON (/geojson/* alle 404), GDI-Bremen CSW kein Durchfahrt-Record.
  → Restriktionsdaten existieren operativ, aber KEIN bestätigter offener maschinenlesbarer Download. Zugang = Anfrage an VMZ/GDI Bremen (Behördenkontakt).
