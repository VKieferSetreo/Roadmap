# Abdeckungs- & Gap-Analyse — GST-Hindernis-Datenquellen (Deutschland)

> **Stand:** 2026-06-13 · Quelle: `API/STATUS.md` (127 Quellen), `API/health-snapshot.txt`,
> `API/quellen-index.json`, 36 aktive `*.cron.mjs` + 91 `*.cron.skip.txt`, 36 `*.normalisiert.json`,
> `docs/research/*`. Zahlen = `anzahl_verfuegbar` aus dem letzten Cron-Lauf.
> **Keine Schönfärberei** — die strukturelle Lücke (dauerhafte Bauwerksrestriktionen) ist real.

---

## 0. Eckzahlen auf einen Blick

| Kennzahl | Wert |
|---|---|
| Katalogisierte Quellen gesamt | **127** |
| Davon live getestet (🟢) | 83 · +1 📄 (PDF) |
| **Aktive Cron-Producer (liefern Hindernisse)** | **36** |
| Übersprungen (skip-Dateien) | **91** |
| **Σ Datensätze aller aktiven Producer** | **~40.800** |
| Account-gated (🔑, gebaut-aber-aus) | 9–12 |
| Reine Portal-/PDF-/Meta-Quellen (⚪) | 10 |

**Wichtig:** Von den 91 skips sind die meisten **bewusst kein Producer** (Netz-/Geobasis-/Katalog-/
Standard-Daten, OSM-zentral, Mobilithek-zentral). Nur eine Minderheit sind *echte* fehlende
Hindernis-Feeds (gated/Portal/PDF/WMS — siehe §3).

---

## 1. Was haben wir (aktive Producer)

### 1a. Nach Ebene

| Ebene | Producer | ~Datensätze | Kommentar |
|---|---|---|---|
| **Bund** | 1 (Autobahn-API) | **3.687** | BAB bundesweit, Baustellen + Sperrungen — autoritativ für Autobahnen |
| **OSM (bundesweit)** | 1 (Overpass) | **7.257** (4.681 normalisiert) | maxheight/maxweight/Brücke/Engstelle, ganz DE — Basis-Layer |
| **Länder** | 19 | **~20.500** | 11 von 16 Ländern mit ≥1 offenem Producer |
| **Städte** | 14 | **~8.160** | ~13 Großstädte + RVR-Verbund |
| **Regional** | 1 (RVR Ruhr) | 20 | Verbund-Beispiel-Connector |
| **Σ** | **36** | **~40.800** | |

### 1b. Nach Datentyp (die zwei Datenwelten)

| Datentyp | ~Datensätze | Producer (Auswahl) |
|---|---|---|
| **Temporär** (Baustellen/Sperrungen/Umleitungen/Verkehrszeichen) | **~17.400** + OSM-Anteil | Autobahn-API, MobiData-BW, Berlin VIZ, München, Dresden, Leipzig, SH, MV, Sachsen-Anhalt, Saarland, alle NRW-Städte |
| **Dauerhaft — Bauwerke** (Brücken/Traglast/Höhe) | **~11.100** | BAYSIS-BY (6.000), Detailnetz-Berlin (1.005), Brücken-HH (941), Straßen.NRW-Bauwerke (2.861), GST-Karte-NRW (157), Hessen-PDF (136), GST-Sachsen-PDF (24) |
| **GST-Positivrouten** (befahrbar) | **~3.900** | GST-Routen-Hamburg (3.892), Rostock-GST (19) |
| **OSM gemischt** | **7.257** | Overpass (height/weight/bridge bundesweit) |

### 1c. Bundesländer — gut vs. dünn vs. leer

