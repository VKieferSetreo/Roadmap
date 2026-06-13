# Mobilithek-Integration — vorbereitet (Aktivierung sobald Account da)

> Mobilithek = Nationaler Zugangspunkt (NAP) für Mobilitätsdaten. Liefert DATEX-II-Feeds
> (Baustellen/Sperrungen/Verkehrslage/Netzbeschränkungen) **je gebuchtem Angebot** per
> Client-Zertifikat (mTLS) — KEIN globaler Endpunkt. Der größte Hebel für DE-Abdeckung
> (schließt v.a. BB, HB, NI, RP, TH + HE/BY-Land bei den temporären Daten).

## Was schon gebaut ist (getestet, gated)

| Datei | Zweck |
|---|---|
| `server/src/connectors/datex2.js` | dependency-freier DATEX-II-Parser (SituationPublication → NormalizedObstacle): Kategorie aus xsi:type, Gültigkeit, Koordinaten, Restriktionswerte (Höhe/Breite/Gewicht/Achslast). Wiederverwendbar für ALLE DATEX-Quellen. |
| `server/src/connectors/mobilithek.js` | Connector-Fabrik je Angebot: mTLS-Pull (`node:https`) → DATEX-II-Parse. Schedule **`0 8,12,18 * * *`** (3×/Tag). `vollbestand: true` (Reconcile). Ohne Zertifikat/Feeds → liefert nichts (gated). |
| `server/src/connectors/index.js` | Pool = statische Connectoren + `mobilithekConnectors(env)` (env-getrieben, leer bis konfiguriert). |
| `server/test/datex2.test.js` | beweist Parser + gated-Verhalten (4 Tests grün, ohne Account). |

## Aktivierung (3 Schritte, sobald Konto + Zertifikat da)

**1. Client-Zertifikat hinterlegen** (Coolify-ENV auf roadmap-worker):
```
MOBILITHEK_CERT=<PEM-String ODER Dateipfad>
MOBILITHEK_KEY=<PEM-String ODER Dateipfad>
MOBILITHEK_PASSPHRASE=<optional>
```

**2. Gebuchte Angebote als JSON** (ein Eintrag je abonniertem Bundesland/Bund-Angebot):
```
MOBILITHEK_FEEDS='[
  {"quelleId":"0310","name":"Mobilithek Niedersachsen Baustellen","url":"https://mobilithek.de/.../clientPullService?subscriptionID=NNNN"},
  {"quelleId":"0311","name":"Mobilithek Brandenburg Baustellen","url":"..."},
  {"quelleId":"0312","name":"Mobilithek Rheinland-Pfalz","url":"..."}
]'
```
> quelleId aus dem Block `031x` (Mobilithek-Länder) vergeben — frei wählbar, aber eindeutig.

**3. Aktivieren + Quellen-Register:**
- Die `quelleId`s müssen in der `quellen`-Tabelle existieren (FK von `import_runs`). Pro Feed:
  ```sql
  INSERT INTO quellen (id, name, typ, tier, provenienz, abruf_intervall)
  VALUES ('0310','Mobilithek Niedersachsen','api','T2','aggregator','0 8,12,18 * * *')
  ON CONFLICT (id) DO NOTHING;
  ```
- quelleIds in env `CONNECTORS` (CSV) aufnehmen → der Worker plant sie nach Schedule.
- Manueller Sofort-Test: `POST /api/admin/import/<quelleId>` (zieht das Angebot einmal).

## Hinweise

- **DATEX-II-Profile** variieren (v2 vs v3, herstellerspezifisch). Der Parser ist tolerant/best-effort;
  beim ersten echten Feed die Feld-Mappings (`datex2.js`) gegen die reale Struktur verifizieren
  (v.a. `groupOfLocations` → Koordinaten und die NetworkRestriction-Werte).
- **Tier T2** (amtlicher Aggregator) — auf BAB-/Land-Straßen ergänzend zum direkten Baulastträger-Feed
  (Priorisierung siehe `docs/research/hierarchie-priorisierung.md`).
- Welche Angebote für maximale Abdeckung zu buchen sind: siehe `docs/research/BESCHAFFUNGSLISTE.md`
  bzw. `docs/research/beschaffung-mobilithek.md` (Feed-Katalog).
