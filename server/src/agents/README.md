# server/src/agents — Multi-Agenten-Routenplanung

LLM-Instanzen der Schwertransport-Routenplanung. Jede Instanz ist konzeptuell „ein
LLM"; die harten Invarianten erzwingt aber deterministischer Harness-Code, nicht das
Modell.

## Rollen

```
Main-Orchestrator  (anderes Terminal)
        │  PlanAuftrag  { start, ziel, fahrzeugprofil, restriktionen, zeitfenster, umfahrungsmodusGlobal }
        ▼
Roadmap-Orchestrator  ← DIESER Ordner (roadmapOrchestrator.js)
   hält den GESAMTEN Planungszustand, kennt als einzige die Gesamtstrecke
        │ initialRoute()          │ bearbeite(SubAgentAuftrag)      │ pruefe(route)
        ▼                         ▼                                 ▼
   RoutingPort              Sub-Agent (je Abschnitt,          Validierungslayer
   (Adapter über            isoliert — bekommt NIE die        (eigenständige Instanz,
    resolveRoute/OSRM)      Gesamtstrecke)                     Urteil ist bindend)
```

## Dateien

| Datei | Zweck |
|-------|-------|
| `contracts.js` | Datenverträge (JSDoc), Konstanten, **Runden-Tabelle**, Eingangsvalidierung |
| `planning.js` | deterministischer Kern: Zuschnitt, Merge, lokale Reparatur, Bewertung, Konvergenz-Hash, Tier-Verteilung |
| `roadmapOrchestrator.js` | **Harness** — Runden-Loop, verdrahtet die Ports, erzwingt die Guardrails |
| `stubs.js` | lauffähige Referenz-Ports (Routing/Sub-Agent/Validator/LLM) für Dev & Tests |
| `prompts/roadmap-orchestrator.md` | System-Prompt (LLM-Rolle) |

## Verwendung

```js
import { createRoadmapOrchestrator } from "./agents/roadmapOrchestrator.js"

const orch = createRoadmapOrchestrator({ routing, subAgent, validator, llm /*optional*/, log })
const ergebnis = await orch.plane(planAuftrag)
// ergebnis: { route, status, ungeloeste_stellen, verbrauchte_runden, abbruchgrund, reparaturen, tier_verteilung }
```

Ports (alle Objekte mit **einer** async-Methode, Signaturen in `contracts.js`):

- `routing.initialRoute(auftrag)` → `InitialStreckenErgebnis` (Regel 1/2)
- `subAgent.bearbeite(subAgentAuftrag)` → `SubAgentErgebnis` (Regel 4/5)
- `validator.pruefe({ route, auftrag, wahl, stellen })` → `ValidierungsUrteil` (Regel 6, bindend)
- `llm.entscheideZuschnittSync({ stellen, runde, params, ablehnungskontext })` → `{ abschnitte }` (optional, Regel 4)

## Echte Adapter (offen, ersetzen die Stubs 1:1)

- **RoutingPort:** `resolveRoute`/`routeWaypoints` (`engine/resolveRoute.js`) für die Initialstrecke;
  kritische Stellen aus `obstaclesRepo` + `ersteVerletzung`. `harteSperreVorhanden` = harte Sperre auf der Route.
- **Sub-Agent:** eigene LLM-Instanz; Umfahrung über `umfahreZonen`/`parseMeide` (`routes/route.js`,
  das `meide:[{lat,lng,radiusKm}]`-Werkzeug). Liefert Kandidaten **mit fertigen Kosten** (Orchestrator rechnet keine).
- **Validierungslayer:** eigene Instanz — Lenkzeit gegen `zeitfenster`, Wechselwirkungen, Genehmigungsstrecke.
- **LLM:** Anthropic (`claude-*`) oder lokales Ollama (GPU-Workstation); nur der Zuschnitt ist LLM-Ermessen,
  alles Sicherheitsrelevante bleibt im Harness.

## Nicht verhandelbar (im Harness getestet)

- `hart` wird **nie** automatisch zu `weich` (auch nicht bei Budgetende) — Nutzerentscheidung.
- Sub-Agent sieht nie Gesamtstrecke oder fremde Ergebnisse.
- Reparatur nur über die 2 deterministischen Eingriffe (Regel 9), max 2 Versuche.
- max 5 Runden; Konvergenz (gleiche Kandidaten-Hashes) → sofortiger Abbruch.
- Fallback-Reihenfolge: Komposition der Abschnitts-Bestwerte → beste vollständige Route → Initialstrecke.
- harte Sperre ohne Umfahrung → `nicht_befahrbar`, nie `initialstrecke`.
- Es wird immer etwas ausgeliefert.