| Ampel | Land | temp | dauerhaft | Bewertung |
|---|---|---|---|---|
| 🟢 stark | **Hamburg** | 6.128 | 941 | Vorbild: GST-Routen-WFS + Brücken + Baustellen + Umleitungen, alles offen |
| 🟢 stark | **Bayern** | 3.000 (München) | **6.000** | BAYSIS-Bauwerke = beste offene Brückenquelle DE; Landes-Baustellen aber nur gated (Mobilithek) |
| 🟢 stark | **NRW** | 862 + 6 Städte | 3.018 | Straßen.NRW-Bauwerke + GST-Negativkarte + viele Städte (Aachen/Bonn/Dortmund/Düsseldorf/Köln/Münster) |
| 🟢 stark | **Berlin** | 992 | 1.005 | VIZ-Baustellen + Detailnetz-Bauwerke, beide offen |
| 🟢 gut | **Sachsen** | 2.839 (Dresden/Leipzig) | 24 (PDF) | starke Städte, Land nur WMS + PDF-GST |
| 🟡 mittel | **Baden-Württ.** | 1.884 | **0** | MobiData-BW + Karlsruhe/Stuttgart stark — aber **keine** offenen Bauwerksdaten |
| 🟡 mittel | **Schleswig-H.** | 1.310 | 0 | Baustellen + Umleitungen offen, keine Bauwerke |
| 🟡 dünn | **Meckl.-Vorp.** | 381 | 0 | Landes-Baustellen-WFS + Rostock, keine Bauwerke |
| 🟡 dünn | **Sachsen-Anh.** | 168 | 0 | nur LSBB-Sperrinfo (NC-Lizenz!), keine Bauwerke |
| 🟡 dünn | **Hessen** | **0** | 136 (PDF) | NUR lastbeschränkte Brücken (PDF) — **keine** offenen Baustellen (nur Mobilithek) |
| 🟡 dünn | **Saarland** | 32 | 0 | nur baustellen.saarland, keine GST-Karte |
| 🔴 **LEER** | **Brandenburg** | 0 | 0 | LS-BB nur Web-Karte, kein offener Feed → nur OSM |
| 🔴 **LEER** | **Bremen** | 0 | 0 | VMZ nur Mobilithek, ASV-Brücken nur Portal → nur OSM |
| 🔴 **LEER** | **Niedersachsen** | 0 | 0 | VMZ nur Mobilithek → nur OSM |
| 🔴 **LEER** | **Rheinl.-Pfalz** | 0 | 0 | Mobilitätsatlas nur JS-Portal, DATEX nur Mobilithek → nur OSM |
| 🔴 **LEER** | **Thüringen** | 0 | 0 | TLBV CAPTCHA-geschützt, DATEX nur Mobilithek → nur OSM |

→ **5 von 16 Ländern haben keinen einzigen offenen Landes-Producer** (BB, HB, NI, RP, TH) — dort
trägt aktuell **nur OSM**. Diese 5 hängen alle an Mobilithek (für temporär) bzw. Behörden-Deals.

---

## 2. Was fehlt produktiv (die großen Gaps)

### (a) Dauerhafte Bauwerksrestriktionen — **DIE strukturelle Hauptlücke**

Fachlich das Wertvollste für GST (Brücken-**Traglast** / **lichte Höhe** / **Achslast**), aber
fast nirgends offen maschinenlesbar.

| Haben wir offen | Land | Format |
|---|---|---|
| BAYSIS-Bauwerke (6.000) | Bayern | WFS ✅ |
| Detailnetz-Berlin (1.005) | Berlin | WFS ✅ |
| Brücken-Hamburg LSBG (941) | Hamburg | WFS ✅ |
| Straßen.NRW-Bauwerke (2.861) + GST-Negativkarte (157) | NRW | WFS / ArcGIS ✅ |
| Hessen lastbeschr. Brücken (136) | Hessen | **PDF→parsed** 📄 |
| GST-Negativkarte Sachsen (24) | Sachsen | **PDF→parsed** 📄 |

**Wo NICHT (offene Bauwerksdaten fehlen ganz):** BW, BB, HB, MV, NI, RP, SL, ST, SH, TH —
**10 von 16 Ländern** ohne offene Brücken-/Traglast-Daten. Plus **kein bundesweiter** Bauwerks-
Layer (BASt SIB-Bauwerke / Brückenkarte sind portal-gated, siehe §3). Das ist die ~70 %-Lücke
bei dauerhaften Restriktionen.

