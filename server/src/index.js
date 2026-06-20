// Bootstrap: .env laden, App bauen, lauschen.

import { loadEnv } from "./env.js"

loadEnv()

// Crash-Netz (T-376/T-305): ein ungefangener Background-Reject darf den einzigen
// API-Container nicht killen. Loggen statt sterben — Defense-in-Depth, kein Ersatz für
// korrektes Wickeln. (Server-Timeouts + SIGTERM-Drain folgen in S4 / T-397/T-389.)
process.on("unhandledRejection", (reason) =>
  console.error(`[api ${new Date().toISOString()}] unhandledRejection (ignoriert):`, reason),
)
process.on("uncaughtException", (err) =>
  console.error(`[api ${new Date().toISOString()}] uncaughtException (ignoriert):`, err),
)

const { createApp } = await import("./app.js")

const port = Number(process.env.PORT ?? 8095)
createApp().listen(port, () => {
  console.log(`roadmap-api listening on :${port}`)
})
