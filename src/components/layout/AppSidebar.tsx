// Linke Navigation im Civion-Stil: Home · PROJEKTE (aktives Projekt klappt mit
// Modul-Reitern auf) · unten Datenbank/Einstellungen/Abmelden.
// Desktop: permanent. Mobil: Overlay-Drawer.

import { useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import {
  Bug,
  Building2,
  Database,
  Folder,
  Home,
  LogOut,
  Plus,
  Search,
  Settings,
  X,
  type LucideIcon,
} from "lucide-react"
import { useProjectStore } from "@/store/projects"
import { useUiStore } from "@/store/ui"
import { useContextStore } from "@/store/context"
import { ProjectMenu } from "@/components/project/ProjectMenu"
import { CreatorAvatar } from "@/components/project/CreatorAvatar"
import { handleLogout } from "@/lib/auth"
import { cn } from "@/lib/cn"
import type { Project } from "@/types/domain"

interface NavRowProps {
  icon: LucideIcon
  label: string
  active?: boolean
  onClick: () => void
}

function NavRow({ icon: Icon, label, active, onClick }: NavRowProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "relative flex w-full items-center gap-2.5 rounded-md py-2 pl-3 pr-3 text-sm transition-colors",
        active
          ? "bg-primary-50 font-medium text-primary-700 before:absolute before:bottom-1.5 before:left-0 before:top-1.5 before:w-0.5 before:rounded-full before:bg-primary-600"
          : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900",
      )}
      aria-current={active ? "page" : undefined}
    >
      <Icon className={cn("h-4 w-4 shrink-0", active ? "text-primary-600" : "text-neutral-400")} />
      <span className="truncate">{label}</span>
    </button>
  )
}

