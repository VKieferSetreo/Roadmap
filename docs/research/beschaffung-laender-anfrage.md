# Beschaffung — Länder- & Kommunal-Anfragen (was Max per Behörden-Anfrage bekommt)

> **Ziel:** Pro Bundesland OHNE offene GST-/Bauwerksdaten genau eine konkrete „Anfrage-Aktion"
> für Max — mit zuständiger Stelle, Kontakt (verifiziert wo möglich), was anfragbar ist,
> Aufwand und geschätztem Abdeckungsgewinn. Plus die zwei NC-lizenzierten Feeds (Sachsen-Anhalt
> LSBB, Bremen VMZ) und der Mobilithek-Beschaffungsweg.
>
> **Stand:** 2026-06-13 · Recherche via WebSearch + WebFetch. Kontaktdaten sind, wo nicht anders
> vermerkt, von den offiziellen Behördenseiten verifiziert. **Keine erfundenen URLs/Kontakte.**
> Quellen siehe Fußzeile.
>
> **Wichtiger fachlicher Kontext (gilt für ALLE Länder):** Die Erlaubnis von GST wird fast überall
> NICHT vom Landesbetrieb erteilt, sondern von den **Unteren Straßenverkehrsbehörden** (Landkreise /
> kreisfreie Städte) über **VEMAGS**. Der **Landesbetrieb Straßenbau** ist die **Anhörstelle** —
> er hält die **Bauwerks-/Brücken-Statik (SIB-Bauwerke)** und prüft die **Tragfähigkeit**. Genau
> dort sitzt das, was wir wollen: **Brücken-Traglast, Negativlisten gesperrter Bauwerke, GST-
> Routenfreigaben**. Anfragen also immer an den **Landesbetrieb / dessen Bauwerks-/GST-Stelle**,
> nicht an die Erlaubnisbehörde.

---

## 0. Anfrage-Strategie (gilt überall)

**Was Max konkret erbitten sollte (Reihenfolge nach Wert):**
1. **GST-Negativliste / Schwerlastsperren-Liste** — Brücken/Bauwerke, die für GST gesperrt oder
   lastbeschränkt sind (das exakteste Routing-Asset). Format: CSV/Shape/GeoJSON, sonst PDF.
2. **Bauwerks-/Brückenverzeichnis mit Restriktionen** — Export aus SIB-Bauwerke mit Bauwerksnummer
   (ASB), Lage, **zul. Gesamtgewicht / lichte Höhe / Tragfähigkeitsklasse (BK)**.
3. **Baustellen-Feed / DATEX-II-Endpunkt** — direkter Bezug oder Hinweis aufs Mobilithek-Angebot.

**Rechts-Hebel zum Mitnennen:** Verweis auf **PSI-/IWG-Richtlinie & Datennutzungsgesetz (DNG)**
sowie auf **„High-Value-Datasets" (HVD-Durchführungsverordnung, Geodaten/Mobilität)** — Behörden
sind zunehmend verpflichtet, vorhandene Daten maschinenlesbar bereitzustellen. Lizenz möglichst
**dl-de/by-2.0** erbitten (erlaubt kommerzielle Nutzung mit Quellenvermerk).

---

## 1. Pro Land — eine konkrete Anfrage-Aktion

### Baden-Württemberg — **kein offenes Bauwerks-/Negativ-WFS**
- **Zuständig (Anhör-/Bauwerksstelle):** **Regierungspräsidium Tübingen, Abteilung 4 „Mobilität,
  Verkehr, Straßen"** — koordiniert landesweit die GST-Genehmigungen/Anhörungen in BW (die vier RP
  Stuttgart/Karlsruhe/Freiburg/Tübingen teilen sich die Verkehrsaufgaben; **Tübingen = zentrale
  GST-Koordinierung**). Brücken-/SIB-Bauwerksdaten liegen bei den RP / der Landesstelle für
  Straßentechnik.
