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
  /** Zielordner für das neue Projekt (Explorer-Ansicht legt im aktuellen Ordner an). null = Wurzel. */
  newProjectFolderId: string | null
  openNewProject: (folderId?: string | null) => void
  closeNewProject: () => void
  /** Zähler-Signal: erhöht sich, wenn „Ordner anlegen" aus dem +-Menü gewählt wird.
   *  Der Projektbaum öffnet darauf seine Inline-Eingabe für einen neuen Wurzelordner. */
  newFolderTick: number
  requestNewFolder: () => void
  /** Desktop-Sidebar offen? Persistiert. */
  sidebarOpen: boolean
  toggleSidebar: () => void
  setSidebarOpen: (v: boolean) => void
}

export const useUiStore = create<UiStore>((set) => ({
  newProjectOpen: false,
  newProjectFolderId: null,
  // folderId nur übernehmen, wenn es WIRKLICH eine Ordner-Id ist — manche Aufrufer hängen
  // openNewProject direkt an onClick (dann käme das Event als Argument); alles Nicht-String = Wurzel.
  openNewProject: (folderId = null) =>
    set({ newProjectOpen: true, newProjectFolderId: typeof folderId === "string" ? folderId : null }),
  closeNewProject: () => set({ newProjectOpen: false }),
  newFolderTick: 0,
  requestNewFolder: () => set((s) => ({ newFolderTick: s.newFolderTick + 1 })),
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
