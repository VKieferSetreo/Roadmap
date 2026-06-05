// Linke Navigation im Civion-Stil: Home · PROJEKTE (aktives Projekt klappt mit
// Modul-Reitern auf) · unten Datenbank/Einstellungen/Abmelden.
// Desktop: permanent. Mobil: Overlay-Drawer.

import { useLocation, useNavigate } from "react-router-dom"
import { toast } from "sonner"
import {
  Database,
  Folder,
  Home,
  LogOut,
  Plus,
  Settings,
  X,
  type LucideIcon,
} from "lucide-react"
import { useProjectStore } from "@/store/projects"
import { useUiStore } from "@/store/ui"
import { cn } from "@/lib/cn"

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
          ? "bg-primary-50 font-medium text-primary-700 before:absolute before:left-0 before:top-1.5 before:bottom-1.5 before:w-0.5 before:rounded-full before:bg-primary-600"
          : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900",
      )}
      aria-current={active ? "page" : undefined}
    >
      <Icon className={cn("h-4 w-4 shrink-0", active ? "text-primary-600" : "text-neutral-400")} />
      <span className="truncate">{label}</span>
    </button>
  )
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const projects = useProjectStore((s) => s.projects)
  const openNewProject = useUiStore((s) => s.openNewProject)

  const m = pathname.match(/^\/projekte\/([^/]+)(?:\/([^/]+))?/)
  const activeId = m?.[1]
  const activeTab = m?.[2] ?? "anlage"
  const onHome = pathname === "/"
  const onDb = pathname.startsWith("/datenbank")
  const onSettings = pathname.startsWith("/einstellungen")

  const go = (path: string) => {
    navigate(path)
    onNavigate?.()
  }

  const sorted = [...projects].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))

  return (
    <div className="flex h-full flex-col">
      <nav className="flex-1 overflow-y-auto p-3">
        <NavRow icon={Home} label="Home" active={onHome} onClick={() => go("/")} />

        <div className="mt-5 flex items-center justify-between pl-3 pr-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
            Projekte
          </span>
          <button
            onClick={() => {
              openNewProject()
              onNavigate?.()
            }}
            aria-label="Neues Projekt"
            className="rounded-md p-1 text-neutral-400 hover:bg-neutral-100 hover:text-primary-600"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-1 flex flex-col gap-0.5">
          {sorted.length === 0 ? (
            <p className="px-3 py-2 text-xs text-neutral-400">Noch keine Projekte.</p>
          ) : (
            sorted.map((p) => {
              const isActive = p.id === activeId
              return (
                <NavRow
                  key={p.id}
                  icon={Folder}
                  label={p.name}
                  active={isActive}
                  onClick={() => go(`/projekte/${p.id}/${isActive ? activeTab : "anlage"}`)}
                />
              )
            })
          )}
        </div>
      </nav>

      <div className="border-t border-neutral-100 p-3">
        <NavRow icon={Database} label="Datenbank" active={onDb} onClick={() => go("/datenbank")} />
        <NavRow icon={Settings} label="Einstellungen" active={onSettings} onClick={() => go("/einstellungen")} />
        <NavRow
          icon={LogOut}
          label="Abmelden"
          onClick={() => {
            toast.info("Abmelden ist im Frontend-Demo deaktiviert.")
            onNavigate?.()
          }}
        />
      </div>
    </div>
  )
}

export function AppSidebar({ mobileOpen, onClose }: { mobileOpen: boolean; onClose: () => void }) {
  return (
    <>
      {/* Desktop */}
      <aside
        className="hidden w-72 shrink-0 border-r border-neutral-200 bg-white lg:block"
        aria-label="Hauptnavigation"
      >
        <SidebarContent />
      </aside>

      {/* Mobile-Drawer */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-neutral-950/40 animate-fade-in" onClick={onClose} aria-hidden />
          <div className="absolute left-0 top-0 h-full w-72 max-w-[85%] border-r border-neutral-200 bg-white shadow-2xl animate-slide-in-right">
            <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-3">
              <span className="text-sm font-semibold text-neutral-700">Navigation</span>
              <button onClick={onClose} aria-label="Schließen" className="rounded-md p-1.5 text-neutral-500 hover:bg-neutral-100">
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
