// Projekt-Detail mit 3 Reitern: Anlage · Karte · Dashboard.
// Tab steckt in der URL (/projekte/:id/:tab). Karte rendert vollflächig.
// Projektname ist inline umbenennbar (Stift neben dem Titel).

import { useState } from "react"
import { Navigate, useNavigate, useParams } from "react-router-dom"
import { ClipboardList, MapPinned, Pencil, SlidersHorizontal, type LucideIcon } from "lucide-react"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/Tabs"
import { Input } from "@/components/ui/Input"
import { useProjectStore } from "@/store/projects"
import { AnlageTab } from "@/components/project/AnlageTab"
import { KarteTab } from "@/components/project/KarteTab"
import { DashboardTab } from "@/components/project/DashboardTab"

const TABS: { slug: string; label: string; icon: LucideIcon }[] = [
  { slug: "anlage", label: "Anlage", icon: SlidersHorizontal },
  { slug: "karte", label: "Karte", icon: MapPinned },
  { slug: "dashboard", label: "Dashboard", icon: ClipboardList },
]
const VALID = new Set(TABS.map((t) => t.slug))

export function ProjectDetail() {
  const navigate = useNavigate()
  const { id, tab } = useParams<{ id: string; tab?: string }>()
  const project = useProjectStore((s) => (id ? s.projects.find((p) => p.id === id) : undefined))
  const loading = useProjectStore((s) => s.loading)
  const seeded = useProjectStore((s) => s.seeded)
  const renameProject = useProjectStore((s) => s.renameProject)
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState("")

  // Deep-Link während des Initial-Loads: warten statt nach Home umleiten.
  if (!project && (loading || !seeded)) {
    return (
      <div className="flex h-full flex-col gap-4 px-4 py-6 lg:px-6">
        <div className="skeleton h-7 w-72 rounded" />
        <div className="skeleton h-9 w-96 rounded" />
        <div className="skeleton h-64 w-full rounded-xl" />
      </div>
    )
  }
  if (!project) return <Navigate to="/" replace />
  if (!tab || !VALID.has(tab)) return <Navigate to={`/projekte/${project.id}/anlage`} replace />

  const commitRename = () => {
    const n = nameDraft.trim()
    setEditingName(false)
    if (n && n !== project.name) renameProject(project.id, n)
  }

  return (
    <div className="flex h-full flex-col">
      {/* Kopfleiste */}
      <div className="shrink-0 border-b border-neutral-200 bg-white px-4 pt-4 lg:px-6">
        <div className="flex items-center gap-2">
          {editingName ? (
            <Input
              autoFocus
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitRename()
                if (e.key === "Escape") setEditingName(false)
              }}
              maxLength={80}
              aria-label="Projektname"
              className="h-9 max-w-md text-lg font-bold tracking-tight"
            />
          ) : (
            <>
              <h1 className="truncate text-lg font-bold tracking-tight text-neutral-900">
                {project.name}
              </h1>
              <button
                type="button"
                onClick={() => {
                  setNameDraft(project.name)
                  setEditingName(true)
                }}
                aria-label="Projekt umbenennen"
                title="Projekt umbenennen"
                className="cursor-pointer rounded-md p-1.5 text-neutral-300 transition-colors hover:bg-neutral-100 hover:text-neutral-600"
              >
                <Pencil className="h-4 w-4" />
              </button>
            </>
          )}
        </div>
        <Tabs
          value={tab}
          onValueChange={(v) => navigate(`/projekte/${project.id}/${v}`)}
          className="mt-3"
        >
          <TabsList>
            {TABS.map((t) => (
              <TabsTrigger key={t.slug} value={t.slug}>
                <t.icon className="h-4 w-4" />
                {t.label}
                {t.slug === "dashboard" && project.findings.length > 0 ? (
                  <span className="ml-0.5 rounded-full bg-neutral-100 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-neutral-600">
                    {project.findings.length}
                  </span>
                ) : null}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {/* Reiter-Inhalt */}
      <div className="min-h-0 flex-1">
        {tab === "karte" ? (
          <KarteTab project={project} />
        ) : (
          <div className="h-full overflow-y-auto px-4 py-6 lg:px-6">
            {tab === "anlage" ? (
              <AnlageTab project={project} />
            ) : (
              <DashboardTab project={project} />
            )}
          </div>
        )}
      </div>
    </div>
  )
}
