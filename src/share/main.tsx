import React from "react"
import ReactDOM from "react-dom/client"
import { ErrorBoundary } from "@/components/shared/ErrorBoundary"
import { ShareApp } from "./ShareApp"
import "@/styles/globals.css"

const rootEl = document.getElementById("root")
if (!rootEl) {
  throw new Error("Root element #root not found in share.html")
}

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ShareApp />
    </ErrorBoundary>
  </React.StrictMode>,
)
