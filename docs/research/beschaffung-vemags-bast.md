# Beschaffungs-Recherche: VEMAGS + BASt SIB-Bauwerke (die autoritativen Bauwerks-/Achslast-Quellen)

> **Stand:** 2026-06-13 · Web-verifiziert (WebSearch + WebFetch).
> **Ziel:** Konkret benennen, WAS Max beschaffen kann (Account/Vertrag/Behörden-Anfrage), um an
> bundesweite Brücken-Traglast / lichte Höhe / **Achslast** zu kommen — die strukturelle Hauptlücke
> aus `ABDECKUNG-UND-GAPS.md §2(a)`.
> **Alle URLs/Kontakte unten sind verifiziert** (kein erfundener Endpunkt). Wo etwas unbestätigt
> bleibt, ist es als UNBESTÄTIGT markiert.

---

## 0. Kernbefund vorweg (die unbequeme Wahrheit)

Es gibt in DE **keinen kaufbaren Account und keinen offenen Feed**, der einem privaten Unternehmen
die bundesweiten Brücken-Statikdaten (Traglast/Achslast) frei liefert. Die autoritative Quelle
(**SIB-Bauwerke**) ist eine *Fachsoftware der Straßenbauverwaltungen* — man kann die **Software
kaufen, aber NICHT die Daten** anderer Baulastträger. Der einzige realistische Datenweg ist eine
**Datenlieferungs-/Kooperationsvereinbarung mit den Baulastträgern** (Autobahn GmbH + 16 Länder)
bzw. eine Andockung an **VEMAGS/Xvemags-FP** als zugelassenes Drittsystem. Beides ist
Behörden-Beziehungsarbeit, kein Self-Service.

Die **eine sofort beschaffbare offene Quelle** ist die **BASt-Brückenkarte** (CC-BY 4.0, Export) —
aber sie deckt **nur Bundesfernstraßen-Brücken** und **vermutlich nur Lage/Baustoff/Zustand**, nicht
die Statik-Kernwerte. Sie schließt die Achslast-Lücke also **nicht**.

---

## (a) BASt SIB-Bauwerke / Brückenstatik — der Goldstandard, aber datentechnisch verschlossen

**Was es fachlich ist:** SIB-Bauwerke ist DIE zentrale Bauwerksdatenbank-Software nach DIN 1076 /
ASB-ING — Brücken-Traglast/Tragfähigkeit, lichte Höhe/Durchfahrtshöhe, Stützweiten, zul. Achslasten,
Zustand. Eigentümer sind **Bund + Länder gemeinsam** (Straßenbauverwaltungen). Fachliche Leitung:
Bund-/Länder-AG „Bauwerke" der „IT-Koordinierung im Straßenwesen", BASt beteiligt.

**Wer die Software vertreibt:** **WPM-Ingenieure GmbH** (im Auftrag der BASt). Die Software ist
**käuflich** — Preise (Stand 2026, verifiziert auf `sib-bauwerke.de/preise/`):

| Lizenz | Vollversion | Analyse-Modul |
|---|---|---|
| Einzel-Lizenz (Dongle) | **2.200 €** | 900 € |
| Netzwerk-Lizenz | **3.000 €** | 1.200 € |
| Zusatz-Lizenz | 1.100 € / 1.500 € (Netz) | 450 € / 600 € |
| Support/Jahr | 400 € (1. Jahr frei) | 150 € |

> Alle Preise netto, Hardlock-Dongle. Kontakt Vertrieb: **vertrieb@sib-bauwerke.de**,
> Support **+49 6821 970414**, `https://sib-bauwerke.de/` / `https://www.wpm-ingenieure.de/`.

