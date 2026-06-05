import { defineConfig } from "vite"
import react from "@vitejs/plugin-react-swc"
import path from "node:path"

// Dev läuft auf Root (/), der Production-Build wird unter /roadmap/ ausgeliefert
// (setreo-intern-hub serviert roadmap/ mit strip-prefix /roadmap).
export default defineConfig(({ command }) => ({
  base: command === "build" ? "/roadmap/" : "/",
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
  },
  build: {
    outDir: "dist",
    sourcemap: false,
    target: "es2022",
  },
}))
