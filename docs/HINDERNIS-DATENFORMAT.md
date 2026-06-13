# Hindernis-Datenformat — v1.0 (2026-06-13)

> **Entscheidungsvorlage.** Welches Format wollen wir für die zentrale `obstacles`-DB?
> Gegenüber dem Draft v0.1 jetzt **geerdet an der Quellen-Realität** (API-Katalog `../API/`,
> ~140 Quellen) und an der **Hierarchie-/Priorisierungs-Logik** (`research/hierarchie-priorisierung.md`).
> Schema-Änderungen sind **additiv** zum heutigen `obstacles` — kein Bruch. Die vorgeschlagene
> Migration (§11) ist **noch NICHT angewandt** (Design-Phase).

---

## 0. Was die Research dem Format aufzwingt (Designprinzipien)

1. **Zwei Datenwelten, ein Modell.** Quellen liefern entweder *temporäre Ereignisse* (Baustellen,
   Sperrungen — Autobahn-API, DATEX II, Landes-WFS) ODER *dauerhafte Bauwerksrestriktionen*
   (Brücken-/Tunnel-Limits — BAYSIS, SIB, OSM, Hessen-Brückenliste). Beide sind dasselbe Konzept
   „Hindernis auf der Strecke" → **eine Tabelle**, unterschieden durch ein Feld `befristung`
   (`dauerhaft` | `temporaer`). Beide am selben Ort sind **zwei Hindernisse**, kein Konflikt.
2. **Grenzwerte stecken teils in Freitext.** Autobahn-API liefert `display_type: WEIGHT_LIMIT_35`
   + Tonnage im `description[]`-Array; BAYSIS liefert strukturiert (`Höhenbeschränkung`,
   `Gewichtsbeschränkung`, `Grundsätzliche_Schwertransportsperre`). → Das Format braucht
   **strukturierte `attrs`-Grenzwerte** UND die **Roh-Quelldaten** (`roh`), damit verbessertes
   Parsing nicht neu ziehen muss.
3. **Deutscher Straßenbezug = ASB-Stationierung.** BAYSIS/Hessen/viele WFS referenzieren über
   **Netzknoten (VNK/NNK) + Station**, nicht nur lat/lng. Das ist das stärkste Dedupe-/Match-Indiz
   und nötig für Baulastträger-Bestimmung → eigene Felder.
4. **Priorisierung braucht Provenienz-Felder.** Quelle→`tier`, Eintrag→`strassenklasse`/
   `baulasttraeger`, Konflikt-Auflösung→`cluster_id`/`is_master`/`rangscore`/`confidence`.
5. **Ausgedehnte Hindernisse sind Linien.** Baustellen-/Steigungs-/Engstellen-Abschnitte sind
   LineStrings, nicht Punkte → optionale `geom` (GeoJSON; **kein PostGIS**, bewusst).

---

## 1. Fachliche ID (festgelegt, Q1 beantwortet)

```
<INDEX:4><QUELLE:4><START:DDMMYY>     →  z.B. 00030009010126
```

| Segment | Stellen | Bedeutung |
|---|---|---|
| INDEX | 4 | laufende Nummer **global pro Quelle** (nicht pro Starttag) |
| QUELLE | 4 | Quellen-ID aus dem Register (§5) |
| START | 6 | `realer_start` als DDMMYY (Datum, ab dem es real greift) |

**Entscheidung Q1:** INDEX zählt **global fortlaufend pro Quelle** (einfach, kollisionsfrei;
Vergabe via `pg_advisory_xact_lock` + `MAX(index)+1` je Quelle — wie heute in `obstaclesRepo`).
9999 reicht je Quelle; bei Überlauf 5-stellig (Schema verträgt es, da `text`). UUID bleibt
technischer PK; `fach_id` ist Anzeige-/Referenz-Schlüssel (`UNIQUE`).

---

## 2. Kern-Entität `obstacles` — Zielschema (vollständig)

> **Fett** = heute schon vorhanden · _kursiv_ = additiv vorgeschlagen (§11).

