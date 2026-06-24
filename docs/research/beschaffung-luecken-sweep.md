# Beschaffungs- & Lücken-Sweep — neue/anbindbare DE-Quellen

> **Stand:** 2026-06-13 · Fokus: offene, maschinenlesbare DE-Quellen, die im bestehenden
> Katalog (`API/STATUS.md`, 127 Quellen) FEHLEN. Verifiziert per Web-Recherche + Endpunkt-Probe
> wo möglich. **Keine erfundenen URLs** — wo nur „Portal sichtbar, kein Feed" gefunden wurde, steht
> das ehrlich dran.
>
> Gegenstück zu `docs/research/ABDECKUNG-UND-GAPS.md`. Dieses Dokument beantwortet:
> *Was kann Max konkret beschaffen (sofort / Account / Anfrage), um die Abdeckung zu erhöhen?*

---

## 0. Sweep-Ergebnis auf einen Blick

| Thema | Ergebnis | neue Quelle? |
|---|---|---|
| **Mittelstädte (15 geprüft)** | überwiegend Portal-Stubs ODER über bestehende Verbund-Connectoren (Open.NRW, MobiData-BW, opendata.SH) abgedeckt | **2–3 echte neue** (s. §1) |
| **Achslast (`maxaxleload`)** | **keine** offene Alternativquelle existiert (bestätigt). Nur OSM (zu dünn) + amtlich gated (BASt SIB) | **nein** |
| **Bahnübergänge maschinenlesbar** | existiert als BKG `wfs_bahn` — aber **Bundesbehörden-Lizenz**, offener DB-INSPIRE-WFS hat NUR Linien/Knoten, KEINE BÜ-Features | **nein (gated)** |
| **Tunnel/Lichtraum/Durchfahrtshöhen** | Wasserstraßen-Brücken via **ELWIS** (PDF, parsebar); Straßen-Tunnel via Landes-Bauwerks-WFS (haben wir tlw.) | **1 (ELWIS, PDF)** |
| **Kreis-/Gemeinde-Brückenregister** | **kein** offenes kommunales Brückenregister gefunden (GovData-Suche: nur NRW state-level, schon im Katalog) | **nein** |
| **Bundesweite Geodatendienste (BKG/GDI-DE)** | BKG-Bauwerks-/Restriktions-Layer sind entweder INSPIRE-Netztopologie (haben wir) oder behörden-gated | **nein neu nutzbar** |

**Kernbotschaft:** Der frische Sweep bestätigt die strukturelle Diagnose aus ABDECKUNG-UND-GAPS.md.
Es gibt **wenige echte neue offene Feeds** (2–3 Städte + ELWIS-PDF). Die großen Lücken (Achslast,
bundesweite Bauwerksstatik, Bahnübergänge, kommunale Brücken) sind **nicht** durch eine bisher
übersehene offene Quelle zu schließen — sie bleiben Account-/Anfrage-/Behörden-Themen.

---

## 1. Mittelstädte — Detail-Befund (15 neu geprüft)

