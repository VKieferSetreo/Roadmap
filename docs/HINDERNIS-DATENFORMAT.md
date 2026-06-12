# Hindernis-Datenformat — Draft v0.1 (2026-06-12)

> Entwurf: Welche Informationen brauchen wir pro Hindernis für eine präzise Live-Nutzung?
> Grundlage für das Ziel-Format, in das die realen Quellen (Mobilithek, Autobahn-API,
> BASt, kommunale Meldungen, …) beim Import in unsere DB normalisiert werden.
> Die Tabelle `obstacles` trägt heute schon `fach_id`, `quellen_id`, `realer_start`
> sowie `attrs` (jsonb) — der Draft definiert, was dort fachlich hineingehört.

## 1. Fachliche ID (Max-Schema, festgelegt)

```
<INDEX:4><QUELLE:4><START:DDMMYY>   →  z.B. 00030009010126
```

| Segment | Stellen    | Bedeutung                                                           | Beispiel              |
| ------- | ---------- | ------------------------------------------------------------------- | --------------------- |
| INDEX   | 4          | laufende Nummer **innerhalb der Quelle** (Aufzählung der Meldungen) | `0003` = dritte Info  |
| QUELLE  | 4          | Quellen-ID aus dem Quellen-Register (s. §2)                         | `0009` = Mobilithek   |
| START   | 6 (DDMMYY) | Datum, an dem das Hindernis **real greift** (z.B. Baustellenstart)  | `010126` = 01.01.2026 |

Eigenschaften:

- **Menschenlesbar + sprechend**: Quelle und realer Beginn sind direkt ablesbar.
- Die DB behält zusätzlich ihre technische UUID als Primärschlüssel (stabil bei
  Korrekturen) — die fachliche ID ist Anzeige-/Referenz-Schlüssel (unique-Index empfohlen).
- **Offen zu klären:** Zählt INDEX pro Quelle _global fortlaufend_ oder _pro Starttag_?
  Empfehlung: global fortlaufend pro Quelle (einfach, kollisionsfrei, 9999 Meldungen
  pro Quelle bevor erweitert werden muss).

## 2. Quellen-Register (neue kleine Tabelle `quellen`)

Jede Quelle bekommt eine feste 4-stellige ID:

| quellenId | Name                                  | Typ                                 | Abruf         | Lizenz/Hinweis |
| --------- | ------------------------------------- | ----------------------------------- | ------------- | -------------- |
| 0001      | Autobahn-API (verkehr.autobahn.de)    | API, Baustellen/Sperrungen BAB      | täglich       | offen          |
| 0002      | BASt SIB-Bauwerke                     | Datensatz, Brücken (Höhe/Traglast)  | quartalsweise | offen          |
| 0003      | OSM / Overpass                        | API, Tunnel/Bahnübergänge/maxheight | monatlich     | ODbL           |
| 0009      | Mobilithek (DATEX II)                 | API, Baustellen/Verkehrslagen       | täglich       | je Datensatz   |
| 0100+     | kommunale Meldungen / manuell erfasst | manuell                             | ad hoc        | intern         |

Pro Quelle zusätzlich pflegen: `endpointUrl`, `abrufIntervall`, `letzterAbruf`,
`ansprechpartner` — damit Importe nachvollziehbar und wiederholbar sind.

## 3. Pflichtfelder pro Hindernis

| Feld        | Typ        | Pflicht | Anmerkung                                                                                    |
| ----------- | ---------- | ------- | -------------------------------------------------------------------------------------------- |
| fachId      | string(14) | ✓       | §1, unique                                                                                   |
| quellenId   | string(4)  | ✓       | FK ins Quellen-Register                                                                      |
| kategorie   | enum       | ✓       | bruecke, engstelle, baustelle, gewicht, bahnuebergang, kreisverkehr, ampel, steigung, tunnel |
| name        | string     | ✓       | sprechend, z.B. „Brücke Nienburg B215"                                                       |
| lat / lng   | double     | ✓       | WGS84-Punkt (Referenzpunkt)                                                                  |
| realerStart | date       | ✓       | ab wann greift es real (= ID-Bestandteil)                                                    |
| gueltigBis  | date       | –       | leer = unbefristet; abgelaufen → Analyse ignoriert                                           |
| aktiv       | bool       | ✓       | manuelles Aus ohne Löschen                                                                   |

