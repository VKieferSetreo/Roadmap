// Setreo-Corporate-Design-Header (Chrome aus dem setreo-intern-hub, in React).
// Logo → immer zum Hub; rechts echte Anmelde-Identität (SSO) + Abmelden; mobil Menü-Button.

import { LogOut, Menu } from "lucide-react"
import { SetreoLogo } from "@/components/shared/SetreoLogo"
import { useSettingsStore } from "@/store/settings"
import { useAuthStore } from "@/store/auth"
import { handleLogout, initialsFromEmail } from "@/lib/auth"

export function SetreoHeader({ onMenuClick }: { onMenuClick: () => void }) {
  const profile = useSettingsStore((s) => s.profile)
  const identity = useAuthStore((s) => s.identity)
  // Echte Anmelde-Identität (SSO vom Hub) hat Vorrang vor dem lokalen Platzhalter.
  const email = identity?.email ?? profile.email
  const init = initialsFromEmail(email)

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
