// App-Shell: Setreo-Header (oben) + [Sidebar | Inhalt] + Setreo-Footer (unten).
// Hält den globalen "Neues Projekt"-Dialog.

import { useState } from "react"
import { Outlet, useNavigate } from "react-router-dom"
import { SetreoHeader } from "./SetreoHeader"
import { SetreoFooter } from "./SetreoFooter"
import { AppSidebar } from "./AppSidebar"
import { NewProjectDialog } from "@/components/project/NewProjectDialog"
import { useProjectStore } from "@/store/projects"
import { useUiStore } from "@/store/ui"

export function AppLayout() {
  const navigate = useNavigate()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const createProject = useProjectStore((s) => s.createProject)
  const { newProjectOpen, closeNewProject } = useUiStore()

  return (
    <div className="flex h-screen flex-col bg-neutral-50">
      <SetreoHeader onMenuClick={() => setMobileNavOpen(true)} />

      <div className="flex min-h-0 flex-1">
        <AppSidebar mobileOpen={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />
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
