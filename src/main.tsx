import React from "react"
import ReactDOM from "react-dom/client"
import * as Sentry from "@sentry/react"
import { QueryClientProvider } from "@tanstack/react-query"
import { ReactQueryDevtools } from "@tanstack/react-query-devtools"
import { RouterProvider } from "react-router-dom"
import { Toaster } from "sonner"

import { queryClient } from "@/api/query-client"
import { router } from "@/routes"
import { loadPersistedTraceId } from "@/lib/trace"
import { ErrorBoundary } from "@/components/shared/ErrorBoundary"
import "@/styles/globals.css"

// T-468: GlitchTip-Error-Tracking (Sentry-kompatibel). No-op ohne VITE_SENTRY_DSN (Build ohne env).
if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0, // nur Fehler
  })
}

loadPersistedTraceId()

const rootEl = document.getElementById("root")
if (!rootEl) {
  throw new Error("Root element #root not found in index.html")
}

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
        <Toaster position="bottom-right" richColors closeButton duration={5000} />
        {import.meta.env.DEV ? <ReactQueryDevtools initialIsOpen={false} /> : null}
      </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>,
)
