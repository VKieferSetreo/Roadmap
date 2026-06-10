// In-Memory-Fake für das db-Interface { query, tx } — kein echtes Postgres in Tests.
// Dispatcht über die statischen SQL-Strings der App; unbekanntes SQL wirft,
// damit Drift zwischen App-SQL und Fake sofort sichtbar wird.

import { randomUUID } from "node:crypto"

const J = (v) => (typeof v === "string" ? JSON.parse(v) : v)
const now = () => new Date().toISOString()
const ilike = (value, pattern) =>
  value != null && String(value).toLowerCase().includes(String(pattern).replaceAll("%", "").toLowerCase())

export function createFakeDb() {
  const state = {
    projects: [],
    findings: [],
    obstacles: [],
    runs: [],
    geocodeCache: new Map(),
    routeCache: new Map(),
  }

  const ok = (rows = [], rowCount = rows.length) => ({ rows, rowCount })

  async function query(text, params = []) {
    const sql = text.replace(/\s+/g, " ").trim()

    if (sql === "SELECT 1") return ok([{ "?column?": 1 }])

    // ── projects ──────────────────────────────────────────────────────────────
    if (sql.startsWith("SELECT * FROM projects ORDER BY updated_at DESC")) {
      return ok([...state.projects].sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1)))
    }
    if (sql.startsWith("INSERT INTO projects (name, status,")) {
      const row = {
        id: randomUUID(),
        name: params[0],
        status: params[1],
        route_input: J(params[2]),
        transport: J(params[3]),
        zeitraum: J(params[4]),
        route_geometry: J(params[5]),
        distanz_km: null,
        fahrzeit_min: null,
        created_by: params[6],
        created_at: now(),
        updated_at: now(),
      }
      state.projects.push(row)
      return ok([row])
    }
    if (sql.startsWith("SELECT * FROM projects WHERE id = $1")) {
      return ok(state.projects.filter((p) => p.id === params[0]))
    }
    if (sql.startsWith("UPDATE projects SET name = $2,")) {
      const row = state.projects.find((p) => p.id === params[0])
      if (!row) return ok([])
      Object.assign(row, {
        name: params[1],
        route_input: J(params[2]),
        transport: J(params[3]),
        zeitraum: J(params[4]),
        updated_at: now(),
      })
      return ok([row])
    }
    if (sql.startsWith("UPDATE projects SET status = $2,")) {
      const row = state.projects.find((p) => p.id === params[0])
      if (!row) return ok([], 0)
      Object.assign(row, {
        status: params[1],
        route_geometry: J(params[2]),
        distanz_km: params[3],
        fahrzeit_min: params[4],
        updated_at: now(),
      })
      return ok([], 1)
    }
    if (sql.startsWith("DELETE FROM projects WHERE id = $1")) {
      const before = state.projects.length
      state.projects = state.projects.filter((p) => p.id !== params[0])
      // FK ON DELETE CASCADE
      state.findings = state.findings.filter((f) => f.project_id !== params[0])
      state.runs = state.runs.filter((r) => r.project_id !== params[0])
      return ok([], before - state.projects.length)
    }

    // ── findings ──────────────────────────────────────────────────────────────
    if (sql.startsWith("SELECT * FROM findings WHERE project_id = ANY")) {
      const ids = params[0]
      return ok(
        state.findings.filter((f) => ids.includes(f.project_id)).sort((a, b) => a.km - b.km),
      )
    }
    if (sql.startsWith("SELECT * FROM findings WHERE project_id = $1")) {
      return ok(
        state.findings.filter((f) => f.project_id === params[0]).sort((a, b) => a.km - b.km),
      )
    }
    if (sql.startsWith("SELECT f.*, p.name AS projekt_name FROM findings f")) {
      const [kategorie, severity, q] = params
      const rows = state.findings
        .map((f) => {
          const p = state.projects.find((pr) => pr.id === f.project_id)
          return p ? { ...f, projekt_name: p.name } : null
        })
        .filter(Boolean)
        .filter((f) => kategorie == null || f.kategorie === kategorie)
        .filter((f) => severity == null || f.severity === severity)
        .filter(
          (f) =>
            q == null ||
            ilike(f.titel, q) || ilike(f.beschreibung, q) ||
            ilike(f.strassen_ref, q) || ilike(f.projekt_name, q),
        )
        .sort((a, b) => a.km - b.km)
      return ok(rows)
    }
    if (sql.startsWith("DELETE FROM findings WHERE project_id = $1")) {
      const before = state.findings.length
      state.findings = state.findings.filter((f) => f.project_id !== params[0])
      return ok([], before - state.findings.length)
    }
    if (sql.startsWith("INSERT INTO findings (project_id,")) {
      const row = {
        id: randomUUID(),
        project_id: params[0],
        obstacle_id: params[1],
        kategorie: params[2],
        severity: params[3],
        titel: params[4],
        beschreibung: params[5],
        lat: params[6],
        lng: params[7],
        km: params[8],
        detail: J(params[9]),
        strassen_ref: params[10],
        gueltig_von: params[11],
        gueltig_bis: params[12],
        quelle: params[13] != null ? J(params[13]) : null,
        zustaendig: params[14],
        created_at: now(),
      }
      state.findings.push(row)
      return ok([row])
    }

    // ── obstacles ─────────────────────────────────────────────────────────────
    if (sql.startsWith("SELECT * FROM obstacles WHERE ($1::text IS NULL")) {
      const [kategorie, aktiv, q] = params
      const rows = state.obstacles
        .filter((o) => kategorie == null || o.kategorie === kategorie)
        .filter((o) => aktiv == null || o.aktiv === aktiv)
        .filter(
          (o) =>
            q == null ||
            ilike(o.name, q) || ilike(o.beschreibung, q) ||
            ilike(o.strassen_ref, q) || ilike(o.zustaendig, q),
        )
        .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
      return ok(rows)
    }
    if (sql.startsWith("SELECT * FROM obstacles WHERE aktiv = true AND lat BETWEEN")) {
      const [minLat, maxLat, minLng, maxLng] = params
      return ok(
        state.obstacles.filter(
          (o) => o.aktiv && o.lat >= minLat && o.lat <= maxLat && o.lng >= minLng && o.lng <= maxLng,
        ),
      )
    }
    if (sql.startsWith("SELECT * FROM obstacles WHERE id = $1")) {
      return ok(state.obstacles.filter((o) => o.id === params[0]))
    }
    if (sql.startsWith("INSERT INTO obstacles (kategorie,")) {
      const row = {
        id: randomUUID(),
        kategorie: params[0],
        name: params[1],
        beschreibung: params[2],
        lat: params[3],
        lng: params[4],
        strassen_ref: params[5],
        zustaendig: params[6],
        quelle: params[7] != null ? J(params[7]) : null,
        attrs: J(params[8]),
        gueltig_von: params[9],
        gueltig_bis: params[10],
        aktiv: params[11],
        demo: params[12],
        created_at: now(),
        updated_at: now(),
      }
      state.obstacles.push(row)
      return ok([row])
    }
    if (sql.startsWith("UPDATE obstacles SET kategorie = $2,")) {
      const row = state.obstacles.find((o) => o.id === params[0])
      if (!row) return ok([])
      Object.assign(row, {
        kategorie: params[1],
        name: params[2],
        beschreibung: params[3],
        lat: params[4],
        lng: params[5],
        strassen_ref: params[6],
        zustaendig: params[7],
        quelle: params[8] != null ? J(params[8]) : null,
        attrs: J(params[9]),
        gueltig_von: params[10],
        gueltig_bis: params[11],
        aktiv: params[12],
        demo: params[13],
        updated_at: now(),
      })
      return ok([row])
    }
    if (sql.startsWith("DELETE FROM obstacles WHERE id = $1")) {
      const before = state.obstacles.length
      state.obstacles = state.obstacles.filter((o) => o.id !== params[0])
      return ok([], before - state.obstacles.length)
    }

    // ── caches ────────────────────────────────────────────────────────────────
    if (sql.startsWith("SELECT lat, lng, display_name FROM geocode_cache")) {
      const hit = state.geocodeCache.get(params[0])
      return ok(hit ? [hit] : [])
    }
    if (sql.startsWith("INSERT INTO geocode_cache")) {
      state.geocodeCache.set(params[0], {
        lat: params[1],
        lng: params[2],
        display_name: params[3],
      })
      return ok([], 1)
    }
    if (sql.startsWith("SELECT geometry, distanz_km, dauer_min FROM route_cache")) {
      const hit = state.routeCache.get(params[0])
      return ok(hit ? [hit] : [])
    }
    if (sql.startsWith("INSERT INTO route_cache")) {
      state.routeCache.set(params[0], {
        geometry: J(params[1]),
        distanz_km: params[2],
        dauer_min: params[3],
        provider: params[4],
      })
      return ok([], 1)
    }

    // ── analysis_runs ─────────────────────────────────────────────────────────
    if (sql.startsWith("INSERT INTO analysis_runs")) {
      const row = {
        id: randomUUID(),
        project_id: params[0],
        status: params[1],
        engine_version: params[2],
        provider: null,
        stats: null,
        error: null,
        started_at: now(),
        finished_at: null,
      }
      state.runs.push(row)
      return ok([{ id: row.id }])
    }
    if (sql.startsWith("UPDATE analysis_runs SET")) {
      const row = state.runs.find((r) => r.id === params[0])
      if (!row) return ok([], 0)
      Object.assign(row, {
        status: params[1],
        provider: params[2] != null ? J(params[2]) : null,
        stats: params[3] != null ? J(params[3]) : null,
        error: params[4],
        finished_at: now(),
      })
      return ok([], 1)
    }

    // ── stats ─────────────────────────────────────────────────────────────────
    if (sql.startsWith("SELECT count(*)::int AS projekte")) {
      return ok([{
        projekte: state.projects.length,
        fertig: state.projects.filter((p) => p.status === "fertig").length,
      }])
    }
    if (sql.includes("AS funde")) {
      const by = (s) => state.findings.filter((f) => f.severity === s).length
      return ok([{
        funde: state.findings.length,
        kritisch: by("kritisch"),
        warnung: by("warnung"),
        hinweis: by("hinweis"),
      }])
    }
    if (sql.includes("AS hindernisse")) {
      const aktiv = state.obstacles.filter((o) => o.aktiv)
      return ok([{
        hindernisse: aktiv.length,
        hindernisse_demo: aktiv.filter((o) => o.demo).length,
      }])
    }
    if (sql.startsWith("SELECT max(finished_at) AS letzte")) {
      const done = state.runs.filter((r) => r.status === "done" && r.finished_at)
      const letzte = done.length ? done.map((r) => r.finished_at).sort().at(-1) : null
      return ok([{ letzte }])
    }

    throw new Error(`fakeDb: unbekanntes SQL: ${sql}`)
  }

  const db = { state, query, tx: (fn) => fn(db) }
  return db
}
