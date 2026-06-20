// Projekt-Benachrichtigungsmail: fasst die Fund-Änderungen eines Auto-Rerun-Laufs
// (neu / geändert / weggefallen) für EIN Projekt zusammen und schickt sie an die
// Mandanten-Mitglieder (minus Opt-out). Eine Mail je Lauf je Projekt — kein Spam.
//
// Aufgerufen aus engine/rerunAll.js NACHDEM die In-App-Benachrichtigungen (Glocke)
// persistiert wurden. Mail ist additiv: schlägt sie fehl, bleibt die Glocke bestehen.

import { mailEnabled, sendMail } from "./mailer.js"

const PUBLIC_URL = (env) => (env.PUBLIC_ROADMAP_URL || "https://setreo-cloud.com/roadmap").replace(/\/$/, "")

const TYP_META = {
  neu: { label: "Neuer Fund", farbe: "#b45309", bg: "#fffbeb", border: "#fde68a" },
  geaendert: { label: "Geändert", farbe: "#1d4ed8", bg: "#eff6ff", border: "#bfdbfe" },
  weggefallen: { label: "Entfallen", farbe: "#527121", bg: "#f3f7ec", border: "#d6e3bd" },
}
const SEV_FARBE = { kritisch: "#dc2626", warnung: "#ea580c", hinweis: "#ca8a04", info: "#527121" }

const esc = (v) =>
  String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

const fmtDate = (d) => {
  if (!d) return ""
  // T-473: pg liefert DATE/timestamp mal als ISO-String, mal als Date-Objekt. String(dateObj)
  // ergäbe "Tue Jun 30 2026 …" → kaputt. Beide Fälle robust auf TT.MM.JJJJ normalisieren.
  const iso = d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.split("-").reverse().join(".") : ""
}
const gueltig = (f) => {
  const v = fmtDate(f.gueltig_von)
  const b = fmtDate(f.gueltig_bis)
  if (v && b) return `${v} – ${b}`
  if (v) return `ab ${v}`
  if (b) return `bis ${b}`
  return "unbefristet"
}

const ALL_SEV = ["kritisch", "warnung", "hinweis"]

/** Mandanten-Mitglieder + ihre Mail-Präferenz (Default, wenn keine Zeile). */
async function membersWithPrefs(db, tenantId) {
  if (!tenantId) return []
  const { rows } = await db.query(
    `SELECT m.email,
       COALESCE(p.enabled, true) AS enabled,
       COALESCE(p.scope, 'eigene') AS scope,
       COALESCE(p.severities, '["kritisch","warnung","hinweis"]'::jsonb) AS severities
     FROM tenant_members m
     LEFT JOIN mail_prefs p ON p.tenant_id = m.tenant_id AND p.email = m.email
     WHERE m.tenant_id = $1`,
    [tenantId],
  )
  return rows
}

/** Events auf die gewählten Schweregrade filtern. „weggefallen" (severity=info) über die
 *  Severity des entfallenen Funds (e.finding.severity) berücksichtigen. */
function filterEventsForSev(events, severities) {
  const set = new Set(Array.isArray(severities) ? severities : ALL_SEV)
  return events.filter((e) => set.has(e.severity) || set.has(e.finding?.severity))
}

function buildSubject(project, events) {
  const neu = events.filter((e) => e.typ === "neu").length
  if (neu > 0) {
    const krit = events.some((e) => e.typ === "neu" && e.severity === "kritisch")
    return `${krit ? "🚨" : "🚧"} ${neu} neue${neu === 1 ? "r" : ""} Fund${neu === 1 ? "" : "e"} auf „${project.name}“`
  }
  return `Aktualisierung: ${events.length} Änderung${events.length === 1 ? "" : "en"} auf „${project.name}“`
}

function eventCardHtml(e) {
  const t = TYP_META[e.typ] ?? TYP_META.geaendert
  const f = e.finding
  const sev = SEV_FARBE[e.severity] ?? "#6b7280"
  const meta = [f.strassen_ref, f.km != null ? `km ${String(f.km).replace(".", ",")}` : null, f.route_name]
    .filter(Boolean).map(esc).join(" · ")
  return `<div style="border:1px solid ${t.border};background:${t.bg};border-radius:12px;padding:13px 15px;margin-bottom:12px">
    <div>
      <span style="display:inline-block;background:${t.farbe};color:#fff;font-size:10px;font-weight:700;padding:2px 8px;border-radius:999px;letter-spacing:.04em">${esc(t.label.toUpperCase())}</span>
      <span style="display:inline-block;background:${sev};color:#fff;font-size:10px;font-weight:700;padding:2px 8px;border-radius:999px;letter-spacing:.04em;margin-left:5px">${esc((e.severity || "").toUpperCase())}</span>
    </div>
    <div style="font-weight:700;font-size:14px;margin:9px 0 2px;color:#111827">${esc(f.titel || "Fund")}</div>
    ${meta ? `<div style="color:#6b7280;font-size:12px">${meta}</div>` : ""}
    ${e.beschreibung ? `<div style="color:#374151;font-size:13px;margin-top:7px">${esc(e.beschreibung)}</div>` : ""}
    <div style="color:#9ca3af;font-size:12px;margin-top:6px">Gültig: ${esc(gueltig(f))}</div>
  </div>`
}