| Stadt | Befund | Status | Beschaffungsweg |
|---|---|---|---|
| **Frankfurt a.M.** | offenedaten.frankfurt.de hat WFS-Datensätze (Bebauungspläne, Gewässer, Flurstücke). Verkehrsamt nennt „Baustellen" als Datenkategorie, aber **kein verifizierter Baustellen-WFS/GeoJSON** auffindbar; Mobilithek als Hauptkanal genannt. | ⚪ Portal, Feed unbestätigt | Direkt anfragen ob Baustellen-WFS existiert; sonst Mobilithek (s. §6) |
| **Nürnberg** | GeoPortal Nürnberg = ArcGIS-Viewer; open.bydata listet städtische Daten. **Kein** dedizierter Baustellen-Feed verifiziert. | ⚪ Portal | open.bydata prüfen / Stadt anfragen |
| **Wiesbaden** | WFS via `geodata.o-sp.de/service/wiesbaden.cgi` — aber Inhalt v.a. **Bauleitplanung**, kein Verkehr/Baustellen. | ⚪ nur Bauleitplanung | kein GST-Nutzen |
| **Mannheim** | Opendatasoft (`mannheim.opendatasoft.com`) — 41 Datasets, **nur Eco-Counter-Verkehrszähler**, KEIN Baustellen-Feed. Mobilitätsportal nennt Baustellen, aber nicht als offener Datensatz. | ⚪ kein Feed | Heidelberg/Mannheim laufen über MobiData-BW |
| **Essen** | NRW — läuft bereits über **RVR-Verbund** (im Katalog 🟡). | ✅ via RVR | — |
| **Bielefeld** | Open.NRW `verkehrsmeldungen-bi` = **Baumaßnahmen/VRAO/geplante Maßnahmen**, aber Format **CSV/XML/HTML, KEIN GeoJSON**, Lizenz „andere geschlossene Lizenz", Stand teils 2019/2021. WFS via `geodata.o-sp.de/service/bielefeld.cgi`. | 🟡 **anbindbar (CSV/XML)** | CSV/XML parsen; Lizenz vorab klären (geschlossen!) |
| **Bochum** | NRW — über Open.NRW / RVR-Raum. | ✅ via RVR/Open.NRW | RVR-Connector erweitern |
| **Wuppertal** | Open.NRW listet Wuppertal-Geodaten (GeoJSON/KML/SHP/ATOM); „Baustellen" als Geodaten-Thema genannt, **konkreter Baustellen-Feed nicht final verifiziert**. | 🟡 prüfen | Open.NRW-Datensatzsuche „Baustellen Wuppertal" |
| **Augsburg** | Open Data seit 11/2023 über `augsburg.bydata.de` / open.bydata. **Kein** Baustellen-Feed verifiziert. | ⚪ Portal jung | open.bydata beobachten |
| **Kiel** | opendata.schleswig-holstein.de führt Kiel als Herausgeber; **Verkehrslage-GeoJSON alle 3 Min** existiert landesweit. Baustellen-Dataset für Kiel nicht final verifiziert (Portal Anubis-bot-geschützt beim Abruf). | 🟡 **vielversprechend** | opendata.SH org-Seite Kiel manuell prüfen |
| **Magdeburg** | nur Nischen-Datasets (Baumfällungen). Kein Baustellen-Feed. | ⚪ | — |
| **Erfurt** | kein offener Baustellen-Feed; Thüringen-Land gated (TLBV CAPTCHA). | ⚪ | — |
| **Freiburg** | Baustellen nur interaktive Web-Karte; FreiGIS-Geoportal. **Baustellen über MobiData-BW (BEMaS)** abgedeckt. | ✅ via MobiData-BW | — |
| **Heidelberg** | Baustellen über **MobiData-BW (BEMaS)** in CIFS/GeoJSON/DATEX — bereits im BW-Sammel-Feed. | ✅ via MobiData-BW | — |

### Fazit Städte
- **Echte neue anbindbare Kandidaten:** **Kiel (opendata.SH)**, **Bielefeld
  (Open.NRW CSV/XML, Lizenz prüfen!)**, evtl. **Wuppertal/Bochum** (über Open.NRW/RVR-Erweiterung).
- **Kein eigener Connector nötig:** Freiburg, Heidelberg, Mannheim (→ MobiData-BW); Essen, Bochum (→ RVR).
- **Tote Stubs (kein GST-Feed):** Frankfurt, Nürnberg, Wiesbaden, Augsburg, Magdeburg, Erfurt.
- **Aufwand je Stadt:** klein (½–1 Tag Connector), **Abdeckungsgewinn pro Stadt klein** (lokal),
  in Summe „nice to have", **nicht** der große Hebel.

---

## 2. Achslast (`maxaxleload`) — die kritische Lücke

**Ergebnis: bestätigt — es gibt KEINE offene Alternativquelle.**

- Keine offene WFS/API/Download-Quelle für Brücken-Achslasten DE-weit auffindbar.
- Der **Traglastindex** (BMV, seit 2020) ist die fachlich nächste Größe — wird aber **in SIB-Bauwerke
  gespeichert** (= behörden-gated, BASt). `bmv.de/.../traglastindex.html` ist reine Erklärseite,
  **kein** Download/WFS/API.
- OSM `maxaxleload` bleibt mit ~2,3 k DE-Tags unbrauchbar für Statik.
- **Einziger realer Weg: BASt SIB-Bauwerke / VEMAGS-Andockung (Behörden-Deal).** Unverändert #1-Lücke.

→ **Keine Beschaffung möglich außer Behörden-/SIB-Weg.** Bis dahin konservativ flaggen.

