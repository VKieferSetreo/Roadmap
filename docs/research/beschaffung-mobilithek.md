# Beschaffung: Mobilithek (NAP) — DATEX-II-Feed-Katalog & Integrations-Checkliste

> **Zweck:** Konkret benennen, was Max über die Mobilithek (ehem. MDM, mobilithek.info) beschaffen
> kann, um die größte offene Abdeckungslücke bei **temporären** GST-Daten (Baustellen / Sperrungen /
> Verkehrslage / Durchfahrtsbeschränkungen) zu schließen — v. a. die 5 leeren Länder
> **BB, HB, NI, RP, TH** plus **HE/BY** (Land nur gated).
>
> **Stand:** 2026-06-13 · Primärquelle = **Mobilithek Technische Schnittstellenbeschreibung
> v1.3.2 (07.11.2025)**, BASt-Anleitung „Mobilithek nutzen", DATEX-II-Doku (docs.datex2.eu),
> German Roadworks/Traffic Data Profile (repo.datex2.eu). Verifizierte URLs am Ende.
> **Ehrlich:** Konkrete Angebots-IDs je Land sind aus dem offenen Web **nicht** abrufbar — die
> Angebots-Detailseiten (`/offers/<id>`) sind JS-gerendert und ohne eingeloggtes Konto nicht
> crawlbar. Das Katalog-Mapping je Land macht Max **nach Login** (Schritt 0 unten).

---

## 0. Executive Summary — was bucht Max?

Die Mobilithek ist **ein einziger Account + ein Client-Zertifikat**, danach abonniert man **je
Angebot** einzeln. Ein Connector-Codepfad bedient alle Abos (gleicher Pull-Endpunkt, gleiches
DATEX-II-Parsing). Das ist der mit Abstand günstigste Hebel: **statt 16 Einzel-Connectoren ein
generischer DATEX-II-Pull-Connector + n Abo-Konfigurationen.**

| Was | Beschaffungsweg | Aufwand | Abdeckungsgewinn |
|---|---|---|---|
| **Mobilithek-Account + Maschinenzertifikat** (Voraussetzung für alles) | Registrierung + Org-Zuordnung + Zertifikatsantrag (SMS-PIN) | **niedrig** (Tage, Behörden-Approval) | enabler |
| **Länder-Baustellen/Sperrungen-Angebote** der 5 leeren Länder (BB, HB, NI, RP, TH) | je Angebot „Abonnieren" → Datengeber-Freigabe | mittel (n × Abo-Antrag) | **+5 Länder temporär** → größter Einzelsprung |
| **HE + BY Landes-Baustellen** (heute nur gated) | dito | niedrig | +2 starke Länder temporär |
| **Verkehrslage/Verkehrsmeldungen** der Landesmeldestellen | dito | niedrig | qualitative Verdichtung |
| **Autobahn-GmbH-DATEX** (Bund, redundant zur REST-API) | dito | niedrig | redundant — nur falls REST-API ausfällt |

**Netto:** temporäre Datenwelt von heute ~60 % auf realistisch **~90 %** (deckt sich mit der
Schätzung in `ABDECKUNG-UND-GAPS.md` §5). **Keine** Wirkung auf die dauerhafte Bauwerkslücke
(Traglast/Höhe/Achslast) — das bleibt VEMAGS/BASt-SIB-Thema.

---

## 1. Zugangsmechanik (verifiziert aus BASt-Anleitung + TSSB v1.3.2)

### 1.1 Registrierung & Rollen
1. **User-Registrierung** mit (institutioneller) E-Mail → Verifizierungslink → Profil (Name,
   Passwort, Sprache, AGB).
2. **Organisation**: Account muss einer Organisation zugeordnet sein.
   - Existiert die Org nicht → „Organisation registrieren" → **Mobilithek-Approval per E-Mail** →
     man erhält automatisch Rolle **„Organisationsadministration"**.
   - Existiert sie → von einem Org-Admin einladen lassen.
3. **Rollen** (im Org-Kontext vergeben):
   - **„Bestellmanagement"** = Pflicht, um Angebote zu **abonnieren** (frühere Notiz „Order
     Manager" meint genau diese Rolle).
   - **„Organisationsadministration"** = mind. eine Person; beantragt u. a. das Maschinenzertifikat.
   - „Angebotsmanagement" = nur falls man **selbst** Daten anbietet (für uns irrelevant).
4. **Kosten:** „Die Nutzung der Mobilithek ist kostenlos."