- **Kontakt:** RP Tübingen, Abt. 4 — `poststelle@rpt.bwl.de`, Tel. 07071 757-0 (Zentrale). Web:
  `https://rpt.baden-wuerttemberg.de/abteilungen/abteilung-4/`
- **Anfrage-Aktion:** Bei RP Tübingen (Abt. 4) **Export der landesweiten GST-relevanten Brücken-
  /Tragfähigkeitsdaten + etwaiger Negativ-/Sperrlisten** anfragen. BW arbeitet seit dem Erlass 2023
  mit flächendeckenden Dauererlaubnissen → es **muss** intern eine Liste der ausgenommenen/gesperrten
  Bauwerke geben. Lizenz dl-de/by-2.0 erbitten.
- **Aufwand:** mittel (RP-Apparat, evtl. Verweis an Landesstelle für Straßentechnik). **Gewinn:**
  hoch — schließt die **0 → erste** offene Bauwerks-/Negativ-Quelle für ein bevölkerungsstarkes Land.

### Brandenburg — **LEER (nur OSM)**
- **Zuständig:** **Landesbetrieb Straßenwesen Brandenburg (LS), Hoppegarten** — landesweit für GST
  zuständig (inkl. Autobahnen-Anhörung), eigene **GST-Stelle**.
- **Kontakt (verifiziert):**
  - GST-Stelle allgemein: `LS-GST@LS.Brandenburg.de`, Tel. 03342 249-1217
  - GST-Anliegen: **Maik Dieling**, `Maik.Dieling@LS.Brandenburg.de`, 03342 249-1093
  - Baustellen-Infosystem (Feed): `LS-Baustellen-Infosystem@LS.Brandenburg.de`, 03342 249-2997
- **Anfrage-Aktion:** Zwei-in-eins-Mail an `LS-GST@…`: (1) **Negativliste/Brücken-Traglastliste**
  der für GST gesperrten Bauwerke, (2) **maschinenlesbarer Export des Baustelleninformationssystems**
  (das ist nur als Web-Karte sichtbar, Feed nur auf Anfrage).
- **Aufwand:** niedrig (klare Stelle, E-Mail vorhanden). **Gewinn:** sehr hoch — schließt ein
  **komplett leeres** Land bei dauerhaft UND temporär.

### Bremen — **LEER (nur OSM)**
- **Zuständig:** **Amt für Straßen und Verkehr (ASV) Bremen — AG Großraum- und Schwertransporte**
  (Bauwerksportal `bruecken.bremen.de` intern). Bremerhaven separat.
- **Kontakt (verifiziert):** **Iris Döring** (AG GST), `iris.doering@asv.bremen.de`,
  Tel. 0421 361-9529. Allg. Kontaktformular: `https://www.asv.bremen.de/service/allgemeines-kontaktformular-7866`
  (Schema `Vorname.Nachname@ASV.Bremen.de`).
- **Anfrage-Aktion:** Bei der **AG GST** (Iris Döring) **Export der Brücken-/Bauwerksdaten mit
  Traglast + lichter Höhe** aus dem ASV-Bauwerksportal sowie eine **Liste lastbeschränkter/GST-
  gesperrter Bauwerke** anfragen. Zusätzlich beim ASV nach einem **VMZ-Bremen-Feed** (siehe §2)
  fragen.
- **Aufwand:** niedrig (Stadtstaat, namentlicher Ansprechpartner). **Gewinn:** mittel (kleines Netz,
  aber Hafen-Hinterland-relevant; schließt leeres Land).

### Mecklenburg-Vorpommern — **dünn (Baustellen offen, keine Bauwerke)**
- **Zuständig:** **Landesamt für Straßenbau und Verkehr M-V (LS M-V), Rostock — Dezernat 32
  „Großraum- und Schwertransporte"** (zentrale GST-Stelle des Landes).
