import { defineConfig } from "vitest/config"

// fileParallelism: false — Testdateien sequenziell laufen lassen. Mehrere Suiten teilen
// modul-globalen Zustand (z.B. In-Memory-Rate-Limiter, Engine-Caches) und race-ten sonst
// nichtdeterministisch (mal share-, mal analysis-Test rot, isoliert immer grün). Sequenziell
// ist bei ~3-4s Laufzeit vernachlässigbar und macht das Gate verlässlich (Voraussetzung CI, T-345).
export default defineConfig({
  test: {
    fileParallelism: false,
  },
})
