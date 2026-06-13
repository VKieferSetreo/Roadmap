# Beschaffungsliste — was Max beschaffen kann für maximale DE-Abdeckung

> **Stand:** 2026-06-13 · Synthese aus `ABDECKUNG-UND-GAPS.md` +
> `beschaffung-mobilithek.md` + `beschaffung-vemags-bast.md` +
> `beschaffung-laender-anfrage.md` + `beschaffung-luecken-sweep.md`.
> **Zweck:** Entscheidungsreife, priorisierte Liste — WAS beschaffen, WIE, mit welchem Aufwand
> und welchem Abdeckungsgewinn. Ehrlich, keine Schönfärberei.
>
> **Die zwei Datenwelten** (immer getrennt denken):
> - **Temporär** = Baustellen / Sperrungen / Umleitungen / Verkehrszeichen. Heute ~60 % offen.
> - **Dauerhaft** = Brücken-Traglast / lichte Höhe / **Achslast** (Bauwerksstatik). Heute ~30 %, dünn.
>
> Mobilithek hebt fast nur die temporäre Welt. Die dauerhafte Welt (besonders Achslast) ist
> **strukturell** nur über Behörden-Datenvereinbarungen (BASt-SIB / VEMAGS / Landesbetriebe) zu
> schließen — kein Account, kein Kauf.

---

## 1. Beschaffungstabelle (sortiert nach Hebel)