| Feld | Typ | Pflicht | Rolle |
|---|---|---|---|
| **id** | uuid PK | ✓ | technischer Schlüssel (stabil bei Korrekturen) |
| **fach_id** | text(14) UNIQUE | ✓ | §1 |
| **quellen_id** | text(4) FK→quellen | ✓ | Herkunft + trägt `tier` |
| **externe_id** | text | (✓ bei Import) | Original-ID der Quelle (DATEX `situationId`, BAYSIS `OBJECTID`) → Re-Import-Dedupe; UNIQUE(quellen_id, externe_id) |
| **kategorie** | enum | ✓ | s. §3 |
| _befristung_ | text `dauerhaft\|temporaer` | ✓ | trennt Bauwerk von Ereignis |
| **name** | text | ✓ | sprechend, z.B. „UF B83 Brücke Bebra" |
| **beschreibung** | text | – | Freitext der Quelle |
| **lat / lng** | double | ✓ | WGS84-Referenzpunkt (immer gesetzt, auch bei Linie) |
| _geom_ | jsonb (GeoJSON) | – | LineString/Polygon für ausgedehnte Hindernisse |
| _richtung_ | text `beide\|hin\|rueck` | – | Richtungsfahrbahn-Bezug (Default `beide`) |
| **strassen_ref** | text | – | normalisiert „A7", „B215", „L3020" |
| _strassenklasse_ | text `A\|B\|L\|K\|G\|sonstige` | – | aus `strassen_ref` abgeleitet → Baulastträger |
| _baulasttraeger_ | text `bund\|land\|kreis\|kommune` | – | für Prinzip A (Vorrang) |
| _vnk / nnk_ | text | – | ASB-Netzknoten (von/nach) |
| _station_von / station_bis_ | text | – | ASB-Station / BAB-Kilometrierung |
| **attrs** | jsonb | ✓ | Grenzwerte (§4) |
| **gueltig_von / gueltig_bis** | date | – | Gültigkeitszeitraum (leer bis = unbefristet) |
| **realer_start** | date | ✓ | ab wann real wirksam (= fach_id-Teil) |
| _zeitfenster_ | jsonb | – | wiederkehrend (Nachtbaustelle), §8 |
| **quelle** | jsonb | – | `{name,url,abgerufenAm}` — Deep-Link im Fund |
| _roh_ | jsonb | – | **Roh-Quelldatensatz** (Re-Parsing ohne Neu-Abruf) |
| _status_ | text `gemeldet\|bestaetigt\|aufgehoben` | ✓ | Lebenszyklus (aufgehoben ≠ gelöscht) |
| _manuell_korrigiert_ | bool | ✓ | manuelle Edits beim Re-Import nicht überschreiben |
| _cluster_id_ | uuid | – | gruppiert gemergte Einträge desselben realen Hindernisses |
| _is_master_ | bool | ✓ | der in der Analyse sichtbare Master des Clusters |
| _rangscore / confidence_ | numeric | – | gecachte Priorität/Vertrauen (§9) |
| **tenant_id** | uuid FK | – | NULL = global (Connectoren), gesetzt = Kunden-Eintrag |
| **aktiv** | bool | ✓ | manuelles Aus ohne Löschen |
| **demo** | bool | ✓ | Seed-/Demo-Daten |
| **created_at / updated_at** | timestamptz | ✓ | Audit |
| _abgerufen_am_ | timestamptz | – | wann WIR diesen Stand zogen (Prinzip C Aktualität) |

---

## 3. Kategorien (enum)

Heute: `bruecke, engstelle, baustelle, gewicht, bahnuebergang, kreisverkehr, ampel, steigung, tunnel`.

**Vorschlag additiv:** `sperrung` (Voll-/Teilsperrung — Autobahn-API `closure` liefert das als
eigenen Typ, fachlich ≠ Baustelle). Damit 10 Kategorien. (Optional später `lkw_verbot`, `gefahrgut`
— erst wenn eine Quelle es liefert; OSM `hgv`/`hazmat` könnte das speisen.)

---

## 4. `attrs` — normalisierte Grenzwert-Keys

