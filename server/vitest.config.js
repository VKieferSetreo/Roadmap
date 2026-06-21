import { defineConfig } from "vitest/config"

// fileParallelism: false — Testdateien sequenziell laufen lassen. Mehrere Suiten teilen
// modul-globalen Zustand (z.B. In-Memory-Rate-Limiter, Engine-Caches) und race-ten sonst
// nichtdeterministisch (mal share-, mal analysis-Test rot, isoliert immer grün). Sequenziell
// ist bei ~3-4s Laufzeit vernachlässigbar und macht das Gate verlässlich (Voraussetzung CI, T-345).
export default defineConfig({
  test: {
    fileParallelism: false,
    // T-500: einige Tests fahren eine echte Analyse über lange Strecken (Hamburg→München) — die
    // dauert unter Last gelegentlich >5s und kippte dann mit dem 5s-Default-Timeout (mal dieser,
    // mal jener Test rot, isoliert immer grün). Großzügiges Timeout macht das Gate verlässlich.
    testTimeout: 20000,
  },
  // Server-Tests verarbeiten kein CSS. Inline-leeres PostCSS verhindert, dass Vite die Root-
  // postcss.config.js (tailwindcss) hochsucht — die ist im isolierten server/-CI-Job (npm ci nur
  // in server/) nicht installiert und ließ `npm test` dort scheitern (T-345). Lokal war es grün,
  // weil die Root-node_modules tailwindcss enthalten.
  css: { postcss: { plugins: [] } },
})