### (b) Länder ohne offene Baustellen-/GST-Daten

**Komplett leer (nur OSM):** Brandenburg, Bremen, Niedersachsen, Rheinland-Pfalz, Thüringen.
**Temporär nur gated:** Hessen + Bayern-Land (Baustellen nur über Mobilithek/DATEX). Alle diese
hängen am **Mobilithek-Account** — ein einziger Zugang würde 5–7 Länder auf einen Schlag schließen.

### (c) Innerorts / kommunal außerhalb der ~13 Städte

Offen angebunden sind ~13 Großstädte (München, Karlsruhe, Stuttgart, Berlin, Hamburg, Rostock,
Aachen, Bonn, Dortmund, Düsseldorf, Köln, Münster, Dresden, Leipzig) + RVR-Verbund. Das deckt die
größten Städte, aber **die Masse der ~11.000 Gemeinden ist gar nicht erfasst** — innerorts auf
Gemeinde-/Kreisstraßen (enge Brücken, Gewichtsbeschränkungen, Poller) verlässt man sich allein auf
OSM. Mittelstädte (z. B. Nürnberg, Frankfurt, Wiesbaden, Hannover, Mannheim, Essen) sind als
Portal-Stubs identifiziert, aber **ohne offenen Maschinen-Endpunkt** (siehe §3) — kein
Connector-Template hilft, solange kein Feed existiert.

---

## 3. Welche Schnittstellen funktionieren (noch) nicht — und warum

Kategorisiert aus den `*.cron.skip.txt` (nur *echte* Producer-Lücken, ohne Netz-/Geobasis-/Meta-Skips):

### 🔒 Gated — Account/Vertrag/Zertifikat nötig (Daten existieren, Zugang fehlt)
| Quelle | Datentyp | Grund |
|---|---|---|
| **Mobilithek (NAP)** | DATEX-II bundesweit (Baustellen/Sperrungen aller Länder) | Registrierung + Zertifikat + Nutzungsvereinbarung **je Datensatz**, kein anonymer Bulk-Endpunkt |
| **VEMAGS / Xvemags** | GST-Genehmigungen, Bauwerksstatik, Routen | Behörden-Antragssystem, SOAP nur für Workflow, **kein Restriktions-Pull** |
| **BASt SIB-Bauwerke** | DIE bundesweite Brückenstatik | Behördensystem, kein offener WFS/Download |
| BayernInfo ArbIS/VIZ → Mobilithek | BY-Baustellen + Verkehrsmeldungen | nur über Mobilithek-Vertrag (Angebote …2507001 / …2506…) |
| Mobilithek NI / VMZ NI / VMZ Bremen / ST-DATEX | Länder-Baustellen | alle nur über Mobilithek-Pipeline |
| GDI-SBV Sachsen (Bauwerke) | Bauwerks-Fachdaten | nur im Verwaltungsnetz (SVN/KDN), nicht aus offenem Internet |

### 🖥️ Nur Portal / PDF (Daten sichtbar, nicht als Rohdaten)
| Quelle | Grund |
|---|---|
| BASt Brückenkarte | nur Web-Karte, kein Rohdaten-Endpunkt |
| Hessen Positivkarten GST | bildhafte PDF-Karten je Landkreis × Gewichtsklasse, keine Geometrie |
| ASV Bremen Brücken-GST | Bauwerksportal Web-only, Daten nur auf Anfrage |
| LfS Saarland / LBM-RLP Brücken-GST | nur Info-Themenseiten (HTML), keine Negativliste |
| Mobilitätsatlas RLP | reines JS-Karten-Frontend (/api /geojson /wfs alle 404) |
| Frankfurt / Wiesbaden / Hannover / Nürnberg / Essen / Mannheim | Open-Data-Portale **ohne** Baustellen-Maschinen-API (SPA / 404 / kein passender Datensatz) |

