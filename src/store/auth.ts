// Echte Anmelde-Identität vom setreo-auth-Gateway (/auth/me, gleiche Session wie der Hub).
// Im Hub-Deploy liefert das den eingeloggten User (SSO); lokal (Dev) gibt es kein Gateway → null.

import { create } from "zustand"

export interface Identity {
  userId: string
  email: string
  roles: string[]
}

interface AuthStore {
  identity: Identity | null
  loaded: boolean
  fetchIdentity: () => Promise<void>
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  identity: null,
  loaded: false,
  fetchIdentity: async () => {
    if (get().loaded) return
    try {
      const res = await fetch("/auth/me", {
        credentials: "same-origin",
        headers: { Accept: "application/json" },
        cache: "no-store",
      })
      if (!res.ok) {
        set({ identity: null, loaded: true })
        return
      }
      const data = (await res.json()) as {
        authenticated?: boolean
        user?: string
        email?: string
        roles?: string[]
      }
      if (data.authenticated && data.email) {
        set({
          identity: { userId: data.user ?? "", email: data.email, roles: data.roles ?? [] },
          loaded: true,
        })
      } else {
        set({ identity: null, loaded: true })
      }
    } catch {
      set({ identity: null, loaded: true })
    }
  },
}))