// Projekt-Zeile mit eigenem Drei-Punkte-Menü (Umbenennen/Archivieren/Löschen) — wie auf der
// Home-Kartenansicht. Nav-Button und Menü sind Geschwister (kein Button-im-Button), das ⋮
// erscheint auf Hover/Fokus und bleibt sichtbar, solange die Zeile aktiv ist.
function ProjectNavRow({
  project,
  active,
  onClick,
}: {
  project: Project
  active?: boolean
  onClick: () => void
}) {
  return (
    <div
      className={cn(
        "group relative flex items-center rounded-md transition-colors",
        active
          ? "bg-primary-50 before:absolute before:bottom-1.5 before:left-0 before:top-1.5 before:w-0.5 before:rounded-full before:bg-primary-600"
          : "hover:bg-neutral-100",
      )}
    >
      <button
        onClick={onClick}
        className={cn(
          "flex min-w-0 flex-1 items-center gap-2.5 rounded-md py-2 pl-3 pr-1 text-sm transition-colors",
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
          // aktiv → immer sichtbar; sonst auf Hover/Fokus einblenden. Im Mobile-Drawer (kein
          // Hover) per max-lg dauerhaft sichtbar, damit das Menü auf Touch erreichbar bleibt.
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

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const projects = useProjectStore((s) => s.projects ?? [])
  const openNewProject = useUiStore((s) => s.openNewProject)
  const isAdmin = useContextStore((s) => s.isAdmin)
  const tenant = useContextStore((s) => s.tenant)
  // Admin-Werkzeuge (Mandanten/Debugging) NUR im eigenen Setreo-Kontext zeigen. Wechselt der
  // Admin per Dropdown auf einen Kunden-Mandanten, sieht er dessen 1:1-Ansicht (ohne diese
  // Reiter) — das Dropdown bleibt oben zum Zurückwechseln.
  const adminKontext = isAdmin && (tenant?.slug ?? "setreo") === "setreo"

  const m = pathname.match(/^\/projekte\/([^/]+)(?:\/([^/]+))?/)
  const activeId = m?.[1]
  const activeTab = m?.[2] ?? "route"
  const onHome = pathname === "/"
  const onDb = pathname.startsWith("/datenbank")
  const onTenants = pathname.startsWith("/mandanten")
  const onDebug = pathname.startsWith("/debug")
  const onSettings = pathname.startsWith("/einstellungen")

  const go = (path: string) => {
    navigate(path)
    onNavigate?.()
  }

  const [suche, setSuche] = useState("")
  const aktive = [...projects]
    .filter((p) => !p.archiviertAm)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  const q = suche.trim().toLowerCase()
  const sorted = q
    ? aktive.filter(
        (p) => p.name.toLowerCase().includes(q) || (p.erstelltVon ?? "").toLowerCase().includes(q),
      )
    : aktive

  return (
    <div className="flex h-full flex-col">
      <nav className="flex-1 overflow-y-auto p-3">
        <NavRow icon={Home} label="Home" active={onHome} onClick={() => go("/")} />

        <div className="mb-1.5 mt-5 pl-3 pr-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
            Projekte
          </span>
        </div>

        {/* Suchleiste + Plus-Button rechts daneben */}
        <div className="mb-1.5 flex items-center gap-1.5 px-3">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-400" />
            <input
              type="text"
              value={suche}
              onChange={(e) => setSuche(e.target.value)}
              placeholder="Projekt suchen …"
              aria-label="Projekt suchen"
              className="w-full rounded-md border border-neutral-200 bg-white py-1.5 pl-7 pr-2 text-sm text-neutral-800 placeholder:text-neutral-400 focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-400"
            />
          </div>
          <button
            onClick={() => {
              openNewProject()
              onNavigate?.()
            }}
            aria-label="Neues Projekt"
            className="shrink-0 rounded-md border border-neutral-200 bg-white p-1.5 text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-primary-600"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-1 flex flex-col gap-0.5">
          {aktive.length === 0 ? (
            <div className="mt-6 flex flex-col items-center px-3 text-center">
              <Folder className="h-6 w-6 text-neutral-300" />
              <p className="mt-3 text-sm text-neutral-500">Noch keine Projekte.</p>
            </div>
          ) : sorted.length === 0 ? (
            <p className="px-3 py-4 text-center text-xs text-neutral-500">
              Kein Projekt für „{suche.trim()}".
            </p>
          ) : (
            sorted.map((p) => {
              const isActive = p.id === activeId
              return (
                <ProjectNavRow
                  key={p.id}
                  project={p}
                  active={isActive}
                  onClick={() => go(`/projekte/${p.id}/${isActive ? activeTab : "route"}`)}
                />
              )
            })
          )}
        </div>
      </nav>

      <div className="border-t border-neutral-100 p-3">
        {/* Bei leerer Projektliste: „Neues Projekt" hier unten (über Datenbank) statt oben. */}
        {sorted.length === 0 ? (
          <button
            onClick={() => {
              openNewProject()
              onNavigate?.()
            }}
            className="mb-2 w-full rounded-lg bg-primary-600 py-2.5 text-sm font-bold text-white transition hover:bg-primary-700"
          >
            + Neues Projekt
          </button>
        ) : null}
        <NavRow icon={Database} label="Datenbank" active={onDb} onClick={() => go("/datenbank")} />
        {adminKontext ? (
          <NavRow
            icon={Building2}
            label="Mandanten"
            active={onTenants}
            onClick={() => go("/mandanten")}
          />
        ) : null}
        {adminKontext ? (
          <NavRow icon={Bug} label="Debugging" active={onDebug} onClick={() => go("/debug")} />
        ) : null}
        <NavRow
          icon={Settings}
          label="Einstellungen"
          active={onSettings}
          onClick={() => go("/einstellungen")}
        />
        <NavRow
          icon={LogOut}
          label="Abmelden"
          onClick={() => {
            onNavigate?.()
            handleLogout()
          }}
        />
      </div>
    </div>
  )
}

export function AppSidebar({
  open,
  onToggle,
  showEdgeToggle = true,
  mobileOpen,
  onClose,
}: {
  open: boolean
  onToggle: () => void
  /** Seitlichen Kanten-Griff zeigen? Auf der Karte aus (Toggle sitzt dort im Overlay). */
  showEdgeToggle?: boolean
  mobileOpen: boolean
  onClose: () => void
}) {
  return (
    <>
      {/* Desktop — links angedockt, nativ offen, einklappbar via Seiten-Chevron
          (Kollision-Format). Header/Footer bleiben left-bound (sind Geschwister). */}
      <aside
        className={cn(
          "relative hidden shrink-0 border-r border-neutral-200 bg-white transition-[width] duration-200 ease-in-out lg:block",
          open ? "w-72" : "w-0",
        )}
        aria-label="Hauptnavigation"
      >
        <div
          className={cn(
            "h-full w-72 overflow-hidden transition-opacity duration-200",
            open ? "opacity-100" : "pointer-events-none opacity-0",
          )}
        >
          <SidebarContent />
        </div>

        {/* Vertikaler Griff — sichtbar (auch eingeklappt). Auf der Karte ausgeblendet:
            dort liegt der Toggle im Overlay unter dem "Strecken"-Kasten. */}
        {showEdgeToggle ? (
          <button
            onClick={onToggle}
            aria-label={open ? "Sidebar einklappen" : "Sidebar ausklappen"}
            aria-expanded={open}
            className="absolute -right-8 top-1/2 z-[1100] hidden h-14 w-8 -translate-y-1/2 items-center justify-center rounded-r-lg border border-l-0 border-neutral-200 bg-white text-base text-neutral-500 shadow-sm transition-colors hover:text-primary-600 lg:flex"
          >
            {open ? "«" : "»"}
          </button>
        ) : null}
      </aside>

      {/* Mobile-Drawer */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 animate-fade-in bg-neutral-950/40"
            onClick={onClose}
            aria-hidden
          />
          <div className="absolute left-0 top-0 h-full w-72 max-w-[85%] animate-slide-in-right border-r border-neutral-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-3">
              <span className="text-sm font-semibold text-neutral-700">Navigation</span>
              <button
                onClick={onClose}
                aria-label="Schließen"
                className="rounded-md p-1.5 text-neutral-500 hover:bg-neutral-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="h-[calc(100%-49px)]">
              <SidebarContent onNavigate={onClose} />
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
