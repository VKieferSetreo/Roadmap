// Testlauf des FRONTENDS. Eigene Datei und nicht der test-Block in vite.config.ts, weil die
// beiden Suiten in diesem Projekt getrennt leben:
//
//   server/  — eigenes package.json, eigenes `npm test`, Umgebung node. Das ist der Lauf, den die
//              CI seit T-345 fährt (Job "Backend (vitest)", working-directory: server).
//   src/     — dieser Lauf hier, Umgebung jsdom, weil React-Komponenten ein DOM brauchen.
//
// WARUM DAS ÜBERHAUPT NÖTIG WAR (T-733): bis zum 06.09.2026 gab es unter src/ keinen einzigen
// Test. Alle 69 Testdateien lagen unter server/test/, und die CI prüfte das Frontend nur mit
// lint + tsc + build. Die 925 grünen Tests belegten für die gesamte Oberfläche nichts — genau die
// Oberfläche, in der der Kunde steht. Aufgefallen ist das, als eine adversarische Prüfung an
// mehreren UI-Fixes Fehler fand, die kein Test bemerkt hätte.
//
// Die Version ist bewusst dieselbe wie im Backend (^2.1.8): ein `npx vitest` ohne Eintrag in
// package.json holte zuletzt vitest 5, während die CI mit 2.1.8 lief. Zwei Versionen für dieselbe
// Suite erklären Testergebnisse, die sich lokal und in der CI unterscheiden.
import { defineConfig } from "vitest/config"
import react from "@vitejs/plugin-react-swc"
import path from "node:path"

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    // NUR src/. Ohne diese Grenze zöge der Lauf server/test/ mit hinein — dieselben Dateien
    // liefen dann zweimal, hier zusätzlich in einer jsdom-Umgebung, für die sie nie gedacht waren.
    include: ["src/**/*.test.{ts,tsx}"],
    restoreMocks: true,
  },
})
