// Mailservice: Mailjet-Send-Wrapper (no-op ohne Konfig, korrekte Payload) +
// Projekt-Benachrichtigungsmail (Empfänger via DB, Opt-out, Inhalt).

import { describe, expect, it, vi } from "vitest"
import { mailEnabled, sendMail } from "../src/mail/mailer.js"
import { sendProjectNotificationMail } from "../src/mail/notify.js"

const ENV_ON = {
  MAILJET_ENABLED: "true",
  MAILJET_API_KEY: "key",
  MAILJET_API_SECRET: "secret",
  MAILJET_FROM_EMAIL: "noreply@setreo-intern.com",
  MAILJET_FROM_NAME: "Setreo Roadmap",
}
const okFetch = () => vi.fn(async () => ({ ok: true, status: 200, text: async () => "{}" }))

const event = (over = {}) => ({
  typ: "neu", severity: "kritisch",
  beschreibung: "Neuer Fund auf der Strecke",
  finding: { obstacle_id: "o1", titel: "A5 Baustelle", kategorie: "baustelle", km: 21.8, route_name: "Hinfahrt", strassen_ref: "A5" },
  ...over,
})

describe("mailer", () => {
  it("ohne Konfig: deaktiviert + no-op (kein fetch)", async () => {
    expect(mailEnabled({})).toBe(false)
    const fetchImpl = okFetch()
    const r = await sendMail({ recipients: [{ email: "a@x.de" }], subject: "X", text: "y" }, { env: {}, fetchImpl })
    expect(r.skipped).toBe(true)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it("aktiv: eine Message JE Empfänger, Basic-Auth, Absender aus env", async () => {
    const fetchImpl = okFetch()
    const r = await sendMail(
      { recipients: [{ email: "a@x.de" }, { email: "b@x.de", name: "B" }], subject: "Titel", html: "<p>h</p>", text: "t" },
      { env: ENV_ON, fetchImpl },
    )
    expect(r.sent).toBe(2)
    const [url, opts] = fetchImpl.mock.calls[0]
    expect(url).toBe("https://api.mailjet.com/v3.1/send")
    expect(opts.headers.authorization).toBe(`Basic ${Buffer.from("key:secret").toString("base64")}`)
    const body = JSON.parse(opts.body)
    expect(body.Messages).toHaveLength(2)
    expect(body.Messages[0].From).toEqual({ Email: "noreply@setreo-intern.com", Name: "Setreo Roadmap" })
    expect(body.Messages[0].To).toEqual([{ Email: "a@x.de" }])
    expect(body.Messages[1].To).toEqual([{ Email: "b@x.de", Name: "B" }])
  })

  it("leere/ungültige Empfänger → skipped", async () => {
    const fetchImpl = okFetch()
    const r = await sendMail({ recipients: [{ email: "kaputt" }], subject: "X" }, { env: ENV_ON, fetchImpl })
    expect(r.skipped).toBe(true)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it("Mailjet-Fehler wird gemeldet, wirft NICHT", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 401, text: async () => "unauthorized" }))
    const r = await sendMail({ recipients: [{ email: "a@x.de" }], subject: "X", text: "y" }, { env: ENV_ON, fetchImpl })
    expect(r.sent).toBe(0)
    expect(r.error).toContain("401")
  })
})

describe("Projekt-Benachrichtigungsmail", () => {
  const project = { id: "p1", name: "Oberkirch → Karlsruhe", tenantId: "t1" }

  it("Mail deaktiviert → kein DB-Lookup, skipped", async () => {
    const db = { query: vi.fn() }
    const r = await sendProjectNotificationMail({ db, project, events: [event()] }, { env: {} })
    expect(r.skipped).toBe(true)
    expect(db.query).not.toHaveBeenCalled() // kein Empfänger-Lookup wenn Mail aus
  })

  it("aktiv: Empfänger aus DB → Mail mit Projektname + Event im HTML", async () => {
    const db = { query: vi.fn(async () => ({ rows: [{ email: "kunde@firma.de", enabled: true, scope: "alle", severities: ["kritisch", "warnung", "hinweis"] }] })) }
    const fetchImpl = okFetch()
    const r = await sendProjectNotificationMail({ db, project, events: [event()] }, { env: ENV_ON, fetchImpl })
    expect(r.sent).toBe(1)
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body)
    expect(body.Messages[0].To[0].Email).toBe("kunde@firma.de")
    expect(body.Messages[0].Subject).toContain("Oberkirch → Karlsruhe")
    expect(body.Messages[0].HTMLPart).toContain("A5 Baustelle")
  })

  it("keine Empfänger (alle Opt-out) → skipped, kein Versand", async () => {
    const db = { query: vi.fn(async () => ({ rows: [] })) }
    const fetchImpl = okFetch()
    const r = await sendProjectNotificationMail({ db, project, events: [event()] }, { env: ENV_ON, fetchImpl })
    expect(r.skipped).toBe(true)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it("keine Events → skipped", async () => {
    const db = { query: vi.fn() }
    const r = await sendProjectNotificationMail({ db, project, events: [] }, { env: ENV_ON })
    expect(r.skipped).toBe(true)
  })

  it("Präferenz: Scope 'eigene' bei fremdem Projekt → kein Versand", async () => {
    const db = { query: vi.fn(async () => ({ rows: [{ email: "x@x.de", enabled: true, scope: "eigene", severities: ["kritisch"] }] })) }
    const fetchImpl = okFetch()
    const r = await sendProjectNotificationMail(
      { db, project: { ...project, erstelltVon: "andere@x.de" }, events: [event()] },
      { env: ENV_ON, fetchImpl },
    )
    expect(r.skipped).toBe(true)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it("Präferenz: Severity-Filter blendet nicht gewählte Schweregrade aus", async () => {
    const db = { query: vi.fn(async () => ({ rows: [{ email: "x@x.de", enabled: true, scope: "alle", severities: ["kritisch"] }] })) }
    const fetchImpl = okFetch()
    const r = await sendProjectNotificationMail(
      { db, project, events: [event({ severity: "hinweis" })] },
      { env: ENV_ON, fetchImpl },
    )
    expect(r.skipped).toBe(true)
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})
