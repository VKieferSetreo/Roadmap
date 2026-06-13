# API-Katalog — öffentliche DE-Datenquellen (Schwertransport-Hindernisse)

Pro Quelle ein eigener Ordner mit fester Datei-Konvention. Aufgebaut aus der Recherche in
[`../docs/research/`](../docs/research/). Ziel: **alle Quellen katalogisiert, dokumentiert und
— wo offen — live testbar**. Kostenpflichtige kommerzielle Anbieter (PTV/HERE/TomTom) sind
bewusst NICHT enthalten (Max-Vorgabe 2026-06-13).

## Ordnerstruktur

```
API/
├── Bundesweit/                 # bundesweite Quellen (Autobahn-API, BASt, Mobilithek, VEMAGS, …)
│   └── <API-Name>/
├── Länder/
│   └── <Bundesland>/           # landesweite Quellen des jeweiligen Landes
│       ├── <API-Name>/
│       └── Städte/             # kommunale Quellen INNERHALB des Landes
│           └── <Stadt>/
│               └── <API-Name>/
└── Sonstige/                   # OSM, Geodaten-Standards, freie Routing-Engines, Übergreifendes
    └── <API-Name>/
```

## Dateien pro API-Ordner

| Datei | Pflicht | Inhalt |
|---|---|---|
| `abdeckung.txt` | ✅ | Kurzsteckbrief: was die Quelle abdeckt + Zugang/Flags (Schema unten) |
| `doku.<html\|pdf\|xml\|json>` | wenn auffindbar | heruntergeladene Schnittstellen-Doku (PDF > HTML-Doku-Seite > WFS-GetCapabilities-XML > OpenAPI-JSON). Falls nur Web-Portal: `doku-link.txt` mit URL |
| `<apiname>.env` | nur wenn Key/Account nötig | Platzhalter für Key/Zertifikat + **Account-Flag** (Registrierungs-URL) |
| `test.sh` | ✅ | lauffähiger Beispiel-Call (`bash test.sh`), gibt die Antwort aus |
| `beispiel-antwort.txt` | wenn offen testbar | eingefangene Live-Antwort (gekürzt) des Test-Calls |

### `abdeckung.txt` — Schema

```
QUELLE:         <Anzeigename>
BETREIBER:      <Behörde/Firma>
EBENE:          Bundesweit | Land:<X> | Stadt:<Stadt>,<Land> | Sonstige
DATENTYP:       <Baustellen / Sperrungen / Brücken / Restriktionen / GST-Routen / …>
STRASSENTYP:    <A / B / L / K / innerorts / Alle>
FORMAT:         <REST-JSON / GeoJSON / DATEX II / CIFS / TIC3 / WFS / WMS / CSV / Web-Portal>
ENDPUNKT:       <URL oder ->
DOKU:           <URL>
ZUGANG:         offen | registrierung | account | eingeschränkt
ACCOUNT_NOETIG: JA | NEIN          # ← Flag: muss Max hier ein Konto anlegen?
API_KEY_NOETIG: JA | NEIN
LIZENZ:         <z.B. dl-de/by-2.0, CC BY 4.0, ODbL, NC, intern>
UPDATE:         <Intervall>
STATUS:         verifiziert | zu-bestätigen
NOTIZ:          <Freitext, z.B. Parsing-Hinweise, Layer-Namen>
```

### `<apiname>.env` — nur wenn nötig

```
# <API-Name> — Zugang
# ACCOUNT ANLEGEN: <Registrierungs-URL>     # ← Max: hier Konto/Key holen
<APINAME>_API_KEY=
# ggf. weitere: <APINAME>_CERT=  <APINAME>_USER=  <APINAME>_PASS=
```

### `test.sh` — Konvention

- Shebang `#!/usr/bin/env bash`, mit `bash test.sh` lauffähig, nur `curl` nötig.
- Macht **einen** Beispiel-Call (offen: echter Endpunkt; gated: sourct die `.env`) und gibt die
  Antwort (gekürzt) aus. Bei gated-Quellen oben ein Kommentar „läuft erst mit Account/Key".

## Status-Legende (Sammelübersicht: [`STATUS.md`](./STATUS.md))

- 🟢 offen + live getestet (Antwort in `beispiel-antwort.txt`)
- 🟡 offen, aber Endpunkt zu bestätigen / Parsing nötig
- 🔑 Account/Key nötig (Flag in `abdeckung.txt` + `.env`) — Max beschafft Zugang
- ⚪ nur Web-Portal/PDF (kein maschineller Endpunkt)