| # | Quelle | Liefert (Datentyp) | Beschaffungsweg + Kontakt | Aufwand | Gewinn temp. | Gewinn dauer. | Prio |
|---|---|---|---|---|---|---|---|
| 1 | **Mobilithek-Account + Maschinenzertifikat** | Voraussetzung für alle DATEX-II-Feeds | Registrierung `mobilithek.info/registration-request` → Org anlegen (Approval-Mail) → Rollen „Bestellmanagement" + „Organisationsadministration" → Zertifikat (kommt per Mail, PW per SMS). **Kostenlos.** | niedrig (Tage) | enabler | — | **P1** |
| 2 | **Mobilithek: Baustellen-Abos der 5 leeren Länder** (BB, HB, NI, RP, TH) | Baustellen/Sperrungen je Land (DATEX II v2/v3) | Nach Login je Angebot „Abonnieren" → Datengeber-Freigabe. ID-Mapping macht Max nach Login (offen nicht abrufbar). Pull: `GET mobilithek.info:8443/.../subscription?subscriptionID=<id>` mTLS + gzip + If-Modified-Since | mittel (n Abos) | **+5 Länder von 0** | — | **P1** |
| 3 | **Mobilithek: HE + BY Land-Baustellen** (heute nur gated) | Baustellen/Sperrungen DATEX II | dito (abonnieren) | niedrig | +2 starke Länder | — | **P1** |
| 4 | **Mobilithek: Verkehrslage/-meldungen** derselben Länder | Sperrungen/Umleitungen verdichtet | dito (German Traffic Data Profile) | niedrig | qualit. Verdichtung | — | **P2** |
| 5 | **Brandenburg** Landesbetrieb (LS) | GST-Negativliste + Baustellen-Feed | `LS-GST@LS.Brandenburg.de` · Maik Dieling `Maik.Dieling@LS.Brandenburg.de` 03342 249-1093 | niedrig | leeres Land | erste Bauwerke | **P1** |
| 6 | **Niedersachsen** NLStBV Dez. 34 | NWSIB-Bauwerksexport (Traglast/Höhe) + VMZ-Feed | NLStBV Dez. 34, Tel. 0511 3034-2433 (NWSIB-Freigabe = Verwaltungsakt) | mittel | Flächenland 0→aktiv | **sehr hoch** | **P1** |
| 7 | **Rheinland-Pfalz** LBM | Brücken-Traglast + Negativliste + DATEX-Knoten | `Daniel.Boden@lbm.rlp.de` / LBM-Zentrale Koblenz | mittel | Flächenland 0→aktiv | **sehr hoch** | **P1** |
| 8 | **Thüringen** TLBV Erfurt + Landesverwaltungsamt | Bauwerks-/Baustellenexport (Web ist CAPTCHA → Tel.) | `poststelle@tlvwa.thueringen.de` + TLBV Erfurt telefonisch | mittel | Flächenland 0→aktiv | **sehr hoch** | **P1** |
| 9 | **Schleswig-Holstein** LBV.SH | Brücken-/Bauwerksverzeichnis + Negativliste | `gst@lbv-sh.landsh.de` · Fr. Panschog 0431 383-2927 | niedrig | (temp. da) | hoch (Bauwerks-Layer ergänzt) | **P2** |
| 10 | **Sachsen-Anhalt** LSBB/MID | NC-Freigabe Sperrinfo-WFS + Bauwerksliste | Kontaktformular `lsbb.sachsen-anhalt.de` (Feed `service.ifak.eu/sperrinfo` ist „non-commercial only") | niedrig | Feed legalisiert | erste Bauwerke | **P2** |
| 11 | **Mecklenburg-V.** LS M-V Dez. 32 | WFS-Lizenzfreigabe + Bauwerksliste | `lsmv@sbv.mv-regierung.de` 0385 588-80370 | niedrig | Feed legalisiert | erste Bauwerke | **P2** |
| 12 | **Baden-Württ.** RP Tübingen Abt. 4 | Bauwerks-/Negativexport (BW dauerhaft = 0!) | `poststelle@rpt.bwl.de` 07071 757-0 | mittel | (temp. da) | hoch (erste BW-Bauwerke) | **P2** |
| 13 | **Bremen** ASV AG GST | Bauwerksexport (Traglast/Höhe) + VMZ-Feed | Iris Döring `iris.doering@asv.bremen.de` 0421 361-9529 | niedrig | leeres Land | erste Bauwerke | **P2** |
| 14 | **Saarland** LfS Neunkirchen | GST-Brückenliste + Baustellenportal-Lizenz | `poststelle@lfs.saarland.de` | niedrig | kleines Land | erste Bauwerke | **P3** |
| 15 | **BASt-Brückenkarte** (`via.bund.de/bast/br/map/`) | Bundesfernstraßen-Brücken Lage/Baustoff/Zustand (CC-BY 4.0) | Manueller Export → Parser. **Felder real prüfen** — Traglast/lichte Höhe/Achslast wahrscheinlich NICHT enthalten | Tage | — | niedrig–mittel (nur A+B, vermutl. ohne Statik) | **P2** |
| 16 | **ELWIS** (WSV/GDWS) | Brückendurchfahrtshöhen Bundeswasserstraßen | Offene PDF-Tabellen je Wasserstraße → PDF-Parser (wie Hessen-Brücken) | klein–mittel | — | Nischen-Höhen-Layer (sonst nirgends offen) | **P2** |
| 17 | **Hannover-Region** Verkehr-WFS | Baustellen einer Großstadt-Region (NI sonst leer!) | GetCapabilities Verkehr-WFS prüfen → anbinden | klein | +1 Region (überdurchschn. wertvoll) | — | **P2** |
| 18 | **Kiel** opendata.SH | Verkehrslage/Baustellen GeoJSON (alle 3 Min) | `opendata.schleswig-holstein.de` Org Kiel | klein | +Landeshauptstadt SH | — | **P3** |
| 19 | **OSM `railway=level_crossing`** | Bahnübergänge (Lage, ohne amtliche Attribute) | Eigener Overpass-Producer | klein | BÜ-Ersatz | (Lage-Ersatz) | **P3** |
| 20 | **Wuppertal / Bochum / Bielefeld** | Stadt-Baustellen | Open.NRW/RVR-Template erweitern. **Bielefeld nur CSV/XML, Lizenz „geschlossen" — vorab klären!** | klein | lokal | — | **P3** |
| 21 | **VEMAGS / Xvemags-FP** | Routen+Auflagen je GST-Antrag (kein flächiger Bauwerks-Katalog) | Kooperationsvertrag + Siegelung. LISt: Frank Eckhardt `frank.eckhardt@list.sachsen.de` 037207 832-652 | 3–9 Mon. | — | niedrig (verfahrensbezogen) / **hoch nur als GST-Dienst** | **P3** |
| 22 | **Autobahn GmbH** BAB-Bauwerksdaten | Alle BAB+B-Brücken mit Statik (GST.Autobahn-Kontext) | Datenlieferungs-/Kooperationsanfrage `autobahn.de/fuer-unternehmen` | 6–12 Mon. | — | **hoch** | **P3** |
| 23 | **BASt SIB-Bauwerke via Landesbetriebe** | **Bundesweite Traglast + Achslast** — der EINZIGE Weg | 17× Datenlieferungsvereinbarung (Bund + 16 Länder), koordiniert `post@bast.de` +49 2204 43-0 | 6–18+ Mon. | — | **sehr hoch** (einziger Achslast-Weg) | **P3** |
| — | ~~SIB-Bauwerke-Software (WPM, 2.200 €+)~~ | gibt Software, NICHT fremde Daten | **NICHT beschaffen** für Datenzugang | — | — | **null** | ✗ |
| — | ~~DB InfraGO ISR/IPID~~ (amtl. Bahnübergänge) | ~1.846 €/Jahr + ERegG-Zugang | unwirtschaftlich → OSM-Ersatz (#19) | — | — | — | ✗ |

---

## 2. Top-5-Sofort-Aktionen für Max

1. **Mobilithek-Account + Maschinenzertifikat beantragen** (`mobilithek.info/registration-request`).
   Kostenlos, Tage Aufwand. Schaltet ALLE Länder-DATEX-Feeds frei — der einzige Single-Point-of-Leverage
   für die temporäre Datenwelt. **Ohne das passiert nichts beim größten Hebel.**

2. **Nach Login: Baustellen-Abos der 5 leeren Länder** (BB, HB, NI, RP, TH) **+ HE + BY-Land**
   abonnieren und je Subscription-ID notieren. Das hebt temporär ~60 % → ~90 % auf einen Schlag.
   Ein einziger generischer DATEX-II-Pull-Connector bedient alle Abos (nur Config pro Land).

3. **Drei leere Flächenländer per Landesbetrieb-Mail** (höchster relativer Gewinn dauerhaft):
   - **Niedersachsen** — NLStBV Dez. 34, 0511 3034-2433 (NWSIB-Bauwerksexport)
   - **Rheinland-Pfalz** — `Daniel.Boden@lbm.rlp.de` (Brücken-Traglast + Negativliste)
   - **Thüringen** — `poststelle@tlvwa.thueringen.de` + TLBV Erfurt telefonisch
   Standard-Anfrage: GST-Negativliste > Bauwerksexport (Traglast/Höhe) > Baustellen-Feed; Lizenz dl-de/by-2.0.

4. **Zwei NC-/leere-Land-Mails als billige Unlocks** parallel:
   - **Brandenburg** `LS-GST@LS.Brandenburg.de` (leeres Land, niedriger Aufwand, Negativliste + Feed)
   - **Sachsen-Anhalt** LSBB/MID Kontaktformular (kommerzielle Freigabe des bereits laufenden Sperrinfo-WFS)

5. **BASt-SIB / Autobahn-GmbH-Anbahnung STARTEN** (langer Vorlauf, deshalb jetzt anstoßen):
   formelle Datenanfrage an `post@bast.de` + Autobahn GmbH. Das ist der **einzige** Weg zu bundesweiter
   Brückenstatik **und Achslast** — ohne ihn bleibt die dauerhafte Welt strukturell offen. Parallel die
   sofort offene **BASt-Brückenkarte** (CC-BY-Export) anbinden und Export-Felder real prüfen.

---

## 3. Abdeckungs-Projektion (realistische Schätzung)

| Stufe | Temporär | Dauerhaft (Traglast/Höhe) | Achslast | Kommentar |
|---|---|---|---|---|
| **Heute** | **~55–65 %** | **~25–35 %** | **<10 %** | 9/16 Länder + ~13 Städte offen temp.; 6/16 Länder offen bei Bauwerken; Achslast effektiv ungelöst |
| **+ Mobilithek** | **~85–90 %** | ~30 % (unverändert) | <10 % | BB/HB/NI/RP/TH + HE/BY-Land temp. geschlossen; **keine** Wirkung auf Bauwerke |
| **+ Länder-Anfragen** | **~90–93 %** | **~45–55 %** | <10 % | Restländer-Baustellen + erste Bauwerks-/Negativlisten in BW, NI, RP, TH, ST, MV, SH, HB, SL, BB; OSM-Ergänzung. Achslast bleibt ungelöst |
| **+ VEMAGS/BASt-SIB** | ~90–93 % | **~80–90 %** | **~80–90 %** | Bundesweite Bauwerksstatik + die einzige reale Achslast-Quelle. Längster Vorlauf (6–18+ Mon.), höchster fachlicher Wert |

**Lesart:** Mobilithek ist der schnelle, große, billige Sprung — aber **nur temporär**. Die fachlich
wertvollste Dimension (dauerhafte Bauwerksrestriktionen, v. a. Achslast) bewegt sich **erst** mit den
Länder-Anfragen (Teil-Sprung) und **vollständig nur** mit dem Behörden-Daten-Deal (VEMAGS/BASt-SIB).

---

## 4. Was bleibt strukturell schwierig (ehrlich)

1. **Achslast (`maxaxleload`)** — die kritischste Einzel-Lücke. OSM hat DE-weit nur ~2,3 k Tags
   (vs. ~105 k maxheight, ~87 k maxweight) — für Statik unbrauchbar. Es existiert **keine** offene
   Alternativquelle (verifiziert). Lösbar **ausschließlich** über BASt-SIB / VEMAGS / Landesbetriebe —
   Behörden-Datenvereinbarung, 6–18+ Monate, Realismus niedrig ohne offiziellen GST-Dienstleister-Status.

2. **Kommunale / Gemeinde-Ebene** — die Masse der ~11.000 Gemeinden ist nicht erfasst. Es gibt
   **kein** offenes kommunales Brückenregister (GovData-Suche: nur NRW state-level, schon im Katalog).
   Mittelstädte sind überwiegend Portal-Stubs ohne Maschinen-API (Frankfurt, Nürnberg, Wiesbaden,
   Mannheim, Augsburg, Magdeburg, Erfurt = tote Stubs). Innerorts auf Gemeinde-/Kreisstraßen trägt
   allein OSM (lückenhaft). Connector-Code ist nicht der Engpass — **fehlende offene Feeds** sind es.

3. **Bundesweiter Bauwerks-Layer offen** — existiert nicht. BASt-Brückenkarte ist offen, aber
   vermutlich ohne die GST-Kernwerte (Traglast/lichte Höhe/Achslast) und nur A+B-Brücken.

4. **Amtliche Bahnübergänge** — nur via BKG `wfs_bahn` (Bundesbehörden-only) oder DB ISR
   (~1.846 €/Jahr, ERegG) — unwirtschaftlich. Pragmatischer Ersatz: OSM `railway=level_crossing`.

5. **VEMAGS als reiner Aggregator** bringt wenig — es liefert nur verfahrensbezogene Daten (Route +
   Auflagen je Antrag), keinen flächigen Bauwerks-Katalog. Voller Wert **nur**, wenn Setreo selbst
   zum VEMAGS-angebundenen GST-Antrags-/Routing-Dienst wird (strategische Produktentscheidung).

---

## 5. Verifizierte Kontakte (kopierbar)

| Stelle | Kontakt |
|---|---|
| Mobilithek (Registrierung) | `https://mobilithek.info/registration-request` · BASt-Anleitung „Mobilithek nutzen" |
| Brandenburg LS-GST | `LS-GST@LS.Brandenburg.de` · Maik Dieling `Maik.Dieling@LS.Brandenburg.de` · 03342 249-1093 |
| Niedersachsen NLStBV Dez. 34 | Tel. 0511 3034-2433 (Call Center -2470) |
| Rheinland-Pfalz LBM | `Daniel.Boden@lbm.rlp.de` · LBM-Zentrale Koblenz |
| Thüringen Landesverwaltungsamt | `poststelle@tlvwa.thueringen.de` · 0361 57-3211000 · TLBV Erfurt telefonisch (Web CAPTCHA) |
| Schleswig-Holstein LBV.SH | `gst@lbv-sh.landsh.de` · Fr. Panschog 0431 383-2927 |
| Sachsen-Anhalt LSBB/MID | Kontaktformular `https://lsbb.sachsen-anhalt.de/` |
| Mecklenburg-V. LS M-V Dez. 32 | `lsmv@sbv.mv-regierung.de` · 0385 588-80370 |
| Baden-Württ. RP Tübingen Abt. 4 | `poststelle@rpt.bwl.de` · 07071 757-0 |
| Bremen ASV AG GST | Iris Döring `iris.doering@asv.bremen.de` · 0421 361-9529 |
| Saarland LfS | `poststelle@lfs.saarland.de` |
| BASt (Koordination Bauwerksdaten) | `post@bast.de` · +49 2204 43-0 · Brüderstraße 53, 51427 Bergisch Gladbach |
| LISt (VEMAGS-Integration) | Frank Eckhardt `frank.eckhardt@list.sachsen.de` · +49 37207 832-652 |
| Autobahn GmbH (für Unternehmen) | `https://www.autobahn.de/fuer-unternehmen` |

> *Einige Zentralen-Mailadressen (BW, SL, ST) folgen dem dokumentierten Behörden-Adressschema und
> sind im Erstkontakt zu bestätigen. Thüringen-Webseiten CAPTCHA-geschützt → Erstkontakt telefonisch.*

---

*Erstellt 2026-06-13. Synthese der vier Beschaffungs-Recherchen + Gap-Analyse. Keine erfundenen
URLs/Kontakte. „Software ≠ Daten" (SIB-Bauwerke) und „Achslast nur per Behörden-Deal" sind die
zwei wichtigsten ehrlichen Befunde.*
