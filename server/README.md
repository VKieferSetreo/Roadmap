# Roadmap Backend

Express + Postgres-Backend für die Schwertransport-Routenanalyse. Die Analyse-Engine matcht
Hindernisse aus der zentralen Datenbank gegen den Strecken-Korridor und bewertet sie
deterministisch gegen die Transport-Stammdaten (kein Mock/Random).

## Quickstart (lokal)

```bash
# Postgres (Docker)
docker run -d --name roadmap-pg -e POSTGRES_USER=roadmap -e POSTGRES_PASSWORD=roadmap \
  -e POSTGRES_DB=roadmap -p 54329:5432 postgres:16-alpine

export DATABASE_URL=postgres://roadmap:roadmap@127.0.0.1:54329/roadmap
npm ci
npm run migrate        # Schema (idempotent)
npm run seed           # 30 Demo-Hindernisse + 3 Demo-Projekte (--remove-demo zum Entfernen)
npm run dev            # Port 8095 — das Frontend (vite dev) proxied /api hierher
```

`npm test` — 84 Tests, läuft ohne Netz und ohne Datenbank.

## Architektur

- **Auth:** Gateway-Modus — vertraut `X-Auth-User`/`X-Auth-Roles` vom setreo-proxy
  (`forward_auth`). `REQUIRE_AUTH=true` in Prod (Dockerfile-Default); Obstacle-Writes
  brauchen Rolle `admin` oder `roadmap`.
- **Engine** (`src/engine/`): Geocoding (Cache → Nominatim → Städte-Tabelle) → Routing
  (Cache → OSRM → deterministischer Fallback) → Korridor-Matching (Bbox-SQL +
  Punkt-zu-Segment-Distanz, `CORRIDOR_M`=120) → Regelwerk pro Kategorie
  (Höhe/Breite/Last/Achslast/Steigung/Schleppkurve/Zeitraum-Überlappung).
  Provider-Ausfälle können eine Analyse nie scheitern lassen (Fallback-Kaskade,
  Provider-Flags in `analysis_runs`).
- **Hindernis-Datenbank** (`obstacles`): vorbereitet für echte Daten —
  `POST /api/obstacles/import` nimmt JSON-Listen oder GeoJSON-FeatureCollections an.
  Demo-Datensätze sind mit `demo=true` markiert.

## Endpoints

Alle unter `/api`, JSON camelCase passend zu `src/types/domain.ts` des Frontends:
`health` · `projects` CRUD · `projects/:id/analysis` · `findings` (Suche) ·
`obstacles` CRUD + `obstacles/import` · `geocode` · `stats`.

## Env

Siehe `.env.example` — nur `DATABASE_URL` ist zwingend; `NOMINATIM_URL`, `OSRM_URL`,
`EXTERNAL_TIMEOUT_MS`, `CORRIDOR_M`, `REQUIRE_AUTH`, `PORT` optional.
