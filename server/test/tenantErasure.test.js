import { describe, it, expect, vi } from "vitest"

// tenantMembers gruppiert intern per tenant_id (membersByTenant) — im Unit-Test entkoppeln
// wir das und liefern feste Beispiel-Mitglieder, damit die mail-/mitglied-gekeyten UPDATEs feuern.
vi.mock("../src/tenants.js", () => ({
  tenantMembers: vi.fn(async () => [{ email: "a@x.de", role: "admin" }, { email: "b@x.de", role: "user" }]),
}))

const { anonymizeTenant, exportTenant } = await import("../src/tenantErasure.js")

// Aufzeichnender Stub statt fakeDb: wir prüfen WELCHE Statements abgesetzt werden (PII-Abdeckung),
// nicht den Datenzustand.
function recordingDb() {
  const calls = []
  const query = vi.fn(async (sql) => {
    calls.push({ sql })
    return { rows: [] }
  })
  const db = { query, tx: (fn) => fn(db), calls }
  return db
}

describe("anonymizeTenant (Art.17)", () => {
  it("deckt alle PII-Tabellen ab, pseudonymisiert Mails, löscht den Chat NICHT", async () => {
    const db = recordingDb()
    const deactivate = vi.fn(async () => true)
    const res = await anonymizeTenant(db, { id: "11111111-1111-1111-1111-111111111111", slug: "kunde" }, { deactivate })

    const sqls = db.calls.map((c) => c.sql)
    const has = (re) => sqls.some((s) => re.test(s))

    for (const t of [
      "obstacles", "findings", "projects", "hidden_findings", "shares", "folders",
      "finding_chat_messages", "seat_codes", "tenant_members", "mail_prefs", "mail_optout",
      "viewer_route_prefs",
      "disclaimer_acceptances", "bug_reports", "source_requests", "analytics_sessions",
      "analytics_events", "tenant_audit_log", "tenants",
    ]) {
      expect(has(new RegExp(`\\b${t}\\b`)), `Tabelle ${t} nicht behandelt`).toBe(true)
    }
    // deterministisches Pseudonym (idempotent)
    expect(has(/sha256/)).toBe(true)
    // gerichtsfester Chat wird anonymisiert (UPDATE), NICHT gelöscht
    expect(has(/UPDATE finding_chat_messages/)).toBe(true)
    expect(has(/DELETE FROM finding_chat_messages/)).toBe(false)
    // Re-Injection-Schutz: Kontakt-PII der tenant-eigenen obstacles raus
    expect(has(/UPDATE obstacles SET quelle = quelle - 'kontakt'/)).toBe(true)
    // externe Auth-Konten je Mitglied gesperrt
    expect(deactivate).toHaveBeenCalledTimes(2)
    expect(res.anonymizedMembers).toBe(2)
  })

  it("läuft trotz deactivate-Fehler (502/404) weiter", async () => {
    const db = recordingDb()
    const deactivate = vi.fn(async () => { throw new Error("502") })
    await expect(anonymizeTenant(db, { id: "x", slug: "s" }, { deactivate })).resolves.toBeTruthy()
  })
})

describe("exportTenant (Art.15/20)", () => {
  it("liefert tenant-gefilterte Struktur ohne pw_hash, obstacles strikt tenant-scoped", async () => {
    const db = recordingDb()
    const out = await exportTenant(db, {
      id: "t1", slug: "kunde", name: "Kunde GmbH", plan: "standard", max_seats: 5, valid_until: null, created_at: "2026-01-01",
    })
    expect(out.schemaVersion).toBe(1)
    expect(out.tenant.slug).toBe("kunde")
    expect(out).toHaveProperty("projects")
    expect(out).toHaveProperty("findingChat")
    expect(JSON.stringify(out)).not.toMatch(/pw_hash/)
    const obstacleSel = db.calls.find((c) => /FROM obstacles/.test(c.sql))
    expect(obstacleSel.sql).toMatch(/tenant_id = \$1/)
    expect(obstacleSel.sql).not.toMatch(/IS NULL/)
  })
})
