// Persistente Nutzer-Einstellungen (Frontend-only). Wird u.a. von SetreoHeader
// (Profil) und RouteMap (Kartenstil) gelesen.

import { create } from "zustand"
import { persist, createJSONStorage } from "zustand/middleware"

export type TileStyle = "standard" | "hell"
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
  setProfile: (patch: Partial<Profile>) => void
  setTileStyle: (s: TileStyle) => void
  setAutoFit: (v: boolean) => void
  setProjektAnsicht: (v: ProjektAnsicht) => void
}

export const TILE_LAYERS: Record<TileStyle, { url: string; attribution: string; label: string }> = {
  standard: {
    // openstreetmap.de liefert OSM-Tiles mit deutschsprachigen Beschriftungen
    // (Nordsee, Ostsee, Bodensee usw. statt „North Sea", „Baltic Sea").
    label: "Standard (OpenStreetMap DE)",
    url: "https://{s}.tile.openstreetmap.de/{z}/{x}/{y}.png",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · Tiles: openstreetmap.de',
  },
  hell: {
    label: "Hell (CARTO Positron)",
    url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
  },
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      profile: { name: "Setreo Nutzer", email: "team@setreo.de" },
      tileStyle: "standard",
      autoFit: true,
      projektAnsicht: "karten",
      setProfile: (patch) => set((s) => ({ profile: { ...s.profile, ...patch } })),
      setTileStyle: (tileStyle) => set({ tileStyle }),
      setAutoFit: (autoFit) => set({ autoFit }),
      setProjektAnsicht: (projektAnsicht) => set({ projektAnsicht }),
    }),
    { name: "roadmap-settings", storage: createJSONStorage(() => localStorage) },
  ),
)
