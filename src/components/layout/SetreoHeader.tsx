// Setreo-Corporate-Design-Header (Chrome aus dem setreo-intern-hub, in React).
// Logo → immer zum Hub; rechts echte Anmelde-Identität (SSO) + Abmelden; mobil Menü-Button.
// Setreo-Admins sehen zusätzlich den Mandanten-Switcher (X-Tenant-Kontext).

import { Building2, LogOut, Menu } from "lucide-react"
import { toast } from "sonner"
import { SetreoLogo } from "@/components/shared/SetreoLogo"
import { useSettingsStore } from "@/store/settings"
import { useAuthStore } from "@/store/auth"
import { useContextStore } from "@/store/context"
import { useProjectStore } from "@/store/projects"
import { handleLogout, initialsFromEmail } from "@/lib/auth"

export function SetreoHeader({ onMenuClick }: { onMenuClick: () => void }) {
  const profile = useSettingsStore((s) => s.profile)
  const identity = useAuthStore((s) => s.identity)
  const isAdmin = useContextStore((s) => s.isAdmin)
  const tenant = useContextStore((s) => s.tenant)
  const tenants = useContextStore((s) => s.tenants)
  const switchTenant = useContextStore((s) => s.switchTenant)
  const loadProjects = useProjectStore((s) => s.loadProjects)
  // Echte Anmelde-Identität (SSO vom Hub) hat Vorrang vor dem lokalen Platzhalter.
  const email = identity?.email ?? profile.email
  const init = initialsFromEmail(email)

  const onSwitchTenant = async (slug: string) => {
    try {
      await switchTenant(slug)
      await loadProjects()
    } catch {
      toast.error("Mandant konnte nicht gewechselt werden.")
    }
  }

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b border-neutral-200/80 bg-white px-4 shadow-[0_1px_2px_0_rgba(16,24,40,0.04)] lg:px-6">
      <button
        type="button"
        onClick={onMenuClick}
        aria-label="Menü öffnen"
        className="-ml-1 rounded-md p-2 text-neutral-600 hover:bg-neutral-100 lg:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Logo → immer zurück zum Setreo-Hub (absoluter Domain-Root, am /roadmap-Basename vorbei). */}
      <a href="/" className="flex items-center gap-3" aria-label="Zurück zum Setreo-Hub">
        <SetreoLogo height={32} />
        <span className="text-neutral-300" aria-hidden>
          |
        </span>
        <span className="text-sm font-medium text-neutral-500">Roadmap</span>
      </a>

      <div className="flex-1" />

      {/* Mandanten-Switcher — nur Setreo-Admin im Live-Modus */}
      {isAdmin && tenants.length > 0 ? (
        <div className="mr-1 flex items-center gap-1.5">
          <Building2 className="h-4 w-4 text-neutral-400" aria-hidden />
          <select
            value={tenant?.slug ?? ""}
            onChange={(e) => void onSwitchTenant(e.target.value)}
            aria-label="Mandant wählen"
            className="h-8 cursor-pointer rounded-md border border-neutral-200 bg-white px-2 text-sm text-neutral-700 transition-colors hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
          >
            {tenants.map((t) => (
              <option key={t.id} value={t.slug}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <div className="flex items-center gap-3">
        <span className="hidden text-[13px] text-neutral-500 sm:inline">{email}</span>
        <span
          className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-100 text-xs font-bold text-primary-700"
          title={email}
        >
          {init}
        </span>
        <button
          type="button"
          onClick={handleLogout}
          className="flex items-center gap-1.5 text-sm text-neutral-400 transition-colors hover:text-neutral-600"
        >
          <LogOut className="h-4 w-4" />
          <span className="hidden sm:inline">Abmelden</span>
        </button>
      </div>
    </header>
  )
}