- **Kontakt (verifiziert):** `lsmv@sbv.mv-regierung.de`, Tel. 0385 588-80370. Dez. 32 GST:
  `https://www.mv-serviceportal.de/leistung/?leistungId=106615828`
- **Anfrage-Aktion:** Bei Dez. 32 **Brücken-Tragfähigkeitsliste/Negativliste** + **Lizenzfreigabe
  für kommerzielle Nutzung des bereits offenen Baustellen-WFS** (`wfs_baustellenmv`; Urheberrecht
  derzeit unklar) anfragen. Beides in eine Mail.
- **Aufwand:** niedrig. **Gewinn:** mittel-hoch (legt den vorhandenen Feed rechtlich frei + erste
  Bauwerksdaten).

### Niedersachsen — **LEER (nur OSM)**
- **Zuständig:** **Nds. Landesbehörde für Straßenbau und Verkehr (NLStBV), Hannover — Dezernat 34
  „Verkehrsbehördliche Angelegenheiten, GST"** (zugleich Höhere Straßenverkehrsbehörde + Anhörstelle).
  Bauwerksdaten in **NWSIB-online** (gated).
- **Kontakt (verifiziert):** NLStBV, Dezernat 34, Göttinger Chaussee 76 A, 30453 Hannover.
  Tel. 0511 3034-2470 (Call Center) bzw. -2433; Fax -2099. Web:
  `https://www.strassenbau.niedersachsen.de/.../grossraum_und_schwertransporte/`
- **Anfrage-Aktion:** Bei Dez. 34 **NWSIB-Datenexport/Schnittstelle** für Bauwerke (Brücken,
  Traglast, lichte Höhe) + etwaige **GST-Negativliste** anfragen; zugleich nach **direktem VMZ-NI-
  Baustellen-Feed** fragen (sonst Mobilithek). NWSIB ist nur Login-Portal → Projekt-Datenfreigabe
  nötig.
- **Aufwand:** mittel (NWSIB-Freigabe = Verwaltungsakt). **Gewinn:** sehr hoch — Flächenland,
  aktuell **0** offen.

### Rheinland-Pfalz — **LEER (nur OSM)**
- **Zuständig:** **Landesbetrieb Mobilität Rheinland-Pfalz (LBM)** — prüft je Brücke die
  Tragfähigkeit für Schwertransporte; hält SIB-Bauwerke. DATEX über LBM-Knoten.
- **Kontakt:** Technischer Geo-Kontakt (aus Vor-Recherche verifiziert): `Daniel.Boden@lbm.rlp.de`.
  Themen-Einstieg Brücken/Schwertransport: `https://lbm.rlp.de/themen/bruecken/schwertransporte-ueber-bruecken`.
  Allg. Kontaktseite: `https://lbm.rlp.de/wichtigelinks/kontakt` (9 LBM-Standorte; **LBM-Zentrale
  Koblenz** = richtige Ebene für landesweite Daten). Hinweis: Auf der Brücken-Seite ist **kein**
  dedizierter GST-Ansprechpartner genannt → über `Daniel.Boden@…` oder Zentrale einsteigen.
- **Anfrage-Aktion:** Beim LBM (über `Daniel.Boden@lbm.rlp.de` / Zentrale Koblenz) **Brücken-
  Traglastdaten + Negativliste gesperrter Bauwerke** sowie den **DATEX-II-Endpunkt des LBM-Knotens**
  (Baustellen) anfragen. Der „Mobilitätsatlas RLP" ist nur JS-Frontend → echter Feed nur per LBM.
- **Aufwand:** mittel. **Gewinn:** sehr hoch — Flächenland, aktuell **0** offen.

### Saarland — **dünn (Baustellen offen, keine GST-Karte)**
- **Zuständig:** **Landesbetrieb für Straßenbau (LfS), Neunkirchen — Geschäftsbereich
  Verkehrsverwaltung** (GST), intern abgestimmt mit dem **Geschäftsbereich Ingenieurbauwerke**
  (Statik-Prüfung Brücken).
