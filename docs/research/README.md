# Datenquellen-Research — öffentliche DE-Quellen für Schwertransport-Hindernisse

> **Stand:** 2026-06-13 · **Status:** Recherche abgeschlossen, **NICHTS implementiert** (bewusst).
> Ziel (Max): extensiver Research nach öffentlichen API-/Daten-Quellen (Bund/Länder/Gemeinden),
> aus denen wir die zentrale Hindernis-DB für Großraum- & Schwertransporte (GST) füllen können —
> **50+ Quellen, ~100 % DE-Abdeckung**, plus eine **Hierarchie-/Priorisierungs-Logik** für den
> Fall, dass dieselbe Info aus mehreren Quellen kommt. Rechte werden später separat besorgt —
> hier wird **alles** gelistet, der Zugangs-/Lizenzstatus aber ehrlich markiert.

## Ergebnis in Zahlen

- **~140 Einzelquellen** katalogisiert (Ziel 50+ deutlich übertroffen).
- **Abdeckung:** Bund + **alle 16 Bundesländer** + ~22 Großstädte/kommunale Aggregatoren + OSM +
  5 kommerzielle Anbieter + Geodaten-Standards. → **~100 % Flächenabdeckung DE** für die
  *temporären* Daten; *dauerhafte* Bauwerksdaten sind die strukturelle Lücke (s.u.).
- Endpunkte wo möglich **live verifiziert** (GetCapabilities / curl 200 / Doku). Unsichere stehen
  als `apiEndpunkt: null` + `verifiziert: zu-bestätigen` — **keine erfundenen URLs**.

## Die Detail-Kataloge

| Datei | Bereich | Quellen | Reifegrad (offen & verifiziert) |
|---|---|---|---|
| [`quellen-bund.md`](./quellen-bund.md) | Bund/Federal (Autobahn-API, BASt, Mobilithek, WSV, DB, GDI-DE) | 12 | hoch (Autobahn-API), Rest teils gated |
| [`quellen-schwertransport-aggregatoren.md`](./quellen-schwertransport-aggregatoren.md) | VEMAGS, Mobilithek/DATEX II, Brücken-/Bauwerksdaten | 13 | gemischt (beste Daten gated) |
| [`quellen-laender-sued.md`](./quellen-laender-sued.md) | BW, BY | 15 | hoch (MobiData-BW, BAYSIS) |
| [`quellen-laender-west.md`](./quellen-laender-west.md) | NRW, HE, RP, SL | 14 | hoch (Straßen.NRW, GST-Karte NRW/HE) |
| [`quellen-laender-nord.md`](./quellen-laender-nord.md) | NI, HB, HH, SH | 22 | sehr hoch (Hamburg = GST-Routen-WFS!) |
| [`quellen-laender-ost.md`](./quellen-laender-ost.md) | BE, BB, MV, SN, ST, TH | 32 | hoch (Berlin VIZ, Sachsen, MV) |
| [`quellen-kommunal.md`](./quellen-kommunal.md) | Großstädte + übertragbare Muster | 22 | hoch (München, Karlsruhe, Rostock-GST) |
| [`quellen-osm-geodaten-kommerziell.md`](./quellen-osm-geodaten-kommerziell.md) | OSM/Overpass, INSPIRE/WFS, PTV/HERE/TomTom/ORS | ~12 | OSM offen, kommerziell Free-Tier |
| [`hierarchie-priorisierung.md`](./hierarchie-priorisierung.md) | **Priorisierungs-/Konflikt-Logik** (Konzept) | — | Konzept fertig |

## 7 Kern-Erkenntnisse (das Wichtigste)

1. **Zwei Datenwelten, ungleich offen.** *Temporäre* Daten (Baustellen, Sperrungen,
   Verkehrsmeldungen) sind in DE **breit offen & maschinenlesbar** — Autobahn-API,
   MobiData-BW, Hamburg, Berlin VIZ, München, NRW, MV, Sachsen u.v.m., plus DATEX II über
   Mobilithek. *Dauerhafte* Bauwerksrestriktionen (Brücken-**Traglast**, **lichte Höhe**,
   **Achslast**) — fachlich das Wertvollste für GST — sind **fast nirgends offen**.
