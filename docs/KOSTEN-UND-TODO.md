# Roadmap-Daten — Kostenaufstellung & TODO-Liste

> Stand: 2026-06-13. Ergänzt `docs/research/BESCHAFFUNGSLISTE.md` + `ABDECKUNG-UND-GAPS.md`.

---

## 1. Kostenaufstellung

**Kernaussage: Die Daten-Beschaffung bis ~90 % temporär / ~50 % dauerhaft kostet 0 € an Lizenz-
und Infrastruktur-Geld.** Der einzige „Preis" ist **Zeit + Behörden-Beziehungen** (Anfragen,
Vorlaufzeiten). Die wenigen *bezahlten* Optionen lohnen sich nicht und sind bewusst rausgeflogen.

### 1a. Datenquellen

| Quelle / Stufe | Lizenz/Gebühr | Aufwand | Anmerkung |
|---|---|---|---|
| 37 offene Connectoren (Autobahn-API, OSM, Landes-WFS, Städte) | **0 €** (dl-de/by-2.0, CC BY 4.0, ODbL — nur Attribution) | gebaut ✅ | bereits abrufbar |
| **Mobilithek-Account + Maschinenzertifikat** | **0 €** (kostenlos) | Tage (Registrierung) | schaltet alle Länder-DATEX frei |
| Mobilithek-Feed-Abos (BB/HB/NI/RP/TH + HE/BY …) | **0 €** je Abo | je Abo „abonnieren" | Integration steht (gated) |
| Länder-Anfragen (GST-Negativlisten, Bauwerksexporte, Baustellen-Feeds) | **0 €** (dl-de/by-2.0) | Mails/Telefonate je Land | reiner Zeitaufwand |
| NC-Feeds legalisieren (Bremen VMZ, Sachsen-Anhalt LSBB) | i.d.R. **0 €** (Nutzungsvereinbarung) | 1 Anfrage je Stelle | Konditionen bestätigen |
| BASt-Brückenkarte (CC-BY) | **0 €** | Tage (Export+Parser) | nur A+B, evtl. ohne Statik |
| ELWIS Brückenhöhen | **0 €** (offene PDFs) | klein (PDF-Parser) | Nischen-Höhen-Layer |
| **BASt SIB-Bauwerke via Landesbetriebe** | Daten i.d.R. **0 €**, 17× Vereinbarung | 6–18+ Mon. | einziger Achslast-Weg |
| **VEMAGS-Anbindung** | Kooperationsvertrag (keine Lizenzgebühr ersichtlich) | 3–9 Mon. + Siegelung | nur als GST-Dienst voll wertvoll |

### 1b. Bewusst NICHT beschafft (bezahlt, lohnt nicht)

| Option | Kosten | Warum raus |
|---|---|---|
| SIB-Bauwerke-Software (WPM) | **2.200 €+** | gibt *Software*, NICHT fremde Daten → für Datenzugang wertlos |
| DB InfraGO ISR (amtl. Bahnübergänge) | **~1.846 €/Jahr** + ERegG-Zugang | unwirtschaftlich → OSM `railway=level_crossing` als Ersatz (0 €) |
| PTV / HERE / TomTom (Truck-Attribute) | laufende Lizenz | auf deinen Wunsch entfernt → freie OSS-Engines (ORS/GraphHopper) |

### 1c. Infrastruktur (laufender Betrieb)

| Posten | Kosten | Anmerkung |
|---|---|---|
| roadmap-worker (Cron-Engine) | **0 € inkrementell** | läuft schon als Coolify-App auf der Setreo-VM (Hetzner) |
| DB-Storage (obstacles, ~37k+ wachsend) | **vernachlässigbar** | wenige MB auf der bestehenden Managed-PG |
| Abruf 3×/Tag aller Quellen | **0 €** | alle Endpunkte kostenlos; Mobilithek-Pull kostenlos |
| Geocoding/Routing (Nominatim/OSRM) | **0 €** | bestehend |

→ **Inkrementelle Infra-Kosten der gesamten Daten-Pipeline ≈ 0 €/Monat.**

> **Fazit:** Geld ist nicht der Engpass. Maximal-Abdeckung scheitert nicht am Budget, sondern an
> **Behörden-Vorlaufzeiten** (BASt/VEMAGS, 6–18 Mon.) und ggf. der strategischen Entscheidung,
> Setreo als VEMAGS-angebundenen GST-Dienst zu positionieren.

---

## 2. TODO-Liste (alle offenen Punkte)

### A) WIR (technisch) — sofort möglich, kein Beschaffungs-Bedarf

