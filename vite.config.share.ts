import { defineConfig } from "vite"
import react from "@vitejs/plugin-react-swc"
import path from "node:path"

// Share-Viewer (externe Empfänger): eigener Mini-Entry, wird vom roadmap-api unter
// setreo-cloud.com/<tenant>/<projekt> ausgeliefert; Assets liegen unter /_share/.
// Build: npm run vendor:share → server/public/share/ (committed, Teil des API-Images).
export default defineConfig({
  base: "/_share/",
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    outDir: "dist-share",
    sourcemap: false,
    target: "es2022",
    rollupOptions: {
      input: path.resolve(__dirname, "share.html"),
    },
  },
})
