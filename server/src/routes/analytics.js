// Plattform-Analytics — Nutzungs-/Online-Statistik (nur Admin: mxk/vki).
//
// Datenfluss:
//   - Heartbeat (PUT /heartbeat): jeder eingeloggte Nutzer pingt alle ~30s. Verlängert
//     die offene Session oder startet eine neue (Session-Lücke > SESSION_LUECKE). Daraus
//     ergeben sich Online-Status, aktive Verweildauer und Sessions je Nutzer.
//   - Events (analytics_events): diskrete Aktionen — derzeit "manual_analysis", geloggt
//     im Analyse-Endpoint (logAnalyticsEvent), für "manuelle Auswertungen je Nutzer".
//
// Lesen (GET /overview) ist auf Rolle admin gegated — es ist tenant-übergreifend.

import { Router } from "express"
import { requireRole } from "../auth.js"
import { asyncHandler } from "../util.js"

const ONLINE_FENSTER = "3 minutes" // last_seen jünger ⇒ "jetzt online"
const SESSION_LUECKE = "5 minutes" // größere Pause ⇒ neue Session

// Aus der Analytik ausgeblendete Accounts (Max-Wunsch 2026-06-21): der eigene Dev-/Admin-Account
// und die Wegwerf-/Test-„Viewer" verzerren die Nutzungsstatistik — sie sind keine echten
// Mandanten-Nutzer. Statische Allowlist (KEINE Nutzereingabe → Inline-Literal injektionssicher).
const ANALYTICS_EXCLUDE_EMAILS = ["mxk@setreo.de"]
const ANALYTICS_EXCLUDE_LIKE = ["rmtest-%", "csp-test-%", "%wegwerf%", "%@setreo-cloud.test"]
/** SQL-Prädikat „Spalte ist KEIN interner/Test-Account". col = Spaltenname (z.B. "email", "s.email"). */
function excludeSql(col = "email") {
  const inList = ANALYTICS_EXCLUDE_EMAILS.map((e) => `'${e.replace(/'/g, "''")}'`).join(", ")
  const likes = ANALYTICS_EXCLUDE_LIKE.map((p) => `${col} NOT LIKE '${p.replace(/'/g, "''")}'`).join(" AND ")
  return `${col} NOT IN (${inList}) AND ${likes}`
}

/** Diskretes Analytics-Event protokollieren. Fire-and-forget: wirft NIE — Analytics
 *  darf den eigentlichen Request (z.B. die Auswertung) niemals brechen. */
export async function logAnalyticsEvent(db, { email, tenantSlug = null, typ, meta = null }) {
  if (!email || !typ) return
  try {
    await db.query(
      "INSERT INTO analytics_events (email, tenant_slug, typ, meta) VALUES ($1, $2, $3, $4)",
      [email, tenantSlug, typ, meta],
    )
  } catch {
    // bewusst geschluckt
  }
}