### 1.2 Abonnieren eines Angebots
1. Auf der Angebots-Detailseite **„Abonnieren"** klicken → Lizenz/Bedingungen prüfen → bestätigen.
2. **Der Datengeber/BASt prüft die Berechtigung** (gemäß Lizenz; bei „Open Data" i. d. R.
   automatisch, bei zugriffsbeschränkten Angeboten Datennutzungsvereinbarung).
3. E-Mail mit Freigabe/Ablehnung. Danach erscheint das Abo unter **„Meine Abonnements"** und liefert
   eine **Subskriptions-ID** — die ist der Schlüssel für den Pull (siehe §2).
4. **Wichtig (Lizenzfalle):** Viele Verkehrs-Angebote sind „Open Data" (DL-DE→Zero/BY), manche aber
   **NC / mit Datennutzungsvereinbarung** (vgl. VMZ Bremen, LSBB Sachsen-Anhalt in unserem Katalog).
   Pro Abo Lizenz prüfen, sonst nicht produktiv nutzbar.

### 1.3 Maschinenzertifikat (mTLS) — der eigentliche M2M-Schlüssel
- Über die **Administrations-GUI** beantragt der **Org-Admin** ein oder mehrere
  **Maschinenzertifikate** (X.509v3).
- Das Zertifikat wird von der Mobilithek **erstellt und per E-Mail** zugesandt; das **Signatur-/
  Entschlüsselungs-Passwort kommt per SMS** an die hinterlegte Mobilnummer (→ Mobilnummer ist Pflicht).
- Auslieferung typischerweise als **`.p12`-Datei** (Maschinenzertifikat **+** Ausstellerzertifikat).
  Beide müssen aus der p12 extrahiert und im Client hinterlegt werden (Apache-Beispiel im TSSB
  Anhang A: `SSLCertificateFile`, `SSLCertificateKeyFile`, `SSLCACertificateFile`).
- **Für unseren Node-Connector** heißt das: client cert + key + CA-bundle in den HTTPS-Agent
  (`https.Agent({ cert, key, ca, passphrase })`). Die mit SMS-PIN verschlüsselte Key-Datei einmal
  entschlüsseln/umpacken.
- Zertifikate werden **gegen Gültigkeit + Sperrliste** geprüft; Org muss Eigentümer der Subskription
  sein. **Ablaufdatum überwachen** (sonst stiller 403).

---

## 2. Bezugsweg & exakter Endpunkt (für den Connector)

### 2.1 Operationsmodi (TSSB Tab. 7)
| Modus | Wer initiiert | Für uns |
|---|---|---|
| **Client Pull** | **Datennehmer** (wir) pollen die Mobilithek | **← das nehmen wir** (Cron-tauglich) |
| Publisher Push Periodic | Mobilithek pusht in festem Intervall | braucht erreichbaren Server bei uns — meiden |
| Publisher Push on Occurrence | Mobilithek pusht bei Änderung | dito |

→ Cron-Architektur = **Client Pull**. Wir brauchen keinen offenen Inbound-Port.

### 2.2 Der Pull-Endpunkt (Datennehmer, REST, verifiziert TSSB §6.2.1)
```
GET https://mobilithek.info:8443/mobilithek/api/V1.0/subscription?subscriptionID=<SUBSKRIPTIONS-ID>
Host: mobilithek.info
Accept-Encoding: gzip
If-Modified-Since: <letzter Last-Modified-Wert>     # Delta-Polling, dringend empfohlen
# + mTLS Client-Zertifikat im TLS-Handshake
```
- Antwort: `200 OK` mit Content-Type des Angebots (z. B. DATEX-II-XML), **gzip**-komprimiert,
  Body = das Datenpaket.
- **`If-Modified-Since`/`Last-Modified`**: Bei unveränderten Daten → **`304 Not Modified`**
  (spart Bandbreite, ideal fürs Cron-Polling). Wert aus dem vorigen `Last-Modified`-Header
  mitsenden.
- **Statuscodes mit Sonderbedeutung** (TSSB Tab. 11): `204` kein Paket im Puffer · `304` nichts
  Neues · `400` Param fehlt/fehlerhaft · `403` nicht autorisiert/Publikation nicht über Endpunkt ·
  `404` Subskription ungültig **oder max. Zugriffszahl überschritten** · `405` `subscriptionID`
  fehlt · `406` `gzip` nicht im Accept-Encoding. → **Connector muss `Accept-Encoding: gzip`
  zwingend setzen** und 304 als „kein Update" behandeln (kein Fehler).

