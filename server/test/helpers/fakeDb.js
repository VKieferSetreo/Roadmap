// In-Memory-Fake für das db-Interface { query, tx } — kein echtes Postgres in Tests.
// Dispatcht über die statischen SQL-Strings der App; unbekanntes SQL wirft,
// damit Drift zwischen App-SQL und Fake sofort sichtbar wird.

import { randomUUID } from "node:crypto"

const J = (v) => (typeof v === "string" ? JSON.parse(v) : v)
const now = () => new Date().toISOString()
const ilike = (value, pattern) =>
  value != null && String(value).toLowerCase().includes(String(pattern).replaceAll("%", "").toLowerCase())

/** Quellen-Register exakt wie migrations/003_v3.sql es seeded. */
const DEFAULT_QUELLEN = [
  ["0001", "Autobahn-API (verkehr.autobahn.de)", "api", "0 4 * * *"],
  ["0002", "BASt SIB-Bauwerke", "datensatz", "quartalsweise"],
  ["0003", "OSM / Overpass", "api", "monatlich"],
  ["0009", "Mobilithek (DATEX II)", "api", "täglich"],
  ["0100", "Kunden-Eintrag (manuell)", "manuell", null],
]

export function createFakeDb() {
  const state = {
    tenants: [],
    members: [], // { tenant_id, email, created_at }
    seatCodes: [], // { id, tenant_id, code, used_by_email, used_at, created_at }
    disclaimerAcceptances: [], // { email, version, accepted_at }
    auditLog: [], // { id, tenant_id, actor_email, action, detail, at }
    shares: [],
    projects: [],
    findings: [],
    obstacles: [],
    runs: [],
    quellen: DEFAULT_QUELLEN.map(([id, name, typ, abruf_intervall]) => ({
      id, name, typ, endpoint_url: null, abruf_intervall, letzter_abruf: null, aktiv: true,
    })),
    importRuns: [],
    notifications: [],
    bugReports: [],
    news: [], // { id, kategorie, titel, body, created_by, published_at }
    hiddenFindings: [], // { project_id, finding_key, obstacle_id, grund, grund_text, kontext, hidden_by, created_at }
    geocodeCache: new Map(),
    routeCache: new Map(),
  }

  const ok = (rows = [], rowCount = rows.length) => ({ rows, rowCount })

  /** Test-Bequemlichkeit: Tenant (+ optionale Member) direkt anlegen. */
  function seedTenant({ slug = "setreo", name = "Setreo", members = [] } = {}) {
    const row = { id: randomUUID(), slug, name, created_at: now() }
    state.tenants.push(row)
    for (const email of members) {
      state.members.push({
        tenant_id: row.id, email: email.toLowerCase(), role: "user", passwort_klar: null, created_at: now(),
      })
    }
    return row
  }

  async function query(text, params = []) {
    const sql = text.replace(/\s+/g, " ").trim()

    if (sql === "SELECT 1") return ok([{ "?column?": 1 }])

    // ── tenants / tenant_members ──────────────────────────────────────────────
    if (sql.startsWith("SELECT id, slug, name FROM tenants WHERE slug = $1")) {
      return ok(state.tenants.filter((t) => t.slug === params[0]))
    }
    if (sql.startsWith("SELECT id, slug, name FROM tenants WHERE id = $1")) {
      return ok(state.tenants.filter((t) => t.id === params[0]))
    }
    if (sql.startsWith("SELECT t.id, t.slug, t.name FROM tenants t JOIN tenant_members m")) {
      const member = state.members.find((m) => m.email === params[0])
      return ok(member ? state.tenants.filter((t) => t.id === member.tenant_id) : [])
    }
    if (sql.startsWith("SELECT t.id, t.slug, t.name, t.created_at,")) {
      const rows = [...state.tenants]
        .sort((a, b) => (a.created_at < b.created_at ? -1 : 1))
        .map((t) => ({
          ...t,
          projekte: state.projects.filter((p) => p.tenant_id === t.id).length,
        }))
      return ok(rows)
    }
    if (sql.startsWith("SELECT tenant_id, email, role FROM tenant_members")) {
      return ok(
        [...state.members]
          .sort((a, b) => (a.email < b.email ? -1 : 1))
          .map((m) => ({ tenant_id: m.tenant_id, email: m.email, role: m.role ?? "user" })),
      )
    }
    if (sql.startsWith("INSERT INTO tenants (slug, name)")) {
      const row = { id: randomUUID(), slug: params[0], name: params[1], created_at: now() }
      state.tenants.push(row)
      return ok([row])
    }
    if (sql.startsWith("UPDATE tenants SET name = $2")) {
      const row = state.tenants.find((t) => t.id === params[0])
      if (!row) return ok([])
      row.name = params[1]
      return ok([row])
    }
    if (sql.startsWith("DELETE FROM tenants WHERE id = $1")) {
      const before = state.tenants.length
      state.tenants = state.tenants.filter((t) => t.id !== params[0])
      // FK ON DELETE CASCADE
      state.members = state.members.filter((m) => m.tenant_id !== params[0])
      state.shares = state.shares.filter((s) => s.tenant_id !== params[0])
      return ok([], before - state.tenants.length)
    }
    if (sql.startsWith("SELECT email FROM tenant_members WHERE email = $1 AND tenant_id <> $2")) {
      return ok(
        state.members
          .filter((m) => m.email === params[0] && m.tenant_id !== params[1])
          .map((m) => ({ email: m.email })),
      )
    }
    if (sql.startsWith("SELECT email FROM tenant_members WHERE email = $1 AND tenant_id = $2")) {
      return ok(
        state.members
          .filter((m) => m.email === params[0] && m.tenant_id === params[1])
          .map((m) => ({ email: m.email })),
      )
    }
    if (sql.startsWith("SELECT email FROM tenant_members WHERE email = ANY")) {
      const [emails, tenantId] = params
      return ok(
        state.members
          .filter((m) => emails.includes(m.email) && m.tenant_id !== tenantId)
          .map((m) => ({ email: m.email })),
      )
    }
    if (sql.startsWith("DELETE FROM tenant_members WHERE tenant_id = $1")) {
      const before = state.members.length
      state.members = state.members.filter((m) => m.tenant_id !== params[0])
      return ok([], before - state.members.length)
    }
    if (sql.startsWith("INSERT INTO tenant_members (tenant_id, email, role)")) {
      state.members.push({
        tenant_id: params[0], email: params[1], role: params[2] ?? "user", created_at: now(),
      })
      return ok([], 1)
    }
    if (sql.startsWith("UPDATE tenant_members SET role = $3 WHERE tenant_id = $1 AND email = $2")) {
      const m = state.members.find((x) => x.tenant_id === params[0] && x.email === params[1])
      if (!m) return ok([], 0)
      m.role = params[2]
      return ok([], 1)
    }
    if (sql.startsWith("SELECT count(*)::int AS n FROM projects WHERE tenant_id = $1")) {
      return ok([{ n: state.projects.filter((p) => p.tenant_id === params[0]).length }])
    }
    if (sql.startsWith("SELECT count(*)::int AS n FROM tenant_members WHERE tenant_id = $1")) {
      return ok([{ n: state.members.filter((m) => m.tenant_id === params[0]).length }])
    }
    if (sql.startsWith("INSERT INTO tenant_audit_log (tenant_id, actor_email, action, detail)")) {
      state.auditLog.push({
        id: randomUUID(), tenant_id: params[0], actor_email: params[1],
        action: params[2], detail: params[3], at: now(),
      })
      return ok([], 1)
    }
    if (sql.startsWith("SELECT id, tenant_id, actor_email, action, detail, at FROM tenant_audit_log WHERE tenant_id = $1")) {
      return ok(
        [...state.auditLog]
          .filter((a) => a.tenant_id === params[0])
          .sort((a, b) => (a.at < b.at ? 1 : -1))
          .slice(0, 200),
      )
    }

    // ── seat_codes (Lizenz-Seats) ─────────────────────────────────────────────
    if (sql.startsWith("INSERT INTO seat_codes (tenant_id, code)")) {
      if (state.seatCodes.some((s) => s.code === params[1])) {
        const e = new Error("fakeDb: unique violation seat_codes_code")
        e.code = "23505"
        throw e
      }
      const row = {
        id: randomUUID(), tenant_id: params[0], code: params[1],
        used_by_email: null, used_at: null, created_at: now(),
      }
      state.seatCodes.push(row)
      return ok([row])
    }
    if (sql.startsWith("SELECT count(*)::int AS total, count(used_by_email)::int AS used FROM seat_codes WHERE tenant_id = $1")) {
      const codes = state.seatCodes.filter((s) => s.tenant_id === params[0])
      return ok([{ total: codes.length, used: codes.filter((c) => c.used_by_email).length }])
    }
    if (sql.startsWith("SELECT code, used_by_email, used_at FROM seat_codes WHERE tenant_id = $1")) {
      return ok(
        state.seatCodes
          .filter((s) => s.tenant_id === params[0])
          .sort((a, b) => (a.created_at < b.created_at ? -1 : 1))
          .map((s) => ({ code: s.code, used_by_email: s.used_by_email, used_at: s.used_at })),
      )
    }
    if (sql.startsWith("SELECT sc.id, sc.tenant_id, sc.used_by_email, t.slug, t.name, t.valid_until FROM seat_codes sc JOIN tenants t")) {
      const sc = state.seatCodes.find((s) => s.code === params[0])
      if (!sc) return ok([])
      const t = state.tenants.find((x) => x.id === sc.tenant_id)
      return ok([{
        id: sc.id, tenant_id: sc.tenant_id, used_by_email: sc.used_by_email,
        slug: t?.slug ?? null, name: t?.name ?? null, valid_until: t?.valid_until ?? null,
      }])
    }
    if (sql.startsWith("UPDATE seat_codes SET used_by_email = $1, used_at = now() WHERE id = $2")) {
      const sc = state.seatCodes.find((s) => s.id === params[1])
      if (!sc) return ok([], 0)
      sc.used_by_email = params[0]
      sc.used_at = now()
      return ok([], 1)
    }
    if (sql.startsWith("UPDATE tenants SET plan = $2, max_seats = $3, valid_until = $4 WHERE id = $1")) {
      const row = state.tenants.find((t) => t.id === params[0])
      if (!row) return ok([])
      row.plan = params[1]
      row.max_seats = params[2]
      row.valid_until = params[3]
      return ok([{
        id: row.id, slug: row.slug, name: row.name,
        plan: row.plan, max_seats: row.max_seats, valid_until: row.valid_until,
      }])
    }
    if (sql.startsWith("SELECT max_seats FROM tenants WHERE id = $1")) {
      const row = state.tenants.find((t) => t.id === params[0])
      return ok(row ? [{ max_seats: row.max_seats ?? 0 }] : [])
    }
    // ── disclaimer_acceptances ──────────────────────────────────────────────
    if (sql.startsWith("SELECT 1 FROM disclaimer_acceptances WHERE email = $1 AND version = $2")) {
      const hit = state.disclaimerAcceptances.some(
        (d) => d.email === params[0] && d.version === params[1],
      )
      return ok(hit ? [{ "?column?": 1 }] : [])
    }
    if (sql.startsWith("INSERT INTO disclaimer_acceptances (email, version)")) {
      if (!state.disclaimerAcceptances.some((d) => d.email === params[0] && d.version === params[1])) {
        state.disclaimerAcceptances.push({ email: params[0], version: params[1], accepted_at: now() })
      }
      return ok([], 1)
    }

    if (sql.startsWith("SELECT plan, max_seats, valid_until FROM tenants WHERE id = $1")) {
      const row = state.tenants.find((t) => t.id === params[0])
      return ok(
        row
          ? [{ plan: row.plan ?? null, max_seats: row.max_seats ?? null, valid_until: row.valid_until ?? null }]
          : [],
      )
    }

    // ── shares ────────────────────────────────────────────────────────────────
    if (sql.startsWith("SELECT * FROM shares WHERE project_id = ANY")) {
      const ids = params[0]
      return ok(state.shares.filter((s) => ids.includes(s.project_id) && s.revoked_at == null))
    }
    if (sql.startsWith("SELECT * FROM shares WHERE project_id = $1 AND revoked_at IS NULL")) {
      return ok(state.shares.filter((s) => s.project_id === params[0] && s.revoked_at == null))
    }
    if (sql.startsWith("INSERT INTO shares (project_id, tenant_id, pw_hash, created_by)")) {
      // ON CONFLICT (project_id) DO UPDATE … revoked_at = NULL
      let row = state.shares.find((s) => s.project_id === params[0])
      if (row) {
        Object.assign(row, { pw_hash: params[2], created_by: params[3], revoked_at: null })
      } else {
        row = {
          id: randomUUID(),
          project_id: params[0],
          tenant_id: params[1],
          pw_hash: params[2],
          created_by: params[3],
          created_at: now(),
          revoked_at: null,
        }
        state.shares.push(row)
      }
      return ok([row])
    }
    if (sql.startsWith("UPDATE shares SET revoked_at = now() WHERE project_id = $1")) {
      const row = state.shares.find((s) => s.project_id === params[0] && s.revoked_at == null)
      if (!row) return ok([], 0)
      row.revoked_at = now()
      return ok([], 1)
    }
    if (sql.startsWith("SELECT s.*, p.name AS project_name FROM shares s")) {
      const [projectId, slug] = params
      const tenant = state.tenants.find((t) => t.slug === slug)
      const project = state.projects.find((p) => p.id === projectId)
      const rows = state.shares
        .filter(
          (s) =>
            s.project_id === projectId && s.revoked_at == null &&
            tenant && s.tenant_id === tenant.id && project,
        )
        .map((s) => ({ ...s, project_name: project.name }))
      return ok(rows)
    }

    // ── projects ──────────────────────────────────────────────────────────────
    if (sql.startsWith("SELECT * FROM projects WHERE tenant_id = $1 ORDER BY updated_at DESC")) {
      return ok(
        state.projects
          .filter((p) => p.tenant_id === params[0])
          .sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1)),
      )
    }
    if (sql.startsWith("INSERT INTO projects (name, status, tenant_id,")) {
      const row = {
        id: randomUUID(),
        name: params[0],
        status: params[1],
        tenant_id: params[2],
        routes: J(params[3]),
        transport: J(params[4]),
        zeitraum: J(params[5]),
        distanz_km: null,
        fahrzeit_min: null,
        created_by: params[6],
        created_at: now(),
        updated_at: now(),
      }
      state.projects.push(row)
      return ok([row])
    }
    if (sql.startsWith("SELECT * FROM projects WHERE id = $1 AND tenant_id = $2")) {
      return ok(state.projects.filter((p) => p.id === params[0] && p.tenant_id === params[1]))
    }
    if (sql.startsWith("SELECT * FROM projects WHERE id = $1")) {
      return ok(state.projects.filter((p) => p.id === params[0]))
    }
    // Auto-Rerun: alle ausgewerteten, nicht-archivierten Projekte
    if (sql.startsWith("SELECT * FROM projects WHERE archived_at IS NULL AND status = 'fertig'")) {
      return ok(state.projects.filter((p) => p.archived_at == null && p.status === "fertig"))
    }
    if (sql.startsWith("UPDATE projects SET name = $2,")) {
      const row = state.projects.find((p) => p.id === params[0])
      if (!row) return ok([])
      Object.assign(row, {
        name: params[1],
        routes: J(params[2]),
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
        distanz_km: params[2],
        fahrzeit_min: params[3],
        updated_at: now(),
      })
      return ok([], 1)
    }
    if (sql.startsWith("DELETE FROM projects WHERE id = $1 AND tenant_id = $2")) {
      const before = state.projects.length
      state.projects = state.projects.filter(
        (p) => !(p.id === params[0] && p.tenant_id === params[1]),
      )
      const removed = before - state.projects.length
      if (removed) {
        // FK ON DELETE CASCADE
        state.findings = state.findings.filter((f) => f.project_id !== params[0])
        state.runs = state.runs.filter((r) => r.project_id !== params[0])
        state.shares = state.shares.filter((s) => s.project_id !== params[0])
        state.hiddenFindings = state.hiddenFindings.filter((h) => h.project_id !== params[0])
      }
      return ok([], removed)
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
    // Auto-Rerun-Diff: schlanke Fund-Projektion
    if (sql.startsWith("SELECT obstacle_id, severity, titel, kategorie, km, route_name")) {
      return ok(
        state.findings
          .filter((f) => f.project_id === params[0])
          .map((f) => ({
            obstacle_id: f.obstacle_id, severity: f.severity, titel: f.titel,
            kategorie: f.kategorie, km: f.km, route_name: f.route_name,
            strassen_ref: f.strassen_ref, gueltig_von: f.gueltig_von, gueltig_bis: f.gueltig_bis,
          })),
      )
    }
    if (sql.startsWith("SELECT f.*, p.name AS projekt_name FROM findings f")) {
      const [kategorie, severity, q, tenantId] = params
      const rows = state.findings
        .map((f) => {
          const p = state.projects.find((pr) => pr.id === f.project_id)
          return p ? { ...f, projekt_name: p.name, _tenant_id: p.tenant_id } : null
        })
        .filter(Boolean)
        .filter((f) => f._tenant_id === tenantId)
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
        route_id: params[15],
        route_name: params[16],
        created_at: now(),
      }
      state.findings.push(row)
      return ok([row])
    }

    // ── obstacles ─────────────────────────────────────────────────────────────
    if (sql.includes("FROM obstacles WHERE ($1::text IS NULL")) {
      const [kategorie, aktiv, q, tenantId, kategorien] = params
      const rows = state.obstacles
        .filter((o) => kategorie == null || o.kategorie === kategorie)
        .filter((o) => aktiv == null || o.aktiv === aktiv)
        .filter(
          (o) =>
            q == null ||
            ilike(o.name, q) || ilike(o.beschreibung, q) ||
            ilike(o.strassen_ref, q) || ilike(o.zustaendig, q),
        )
        .filter((o) => o.tenant_id == null || o.tenant_id === tenantId)
        .filter((o) => kategorien == null || kategorien.includes(o.kategorie))
        .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
      return ok(rows)
    }
    if (sql.includes("FROM obstacles WHERE aktiv = true AND (tenant_id IS NULL OR tenant_id = $1")) {
      const [tenantId, minLat, maxLat, minLng, maxLng] = params
      return ok(
        state.obstacles.filter(
          (o) =>
            o.aktiv && (o.tenant_id == null || o.tenant_id === tenantId) &&
            o.lat >= minLat && o.lat <= maxLat && o.lng >= minLng && o.lng <= maxLng,
        ),
      )
    }
    if (sql.startsWith("SELECT * FROM obstacles WHERE quellen_id = $1 AND externe_id = $2")) {
      return ok(
        state.obstacles.filter((o) => o.quellen_id === params[0] && o.externe_id === params[1]),
      )
    }
    // Bulk-Import (T-042): kompletter Quellen-Bestand in EINEM SELECT (OBSTACLE_COLS, ohne externe_id-Filter).
    if (sql.startsWith("SELECT id, kategorie, name") && sql.includes("FROM obstacles WHERE quellen_id = $1")) {
      return ok(state.obstacles.filter((o) => o.quellen_id === params[0]))
    }
    // Drift-Schutz-Fuzzy-Match (Importer): aktiv, gleiche Kategorie + normalisierter Name + ~Umkreis
    if (sql.startsWith("SELECT id, externe_id, lat, lng FROM obstacles WHERE quellen_id = $1 AND aktiv = true AND kategorie = $2")) {
      const [quellenId, kategorie, normNameParam, minLat, maxLat, minLng, maxLng] = params
      const norm = (s) => String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ")
      return ok(
        state.obstacles
          .filter(
            (o) =>
              o.quellen_id === quellenId && o.aktiv === true && o.kategorie === kategorie &&
              norm(o.name) === normNameParam &&
              o.lat != null && o.lng != null &&
              o.lat >= minLat && o.lat <= maxLat && o.lng >= minLng && o.lng <= maxLng,
          )
          .map((o) => ({ id: o.id, externe_id: o.externe_id, lat: o.lat, lng: o.lng })),
      )
    }
    if (sql.startsWith("SELECT * FROM obstacles WHERE id = $1")) {
      return ok(state.obstacles.filter((o) => o.id === params[0]))
    }
    // fachId-Vergabe (obstaclesRepo): Advisory-Lock ist im Fake ein No-op,
    // die Index-Ableitung läuft semantisch über den State.
    if (sql.startsWith("SELECT pg_advisory_xact_lock")) {
      return ok([{ pg_advisory_xact_lock: null }])
    }
    // Rerun-Serialisierung (rerunAll): im Fake immer erfolgreich (ein Prozess).
    if (sql.startsWith("SELECT pg_try_advisory_xact_lock")) {
      return ok([{ ok: true }])
    }
    if (sql.startsWith("SELECT COALESCE(MAX(substring(fach_id FROM 1 FOR 4)::int), 0) AS max_index")) {
      const indexes = state.obstacles
        .filter((o) => o.quellen_id === params[0] && /^\d{4}/.test(o.fach_id ?? ""))
        .map((o) => Number(o.fach_id.slice(0, 4)))
      return ok([{ max_index: indexes.length ? Math.max(...indexes) : 0 }])
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
        fach_id: params[11],
        quellen_id: params[12],
        realer_start: params[13],
        aktiv: params[14],
        demo: params[15],
        tenant_id: params[16] ?? null,
        externe_id: params[17] ?? null,
        created_at: now(),
        updated_at: now(),
      }
      // UNIQUE obstacles_quelle_extern_ux (quellen_id, externe_id) WHERE externe_id IS NOT NULL
      if (
        row.externe_id != null &&
        state.obstacles.some((o) => o.quellen_id === row.quellen_id && o.externe_id === row.externe_id)
      ) {
        throw new Error("fakeDb: unique violation obstacles_quelle_extern_ux")
      }
      state.obstacles.push(row)
      return ok([row])
    }
    if (sql.startsWith("UPDATE obstacles SET kategorie = $2,") && sql.includes("fach_id = $13")) {
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
        fach_id: params[12],
        quellen_id: params[13],
        realer_start: params[14],
        aktiv: params[15],
        demo: params[16],
        updated_at: now(),
      })
      return ok([row])
    }
    // Importer-Sachfeld-Update: fach_id/realer_start/aktiv/tenant bleiben unberührt
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
        updated_at: now(),
      })
      return ok([row])
    }
    if (sql.startsWith("DELETE FROM obstacles WHERE id = $1")) {
      const before = state.obstacles.length
      state.obstacles = state.obstacles.filter((o) => o.id !== params[0])
      return ok([], before - state.obstacles.length)
    }
    // Vollbestand-Reconcile: Wiederkehrer reaktivieren
    if (sql.startsWith("UPDATE obstacles SET aktiv = true, updated_at = now() WHERE id = $1")) {
      const row = state.obstacles.find((o) => o.id === params[0])
      if (!row) return ok([], 0)
      row.aktiv = true
      row.updated_at = now()
      return ok([row], 1)
    }
    // Vollbestand-Reconcile: im Feed Fehlende deaktivieren
    if (sql.startsWith("UPDATE obstacles SET aktiv = false, updated_at = now() WHERE quellen_id")) {
      const [quellenId, seen] = params
      const matched = state.obstacles.filter(
        (o) => o.quellen_id === quellenId && o.aktiv === true &&
          o.externe_id != null && !seen.includes(o.externe_id),
      )
      for (const o of matched) {
        o.aktiv = false
        o.updated_at = now()
      }
      return ok([], matched.length)
    }
    // Hygiene: abgelaufene (gueltig_bis + Karenz) deaktivieren
    if (sql.startsWith("UPDATE obstacles SET aktiv = false, updated_at = now() WHERE aktiv = true")) {
      const graceDays = Number(params[0] ?? 7)
      const cutoff = new Date(Date.now() - graceDays * 86_400_000).toISOString().slice(0, 10)
      const matched = state.obstacles.filter(
        (o) => o.aktiv && o.gueltig_bis != null && String(o.gueltig_bis).slice(0, 10) < cutoff,
      )
      for (const o of matched) {
        o.aktiv = false
        o.updated_at = now()
      }
      return ok(matched.map((o) => ({
        id: o.id, tenant_id: o.tenant_id, quellen_id: o.quellen_id,
        name: o.name, gueltig_bis: o.gueltig_bis,
      })))
    }

    // ── quellen / import_runs (v3) ────────────────────────────────────────────
    if (sql.startsWith("SELECT * FROM quellen ORDER BY id ASC")) {
      return ok([...state.quellen].sort((a, b) => (a.id < b.id ? -1 : 1)))
    }
    if (sql.startsWith("SELECT id FROM quellen LIMIT 1")) {
      return ok(state.quellen.slice(0, 1).map((q) => ({ id: q.id })))
    }
    if (sql.startsWith("UPDATE quellen SET letzter_abruf = now() WHERE id = $1")) {
      const row = state.quellen.find((q) => q.id === params[0])
      if (!row) return ok([], 0)
      row.letzter_abruf = now()
      return ok([], 1)
    }
    if (sql.startsWith("INSERT INTO import_runs (quelle_id, status)")) {
      const row = {
        id: randomUUID(),
        quelle_id: params[0],
        status: "running",
        stats: {},
        log: null,
        started_at: now(),
        finished_at: null,
      }
      state.importRuns.push(row)
      return ok([row])
    }
    if (sql.startsWith("UPDATE import_runs SET status = $2,")) {
      const row = state.importRuns.find((r) => r.id === params[0])
      if (!row) return ok([], 0)
      Object.assign(row, {
        status: params[1],
        stats: params[2] != null ? J(params[2]) : {},
        log: params[3],
        finished_at: now(),
      })
      return ok([row])
    }
    if (sql.startsWith("SELECT DISTINCT ON (quelle_id) quelle_id, status FROM import_runs")) {
      const latest = new Map()
      for (const r of state.importRuns) {
        const prev = latest.get(r.quelle_id)
        if (!prev || prev.started_at < r.started_at) latest.set(r.quelle_id, r)
      }
      return ok([...latest.values()].map((r) => ({ quelle_id: r.quelle_id, status: r.status })))
    }
    if (sql.startsWith("SELECT * FROM import_runs ORDER BY started_at DESC LIMIT 50")) {
      return ok(
        [...state.importRuns].sort((a, b) => (a.started_at < b.started_at ? 1 : -1)).slice(0, 50),
      )
    }

    // ── notifications (v3.1: Nachrichtenzentrum/Glocke) ───────────────────────
    if (sql.startsWith("INSERT INTO notifications")) {
      const row = {
        id: randomUUID(),
        tenant_id: params[0], project_id: params[1], projekt_name: params[2],
        typ: params[3], severity: params[4], obstacle_id: params[5], kategorie: params[6],
        titel: params[7], beschreibung: params[8], km: params[9], route_name: params[10],
        strassen_ref: params[11], gueltig_von: params[12], gueltig_bis: params[13],
        created_at: now(), read_at: null, emailed_at: null,
      }
      state.notifications.push(row)
      return ok([row])
    }
    if (sql.startsWith("SELECT * FROM notifications WHERE tenant_id = $1 ORDER BY created_at DESC")) {
      return ok(
        state.notifications
          .filter((n) => n.tenant_id === params[0])
          .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
          .slice(0, 100),
      )
    }
    if (sql.startsWith("SELECT count(*)::int AS n FROM notifications WHERE tenant_id = $1 AND read_at IS NULL")) {
      return ok([{
        n: state.notifications.filter((n) => n.tenant_id === params[0] && n.read_at == null).length,
      }])
    }
    if (sql.startsWith("UPDATE notifications SET read_at = now() WHERE id = $1 AND tenant_id = $2")) {
      const row = state.notifications.find(
        (n) => n.id === params[0] && n.tenant_id === params[1] && n.read_at == null,
      )
      if (!row) return ok([], 0)
      row.read_at = now()
      return ok([], 1)
    }
    if (sql.startsWith("UPDATE notifications SET read_at = now() WHERE tenant_id = $1 AND read_at IS NULL")) {
      const rows = state.notifications.filter((n) => n.tenant_id === params[0] && n.read_at == null)
      for (const n of rows) n.read_at = now()
      return ok([], rows.length)
    }

    // ── bug_reports (v3.2: In-App-Fehlermeldungen + /debug-Triage) ────────────
    if (sql.startsWith("INSERT INTO bug_reports")) {
      const row = {
        id: randomUUID(),
        email: params[0], tenant_slug: params[1], is_admin: params[2],
        beschreibung: params[3], view_path: params[4], kontext: J(params[5]),
        status: "offen", notiz: null, created_at: now(), resolved_at: null,
      }
      state.bugReports.push(row)
      return ok([row])
    }
    if (sql.startsWith("SELECT * FROM bug_reports WHERE status = $1 ORDER BY created_at DESC")) {
      return ok(
        state.bugReports
          .filter((b) => b.status === params[0])
          .sort((a, b) => (a.created_at < b.created_at ? 1 : -1)),
      )
    }
    if (sql.startsWith("SELECT * FROM bug_reports ORDER BY created_at DESC")) {
      return ok([...state.bugReports].sort((a, b) => (a.created_at < b.created_at ? 1 : -1)))
    }
    if (sql.startsWith("SELECT status, count(*)::int AS n FROM bug_reports GROUP BY status")) {
      const by = {}
      for (const b of state.bugReports) by[b.status] = (by[b.status] ?? 0) + 1
      return ok(Object.entries(by).map(([status, n]) => ({ status, n })))
    }
    if (sql.startsWith("UPDATE bug_reports SET")) {
      const row = state.bugReports.find((b) => b.id === params[0])
      if (!row) return ok([])
      const [, status, notizGesetzt, notiz] = params
      if (status != null) {
        row.status = status
        row.resolved_at =
          status === "erledigt" || status === "verworfen" ? (row.resolved_at ?? now()) : null
      }
      if (notizGesetzt) row.notiz = notiz
      return ok([row])
    }
    if (sql.startsWith("DELETE FROM bug_reports WHERE id = $1")) {
      const before = state.bugReports.length
      state.bugReports = state.bugReports.filter((b) => b.id !== params[0])
      return ok([], before - state.bugReports.length)
    }

    // ── news ──────────────────────────────────────────────────────────────────
    if (sql.startsWith("SELECT * FROM news ORDER BY published_at DESC LIMIT 50")) {
      return ok(
        [...state.news].sort((a, b) => (a.published_at < b.published_at ? 1 : -1)).slice(0, 50),
      )
    }
    if (sql.startsWith("INSERT INTO news (kategorie, titel, body, created_by)")) {
      const row = {
        id: randomUUID(), kategorie: params[0], titel: params[1], body: params[2],
        created_by: params[3], published_at: now(),
      }
      state.news.push(row)
      return ok([row])
    }
    if (sql.startsWith("DELETE FROM news WHERE id = $1")) {
      const before = state.news.length
      state.news = state.news.filter((n) => n.id !== params[0])
      return ok([], before - state.news.length)
    }

    // ── hidden_findings (ausgeblendete Funde, pro Projekt) ────────────────────
    if (sql.startsWith("SELECT finding_key, grund, grund_text FROM hidden_findings WHERE project_id = $1")) {
      return ok(
        state.hiddenFindings
          .filter((h) => h.project_id === params[0])
          .map((h) => ({ finding_key: h.finding_key, grund: h.grund, grund_text: h.grund_text })),
      )
    }
    if (sql.startsWith("SELECT project_id, finding_key, grund, grund_text FROM hidden_findings WHERE project_id = ANY")) {
      const ids = params[0]
      return ok(
        state.hiddenFindings
          .filter((h) => ids.includes(h.project_id))
          .map((h) => ({
            project_id: h.project_id, finding_key: h.finding_key, grund: h.grund, grund_text: h.grund_text,
          })),
      )
    }
    if (sql.startsWith("INSERT INTO hidden_findings (project_id, finding_key,")) {
      let row = state.hiddenFindings.find(
        (h) => h.project_id === params[0] && h.finding_key === params[1],
      )
      if (row) {
        Object.assign(row, {
          grund: params[3], grund_text: params[4], kontext: J(params[5]), hidden_by: params[6],
        })
      } else {
        row = {
          id: randomUUID(),
          project_id: params[0], finding_key: params[1], obstacle_id: params[2],
          grund: params[3], grund_text: params[4], kontext: J(params[5]), hidden_by: params[6],
          created_at: now(),
        }
        state.hiddenFindings.push(row)
      }
      return ok([row], 1)
    }
    if (sql.startsWith("DELETE FROM hidden_findings WHERE project_id = $1 AND finding_key = $2")) {
      const before = state.hiddenFindings.length
      state.hiddenFindings = state.hiddenFindings.filter(
        (h) => !(h.project_id === params[0] && h.finding_key === params[1]),
      )
      return ok([], before - state.hiddenFindings.length)
    }
    if (sql.startsWith("SELECT h.id, h.project_id, h.finding_key")) {
      const rows = [...state.hiddenFindings]
        .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
        .slice(0, 500)
        .map((h) => {
          const p = state.projects.find((pr) => pr.id === h.project_id)
          return {
            id: h.id, project_id: h.project_id, finding_key: h.finding_key, obstacle_id: h.obstacle_id,
            grund: h.grund, grund_text: h.grund_text, kontext: h.kontext ?? {},
            hidden_by: h.hidden_by, created_at: h.created_at, projekt_name: p?.name ?? null,
          }
        })
      return ok(rows)
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

    // ── stats (tenant-gescoped außer Hindernisse) ─────────────────────────────
    if (sql.startsWith("SELECT count(*)::int AS projekte")) {
      const mine = state.projects.filter((p) => p.tenant_id === params[0])
      return ok([{
        projekte: mine.length,
        fertig: mine.filter((p) => p.status === "fertig").length,
      }])
    }
    if (sql.includes("AS funde")) {
      const tenantProjects = new Set(
        state.projects.filter((p) => p.tenant_id === params[0]).map((p) => p.id),
      )
      const mine = state.findings.filter((f) => tenantProjects.has(f.project_id))
      const by = (s) => mine.filter((f) => f.severity === s).length
      return ok([{
        funde: mine.length,
        kritisch: by("kritisch"),
        warnung: by("warnung"),
        hinweis: by("hinweis"),
      }])
    }
    if (sql.includes("AS hindernisse")) {
      const visible = state.obstacles.filter(
        (o) => o.aktiv && (o.tenant_id == null || o.tenant_id === params[0]),
      )
      return ok([{
        hindernisse: visible.length,
        hindernisse_demo: visible.filter((o) => o.demo).length,
      }])
    }
    if (sql.startsWith("SELECT max(r.finished_at) AS letzte")) {
      const tenantProjects = new Set(
        state.projects.filter((p) => p.tenant_id === params[0]).map((p) => p.id),
      )
      const done = state.runs.filter(
        (r) => r.status === "done" && r.finished_at && tenantProjects.has(r.project_id),
      )
      const letzte = done.length ? done.map((r) => r.finished_at).sort().at(-1) : null
      return ok([{ letzte }])
    }

    throw new Error(`fakeDb: unbekanntes SQL: ${sql}`)
  }

  const db = { state, seedTenant, query, tx: (fn) => fn(db) }
  return db
}
