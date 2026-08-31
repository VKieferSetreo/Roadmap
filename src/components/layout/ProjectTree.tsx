// Projektansicht: EINE Ebene auf einmal, mit Pfad oben (T-651).
//
// Max, 31.08.2026: "das man jetzt quasi nicht mehr Ordner in Ordner sieht sondern das man
// Ordner hat auf Ebene 1 und dann kann man Ordner öffnen und kommt auf Ebene 2 und so weiter
// und oben sieht man dann den aktuellen Pfad. ansonsten ist das Handling sehr schwer."
//
//
// WAS SICH GEAENDERT HAT UND WARUM
//
// Vorher war das ein Akkordeon-Baum: jeder Ordner klappte an Ort und Stelle auf, Unterordner
// erschienen eingerueckt darunter, und bei drei Ebenen (CK → Prysmian → Hamm) stand in einer
// 280 Pixel breiten Seitenleiste eine Treppe aus Einrueckungen, in der man den Ueberblick
// verliert. Der Bestand ist wirklich drei Ebenen tief und CK allein traegt 40 Projekte.
//
// Jetzt: man sieht IMMER genau eine Ebene. Ein Klick auf einen Ordner geht hinein, der Pfad
// oben zeigt, wo man ist, und ein Klick darin geht zurueck. Keine Einrueckung, keine
// Rekursion, kein aufgeklappter Zustand, den man sich merken muss.
//
// WAS DABEI ERHALTEN BLEIBT, weil es sonst ein Rueckschritt waere:
//   - Ziehen von Projekten UND Ordnern in Ordner
//   - Haelt man beim Ziehen ueber einem Ordner, geht die Ansicht nach 0,5 s HINEIN. So
//     erreicht man auch tiefe Ziele, ohne vorher hinnavigieren zu muessen.
//   - Die zwei Zonen Geteilt/Privat auf der obersten Ebene (058): sie sind keine Ordner,
//     sondern die Sichtbarkeit, und ein Wechsel zwischen ihnen setzt sie.
//   - Umbenennen, Loeschen, Ordner/Projekt anlegen, Suche als flache Trefferliste.
//
// ProjectRow/NewFolderInput sind bewusst Modul-Komponenten (nicht im Render definiert):
// sonst remounten sie bei jedem Tastendruck und das Eingabefeld verliert den Fokus.

import { useEffect, useRef, useState } from "react"
import {
  ChevronRight,
  CornerLeftUp,
  FilePlus2,
  Folder,
  FolderPlus,
  Home,
  Pencil,
  Route as RouteIcon,
  Trash2,
} from "lucide-react"
import { useProjectStore } from "@/store/projects"
import { useFolderStore } from "@/store/folders"
import { useUiStore } from "@/store/ui"
import { ProjectMenu } from "@/components/project/ProjectMenu"
import { CreatorAvatar } from "@/components/project/CreatorAvatar"
import { DropdownMenu, DropdownItem } from "@/components/ui/DropdownMenu"
import { cn } from "@/lib/cn"
import type { Folder as FolderT, Project } from "@/types/domain"
import { anzahlTief as tiefZaehlen, gueltigerPfad } from "@/lib/ordner"

interface TreeProps {
  query: string
  activeId?: string
  activeTab: string
  go: (path: string) => void
}

/** Aufklappen beim Ziehen: so lange muss man ueber dem Ordner halten, bevor es hineingeht. */
const HALTEN_MS = 500

/** Einzug je Ebene (px). Die Liste einer tieferen Ebene rueckt als Ganzes nach rechts, damit man
 *  auch ohne Blick auf den Pfad sieht, dass man nicht mehr an der Wurzel steht (Max 31.08.2026).
 *  Gedeckelt: die Leiste ist 280 px breit, und ab drei Ebenen frisst der Einzug sonst die Namen. */
const EINZUG_PRO_EBENE = 12
const einzugPx = (tiefe: number) => Math.min(tiefe, 3) * EINZUG_PRO_EBENE

