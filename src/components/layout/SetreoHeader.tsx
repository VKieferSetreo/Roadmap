// Setreo-Corporate-Design-Header (Chrome aus dem setreo-intern-hub, in React).
// Grüne Marke + "SETREO | Roadmap", rechts Nutzer + Abmelden, mobil Menü-Button.

import { Link } from "react-router-dom"
import { LogOut, Menu } from "lucide-react"
import { toast } from "sonner"
import { useSettingsStore } from "@/store/settings"

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export function SetreoHeader({ onMenuClick }: { onMenuClick: () => void }) {
  const profile = useSettingsStore((s) => s.profile)

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b border-neutral-100 bg-white px-4 shadow-[0_1px_2px_0_rgba(0,0,0,0.05)] lg:px-6">
      <button
        type="button"
        onClick={onMenuClick}
        aria-label="Menü öffnen"
        className="-ml-1 rounded-md p-2 text-neutral-600 hover:bg-neutral-100 lg:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>

      <Link to="/" className="flex items-center gap-3" aria-label="Setreo Roadmap — Startseite">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-500">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="white"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M3 9.5 12 3l9 6.5" />
            <path d="M5 8.8V21h14V8.8" />
            <path d="M10 21v-6h4v6" />
          </svg>
        </span>
        <span className="text-lg font-black uppercase leading-none tracking-[0.1em] text-neutral-800">
          SETREO
        </span>
        <span className="text-neutral-300" aria-hidden>
          |
        </span>
        <span className="text-sm font-medium text-neutral-500">Roadmap</span>
      </Link>

      <div className="flex-1" />

      <div className="flex items-center gap-3">
        <span className="hidden text-[13px] text-neutral-500 sm:inline">{profile.email}</span>
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-100 text-xs font-bold text-primary-700">
          {initials(profile.name)}
        </span>
        <button
          type="button"
          onClick={() => toast.info("Abmelden ist im Frontend-Demo deaktiviert.")}
          className="flex items-center gap-1.5 text-sm text-neutral-400 transition-colors hover:text-neutral-600"
        >
          <LogOut className="h-4 w-4" />
          <span className="hidden sm:inline">Abmelden</span>
        </button>
      </div>
    </header>
  )
}
