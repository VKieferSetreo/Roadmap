// Ephemerer UI-State — globaler "Neues Projekt"-Dialog + Sidebar-Offen-Zustand.
// Sidebar-Offen liegt hier (statt lokal in AppLayout), damit auch das Karten-Overlay
// denselben Toggle bedienen kann. Die Wahl wird wie zuvor in localStorage persistiert.

import { create } from "zustand"

const SIDEBAR_OPEN_KEY = "roadmap.sidebar.open"

function readSidebarOpen(): boolean {
  try {
    const v = localStorage.getItem(SIDEBAR_OPEN_KEY)
    return v === null ? true : v === "true"
  } catch {
    return true
  }
}

function persistSidebarOpen(v: boolean) {
  try {
    localStorage.setItem(SIDEBAR_OPEN_KEY, String(v))
  } catch {
    /* ignore */
  }
}

interface UiStore {
  newProjectOpen: boolean
  openNewProject: () => void
  closeNewProject: () => void
  /** Desktop-Sidebar offen? Persistiert. */
  sidebarOpen: boolean
  toggleSidebar: () => void
  setSidebarOpen: (v: boolean) => void
}

export const useUiStore = create<UiStore>((set) => ({
  newProjectOpen: false,
  openNewProject: () => set({ newProjectOpen: true }),
  closeNewProject: () => set({ newProjectOpen: false }),
  sidebarOpen: readSidebarOpen(),
  toggleSidebar: () =>
    set((s) => {
      const next = !s.sidebarOpen
      persistSidebarOpen(next)
      return { sidebarOpen: next }
    }),
  setSidebarOpen: (v) => {
    persistSidebarOpen(v)
    set({ sidebarOpen: v })
  },
}))