/** Eine Projekt-Zeile — draggable (Drag-n-Drop in Ordner) + Drei-Punkte-Menü. */
function ProjectRow({
  project,
  active,
  go,
  activeTab,
  setDragId,
  onDragEnd,
}: {
  project: Project
  active: boolean
  go: (path: string) => void
  activeTab: string
  setDragId: (id: string | null) => void
  onDragEnd?: () => void
}) {
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move"
        e.dataTransfer.setData("text/plain", project.id)
        setDragId(project.id)
      }}
      onDragEnd={() => (onDragEnd ? onDragEnd() : setDragId(null))}
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
          // KEIN Ordnersymbol als Rueckfall: seit die Ansicht flach ist, stehen Ordner und Projekte
          // in derselben Liste untereinander, und mit gleichem Symbol waeren sie nicht mehr zu
          // unterscheiden. Im Baum war das egal, dort waren Ordner an der Einrueckung erkennbar.
          <RouteIcon className={cn("h-4 w-4 shrink-0", active ? "text-primary-600" : "text-neutral-400")} />
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
  value,
  onChange,
  onCommit,
  onCancel,
}: {
  value: string
  onChange: (v: string) => void
  onCommit: () => void
  onCancel: () => void
}) {
  return (
    <div className="flex items-center gap-1 py-0.5">
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

/** Eine Ordnerzeile in der aktuellen Ebene. Klick geht HINEIN, nicht auf. */
function FolderRow({
  f,
  anzahl,
  ctx,
}: {
  f: FolderT
  anzahl: number
  ctx: Ctx
}) {
  const isRenaming = ctx.renaming === f.id
  const over = ctx.dragOver === f.id
  const accepts = ctx.dragId != null || (ctx.dragFolderId != null && ctx.canDropFolder(ctx.dragFolderId, f.id))

  return (
    <div
      draggable={!isRenaming}
      onDragStart={(e) => {
        e.stopPropagation()
        e.dataTransfer.effectAllowed = "move"
        e.dataTransfer.setData("text/plain", `folder:${f.id}`)
        ctx.setDragOver(null)
        ctx.setDragFolderId(f.id)
      }}
      onDragEnd={() => ctx.endDrag()}
      onDragOver={(e) => {
        if (!accepts) return
        e.preventDefault()
        e.stopPropagation()
        ctx.enterOver(f.id)
        // Halten geht HINEIN. Das ersetzt das frühere Aufklappen und ist der einzige Weg,
        // beim Ziehen ein tiefes Ziel zu erreichen, ohne vorher hinzunavigieren.
        ctx.haltenStarten(f.id)
      }}
      onDragLeave={() => {
        ctx.leaveOver(f.id)
        ctx.haltenAbbrechen(f.id)
      }}
      onDrop={(e) => {
        if (!accepts) return
        e.preventDefault()
        e.stopPropagation()
        ctx.drop(f.id)
      }}
      className={cn(
        "group/folder relative flex items-center rounded-md pr-1 transition-colors",
        over && accepts ? "bg-primary-100 ring-1 ring-primary-300" : "hover:bg-neutral-100",
      )}
    >
      <button
        onClick={() => ctx.hinein(f.id)}
        className="flex min-w-0 flex-1 items-center gap-2 rounded-md py-2 pl-2.5 text-left text-sm text-neutral-700"
        title={`„${f.name}" öffnen`}
      >
        <Folder className="h-4 w-4 shrink-0 text-primary-500" />
        {isRenaming ? (
          <input
            autoFocus
            value={ctx.renameVal}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => ctx.setRenameVal(e.target.value)}
            onBlur={() => ctx.commitRename(f.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter") ctx.commitRename(f.id)
              else if (e.key === "Escape") ctx.cancelRename()
            }}
            className="min-w-0 flex-1 rounded border border-primary-300 px-1 py-0.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary-400"
          />
        ) : (
          <span className="min-w-0 flex-1 truncate font-medium">{f.name}</span>
        )}
      </button>
      {!isRenaming ? (
        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover/folder:opacity-100 max-lg:opacity-100">
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
            <DropdownItem onClick={() => ctx.neuerOrdnerIn(f.id)}>
              <FolderPlus className="h-4 w-4 text-primary-600" /> Neuer Ordner
            </DropdownItem>
            <DropdownItem onClick={() => ctx.openNewProject(f.id)}>
              <FilePlus2 className="h-4 w-4 text-neutral-500" /> Neues Projekt
            </DropdownItem>
          </DropdownMenu>
          <button
            onClick={() => ctx.startRename(f.id, f.name)}
            title="Umbenennen"
            className="rounded p-1 text-neutral-400 hover:bg-neutral-200 hover:text-neutral-700"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => {
              if (window.confirm(`Ordner „${f.name}" löschen? Die Projekte bleiben erhalten.`)) {
                ctx.removeFolder(f.id)
              }
            }}
            title="Ordner löschen"
            className="rounded p-1 text-neutral-400 hover:bg-neutral-200 hover:text-severity-kritisch"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}
      {!isRenaming ? (
        // Zahl und Pfeil stehen NACH den Aktionssymbolen (Max 31.08.2026). Eigener Knopf, damit
        // die Flaeche rechts weiter in den Ordner fuehrt, statt tot zu sein.
        <button
          type="button"
          onClick={() => ctx.hinein(f.id)}
          tabIndex={-1}
          aria-hidden
          className="flex shrink-0 items-center gap-1 py-2 pl-1 pr-1.5"
        >
          {anzahl > 0 ? <span className="text-xs text-neutral-400">{anzahl}</span> : null}
          <ChevronRight className="h-4 w-4 text-neutral-300" />
        </button>
      ) : null}
    </div>
  )
}

/** Gebündelter Zustand + Aktionen für die Zeilen. */
interface Ctx {
  activeId?: string
  activeTab: string
  go: (path: string) => void
  hinein: (id: string) => void
  canDropFolder: (draggedId: string, targetId: string | null) => boolean
  dragId: string | null
  setDragId: (id: string | null) => void
  dragFolderId: string | null
  setDragFolderId: (id: string | null) => void
  dragOver: string | null
  setDragOver: (v: string | null) => void
  enterOver: (key: string) => void
  leaveOver: (key: string) => void
  endDrag: () => void
  drop: (folderId: string | null, zonePrivate?: boolean) => void
  haltenStarten: (id: string) => void
  haltenAbbrechen: (id: string) => void
  renaming: string | null
  startRename: (id: string, name: string) => void
  renameVal: string
  setRenameVal: (v: string) => void
  commitRename: (id: string) => void
  cancelRename: () => void
  removeFolder: (id: string) => void
  openNewProject: (folderId: string) => void
  neuerOrdnerIn: (parentId: string | null) => void
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

  /** Wo man gerade ist: Ordner-Kennungen von der Wurzel bis hierher. Leer = oberste Ebene. */
  const [pfad, setPfad] = useState<string[]>([])
  const [dragId, setDragId] = useState<string | null>(null)
  const [dragFolderId, setDragFolderId] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState<string | null>(null)
  /** Wo gerade ein neuer Ordner benannt wird: Eltern-Kennung, null = aktuelle Ebene, undefined = aus. */
  const [anlegenIn, setAnlegenIn] = useState<string | null | undefined>(undefined)
  const [anlegenPrivat, setAnlegenPrivat] = useState(false)
  const [newName, setNewName] = useState("")
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameVal, setRenameVal] = useState("")
  const overTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const holdTarget = useRef<string | null>(null)

  const folderById = (id: string) => folders.find((f) => f.id === id)
  const childrenOf = (id: string | null) => folders.filter((f) => (f.parentId ?? null) === id)

  // Verschwindet der Ordner, in dem man steht (geloescht, oder ein anderer Mandant), faellt die
  // Ansicht auf die naechste noch vorhandene Ebene zurueck statt leer dazustehen.
  useEffect(() => {
    if (!pfad.length) return
    const gueltig = gueltigerPfad(pfad, folders)
    if (gueltig.length !== pfad.length) setPfad(gueltig)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folders])

  // „+ → Ordner" aus der Sidebar-Kopfzeile: Eingabe auf der AKTUELLEN Ebene oeffnen.
  const newFolderTick = useUiStore((s) => s.newFolderTick)
  const lastTick = useRef(newFolderTick)
  useEffect(() => {
    if (newFolderTick === lastTick.current) return
    lastTick.current = newFolderTick
    setAnlegenIn(null)
    setAnlegenPrivat(false)
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

  const projectsIn = (folderId: string | null) => aktive.filter((p) => (p.folderId ?? null) === folderId)

  /** Die geprueften Rechnungen aus lib/ordner.ts — hier nur noch angebunden. */
  const anzahlTief = (id: string) => tiefZaehlen(id, folders, aktive)

  const canDropFolder = (draggedId: string, targetId: string | null) => {
    if (targetId == null) return true
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

  const hierId = pfad.length ? pfad[pfad.length - 1] : null
  const hier = hierId ? folderById(hierId) : undefined
  const timerAus = () => {
    if (overTimer.current) {
      clearTimeout(overTimer.current)
      overTimer.current = null
    }
    if (holdTimer.current) {
      clearTimeout(holdTimer.current)
      holdTimer.current = null
    }
    holdTarget.current = null
  }

  const commitCreate = async () => {
    const parentId = anlegenIn === null ? hierId : (anlegenIn ?? null)
    const name = newName.trim()
    setAnlegenIn(undefined)
    setNewName("")
    // Nur ein WURZELordner braucht die Zone; ein Unterordner erbt sie vom Elternordner.
    if (name) await createFolder(name, parentId, parentId == null ? anlegenPrivat : undefined)
  }

  const ctx: Ctx = {
    activeId,
    activeTab,
    go,
    hinein: (id) => {
      setPfad((cur) => [...cur, id])
      setAnlegenIn(undefined)
    },
    canDropFolder,
    dragId,
    setDragId,
    dragFolderId,
    setDragFolderId,
    dragOver,
    setDragOver,
    enterOver: (key) => {
      if (overTimer.current) {
        clearTimeout(overTimer.current)
        overTimer.current = null
      }
      setDragOver(key)
    },
    leaveOver: (key) => {
      if (overTimer.current) clearTimeout(overTimer.current)
      overTimer.current = setTimeout(() => {
        setDragOver((cur) => (cur === key ? null : cur))
        overTimer.current = null
      }, 350)
    },
    haltenStarten: (id) => {
      if (holdTarget.current === id) return
      if (holdTimer.current) clearTimeout(holdTimer.current)
      holdTarget.current = id
      holdTimer.current = setTimeout(() => {
        setPfad((cur) => [...cur, id])
        holdTimer.current = null
        holdTarget.current = null
      }, HALTEN_MS)
    },
    haltenAbbrechen: (id) => {
      if (holdTarget.current === id && holdTimer.current) {
        clearTimeout(holdTimer.current)
        holdTimer.current = null
        holdTarget.current = null
      }
    },
    endDrag: () => {
      timerAus()
      setDragId(null)
      setDragFolderId(null)
      setDragOver(null)
    },
    drop: (folderId, zonePrivate) => {
      if (dragFolderId && canDropFolder(dragFolderId, folderId)) {
        moveFolder(dragFolderId, folderId, folderId == null ? zonePrivate : undefined)
      } else if (dragId) {
        setProjectFolder(dragId, folderId, folderId == null ? { private: zonePrivate } : undefined)
      }
      timerAus()
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
    neuerOrdnerIn: (parentId) => {
      setAnlegenIn(parentId)
      setNewName("")
    },
  }

  // ── Pfadleiste ───────────────────────────────────────────────────────────────
  // Sie ist zugleich Anzeige UND Rueckweg, und sie ist ein Drop-Ziel: beim Ziehen kann man
  // eine Ebene hoeher ablegen, ohne erst zurueckzunavigieren.
  const pfadOrdner = pfad.map((id) => folderById(id)).filter(Boolean) as FolderT[]
  const ziehend = dragId != null || dragFolderId != null

  const Pfadleiste = () => (
    <div className="flex flex-wrap items-center gap-0.5 px-1 pb-1 text-[11px] text-neutral-500">
      <button
        type="button"
        onClick={() => setPfad([])}
        onDragOver={(e) => {
          if (!ziehend) return
          e.preventDefault()
          ctx.enterOver("__pfad_wurzel__")
        }}
        onDragLeave={() => ctx.leaveOver("__pfad_wurzel__")}
        onDrop={(e) => {
          e.preventDefault()
          // Auf die Wurzel abgelegt: die Zone folgt der Sichtbarkeit, die das Element schon hat.
          ctx.drop(null, undefined)
          setPfad([])
        }}
        className={cn(
          "flex items-center gap-1 rounded px-1.5 py-1 transition-colors hover:bg-neutral-100 hover:text-neutral-800",
          dragOver === "__pfad_wurzel__" && "bg-primary-100 text-primary-800 ring-1 ring-primary-300",
        )}
        title="Zur obersten Ebene"
      >
        <Home className="h-3.5 w-3.5" />
        Alle
      </button>
      {pfadOrdner.map((f, i) => (
        <span key={f.id} className="flex items-center gap-0.5">
          <ChevronRight className="h-3 w-3 shrink-0 text-neutral-300" />
          <button
            type="button"
            onClick={() => setPfad(pfad.slice(0, i + 1))}
            onDragOver={(e) => {
              if (!ziehend) return
              e.preventDefault()
              ctx.enterOver(`pfad:${f.id}`)
            }}
            onDragLeave={() => ctx.leaveOver(`pfad:${f.id}`)}
            onDrop={(e) => {
              e.preventDefault()
              ctx.drop(f.id)
              setPfad(pfad.slice(0, i + 1))
            }}
            className={cn(
              "max-w-[9rem] truncate rounded px-1.5 py-1 transition-colors hover:bg-neutral-100 hover:text-neutral-800",
              i === pfadOrdner.length - 1 && "font-semibold text-neutral-700",
              dragOver === `pfad:${f.id}` && "bg-primary-100 text-primary-800 ring-1 ring-primary-300",
            )}
          >
            {f.name}
          </button>
        </span>
      ))}
    </div>
  )

  // ── Innerhalb eines Ordners ──────────────────────────────────────────────────
  if (hier) {
    const unterordner = childrenOf(hier.id)
    const eigene = projectsIn(hier.id)
    const leer = !unterordner.length && !eigene.length && anlegenIn === undefined
    return (
      <div className="mt-1 flex flex-col">
        <Pfadleiste />
        <div className="flex items-center justify-between px-2 pb-1">
          <button
            type="button"
            onClick={() => setPfad(pfad.slice(0, -1))}
            className="flex items-center gap-1.5 text-[11px] font-medium text-neutral-500 transition-colors hover:text-primary-700"
          >
            <CornerLeftUp className="h-3.5 w-3.5" /> Eine Ebene zurück
          </button>
          <DropdownMenu
            align="end"
            triggerLabel={`In „${hier.name}" neu anlegen`}
            trigger={
              <span
                title="Neu anlegen: Ordner oder Projekt"
                className="flex h-5 w-5 cursor-pointer items-center justify-center rounded text-neutral-400 hover:bg-neutral-200 hover:text-primary-600"
              >
                <FolderPlus className="h-3.5 w-3.5" />
              </span>
            }
          >
            <DropdownItem onClick={() => ctx.neuerOrdnerIn(null)}>
              <FolderPlus className="h-4 w-4 text-primary-600" /> Neuer Ordner
            </DropdownItem>
            <DropdownItem onClick={() => openNewProject(hier.id)}>
              <FilePlus2 className="h-4 w-4 text-neutral-500" /> Neues Projekt
            </DropdownItem>
          </DropdownMenu>
        </div>
        <div
          className="flex flex-col gap-0.5"
          style={{ marginLeft: einzugPx(pfad.length) }}
          onDragOver={(e) => {
            if (!ziehend) return
            e.preventDefault()
            ctx.enterOver("__hier__")
          }}
          onDragLeave={() => ctx.leaveOver("__hier__")}
          onDrop={(e) => {
            e.preventDefault()
            ctx.drop(hier.id)
          }}
        >
          {unterordner.map((f) => (
            <FolderRow key={f.id} f={f} anzahl={anzahlTief(f.id)} ctx={ctx} />
          ))}
          {anlegenIn === null ? (
            <NewFolderInput
              value={newName}
              onChange={setNewName}
              onCommit={commitCreate}
              onCancel={() => {
                setAnlegenIn(undefined)
                setNewName("")
              }}
            />
          ) : null}
          {eigene.map((p) => (
            <ProjectRow
              key={p.id}
              project={p}
              active={p.id === activeId}
              go={go}
              activeTab={activeTab}
              setDragId={setDragId}
              onDragEnd={ctx.endDrag}
            />
          ))}
          {leer ? (
            <p className="px-2 py-3 text-center text-[11px] text-neutral-400">
              „{hier.name}" ist leer. Mit + anlegen oder etwas hierher ziehen.
            </p>
          ) : null}
          {dragOver === "__hier__" ? (
            <div className="flex h-9 items-center justify-center rounded-md border-2 border-dashed border-primary-500 bg-primary-50 text-[11px] font-medium text-primary-700 duration-300 animate-in fade-in slide-in-from-top-2">
              {`In „${hier.name}" ablegen`}
            </div>
          ) : null}
        </div>
      </div>
    )
  }

  // ── Oberste Ebene: die zwei Zonen ────────────────────────────────────────────
  // Geteilt und Privat sind KEINE Ordner, sondern die Sichtbarkeit. Deshalb bleiben sie hier
  // nebeneinander stehen, statt zu einer Ebene zusammenzufallen: ein Ordner von der einen in
  // die andere zu ziehen SETZT die Sichtbarkeit, und das muss man sehen koennen.
  const wurzel = childrenOf(null)
  const rootProjects = projectsIn(null)
  const zonen = [
    {
      label: "Geteilt",
      privat: false,
      key: "__zone_shared__",
      folders: wurzel.filter((f) => !f.owner),
      projekte: rootProjects.filter((p) => !p.owner),
      leerText: "Noch nichts Geteiltes.",
    },
    {
      label: "Privat",
      privat: true,
      key: "__zone_private__",
      folders: wurzel.filter((f) => f.owner),
      projekte: rootProjects.filter((p) => p.owner),
      leerText: "Noch nichts Privates — mit + anlegen oder hierher ziehen.",
    },
  ]

  return (
    <div className="mt-1 flex flex-col gap-1.5">
      {zonen.map((z, i) => (
        <div key={z.key}>
          {i > 0 ? <div className="mx-2 mb-1.5 border-t border-neutral-200" /> : null}
          <div className="flex items-center justify-between px-2 pb-0.5 pt-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">{z.label}</span>
            <button
              type="button"
              onClick={() => {
                setAnlegenIn(null)
                setAnlegenPrivat(z.privat)
                setNewName("")
              }}
              title={`Ordner in „${z.label}" anlegen`}
              aria-label={`Ordner in „${z.label}" anlegen`}
              className="flex h-5 w-5 cursor-pointer items-center justify-center rounded text-neutral-400 transition-colors hover:bg-neutral-200 hover:text-primary-600"
            >
              <FolderPlus className="h-3.5 w-3.5" />
            </button>
          </div>
          <div
            onDragOver={(e) => {
              if (!ziehend) return
              e.preventDefault()
              ctx.enterOver(z.key)
            }}
            onDragLeave={() => ctx.leaveOver(z.key)}
            onDrop={(e) => {
              e.preventDefault()
              ctx.drop(null, z.privat)
            }}
            className={cn(
              "flex flex-col gap-0.5 rounded-md p-0.5",
              dragOver === z.key && "bg-primary-50",
              ziehend && "min-h-[52px]",
            )}
          >
            {z.folders.map((f) => (
              <FolderRow key={f.id} f={f} anzahl={anzahlTief(f.id)} ctx={ctx} />
            ))}
            {anlegenIn === null && anlegenPrivat === z.privat ? (
              <NewFolderInput
                value={newName}
                onChange={setNewName}
                onCommit={commitCreate}
                onCancel={() => {
                  setAnlegenIn(undefined)
                  setNewName("")
                }}
              />
            ) : null}
            {z.projekte.map((p) => (
              <ProjectRow
                key={p.id}
                project={p}
                active={p.id === activeId}
                go={go}
                activeTab={activeTab}
                setDragId={setDragId}
                onDragEnd={ctx.endDrag}
              />
            ))}
            {!z.folders.length && !z.projekte.length && !ziehend && !(anlegenIn === null && anlegenPrivat === z.privat) ? (
              <p className="px-2 py-1.5 text-[11px] text-neutral-400">{z.leerText}</p>
            ) : null}
            {dragOver === z.key ? (
              <div className="flex h-9 items-center justify-center rounded-md border-2 border-dashed border-primary-500 bg-primary-50 text-[11px] font-medium text-primary-700 duration-300 animate-in fade-in slide-in-from-top-2">
                {`Auf „${z.label}"-Ebene ablegen`}
              </div>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  )
}