### 2.3 Protokoll-/Format-Optionen
- **REST/HTTPS** (oben) = Standardweg, beliebige Payload, unterstützt Delta-Handling. **→ unser Weg.**
- **SOAP** (DATEX II v2 *und* v3, Pull/Push WSDLs im Mobilithek-Download-Bereich) = Legacy, nur falls
  ein Angebot ausschließlich SOAP anbietet.
- **OCIT-C** (v1.1_R1) = nur DATEX II **v2**, nur Legacy-Datengeber. Für uns irrelevant.
- **Transport:** TLS 1.2/1.3 Pflicht, X.509v3-Clientauth; Cipher-Suite-Liste fix vorgegeben
  (AES-GCM/CBC, ECDHE/RSA/ECDSA). Keine Basic-Auth.

---

## 3. Datenformat: DATEX II — was der Connector parsen muss

### 3.1 Versionen & Profile (verifiziert)
- Mobilithek unterstützt **DATEX II v2 (XML) und v3 (XML oder JSON)**. Schemas referenziert über
  `schemaLocation` (XML) bzw. `$schema` (JSON) der jeweiligen Publikation — **die Mobilithek selbst
  wertet die Daten nicht aus**, sie leitet nur durch. → Connector muss das in der Publikation
  hinterlegte Schema/Profil kennen.
- **National Identifier:** DATEX-II-Element `nationalIdentifier` = `DE-NAP-<Organisation>` (neu) bzw.
  `DE-MDM-<Organisation>` (alt, weiter gültig). → identifiziert den Datengeber/Land im Feed.
- **Maßgebliche Profile** (deutsche, auf MDM/Mobilithek publiziert):
  - **German Roadworks Profile** (MDM-Version 04-00-00) → Baustellen/Sperrungen.
  - **German Traffic Data Profile** → Verkehrslage/Verkehrsmeldungen.
  - Location-Referencing in den deutschen Profilen klassisch **ALERT-C** (TMC), zunehmend auch
    GML-Koordinaten/Linear (v3). **Achtung:** ALERT-C liefert **keine** Lon/Lat direkt — es referenziert
    TMC-Location-Codes → braucht eine **TMC-Location-Code-List (LCL Deutschland)** zum Auflösen in
    Koordinaten. Das ist die wichtigste technische Hürde (siehe Checkliste §5).

### 3.2 DATEX-II-XML-Struktur (was extrahieren)
```
d2:payloadPublication (SituationPublication)
└─ situation (= Container; @id = stabile Situation-ID)
   └─ situationRecord  (Typ z. B. ConstructionWorks / MaintenanceWorks / RoadOrCarriagewayOrLaneManagement /
                        GeneralNetworkManagement / NetworkRestriction)
      ├─ @id, version, situationRecordCreationTime
      ├─ validity → validityStatus (active|planned|definedByValidityTimeSpec)
      │            → validityTimeSpecification → overallStartTime / overallEndTime
      │                                        → validPeriod / recurringTimePeriod
      ├─ locationReference  → (a) ALERT-C: alertCPoint/alertCLinear + TMC-Codes
      │                       (b) GML: pointCoordinates (latitude/longitude)
      │                       (c) linear: linearWithinLinearElement (von/bis)
      └─ <restriktive Felder, je Record-Typ>:
          • RoadOrCarriagewayOrLaneManagement → laneNumber, laneUsage, carriageway, *Closed*
          • NetworkManagement/Restriction      → roadOrCarriagewayOrLaneManagementType,
                                                  vehicleObstruction, …
          • Maße/Gewichte (GST-relevant!)      → maximumWidth / maximumHeight / maximumLength /
                                                  maximumGrossWeight / maximumAxleWeight
                                                  (als VehicleCharacteristics / RestrictionForVehicles)
```
**Mapping in unsere Hindernis-DB:**
- **Koordinaten** ← locationReference (GML direkt; ALERT-C via LCL-Auflösung).
- **validity** ← `overallStartTime`/`overallEndTime` → unsere `gueltig_von`/`gueltig_bis`;
  `validityStatus=planned` → als geplant flaggen, nicht als aktive Sperre.
- **restriction-Werte** ← `maximumWidth/Height/Length/GrossWeight/AxleWeight` → unsere
  `maxbreite/maxhoehe/maxlaenge/maxgewicht/maxachslast` (GST-kritisch!).
- **Typ** ← Record-Typ (ConstructionWorks=Baustelle, *Closed*=Sperrung,
  NetworkRestriction=Durchfahrtsbeschränkung).
