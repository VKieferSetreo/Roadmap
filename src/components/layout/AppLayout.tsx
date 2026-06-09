// App-Shell: Setreo-Header (oben) + [Sidebar | Inhalt] + Setreo-Footer (unten).
// Hält den globalen "Neues Projekt"-Dialog.

import { useEffect, useState } from "react"
import { Outlet, useNavigate } from "react-router-dom"
import { SetreoHeader } from "./SetreoHeader"
import { SetreoFooter } from "./SetreoFooter"
import { AppSidebar } from "./AppSidebar"
import { NewProjectDialog } from "@/components/project/NewProjectDialog"
import { useProjectStore } from "@/store/projects"
import { useUiStore } from "@/store/ui"
import { useAuthStore } from "@/store/auth"

const SIDEBAR_OPEN_KEY = "roadmap.sidebar.open"

export function AppLayout() {
  const navigate = useNavigate()
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
  const { newProjectOpen, closeNewProject } = useUiStore()
  const fetchIdentity = useAuthStore((s) => s.fetchIdentity)

  // Einmal beim Mounten die echte Anmelde-Identität vom Gateway holen (SSO).
  useEffect(() => {
    void fetchIdentity()
  }, [fetchIdentity])

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
          <Outlet />
        </main>
      </div>

      <SetreoFooter />

      <NewProjectDialog
        open={newProjectOpen}
        onClose={closeNewProject}
        onCreate={(name) => {
          const p = createProject(name)
          closeNewProject()
          navigate(`/projekte/${p.id}/anlage`)
        }}
      />
    </div>
  )
}
