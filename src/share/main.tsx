import React from "react"
import ReactDOM from "react-dom/client"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ErrorBoundary } from "@/components/shared/ErrorBoundary"
import { ShareApp } from "./ShareApp"
import "@/fonts.css" // T-413: self-hosted Fonts auch im externen Share-Viewer (kein Google-IP-Leak für Empfänger)
import "@/styles/globals.css"

const rootEl = document.getElementById("root")
if (!rootEl) {
  throw new Error("Root element #root not found in share.html")
}

// Der Share-Viewer rendert KarteTab/DashboardTab wieder — deren Fund-Marker rufen react-query-Hooks
// (Chat-Presence) auf, die einen QueryClient im Kontext brauchen, AUCH wenn sie via canChat=false nie
// fetchen. Ohne Provider crasht der externe Viewer mit "No QueryClient set". Eigener, isolierter Client.
const queryClient = new QueryClient()

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary>
        <ShareApp />
      </ErrorBoundary>
    </QueryClientProvider>
  </React.StrictMode>,
)