- **Stable ID / Dedup** ← `situation@id` + `situationRecord@id` + `version` (Versionierung beachten:
  neue `version` = Update desselben Records, nicht neuer Datensatz).

### 3.3 Container-Format (Sonderfall)
Manche MDM-Altangebote nutzen das **MDM-Containerformat** (`bc:containerRootElement` → `bc:header` +
`bc:body`); die DATEX-II-Nutzlast steckt dann im `body`. Connector muss optional auspacken.

---

## 4. Was liegt im Katalog? (ehrlicher Stand + Beschaffungs-Vorgehen)

**Belegt:** Stand 09/2025 hat die Mobilithek **~14.300 Datenangebote** (11.800 davon Open Data von
1.900 Organisationen). Verkehr/Baustellen/Sperrungen/Verkehrslage werden dort von **Autobahn GmbH,
Bund und Landesmeldestellen** in DATEX II publiziert. Unsere eigene `STATUS.md` listet bereits die
**konkret als Mobilithek-Knoten identifizierten** Geber:

| Land | Bei uns als Mobilithek-gated vermerkt | Angebot/Notiz aus STATUS.md |
|---|---|---|
| **Bayern** | BayernInfo/ArbIS (Baustellen) + VIZ (Verkehrsmeldungen) | Angebote „…2507001 / …2506…" referenziert |
| **Berlin** | Berlin-Publikation (Baustellen/Verkehrsmeldungen) | DATEX II SOAP/Pull |
| **Niedersachsen** | NI als Datengeber (VMZ NI / NLStBV) | DATEX II v2/v3 |
| **Sachsen-Anhalt** | ST-Baustellen + RSA-21-Meldungen | DATEX II SOAP/Pull (NC-Lizenz beachten!) |
| **Bremen** | VMZ Bremen | nur über Mobilithek |
| **Brandenburg / Thüringen / Hessen** | LS-BB / TLBV / Hessen Mobil | publizieren an Mobilithek statt offenem Feed |

> **Warum keine harten Angebots-IDs hier:** Die Angebots-Detailseiten
> (`https://mobilithek.info/offers/<id>`) sind eine JS-SPA und ohne eingeloggtes Konto nicht
> auslesbar; eine offene Katalog-Such-API gibt es nicht öffentlich. **Das Land→Angebots-ID-Mapping
> macht Max nach Login** über die Volltext-/Themen-Suche (12.000+ Angebote, Filter „Verkehr/
> Baustellen", Themengebiet). Pro relevantem Land das Baustellen- **und** das Verkehrsmeldungs-
> Angebot abonnieren und die **Subskriptions-ID** notieren — die kommt dann in die Connector-Config.

### 4.1 Konkrete Abo-Empfehlung (Priorität für max. Abdeckung)
1. **Pflicht zuerst:** je 1 Baustellen-Angebot der **5 leeren Länder** BB, HB, NI, RP, TH →
   schließt die größte Lücke (jeweils von 0 → Landesdeckung).
2. **HE + BY Land** Baustellen → die zwei „nur-gated"-Länder aktivieren.
3. **Verkehrsmeldungen/Verkehrslage** derselben Länder → Sperrungen/Umleitungen verdichten.
4. **Optional:** Sachsen-Anhalt + Bremen über Mobilithek **nur** mit geklärter Lizenz (NC!).
5. **Skip:** Autobahn-GmbH-DATEX (redundant zur bereits laufenden REST-API) — nur als Fallback.

---

## 5. Technische Integrations-Checkliste (Connector `mobilithek-datex.cron.mjs`)

- [ ] **Account/Org/Rolle** „Bestellmanagement" + „Organisationsadministration" vorhanden.
- [ ] **Maschinenzertifikat** beantragt, `.p12` erhalten, SMS-Passwort genutzt, in cert/key/ca
      zerlegt. Ablaufdatum in Monitoring.
- [ ] **HTTPS-Agent** mit `{ cert, key, ca, passphrase }`, TLS 1.2/1.3, vorgegebene Cipher-Suites.
- [ ] **Pull** `GET …:8443/mobilithek/api/V1.0/subscription?subscriptionID=<id>` je Abo, mit
      `Accept-Encoding: gzip` (Pflicht, sonst 406) + `If-Modified-Since`.
- [ ] **304/204** als „kein Update" behandeln (kein Error); **403/404** alarmieren (Abo abgelaufen/
      Cert gesperrt/Limit). **gzip** dekomprimieren.
