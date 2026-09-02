// Der Nachtlauf meldet sich, wenn etwas schiefging (T-662).
//
// AUFRUF:
//   docker run --rm --network setreo-net -e DATABASE_URL="…" \
//     -e MAILJET_ENABLED=… -e MAILJET_API_KEY=… -e MAILJET_API_SECRET=… \
//     -e MAILJET_FROM_EMAIL=… -e ROADMAP_ADMIN_EMAILS=… <app-image> \
//     node scripts/nachtlaufMelden.mjs "<Betreff>" "<Text>"
//
// Max, 02.09.2026: "Fallbacks — KEINE KI-Augmentation dann, wenn's nicht geht, und aufheben
// für nächste Runde, mit Mail beispielsweise."
//
// WARUM ES DAS BRAUCHT: der Nachtlauf ist der einzige Teil dieses Systems, dem niemand zusieht.
// Faellt er aus, faellt nichts um — die Punkte behalten schlicht keine Fertig-Marke und kommen in
// der naechsten Nacht erneut dran. Genau das ist die Gefahr: es funktioniert wochenlang scheinbar,
// und niemand merkt, dass seit dem ersten Ausfall nichts mehr angereichert wurde. Am 02.09.2026 war
// es fast so weit — der Docker-Daemon startete nach dem Wecken nie, und ohne diesen Testlauf haette
// das im Logfile auf der VM gestanden, wo es keiner liest.
//
// NUR BEI PROBLEMEN, nie im Normalfall. Eine Mail, die jede Nacht kommt, liest nach einer Woche
// niemand mehr — und dann ist sie schlechter als keine.
//
// EMPFAENGER ist ROADMAP_ADMIN_EMAILS, dieselbe Liste, die auch die Admin-Rechte steuert
// (auth.js). Wer das System verwaltet, hoert auch, wenn es klemmt.

import { sendMail } from "../src/mail/mailer.js"

const [betreff, text] = process.argv.slice(2)
if (!betreff) {
  console.error("Aufruf: node scripts/nachtlaufMelden.mjs \"<Betreff>\" \"<Text>\"")
  process.exit(2)
}

const empfaenger = String(process.env.ROADMAP_ADMIN_EMAILS ?? "")
  .split(",").map((e) => e.trim()).filter((e) => e.includes("@"))
  .map((email) => ({ email }))

if (!empfaenger.length) {
  // Kein Grund zum Scheitern: der Nachtlauf ruft das hier im Aufraeumen auf, und ein fehlender
  // Verteiler darf ihn nicht daran hindern, die Workstation auszuschalten.
  console.log("ROADMAP_ADMIN_EMAILS ist leer — keine Meldung verschickt.")
  process.exit(0)
}

const html = `<p>${escape(text ?? "")
  .replace(/\n/g, "<br>")}</p><p style="color:#666;font-size:12px">Automatische Meldung des
  naechtlichen Anreicherungslaufs. Log auf der VM: <code>~/roadmap-nachtlauf.log</code></p>`

const ergebnis = await sendMail(
  { recipients: empfaenger, subject: betreff, text: text ?? betreff, html },
  { log: (m) => console.log(m) },
)
console.log(JSON.stringify(ergebnis))
process.exit(0)

/** Minimaler HTML-Schutz: der Text kommt aus Logzeilen, nicht aus Nutzereingaben, aber ein
 *  Dateiname mit spitzer Klammer soll die Mail trotzdem nicht zerlegen. */
function escape(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}
