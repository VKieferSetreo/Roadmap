// Persistente Nutzer-Einstellungen (Frontend-only). Wird u.a. von SetreoHeader
// (Profil) und RouteMap (Kartenstil) gelesen.

import { create } from "zustand"
import { persist, createJSONStorage } from "zustand/middleware"

export type TileStyle = "standard" | "satellit"
/** Darstellung des Projekt-Grids auf der Startseite. */
export type ProjektAnsicht = "karten" | "liste"

interface Profile {
  name: string
  email: string
}

interface SettingsStore {
  profile: Profile
  tileStyle: TileStyle
  autoFit: boolean
  projektAnsicht: ProjektAnsicht
  /** Breite der linken Sidebar in px (resizable, T-177). */
  sidebarWidth: number
  setProfile: (patch: Partial<Profile>) => void
  setTileStyle: (s: TileStyle) => void
  setAutoFit: (v: boolean) => void
  setProjektAnsicht: (v: ProjektAnsicht) => void
  setSidebarWidth: (px: number) => void
}

/** Sidebar-Breite: Grenzen + Default. Drag klemmt auf [MIN, MAX]. */
export const SIDEBAR_MIN = 240
export const SIDEBAR_MAX = 560
export const SIDEBAR_DEFAULT = 288 // = bisheriges w-72

export const TILE_LAYERS: Record<TileStyle, { url: string; attribution: string; label: string }> = {
  standard: {
    // openstreetmap.de liefert OSM-Tiles mit deutschsprachigen Beschriftungen
    // (Nordsee, Ostsee, Bodensee usw. statt „North Sea", „Baltic Sea").
    label: "Straßenkarte",
    url: "https://{s}.tile.openstreetmap.de/{z}/{x}/{y}.png",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · Tiles: openstreetmap.de',
  },
  satellit: {
    // Esri World Imagery: frei nutzbare Satelliten-/Luftbild-Kacheln ohne API-Key.
    // URL-Schema {z}/{y}/{x} (kein {s}-Subdomain).
    label: "Satellit",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution:
      '&copy; <a href="https://www.esri.com">Esri</a>, Maxar, Earthstar Geographics',
  },
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      profile: { name: "Setreo Nutzer", email: "team@setreo.de" },
      tileStyle: "standard",
      autoFit: true,
      projektAnsicht: "karten",
      sidebarWidth: SIDEBAR_DEFAULT,
      setProfile: (patch) => set((s) => ({ profile: { ...s.profile, ...patch } })),
      setTileStyle: (tileStyle) => set({ tileStyle }),
      setAutoFit: (autoFit) => set({ autoFit }),
      setProjektAnsicht: (projektAnsicht) => set({ projektAnsicht }),
      setSidebarWidth: (px) =>
        set({ sidebarWidth: Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, Math.round(px))) }),
    }),
    {
      name: "roadmap-settings",
      storage: createJSONStorage(() => localStorage),
      // Alt-Werte (z.B. abgeschafftes "hell") auf einen gültigen TileStyle klemmen.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<SettingsStore>
        return { ...current, ...p, tileStyle: p.tileStyle === "satellit" ? "satellit" : "standard" }
      },
    },
  ),
)
