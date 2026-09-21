// Einstiegspunkt der oeffentlichen Freigabe-Ansicht. Haelt nur die Montage;
// die Ansicht selbst steht in FreigabeAnsicht.tsx.

import React from "react"
import ReactDOM from "react-dom/client"

import { FreigabeAnsicht } from "./FreigabeAnsicht"
import { ErrorBoundary } from "@/components/shared/ErrorBoundary"
import "@/fonts.css"
import "@/styles/globals.css"

const rootEl = document.getElementById("root")
if (!rootEl) throw new Error("Root element #root not found in freigabe.html")

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <ErrorBoundary>
      <FreigabeAnsicht />
    </ErrorBoundary>
  </React.StrictMode>,
)
