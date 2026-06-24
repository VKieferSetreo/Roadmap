// Projektansicht mit Ordnerstruktur (T-177): Über-/Unterordner, Projekte per Drag-n-Drop
// in Ordner, Accordion (immer nur EIN Ordner je Ebene offen; beim Drüberziehen klappt der
// Zielordner auf). Native HTML5-DnD (kein Lib). Bei aktiver Suche: flache Trefferliste.
//
// FolderNode/NewFolderInput sind bewusst Modul-Komponenten (nicht im Render definiert):
// sonst remounten sie bei jedem Tastendruck und das Eingabefeld verliert den Fokus.

import { useEffect, useRef, useState } from "react"
import { ChevronRight, FilePlus2, Folder, FolderOpen, FolderPlus, Pencil, Trash2 } from "lucide-react"
import { useProjectStore } from "@/store/projects"
import { useFolderStore } from "@/store/folders"
import { useUiStore } from "@/store/ui"
import { ProjectMenu } from "@/components/project/ProjectMenu"
import { CreatorAvatar } from "@/components/project/CreatorAvatar"
import { DropdownMenu, DropdownItem } from "@/components/ui/DropdownMenu"
import { cn } from "@/lib/cn"
import type { Folder as FolderT, Project } from "@/types/domain"

interface TreeProps {
  query: string
  activeId?: string
  activeTab: string
  go: (path: string) => void
}

/** Gebündelter Zustand + Aktionen, die durch den Baum gereicht werden. */
interface TreeCtx {
  activeId?: string
  activeTab: string
  go: (path: string) => void
  folderById: (id: string) => FolderT | undefined
  childrenOf: (id: string) => FolderT[]
  projectsIn: (folderId: string | null) => Project[]
  isOpen: (id: string) => boolean
  toggle: (id: string, depth: number, parent?: string) => void
  openTo: (id: string, depth: number, parent?: string) => void
  dragId: string | null
  setDragId: (id: string | null) => void
  dragFolderId: string | null
  setDragFolderId: (id: string | null) => void
  canDropFolder: (draggedId: string, targetId: string | null) => boolean
  dragOver: string | null
  setDragOver: (v: string | null) => void
  /** zonePrivate nur bei Wurzel-Drop (folderId null): true = Privat-Zone, false = Geteilt-Zone. */
  drop: (folderId: string | null, zonePrivate?: boolean) => void
  renaming: string | null
  startRename: (id: string, name: string) => void
  renameVal: string
  setRenameVal: (v: string) => void
  commitRename: (id: string) => void
  cancelRename: () => void
  removeFolder: (id: string) => void
  /** Neues Projekt im angegebenen Ordner anlegen (öffnet den Dialog; AppLayout sortiert ein). */
  openNewProject: (folderId: string) => void
  creatingIn: string | null | undefined
  startCreate: (parentId: string | null, openPath?: string[]) => void
  /** Wurzelordner in einer Zone anlegen (058): isPrivate = Privat-Zone. */
  startRootCreate: (isPrivate: boolean) => void
  newName: string
  setNewName: (v: string) => void
  commitCreate: () => void
  cancelCreate: () => void
}

/** Eine Projekt-Zeile — draggable (Drag-n-Drop in Ordner) + Drei-Punkte-Menü. */
function ProjectRow({
  project,
  active,
  go,
  activeTab,
  setDragId,
}: {
  project: Project
  active: boolean
  go: (path: string) => void
  activeTab: string
  setDragId: (id: string | null) => void
}) {
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move"
        e.dataTransfer.setData("text/plain", project.id)
        setDragId(project.id)
      }}
      onDragEnd={() => setDragId(null)}
      className={cn(
        "group relative flex items-center rounded-md transition-colors",
        active
          ? "bg-primary-50 before:absolute before:bottom-1.5 before:left-0 before:top-1.5 before:w-0.5 before:rounded-full before:bg-primary-600"
          : "hover:bg-neutral-100",
      )}
    >
      <button
        onClick={() => go(`/projekte/${project.id}/${active ? activeTab : "route"}`)}
        className={cn(
          "flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 rounded-md py-2 pl-3 pr-1 text-sm transition-colors",
          active ? "font-medium text-primary-700" : "text-neutral-600 group-hover:text-neutral-900",
        )}
        aria-current={active ? "page" : undefined}
      >
        {project.erstelltVon ? (
          <CreatorAvatar email={project.erstelltVon} size={18} />
        ) : (
          <Folder className={cn("h-4 w-4 shrink-0", active ? "text-primary-600" : "text-neutral-400")} />
        )}
        <span className="truncate">{project.name}</span>
      </button>
      <div
        className={cn(
          "pr-1.5 transition-opacity",
          active
            ? "opacity-100"
            : "opacity-0 focus-within:opacity-100 group-hover:opacity-100 max-lg:opacity-100",
        )}
      >
        <ProjectMenu project={project} />
      </div>
    </div>
  )
}

