# Blockade-Quellen (pro Bundesland)

Strukturierte Liste der Datenquellen zum Auslesen von **Straßenblockaden**
(Baustellen, Sperrungen, Verkehrsmeldungen) — ein JSON-File pro Bundesland.

- **Portabel**: reines JSON → wird sowohl von einem TS- als auch einem Python-Backend gelesen.
- **Committed**: enthält nur öffentliche, schlüssellose Endpunkte (keine Secrets).
- **Quelle der Einträge**: manuell gepflegte Recherche. Es werden **nur verifizierte
  Endpunkte/URLs** eingetragen — niemals erfundene. Fehlt etwas → `null`.

## Dateien

| Datei | Bundesland | Status |
|-------|------------|--------|
| [`baden-wuerttemberg.json`](./baden-wuerttemberg.json) | Baden-Württemberg | ✅ gepflegt |

> Weitere Bundesländer werden nach und nach ergänzt (je ein `<bundesland>.json`).

## Feld-Schema (pro Quelle)

| Feld | Typ | Bedeutung |
|------|-----|-----------|
| `quelle` | string | Anzeigename der Quelle |
| `datentyp` | string | Welche Ereignisse geliefert werden (Baustellen, Sperrungen, …) |
| `strassentyp` | string[] | Straßenklassen: `"A"` (BAB), `"B"`, `"L"`, `"K"`, oder `"Alle"` |
| `format` | string | `GeoJSON` · `CIFS` · `DATEX2` · `TIC3` · `Web-Portal` |
| `apiEndpunkt` | string \| null | Direkter Feed-Endpunkt. `null` = kein API-Zugang (z.B. reines Web-Portal) |
| `update` | string | Aktualisierungsintervall laut Quelle (`Echtzeit`, `10 Min.`, …) |
| `auth` | string | `keine` · `api-key` · `bearer` · `basic` · `mtls` |
| `kosten` | string | `kostenlos` oder Preisangabe |
| `abdeckung` | string | Was die Quelle abdeckt |
| `url` | string \| null | Info-/Dataset-/Portal-Seite. `null` wenn keine angegeben |
| `sonstiges` | string | Freitext-Notizen |
| `prio` | string | Anbindungs-Priorität: `P1` · `P2` · `P3` |

## Neues Bundesland hinzufügen

1. `baden-wuerttemberg.json` als Vorlage kopieren → `<bundesland>.json`.
2. `bundesland`, `stand` (Datum) und die `quellen` ausfüllen.
3. Diese README-Tabelle oben um eine Zeile ergänzen.
4. Nur eintragen, was belegt ist — keine URLs raten.
