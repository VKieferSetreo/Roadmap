// Setreo-Brand: #87b52d (primary-500). Inter + JetBrains Mono.

import type { Config } from "tailwindcss"
import animate from "tailwindcss-animate"

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "#87b52d",
          50: "#F5F9EC",
          100: "#E7F2CD",
          200: "#D2E69C",
          300: "#B3D566",
          400: "#9BC73F",
          500: "#87B52D",
          600: "#6A9221",
          700: "#527121",
          800: "#3F5520",
          900: "#2D3E15",
          950: "#16210A",
        },
        accent: {
          DEFAULT: "#E8B23F",
          100: "#FDF4E0",
          200: "#FAE5B4",
          400: "#E8B23F",
          500: "#C99230",
          700: "#8E6620",
        },
        neutral: {
          0: "#FFFFFF",
          50: "#FAFAFA",
          100: "#F4F4F5",
          200: "#E5E5E8",
          300: "#D4D4D8",
          400: "#A1A1AA",
          500: "#71717A",
          600: "#52525B",
          700: "#3F3F46",
          800: "#27272A",
          900: "#18181B",
          950: "#09090B",
        },
        status: {
          "pending-bg": "#F4F4F5",
          "pending-border": "#A1A1AA",
          "pending-text": "#3F3F46",
          "active-bg": "#F5F9EC",
          "active-border": "#87B52D",
          "active-text": "#3F5520",
          "waiting-bg": "#FFEDD5",
          "waiting-border": "#C2410C",
          "waiting-text": "#7C2D12",
          "done-bg": "#DCFCE7",
          "done-border": "#15803D",
          "done-text": "#14532D",
          "snoozed-bg": "#F3E8FF",
          "snoozed-border": "#7E22CE",
          "snoozed-text": "#581C87",
          "cancelled-bg": "#F4F4F5",
          "cancelled-border": "#71717A",
          "cancelled-text": "#52525B",
        },
        confidence: {
          "high-bg": "#DCFCE7",
          "high-border": "#15803D",
          "high-text": "#14532D",
          "mid-bg": "#FEF9C3",
          "mid-border": "#CA8A04",
          "mid-text": "#713F12",
          "low-bg": "#FEE2E2",
          "low-border": "#B91C1C",
          "low-text": "#7F1D1D",
        },
        // Semantische Severity-Tokens — einzige Quelle für Fund-Schweregrad-Farben.
        // (Hex-Marker für Leaflet-SVG-Pins kommen aus findingMeta.SEVERITY_META.marker.)
        severity: {
          kritisch: {
            DEFAULT: "#DC2626",
            strong: "#B91C1C",
            bg: "#FEF2F2",
            border: "#FECACA",
            text: "#991B1B",
          },
          warnung: {
            DEFAULT: "#EA580C",
            strong: "#C2410C",
            bg: "#FFF7ED",
            border: "#FED7AA",
            text: "#9A3412",
          },
          hinweis: {
            DEFAULT: "#CA8A04",
            strong: "#A16207",
            bg: "#FEFCE8",
            border: "#FDE68A",
            text: "#854D0E",
          },
        },
        frist: {
          "overdue-bg": "#FECACA",
          "overdue-border": "#991B1B",
          "overdue-text": "#7F1D1D",
          "today-bg": "#FEE2E2",
          "today-border": "#B91C1C",
          "today-text": "#7F1D1D",
          "urgent-bg": "#FFEDD5",
          "urgent-border": "#C2410C",
          "urgent-text": "#7C2D12",
          "soon-bg": "#FEF9C3",
          "soon-border": "#CA8A04",
          "soon-text": "#713F12",
          "normal-bg": "#F4F4F5",
          "normal-border": "#71717A",
          "normal-text": "#52525B",
          "distant-bg": "#FAFAFA",
          "distant-border": "#A1A1AA",
          "distant-text": "#71717A",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "monospace"],
      },
      // Elevation-System: card (Ruhe) → card-hover (Interaktion) → overlay (schwebend).
      boxShadow: {
        card: "0 1px 2px 0 rgba(16,24,40,0.04), 0 1px 3px 0 rgba(16,24,40,0.03)",
        "card-hover":
          "0 4px 12px -2px rgba(16,24,40,0.08), 0 2px 6px -2px rgba(16,24,40,0.06)",
        overlay:
          "0 8px 30px -6px rgba(16,24,40,0.18), 0 2px 8px -2px rgba(16,24,40,0.08)",
      },
      keyframes: {
        "optimistic-flash": {
          "0%": { backgroundColor: "rgba(91, 153, 104, 0.3)" },
          "100%": { backgroundColor: "transparent" },
        },
        "slide-in-right": {
          "0%": { transform: "translateX(100%)", opacity: "0" },
          "100%": { transform: "translateX(0)", opacity: "1" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "prov-pulse": {
          "0%, 100%": { backgroundColor: "rgba(250, 229, 180, 0.45)" },
          "50%": { backgroundColor: "rgba(232, 178, 63, 0.65)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        "rise-in": {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "scale-in": {
          "0%": { opacity: "0", transform: "scale(0.96)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        "route-flow": {
          to: { strokeDashoffset: "-26" },
        },
      },
      animation: {
        "optimistic-flash": "optimistic-flash 600ms ease-out",
        "slide-in-right": "slide-in-right 280ms cubic-bezier(0.32, 0.72, 0, 1)",
        "fade-in": "fade-in 200ms ease-out",
        "prov-pulse": "prov-pulse 500ms ease-in-out 3",
        shimmer: "shimmer 1.5s linear infinite",
        "rise-in": "rise-in 320ms cubic-bezier(0.21, 1.02, 0.73, 1) backwards",
        "scale-in": "scale-in 200ms cubic-bezier(0.21, 1.02, 0.73, 1) backwards",
      },
    },
  },
  plugins: [animate],
} satisfies Config
