# Quellen-Hierarchie & Konfliktauflösung — Konzept (2026-06-13)

> **Zweck:** Dasselbe reale Hindernis (Baustelle, Brücken-Gewichtslimit, Engstelle) kommt
> potenziell aus mehreren Quellen — teils widersprüchlich. Dieses Dokument definiert ein
> begründetes, implementierbares Modell, **welche Quelle Vorrang hat** und **wie Konflikte
> aufgelöst werden**. Es ist der fachliche Unterbau für das Merging/Dedupe der zentralen
> `obstacles`-Tabelle (siehe `HINDERNIS-DATENFORMAT.md`).
>
> **Status:** Konzept / Entscheidungsvorlage. Keine Implementierung.

---

## 0. Die Kern-These vorweg (Antwort auf „Land > Bund?")

Max' Intuition „**Land > Bundesquelle, weil das Land genauer ist**" ist **NICHT pauschal richtig**
und darf so nicht hart verdrahtet werden. Der entscheidende Hebel ist nicht die Verwaltungsebene,
sondern **wer den Baulastträger / die fachliche Zuständigkeit für genau diese Straße hat**:

- Für **Bundesautobahnen (BAB)** ist seit 2021 die **Autobahn GmbH des Bundes** Träger der
  Straßenbaulast und betreibt das Netz operativ — sie ist hier die **autoritativste** Quelle,
  nicht das Land. Ein Landes-Feed über eine BAB ist allenfalls Ergänzung.
- Für **Bundesstraßen außerorts** liegt die Baulast beim Bund, aber die **Auftragsverwaltung**
  (Bau, Betrieb, Erhaltung) erfolgt durch die **Länder** (Landesbetriebe Straßenbau). Hier ist
  das Land faktisch die operativ näher dran sitzende, oft genauere Quelle.
- Für **Landesstraßen (L)** → Land, **Kreisstraßen (K)** → Kreis, **Gemeindestraßen** → Kommune.

> **Faustregel statt „Land vor Bund":** **Baulastträger-Vorrang** — die für die jeweilige
> Straßenklasse zuständige Stelle ist die primär autoritative Quelle. „Land genauer als Bund"
> stimmt für B/L/K/Gemeinde, ist aber für BAB falsch.