**❗ Entscheidender Haken:** Die Lizenz gibt **die Software, NICHT die Daten**. SIB-Bauwerke
verwaltet die *eigenen* Bauwerksdaten des Lizenznehmers. Ein privates Routing-Unternehmen, das nicht
Baulastträger ist, bekommt damit **keine fremden Brückendaten** — die Software allein ist für unseren
Zweck **wertlos**. (Das korrigiert die latente Annahme, man könne sich „in SIB-Bauwerke einkaufen".)

**Wie ein Drittsystem/Partner an die DATEN käme — die echten Wege:**
1. **Datenlieferungsvereinbarung mit den Baulastträgern.** Für BAB+Bundesstraßen ist das die
   **Autobahn GmbH des Bundes** bzw. das **Fernstraßen-Bundesamt (FBA)**; für L/K die jeweiligen
   **Landesbetriebe Straßenbau**. Das ist 17 separate Verhandlungen (Bund + 16 Länder), je mit
   eigenem Datenschutz-/Nutzungsregime. Kein zentraler Schalter.
2. **BASt direkt** als koordinierende Forschungsstelle anfragen — realistisch nur für
   Forschungs-/Pilotzwecke, nicht für kommerzielle Bulk-Lieferung.
   Kontakt: **post@bast.de**, +49 2204 43-0, Brüderstraße 53, 51427 Bergisch Gladbach.
   Seite: `https://www.bast.de/DE/Themen/Digitales/HF_1/Massnahmen/bauwerksdaten.html`
3. **LISt Gesellschaft mbH (Sachsen)** als operativer Betreiber/Hoster von SIB-Bauwerke + VEMAGS —
   möglicher kommerzieller Gesprächspartner für Integration (siehe (b)).

**Kontakt / Antragsweg:** post@bast.de (BASt-Koordination) + Autobahn GmbH (Asset-Management) +
Landesbetriebe. Schriftliche Daten-Anfrage mit Zweckbindung; für Bund i.d.R. über FBA/Autobahn GmbH.
**Aufwand:** **6–18+ Monate** (mehrere Behörden, Nutzungsverträge, ggf. Gebühren/Geheimhaltung).
**Realismus für privates Unternehmen:** **niedrig–mittel** — möglich, aber langwierig und
fragmentiert; ohne behördlichen „Anlass" (z. B. offizieller GST-Dienstleister-Status) schwer.
**Abdeckungsgewinn:** **sehr hoch** — der EINZIGE Weg zu bundesweiter Traglast **+ Achslast**;
würde die dauerhafte Datenwelt von ~30 % auf potenziell 80–90 % heben und die Achslast-Dimension
(heute <10 %) als einziges Mittel überhaupt schließen.

---

## (b) VEMAGS / Xvemags — der pragmatischere Hebel über den Genehmigungs-Workflow

**Was es ist:** VEMAGS® = bundeseinheitliches Online-Verfahren für ALLE GST-Genehmigungen
(Bund + 16 Länder), >90 % aller GST-Anträge laufen darüber. **Projektleitung: Hessen Mobil**;
**operativer Betrieb/Hosting: LISt Gesellschaft mbH (Sachsen)**.

**Was Xvemags fachlich liefert (verifiziert, 3 Kanäle):**
- **Xvemags-AB** — Anträge aus Fremdsystem *einreichen* (Antragsteller→VEMAGS). Schreibend, kein Pull.
- **Xvemags-FP (Fachprüfung)** — **liefert Routen- und Fahrzeugdaten inkl. Anhörungs-Mitteilungen
  AN ein Drittsystem.** ← **Das ist der einzige LESENDE Kanal.** Gedacht für Anhörungspartner
  (z. B. Statik-Prüfung via NOVALAST). Liefert *verfahrensbezogene* Route+Auflagen, **keinen freien
  Bauwerks-Restriktions-Katalog**.
- **Xvemags-EGB** — Anbindung an Kassen/Gebühren der Genehmigungsbehörden.
- **INS-GST-Webservice** — reichert eine Route mit zugehörigen **ASB-Teilabschnitten** an (Mapping
  Route→ASB-Segmente, Geometrien, Mapping-Anomalien). Hängt an den Prüfmodulen; **kein offener
  Bauwerks-Pull**. Doku: `https://www.vemags.de/ins-gst-modul/ins-gst-webservice-3/`
- **Statik-Modul** — Tragfähigkeitsberechnung; zieht Bauwerksdaten aus den SIB-Beständen der Länder.

**Fazit zum Datencharakter:** VEMAGS liefert **verfahrensgebundene** Daten (konkrete Route + Auflagen
einer Genehmigung), **nicht** einen flächigen „alle Brücken mit Traglast/Achslast"-Datensatz. Den
Restriktions-Katalog zieht VEMAGS *intern* aus SIB — von außen kommt man an diesen Katalog nicht
direkt, nur an das Ergebnis je Antrag.

**Weg zur Andockung (verifiziert):** Drittsystem-Anbindung erfordert **Kooperationsvertrag** +
standardisierten **Siegelungsprozess** (Zertifizierung), Anbindung nur in Produktivumgebung.
- **Erster Kontakt:** Landesbeauftragte Verfahrens-Modul →
  `https://www.vemags.de/in-kontakt/landesbeauftragte-verfahrens-modul/`
- **Betreiber/Integration:** **LISt Gesellschaft mbH**, Ansprechpartner **Frank Eckhardt**,
  **frank.eckhardt@list.sachsen.de**, +49 37207 832-652, Ernst-Thälmann-Str. 5, 09661 Hainichen.
  Seite: `https://www.list.sachsen.de/vemags.html`
- **Schnittstellen-Doku:** `https://www.vemags.de/verfahrens-modul/schnittstelle/` (WSDL/Details
  auf Anfrage). Anwendung: `https://applikation.vemags.de`.

**Aufwand:** **3–9 Monate** (Vertrag + Siegelung + SOAP-Implementierung). **Realismus:**
**mittel** — der Prozess ist *etabliert und dokumentiert* (Drittsysteme docken regelmäßig an), aber
gedacht für Antragsteller-/Prüfsoftware. Als *Daten-Aggregator* ohne eigene Antrags-Last ist der
fachliche Nutzen begrenzt: man bekäme **eigene** Anträge angereichert, keinen Gesamt-Bauwerks-Layer.
**Abdeckungsgewinn (als Datenquelle):** **niedrig–mittel** — nur verfahrensbezogen; **hoch** nur,
wenn Setreo selbst als GST-Antrags-/Routing-Dienst auftritt (dann pro Route echte Auflagen+ASB-Bezug).

**GST 4.0 (BMDV-mFUND-Projekt) — beobachten, nicht beschaffbar (Stand jetzt):**
Konsortialprojekt (Start 07/2020), entwickelte digitale VEMAGS-Schnittstellen, hochpräzise 3D-Routen-
erfassung, Schleppkurven-Simulation, „digitaler Beifahrer". Ergebnisse fließen in künftige VEMAGS-
Digitalisierung — **kein offener Daten-Download für Private**. Relevanz: künftige VEMAGS-Schnittstellen
könnten lesbarer werden; Quelle für Roadmap-Watching.
Doku: `https://www.bmv.de/SharedDocs/DE/Artikel/DG/mfund-projekte/gst4.html` (Redirect von bmdv.bund.de),
Übersicht: `https://www.internationales-verkehrswesen.de/gst-4-0-digital-optimierte-grossraum-und-schwertransporte/`.

**Zusatz-Hebel Bund-Autobahn:** **GST.Autobahn** (Tool der Autobahn GmbH, seit Ende 2023 in allen
Niederlassungen) bewertet Befahrbarkeit auf BAB (Durchfahrtshöhen, Engstellen, Brücken-/Rampen-
Tragfähigkeit). Internes Verfahrens-Tool, **kein offener Feed** — aber die Autobahn GmbH ist damit der
konkrete Ansprechpartner für BAB-Bauwerksdaten (`https://www.autobahn.de/fuer-unternehmen`).

---

## (c) Übersehene offene Brücken-/Bauwerks-/Traglast-Datensätze im Katalog?

Gezielt gegen GovData/Geoportale geprüft. Befund: **keine substanzielle übersehene OFFENE
Traglast-/Achslast-Quelle.** Die bereits erfassten Länder-WFS (BAYSIS, Detailnetz Berlin, LSBG
Hamburg, Straßen.NRW) sind genau die offenen Bauwerks-Dienste, die GovData/INSPIRE listet. Aber:

1. **BASt-Brückenkarte / BASt-Viewer — SOFORT beschaffbar, bisher nur als „Portal" geführt.**
   - Anwendung: **`https://via.bund.de/bast/br/map/`** (heute „Wartung", aber produktiv existent).
   - **Export-Funktion bestätigt:** „alle Bauwerksdaten herunterladen", filterbar, **CC-BY 4.0**,
     halbjährliche Aktualisierung. Betreiber BMV + FBA + BASt.
   - GDI-DE-Metadaten: `https://gdk.gdi-de.org/geonetwork/srv/api/records/699335644490391552`
   - **Felder UNBESTÄTIGT:** Quellen nennen explizit nur **Lage, Baustoff, Zustandsnote** als
     filterbar — **nicht** Traglast/lichte Höhe/Achslast. Wahrscheinlich Stammdaten+Zustand, NICHT
     Statik. → Beschaffen + Export-Felder real prüfen; selbst im besten Fall nur **A+B-Brücken**.
   - **Aufwand:** Tage (manueller Export → Parser). **Realismus:** **hoch**. **Abdeckungsgewinn:**
     **niedrig–mittel** (bundesweite Brücken-*Lage/Zustand*, vermutlich ohne die GST-Kernwerte).
2. **BASt „Daten zum Download – Brückenbau"** (`https://www.bast.de/DE/Publikationen/Daten/Daten-B_node.html`)
   + Brückenstatistik als **PDF/Excel** — aggregierte Statistik, **keine** objektscharfe Geometrie.
   Nur als Kontext/Validierung nutzbar. Aufwand niedrig, Gewinn niedrig.
3. **ASB-ING-Spezifikation** (`…/Downloads/B01a-Bauwerke.pdf`, BASt) — das *Datenmodell* der
   Bauwerksdaten. Kein Datensatz, aber **wertvoll fürs Schema-Mapping**, sobald wir an SIB-Daten kommen.
4. **Sachsen-Anhalt LVermGeo (ATKIS-Bauwerke, WFS, offen)** — bereits 🟢 im Katalog, liefert
   Brücken-**Geometrie**, aber **keine** Traglast. Bestätigt: Geometrie ≠ Statik-Lücke bleibt.

→ **Keine verschwiegene Achslast-Goldquelle gefunden.** Die einzige neue *offene* Beschaffung ist die
BASt-Brückenkarte (begrenzter Wert). Alles mit echten Statik-Werten bleibt SIB/VEMAGS-gated.

---

## Priorisierte Beschaffungs-Empfehlung

| # | Quelle | Weg | Aufwand | Realismus | Abdeckungsgewinn |
|---|---|---|---|---|---|
| 1 | **BASt-Brückenkarte** (via.bund.de/bast/br/map/) | Manueller CC-BY-Export → Parser; Felder prüfen | Tage | **hoch** | niedrig–mittel (A+B-Brücken-Stammdaten) |
| 2 | **VEMAGS/Xvemags-FP** (LISt: frank.eckhardt@list.sachsen.de) | Kooperationsvertrag + Siegelung; nur sinnvoll wenn Setreo GST-Antrags-/Routing-Dienst wird | 3–9 Mon. | mittel | niedrig (verfahrensbezogen) / hoch (als GST-Dienst) |
| 3 | **Autobahn GmbH** BAB-Bauwerksdaten (GST.Autobahn-Kontext) | Datenlieferungs-/Kooperationsanfrage | 6–12 Mon. | niedrig–mittel | hoch (alle BAB+B-Brücken, Statik) |
| 4 | **SIB-Daten via Landesbetriebe + BASt** (post@bast.de) | 17× Datenlieferungsvereinbarung | 6–18+ Mon. | niedrig | **sehr hoch** (Traglast **+ Achslast** bundesweit) |
| 5 | **SIB-Bauwerke-Software** (WPM, 2.200 €+) | NICHT beschaffen für Datenzugang | — | — | **null** (Software ohne Fremddaten) |

**Bottom Line:** Die Achslast-/Traglast-Lücke ist **nicht per Account/Kauf** schließbar, nur per
**Behörden-Datenvereinbarung** (Autobahn GmbH + Länder, koordiniert über BASt) oder dadurch, dass
Setreo selbst zum **VEMAGS-angebundenen GST-Dienst** wird. Sofort-Gewinn nur über die
BASt-Brückenkarte (begrenzt). Mobilithek bleibt der separate, leichtere Hebel für *temporäre* Daten
(siehe `ABDECKUNG-UND-GAPS.md §6.1`).

---

### Verifizierte Kontakte (kopierbar)
- **BASt (Koordination Bauwerksdaten):** post@bast.de · +49 2204 43-0 · Brüderstraße 53, 51427 Bergisch Gladbach
- **WPM-Ingenieure (SIB-Bauwerke-Software):** vertrieb@sib-bauwerke.de · +49 6821 970414 · sib-bauwerke.de
- **LISt Gesellschaft (VEMAGS-Betrieb/Integration):** Frank Eckhardt · frank.eckhardt@list.sachsen.de · +49 37207 832-652
- **VEMAGS Landesbeauftragte (Erstkontakt):** https://www.vemags.de/in-kontakt/landesbeauftragte-verfahrens-modul/
- **Hessen Mobil (VEMAGS-Projektleitung):** https://mobil.hessen.de/Themen-A-Z/vemags
- **Autobahn GmbH (für Unternehmen):** https://www.autobahn.de/fuer-unternehmen

*Erstellt 2026-06-13, web-verifiziert. „UNBESTÄTIGT" = nicht direkt aus Primärquelle abrufbar
(Portal in Wartung / Doku nur auf Anfrage). Keine Endpunkte erfunden.*
