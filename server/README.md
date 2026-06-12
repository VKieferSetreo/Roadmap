# Roadmap Backend

Express + Postgres-Backend für die Schwertransport-Routenanalyse. Die Analyse-Engine matcht
Hindernisse aus der zentralen Datenbank gegen die Strecken-Korridore und bewertet sie
deterministisch gegen die Transport-Stammdaten (kein Mock/Random).

v2: Multi-Tenant (Mandanten strikt getrennt), öffentliche Share-Links (optional mit
Passwort), mehrere Strecken pro Projekt (EINE Gesamt-Auswertung), Achslasten als Array.

## Quickstart (lokal)

```bash
# Postgres (Docker)
docker run -d --name roadmap-pg -e POSTGRES_USER=roadmap -e POSTGRES_PASSWORD=roadmap \
  -e POSTGRES_DB=roadmap -p 54329:5432 postgres:16-alpine

export DATABASE_URL=postgres://roadmap:roadmap@127.0.0.1:54329/roadmap
npm ci
npm run migrate        # Schema 001+002 (idempotent, inkl. v1→v2-Daten-Migration)
npm run seed           # Tenant setreo + 30 Demo-Hindernisse + 3 Demo-Projekte (--remove-demo entfernt)
npm run dev            # Port 8095 — das Frontend (vite dev) proxied /api hierher
```

`npm test` — 108 Tests, läuft ohne Netz und ohne Datenbank.

## Architektur

- **Auth:** Gateway-Modus — vertraut `X-Auth-User`/`X-Auth-Roles` vom setreo-proxy
  (`forward_auth`). `REQUIRE_AUTH=true` in Prod (Dockerfile-Default); Obstacle-Writes
  brauchen Rolle `admin` oder `roadmap`.
- **Tenants (v2):** jeder Request bekommt einen Tenant-Kontext. Non-Admins werden über
  `tenant_members` (E-Mail) gemappt — ohne Mapping liefern `projects/findings/stats`
  403 `{"error":"kein-mandant"}`. Admins wählen den Tenant per `X-Tenant: <slug>`
  (Default `setreo`). `obstacles` und `geocode` bleiben global.
- **Shares (v2):** `POST /api/projects/:id/share {password?}` veröffentlicht ein Projekt
  unter `https://setreo-cloud.com/<tenantSlug>/<projectId>`. Der Public-Zugriff läuft
  UNGATED über `/_share/...` (eigener Router; der Proxy routet `/_share` ohne
  forward_auth). Passwort-Hash: `scrypt$<salt>$<hash>`; Unlock liefert ein stateless
  HMAC-Token; max 10 Unlock-Versuche/min/IP (in-memory).
- **Engine v2** (`src/engine/`): pro Projekt-Route (`routes[]`, Punktlisten aus
  GPX/KML-Upload) Korridor-Matching (Bbox-SQL + Punkt-zu-Segment-Distanz,
  `CORRIDOR_M`=120) → Regelwerk pro Kategorie (Höhe/Breite/Last/max(achslasten)/
  Steigung/Schleppkurve/Zeitraum-Überlappung). Funde tragen `routeId`/`routeName` und
  ihre km-Position auf der eigenen Route; `distanzKm` = Summe aller Strecken.
  Der Start/Ziel-Routing-Pfad (Nominatim/OSRM) bleibt als Legacy-Code erhalten, wird
  vom FE aber nicht mehr angeboten.
- **Hindernis-Datenbank** (`obstacles`): zentrale, mandanten-übergreifende Datenbank —
  `POST /api/obstacles/import` nimmt JSON-Listen oder GeoJSON-FeatureCollections an.
  v2-Felder: `fachId` (Schema IIIIQQQQDDMMYY), `quellenId`, `realerStart`.
  Demo-Datensätze sind mit `demo=true` markiert.

## Endpoints

JSON camelCase, Shapes exakt nach `.planning/SPEC-backend-v2.md`:

- **Gated (`/api`)**: `health` (ungated) · `context` · `projects` CRUD (+ `:id/analysis`,
  `:id/share` POST/DELETE) · `findings` (Suche) · `obstacles` CRUD + `import` ·
  `geocode` · `stats` · `admin/tenants` (Admin: CRUD + `:id/members`)
- **Ungated (`/_share`)**: `GET /_share/api/:tenantSlug/:projectId` ·
  `POST …/unlock` · statisches Share-FE aus `server/public/share/`
  (noch nicht vendored → SPA-Route liefert 503-Hinweis)
- **SPA**: `GET /:tenantSlug/:projectId` → `server/public/share/index.html`

## Env

Siehe `.env.example` — nur `DATABASE_URL` ist zwingend; `SHARE_BASE_URL`, `SESSION_SALT`,
`NOMINATIM_URL`, `OSRM_URL`, `EXTERNAL_TIMEOUT_MS`, `CORRIDOR_M`, `REQUIRE_AUTH`, `PORT` optional.
`SESSION_SALT` in Prod setzen (invalidiert sonst bei Default-Wert keine Tokens zwischen Deploys).