- **Kontakt (verifiziert):** LfS, Peter-Neuber-Allee 1, 66538 Neunkirchen. Poststelle (aus
  Vor-Recherche): `poststelle@lfs.saarland.de`. VEMAGS/GST-Seite:
  `https://www.saarland.de/lfs/DE/themen-aufgaben/vemags/vemags`
- **Anfrage-Aktion:** Beim LfS (Verkehrsverwaltung + Ingenieurbauwerke) **Liste lastbeschränkter/
  GST-gesperrter Brücken** und ggf. **JSON-Backend des Baustellenportals** (`baustellen.saarland`,
  Leaflet-Feed) bzw. dessen Lizenz/DATEX-Lieferung anfragen.
- **Aufwand:** niedrig (kleinstes Netz, eine Stelle). **Gewinn:** niedrig-mittel (kleines Land,
  aber vollständig schließbar).

### Sachsen-Anhalt — **dünn (LSBB-Feed NC-lizenziert, keine Bauwerke)**
- **Zuständig:** **Landesstraßenbaubehörde Sachsen-Anhalt (LSBB), Zentrale Magdeburg** (Präsident
  Stefan Hörold). Fachaufsicht: **Ministerium für Infrastruktur und Digitales (MID)**. Sperrinfo
  technisch von ifak/movi.de betrieben.
- **Kontakt:** LSBB-Zentrale Magdeburg über das **allgemeine Kontaktformular** auf
  `https://lsbb.sachsen-anhalt.de/` (Schema der Regionalbereiche: `Poststelle.<RB>@lsbb.sachsen-anhalt.de`,
  z. B. RB Mitte Magdeburg). MID als Lizenzgeber.