Quellen-Begründung: In Deutschland ist der Bund Straßenbaulastträger für Bundesautobahnen und
Bundesstraßen, die Länder für Landesstraßen, Kreise für Kreisstraßen, Gemeinden für
Gemeindestraßen ([Straßenbaulast, Wikipedia](https://de.wikipedia.org/wiki/Stra%C3%9Fenbaulast_(Deutschland))).
Die Autobahn GmbH plant/baut/betreibt/erhält die BAB; die Landesstraßenbaubehörden tun dies für
die übrigen Bundesstraßen im Auftrag des Bundes
([StMB Bayern, Aufgaben & Zuständigkeiten](https://www.stmb.bayern.de/vum/handlungsfelder/verkehrsinfrastruktur/aufgabenzustaendigkeiten/index.php)).

---

## 1. Prinzipien-Hierarchie (geordnet)

Diese fünf Prinzipien sind **nach absteigender Stärke** geordnet. Höhere Prinzipien schlagen
niedrigere (siehe §2 für die exakte Tie-Break-Kette). Zwei davon sind *Domänen-Sonderfälle*
(A und E), die anderen drei (B, C, D) sind generische Datenqualitäts-Achsen.

### Prinzip A — Zuständigkeit / Baulastträger nach Straßenklasse (PRIMÄR)
Die für die Straßenklasse zuständige Stelle ist die autoritative Quelle:

| Straßenklasse | Baulastträger / operativ zuständig | Autoritative Quelle(n) im Projekt |
| ------------- | ---------------------------------- | --------------------------------- |
| **BAB (A)** | Autobahn GmbH des Bundes | Autobahn-API (`0001`), VEMAGS/BASt für Bauwerke |
| **B außerorts** | Bund (Baulast) / Land (Auftragsverwaltung) | Landes-DATEX-Feeds via Mobilithek (`0009`) + VEMAGS/BASt |
| **B Ortsdurchfahrt** | Gemeinde (ab Einwohnerschwelle) / sonst Land | kommunale Meldung (`0100+`) bzw. Landesfeed |
| **L (Landesstraße)** | Land | Landes-DATEX-Feed via Mobilithek (`0009`) |
| **K (Kreisstraße)** | Kreis | Landes-/Kreis-Feed (`0009`/`0100+`) |
| **Gemeindestraße** | Kommune | kommunale Meldung (`0100+`) |

→ **Effekt:** Eine Baustelle auf der A7 wird primär von der Autobahn-API getragen, selbst wenn
ein Landesfeed dieselbe Stelle anders meldet. Eine Baustelle auf der L401 wird primär vom
Landesfeed getragen, nicht von einer bundesweiten Aggregation.

### Prinzip B — Provenienz-Klasse: amtlich > halböffentlich > crowdsourced > kommerziell-abgeleitet
Wenn A nicht greift (Straßenklasse unbekannt, oder zwei Quellen *desselben* Baulastträger-Rangs):

1. **Amtlich/autoritativ:** Baulastträger-Daten, VEMAGS/BASt-Bauwerksdaten, Autobahn-API,
   Landes-Straßenverkehrszentralen.
2. **Halböffentlich/aggregiert:** Mobilithek/MDM als nationaler Zugangspunkt — der Inhalt ist
   amtlich, aber durch die Aggregation eine Indirektion (Latenz, Feed-Vollständigkeit variiert
   je Land). Schwächer als der *direkte* Baulastträger-Feed, stärker als crowdsourced.
3. **Crowdsourced:** OSM/Overpass (`maxheight`, `maxweight`). Wertvoll als **Lückenfüller**, aber
   amateurerfasst, inkonsistent gepflegt, Werte oft geschätzt/gerundet → nie überschreibend.
4. **Kommerziell-abgeleitet:** TomTom/HERE/PTV-Ableitungen. Häufig selbst Fusionen aus obigen
   Quellen → niedrigste Provenienz für *Faktenherkunft* (Gefahr Zirkelschluss/Doppel-Fusion),
   auch wenn das Produkt gut ist.

Begründung crowdsourced: OSM ist häufig **aktueller** als amtliche Daten (die brauchen oft Jahre
für Updates), aber weniger konsistent/verlässlich; Klassifikationsgüte sinkt deutlich auf
„untrusted" Daten (eine Studie: 87,75 % vs. 57,98 %)
([Combining OSM with Authoritative Database](https://www.researchgate.net/publication/330073605_Combining_Road_Network_Data_from_OpenStreetMap_with_an_Authoritative_Database);
[OSM up-to-date?](https://link.springer.com/article/10.1186/s40965-019-0067-x)).

### Prinzip C — Aktualität (jüngeres Erfassungs-/Gültigkeitsdatum gewinnt)
Bei gleicher Provenienz-Klasse gewinnt der **frischere Stand**. Zwei Datumsachsen sauber trennen:
- **`quelle.abgerufenAm`** (wann WIR gezogen haben) — Re-Import-Frische.
- **Quell-eigene Versionierung** — DATEX II liefert je Situation einen *versionierten Identifier*
  (stabiler Erst-Teil + hochzählende `version`); mehrere Versionen derselben Situation können
  koexistieren. Die **höchste Version** der Quelle gewinnt.
  ([DATEX II Situation](https://docs.datex2.eu/v3.3/situation/)).
- **`realerStart` / `gueltigBis`** — fachliche Gültigkeit (greift das Hindernis überhaupt heute?).

### Prinzip D — Räumliche & inhaltliche Genauigkeit (präziserer Bezug gewinnt)
- **Geo-Präzision:** LineString-Geometrie + `strassenRef`/`kmVon`/`kmBis` (ASB-Stationierung)
  schlägt einen bloßen lat/lng-Punkt; ein Punkt mit Straßen-/km-Bezug schlägt einen freischwebenden Punkt.
- **Wert-Präzision:** ein **konkreter, strukturierter Grenzwert** (`maxGewichtT = 30`) schlägt
  einen aus Freitext geparsten/geschätzten Wert. (Autobahn-API liefert Limits oft nur als
  Freitext → niedrigere Wert-Präzision als ein DATEX-II-Strukturfeld.)

### Prinzip E — Spezialsystem GST = höchste Autorität für **Bauwerks**restriktionen (DOMÄNE)
Für **bauwerksgebundene** Restriktionen (Brücken-Traglast, Achslast, lichte Höhe) ist die
**statisch-fachliche Bewertung** (SIB-Bauwerke / ASB-ING / VEMAGS-Statik-Modul) die **oberste
Autorität** — über allem anderen, auch über einem Autobahn-API-Freitext. Grund: Diese Werte
stammen aus der Bauwerksstatik nach DIN 1076 und sind die Rechtsgrundlage des
GST-Genehmigungsverfahrens; das VEMAGS-Statik-Modul ist die bundesweit standardisierte
Bewertung
([VEMAGS Informationen](https://www.vemags.de/informationen/);
[Schwertransport-Genehmigung & VEMAGS](https://www.logistik-journal.de/schwerlasttransport-genehmigung-vemags-ablauf/)).

> **Wichtige Trennung (aus den Quellen-Docs):** BISStra/BAB-Netz ist nur der **Netz-Grundriss**
> (Stationierung), an den man Restriktionen *hängt* — die eigentliche **Bauwerks-Restriktion**
> liegt in SIB-Bauwerke/VEMAGS. „Brücken-Restriktion" und „Baustelle am selben Ort" sind
> deshalb **zwei verschiedene Hindernisse** (siehe Offene Frage 2 im Datenformat-Doc), nicht ein Konflikt.

---

## 2. Tie-Break-Reihenfolge (implementierbare Regelkette)

Wenn zwei Einträge als „**dasselbe Hindernis**" erkannt wurden (Matching → §3) und sich
widersprechen, wird der **Gewinner** (= der Datensatz, dessen Attribute/Werte führen) so bestimmt.
Erste Regel, die einen eindeutigen Sieger liefert, entscheidet; sonst weiter zur nächsten:

```
SCHRITT 0  Sicherheits-Gate (nicht-überstimmbar, siehe §5):
           Ist die Kategorie bauwerksgebunden (bruecke/tunnel/gewicht-an-Bauwerk)
           UND existiert ein GST/VEMAGS/BASt-Wert?
              → dieser Wert ist GESETZT für den Grenzwert (Prinzip E).
                (Weitere Felder wie Name/Geometrie laufen trotzdem die Kette unten durch.)

SCHRITT 1  BAULASTTRÄGER-MATCH (Prinzip A):
           Bestimme Straßenklasse aus strassenRef.
           Stammt genau EINE der Quellen vom zuständigen Baulastträger dieser Klasse?
              → diese gewinnt.
           (BAB → Autobahn-GmbH-Quelle; B/L/K/Gemeinde → zuständiger Landes-/Kreis-/Kommunalfeed.)

SCHRITT 2  PROVENIENZ-KLASSE (Prinzip B):
           amtlich > halböffentlich(Aggregator) > crowdsourced(OSM) > kommerziell-abgeleitet.
              → höhere Klasse gewinnt.

SCHRITT 3  AKTUALITÄT (Prinzip C):
           a) höchste quell-eigene Version (DATEX-II version) gewinnt;
           b) sonst jüngeres abgerufenAm / jüngeres realerStart bzw. Änderungsdatum gewinnt.

SCHRITT 4  GENAUIGKEIT (Prinzip D):
           a) präziserer Geo-Bezug (LineString+km > Punkt+km > Punkt) gewinnt;
           b) strukturierter Grenzwert > aus Freitext geparster Wert.

SCHRITT 5  KONSERVATIVITÄT (Tie-Breaker letzter Instanz, sicherheitsgetrieben):
           Bleibt es unentschieden → nimm den RESTRIKTIVEREN Grenzwert
           (kleinste maxHoehe/maxGewicht/maxBreite, größte steigungPct),
           denn ein zu großzügiger Wert ist für GST gefährlich, ein zu strenger nur teurer.

SCHRITT 6  STABILITÄT:
           Immer noch gleich → niedrigere quellenId / niedrigere fachId
           (deterministisch, reproduzierbar — kein Zufall).
```

**Merke:** SCHRITT 0/5 sind die zwei sicherheitsgetriebenen Sonderregeln; 1–4 sind die
„Autorität/Qualität gewinnt"-Kette; 6 garantiert Determinismus.

---

## 3. Dedupe / Matching-Strategie

### 3.1 Wann gelten zwei Einträge als „dasselbe Hindernis"?
Ein Kandidatenpaar wird als **Match** behandelt, wenn **alle** harten Bedingungen erfüllt sind und
genug weiche Indizien zusammenkommen:

**Harte Bedingungen (alle nötig):**
1. **Kategorie kompatibel** — gleiche `kategorie` ODER bekannt verwandtes Paar
   (z.B. `gewicht`↔`bruecke`, wenn beide auf ein Bauwerk zeigen; aber Achtung: *Baustelle* vs.
   *Brücke* am selben Ort sind i.d.R. **kein** Match → zwei Hindernisse).
2. **Zeitfenster überlappt** — Intervalle [`realerStart`,`gueltigBis`] schneiden sich
   (für unbefristete: `gueltigBis`=∞). Keine Überlappung → kein Match (verschiedene Ereignisse).

**Weiche Indizien (Schwelle: Straßen-Bezug ODER ausreichende Geo-Nähe):**
3. **Straßen-/km-Bezug:** gleiche normalisierte `strassenRef` (z.B. „A7") UND überlappende
   `kmVon`/`kmBis` (Toleranz ± ~200 m Stationierung). Das ist das **stärkste** Indiz — wenn
   vorhanden, dominiert es die reine Geo-Distanz.
4. **Räumliche Toleranz:** Punktdistanz < Schwelle (Vorschlag: **~120 m**, konsistent zum heutigen
   Korridor-Matching; bei LineString: Segment-Überlappung / Hausdorff-Distanz unter Schwelle).
5. **Richtung kompatibel:** `richtung` gleich oder eine Seite = `beide` (eine Richtungsfahrbahn-
   Baustelle ≠ Gegenrichtung).

**Zusätzlich (Re-Import desselben Feeds):** exakter Match über (`quellenId`, `quelle.externeId` /
DATEX `situationId`) → **immer** Update statt neuer Eintrag (das ist bereits im Datenformat-Doc §6
verankert und steht *über* der unscharfen Geo-Heuristik).

### 3.2 Was tun beim Match?
- **Mergen, nicht doppeln:** Ein „Master"-Eintrag bleibt sichtbar (gewählt nach Tie-Break §2),
  die anderen werden als *Belege/Provenienz* verlinkt (nicht hart gelöscht — Audit, ggf.
  `status=aufgehoben` für verdrängte). Feld-für-Feld wird der jeweils nach §2 stärkere Wert
  übernommen (ein Eintrag kann z.B. die präzisere Geometrie liefern, ein anderer den
  autoritativeren Grenzwert).
- **Mehrere Quellen, die übereinstimmen → Vertrauens-Boost** (Corroboration): erhöht den
  Confidence-Score (siehe §4), ändert aber den Wert nicht.

### 3.3 Echter Widerspruch (Werte differieren) — die zentrale Abwägung
Zwei Strategien stehen in Spannung:
- **(α) Autoritativste Quelle gewinnt** — sauber, nachvollziehbar, vermeidet „Phantom-Strenge"
  aus veralteten/falschen Drittquellen.
- **(β) Konservativ den restriktiveren Wert nehmen** — sicherer, aber kann durch *einen* falschen
  Low-Outlier (z.B. veraltete OSM-`maxweight`) eine real befahrbare Route fälschlich sperren.

**Empfohlene Auflösung (Hybrid, kategorieabhängig):**
- **Bauwerksgebundene Sicherheitswerte** (Brücke/Tunnel/Achslast/lichte Höhe): **(α) mit hartem
  E-Vorrang** — der GST/VEMAGS/BASt-Wert ist gesetzt. Gibt es KEINEN autoritativen Bauwerkswert
  und nur widersprüchliche Drittquellen → **(β) restriktivster Wert**, aber **`status=gemeldet`**
  (nicht `bestätigt`) + Confidence-Flag „nur Drittquelle, ungeprüft".
- **Temporäre/operative Restriktionen** (Baustelle/Sperrung/Restbreite): **(α) Baulastträger-Feed
  gewinnt** (Prinzip A); der ist hier maßgeblich und aktuell. (β) nur als Tie-Breaker letzter
  Instanz (SCHRITT 5), nicht als Default — sonst sperrt jede veraltete Geistermeldung die Route.

> Kurzfassung: **Bei Sicherheit (Bauwerk) im Zweifel restriktiver; bei Operativem (Baustelle)
> autoritativer.** Nie eine veraltete Drittquelle eine autoritative aktuelle überstimmen lassen,
> AUSSER es geht um eine bauwerksstatische Sicherheitsgrenze ohne autoritative Gegenquelle.

---

## 4. Quellen-Vertrauensstufen (Tiers) + Scoring-Modell

### 4.1 Tiers (mit Begründung)

| Tier | Bezeichnung | Quellen (Projekt) | Begründung |
| ---- | ----------- | ----------------- | ---------- |
| **T0** | GST-Bauwerksautorität | VEMAGS / BASt SIB-Bauwerke / Statik-Modul | Rechtsgrundlage GST, statisch geprüft (DIN 1076). Oberste Autorität für Bauwerksrestriktionen. |
| **T1** | Baulastträger direkt | Autobahn-API (`0001`, BAB), Landes-Straßenverkehrszentralen / Landes-DATEX direkt (B/L/K) | Operativ zuständige Stelle, amtlich, näheste Quelle für die jeweilige Klasse. |
| **T2** | Amtlicher Aggregator (NAP) | Mobilithek/MDM (`0009`) | Inhalt amtlich, aber Indirektion: Latenz + Feed-Vollständigkeit je Land variabel. |
| **T3** | Amtlich, aber nicht produktionsfreigegeben | BASt BISStra-WMS (Netz, „nicht für Navigation") | Hochwertiger Netzbezug, aber Lizenz-/Eignungs-Disclaimer → nur Geometrie-Anker, nicht Restriktionsquelle. |
| **T4** | Crowdsourced | OSM/Overpass (`0003`) | Aktuell + flächig, aber amateurerfasst, inkonsistent → nur Lückenfüller. |
| **T5** | Kommerziell-abgeleitet | TomTom/HERE/PTV | Gutes Produkt, aber oft Re-Fusion obiger Quellen → schwächste *Faktenherkunft*. |
| **T6** | Manuell/intern, unbestätigt | `0100+` ad-hoc, bis bestätigt | Wertvoll lokal, aber bis `status=bestätigt` mit Vorsicht. |

> **Achtung Kontext-Abhängigkeit:** Ein Tier gilt **relativ zur Straßenklasse**. Ein Landesfeed
> ist **T1 auf einer L-Straße**, aber nur **ergänzend (≈T2/T3)** auf einer BAB. Der Tier ist also
> nicht rein quellenfest, sondern wird durch Prinzip A pro Straßenklasse moduliert. Deshalb steht
> Prinzip A in der Tie-Break-Kette **vor** der reinen Tier-Reihung.

### 4.2 Scoring-Modell (Pseudologik — KEIN Code)

Jeder Eintrag bekommt einen **Rangscore** (höher = führt im Konflikt) und einen **Confidence**
(0–1, wie sicher der Wert stimmt). Beides gewichtet aus den Prinzipien:

```
RANGSCORE(eintrag, strassenklasse) =
      w_A · BaulastMatch(eintrag, strassenklasse)     // 0 oder 1: ist Quelle der zuständige Träger?
    + w_T · TierGewicht(eintrag.tier)                  // T0=1.0, T1=0.85, T2=0.6, T3=0.45, T4=0.3, T5=0.2, T6=0.25
    + w_C · Frische(eintrag)                           // normiert: jüngste Version/Abruf → nahe 1
    + w_D · Praezision(eintrag)                        // Geo + Wert-Struktur → 0..1
    + w_E · GstBauwerk(eintrag)                        // 1 wenn T0-Bauwerkswert für bauwerksgeb. Kategorie, sonst 0

Empfohlene Gewichte (Domäne):  w_E (1.0, harter Override-Boost) ≫ w_A (0.40) > w_T (0.30)
                               > w_C (0.20) > w_D (0.15).
   → A und E dominieren bewusst; C/D feinjustieren.
   → w_E wird so groß gesetzt, dass ein T0-Bauwerkswert in seiner Kategorie nicht überstimmbar ist
     (alternativ als hartes Gate in SCHRITT 0 statt als Summand — bevorzugt, weil deterministisch).

CONFIDENCE(eintrag) =
      basis(tier)                                      // amtlich hoch, OSM/kommerziell niedrig
    × frische_faktor                                   // veraltet → runter
    × corroboration_boost                              // n unabh. Quellen bestätigen denselben Wert → hoch
    × struktur_faktor                                  // strukturierter Grenzwert > Freitext-Parse
   (gekappt auf [0,1])
```

**Auswahl-Logik:** Der **Master**-Eintrag eines Clusters ist der mit dem höchsten `RANGSCORE`
(Ties via SCHRITT 5/6). **Confidence** wird separat angezeigt/gespeichert und steuert
`status` (z.B. Confidence < Schwelle → bleibt `gemeldet`, nicht `bestätigt`) sowie die
UI-Kennzeichnung („mehrfach bestätigt" vs. „nur OSM, ungeprüft").

---

## 5. Konservativitäts-Prinzip für Sicherheit (Abwägung + klare Empfehlung)

Die Spannung: **„autoritativste Quelle gewinnt"** (sauber) vs. **„im Zweifel restriktiver"** (sicher).

**Asymmetrie der Fehlerkosten — der entscheidende Punkt für GST:**
- **Zu großzügiger Grenzwert** (Route fälschlich freigegeben) → realer Schaden: Brücke überlastet,
  Fahrzeug bleibt unter Brücke stecken, Personen-/Sachschaden, Haftung. **Katastrophal.**
- **Zu strenger Grenzwert** (Route fälschlich gesperrt) → Umweg, höhere Kosten, ggf. unnötiger
  VEMAGS-Aufwand. **Ärgerlich, aber sicher.**

→ Die Kosten sind **asymmetrisch**. Deshalb ist Konservativität bei **Sicherheits-Grenzwerten**
die richtige Default-Haltung — ABER nur dort, und nicht als pauschaler „immer das Minimum"-Hammer,
der durch *einen* falschen Outlier ganze Korridore lahmlegt.

**Empfehlung (differenziert):**
1. **Bauwerksstatik (T0) hat sie → nimm sie.** Der autoritative Wert IST der sichere Wert; er ist
   das Ergebnis der statischen Prüfung. Hier gewinnt **Autorität, nicht Outlier-Strenge**. (Prinzip E)
2. **Keine T0-Quelle, mehrere widersprüchliche Drittquellen → restriktivster Wert**, ABER:
   markiert als `status=gemeldet` + niedrige Confidence + Hinweis „bauwerksstatisch ungeprüft,
   VEMAGS-Einzelfallprüfung empfohlen". So bleibt es sicher, ohne falsche Gewissheit zu suggerieren.
3. **Temporär/operativ (Baustelle/Sperrung) → autoritativer Baulastträger-Feed gewinnt**;
   Restriktivität NUR als letzter Tie-Breaker (SCHRITT 5), damit veraltete Geistermeldungen nicht
   real freie Routen blockieren.
4. **Nie** eine *aktuelle autoritative* Quelle durch eine *veraltete/niedrigere* Quelle überstimmen
   lassen, nur weil letztere strenger ist — außer es ist eine Bauwerks-Sicherheitsgrenze ohne
   autoritative Gegenquelle (Fall 2).

> **Leitsatz:** *Sicherheit = autoritativster verfügbarer Bauwerkswert; fehlt der, dann
> restriktivster verfügbarer Wert mit ehrlichem „ungeprüft"-Flag.* Konservativität ist das
> **Sicherheitsnetz für fehlende Autorität**, nicht der Ersatz für Autorität.

---

## 6. Bezug zum Datenmodell (`obstacles`)

Das Modell ist mit dem bestehenden Format (`HINDERNIS-DATENFORMAT.md`) **ohne Schema-Bruch**
umsetzbar; nötig sind v.a. ein paar Provenienz-/Cluster-Felder:

| Vorhandenes Feld | Rolle in der Hierarchie |
| ---------------- | ----------------------- |
| `quellenId` (FK Quellen-Register) | trägt den **Tier** (T0–T6) und damit `TierGewicht`. → Register um Spalte `tier` ergänzen. |
| `fachId` = INDEX4+QUELLE4+DDMMYY | QUELLE4 ist direkt die Tier-/Provenienz-Quelle; DDMMYY (`realerStart`) speist Aktualität & Zeitfenster-Match. |
| `realerStart` / `gueltigBis` | **Zeitfenster-Überlappung** (§3 Matching) + Aktualität (Prinzip C). |
| `attrs` (Grenzwerte) | Gegenstand der Wert-Konflikte; hier greift restriktiver-vs-autoritativ (§5). Pro Grenzwert ggf. `*_quelle`/`*_confidence` mitführen. |
| `strassenRef` / `kmVon` / `kmBis` | **Baulastträger-Bestimmung (Prinzip A)** + stärkstes Match-Indiz (§3). Straßenklasse aus `strassenRef` ableitbar (A→BAB, B/L/K-Präfix). |
| `geometrie` (GeoJSON), `richtung` | Geo-Präzision (Prinzip D) + Match-Schärfung (§3). |
| `quelle.externeId` (DATEX situationId) | exakter Re-Import-Dedupe; trägt auch die DATEX-**Version** für Prinzip C. |
| `status` (gemeldet→bestätigt→aufgehoben) | Confidence-Gate (§4/§5): unbestätigt = niedrige Confidence; verdrängte Duplikate → `aufgehoben`, nicht gelöscht. |

**Empfohlene additive Felder (nicht-brechend):**
- `quellen.tier` (T0–T6) im Quellen-Register.
- `cluster_id` (UUID) — gruppiert gemergte Einträge eines realen Hindernisses; Master via
  `is_master`-Flag + `rangscore`/`confidence` (cached). Verdrängte Belege bleiben als
  Cluster-Mitglieder (Audit/Corroboration), sind aber in der Analyse nicht doppelt sichtbar.
- optionale Per-Grenzwert-Provenienz in `attrs` (z.B. `maxGewichtT_quelle`, `maxGewichtT_confidence`),
  damit ein Cluster *feldweise* die jeweils stärkste Quelle tragen kann.

---

## 7. Zusammenfassung (Entscheidungs-Kern)

1. **Nicht „Land > Bund", sondern Baulastträger-Vorrang nach Straßenklasse** (Prinzip A, primär):
   BAB → Autobahn GmbH; B-außerorts → Land (Auftragsverwaltung) + Bund; L→Land, K→Kreis, Gemeinde→Kommune.
2. **Tie-Break-Kette:** GST-Bauwerks-Gate → Baulastträger-Match → Provenienz-Tier → Aktualität →
   Genauigkeit → Konservativität → deterministische Stabilität.
3. **Tiers T0–T6**, aber **straßenklassen-moduliert** (ein Landesfeed ist T1 auf L, nur ergänzend auf BAB).
4. **Sicherheit:** autoritativster Bauwerkswert (T0/VEMAGS) gewinnt; fehlt er → restriktivster Wert
   mit ehrlichem „ungeprüft"-Flag. **Operatives** (Baustelle): autoritativer Feed gewinnt,
   Restriktivität nur als letzter Tie-Breaker.
5. **Dedupe:** Match über (Kategorie+Zeitfenster+Straßen/km-Bezug+Geo+Richtung); Re-Import exakt
   über `externeId`. Mergen statt doppeln, verdrängte Belege behalten (Corroboration/Audit).
6. Umsetzbar im bestehenden `obstacles`-Modell + `quellen.tier` + `cluster_id` + optionaler
   Per-Grenzwert-Provenienz.

---

### Quellen (Web-Recherche)
- [Straßenbaulast (Deutschland), Wikipedia](https://de.wikipedia.org/wiki/Stra%C3%9Fenbaulast_(Deutschland))
- [Aufgaben & Zuständigkeiten im Verkehr — StMB Bayern](https://www.stmb.bayern.de/vum/handlungsfelder/verkehrsinfrastruktur/aufgabenzustaendigkeiten/index.php)
- [Straßenklassen und Zuständigkeiten (Träger der Straßenbaulast) — Bayern (PDF)](https://www.verkehr.bayern.de/assets/stmi/vum/strasse/strassenundverkehrsrecht/zusammenstellung_strassenklassen_und_zustaendigkeiten.pdf)
- [DATEX II — Situation & SituationPublication (Versionierung)](https://docs.datex2.eu/v3.3/situation/)
- [DATEX II — User guide](https://docs.datex2.eu/v3.4/general/index.html)
- [VEMAGS — Allgemeine Informationen](https://www.vemags.de/informationen/)
- [Schwertransport: Genehmigungsverfahren & VEMAGS — Logistik Journal](https://www.logistik-journal.de/schwerlasttransport-genehmigung-vemags-ablauf/)
- [Combining Road Network Data from OSM with an Authoritative Database](https://www.researchgate.net/publication/330073605_Combining_Road_Network_Data_from_OpenStreetMap_with_an_Authoritative_Database)
- [OpenStreetMap history for intrinsic quality assessment: Is OSM up-to-date?](https://link.springer.com/article/10.1186/s40965-019-0067-x)
- [Mobilithek — Nationaler Zugangspunkt für Mobilitätsdaten (Noerr)](https://www.noerr.com/de/insights/mobilithek---nationaler-zugangspunkt-fur-mobilitatsdaten-gestartet)
