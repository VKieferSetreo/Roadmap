// Projekt-Detail mit 3 Reitern: Eingabe (Strecke + Stammdaten) · Karte · Dashboard.
// Tab steckt in der URL (/projekte/:id/:tab). Karte rendert vollflächig.
// Umbenennen/Archiv/Löschen läuft über das ⋮-Menü der Projekt-Übersicht.

import { useState } from "react"
import { Navigate, useNavigate, useParams } from "react-router-dom"
import { ClipboardList, Download, FileDown, FileSpreadsheet, MapPin, MapPinned, type LucideIcon } from "lucide-react"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/Tabs"
import { DropdownMenu, DropdownItem } from "@/components/ui/DropdownMenu"
import { useProjectStore } from "@/store/projects"
import { RouteTab } from "@/components/project/RouteTab"
import { AnlageTab } from "@/components/project/AnlageTab"
import { KarteTab } from "@/components/project/KarteTab"
import { DashboardTab } from "@/components/project/DashboardTab"

const TABS: { slug: string; label: string; icon: LucideIcon }[] = [
  { slug: "route", label: "Eingabe", icon: MapPin },
  { slug: "karte", label: "Karte", icon: MapPinned },
  { slug: "dashboard", label: "Dashboard", icon: ClipboardList },
]
const VALID = new Set(TABS.map((t) => t.slug))

export function ProjectDetail() {
  const navigate = useNavigate()
  const { id, tab } = useParams<{ id: string; tab?: string }>()
  const project = useProjectStore((s) => (id ? (s.projects ?? []).find((p) => p.id === id) : undefined))
  const loading = useProjectStore((s) => s.loading)
  const seeded = useProjectStore((s) => s.seeded)
  // Export-Anstoß aus dem Header → DashboardTab öffnet damit den Export-Dialog.
  const [exportReq, setExportReq] = useState<"pdf" | "csv" | null>(null)

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
  if (!tab || !VALID.has(tab)) return <Navigate to={`/projekte/${project.id}/route`} replace />

  return (
    <div className="flex h-full flex-col">
      {/* Kopfleiste */}
      <div className="shrink-0 border-b border-neutral-200 bg-white px-4 pt-4 lg:px-6">
        <div className="flex items-center justify-between gap-3">
          <h1 className="truncate text-lg font-bold tracking-tight text-neutral-900">
            {project.name}
          </h1>
          {/* Download (nur im Dashboard, nach der Auswertung): PDF oder CSV → Export-Dialog. */}
          {tab === "dashboard" && project.status === "fertig" ? (
            <DropdownMenu
              triggerLabel="Herunterladen — PDF oder CSV"
              trigger={
                <span
                  title="Herunterladen"
                  className="inline-flex h-9 shrink-0 cursor-pointer items-center gap-2 rounded-md border border-neutral-200 bg-white px-3 text-sm font-medium text-neutral-700 shadow-sm transition-colors hover:bg-neutral-50 hover:text-neutral-900"
                >
                  <Download className="h-5 w-5" /> Download
                </span>
              }
            >
              <DropdownItem onClick={() => setExportReq("pdf")}>
                <FileDown className="h-4 w-4 text-neutral-400" /> PDF-Bericht
              </DropdownItem>
              <DropdownItem onClick={() => setExportReq("csv")}>
                <FileSpreadsheet className="h-4 w-4 text-emerald-600" /> Excel (CSV)
              </DropdownItem>
            </DropdownMenu>
          ) : null}
        </div>
        <Tabs
          value={tab}
          onValueChange={(v) => navigate(`/projekte/${project.id}/${v}`)}
          className="mt-2"
        >
          <TabsList>
            {TABS.map((t) => (
              <TabsTrigger key={t.slug} value={t.slug}>
                <t.icon className="h-4 w-4" />
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {/* Reiter-Inhalt */}
      <div className="min-h-0 flex-1">
        {tab === "karte" ? (
          <KarteTab project={project} canHide />
        ) : (
          <div className="h-full overflow-y-auto px-4 py-6 lg:px-6">
            {tab === "route" ? (
              // Eingabe: Streckenanlage + Transport-Stammdaten/Zeitraum/Veröffentlichung auf einer Seite.
              <div className="flex flex-col gap-5">
                <RouteTab project={project} />
                <AnlageTab project={project} />
              </div>
            ) : (
              <DashboardTab
                project={project}
                exportRequest={exportReq}
                onExportConsumed={() => setExportReq(null)}
              />
            )}
          </div>
        )}
      </div>
    </div>
  )
}
