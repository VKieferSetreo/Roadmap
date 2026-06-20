// Bootstrap: .env laden, App bauen, lauschen.

import { loadEnv } from "./env.js"
import { initSentry } from "./sentry.js"

loadEnv()
initSentry("api") // T-468: GlitchTip-Error-Tracking (no-op ohne SENTRY_DSN), vor createApp

// Crash-Netz (T-376/T-305): ein ungefangener Background-Reject darf den einzigen
// API-Container nicht killen. Loggen statt sterben — Defense-in-Depth, kein Ersatz für
// korrektes Wickeln.
process.on("unhandledRejection", (reason) =>
  console.error(`[api ${new Date().toISOString()}] unhandledRejection (ignoriert):`, reason),
)
process.on("uncaughtException", (err) =>
  console.error(`[api ${new Date().toISOString()}] uncaughtException (ignoriert):`, err),
)

const { createApp } = await import("./app.js")

const port = Number(process.env.PORT ?? 8095)
const server = createApp().listen(port, () => {
  console.log(`roadmap-api listening on :${port}`)
})

// T-397: Server-Timeouts. Ohne diese hängt ein langsamer Upstream-Handler (Mailjet/auth-extern/
// OSRM) bis zum 300s-Node-Default und blockiert Pool-Connections. Reihenfolge-Regel:
// headersTimeout > keepAliveTimeout (sonst spurious 502 hinter dem Proxy). Werte env-übersteuerbar.
server.requestTimeout = Number(process.env.SERVER_REQUEST_TIMEOUT_MS ?? 60000)
server.keepAliveTimeout = Number(process.env.SERVER_KEEPALIVE_TIMEOUT_MS ?? 61000)
server.headersTimeout = Number(process.env.SERVER_HEADERS_TIMEOUT_MS ?? 65000)

// T-389: Graceful Shutdown. Coolify-Redeploy schickt SIGTERM → offene Requests fertig bedienen,
// dann raus. Hartes 30s-Netz, falls ein Request hängt (sonst blockiert der Redeploy).
function shutdown(signal) {
  console.log(`[api ${new Date().toISOString()}] ${signal} empfangen — drain + stop`)
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(0), 30000).unref()
}
process.on("SIGTERM", () => shutdown("SIGTERM"))
process.on("SIGINT", () => shutdown("SIGINT"))