- [ ] **DATEX-II-XML-Parser** (z. B. `fast-xml-parser`): `payloadPublication` → `situation` →
      `situationRecord`. v2 **und** v3 (Namespaces unterscheiden!) tolerieren. Container-Format
      optional auspacken.
- [ ] **Location:** GML-Koordinaten direkt nutzen; **ALERT-C** über **TMC-Location-Code-Liste DE**
      (von BASt) auflösen — ohne LCL liefern reine ALERT-C-Feeds keine Koordinaten. (Das ist der
      Hauptaufwand; ggf. Länder mit GML-Feeds zuerst integrieren.)
- [ ] **Validity:** `overallStartTime/EndTime` → `gueltig_von/bis`; `validityStatus=planned` flaggen.
- [ ] **Restriktionen:** `maximumWidth/Height/Length/GrossWeight/AxleWeight` → unsere Maß-Felder.
- [ ] **Dedup/Versionierung:** `situation@id`+`situationRecord@id`+`version` als stabiler Key.
- [ ] **Provenienz:** `nationalIdentifier` (DE-NAP-/DE-MDM-) + Subskriptions-ID je Datensatz speichern.
- [ ] **Lizenz** je Abo in Metadaten hinterlegen (Open Data vs. NC/Datennutzungsvereinbarung).

**Architektur:** EIN Connector-Modul, Liste von `{ subscriptionID, land, profil(v2|v3), lizenz }` als
Config. Jede neue Land-Freischaltung = neuer Config-Eintrag, **kein** neuer Code.

---

## 6. Grenzen / Ehrlichkeit

- **Keine Wirkung auf dauerhafte Bauwerksdaten** (Traglast/lichte Höhe/Achslast). Mobilithek =
  temporäre Datenwelt. Brückenstatik bleibt VEMAGS/BASt-SIB (separates Beschaffungsthema).
- **ALERT-C-Abhängigkeit** ist die reale technische Hürde: ohne aktuelle TMC-LCL Deutschland keine
  Koordinaten aus den klassischen Feeds. v3-Feeds mit GML sind einfacher → für die Reihenfolge nutzen.
- **Lizenz-Heterogenität:** nicht alles ist frei nachnutzbar (NC-Angebote). Pro Abo prüfen.
- **Angebots-IDs erst nach Login** ermittelbar — diese Recherche liefert die Mechanik + Prioritäten,
  nicht die fertige ID-Liste.

---

## 7. Quellen (verifiziert)

- Mobilithek **Technische Schnittstellenbeschreibung v1.3.2 (07.11.2025)** —
  https://mobilithek.info/cms/downloads/tssb-de (Endpunkt, mTLS, Operationsmodi, Statuscodes,
  Zertifikatsprozess; alle §-Verweise oben daraus).
- BASt **„Anleitung – Mobilithek nutzen"** —
  https://www.bast.de/DE/Publikationen/Daten/VerhaltenundSicherheit/MDC/Datenbezug/Datenbezug_node.html
  (Registrierung, Rollen „Bestellmanagement"/„Organisationsadministration", Abo-Prozess, kostenlos).
- **Mobilithek DATEX-II-FAQ** — https://mobilithek.info/help/faq-datex-ii ·
  Blog „DATEX II v3 verfügbar" — https://mobilithek.info/blog/datex-2-version-3
- **DATEX II Roadworks RRP** — https://docs.datex2.eu/recommended-profiles/rrp/rtti/rtti-962/drd-5-roadworks/
  · Situation/SituationPublication — https://docs.datex2.eu/v3.3/situation/
- **German Roadworks Profile** (MDM 04-00-00) — https://www.datex2.eu/d2-profile/2017/09/06/663 ·
  **German Traffic Data Profile** — https://repo.datex2.eu/implementations/profile_directory/german-traffic-data-profile
- **MDM DATEX-II-Profile-Übersicht** — https://www.mdm-portal.de/en/service/help/datex-ii-profile.html
- LS M-V „Mobilithek/Mobilitätsdaten" (Beispiel Landesgeber) —
  https://www.strassen-mv.de/de/verkehrsinfos/mobilitaetsdaten/
- GraphHopper **open-traffic-collection** (Quellenlage DE) —
  https://github.com/graphhopper/open-traffic-collection
- Mobilithek Katalog-Größe 09/2025 (~14.300 Angebote) — https://mobilithek.info/ ·
  Präsentation BASt/BMDV — https://www.mobileshessen2030.de/wp-content/uploads/2025/09/Praesi_Dr_Goetzke.pdf
