import React from "react"
import ReactDOM from "react-dom/client"
import { QueryClientProvider } from "@tanstack/react-query"
import { ReactQueryDevtools } from "@tanstack/react-query-devtools"
import { RouterProvider } from "react-router-dom"
import { Toaster } from "sonner"

import { queryClient } from "@/api/query-client"
import { router } from "@/routes"
import { loadPersistedTraceId } from "@/lib/trace"
import { ToastProvider } from "@/components/ui/Toaster"
import "@/styles/globals.css"

loadPersistedTraceId()

const rootEl = document.getElementById("root")
if (!rootEl) {
  throw new Error("Root element #root not found in index.html")
}

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
      <Toaster position="bottom-right" richColors />
      {import.meta.env.DEV ? <ReactQueryDevtools initialIsOpen={false} /> : null}
    </QueryClientProvider>
  </React.StrictMode>,
)