- **Anfrage-Aktion (DOPPELT — siehe auch §2):** (1) **Kommerzielle Nutzungsfreigabe** für den
  Sperrinfo-WFS (`service.ifak.eu/sperrinfo` — derzeit „non-commercial use only") schriftlich bei
  **LSBB/MID** einholen. (2) Gleichzeitig **Brücken-Traglast-/Negativliste** aus SIB-Bauwerke
  anfragen (fehlt bislang ganz).
- **Aufwand:** niedrig-mittel (Feed existiert sauber, nur Lizenz-Mail + Bauwerks-Anfrage).
  **Gewinn:** mittel-hoch (legt vorhandenen Feed frei + erste Bauwerke).

### Schleswig-Holstein — **dünn (Baustellen/Umleitungen offen, keine Bauwerke)**
- **Zuständig:** **Landesbetrieb Straßenbau und Verkehr Schleswig-Holstein (LBV.SH), Kiel** —
  zentrale Erlaubnis-/Anhörstelle + Bauwerksprüfung; **eigene zentrale GST-Stelle**.
- **Kontakt (verifiziert):** GST-Sammeladresse `gst@lbv-sh.landsh.de`; Ansprechpartnerin Fr.
  **Panschog**, Tel. 0431 383-2927. (Straßennetz-Geo: Christina Buchholz, 0431 383-2913.)
- **Anfrage-Aktion:** Bei `gst@lbv-sh.landsh.de` **Brücken-/Bauwerksverzeichnis mit Traglast +
  lichter Höhe** und **Negativliste gesperrter Bauwerke** anfragen (Baustellen/Umleitungen sind
  bereits offen als WFS). Restriktionsattribute des Straßennetz-WFS per DescribeFeatureType
  parallel prüfen.
- **Aufwand:** niedrig (eine zentrale GST-Mailadresse). **Gewinn:** mittel-hoch (ergänzt das
  fehlende Bauwerks-Layer in einem sonst gut versorgten Land).

### Thüringen — **LEER (nur OSM)**
- **Zuständig (zwei Stellen):**
  - **Erlaubnis/GST-Verfahren:** **Thüringer Landesverwaltungsamt** (Referat Verkehr „Großraum-
    und Schwerlastverkehr") — zentrale Erlaubnisbehörde des Landes.
  - **Bauwerke/Straßenbau:** **Thüringer Landesamt für Bau und Verkehr (TLBV), Erfurt** (hält SIB-
    Bauwerke + Baustelleninformationssystem, das CAPTCHA-geschützt ist).
- **Kontakt:** Landesverwaltungsamt: `poststelle@tlvwa.thueringen.de`, Weimarplatz 4, 99423 Weimar,
  Tel. 0361 57-3211000 (Hinweis: Web CAPTCHA-geblockt → Erstkontakt per Poststelle-Mail/Telefon).
  TLBV Erfurt: über `https://bau-verkehr.thueringen.de/wir/standorte` (ebenfalls CAPTCHA — Telefon
  Zentrale Erfurt nutzen).
- **Anfrage-Aktion:** Beim **TLBV (Bauwerksstelle)** **Brücken-Traglast-/Negativliste** + **Export/
  Feed des Baustelleninformationssystems** anfragen (der Web-Feed ist CAPTCHA-blockiert → direkter
  Datenexport nötig); beim **Landesverwaltungsamt** ergänzend nach GST-relevanten Streckenfreigaben.
- **Aufwand:** mittel (zwei Stellen, CAPTCHA erzwingt Telefon/Post-Erstkontakt). **Gewinn:** sehr
  hoch — Flächenland, aktuell **0** offen.

---

## 2. Die NC-lizenzierten offenen Feeds — kommerzielle Nutzungsvereinbarung

Beide Feeds sind **technisch sofort nutzbar** (sauberes GeoJSON/WFS, HTTP 200), aber lizenzrechtlich
auf **nicht-kommerzielle Nutzung** beschränkt. Für ein kommerzielles Routing-Produkt braucht Max je
eine **schriftliche Freigabe** — das ist der schnellste „Unlock".

### LSBB Sachsen-Anhalt — Sperrinfo-WFS (`service.ifak.eu/sperrinfo`)
- **Lizenz live bestätigt:** AccessConstraints = *„This service is for non-commercial use only."*
- **Prozess:** Schriftliche Anfrage an **LSBB (Datengeber)** bzw. **MID Sachsen-Anhalt (Fachaufsicht/
  Lizenzgeber)** auf **kommerzielle Nutzungsvereinbarung**. Kanal: allg. Kontaktformular auf
  `lsbb.sachsen-anhalt.de` bzw. Poststelle des zuständigen Regionalbereichs. Inhaltlich: Zweck
  (GST-Routing), Datenumfang (Sperrinfo WFS), gewünschte Lizenz (idealerweise dl-de/by-2.0 oder
  individuelle kommerzielle Lizenz). Technischer Betreiber **ifak/movi.de** kann den WFS bereitstellen,
  die Freigabe erteilt aber LSBB/MID.
- **Aufwand:** niedrig (Daten existieren, reine Lizenz-Mail). **Gewinn:** mittel-hoch.

### VMZ Bremen / ASV-Verkehrslage
- **Status:** VMZ Bremen ist nur Web-Portal; ein offener strukturierter Feed/DATEX ist nicht
  publiziert → liefert ohnehin **per Anfrage**.
- **Prozess:** Über die **AG GST / das ASV Bremen** (`iris.doering@asv.bremen.de` oder allg.
  Kontaktformular) **strukturierten Baustellen-/Verkehrslage-Feed (DATEX/JSON) + Nutzungserlaubnis**
  erbitten; in dieselbe Mail wie die Bauwerks-Anfrage (§1) packen.
- **Aufwand:** niedrig. **Gewinn:** mittel.

> **Üblicher Prozess (beide):** formlose, aber präzise E-Mail an die Datengeber-Stelle mit
> (a) Antragsteller + Zweck, (b) genauem Datensatz/Endpunkt, (c) gewünschter Lizenz (dl-de/by-2.0
> bevorzugt), (d) Hinweis auf PSI/DNG/HVD. Behörden erteilen kommerzielle Freigaben i. d. R. per
> individueller Nutzungsvereinbarung oder durch Umstellung auf eine offene Lizenz.

---

## 3. Mobilithek (NAP) — der eine Account, der temporär ~60 % → ~90 % hebt

Für die **temporären** Daten (Baustellen/Sperrungen aller Länder, inkl. der leeren BB/HB/NI/RP/TH
sowie HE/BY-Land) ist die **Mobilithek** der zentrale Hebel — ein Account statt 16 Einzel-Connectoren.

- **Plattform:** `https://mobilithek.info/` (BMV/BASt). Registrierung:
  `https://mobilithek.info/registration-request`. Anleitung der BASt: „Mobilithek nutzen"
  (`bast.de/.../Datenbezug`).
- **Prozess (2 Schritte, verifiziert):**
  1. **Nutzerkonto** anlegen (institutionelle E-Mail nutzen, Verifizierungslink, Profil + AGB/
     Datenschutz bestätigen).
  2. **Organisation** registrieren/anlegen — Freischaltung wird von der Mobilithek geprüft; danach
     Rolle „Organisationsverwaltung".
  3. Pro Datenangebot **„abonnieren"** (= Zugang beantragen). Je Datensatz gilt eine eigene
     **Nutzungsvereinbarung** des jeweiligen Datengebers.
- **Technik:** Abruf via **DATEX-II HTTPS / SOAP-Pull**; für den SOAP-Pull-Abruf wird ein
  **Client-Zertifikat** verwendet, das Broker-Server-Zertifikat ist von MDM-eigenen CAs ausgestellt
  (gegen deren CA-Zertifikate prüfen). Subscription-ID steuert den Pull.
- **Kommerzielle Nutzung:** hängt **je Datenangebot** an der Nutzungsvereinbarung des Datengebers —
  bei Anmeldung/Abo angeben und prüfen; viele Länder-Roadworks sind dl-de/by-2.0.
- **Aufwand:** einmalig mittel (Registrierung + Organisation-Freischaltung + Zertifikat + je Feed
  ein Abo). Danach **eine** Pipeline. **Gewinn:** der größte Sofort-Hebel auf der temporären Seite
  (BB, HB, NI, RP, TH, HE, BY-Land auf einen Schlag).

---

## 4. Priorisierte Beschaffungs-Reihenfolge für Max

| # | Aktion | Stelle / Kanal | Aufwand | Gewinn |
|---|---|---|---|---|
| 1 | **Mobilithek-Account** + je Land Roadworks abonnieren | mobilithek.info (Reg. + Org. + Zertifikat) | einmalig mittel | temporär ~60 %→~90 % (5–7 Länder) |
| 2 | **Brandenburg** GST-Negativliste + Baustellen-Feed | `LS-GST@LS.Brandenburg.de` | niedrig | leeres Land komplett |
| 3 | **Niedersachsen** NWSIB-Bauwerksexport + VMZ-Feed | NLStBV Dez. 34, 0511 3034-2433 | mittel | Flächenland, 0→aktiv |
| 4 | **Rheinland-Pfalz** Brücken-Traglast + LBM-DATEX | `Daniel.Boden@lbm.rlp.de` / LBM Koblenz | mittel | Flächenland, 0→aktiv |
| 5 | **Thüringen** Bauwerks-/Baustellenexport | TLBV Erfurt (Tel.) + `poststelle@tlvwa.thueringen.de` | mittel | Flächenland, 0→aktiv |
| 6 | **Schleswig-H.** Bauwerksverzeichnis + Negativliste | `gst@lbv-sh.landsh.de` | niedrig | Bauwerks-Layer ergänzt |
| 7 | **Sachsen-Anhalt** NC-Freigabe + Bauwerksliste | LSBB/MID Kontaktformular | niedrig | Feed legalisiert + Bauwerke |
| 8 | **Mecklenburg-V.** WFS-Lizenz + Bauwerksliste | `lsmv@sbv.mv-regierung.de` (Dez. 32) | niedrig | Feed legalisiert + Bauwerke |
| 9 | **Baden-Württ.** Bauwerks-/Negativexport | RP Tübingen Abt. 4, `poststelle@rpt.bwl.de` | mittel | erste BW-Bauwerksdaten |
| 10 | **Bremen** Bauwerksexport + VMZ-Feed | `iris.doering@asv.bremen.de` | niedrig | leeres Land komplett |
| 11 | **Saarland** GST-Brückenliste + Portal-Lizenz | `poststelle@lfs.saarland.de` | niedrig | kleines Land komplett |

> **Faustregel:** Mobilithek zuerst (größter Hebel temporär, einmaliger Aufwand). Dann die **drei
> leeren Flächenländer** (NI, RP, TH) per Landesbetrieb-Mail, weil dort der relative Gewinn am
> größten ist. Die NC-Feed-Freigaben (ST, MV) sind „billige" Unlocks vorhandener Daten. BW/BB/HB/SL
> schließen die Restlücken.

---

### Quellen (verifiziert 2026-06-13)
- LS Brandenburg GST: https://www.ls.brandenburg.de/ls/de/verwalten/grossraum-und-schwertransporte/
- ASV Bremen AG GST: https://www.asv.bremen.de/service/formulare_und_antraege/ag_gross__und_schwertransport-2360
- NLStBV GST (Dez. 34): https://www.strassenbau.niedersachsen.de/startseite/aufgaben/strassenverkehr/grossraum_und_schwertransporte/grossraum-und-schwertransporte-78553.html
- LBM RLP Schwertransporte über Brücken: https://lbm.rlp.de/themen/bruecken/schwertransporte-ueber-bruecken
- LfS Saarland VEMAGS/GST: https://www.saarland.de/lfs/DE/themen-aufgaben/vemags/vemags
- LS M-V (Dez. 32 GST): https://www.strassen-mv.de/de/ueber-uns/landesamt/kontakt/ · https://www.mv-serviceportal.de/leistung/?leistungId=106615828
- LBV.SH GST: https://www.schleswig-holstein.de/DE/landesregierung/ministerien-behoerden/LBVSH/Aufgaben/StrassenverkehrsrechtStrassenrecht/Strassenverkehrsrecht/grossraum_schwertransporte.html
- LSBB Sachsen-Anhalt: https://lsbb.sachsen-anhalt.de/ · https://lsbb.sachsen-anhalt.de/service/baustellen-und-umleitungen
- Thüringen GST (Landesverwaltungsamt): https://landesverwaltungsamt.thueringen.de/verkehr/strassenverkehr/grossraum-und-schwerlastverkehr · TLBV: https://bau-verkehr.thueringen.de/
- RP Tübingen Abt. 4: https://rpt.baden-wuerttemberg.de/abteilungen/abteilung-4/
- Mobilithek Registrierung: https://mobilithek.info/registration-request · BASt-Anleitung: https://www.bast.de/DE/Publikationen/Daten/VerhaltenundSicherheit/MDC/Datenbezug/Datenbezug_node.html · Tech. Schnittstelle (Zertifikat): https://mobilithek.info/cms/assets/1e4c3f3d-e6c5-4844-a11d-7dd589bb9133

*Hinweis: Telefon/E-Mail wo möglich von offiziellen Behördenseiten verifiziert; einige Zentralen-
Mailadressen (BW poststelle@rpt.bwl.de, SL poststelle@lfs.saarland.de, ST Poststellen-Schema) folgen
dem dokumentierten Behörden-Adressschema und sind im Erstkontakt ggf. zu bestätigen. Thüringen-Webseiten
sind CAPTCHA-geschützt → dort Erstkontakt telefonisch/per Poststelle.*
