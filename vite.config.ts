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
    // Dev-Proxy aufs lokale Backend (server/, Port 8095). Läuft kein Server,
    // schlägt nur der Health-Check fehl → App bleibt im Demo-Modus.
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8095",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: false,
    target: "es2022",
  },
}))
