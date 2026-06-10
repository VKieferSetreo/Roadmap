// Mini-.env-Loader — Node lädt .env nicht automatisch (gleiche Lektion wie uvicorn).
// Bewusst ohne dotenv-Dependency; bestehende Umgebungsvariablen gewinnen immer.

import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

export function loadEnv(path = fileURLToPath(new URL("../.env", import.meta.url))) {
  let raw
  try {
    raw = readFileSync(path, "utf8")
  } catch {
    return // keine .env vorhanden — ok (Docker setzt ENV direkt)
  }
  for (const line of raw.split("\n")) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line)
    if (!m || line.trim().startsWith("#")) continue
    const value = m[2].replace(/^["']|["']$/g, "")
    if (process.env[m[1]] === undefined) process.env[m[1]] = value
  }
}