/** Inline-Eingabe für einen neuen Ordnernamen. */
function NewFolderInput({
  indent,
  value,
  onChange,
  onCommit,
  onCancel,
}: {
  indent: number
  value: string
  onChange: (v: string) => void
  onCommit: () => void
  onCancel: () => void
}) {
  return (
    <div className="flex items-center gap-1 py-0.5" style={{ paddingLeft: indent }}>
      <FolderPlus className="ml-2 h-4 w-4 shrink-0 text-primary-500" />
      <input
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onCommit}
        onKeyDown={(e) => {
          if (e.key === "Enter") onCommit()
          else if (e.key === "Escape") onCancel()
        }}
        placeholder="Ordnername …"
        className="min-w-0 flex-1 rounded border border-primary-300 px-1.5 py-0.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary-400"
      />
    </div>
  )
}

/** Ordnerzeile + (rekursiv) Unterordner & enthaltene Projekte. */
function FolderNode({ id, depth, parent, ctx }: { id: string; depth: number; parent?: string; ctx: TreeCtx }) {
  const f = ctx.folderById(id)
  if (!f) return null

  const open = ctx.isOpen(id)
  const subs = ctx.childrenOf(id)
  const eigene = ctx.projectsIn(id)
  const count = eigene.length + subs.reduce((n, s) => n + ctx.projectsIn(s.id).length, 0)
  const isRenaming = ctx.renaming === id
  const over = ctx.dragOver === id
  const indent = depth * 14

  // Gültiges Drop-Ziel? Projekt immer; Ordner nur, wenn nicht er selbst / kein eigener Nachfahre.
  const accepts = ctx.dragId != null || (ctx.dragFolderId != null && ctx.canDropFolder(ctx.dragFolderId, id))

  return (
    <div className="select-none">
      <div
        draggable={!isRenaming}
        onDragStart={(e) => {
          e.stopPropagation()
          e.dataTransfer.effectAllowed = "move"
          e.dataTransfer.setData("text/plain", `folder:${id}`)
          ctx.setDragFolderId(id)
        }}
        onDragEnd={() => ctx.setDragFolderId(null)}
        onDragOver={(e) => {
          if (!accepts) return
          e.preventDefault()
          e.stopPropagation()
          ctx.setDragOver(id)
          if (!open) ctx.openTo(id, depth, parent) // Drüberziehen klappt den Zielordner auf
        }}
        onDragLeave={() => ctx.setDragOver(ctx.dragOver === id ? null : ctx.dragOver)}
        onDrop={(e) => {
          if (!accepts) return
          e.preventDefault()
          e.stopPropagation()
          ctx.drop(id)
        }}
        className={cn(
          "group/folder relative flex items-center rounded-md pr-1 transition-colors",
          over && accepts ? "bg-primary-100 ring-1 ring-primary-300" : "hover:bg-neutral-100",
        )}
        style={{ paddingLeft: indent }}
      >
        <button
          onClick={() => ctx.toggle(id, depth, parent)}
          className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md py-1.5 pl-2 pr-1 text-sm text-neutral-700"
        >
          <ChevronRight className={cn("h-3.5 w-3.5 shrink-0 text-neutral-400 transition-transform", open && "rotate-90")} />
          {open ? (
            <FolderOpen className="h-4 w-4 shrink-0 text-primary-500" />
          ) : (
            <Folder className="h-4 w-4 shrink-0 text-neutral-400" />
          )}
          {isRenaming ? (
            <input
              autoFocus
              value={ctx.renameVal}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => ctx.setRenameVal(e.target.value)}
              onBlur={() => ctx.commitRename(id)}
              onKeyDown={(e) => {
                if (e.key === "Enter") ctx.commitRename(id)
                else if (e.key === "Escape") ctx.cancelRename()
              }}
              className="min-w-0 flex-1 rounded border border-primary-300 px-1 py-0.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary-400"
            />
          ) : (
            <>
              <span className="truncate font-medium">{f.name}</span>
              {count > 0 ? <span className="shrink-0 text-xs text-neutral-400">{count}</span> : null}
            </>
          )}
        </button>
        {!isRenaming ? (
          <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover/folder:opacity-100 max-lg:opacity-100">
            {/* „+" im Ordner: Auswahl Neuer Ordner ODER Neues Projekt — beides IN diesem Ordner. */}
            <DropdownMenu
              align="start"
              triggerLabel={`In „${f.name}" neu anlegen`}
              trigger={
                <span
                  title="Neu anlegen: Ordner oder Projekt"
                  className="flex h-6 w-6 cursor-pointer items-center justify-center rounded text-neutral-400 hover:bg-neutral-200 hover:text-primary-600"
                >
                  <FolderPlus className="h-3.5 w-3.5" />
                </span>
              }
            >
              <DropdownItem onClick={() => ctx.startCreate(id, depth === 0 || !parent ? [id] : [parent, id])}>
                <FolderPlus className="h-4 w-4 text-primary-600" /> Neuer Ordner
              </DropdownItem>
              <DropdownItem onClick={() => ctx.openNewProject(id)}>
                <FilePlus2 className="h-4 w-4 text-neutral-500" /> Neues Projekt
              </DropdownItem>
            </DropdownMenu>
            <button
              onClick={() => ctx.startRename(id, f.name)}
              title="Umbenennen"
              className="rounded p-1 text-neutral-400 hover:bg-neutral-200 hover:text-neutral-700"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => {
                if (window.confirm(`Ordner „${f.name}" löschen? Die Projekte bleiben erhalten.`)) {
                  ctx.removeFolder(id)
                }
              }}
              title="Ordner löschen"
              className="rounded p-1 text-neutral-400 hover:bg-neutral-200 hover:text-severity-kritisch"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : null}
      </div>

      {open ? (
        <div className="mt-0.5 flex flex-col gap-0.5">
          {subs.map((s) => (
            <FolderNode key={s.id} id={s.id} depth={depth + 1} parent={id} ctx={ctx} />
          ))}
          {ctx.creatingIn === id ? (
            <NewFolderInput
              indent={(depth + 1) * 14}
              value={ctx.newName}
              onChange={ctx.setNewName}
              onCommit={ctx.commitCreate}
              onCancel={ctx.cancelCreate}
            />
          ) : null}
          {eigene.map((p) => (
            <div key={p.id} style={{ paddingLeft: (depth + 1) * 14 }}>
              <ProjectRow
                project={p}
                active={p.id === ctx.activeId}
                go={ctx.go}
                activeTab={ctx.activeTab}
                setDragId={ctx.setDragId}
              />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

/** Eine Zone (Geteilt / Privat): Kopf mit „+ Ordner", Wurzelordner + Wurzelprojekte, Drop-Zone die
 *  beim Ablegen die Zielzone setzt. Modul-Komponente (stabil) → das NewFolderInput verliert nicht den Fokus. */
function ZoneSection({
  ctx,
  label,
  zonePrivate,
  folders,
  rootProjects,
  creatingHere,
}: {
  ctx: TreeCtx
  label: string
  zonePrivate: boolean
  folders: FolderT[]
  rootProjects: Project[]
  creatingHere: boolean
}) {
  const dropKey = zonePrivate ? "__zone_private__" : "__zone_shared__"
  const dragging = ctx.dragId != null || ctx.dragFolderId != null
  const over = ctx.dragOver === dropKey
  return (
    <div>
      <div className="flex items-center justify-between px-2 pb-0.5 pt-1">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">{label}</span>
        <button
          type="button"
          onClick={() => ctx.startRootCreate(zonePrivate)}
          title={`Ordner in „${label}" anlegen`}
          aria-label={`Ordner in „${label}" anlegen`}
          className="flex h-5 w-5 cursor-pointer items-center justify-center rounded text-neutral-400 transition-colors hover:bg-neutral-200 hover:text-primary-600"
        >
          <FolderPlus className="h-3.5 w-3.5" />
        </button>
      </div>
      <div
        onDragOver={(e) => {
          if (!dragging) return
          e.preventDefault()
          ctx.setDragOver(dropKey)
        }}
        onDragLeave={() => ctx.setDragOver(ctx.dragOver === dropKey ? null : ctx.dragOver)}
        onDrop={(e) => {
          e.preventDefault()
          ctx.drop(null, zonePrivate)
        }}
        className={cn(
          "flex flex-col gap-0.5 rounded-md p-0.5",
          over && "bg-primary-50 ring-1 ring-primary-200",
          dragging ? "min-h-[30px]" : "",
        )}
      >
        {folders.map((f) => (
          <FolderNode key={f.id} id={f.id} depth={0} ctx={ctx} />
        ))}
        {creatingHere ? (
          <NewFolderInput
            indent={0}
            value={ctx.newName}
            onChange={ctx.setNewName}
            onCommit={ctx.commitCreate}
            onCancel={ctx.cancelCreate}
          />
        ) : null}
        {rootProjects.map((p) => (
          <ProjectRow
            key={p.id}
            project={p}
            active={p.id === ctx.activeId}
            go={ctx.go}
            activeTab={ctx.activeTab}
            setDragId={ctx.setDragId}
          />
        ))}
        {!folders.length && !rootProjects.length && !creatingHere ? (
          <p className="px-2 py-1.5 text-[11px] text-neutral-400">
            {zonePrivate ? "Noch nichts Privates — mit + anlegen oder hierher ziehen." : "Noch nichts Geteiltes."}
          </p>
        ) : null}
      </div>
    </div>
  )
}

export function ProjectTree({ query, activeId, activeTab, go }: TreeProps) {
  const projects = useProjectStore((s) => s.projects ?? [])
  const setProjectFolder = useProjectStore((s) => s.setProjectFolder)
  const folders = useFolderStore((s) => s.folders)
  const createFolder = useFolderStore((s) => s.createFolder)
  const renameFolder = useFolderStore((s) => s.renameFolder)
  const moveFolder = useFolderStore((s) => s.moveFolder)
  const removeFolder = useFolderStore((s) => s.removeFolder)
  const openNewProject = useUiStore((s) => s.openNewProject)

  const [openPath, setOpenPath] = useState<string[]>([])
  const [dragId, setDragId] = useState<string | null>(null)
  const [dragFolderId, setDragFolderId] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState<string | null>(null)
  const [creatingIn, setCreatingIn] = useState<string | null | undefined>(undefined)
  const [creatingPrivate, setCreatingPrivate] = useState(false) // Zone des Wurzelordner-Eingabefelds (058)
  const [newName, setNewName] = useState("")
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameVal, setRenameVal] = useState("")

  // „+ → Ordner" aus der Sidebar-Kopfzeile öffnet die Inline-Eingabe für einen Wurzelordner.
  // Tick-Signal statt Callback, weil der Auslöser in einer anderen Komponente sitzt.
  const newFolderTick = useUiStore((s) => s.newFolderTick)
  const lastTick = useRef(newFolderTick)
  useEffect(() => {
    if (newFolderTick === lastTick.current) return
    lastTick.current = newFolderTick
    setOpenPath([])
    setCreatingIn(null)
    setCreatingPrivate(false) // „+ Ordner" aus der Kopfzeile → Geteilt-Zone
    setNewName("")
  }, [newFolderTick])

  const aktive = [...projects]
    .filter((p) => !p.archiviertAm)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))

  // ── Suchmodus: flache Trefferliste über ALLE Ordner ──────────────────────────
  const q = query.trim().toLowerCase()
  if (q) {
    const treffer = aktive.filter(
      (p) => p.name.toLowerCase().includes(q) || (p.erstelltVon ?? "").toLowerCase().includes(q),
    )
    if (!treffer.length) {
      return <p className="px-3 py-4 text-center text-xs text-neutral-500">Kein Projekt für „{query.trim()}".</p>
    }
    return (
      <div className="mt-1 flex flex-col gap-0.5">
        {treffer.map((p) => (
          <ProjectRow
            key={p.id}
            project={p}
            active={p.id === activeId}
            go={go}
            activeTab={activeTab}
            setDragId={() => {}}
          />
        ))}
      </div>
    )
  }

  // ── Baum ─────────────────────────────────────────────────────────────────────
  const rootFolders = folders.filter((f) => f.parentId == null)
  const folderById = (id: string) => folders.find((f) => f.id === id)
  const childrenOf = (id: string) => folders.filter((f) => f.parentId === id)
  const projectsIn = (folderId: string | null) => aktive.filter((p) => (p.folderId ?? null) === folderId)

  // Ein Ordner darf nicht in sich selbst oder einen eigenen Nachfahren gezogen werden (Zyklus).
  const canDropFolder = (draggedId: string, targetId: string | null) => {
    if (targetId == null) return true // auf Wurzel lösen ist immer erlaubt
    if (targetId === draggedId) return false
    const stack = [draggedId]
    while (stack.length) {
      for (const c of childrenOf(stack.pop() as string)) {
        if (c.id === targetId) return false
        stack.push(c.id)
      }
    }
    return true
  }

  const commitCreate = async () => {
    const parentId = creatingIn ?? null
    const name = newName.trim()
    setCreatingIn(undefined)
    setNewName("")
    // Wurzelordner (parentId null) → Zone aus creatingPrivate; Unterordner erben die Zone des Parents.
    if (name) await createFolder(name, parentId, parentId == null ? creatingPrivate : undefined)
  }

  const ctx: TreeCtx = {
    activeId,
    activeTab,
    go,
    folderById,
    childrenOf,
    projectsIn,
    isOpen: (id) => openPath.includes(id),
    toggle: (id, depth, parent) =>
      setOpenPath((cur) => (cur[depth] === id ? cur.slice(0, depth) : depth === 0 ? [id] : [parent as string, id])),
    openTo: (id, depth, parent) => setOpenPath(depth === 0 ? [id] : [parent as string, id]),
    dragId,
    setDragId,
    dragFolderId,
    setDragFolderId,
    canDropFolder,
    dragOver,
    setDragOver,
    drop: (folderId, zonePrivate) => {
      // In einen Ordner → Zone wird geerbt (kein Flag). Auf eine Zonen-Wurzel → Zone explizit setzen.
      if (dragFolderId && canDropFolder(dragFolderId, folderId)) {
        moveFolder(dragFolderId, folderId, folderId == null ? zonePrivate : undefined)
      } else if (dragId) {
        setProjectFolder(dragId, folderId, folderId == null ? { private: zonePrivate } : undefined)
      }
      setDragId(null)
      setDragFolderId(null)
      setDragOver(null)
    },
    renaming,
    startRename: (id, name) => {
      setRenaming(id)
      setRenameVal(name)
    },
    renameVal,
    setRenameVal,
    commitRename: (id) => {
      renameFolder(id, renameVal)
      setRenaming(null)
    },
    cancelRename: () => setRenaming(null),
    removeFolder,
    openNewProject,
    creatingIn,
    startCreate: (parentId, openPath) => {
      setCreatingIn(parentId)
      setNewName("")
      // Ordner sichtbar halten: bei Unterordnern den ganzen Pfad öffnen, sonst nur den Ordner.
      if (openPath) setOpenPath(openPath)
      else if (parentId) setOpenPath([parentId])
    },
    startRootCreate: (isPrivate) => {
      setCreatingIn(null)
      setCreatingPrivate(isPrivate)
      setNewName("")
      setOpenPath([])
    },
    newName,
    setNewName,
    commitCreate,
    cancelCreate: () => {
      setCreatingIn(undefined)
      setNewName("")
    },
  }

  const rootProjects = projectsIn(null)
  // Zwei Zonen (058): oben Geteilt (owner null = alle Mandanten-Mitglieder), unten Privat (owner
  // gesetzt = nur eigener Account; Admin sieht zusätzlich fremde private). Wurzelordner + lose
  // Wurzelprojekte je Zone; per DnD zwischen den Zonen verschiebbar (setzt/entfernt die Privatheit).
  const sharedFolders = rootFolders.filter((f) => !f.owner)
  const privateFolders = rootFolders.filter((f) => f.owner)
  const sharedRootProjects = rootProjects.filter((p) => !p.owner)
  const privateRootProjects = rootProjects.filter((p) => p.owner)
  const creatingRoot = creatingIn === null

  return (
    <div className="mt-1 flex flex-col gap-1.5">
      <ZoneSection
        ctx={ctx}
        label="Geteilt"
        zonePrivate={false}
        folders={sharedFolders}
        rootProjects={sharedRootProjects}
        creatingHere={creatingRoot && !creatingPrivate}
      />
      <div className="mx-2 border-t border-neutral-200" />
      <ZoneSection
        ctx={ctx}
        label="Privat"
        zonePrivate={true}
        folders={privateFolders}
        rootProjects={privateRootProjects}
        creatingHere={creatingRoot && creatingPrivate}
      />
    </div>
  )
}