| Kategorie | attrs-Keys |
|---|---|
| bruecke / tunnel | `maxHoeheM` · `maxGewichtT` · `maxAchslastT` · `brueckenklasse` (z.B. „30/30", „60") · `grundsaetzlicheGstSperre` (bool) |
| engstelle | `maxBreiteM` · `restbreiteM` |
| gewicht | `maxGewichtT` · `maxAchslastT` |
| baustelle / sperrung | `restbreiteM` · `maxHoeheM`? · `vollsperrung` (bool) |
| steigung | `steigungPct` · `laengeM` |
| kreisverkehr | `radiusM` (Außenradius) · `befahrbarkeitGst` |
| bahnuebergang | `maxHoeheM` (Oberleitung) · `anmeldungErforderlich` (bool) |
| ampel | `maxHoeheM` (Signalausleger) |

**Per-Grenzwert-Provenienz (optional, additiv):** Damit ein Cluster *feldweise* die stärkste
Quelle tragen kann, dürfen Keys `<key>_quelle` + `<key>_confidence` daneben stehen, z.B.
`{ "maxGewichtT": 30, "maxGewichtT_quelle": "0011", "maxGewichtT_confidence": 0.95 }`.
Einheiten sind **fest** (M = Meter, T = Tonnen, Pct = Prozent) — Werte numerisch, nie Freitext.

---

## 5. Quellen-Register (`quellen`) + Tier

Heute: `id, name, typ, endpoint_url, abruf_intervall, letzter_abruf, aktiv`.
**Additiv:** `tier` (T0–T6), `provenienz` (amtlich|aggregator|crowdsourced|kommerziell),
`lizenz`, `ansprechpartner`.

| Tier | Klasse | Quellen (aus Katalog) |
|---|---|---|
| **T0** | GST-/Bauwerksautorität | VEMAGS, BASt SIB-Bauwerke |
| **T1** | Baulastträger direkt | Autobahn-API (BAB), Landes-SVZ/-DATEX (B/L/K), BAYSIS-Bauwerke |
| **T2** | amtlicher Aggregator | Mobilithek (DATEX II national) |
| **T3** | amtl. Geobasis abgeleitet | Landes-WFS Verkehrsnetz, GST-Negativkarten |
| **T4** | kommunal | Stadt-Baustellenfeeds |
| **T5** | crowdsourced | OSM/Overpass |
| **T6** | kommerziell-abgeleitet | (derzeit keine — kostenpflichtige raus) |

> **Wichtig:** Tier gilt **relativ zur Straßenklasse** (ein Landesfeed ist T1 auf L, nur ergänzend
> auf BAB). Darum steht in der Tie-Break-Kette **Baulastträger-Match VOR** der Tier-Reihung.
> Die Quellen-IDs (4-stellig) müssen ggü. den ~140 Katalog-Quellen erweitert werden — Vorschlag:
> Blöcke `0001–0099` Bund, `01xx` Länder, `02xx` Kommunal, `03xx` OSM/Sonstige, `0100`-Sonderfall
> bleibt Kunden-Eintrag. (Genaue Nummern-Vergabe = eigener Schritt beim Connector-Bau.)

---

## 6. Geometrie + Straßenbezug

- **Punkt** (`lat`/`lng`): immer gesetzt (Referenz, Karten-Pin, schnelles Bbox-Matching).
- **`geom`** (GeoJSON, optional): LineString/Polygon für ausgedehnte Hindernisse → Matching
  Segment-gegen-Segment statt nur Punkt-im-Korridor.
- **ASB-Stationierung** (`vnk`/`nnk`/`station_von`/`station_bis`): das amtliche deutsche
  Netzreferenz-System. Liefern BAYSIS, Hessen-Brückenliste, viele Landes-WFS. **Stärkstes
  Dedupe-Indiz** (zwei Quellen mit gleichem VNK/NNK+Station = sehr wahrscheinlich dasselbe Bauwerk).
- **`strassenklasse`** aus `strassen_ref` ableitbar (Präfix A/B/L/K) → bestimmt `baulasttraeger`
  → Prinzip A der Priorisierung.

---

## 7. Zeitliche Gültigkeit

- `realer_start` (Pflicht) = ab wann wirksam (fach_id-Bestandteil).
- `gueltig_von`/`gueltig_bis` = Zeitfenster; abgelaufen → Engine ignoriert (heute schon so:
  `wirksamAb > zEnde → kein Fund`).