export function analyticsRouter({ db }) {
  const r = Router()

  // T-484: /overview fährt ~7 Aggregat-Queries über analytics_sessions/-events. Bei jedem Admin-
  // Aufruf (Auto-Refresh/Reload) erneut = teuer. 60s-In-Memory-Cache (admin-übergreifend, Daten
  // sind nicht sekundengenau nötig). Reset bei Prozess-Neustart — kein Persistenz-Bedarf.
  let overviewCache = null
  let overviewCacheAt = 0

  // Heartbeat — jeder eingeloggte Nutzer. Kein Body, keine Rolle nötig.
  r.put("/heartbeat", asyncHandler(async (req, res) => {
    const email = req.ctx?.email
    if (!email) return res.status(204).end() // ohne Identität (dev) nichts tracken
    const slug = req.ctx?.tenant?.slug ?? null
    const ua = (req.get("user-agent") ?? "").slice(0, 300)
    // Offene Session verlängern …
    const upd = await db.query(
      `UPDATE analytics_sessions SET last_seen = now(), hits = hits + 1
        WHERE id = (
          SELECT id FROM analytics_sessions
           WHERE email = $1 AND last_seen > now() - interval '${SESSION_LUECKE}'
           ORDER BY last_seen DESC LIMIT 1
        ) RETURNING id`,
      [email],
    )
    // … sonst neue Session öffnen.
    if (upd.rowCount === 0) {
      await db.query(
        "INSERT INTO analytics_sessions (email, tenant_slug, user_agent) VALUES ($1, $2, $3)",
        [email, slug, ua],
      )
    }
    res.status(204).end()
  }))

  // Übersicht — nur Admin. Online-Status + Totals + Nutzung je Nutzer + letzte Sessions.
  r.get("/overview", requireRole("admin"), asyncHandler(async (_req, res) => {
    if (overviewCache && Date.now() - overviewCacheAt < 60_000) return res.json(overviewCache)
    const EXCL = excludeSql() // interne/Test-Accounts überall konsistent ausblenden
    const EXCL_S = excludeSql("s.email")
    const [online, proNutzer, events, letzte, totals, proTagRows, analysenProTag] = await Promise.all([
      db.query(
        `SELECT email, max(last_seen) AS last_seen FROM analytics_sessions
          WHERE last_seen > now() - interval '${ONLINE_FENSTER}' AND ${EXCL}
          GROUP BY email ORDER BY max(last_seen) DESC`,
      ),
      db.query(
        `SELECT email, count(*) AS sessions, sum(hits) AS hits,
           round(sum(extract(epoch FROM (last_seen - started_at))) / 60.0) AS aktiv_min,
           min(started_at) AS erster, max(last_seen) AS letzter
         FROM analytics_sessions WHERE ${EXCL} GROUP BY email`,
      ),
      db.query(
        `SELECT email, count(*) AS n FROM analytics_events
         WHERE typ = 'manual_analysis' AND ${EXCL} GROUP BY email`,
      ),
      db.query(
        `SELECT email, tenant_slug, started_at, last_seen, hits,
           round(extract(epoch FROM (last_seen - started_at)) / 60.0) AS dauer_min
         FROM analytics_sessions WHERE ${EXCL} ORDER BY last_seen DESC LIMIT 50`,
      ),
      db.query(
        `SELECT
           (SELECT count(*) FROM analytics_sessions WHERE ${EXCL}) AS sessions,
           (SELECT count(DISTINCT email) FROM analytics_sessions WHERE ${EXCL}) AS nutzer,
           (SELECT count(*) FROM analytics_events WHERE typ = 'manual_analysis' AND ${EXCL}) AS manuelle`,
      ),
      // Zeitreihe der letzten 14 Tage, lückenlos (generate_series füllt nutzungsfreie Tage mit 0).
      db.query(
        `SELECT to_char(d::date, 'YYYY-MM-DD') AS tag,
           count(DISTINCT s.email) AS nutzer, count(s.id) AS sessions
         FROM generate_series(current_date - interval '13 days', current_date, interval '1 day') d
         LEFT JOIN analytics_sessions s ON date_trunc('day', s.last_seen)::date = d::date AND ${EXCL_S}
         GROUP BY d ORDER BY d`,
      ),
      db.query(
        `SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS tag, count(*) AS n
         FROM analytics_events
         WHERE typ = 'manual_analysis' AND created_at >= current_date - interval '13 days' AND ${EXCL}
         GROUP BY 1`,
      ),
    ])

    const analysenJeNutzer = new Map(events.rows.map((e) => [e.email, Number(e.n)]))
    const proNutzerOut = proNutzer.rows
      .map((u) => ({
        email: u.email,
        sessions: Number(u.sessions),
        hits: Number(u.hits),
        aktivMin: Number(u.aktiv_min ?? 0),
        manuelleAuswertungen: analysenJeNutzer.get(u.email) ?? 0,
        ersterBesuch: u.erster,
        letzterBesuch: u.letzter,
      }))
      .sort((a, b) => b.aktivMin - a.aktivMin)

    const analysenTag = new Map(analysenProTag.rows.map((e) => [e.tag, Number(e.n)]))
    const proTag = proTagRows.rows.map((t) => ({
      tag: t.tag,
      nutzer: Number(t.nutzer),
      sessions: Number(t.sessions),
      auswertungen: analysenTag.get(t.tag) ?? 0,
    }))

    const payload = {
      onlineJetzt: online.rows.length,
      online: online.rows.map((o) => ({ email: o.email, lastSeen: o.last_seen })),
      totals: {
        sessions: Number(totals.rows[0]?.sessions ?? 0),
        nutzer: Number(totals.rows[0]?.nutzer ?? 0),
        manuelleAuswertungen: Number(totals.rows[0]?.manuelle ?? 0),
        aktivMinGesamt: proNutzerOut.reduce((s, u) => s + u.aktivMin, 0),
      },
      proNutzer: proNutzerOut,
      proTag,
      letzteSessions: letzte.rows.map((s) => ({
        email: s.email,
        tenantSlug: s.tenant_slug,
        startedAt: s.started_at,
        lastSeen: s.last_seen,
        hits: Number(s.hits),
        dauerMin: Number(s.dauer_min ?? 0),
      })),
    }
    overviewCache = payload
    overviewCacheAt = Date.now()
    res.json(payload)
  }))

  return r
}