---

## 3. Bahnübergänge maschinenlesbar — wichtige Differenzierung

Es gibt **zwei** DB-Streckennetz-Datensätze — Verwechslungsgefahr:

| Variante | Endpunkt | Enthält BÜ/Brücken/Tunnel? | Zugang |
|---|---|---|---|
| **BKG `wfs_bahn`** (StreckeDB) | `https://sg.geodatenzentrum.de/wfs_bahn?REQUEST=GetCapabilities&SERVICE=wfs` | **JA** — Bahnübergänge, Brücken, Tunnel(portale), Straßenüberführungen als eigene Objektklassen | 🔑 **Bundesbehörden + Zuwendungsempfänger NUR**, Lizenzvereinbarung, Weitergabe an Dritte verboten |
| **DB InfraGO INSPIRE** (tn-ra, CC BY 4.0) | DB-GeoServer (geoviewer.deutschebahn.com, INSPIRE tn-ra) | **NEIN** — nur RailwayLink/RailwayNode/MarkerPost (Netztopologie). BÜ/Brücken im Text erwähnt, aber **nicht als abrufbare Features** | 🟢 offen CC BY 4.0 |

**Befund:** Die offene Variante liefert **keine** Bahnübergangs-Punkte. Die Variante MIT
Bahnübergängen ist auf Bundesbehörden beschränkt. → **Bahnübergänge sind effektiv NICHT offen
beschaffbar.** Für GST relevant (Höhenbegrenzung/Wartezeit an BÜ), aber:
- **Beschaffungsweg:** ggf. über DB InfraGO **IPID/ISR Data Service** — aber **kostenpflichtig
  (~1.846 €/Jahr/User)** + nur für „Zugangsberechtigte nach ERegG". Nicht praktikabel.
- **Pragmatischer Ersatz:** OSM `railway=level_crossing` (offen, brauchbar für Lage; ohne amtliche
  Attribute). Sollte als eigener OSM-Layer ergänzt werden — günstigster Teil-Ersatz.

---

## 4. Tunnel / Lichtraum / Durchfahrtshöhen

| Quelle | Inhalt | Format | Status | Beschaffung |
|---|---|---|---|---|
| **ELWIS (WSV/GDWS)** | Brückendurchfahrtshöhen/-breiten an **Bundeswasserstraßen** (Main, WDK, DEK, RHK, DHK …) | **PDF-Tabellen** je Wasserstraße, statisch | 🟢 offen, parsebar | PDF-Parsing-Pipeline (wie Hessen-Brücken) → neuer Producer für Wasserstraßen-Querungen |
| **Straßen-Tunnel** | in Landes-Bauwerks-WFS enthalten (BAYSIS, Detailnetz-BE, HH-Brücken+Bauwerke, Straßen.NRW) | WFS | ✅ tlw. im Katalog | Tunnel-Filter in bestehenden Bauwerks-Connectoren sicherstellen |
| **Lichte Höhe Straße** | OSM `maxheight` (~105 k Tags) + Landes-WFS | offen | ✅ Basis vorhanden | — |

**Neu beschaffbar:** **ELWIS-PDFs** — relevant, weil Brücken ÜBER Wasserstraßen oft die kritischen
Höhenengstellen für GST-Routen mit Wasserquerung sind, und in den Straßen-Bauwerksdaten teils fehlen.
**Aufwand:** klein-mittel (PDF-Parser pro Wasserstraße, Format stabil). **Gewinn:** Nischen-Layer,
aber für Routen mit Kanal-/Flussquerung wertvoll und **sonst nirgends offen**.

---

## 5. Kreis-/Gemeinde-Brückenregister & bundesweite Bauwerks-Layer

