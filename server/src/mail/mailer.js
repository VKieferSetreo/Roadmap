// Send-only Transactional-Mail über Mailjet (v3.1 Send-API). KEIN Mailserver, kein
// Empfang — nur Versand von Benachrichtigungen.
//
// Konfiguration per ENV (geteilt mit dem Setreo-Mailjet-Account):
//   MAILJET_ENABLED     "true" → Versand aktiv; sonst no-op (nur Log)
//   MAILJET_API_KEY     Mailjet API Key
//   MAILJET_API_SECRET  Mailjet API Secret
//   MAILJET_FROM_EMAIL  verifizierter Absender (z.B. noreply@setreo-intern.com)
//   MAILJET_FROM_NAME   Anzeigename (Default "Setreo Roadmap")
//
// Ohne Konfiguration ist sendMail ein No-op (returnt { skipped: true }) — die App
// läuft normal weiter, es gehen nur keine Mails raus. So bleibt der Sync-/Rerun-Pfad
// robust, falls Mailjet (vorübergehend) nicht erreichbar/konfiguriert ist.

const MAILJET_ENDPOINT = "https://api.mailjet.com/v3.1/send"

export function mailConfig(env = process.env) {
  return {
    enabled: env.MAILJET_ENABLED === "true",
    apiKey: env.MAILJET_API_KEY ?? "",
    apiSecret: env.MAILJET_API_SECRET ?? "",
    fromEmail: env.MAILJET_FROM_EMAIL || "noreply@setreo-intern.com",
    fromName: env.MAILJET_FROM_NAME || "Setreo Roadmap",
  }
}

/** Ist der Mailversand vollständig konfiguriert + aktiviert? */
export function mailEnabled(env = process.env) {
  const c = mailConfig(env)
  return c.enabled && c.apiKey !== "" && c.apiSecret !== ""
}

/**
 * Eine Nachricht an (potenziell mehrere) Empfänger senden — eine Mail je Empfänger
 * (kein gemeinsames To, keine geleakten Adressen). recipients: [{ email, name? }].
 * Liefert { sent, skipped?, error? }. Wirft NICHT — Fehler werden gemeldet, nicht
 * propagiert (eine fehlgeschlagene Mail darf den Sync-Lauf nie kippen).
 */
export async function sendMail(
  { recipients, subject, html, text },
  { env = process.env, fetchImpl = globalThis.fetch, log = () => {} } = {},
) {
  const to = (Array.isArray(recipients) ? recipients : [])
    .filter((r) => r && typeof r.email === "string" && r.email.includes("@"))
  if (to.length === 0) return { sent: 0, skipped: true }
  if (!mailEnabled(env)) {
    log(`mail: nicht aktiv — ${to.length} Mail(s) übersprungen ("${subject}")`)
    return { sent: 0, skipped: true }
  }

  const c = mailConfig(env)
  const auth = Buffer.from(`${c.apiKey}:${c.apiSecret}`).toString("base64")
  const body = {
    Messages: to.map((r) => ({
      From: { Email: c.fromEmail, Name: c.fromName },
      To: [{ Email: r.email, ...(r.name && { Name: r.name }) }],
      Subject: subject,
      ...(text && { TextPart: text }),
      ...(html && { HTMLPart: html }),
    })),
  }

  try {
    const res = await fetchImpl(MAILJET_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Basic ${auth}` },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const detail = await res.text().catch(() => "")
      log(`mail: Mailjet-Fehler ${res.status} ${detail.slice(0, 200)}`)
      return { sent: 0, error: `mailjet ${res.status}` }
    }
    log(`mail: ${to.length} Mail(s) versendet ("${subject}")`)
    return { sent: to.length }
  } catch (err) {
    log(`mail: Versand fehlgeschlagen — ${err?.message ?? err}`)
    return { sent: 0, error: String(err?.message ?? err) }
  }
}
