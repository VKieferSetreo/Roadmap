// Home — Hero + Projekt-Explorer mit Ordnerstruktur (wie ein Datei-Explorer):
// Breadcrumb oben (Projekte / Ordner / Unterordner …), in einen Ordner klicken öffnet ihn,
// „+ Neu" legt Ordner ODER Projekt im AKTUELLEN Ordner an, Projekte per Drag-n-Drop in Ordner.
// Der aktuelle Ordner steht im URL-Query (?ordner=<id>) → Back-Button & Reload bleiben konsistent.
// Seed/Initial-Load passiert zentral im AppLayout (Datasource-Detection).

import { useState } from "react"
import { useSearchParams } from "react-router-dom"
import {
  Archive, ChevronDown, ChevronRight, FilePlus2, Folder, FolderPlus, LayoutGrid,
  List, Pencil, Plus, RefreshCcw, Search, Trash2, WifiOff, X,
} from "lucide-react"
import { useProjectStore } from "@/store/projects"
import { useFolderStore } from "@/store/folders"
import { useUiStore } from "@/store/ui"
import { useSettingsStore, type ProjektAnsicht } from "@/store/settings"
import { ProjectCard, ProjectListRow } from "@/components/project/ProjectCard"
import { EmptyState } from "@/components/shared/EmptyState"
import { Card } from "@/components/ui/Card"
import { Button } from "@/components/ui/Button"
import { DropdownMenu, DropdownItem } from "@/components/ui/DropdownMenu"
import { cn } from "@/lib/cn"

