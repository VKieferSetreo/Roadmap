// Nutzer-/Mandanten-Kontext (live-Modus): wer bin ich, welcher Tenant ist aktiv.
// Admins können den aktiven Tenant wechseln (X-Tenant-Header) — Projekte werden
// danach neu geladen. Normale Nutzer haben ihren Tenant serverseitig fix.

import { create } from "zustand"
import { api, type AppContext } from "@/api/roadmap"
import { setTenantHeader } from "@/api/client"
import { slugFromPath } from "@/lib/tenantUrl"
import { applyBranding } from "@/lib/branding"
import type { Tenant } from "@/types/domain"

interface ContextStore {
  loaded: boolean
  /** Kontext-Abruf ist fehlgeschlagen (Netz/Server) — NICHT mit „kein Mandant" verwechseln (T-479). */
  loadFailed: boolean
  email: string
  isAdmin: boolean
  /** Mandanten-eigener Admin (tenant_members.role='admin') — darf eigene Nutzer/Seats verwalten (T-147). */
  isTenantAdmin: boolean
  /** Login über setreo-auth-extern (Kunden-Gateway). */
  extern: boolean
  tenant: AppContext["tenant"]
  /** alle Mandanten (nur Admin). */
  tenants: Tenant[]

  load: () => Promise<void>
  /** Admin: aktiven Mandanten wechseln (lädt Kontext neu, Caller lädt Projekte neu). */
  switchTenant: (slug: string) => Promise<void>
  /** Mandanten-Liste nach Admin-Änderungen aktualisieren. */
  refreshTenants: () => Promise<void>
}

export const useContextStore = create<ContextStore>((set) => ({
  loaded: false,
  loadFailed: false,
  email: "",
  isAdmin: false,
  isTenantAdmin: false,
  extern: false,
  tenant: null,
  tenants: [],

  load: async () => {
    try {
      // Per-Mandant-URL: ein Slug in der URL treibt den aktiven Mandanten (Admin: via X-Tenant;
      // Nicht-Admin: vom Backend ignoriert, dort zählt die Mitgliedschaft). So funktionieren
      // Deeplinks/Lesezeichen auf /roadmap/<slug>.
      const urlSlug = slugFromPath()
      if (urlSlug) setTenantHeader(urlSlug)
      const ctx = await api.context()
      set({
        loaded: true,
        loadFailed: false,
        email: ctx.email,
        isAdmin: ctx.isAdmin,
        isTenantAdmin: ctx.isTenantAdmin === true,
        extern: ctx.extern === true,
        tenant: ctx.tenant,
        tenants: ctx.tenants ?? [],
      })
      if (ctx.isAdmin && ctx.tenant) setTenantHeader(ctx.tenant.slug)
      applyBranding(ctx.tenant?.branding) // White-Label: Akzentfarbe + Tab-Titel des Mandanten anwenden
    } catch {
      // T-479: Abruf gescheitert ≠ „kein Mandant". Flag setzen, damit das AppLayout
      // einen Wiederholen-Screen zeigt statt fälschlich „Kein Mandant zugeordnet".
      set({ loaded: true, loadFailed: true })
    }
  },

  switchTenant: async (slug) => {
    setTenantHeader(slug)
    const ctx = await api.context()
    set({ tenant: ctx.tenant, tenants: ctx.tenants ?? [] })
    applyBranding(ctx.tenant?.branding)
  },

  refreshTenants: async () => {
    const tenants = await api.listTenants()
    set({ tenants })
  },
}))
