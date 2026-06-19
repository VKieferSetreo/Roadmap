// Eigenständiges, GLOBALES Admin-Layout (Max 2026-06-18): Mandanten + Debugging sind keine
// Reiter in der Projekt-App, sondern losgelöste, mandantenübergreifende Screens. Daher KEIN
// AppSidebar, KEIN Projekt-/Ordner-/News-Boot, KEIN Per-Mandant-URL-Redirect — nur Identität
// + Kontext (für die Admin-Prüfung) und eine schlanke eigene Kopfzeile.

import { useEffect } from "react"
import { Link, Navigate, Outlet, useLocation } from "react-router-dom"
import { ArrowLeft, LogOut } from "lucide-react"
import { SetreoLogo } from "@/components/shared/SetreoLogo"
import { DropdownItem, DropdownMenu } from "@/components/ui/DropdownMenu"
import { ContentErrorBoundary } from "./ContentErrorBoundary"
import { useAuthStore } from "@/store/auth"
import { useContextStore } from "@/store/context"
import { useDataSourceStore } from "@/store/datasource"
import { useSettingsStore } from "@/store/settings"
import { avatarBg, handleLogout, initialsFromEmail } from "@/lib/auth"

export function AdminLayout() {
  const fetchIdentity = useAuthStore((s) => s.fetchIdentity)
  const identity = useAuthStore((s) => s.identity)
  const detect = useDataSourceStore((s) => s.detect)
  const mode = useDataSourceStore((s) => s.mode)
  const loadContext = useContextStore((s) => s.load)
  const ctxLoaded = useContextStore((s) => s.loaded)
  const isAdmin = useContextStore((s) => s.isAdmin)
  const profile = useSettingsStore((s) => s.profile)
  const { pathname } = useLocation()

  // Schlanker Boot: nur Identität + Kontext (kein Projekt-/Ordner-/News-Load).
  useEffect(() => {
    void fetchIdentity()
    void detect().then((m) => {
      if (m === "live") void loadContext()
    })
  }, [fetchIdentity, detect, loadContext])

  if (mode === "live" && !ctxLoaded) {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-neutral-400">Lädt …</div>
    )
  }
  // Global + admin-only. Nicht-Admins (inkl. aller externen Kunden) → zurück in die App.
  if (!isAdmin) return <Navigate to="/" replace />

  const email = identity?.email ?? profile.email

  return (
    <div className="flex h-screen flex-col bg-neutral-50">
      <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b border-neutral-200/70 bg-white px-4 shadow-[0_1px_2px_0_rgba(16,24,40,0.03)] lg:px-6">
        <a href="/" className="flex items-center gap-3" aria-label="Zum Setreo-Hub">
          <SetreoLogo height={30} />
          <span className="text-neutral-300" aria-hidden>
            |
          </span>
          <span className="text-sm font-medium text-neutral-500">Verwaltung</span>
        </a>

        <div className="flex-1" />

        <Link
          to="/"
          className="flex items-center gap-1.5 rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-sm text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-primary-600"
        >
          <ArrowLeft className="h-4 w-4" /> Zur Roadmap
        </Link>

        <DropdownMenu
          triggerLabel="Profil-Menü öffnen"
          trigger={
            <span
              className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-xs font-bold text-white ring-offset-1 transition-shadow hover:ring-2 hover:ring-primary-300"
              style={{ background: avatarBg(email) }}
              title="Profil"
            >
              {initialsFromEmail(email)}
            </span>
          }
        >
          <div className="border-b border-neutral-100 px-3 py-2">
            <p className="text-xs text-neutral-400">Angemeldet als</p>
            <p className="truncate text-sm font-medium text-neutral-800">{email}</p>
          </div>
          <DropdownItem onClick={handleLogout}>
            <LogOut className="h-4 w-4 text-neutral-400" /> Abmelden
          </DropdownItem>
        </DropdownMenu>
      </header>

      <main className="min-h-0 flex-1 overflow-auto">
        <ContentErrorBoundary resetKey={pathname}>
          <Outlet />
        </ContentErrorBoundary>
      </main>
    </div>
  )
}