## 4. Kategorie-Grenzwerte (`attrs`, nur die relevanten je Kategorie)

| Kategorie        | Grenzwerte (attrs-Keys)                                    |
| ---------------- | ---------------------------------------------------------- |
| bruecke / tunnel | `maxHoeheM` · `maxGewichtT` · `maxAchslastT`               |
| engstelle        | `maxBreiteM`                                               |
| gewicht          | `maxGewichtT` · `maxAchslastT`                             |
| baustelle        | `restbreiteM` · ggf. `maxHoeheM`                           |
| steigung         | `steigungPct` · `laengeM` (Steigungsstrecke)               |
| kreisverkehr     | `radiusM` (Außenradius)                                    |
| bahnuebergang    | `maxHoeheM` (Oberleitung) · `anmeldungErforderlich` (bool) |
| ampel            | `maxHoeheM` (Signalausleger)                               |

## 5. Geometrie — wichtig für Genauigkeit

Heute: ein Punkt (lat/lng) + Korridor-Matching (120 m). Für echte Präzision brauchen wir
zusätzlich optional:

- **`geometrie` (GeoJSON, optional):** LineString für ausgedehnte Hindernisse
  (Baustellen-Abschnitte, Steigungsstrecken, Engstellen über mehrere 100 m).
  Matching dann Segment-gegen-Segment statt Punkt-im-Korridor.
- **`richtung` (optional):** `beide | hin | rueck` bzw. Fahrtrichtungs-Bezug
  (eine Baustelle betrifft oft nur eine Richtungsfahrbahn).
- **`strassenRef`:** normalisiert „A7", „B215", + `kmVon`/`kmBis` der Straße, wenn
  die Quelle Stationierung liefert (BAB-Kilometrierung).

## 6. Quellen-Nachweis & Lebenszyklus

| Feld                           | Zweck                                                                       |
| ------------------------------ | --------------------------------------------------------------------------- |
| `quelle.url`                   | Deep-Link auf die Original-Meldung (klickbar im Fund)                       |
| `quelle.abgerufenAm`           | wann haben WIR den Stand gezogen                                            |
| `quelle.externeId`             | Original-ID der Quelle (DATEX-II situationId etc.) — Dedupe bei Re-Imports! |
| `status`                       | `gemeldet → bestätigt → aufgehoben` (aufgehoben ≠ gelöscht)                 |
| `geaendertAm` / `geaendertVon` | Audit bei manuellen Korrekturen                                             |

**Update-Mechanik beim Re-Import:** Match über (`quellenId`, `quelle.externeId`) →
Update statt Duplikat; Felder die manuell überschrieben wurden, nicht stillschweigend
zurücksetzen (Flag `manuellKorrigiert`).

## 7. Offene Fragen an die Quellen-Sichtung

1. INDEX-Zählung (s. §1) — global pro Quelle ok?
2. Liefern die Quellen verlässlich Höhen-/Breiten-Grenzwerte oder müssen wir
   BASt (Bauwerke) mit Mobilithek (Baustellen) kombinieren (zwei Hindernisse am selben Ort)?
3. Richtungsbezug: trennen wir Richtungsfahrbahnen als eigene Einträge oder ein Eintrag
   mit `richtung`-Feld?
4. Wie gehen wir mit zeitlich wiederkehrenden Sperrungen um (Nachtbaustellen) —
   `gueltigVon/Bis` reicht nicht für „werktags 20–6 Uhr"? (Vorschlag: optionales
   `zeitfenster`-Feld, erst bei Bedarf.)