2. **VEMAGS ist die fachliche Goldquelle, aber kein offener Feed.** Das bundesweite
   GST-Genehmigungssystem (Hessen Mobil, >90 % aller Genehmigungen) hat Bauwerksstatik +
   freigegebene Routen. Einzige technische Tür ist die `Xvemags`-SOAP-Schnittstelle für den
   **Antrags-Workflow** — kein Restriktions-Pull. → **Strategisch als Drittsystem/Behörden-Deal
   andocken** (BMDV-Projekt „GST 4.0" treibt genau das). Höchste Prio für Max' Rechte-Beschaffung.
3. **Mobilithek = nationaler Backbone für temporäre Daten — aber gated.** Aggregiert DATEX II
   aller Länder + Bund. Zugang: Registrierung + Zertifikat + meist **Nutzungsvereinbarung pro
   Datensatz**. Kein globaler Endpunkt, Broker-Modell. Lohnt sich für flächendeckende
   Baustellendaten ohne 16 Einzel-Connectoren.
4. **Offene Sofort-Quellen ohne Auth** (Prototyp heute baubar): Autobahn-API (BAB), **MobiData-BW**
   (Musterfeed: DATEX/GeoJSON/CIFS/WFS), **Hamburg** (eigener **GST-Routen-WFS** + Brücken + Baustellen),
   **Berlin VIZ** (GeoJSON-Baustellen), **München/Karlsruhe/Dortmund/Düsseldorf** (Baustellen-GeoJSON),
   **MV/Sachsen** (Baustellen-WFS), **Rostock** (GST-Wege + gesperrte Bauwerke, CC0).
5. **OSM trägt die offene Basis — mit einer kritischen Lücke.** Live-Counts DE: `maxheight` ~105 k,
   `maxweight` ~87 k, `hgv` ~83 k (gut), aber `maxwidth` ~15 k und **`maxaxleload` nur ~2,3 k**
   (zu dünn für Brückenstatik). ODbL. Gut als Basis-Layer + Cross-Check, nicht als alleinige
   Bauwerksquelle.
6. **Kommerziell als Veredelung.** PTV / HERE / TomTom / OpenRouteService / GraphHopper haben die
   beste GST-Attributtiefe (Tunnelklassen, Achslast, Gefahrgut, Zeitfenster) mit großzügigen
   Free-Tiers — ideal als Cross-Check/Lückenfüller, nicht als Primärquelle (Lizenzbindung).
7. **„Land > Bund" stimmt so nicht** — siehe Hierarchie-Logik: Vorrang nach **Baulastträger /
   Straßenklasse**. Für **Bundesautobahnen ist die Autobahn GmbH des Bundes autoritativ**, nicht
   das Land; Land ist genauer nur für L-/K-/Gemeindestraßen.

## Anbindungs-Priorität (Vorschlag — wenn implementiert wird)

**Welle 1 — offen, verifiziert, sofort (kein Rechte-Aufwand):**
Autobahn-API (BAB bundesweit) · MobiData-BW · Hamburg (GST-Routen + Baustellen + Brücken) ·
Berlin VIZ · München · MV · Sachsen · Rostock-GST · OSM/Overpass (Basis-Layer).

**Welle 2 — offen, aber Parsing/Verifikation nötig:**
restliche Landes-Baustellen-WFS (BW/BY/NRW/NI/SH/BB/TH/…) · kommunale CKAN/Opendatasoft/GeoServer
nach den **übertragbaren Mustern** (ein Connector-Template deckt viele Städte) · GST-Negativkarten
NRW/Hessen/Sachsen (Karten/PDF → strukturieren).

**Welle 3 — Rechte/Deal nötig (Max besorgt Zugang):**
**Mobilithek** (DATEX-II-Vollabdeckung) · **VEMAGS / SIB-Bauwerke** (Brückenstatik) ·
NC-lizenzierte Feeds (VMZ Bremen, LSBB Sachsen-Anhalt) · Länder ohne offene GST-Karte
(RP, Saarland, Brandenburg, MV, Sachsen-Anhalt, Thüringen) per Landesbetrieb-Anfrage.

## Hierarchie-/Priorisierungs-Logik (Kurzfassung)

Vollständig in [`hierarchie-priorisierung.md`](./hierarchie-priorisierung.md). Kern:

- **5 geordnete Prinzipien:** (A) **Baulastträger/Straßenklasse** (BAB→Autobahn GmbH, B→Bund/Land,
  L→Land, K→Kreis, Gemeinde→Kommune) → (B) **amtlich > Aggregator > OSM > kommerziell** →
  (C) **Aktualität** (jüngeres Gültig-/Abrufdatum, DATEX-Version) → (D) **Geo-/Wert-Präzision** →
  (E) **GST-Bauwerksstatik (VEMAGS/BASt SIB)** = oberste Autorität für Brücken/Höhen/Lasten.
- **Tie-Break-Kette (implementierbar):** GST-Bauwerks-Gate → Baulastträger-Match → Provenienz-Tier
  → Aktualität → Genauigkeit → Konservativität (restriktivster Wert) → deterministisch (kleinste fachId).
- **Quellen-Tiers T0–T6, aber straßenklassen-moduliert:** ein Landesfeed ist T1 auf einer L-Straße,
  nur ergänzend auf einer BAB. Darum steht Baulastträger VOR der reinen Tier-Reihung.
- **Dedupe:** „dasselbe Hindernis" = Kategorie + Zeitfenster-Überlappung + Straßen/km-Bezug (±200 m)
  + Geo (~120 m) + Richtung; Re-Import exakt über `externeId`/DATEX-`situationId`. Mergen statt
  doppeln, verdrängte Belege als Corroboration behalten. Baustelle + Brücke am selben Ort = **zwei**
  Hindernisse, kein Konflikt.
- **restriktiver vs. autoritativer (Empfehlung):** Fehlerkosten sind asymmetrisch (zu großzügig =
  Brückenschaden/Haftung). Bei **Bauwerks-/Sicherheitswerten gewinnt die autoritativste Quelle
  (VEMAGS/BASt T0) — der Wert IST der sichere Wert.** Fehlt T0, dann restriktivster Drittwert, aber
  ehrlich als „gemeldet/ungeprüft" geflaggt. Bei **operativen Baustellen gewinnt der autoritative
  Baulastträger-Feed**; Restriktivität nur als letzter Tie-Breaker (sonst sperren veraltete
  Geistermeldungen freie Routen). Konservativität ist das Netz für *fehlende* Autorität, kein Ersatz.

## Abdeckungslücken & Rechte-Beschaffung (für Max)

| Lücke | Wo | Weg zum Zugang |
|---|---|---|
| **Brücken-Traglast / lichte Höhe / Achslast** (maschinenlesbar) | bundesweit | BASt **SIB-Bauwerke** (Behördensystem) bzw. **VEMAGS** — Behörden-/Drittsystem-Deal |
| **VEMAGS-Routen-/Bauwerksdaten** | Bund/Länder | Hessen Mobil / BMDV „GST 4.0" — lesender Zugang anfragen |
| **Flächendeckende temporäre Daten** | alle Länder | **Mobilithek**-Registrierung + Nutzungsvereinbarung je Feed |
| **GST-Negativkarte fehlt offen** | RP, SL, BB, MV, ST, TH | Landesbetrieb/LBM/LfS-Anfrage |
| **NC-Lizenz (nicht kommerziell)** | VMZ Bremen, LSBB Sachsen-Anhalt | kommerzielle Nutzungsvereinbarung einholen |

## Register-Korrekturen (aus der Recherche)

- `quellenId 0002` aktuell „SIB-Bauwerke" → besser **„BASt Brückenkarte"** (das ist die offene
  Variante; SIB-Bauwerke selbst ist nicht downloadbar).
- **MobiData-BW** als eigene offene Quelle ins Register aufnehmen (Musterfeed, DL-DE/BY-2.0).
- Hinweis: **mCLOUD** ist seit 2022 durch **Mobilithek** abgelöst; **Berlin FIS-Broker** wurde
  2025-12-01 abgeschaltet → alte `fbinter.stadt-berlin.de`-URLs auf `gdi.berlin.de` neu auflösen.

## Nächste Schritte (NICHT Teil dieser Session)

1. Max entscheidet, für welche Welle-3-Quellen er Rechte beschafft (VEMAGS + Mobilithek = größter Hebel).
2. Danach (separate Session): Connector-Template-Design + Quellen-Register in `docs/HINDERNIS-DATENFORMAT.md`
   gegen diese Kataloge erweitern + Hierarchie-Logik als Engine-Modul spezifizieren.
3. Erst dann Implementierung (Connectoren, Dedupe/Priorisierung) — **bewusst hier noch nicht**.
