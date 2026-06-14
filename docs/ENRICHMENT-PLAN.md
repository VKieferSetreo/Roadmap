# Daten-Anreicherung (Enrichment) — Architektur & Mac-Studio-LLM-Plan

> Ziel: aus den oft nur als Freitext vorliegenden Quelldaten **automatisch** saubere, strukturierte
> Stammdaten ziehen (Breite/Höhe/Gewicht/Achslast, Gültigkeit, Sperrart, …) — heute regelbasiert,
> später per lokalem LLM auf dem Mac Studio. Kein manuelles Nachpflegen.

## 1. Pipeline (Status heute)

```
Connector.fetch() ──► makeNormalized() ──────────────► Upsert (obstacles)
   (Quelldaten)        │  • Sanitizing (HTML strip, 0-Sentinel raus)
                       │  • extractStammdaten()  ← REGEL-EXTRAKTION
                       └────────────────────────────────────┐
                                                             ▼
                    enrich.js  enrichFromText(row) ──► patch  (nur Lücken, confidence=0.6)
                       ▲                                      │
   scripts/enrich_db.mjs (Batch über Bestand) ───────────────┘
```

**Zwei Eintrittspunkte, eine Logik:**
- **Ingest** — jeder neue/aktualisierte Datenpunkt wird beim Abruf in `makeNormalized()` angereichert.
- **Batch** — `scripts/enrich_db.mjs` geht idempotent über den gesamten Bestand (Nachzügler / neue Regeln).

**Sauberkeits-Invarianten** (in `makeNormalized` + `scripts/cleanup_db.mjs`):
HTML/Entities gestrippt · 0-Sentinel bei Maß-Attributen entfernt · `laengeM`→`sperrlaengeM` · leere Strings→null.

**Provenienz:** abgeleitete Werte tragen `confidence = 0.6`, autoritative Quell-/Manuell-Werte bleiben (höhere/keine
Markierung). Beschreibung bekommt den Vermerk „· Angaben aus Meldungstext extrahiert". → man sieht immer, was abgeleitet ist.

## 2. Der LLM-Andockpunkt

Die **einzige** Stelle, die getauscht wird, ist `enrichFromText(row) → patch` in `server/src/enrich.js`.
Signatur bleibt identisch, Ingest-Hook und Batch-Runner bleiben unverändert:

```js
// row:   { name, beschreibung, kategorie, attrs, gueltigVon, gueltigBis, strassenRef, richtung }
// patch: { changed, attrs, gueltigVon?, gueltigBis?, strassenRef?, richtung?, confidence }
export function enrichFromText(row) { … }          // heute: Regeln
export async function enrichWithLlm(row) { … }     // später: Mac Studio, GLEICHES patch-Format
```

## 3. Mac-Studio-Integration (wenn da)

**3.1 Endpoint** — OpenAI-kompatibel (Ollama/LM Studio/MLX), per env entkoppelt:
```
ENRICH_LLM_URL=http://<mac-studio>:11434/v1     ENRICH_LLM_MODEL=qwen2.5:32b-instruct
ENRICH_LLM_ENABLED=true                          ENRICH_LLM_TIMEOUT_MS=20000
```
(Heutiger GPU-Workstation-Ollama `http://100.85.216.95:11434` taugt als Zwischenlösung/Test.)

**3.2 Contract — schema-constrained JSON** (kein Freitext-Output, erzwungenes Format):
- *System:* „Du extrahierst ausschließlich explizit im Text genannte Werte für deutsche GST-/Verkehrsdaten.
  Nichts erfinden. Fehlt eine Angabe → Feld weglassen."
- *User:* `name`, `beschreibung`, `kategorie`.
- *Response-Schema* (JSON-Mode/grammar): `restbreiteM, maxHoeheM, maxGewichtT, maxAchslastT, sperrlaengeM (number)`,
  `vollsperrung, halbseitig (bool)`, `gueltigVon, gueltigBis (YYYY-MM-DD)`, `zeitfenster, richtung (string)`,
  je Feld optional `confidence (0..1)`.
- Mapping → `patch` (nur leere Felder füllen, `confidence` aus dem Modell, sonst 0.8).

**3.3 Gating — nur was nötig ist** (spart Tokens, schützt gute Daten):
- Regel-Pass läuft **zuerst** (billig, deterministisch).
- LLM nur für Rows mit **Restlücken** UND nennenswertem Text (`length(beschreibung) > 40`) UND
  `confidence IS NULL OR confidence < 0.9`.
- LLM **überschreibt nie** autoritative Quellwerte — füllt nur Lücken / hebt `confidence`.

**3.4 Zwei Betriebsmodi:**
| Modus | Auslöser | Wie |
|---|---|---|
| **Incremental** (neue Datenpunkte) | im Connector-Sync, nach Upsert | Queue der frisch geänderten IDs → `enrichWithLlm` in kleinen Batches (lokal, kostenlos) |
| **Backfill/Reprocess** (Regeln/Prompt geändert) | manuell / Cron | `scripts/enrich_db.mjs --mode=llm` über Gating-Filter |

> Wichtig: Ingest bleibt **synchron + schnell** (Regeln). Der LLM-Pass läuft **asynchron danach**
> (Worker/Queue), damit ein langsamer/abwesender Mac Studio den Datenabruf nie blockiert.

**3.5 Robustheit:** LLM down/Timeout → Regel-Ergebnis bleibt stehen (Fallback). Antwort schema-validiert
(verworfen bei Bruch). Idempotent (nur Lücken) → beliebig oft re-runbar. Pro Row 1 Call, Batchgröße begrenzt.

## 4. Umsetzungs-Schritte (wenn Mac Studio steht)
1. `enrichWithLlm(row)` in `server/src/enrich.js` ergänzen (Endpoint, Schema, Mapping, Fallback).
2. `scripts/enrich_db.mjs` um `--mode=llm` + Gating-Filter erweitern → einmaliger Reprocess des Bestands.
3. Incremental-Hook: nach `runImport` geänderte IDs an eine kleine LLM-Queue im Worker geben.
4. `confidence`/Provenienz im FE-Popup sichtbar machen (Badge „automatisch ergänzt").
5. Eval: 50 handgelabelte Beispiele → Precision/Recall der LLM- vs. Regel-Extraktion vergleichen.

## 5. Ehrliche Grenze
Kein Extraktor — auch kein LLM — erfindet Zahlen, die **nicht im Text stehen**. Bei qualitativen
Baustellen-Meldungen („Fahrbahn verengt") gibt es schlicht keine Maßzahl. Der LLM-Gewinn liegt v.a. bei
(a) kategorialer Normalisierung/Synonymen, (b) komplexer Datums-/Zeitfenster-Logik, (c) Robustheit gegen
Formulierungsvielfalt — nicht im „Erfinden" fehlender Werte.
