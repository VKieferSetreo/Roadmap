import { describe, it, expect } from "vitest"
import { rowToMessage } from "../src/routes/findingChat.js"

// T-301#9: der public-Chat ist DB-weit geteilt (GET filtert public nicht auf den Tenant). Die
// persönliche Autor-Mail FREMDER public-Nachrichten darf nicht an andere Mandanten geleakt werden.
describe("findingChat rowToMessage — PII-Masking (T-301#9)", () => {
  const base = {
    id: "1", finding_key: "k", body: "hallo",
    created_at: "2026-06-23T08:00:00.000Z", organisation: "Acme GmbH",
  }

  it("public + fremde Nachricht → authorEmail maskiert, Organisation bleibt", () => {
    const m = rowToMessage({ ...base, scope: "public", author_email: "fremd@x.de" }, "ich@y.de")
    expect(m.authorEmail).toBeNull()
    expect(m.organisation).toBe("Acme GmbH")
    expect(m.mine).toBe(false)
  })

  it("public + eigene Nachricht → authorEmail bleibt", () => {
    const m = rowToMessage({ ...base, scope: "public", author_email: "ich@y.de" }, "ich@y.de")
    expect(m.authorEmail).toBe("ich@y.de")
    expect(m.mine).toBe(true)
  })

  it("internal → authorEmail bleibt (bereits tenant-gefiltert), organisation null", () => {
    const m = rowToMessage({ ...base, scope: "internal", author_email: "fremd@x.de" }, "ich@y.de")
    expect(m.authorEmail).toBe("fremd@x.de")
    expect(m.organisation).toBeNull()
  })
})
