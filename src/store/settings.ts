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

/**
 * Eigener Kachel-Dienst (T-172), loest `tile.openstreetmap.de` ab.
 *
 * Grund: OSM weist Anfragen ohne Referer nicht mit einem Fehlercode ab, sondern mit
 * einer Ersatzkachel bei Status 200. Im Setreo-Netz kam das als graue Karte an, ohne
 * eine Spur im Log. Statt auf eine fremde IT zu warten, liefern wir selbst aus:
 * tileserver-gl auf einem PMTiles-Extrakt Europa, gehostet auf unserer VM.
 *
 * Von unseren eigenen Seiten aus braucht es keinen Schluessel, die Freigabe laeuft
 * ueber die Herkunft. Fremde Software nutzt `?key=`, siehe Endpunkt-Anleitung.
 * Weiterhin OSM-Daten, nur eben von unserem Server: Namensnennung bleibt Pflicht.
 */
export const SETREO_TILES = "https://setreo-cloud.com/tiles/styles/basemap/{z}/{x}/{y}.png"

/** Namensnennung. Nennt bewusst den eigenen Endpunkt, damit in jeder Karte sichtbar
 *  ist, woher die Kacheln kommen und wo man sie selbst abholen kann. */
export const SETREO_TILES_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · Kacheln: setreo-cloud.com/tiles'

export const TILE_LAYERS: Record<
  TileStyle,
  { url: string; attribution: string; label: string; overlays?: string[] }
> = {
  standard: {
    // Deutschsprachige Beschriftungen (Nordsee, Ostsee, Bodensee statt „North Sea")
    // kommen aus dem Stil des eigenen Dienstes, nicht mehr von openstreetmap.de.
    label: "Straßenkarte",
    url: SETREO_TILES,
    attribution: SETREO_TILES_ATTRIBUTION,
  },
  satellit: {
    // Esri World Imagery (Luftbild, kein API-Key, Schema {z}/{y}/{x}). Das Luftbild allein
    // ist beschriftungslos → transparente Esri-Referenz-Overlays für Straßen + Orts-/Grenz-
    // Labels darüberlegen (Hybrid-Ansicht). Alle auf server.arcgisonline.com → CSP-gedeckt.
    label: "Satellit",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    overlays: [
      "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}",
      "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
    ],
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