- **GovData-CKAN-Suche** („lastbeschränkte Brücken", „Schwertransport", „Achslast"):
  **kein** kommunales/Kreis-Brückenregister offen. Einziger state-level Treffer =
  **NRW Schwertransportkarte** (schon im Katalog).
- **BKG Geodatenzentrum:** Bauwerks-/Restriktionsbezug nur in (a) INSPIRE-Netztopologie (haben wir
  über Länder-WFS) oder (b) `wfs_bahn` (behörden-gated, §3). Kein offener bundesweiter Brücken-Layer.
- **BASt Brückenkarte / SIB-Bauwerke:** unverändert Portal-/Behörden-gated (s. ABDECKUNG-UND-GAPS §3).

→ **Kein neuer offener bundesweiter oder kommunaler Bauwerks-Feed.** Bestätigt: die einzige
bundesweite Bauwerksstatik ist BASt SIB (gated).

---

## 6. Konsolidierte Beschaffungsliste (was Max TUN kann)

### A) Offen — sofort anbindbar (kleiner Aufwand, kleiner-mittlerer Gewinn)
1. **ELWIS Brückendurchfahrtshöhen Wasserstraßen** — PDF-Parser. *Aufwand:* klein-mittel.
   *Gewinn:* einziger offener Wasserstraßen-Höhen-Layer.
3. **Kiel — opendata.schleswig-holstein.de** (Verkehrslage/Baustellen GeoJSON). *Aufwand:* klein.
   *Gewinn:* Landeshauptstadt SH.
4. **OSM `railway=level_crossing`-Layer** — eigener Overpass-Producer für Bahnübergänge.
   *Aufwand:* klein. *Gewinn:* einziger offener BÜ-Ersatz (ohne amtliche Attribute).
5. **Open.NRW/RVR-Erweiterung um Wuppertal/Bochum/Bielefeld** — bestehendes Connector-Template.
   *Aufwand:* klein. *Gewinn:* lokal. **Bielefeld-Lizenz vorab prüfen (geschlossen!).**

### B) Account / Registrierung (mittlerer Aufwand, GROSSER Gewinn)
6. **Mobilithek-Account (NAP)** — *der* Hebel: schließt BB, HB, NI, RP, TH + HE/BY-Land bei
   temporären Daten → temporär von ~60 % auf ~90 %. *Aufwand:* Registrierung + Zertifikat +
   Nutzungsvereinbarung je Feed. **Höchste Priorität bei „beschaffbar".**

### C) Behörden-/Vertrags-Anfrage (großer Aufwand, struktureller Gewinn)
7. **BASt SIB-Bauwerke / VEMAGS-Andockung** — einziger Weg zu bundesweiter Brückenstatik +
   **Achslast**. Behörden-Deal (BMDV „GST 4.0"-Kontext). Längster Vorlauf, höchster fachlicher Wert.
8. **GST-Negativkarten der Rest-Länder** (RP, SL, BB, MV, ST, TH, BW, SH) per Landesbetrieb-Anfrage.
9. **DB InfraGO ISR/IPID** für amtliche Bahnübergänge — **kostenpflichtig (~1.846 €/Jahr)** +
   ERegG-Zugangsberechtigung. *Bewertung:* unwirtschaftlich, OSM-Ersatz vorziehen.
10. **NC-/geschlossen-lizenzierte Feeds** (Bielefeld, VMZ Bremen, LSBB ST) — kommerzielle
    Nutzungsvereinbarung einholen, sonst rechtlich nicht produktiv nutzbar.

---

## 7. Ehrliches Gesamturteil

Der frische Sweep hat **keine versteckte Goldader** gefunden. Die wirklich wertvollen Lücken
(Achslast, bundesweite Bauwerksstatik, amtliche Bahnübergänge, kommunale Brücken) sind **nicht**
über offene Feeds zu schließen — sie hängen an **Mobilithek (temporär)** und **BASt-SIB/VEMAGS
(dauerhaft/Achslast)**.

Was der Sweep an **Neuem** bringt:
- **ELWIS-PDFs** (Wasserstraßen-Höhen) — neuer Nischen-Producer, offen.
- **Kiel** — 1 neuer offener Stadt/Regions-Feed.
- **OSM-Bahnübergangs-Layer** — pragmatischer Ersatz für die gated BÜ-Daten.
- Bestätigung, dass **Bielefeld/Wuppertal/Bochum** über bestehende NRW/RVR-Mechanik anbindbar sind
  (Bielefeld nur mit Lizenzklärung).

Alles andere bleibt: **Mobilithek-Account = Sofort-Hebel temporär**, **BASt/VEMAGS = einziger Weg
zu Achslast & bundesweiter Statik**.

---

*Erstellt 2026-06-13 aus Web-Recherche (WebSearch/WebFetch). Endpunkte wo möglich geprüft; bei
„unbestätigt"/„prüfen" war kein direkter Feed verifizierbar — dort ehrlich keine URL behauptet.*