export function DashboardHome() {
  const projects = useProjectStore((s) => s.projects ?? [])
  const loading = useProjectStore((s) => s.loading)
  const loadError = useProjectStore((s) => s.loadError) // T-228
  const loadProjects = useProjectStore((s) => s.loadProjects)
  const setProjectFolder = useProjectStore((s) => s.setProjectFolder)
  const openNewProject = useUiStore((s) => s.openNewProject)
  const folders = useFolderStore((s) => s.folders)
  const createFolder = useFolderStore((s) => s.createFolder)
  const renameFolder = useFolderStore((s) => s.renameFolder)
  const removeFolder = useFolderStore((s) => s.removeFolder)
  const ansicht = useSettingsStore((s) => s.projektAnsicht)
  const setAnsicht = useSettingsStore((s) => s.setProjektAnsicht)

  // Aktueller Ordner im URL-Query (?ordner=<id>); stale/gelöscht → Wurzel.
  const [params, setParams] = useSearchParams()
  const rawFolderId = params.get("ordner")
  const currentFolderId = rawFolderId && folders.some((f) => f.id === rawFolderId) ? rawFolderId : null
  const goFolder = (id: string | null) => setParams(id ? { ordner: id } : {})

  const [archivOffen, setArchivOffen] = useState(false)
  const [suche, setSuche] = useState("")
  const [creatingFolder, setCreatingFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState("")
  const [renamingFolder, setRenamingFolder] = useState<string | null>(null)
  const [renameVal, setRenameVal] = useState("")
  const [draggingProject, setDraggingProject] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)

  const aktive = projects.filter((p) => !p.archiviertAm)
  const archivierte = projects.filter((p) => Boolean(p.archiviertAm))

  // Breadcrumb-Pfad (Wurzel → aktueller Ordner).
  const pfad: { id: string; name: string }[] = []
  for (let cur = currentFolderId; cur; ) {
    const f = folders.find((x) => x.id === cur)
    if (!f) break
    pfad.unshift({ id: f.id, name: f.name })
    cur = f.parentId
  }

  // Inhalt der aktuellen Ebene.
  const subfolders = folders
    .filter((f) => (f.parentId ?? null) === currentFolderId)
    .sort((a, b) => a.name.localeCompare(b.name, "de"))
  const folderProjects = aktive
    .filter((p) => (p.folderId ?? null) === currentFolderId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))

  // Rekursive Projektzahl in einem Ordner (für das Badge).
  const countIn = (folderId: string): number =>
    aktive.filter((p) => (p.folderId ?? null) === folderId).length +
    folders.filter((f) => f.parentId === folderId).reduce((n, s) => n + countIn(s.id), 0)

  // Suche: flache Trefferliste über ALLE Projekte (ignoriert Ordner). Erst ab vielen Projekten.
  const zeigeSuche = aktive.length > 6
  const q = suche.trim().toLowerCase()
  const searching = zeigeSuche && q.length > 0
  const treffer = searching
    ? aktive
        .filter((p) =>
          [p.name, p.erstelltVon, (p as { beschreibung?: string }).beschreibung].some((f) =>
            String(f ?? "").toLowerCase().includes(q),
          ),
        )
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    : []

  const commitNewFolder = async () => {
    const name = newFolderName.trim()
    setCreatingFolder(false)
    setNewFolderName("")
    if (name) await createFolder(name, currentFolderId)
  }
  const startCreateFolder = () => {
    setRenamingFolder(null)
    setNewFolderName("")
    setCreatingFolder(true)
  }
  const commitRename = (id: string) => {
    if (renameVal.trim()) renameFolder(id, renameVal)
    setRenamingFolder(null)
  }
  const dropProjectInto = (folderId: string | null) => {
    if (draggingProject) setProjectFolder(draggingProject, folderId)
    setDraggingProject(null)
    setDropTarget(null)
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-6xl px-4 py-8 lg:px-6">
        {/* Hero */}
        <div className="relative overflow-hidden rounded-2xl border border-primary-100 bg-gradient-to-br from-primary-50 via-white to-white p-6 shadow-card sm:p-8">
          <svg
            aria-hidden
            viewBox="0 0 320 180"
            className="pointer-events-none absolute -right-6 top-0 hidden h-full w-72 text-primary-200/70 md:block"
            fill="none"
          >
            <path d="M18 168 C 80 120, 60 76, 140 70 S 270 40, 306 8" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeDasharray="1 10" />
            <path d="M30 160 C 92 116, 76 84, 152 78 S 262 50, 298 22" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.5" />
            <circle cx="18" cy="168" r="6" fill="#87B52D" stroke="#fff" strokeWidth="2.5" />
            <circle cx="306" cy="8" r="6" fill="#2563EB" stroke="#fff" strokeWidth="2.5" />
            <circle cx="306" cy="8" r="2" fill="#fff" />
            <circle cx="140" cy="70" r="4.5" fill="#7C3AED" stroke="#fff" strokeWidth="2" />
          </svg>
          <div className="relative">
            <p className="text-xs font-semibold uppercase tracking-wider text-primary-600">Setreo Roadmap</p>
            <h1 className="mt-1.5 text-2xl font-bold tracking-tight text-neutral-900 sm:text-[1.7rem]">
              Routenanalyse für Schwertransporte
            </h1>
            <p className="mt-2 max-w-xl text-sm text-neutral-600">
              Strecke hochladen, Transport-Stammdaten erfassen, Auswertung starten.
              <br />
              Alle Hindernisse entlang der Route auf einen Blick.
            </p>
          </div>
        </div>

        {/* Kopfzeile: Breadcrumb + Ansicht + „Neu"-Menü */}
        <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
          <nav aria-label="Ordnerpfad" className="flex min-w-0 flex-wrap items-center gap-1 text-sm">
            <button
              onClick={() => goFolder(null)}
              onDragOver={(e) => { if (draggingProject) { e.preventDefault(); setDropTarget("__root__") } }}
              onDragLeave={() => setDropTarget((t) => (t === "__root__" ? null : t))}
              onDrop={(e) => { e.preventDefault(); dropProjectInto(null) }}
              className={cn(
                "rounded px-1.5 py-1 font-semibold transition-colors",
                currentFolderId == null ? "text-neutral-900" : "text-neutral-500 hover:text-primary-700",
                dropTarget === "__root__" && "bg-primary-100 ring-1 ring-primary-300",
              )}
            >
              Projekte
            </button>
            {pfad.map((f, i) => {
              const last = i === pfad.length - 1
              return (
                <span key={f.id} className="flex items-center gap-1">
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-neutral-300" />
                  <button
                    onClick={() => goFolder(f.id)}
                    onDragOver={(e) => { if (draggingProject) { e.preventDefault(); setDropTarget(`bc:${f.id}`) } }}
                    onDragLeave={() => setDropTarget((t) => (t === `bc:${f.id}` ? null : t))}
                    onDrop={(e) => { e.preventDefault(); dropProjectInto(f.id) }}
                    className={cn(
                      "truncate rounded px-1.5 py-1 transition-colors",
                      last ? "font-semibold text-neutral-900" : "text-neutral-500 hover:text-primary-700",
                      dropTarget === `bc:${f.id}` && "bg-primary-100 ring-1 ring-primary-300",
                    )}
                  >
                    {f.name}
                  </button>
                </span>
              )
            })}
          </nav>

          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-md border border-neutral-200 bg-neutral-50 p-1" role="group" aria-label="Ansicht wählen">
              {([
                { id: "karten", label: "Karten", icon: LayoutGrid },
                { id: "liste", label: "Liste", icon: List },
              ] as { id: ProjektAnsicht; label: string; icon: typeof List }[]).map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => setAnsicht(opt.id)}
                  aria-pressed={ansicht === opt.id}
                  title={opt.label}
                  className={cn(
                    "flex cursor-pointer items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors",
                    ansicht === opt.id ? "bg-white text-primary-700 shadow-sm" : "text-neutral-500 hover:text-neutral-700",
                  )}
                >
                  <opt.icon className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{opt.label}</span>
                </button>
              ))}
            </div>
            <DropdownMenu
              triggerLabel="Neu anlegen"
              trigger={
                <span className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md bg-primary-600 px-3 text-sm font-medium text-white shadow-sm transition-colors hover:bg-primary-700">
                  <Plus className="h-4 w-4" /> Neu
                </span>
              }
            >
              <DropdownItem onClick={startCreateFolder}>
                <FolderPlus className="h-4 w-4 text-primary-600" /> Neuer Ordner
              </DropdownItem>
              <DropdownItem onClick={() => openNewProject(currentFolderId)}>
                <FilePlus2 className="h-4 w-4 text-neutral-500" /> Neues Projekt
              </DropdownItem>
            </DropdownMenu>
          </div>
        </div>

        {/* Suchleiste — erst ab vielen Projekten */}
        {!loading && zeigeSuche ? (
          <div className="relative mt-5">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <input
              type="text"
              value={suche}
              onChange={(e) => setSuche(e.target.value)}
              placeholder="Alle Projekte durchsuchen …"
              aria-label="Projekte durchsuchen"
              className="w-full rounded-lg border border-neutral-200 bg-white py-2 pl-9 pr-9 text-sm text-neutral-800 placeholder:text-neutral-400 focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-400"
            />
            {suche ? (
              <button onClick={() => setSuche("")} title="Suche leeren" aria-label="Suche leeren" className="absolute right-2.5 top-1/2 -translate-y-1/2 cursor-pointer rounded p-0.5 text-neutral-400 transition-colors hover:text-neutral-700">
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        ) : null}

        {/* Inhalt */}
        {loading ? (
          <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-[256px] rounded-xl border border-neutral-200/80 bg-white shadow-card">
                <div className="skeleton h-28 w-full rounded-t-xl" />
                <div className="flex flex-col gap-3 p-4">
                  <div className="skeleton h-4 w-3/4 rounded" />
                  <div className="skeleton h-3 w-1/2 rounded" />
                  <div className="skeleton mt-4 h-3 w-2/3 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : loadError && aktive.length === 0 ? (
          <div className="mt-6">
            <EmptyState
              icon={WifiOff}
              title="Projekte konnten nicht geladen werden"
              description="Das Backend ist gerade nicht erreichbar. Bitte Verbindung prüfen und erneut laden."
              cta={<Button onClick={() => void loadProjects()}><RefreshCcw className="h-4 w-4" /> Erneut laden</Button>}
            />
          </div>
        ) : searching ? (
          // Suchmodus: flache Trefferliste über alle Ordner.
          treffer.length === 0 ? (
            <div className="mt-6"><EmptyState icon={Search} title="Keine Treffer" description={`Kein Projekt passt zu „${suche.trim()}".`} /></div>
          ) : ansicht === "karten" ? (
            <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {treffer.map((p, i) => <ProjectCard key={p.id} project={p} index={i} />)}
            </div>
          ) : (
            <Card className="mt-6"><ul className="divide-y divide-neutral-100">{treffer.map((p, i) => <ProjectListRow key={p.id} project={p} index={i} />)}</ul></Card>
          )
        ) : aktive.length === 0 && subfolders.length === 0 && !creatingFolder ? (
          <div className="mt-6">
            <EmptyState
              icon={FolderPlus}
              title="Los geht's — Ihr erstes Projekt"
              description="Legen Sie ein Projekt an oder strukturieren Sie mit Ordnern."
              cta={<Button onClick={() => openNewProject(null)}>Neues Projekt anlegen</Button>}
            />
          </div>
        ) : (
          <div className="mt-6 flex flex-col gap-6">
            {/* Ordner-Kacheln (aktuelle Ebene) */}
            {subfolders.length > 0 || creatingFolder ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {creatingFolder ? (
                  <div className="flex items-center gap-2 rounded-xl border border-primary-300 bg-primary-50/40 px-3 py-3">
                    <FolderPlus className="h-5 w-5 shrink-0 text-primary-500" />
                    <input
                      autoFocus
                      value={newFolderName}
                      onChange={(e) => setNewFolderName(e.target.value)}
                      onBlur={commitNewFolder}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void commitNewFolder()
                        else if (e.key === "Escape") { setCreatingFolder(false); setNewFolderName("") }
                      }}
                      placeholder="Ordnername …"
                      className="min-w-0 flex-1 rounded border border-primary-300 bg-white px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-primary-400"
                    />
                  </div>
                ) : null}
                {subfolders.map((f) => {
                  const isRenaming = renamingFolder === f.id
                  const over = dropTarget === f.id
                  return (
                    <div
                      key={f.id}
                      onDragOver={(e) => { if (draggingProject) { e.preventDefault(); setDropTarget(f.id) } }}
                      onDragLeave={() => setDropTarget((t) => (t === f.id ? null : t))}
                      onDrop={(e) => { e.preventDefault(); dropProjectInto(f.id) }}
                      className={cn(
                        "group flex items-center gap-2.5 rounded-xl border bg-white px-3 py-3 shadow-card transition-colors",
                        over ? "border-primary-400 bg-primary-50 ring-1 ring-primary-300" : "border-neutral-200/80 hover:border-primary-200 hover:bg-primary-50/30",
                      )}
                    >
                      <button
                        onClick={() => !isRenaming && goFolder(f.id)}
                        className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                        title={`Ordner „${f.name}" öffnen`}
                      >
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-600">
                          <Folder className="h-5 w-5" />
                        </span>
                        {isRenaming ? (
                          <input
                            autoFocus
                            value={renameVal}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => setRenameVal(e.target.value)}
                            onBlur={() => commitRename(f.id)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") commitRename(f.id)
                              else if (e.key === "Escape") setRenamingFolder(null)
                            }}
                            className="min-w-0 flex-1 rounded border border-primary-300 px-1.5 py-0.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary-400"
                          />
                        ) : (
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium text-neutral-900">{f.name}</span>
                            <span className="text-xs text-neutral-400">
                              {countIn(f.id)} {countIn(f.id) === 1 ? "Projekt" : "Projekte"}
                            </span>
                          </span>
                        )}
                      </button>
                      {!isRenaming ? (
                        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 max-lg:opacity-100">
                          <button
                            onClick={() => { setRenamingFolder(f.id); setRenameVal(f.name) }}
                            title="Umbenennen"
                            className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => {
                              if (window.confirm(`Ordner „${f.name}" löschen? Die Projekte bleiben erhalten und rücken eine Ebene hoch.`)) removeFolder(f.id)
                            }}
                            title="Ordner löschen"
                            className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-severity-kritisch"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            ) : null}

            {/* Projekte der aktuellen Ebene */}
            {folderProjects.length === 0 ? (
              subfolders.length > 0 || creatingFolder ? null : (
                <EmptyState
                  icon={FilePlus2}
                  title="Dieser Ordner ist leer"
                  description="Legen Sie hier ein Projekt oder einen Unterordner an."
                  cta={<Button onClick={() => openNewProject(currentFolderId)}>Neues Projekt</Button>}
                />
              )
            ) : ansicht === "karten" ? (
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {folderProjects.map((p, i) => (
                  <div
                    key={p.id}
                    draggable
                    onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", p.id); setDraggingProject(p.id) }}
                    onDragEnd={() => { setDraggingProject(null); setDropTarget(null) }}
                  >
                    <ProjectCard project={p} index={i} />
                  </div>
                ))}
              </div>
            ) : (
              <Card>
                <ul className="divide-y divide-neutral-100">
                  {folderProjects.map((p, i) => (
                    <li
                      key={p.id}
                      draggable
                      onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", p.id); setDraggingProject(p.id) }}
                      onDragEnd={() => { setDraggingProject(null); setDropTarget(null) }}
                    >
                      <ProjectListRow project={p} index={i} />
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </div>
        )}

        {/* Archiv — nur auf Wurzelebene, eingeklappt */}
        {!searching && currentFolderId == null && archivierte.length > 0 ? (
          <div className="mt-10">
            <button
              onClick={() => setArchivOffen((o) => !o)}
              aria-expanded={archivOffen}
              className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-neutral-500 transition-colors hover:text-neutral-800"
            >
              <Archive className="h-4 w-4" />
              Archiv ({archivierte.length})
              <ChevronDown className={cn("h-4 w-4 transition-transform duration-200", archivOffen && "rotate-180")} />
            </button>
            {archivOffen ? (
              <Card className="mt-3 opacity-80">
                <ul className="divide-y divide-neutral-100">
                  {[...archivierte].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map((p, i) => (
                    <ProjectListRow key={p.id} project={p} index={i} />
                  ))}
                </ul>
              </Card>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}
