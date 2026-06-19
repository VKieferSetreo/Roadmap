// Setreo-Corporate-Design-Header (Chrome aus dem setreo-intern-hub, in React).
// Logo → immer zum Hub; rechts echte Anmelde-Identität (SSO) + Abmelden; mobil Menü-Button.
// Setreo-Admins sehen zusätzlich den Mandanten-Switcher (X-Tenant-Kontext).

import { Link } from "react-router-dom"
import { Building2, LogOut, Menu } from "lucide-react"
import { DropdownItem, DropdownMenu } from "@/components/ui/DropdownMenu"
import { NotificationBell } from "@/components/notifications/NotificationBell"
import { BugReportButton } from "@/components/bugreport/BugReportButton"
import { HeaderSync } from "./HeaderSync"
import { SetreoLogo } from "@/components/shared/SetreoLogo"
import { setTenantHeader } from "@/api/client"
import { BUILD_BASE, withSlug } from "@/lib/tenantUrl"
import { useSettingsStore } from "@/store/settings"
import { useAuthStore } from "@/store/auth"
import { useContextStore } from "@/store/context"
import { useDataSourceStore } from "@/store/datasource"
import { avatarBg, handleLogout, initialsFromEmail } from "@/lib/auth"

export function SetreoHeader({ onMenuClick }: { onMenuClick: () => void }) {
  const profile = useSettingsStore((s) => s.profile)
  const identity = useAuthStore((s) => s.identity)
  const isAdmin = useContextStore((s) => s.isAdmin)
  const extern = useContextStore((s) => s.extern)
  const tenant = useContextStore((s) => s.tenant)
  const tenants = useContextStore((s) => s.tenants)
  const mode = useDataSourceStore((s) => s.mode)
  // Glocke nur live + mit Mandant (Nachrichten sind mandantenbezogen)
  const showBell = mode === "live" && (isAdmin || Boolean(tenant))
  // Echte Anmelde-Identität (SSO vom Hub) hat Vorrang vor dem lokalen Platzhalter.
  const email = identity?.email ?? profile.email
  const init = initialsFromEmail(email)

  // Mandantenwechsel: Header persistieren (überlebt Reload via localStorage) und die
  // Seite komplett neu laden — so fetchen alle Komponenten (Projekte, Datenbank, Karte)
  // sauber unter dem neuen Mandanten, ohne Stale-State.
  const onSwitchTenant = (slug: string) => {
    if (!slug || slug === tenant?.slug) return
    setTenantHeader(slug)
    // Per-Mandant-URL (Prod): zur Slug-URL des neuen Mandanten navigieren, damit URL, X-Tenant
    // und Daten konsistent bleiben (ein bloßes reload an der alten Slug-URL würde X-Tenant beim
    // nächsten Kontext-Load wieder überschreiben). Dev (ohne Build-Base): einfach neu laden.
    if (BUILD_BASE) window.location.assign(withSlug(slug))
    else window.location.reload()
  }

  return (
    <header className="sticky top-0 z-30 flex h-20 shrink-0 items-center gap-3 border-b border-neutral-200/70 bg-white px-4 shadow-[0_1px_2px_0_rgba(16,24,40,0.03)] lg:px-6">
      <button
        type="button"
        onClick={onMenuClick}
        aria-label="Menü öffnen"
        className="-ml-1 rounded-md p-2 text-neutral-600 hover:bg-neutral-100 lg:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Logo-Ziel: externe Kunden bleiben in der App (Projektübersicht) — sie haben
          keinen Zugriff aufs Hub-Admin-Panel (setreo-cloud.com/). Interne/Admins gehen
          zum Setreo-Hub (Domain-Root, am /roadmap-Basename vorbei). */}
      {extern ? (
        <Link to="/" className="flex items-center gap-3" aria-label="Zur Projektübersicht">
          <SetreoLogo height={32} />
          <span className="text-neutral-300" aria-hidden>
            |
          </span>
          <span className="text-sm font-medium text-neutral-500">Roadmap</span>
        </Link>
      ) : (
        <a href="/" className="flex items-center gap-3" aria-label="Zurück zum Setreo-Hub">
          <SetreoLogo height={32} />
          <span className="text-neutral-300" aria-hidden>
            |
          </span>
          <span className="text-sm font-medium text-neutral-500">Roadmap</span>
        </a>
      )}

      <div className="flex-1" />

      {/* Globaler „Daten aktualisieren"-Sync — links neben der Mandanten-Auswahl */}
      {mode === "live" ? <HeaderSync /> : null}

      {/* Mandanten-Switcher — nur Setreo-Admin im Live-Modus */}
      {isAdmin && tenants.length > 0 ? (
        <div className="mr-1 flex items-center gap-1.5">
          <Building2 className="h-4 w-4 text-neutral-400" aria-hidden />
          <select
            value={tenant?.slug ?? ""}
            onChange={(e) => onSwitchTenant(e.target.value)}
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

      {/* Problem melden (Bug-Report) — Live-Modus, jeder eingeloggte Nutzer */}
      {mode === "live" ? <BugReportButton /> : null}

      {/* Glocke / Nachrichtenzentrum */}
      {showBell ? <NotificationBell /> : null}

      {/* Profil-Menü: Avatar klicken → E-Mail + Abmelden */}
      <DropdownMenu
        triggerLabel="Profil-Menü öffnen"
        trigger={
          <span
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-xs font-bold text-white ring-offset-1 transition-shadow hover:ring-2 hover:ring-primary-300"
            style={{ background: avatarBg(email) }}
            title="Profil"
          >
            {init}
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
  )
}
