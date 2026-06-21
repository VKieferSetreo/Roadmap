// Linke Navigation im Civion-Stil: Home · PROJEKTE (aktives Projekt klappt mit
// Modul-Reitern auf) · unten Datenbank/Einstellungen/Abmelden.
// Desktop: permanent. Mobil: Overlay-Drawer.

import { useRef, useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import {
  Database,
  FilePlus,
  FolderPlus,
  Home,
  LogOut,
  Newspaper,
  Plus,
  Search,
  Settings,
  Users,
  X,
  type LucideIcon,
} from "lucide-react"
import { useProjectStore } from "@/store/projects"
import { useUiStore } from "@/store/ui"
import { useSettingsStore } from "@/store/settings"
import { useNewsStore } from "@/store/news"
import { useContextStore } from "@/store/context"
import { ProjectTree } from "@/components/layout/ProjectTree"
import { DropdownItem, DropdownMenu } from "@/components/ui/DropdownMenu"
import { handleLogout } from "@/lib/auth"
import { useSourceHealth } from "@/lib/sourceHealth"
import { cn } from "@/lib/cn"

interface NavRowProps {
  icon: LucideIcon
  label: string
  active?: boolean
  onClick: () => void
  /** Warn-Indikator (rotes „!") — z.B. Datenquellen nicht erreichbar. */
  warn?: boolean
  warnTitle?: string
  /** Roter Zähler-Punkt (ungelesene News). 0/undefined = aus. */
  badge?: number
}

function NavRow({ icon: Icon, label, active, onClick, warn, warnTitle, badge }: NavRowProps) {
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
      {warn ? (
        <span
          title={warnTitle}
          aria-label={warnTitle}
          className="ml-auto flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-severity-kritisch text-[10px] font-bold leading-none text-white"
        >
          !
        </span>
      ) : badge && badge > 0 ? (
        <span
          aria-label={`${badge} ungelesene News`}
          className="ml-auto flex h-4 min-w-[16px] shrink-0 items-center justify-center rounded-full bg-severity-kritisch px-1 text-[10px] font-bold leading-none text-white"
        >
          {badge > 99 ? "99+" : badge}
        </span>
      ) : null}
    </button>
  )
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const projects = useProjectStore((s) => s.projects ?? [])
  const openNewProject = useUiStore((s) => s.openNewProject)
  const requestNewFolder = useUiStore((s) => s.requestNewFolder)
  // Ungelesene News (reaktiv über news + seenAt) → roter Zähler am News-Nav.
  const unreadNews = useNewsStore((s) =>
    s.seenAt === null ? s.news.length : s.news.filter((n) => n.publishedAt > s.seenAt!).length,
  )
  // Warn-„!" an „Datenbank", wenn beim letzten automatischen Abruf (3×/Tag) Quellen unerreichbar waren.
  const { unreachable } = useSourceHealth()
  // Tenant-Admin (T-147): eigener Nutzerverwaltungs-Eintrag. Globaler Setreo-Admin nutzt /mandanten.
  const isAdmin = useContextStore((s) => s.isAdmin)
  const isTenantAdmin = useContextStore((s) => s.isTenantAdmin)

  const m = pathname.match(/^\/projekte\/([^/]+)(?:\/([^/]+))?/)
  const activeId = m?.[1]
  const activeTab = m?.[2] ?? "route"
  const onHome = pathname === "/"
  const onDb = pathname.startsWith("/datenbank")
  const onNews = pathname.startsWith("/news")
  const onSettings = pathname.startsWith("/einstellungen")
  const onUsers = pathname.startsWith("/nutzer")

  const go = (path: string) => {
    navigate(path)
    onNavigate?.()
  }

  const [suche, setSuche] = useState("")
  const aktive = projects.filter((p) => !p.archiviertAm)

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
          <DropdownMenu
            triggerLabel="Hinzufügen"
            trigger={
              <span
                title="Hinzufügen"
                className="flex h-[34px] w-[34px] shrink-0 cursor-pointer items-center justify-center rounded-md border border-neutral-200 bg-white text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-primary-600"
              >
                <Plus className="h-4 w-4" />
              </span>
            }
          >
            <DropdownItem
              onClick={() => {
                openNewProject()
                onNavigate?.()
              }}
            >
              <FilePlus className="h-4 w-4 text-neutral-400" /> Projekt
            </DropdownItem>
            <DropdownItem onClick={() => requestNewFolder()}>
              <FolderPlus className="h-4 w-4 text-neutral-400" /> Ordner
            </DropdownItem>
          </DropdownMenu>
        </div>

        <ProjectTree query={suche} activeId={activeId} activeTab={activeTab} go={go} />
      </nav>

      <div className="border-t border-neutral-100 p-3">
        {/* Bei leerer Projektliste: „Neues Projekt" hier unten (über Datenbank) statt oben. */}
        {aktive.length === 0 ? (
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
        <NavRow
          icon={Database}
          label="Datenbank"
          active={onDb}
          onClick={() => go("/datenbank")}
          warn={unreachable > 0}
          warnTitle={
            unreachable > 0
              ? `${unreachable} Datenquelle${unreachable === 1 ? "" : "n"} mit Fehler beim letzten Abruf`
              : undefined
          }
        />
        {/* Mandanten + Debugging sind KEINE Reiter mehr (Max 2026-06-18): eigene Admin-Seiten,
            nur intern + admin erreichbar (setreo-intern.com/roadmap/mandanten bzw. /debugging).
            Navigation folgt über das /slider-Admin-Menü. Routen bleiben self-guarded (!isAdmin → "/"). */}
        {/* Tenant-Admin (kein globaler Setreo-Admin): eigene Nutzerverwaltung (T-147). */}
        {isTenantAdmin && !isAdmin ? (
          <NavRow icon={Users} label="Nutzer verwalten" active={onUsers} onClick={() => go("/nutzer")} />
        ) : null}
        <NavRow icon={Newspaper} label="News" active={onNews} onClick={() => go("/news")} badge={unreadNews} />
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
  const sidebarWidth = useSettingsStore((s) => s.sidebarWidth)
  const setSidebarWidth = useSettingsStore((s) => s.setSidebarWidth)
  const [resizing, setResizing] = useState(false)
  const widthRef = useRef(sidebarWidth)
  widthRef.current = sidebarWidth

  // Breite per Kanten-Griff ziehen (T-177). Globale Pointer-Listener bis Loslassen.
  const onResizeStart = (e: React.PointerEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startW = widthRef.current
    setResizing(true)
    const move = (ev: PointerEvent) => setSidebarWidth(startW + (ev.clientX - startX))
    const up = () => {
      setResizing(false)
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
    }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
  }

  return (
    <>
      {/* Desktop — links angedockt, nativ offen, einklappbar via Seiten-Chevron
          (Kollision-Format). Breite resizable (T-177). */}
      <aside
        className={cn(
          "relative hidden shrink-0 border-r border-neutral-200 bg-white lg:block",
          !resizing && "transition-[width] duration-200 ease-in-out",
        )}
        style={{ width: open ? sidebarWidth : 0 }}
        aria-label="Hauptnavigation"
      >
        <div
          className={cn(
            "h-full overflow-hidden transition-opacity duration-200",
            open ? "opacity-100" : "pointer-events-none opacity-0",
          )}
          style={{ width: sidebarWidth }}
        >
          <SidebarContent />
        </div>

        {/* Resize-Griff an der rechten Kante (nur wenn offen). */}
        {open ? (
          <div
            onPointerDown={onResizeStart}
            role="separator"
            aria-orientation="vertical"
            aria-label="Sidebar-Breite ändern"
            title="Breite ziehen"
            className="absolute -right-1 top-0 z-[1100] hidden h-full w-2 cursor-col-resize hover:bg-primary-200/50 lg:block"
          />
        ) : null}

        {/* Vertikaler Griff — sichtbar (auch eingeklappt). Auf der Karte ausgeblendet:
            dort liegt der Toggle im Overlay unter dem "Strecken"-Kasten. */}
        {showEdgeToggle ? (
          <button
            onClick={onToggle}
            aria-label={open ? "Sidebar einklappen" : "Sidebar ausklappen"}
            aria-expanded={open}
            className="absolute -right-8 top-1/2 z-[1200] hidden h-14 w-8 -translate-y-1/2 items-center justify-center rounded-r-lg border border-l-0 border-neutral-200 bg-white text-base text-neutral-500 shadow-sm transition-colors hover:text-primary-600 lg:flex"
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