- **Dauerhafte Bauwerke:** `befristung=dauerhaft`, `gueltig_bis` leer.

## 8. Wiederkehrende Sperrungen (Q4 beantwortet)

Nachtbaustellen („werktags 20–6 Uhr") brauchen mehr als `von/bis`. **Entscheidung:** optionales
`zeitfenster`-jsonb, **erst befüllen wenn eine Quelle es liefert** (vorerst meist leer):
```json
{ "wochentage": ["Mo","Di","Mi","Do","Fr"], "von": "20:00", "bis": "06:00" }
```
Leeres `zeitfenster` = durchgehend gültig im `gueltig_von/bis`-Rahmen.

---

## 9. Provenienz / Priorisierung / Dedupe (aus Hierarchie-Doku)

- **Dedupe-Match** „dasselbe Hindernis": gleiche Kategorie **und** Zeitfenster-Überlappung **und**
  Straßen/km-Bezug (VNK/NNK+Station, ±200 m) **und** Geo (~120 m) **und** Richtung. Re-Import
  exakt über `(quellen_id, externe_id)`.
- **Beim Match:** mergen → ein `cluster_id`, **ein** `is_master=true` (höchster `rangscore`),
  Rest `is_master=false` (bleibt als Beleg/Corroboration, nicht gelöscht). Engine sieht nur Master.
- **rangscore** (gewichtet: Baulastträger-Match ≫ Tier > Aktualität > Genauigkeit) + **confidence**
  (Tier × Frische × Corroboration × Struktur) — gecacht, beim Import/Re-Cluster neu berechnet.
- **Wert-Konflikt:** Bauwerks-/Sicherheitswert → **autoritativste Quelle (T0) gewinnt**; fehlt T0
  → restriktivster Wert mit `status` ehrlich gekennzeichnet. Operativ (Baustelle) → autoritativer
  Baulastträger-Feed gewinnt. (Voll in `research/hierarchie-priorisierung.md`.)
- **`manuell_korrigiert`**: manuelle Edits werden beim Re-Import nicht stillschweigend überschrieben.

---

## 10. Quell-Format → Zielfeld-Mapping (Beispiele aus dem Katalog)

| Quelle | liefert | → unser Feld |
|---|---|---|
| **Autobahn-API** `/closure` | `display_type: WEIGHT_LIMIT_35`, `description[]` (Tonnage-Freitext), `coordinate`, `identifier` | kategorie=`gewicht`/`sperrung`, attrs.maxGewichtT (geparst), lat/lng, externe_id; `roh`=ganzer Datensatz |
| **DATEX II** (Mobilithek) | `situationRecord` (Roadworks/NetworkRestriction), `situationId`, `version`, `validity` | kategorie, externe_id=situationId, gueltig_von/bis, abgerufen_am; befristung=temporaer |
| **BAYSIS Bauwerke** | `Höhenbeschränkung`, `Gewichtsbeschränkung`, `Brückenklasse`, `Grundsätzliche_Schwertransportsperre`, `VNK/NNK/Station`, `Baulast` | kategorie=`bruecke`/`tunnel`, attrs.*, vnk/nnk/station_*, baulasttraeger, befristung=dauerhaft |
| **OSM/Overpass** | `maxheight`/`maxweight`/`maxwidth`/`maxaxleload`, `bridge`/`tunnel`, geometry | attrs.* (T5/niedrige confidence), geom, befristung=dauerhaft |
| **Hessen-Brückenliste** (PDF→CSV) | Bauwerks-Nr, Straße UEF/UF, VNK/NNK | kategorie=`bruecke`, attrs.grundsaetzlicheGstSperre=true, vnk/nnk |
| **Landes-WFS (GeoJSON)** | LineString-Baustellen, Properties | geom, kategorie=`baustelle`, befristung=temporaer |

---

## 11. Vorgeschlagene Migration 005 (additiv — NOCH NICHT angewandt)

```sql
-- obstacles: Geometrie, Straßenbezug, Provenienz/Cluster, Lebenszyklus, Roh-Daten
ALTER TABLE obstacles
  ADD COLUMN befristung        text NOT NULL DEFAULT 'temporaer'
             CHECK (befristung IN ('dauerhaft','temporaer')),
  ADD COLUMN geom              jsonb,
  ADD COLUMN richtung          text NOT NULL DEFAULT 'beide'
             CHECK (richtung IN ('beide','hin','rueck')),
  ADD COLUMN strassenklasse    text CHECK (strassenklasse IN ('A','B','L','K','G','sonstige')),
  ADD COLUMN baulasttraeger    text CHECK (baulasttraeger IN ('bund','land','kreis','kommune')),
  ADD COLUMN vnk               text,
  ADD COLUMN nnk               text,
  ADD COLUMN station_von       text,
  ADD COLUMN station_bis       text,
  ADD COLUMN zeitfenster       jsonb,
  ADD COLUMN roh               jsonb,
  ADD COLUMN status            text NOT NULL DEFAULT 'bestaetigt'
             CHECK (status IN ('gemeldet','bestaetigt','aufgehoben')),
  ADD COLUMN manuell_korrigiert boolean NOT NULL DEFAULT false,
  ADD COLUMN cluster_id        uuid,
  ADD COLUMN is_master         boolean NOT NULL DEFAULT true,
  ADD COLUMN rangscore         numeric,
  ADD COLUMN confidence        numeric,
  ADD COLUMN abgerufen_am      timestamptz;

CREATE INDEX obstacles_cluster_idx     ON obstacles (cluster_id);
CREATE INDEX obstacles_master_aktiv_idx ON obstacles (is_master, aktiv);
CREATE INDEX obstacles_strklasse_idx   ON obstacles (strassenklasse);

-- quellen: Tier + Provenienz
ALTER TABLE quellen
  ADD COLUMN tier        text CHECK (tier IN ('T0','T1','T2','T3','T4','T5','T6')),
  ADD COLUMN provenienz  text CHECK (provenienz IN ('amtlich','aggregator','crowdsourced','kommerziell')),
  ADD COLUMN lizenz      text,
  ADD COLUMN ansprechpartner text;

-- enum-Erweiterung 'sperrung': obstacles.kategorie ist heute ein CHECK-Constraint →
-- DROP/ADD CONSTRAINT mit erweiterter Liste (in der echten Migration ausformuliert).
```

Engine bleibt abwärtskompatibel: Felder sind nullable/defaulted; bestehende Demo-/Kunden-Daten
funktionieren weiter. Der Engine-Match nutzt `is_master AND aktiv` zusätzlich.

---

## 12. Beantwortete offene Fragen (aus v0.1 §7)

1. **INDEX-Zählung** → global fortlaufend pro Quelle (§1). ✅
2. **Grenzwerte aus einer oder mehreren Quellen?** → Beides: dauerhafte Bauwerksrestriktion
   (BAYSIS/SIB/OSM, `befristung=dauerhaft`) und temporäre Baustelle (DATEX/Autobahn,
   `befristung=temporaer`) am selben Ort sind **zwei Hindernisse** — kein Konflikt, Dedupe trennt
   sie über Kategorie. ✅
3. **Richtungsbezug** → **ein** Eintrag mit `richtung`-Feld (nicht zwei Fahrbahn-Einträge). ✅
4. **Wiederkehrende Sperrungen** → optionales `zeitfenster`-jsonb, erst bei Bedarf befüllt (§8). ✅

## 13. Offene Entscheidungen für Max

- **Kategorie `sperrung`** als 10. Kategorie aufnehmen? (Empfehlung: ja — Autobahn-API trennt es.)
- **Per-Grenzwert-Provenienz** (§4) jetzt schon vorsehen oder später? (Empfehlung: Struktur jetzt
  erlauben, Befüllung später beim Multi-Quellen-Merge.)
- **Quellen-ID-Nummernkreis** (§5): 4-stellige Blöcke Bund/Länder/Kommunal/OSM — Vergabe beim
  Connector-Bau finalisieren.
- Migration 005 anwenden = **nächster Schritt nach deinem OK** (jetzt bewusst nur Design).
