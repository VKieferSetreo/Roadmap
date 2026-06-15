// App-Shell: Setreo-Header (oben) + [Sidebar | Inhalt] + Setreo-Footer (unten).
// Hält den globalen "Neues Projekt"-Dialog.

import { useEffect, useState } from "react"
import { Outlet, useLocation, useNavigate } from "react-router-dom"
import { SetreoHeader } from "./SetreoHeader"
import { SetreoFooter } from "./SetreoFooter"
import { AppSidebar } from "./AppSidebar"
import { ContentErrorBoundary } from "./ContentErrorBoundary"
import { NewProjectDialog } from "@/components/project/NewProjectDialog"
import { useProjectStore } from "@/store/projects"
import { useUiStore } from "@/store/ui"
import { useAuthStore } from "@/store/auth"
import { useDataSourceStore } from "@/store/datasource"
import { useContextStore } from "@/store/context"
import { Building2 } from "lucide-react"

const SIDEBAR_OPEN_KEY = "roadmap.sidebar.open"

export function AppLayout() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  // Desktop-Sidebar: nativ offen (Kollision-Format), einklappbar; Wahl persistiert.
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    try {
      const v = localStorage.getItem(SIDEBAR_OPEN_KEY)
      return v === null ? true : v === "true"
    } catch {
      return true
    }
  })
  const toggleSidebar = () =>
    setSidebarOpen((o) => {
      const next = !o
      try {
        localStorage.setItem(SIDEBAR_OPEN_KEY, String(next))
      } catch {
        /* ignore */
      }
      return next
    })
  const createProject = useProjectStore((s) => s.createProject)
  const initData = useProjectStore((s) => s.initData)
  const { newProjectOpen, closeNewProject } = useUiStore()
  const fetchIdentity = useAuthStore((s) => s.fetchIdentity)
  const detect = useDataSourceStore((s) => s.detect)
  const mode = useDataSourceStore((s) => s.mode)
  const loadContext = useContextStore((s) => s.load)
  const ctxLoaded = useContextStore((s) => s.loaded)
  const isAdmin = useContextStore((s) => s.isAdmin)
  const tenant = useContextStore((s) => s.tenant)

  // Boot: SSO-Identität holen + Datenquelle erkennen (Backend live vs. Demo-Modus).
  // Live: erst Nutzer-/Mandanten-Kontext (setzt X-Tenant für Admins), dann Projekte.
  useEffect(() => {
    void fetchIdentity()
    void detect().then(async (m) => {
      if (m === "live") await loadContext()
      await initData(m)
    })
  }, [fetchIdentity, detect, initData, loadContext])

  // Live + eingeloggt, aber keinem Mandanten zugeordnet → Arbeit nicht möglich.
  const keinMandant = mode === "live" && ctxLoaded && !isAdmin && !tenant

  return (
    <div className="flex h-screen flex-col bg-neutral-50">
      <SetreoHeader onMenuClick={() => setMobileNavOpen(true)} />

      <div className="flex min-h-0 flex-1">
        <AppSidebar
          open={sidebarOpen}
          onToggle={toggleSidebar}
          mobileOpen={mobileNavOpen}
          onClose={() => setMobileNavOpen(false)}
        />
        <main className="min-h-0 min-w-0 flex-1 overflow-hidden">
          {/* Fehler in einer Seite kapseln → Header + Sidebar (alle Reiter + Dropdown)
              bleiben IMMER stehen; Reset bei Routen-/Mandantenwechsel. */}
          <ContentErrorBoundary resetKey={`${pathname}|${tenant?.id ?? ""}`}>
            {keinMandant ? (
              <div className="flex h-full items-center justify-center px-4">
                <div className="max-w-md rounded-xl border border-neutral-200 bg-white p-8 text-center shadow-card">
                  <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-accent-100">
                    <Building2 className="h-6 w-6 text-accent-700" />
                  </div>
                  <h1 className="text-lg font-bold text-neutral-900">Kein Mandant zugeordnet</h1>
                  <p className="mt-2 text-sm text-neutral-500">
                    Dein Konto ist noch keinem Mandanten zugewiesen. Bitte wende dich an Setreo —
                    sobald die Zuordnung steht, erscheinen hier die Projekte deines Teams.
                  </p>
                </div>
              </div>
            ) : (
              <Outlet />
            )}
          </ContentErrorBoundary>
        </main>
      </div>

      <SetreoFooter />

      <NewProjectDialog
        open={newProjectOpen}
        onClose={closeNewProject}
        onCreate={(name) => {
          void createProject(name).then((p) => {
            closeNewProject()
            navigate(`/projekte/${p.id}/route`)
          })
        }}
      />
    </div>
  )
}
