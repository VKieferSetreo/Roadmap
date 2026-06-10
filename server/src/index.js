// Bootstrap: .env laden, App bauen, lauschen.

import { loadEnv } from "./env.js"

loadEnv()

const { createApp } = await import("./app.js")

const port = Number(process.env.PORT ?? 8095)
createApp().listen(port, () => {
  console.log(`roadmap-api listening on :${port}`)
})