### 🗺️ Nur WMS (keine ziehbaren Features)
| Quelle | Grund |
|---|---|
| LASuV Baustellen Sachsen (Land) | nur WMS GetMap/GetFeatureInfo, WFS = HTTP 403 — nur Pixel, keine Features (Dresden/Leipzig decken SN-Städte ab) |

### 🤖 CAPTCHA / Bot-Schutz
| Quelle | Grund |
|---|---|
| TLBV Baustellen Thüringen | GWT-Web-App mit Link11/CAPTCHA — curl blockiert, kein Maschinenzugriff |
| LfS Saarland GST | HTTP 40x auf automatisierte Abrufe |

### 📭 Kein offener Feed (Anfrage nötig)
| Quelle | Grund |
|---|---|
| LS Brandenburg Baustellen | interaktive Web-Karte, Feed **nur per Anfrage** an LS |
| GovData-Brückenkarte NRW | CKAN liefert nur Metadaten; Rohdaten = ArcGIS hinter Hub |
| Hamburg Hauptverkehr-/Bundesfern-Baustellen | Endpunkt endgültig abgeschaltet (GetCapabilities=404) |

### Redundant / bewusst zentral (kein Defekt)
OSM-Landes-Crons (zentral via Overpass), Mobilithek-Landesknoten (zentral), Geofabrik/Planet/QLever
(redundant zu Overpass), ALKIS/Geobasis-Dubletten (z. B. Berlin ALKIS = Detailnetz) — alles bewusst
übersprungen, **kein** technisches Problem.

---

## 4. Welche Datenquellen-TYPEN fehlen tendenziell

1. **Bundesweite SIB-Bauwerke / Brückenstatik** (via BASt bzw. VEMAGS) — der eine Layer, der alle
   16 Länder mit Traglast/Höhe/Achslast versorgen würde. Existiert, ist aber behörden-gated. **#1.**
2. **Kommunale Brücken-/Bauwerksdaten** unterhalb der Großstädte — Kreis-/Gemeindebrücken sind in
   keinem offenen Feed; nur OSM (lückenhaft).
3. **Achslast-Daten (`maxaxleload`)** — die kritischste Einzel-Lücke: OSM hat DE-weit nur ~2,3 k
   Achslast-Tags (vs. ~105 k maxheight, ~87 k maxweight). Für Brückenstatik viel zu dünn — und es
   gibt **keine** offene Alternativquelle.
4. **Flächendeckende Landes-Baustellen-DATEX** — existiert (alle Länder liefern an Mobilithek),
   aber nur hinter dem NAP-Account.
5. **GST-Negativkarten** (für GST gesperrte Strecken/Brücken) — offen nur NRW + Sachsen(PDF) +
   Hessen(PDF); fehlen offen in RP, SL, BB, MV, ST, TH, BW, SH.
6. **Mittelstadt-Baustellen** — Portal-Stubs ohne Maschinen-API (Frankfurt, Nürnberg, Hannover …).

---

## 5. DE-Abdeckung grob (ehrliche Schätzung)

> Getrennt nach den zwei Datenwelten. Schätzbasis = Mix aus Straßenklassen-Abdeckung,
> Einwohner-/Flächenanteil der versorgten Länder/Städte und Provenienz-Qualität.

### Temporäre Daten (Baustellen / Sperrungen / Umleitungen)
**~55–65 % effektiv offen heute.**
- **Stark (≈100 % der Klasse):** Bundesautobahnen via Autobahn-API — autoritativ, bundesweit.
- **Gut:** Länder mit offenem Feed (BW, BE, HH, MV, NW, SN, ST, SL, SH) ≈ 9/16, plus ~13 Großstädte.
- **Lücke:** 5 Länder komplett ohne offenen Feed (BB, HB, NI, RP, TH) + HE/BY-Land nur gated; Masse
  der Gemeinde-/Kreisstraßen nicht erfasst.
