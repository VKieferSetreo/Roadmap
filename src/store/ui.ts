// Ephemerer UI-State (nicht persistiert) — z.B. der globale "Neues Projekt"-Dialog,
// damit Sidebar-"+" und Dashboard-Button denselben Dialog öffnen.

import { create } from "zustand"

interface UiStore {
  newProjectOpen: boolean
  openNewProject: () => void
  closeNewProject: () => void
}

export const useUiStore = create<UiStore>((set) => ({
  newProjectOpen: false,
  openNewProject: () => set({ newProjectOpen: true }),
  closeNewProject: () => set({ newProjectOpen: false }),
}))
