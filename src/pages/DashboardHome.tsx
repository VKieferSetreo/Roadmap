// Home / Dashboard — Begrüßung + Projekt-Grid + Anlegen.

import { useEffect } from "react"
import { FolderPlus, Plus } from "lucide-react"
import { useProjectStore } from "@/store/projects"
import { useUiStore } from "@/store/ui"
import { ProjectCard } from "@/components/project/ProjectCard"
import { EmptyState } from "@/components/shared/EmptyState"
import { Button } from "@/components/ui/Button"

export function DashboardHome() {
  const projects = useProjectStore((s) => s.projects)
  const seedIfEmpty = useProjectStore((s) => s.seedIfEmpty)
  const openNewProject = useUiStore((s) => s.openNewProject)

  useEffect(() => {
    seedIfEmpty()
  }, [seedIfEmpty])

  const sorted = [...projects].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-6xl px-4 py-8 lg:px-6">
        {/* Hero */}
        <div className="relative overflow-hidden rounded-xl border border-primary-100 bg-gradient-to-br from-primary-50 to-white p-6 sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary-600">
            Setreo Roadmap
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-neutral-900 sm:text-3xl">
            Routenanalyse für Schwertransporte
          </h1>
          <p className="mt-2 max-w-xl text-sm text-neutral-600">
            Strecke festlegen, Transport-Stammdaten erfassen, Auswertung fahren — alle Hindernisse
            entlang der Route auf einen Blick.
          </p>
        </div>

        {/* Projekt-Sektion */}
        <div className="mt-8 flex items-end justify-between">
          <div>
            <h2 className="text-lg font-semibold text-neutral-900">Ihre Projekte</h2>
            <p className="text-sm text-neutral-500">
              {projects.length} {projects.length === 1 ? "Projekt" : "Projekte"}
            </p>
          </div>
          <Button variant="outline" onClick={openNewProject}>
            <Plus className="h-4 w-4" /> Projekt hinzufügen
          </Button>
        </div>

        {sorted.length === 0 ? (
          <div className="mt-6">
            <EmptyState
              icon={FolderPlus}
              title="Los geht's — Ihr erstes Projekt"
              description="Legen Sie ein Projekt an, um eine Strecke zu analysieren."
              cta={<Button onClick={openNewProject}>Neues Projekt anlegen</Button>}
            />
          </div>
        ) : (
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {sorted.map((p) => (
              <ProjectCard key={p.id} project={p} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