function buildHtml(project, events, env) {
  const url = `${PUBLIC_URL(env)}/projekte/${project.id}`
  const settings = `${PUBLIC_URL(env)}/einstellungen`
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden">
    <div style="background:#527121;padding:20px 24px;color:#fff">
      <div style="font-size:13px;letter-spacing:.06em;text-transform:uppercase;opacity:.85">Setreo Roadmap · Benachrichtigung</div>
      <div style="font-size:19px;font-weight:700;margin-top:4px">Änderungen auf „${esc(project.name)}“</div>
    </div>
    <div style="padding:20px 24px;color:#1f2937;font-size:14px;line-height:1.55">
      <p style="margin:0 0 16px">beim letzten Datenabgleich hat sich die Auswertung Ihrer Strecke geändert:</p>
      ${events.map(eventCardHtml).join("")}
      <a href="${esc(url)}" style="display:inline-block;background:#527121;color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:11px 20px;border-radius:10px;margin-top:4px">Auswertung im Dashboard öffnen →</a>
    </div>
    <div style="padding:16px 24px;border-top:1px solid #f3f4f6;color:#9ca3af;font-size:11px;line-height:1.5">
      Automatische Benachrichtigung von Setreo Roadmap — diese Adresse versendet nur, bitte nicht antworten.
      E-Mail-Benachrichtigungen verwalten: <a href="${esc(settings)}" style="color:#6b7280">Einstellungen</a>.
    </div>
  </div>`
}

function buildText(project, events, env) {
  const lines = events.map((e) => {
    const f = e.finding
    const t = TYP_META[e.typ]?.label ?? "Änderung"
    const meta = [f.strassen_ref, f.km != null ? `km ${f.km}` : null].filter(Boolean).join(" ")
    return `- [${t} · ${e.severity}] ${f.titel || "Fund"}${meta ? ` (${meta})` : ""}\n  ${e.beschreibung || ""} | Gültig: ${gueltig(f)}`
  })
  return `Änderungen auf Ihrer Strecke „${project.name}":\n\n${lines.join("\n")}\n\n` +
    `Auswertung öffnen: ${PUBLIC_URL(env)}/projekte/${project.id}\n\n` +
    `Automatische Benachrichtigung von Setreo Roadmap (noreply). E-Mail verwalten: ${PUBLIC_URL(env)}/einstellungen`
}

/**
 * Benachrichtigungsmail für ein Projekt + seine Events versenden.
 * No-op wenn keine Events, kein Tenant oder kein Empfänger. Wirft nie.
 */
export async function sendProjectNotificationMail(
  { db, project, events }, { env = process.env, fetchImpl = globalThis.fetch, log = () => {} } = {},
) {
  if (!Array.isArray(events) || events.length === 0) return { sent: 0, skipped: true }
  if (!project?.tenantId) return { sent: 0, skipped: true }
  // Früher Ausstieg wenn Mail nicht konfiguriert/aktiv → kein DB-Lookup (hält den
  // Auto-Rerun-Pfad ohne Mailjet komplett DB-neutral, u.a. für Tests).
  if (!mailEnabled(env)) return { sent: 0, skipped: true }
  let members = []
  try {
    members = await membersWithPrefs(db, project.tenantId)
  } catch (err) {
    log(`mail: Empfänger-Lookup fehlgeschlagen — ${err?.message ?? err}`)
    return { sent: 0, error: "recipients" }
  }

  // Pro Mitglied nach Präferenz versenden: aktiv? Scope (eigene = nur Ersteller, alle = jedes
  // Mandanten-Projekt)? Events auf die gewählten Schweregrade gefiltert? Jeder bekommt nur seine
  // relevanten Änderungen — kein Spam, gezielt nach Kritikalität.
  let totalSent = 0
  for (const m of members) {
    if (!m.enabled) continue
    if (m.scope === "eigene" && project.erstelltVon !== m.email) continue
    const evs = filterEventsForSev(events, m.severities)
    if (evs.length === 0) continue
    const res = await sendMail(
      {
        recipients: [{ email: m.email }],
        subject: buildSubject(project, evs),
        html: buildHtml(project, evs, env),
        text: buildText(project, evs, env),
      },
      { env, fetchImpl, log },
    )
    totalSent += res?.sent ?? 0
  }
  return totalSent > 0 ? { sent: totalSent } : { sent: 0, skipped: true }
}