- Mit **Mobilithek-Account** sprünge dies realistisch auf **~90 %** (alle Länder-DATEX). Darum ist
  die Schätzung *„heute offen"* deutlich niedriger als das *technisch Erreichbare*.

### Dauerhafte Bauwerksrestriktionen (Traglast / lichte Höhe / Achslast)
**~25–35 % effektiv — und qualitativ dünn.**
- Offene amtliche Bauwerksdaten nur in **6/16 Ländern** (BY, BE, HH, NW + HE/SN als PDF). Das sind
  zwar einwohnerstarke Länder (~45 % der Bevölkerung), aber **kein bundesweiter Layer**, keine
  Achslast, und 10 Länder ganz ohne.
- OSM füllt grob auf (maxheight/maxweight breit), aber **maxaxleload ~2,3 k** ist für Brückenstatik
  unbrauchbar → die Achslast-Dimension ist effektiv **<10 %** abgedeckt.
- Die wirklich autoritative Quelle (BASt SIB / VEMAGS) ist **0 % offen**.
- **Begründung der Spanne:** Höhe/Gewicht über OSM + 6 Länder ≈ 35 %; Traglast amtlich ≈ 25 %;
  Achslast amtlich ≈ <10 %. Gewichteter Mittelwert → **~25–35 %**, mit großen Qualitätsvorbehalten.

**Fazit:** temporär ≈ 60 % (heute) / ~90 % (mit Mobilithek), dauerhaft ≈ 30 % und ohne
VEMAGS/SIB-Deal nicht substanziell steigerbar.

---

## 6. Große offene Themen (Priorität)

1. **Mobilithek-Account beschaffen** — größter Sofort-Hebel: schließt BB, HB, NI, RP, TH + HE/BY-Land
   bei den temporären Daten → temporär von ~60 % auf ~90 %. Aufwand: Registrierung + Zertifikat +
   Nutzungsvereinbarung je Feed. Einmalige Pipeline statt 16 Einzel-Connectoren.
2. **VEMAGS-/BASt-SIB-Deal** — der einzige Weg zu bundesweiter Brückenstatik + Achslast. Behörden-/
   Drittsystem-Andockung (BMDV „GST 4.0"). Höchste fachliche Priorität, längster Vorlauf. Ohne das
   bleibt die dauerhafte Datenwelt strukturell offen.
3. **PDF-Parsing-Pipeline ausbauen** — funktioniert bereits (Hessen-Brücken 136, Sachsen-GST 24).
   Skalieren auf Hessen-Positivkarten, RP/SL-Themenseiten, weitere Landkreis-PDFs → günstiger
   Teil-Ersatz für fehlende Bauwerks-Feeds.
4. **Achslast-Lücke** — strategisch ungelöst. OSM zu dünn (~2,3 k), keine offene Alternative.
   Realistisch nur über VEMAGS/SIB lösbar (Punkt 2) — bis dahin konservativ flaggen.
5. **Kommunale Skalierung** — Connector-Template für CKAN/Opendatasoft/GeoServer existiert; Engpass
   ist nicht Code, sondern **fehlende offene Feeds** der Mittelstädte (Portal-Stubs). Pro Stadt
   prüfen, ob ein WFS/GeoJSON auffindbar ist, sonst Verzicht.
6. **NC-lizenzierte Feeds** (VMZ Bremen, LSBB Sachsen-Anhalt) — kommerzielle Nutzungsvereinbarung
   einholen, sonst rechtlich nicht produktiv nutzbar.
7. **GST-Negativkarten der Rest-Länder** (RP, SL, BB, MV, ST, TH, BW, SH) per Landesbetrieb-Anfrage
   beschaffen — diese GST-spezifischen Sperrlisten sind genau das, was Routing braucht.

---

*Erstellt aus Repo-Stand 2026-06-13. Zahlen sind Cron-Lauf-`anzahl_verfuegbar`; einige (BAYSIS,
München, NRW-Netz, OSM) sind paginierungs-/Limit-gedeckelt und reale Bestände höher.*