| # | Aufgabe | Status |
|---|---|---|
| A1 | 37 Connectoren in die Engine-Registry porten (`server/src/connectors/*`, Schedule 8/12/18) | offen (T-036) |
| A2 | Importer/Repo um v1.0-Felder erweitern (befristung, vnk/nnk, strassenklasse, roh …) | offen |
| A3 | **Priorisierungs-Logik** scharf (Baulastträger: BAB→Autobahn GmbH gewinnt; Dedupe/Cluster) | offen |
| A4 | Migration 006 auf Prod anwenden (gegen Dump getestet) | offen |
| A5 | `quellen`-Register um alle neuen quelleIds (Länder/Städte/Mobilithek-Blöcke) ergänzen | offen |
| A6 | Schedule aktivieren (env `CONNECTORS`) + Worker deployen | offen |
| A7 | **Erster Sync mit echten Daten** + **Demo raus** (`node scripts/seed.js --remove-demo`) | offen |
| A8 | Geocoding für koordinatenlose PDF-Quellen (Hessen-Brücken 136, Sachsen-GST 24) | offen |
| A9 | Kleinere Daten-Härtung: MV `externe_id` (Freitext, fragil), Autobahn `restbreite`-Semantik | optional |

> A1–A7 = **der „abfahren"-Block**. Rein technisch, keine Beschaffung nötig. Wartet nur auf dein Go.

### B) DU (Max) — Beschaffung, schaltet Quellen frei (Integration steht bereit)

| # | Aufgabe | Hebel |
|---|---|---|
| B1 | **Mobilithek-Account + Zertifikat** (`mobilithek.info/registration-request`) → ENV setzen | temporär 60→90 % |
| B2 | DATEX-Abos BB/HB/NI/RP/TH + HE/BY abonnieren, Subscription-IDs notieren | +7 Länder temporär |
| B3 | Landesbetrieb-Mails NI / RP / TH (Negativliste > Bauwerksexport > Feed) | dauerhaft +erste Bauwerke |
| B4 | Brandenburg + Sachsen-Anhalt (billige Unlocks) | leere Länder / NC legalisieren |
| B5 | SH / BW / MV / HB / SL Anfragen (zweite Welle) | Bauwerks-Layer ergänzen |
| B6 | **BASt-SIB / Autobahn-GmbH / VEMAGS anstoßen** (langer Vorlauf → jetzt starten) | dauerhaft+Achslast 50→85 % |

→ Kontakte alle in `docs/research/BESCHAFFUNGSLISTE.md` §5 (kopierbar).

### C) Optional / später

| # | Aufgabe |
|---|---|
| C1 | BASt-Brückenkarte (CC-BY) anbinden + Export-Felder real prüfen |
| C2 | ELWIS-PDF-Parser (Wasserstraßen-Durchfahrtshöhen) |
| C3 | Hannover-Region-WFS + Kiel (opendata.SH) als Producer |
| C4 | OSM `railway=level_crossing`-Producer (Bahnübergänge, Lage-Ersatz) |
| C5 | Vincents Cron-Engine-FE-Feature (T-035) final auf done |

---

## 3. „Die die wir machen können — schon drin?" (ehrliche Antwort)

**Gebaut, verifiziert, committet (✅ drin):**
- alle **37 offenen Connectoren** (Daten fließen live, ~40.800 Datensätze, Format v1.0 verifiziert)
- **Mobilithek-Integration** vorbereitet (Parser + mTLS-Connector + Doku, gated bis Account)
- **Vincents Engine** absorbiert (Cron-Scheduler, Auto-Rerun, Lifecycle, Sync-Button, Notifications)
- **Daten-Qualitäts-Fixes** (Tonnage-Komma-Bug, Koord-Plausibilität)
- die komplette **Research + Beschaffungsliste**
- 161 Server-Tests grün, FE sauber, alles auf `main`

**NOCH NICHT live in Prod (❌ der eine offene doable-Block = A1–A7):**
Die 37 laufen aktuell als **Standalone-Crons** — sie sind noch **nicht** in der Worker-Registry
geplant, schreiben **noch nicht** in die Prod-DB, und die **Demo-Daten sind noch drin**.

→ **Kurz: Alles Baubare ist gebaut. Das einzige, was wir „jetzt schon machen könnten" aber noch
NICHT scharf ist, ist das Scharfschalten in Prod (porten + erster Sync + Demo raus).** Das ist
A1–A7 — kein Beschaffungs-Bedarf, nur dein Go.
