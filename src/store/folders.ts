// Ordner-Store (T-177) — tenant-geteilte Projekt-Ordner, live vom Backend.
// Wird zusammen mit den Projekten geladen (initData / Tenant-Wechsel). Optimistische
// Updates mit Server-Reconcile. Im Demo-Modus rein lokal (kein Backend).

import { create } from "zustand"
import { toast } from "sonner"
import type { Folder } from "@/types/domain"
import { api } from "@/api/roadmap"
import { isLive } from "./datasource"

const uid = () => Math.random().toString(36).slice(2, 10)

interface FolderStore {
  folders: Folder[]
  loadFolders: () => Promise<void>
  createFolder: (name: string, parentId?: string | null) => Promise<Folder | null>
  renameFolder: (id: string, name: string) => void
  /** Ordner verschieben (Drag-n-Drop): parentId = Zielordner oder null (Wurzel). */
  moveFolder: (id: string, parentId: string | null) => void
  removeFolder: (id: string) => void
}

export const useFolderStore = create<FolderStore>()((set, get) => ({
  folders: [],

  loadFolders: async () => {
    if (!isLive()) return
    try {
      const folders = await api.folders.list()
      set({ folders: Array.isArray(folders) ? folders : [] })
    } catch {
      // still — Ordner sind optional, kein Toast-Spam beim Laden
    }
  },

  createFolder: async (name, parentId = null) => {
    const clean = name.trim()
    if (!clean) return null
    if (isLive()) {
      try {
        const folder = await api.folders.create(clean, parentId)
        set((s) => ({ folders: [...s.folders, folder] }))
        return folder
      } catch {
        toast.error("Ordner konnte nicht angelegt werden.")
        return null
      }
    }
    const folder: Folder = { id: uid(), name: clean, parentId: parentId ?? null, sortOrder: 0 }
    set((s) => ({ folders: [...s.folders, folder] }))
    return folder
  },

  renameFolder: (id, name) => {
    const clean = name.trim()
    if (!clean) return
    const prev = get().folders
    set((s) => ({ folders: s.folders.map((f) => (f.id === id ? { ...f, name: clean } : f)) }))
    if (isLive()) {
      api.folders.rename(id, clean).catch(() => {
        toast.error("Umbenennen fehlgeschlagen.")
        set({ folders: prev })
      })
    }
  },

  moveFolder: (id, parentId) => {
    const prev = get().folders
    if ((prev.find((f) => f.id === id)?.parentId ?? null) === (parentId ?? null)) return
    set((s) => ({ folders: s.folders.map((f) => (f.id === id ? { ...f, parentId } : f)) }))
    if (isLive()) {
      api.folders.move(id, parentId).catch(() => {
        toast.error("Ordner verschieben fehlgeschlagen.")
        set({ folders: prev })
      })
    }
  },

  removeFolder: (id) => {
    const prev = get().folders
    // lokal: Ordner + Unterordner entfernen (Backend kaskadiert via FK)
    set((s) => ({ folders: s.folders.filter((f) => f.id !== id && f.parentId !== id) }))
    if (isLive()) {
      api.folders.remove(id).catch(() => {
        toast.error("Ordner konnte nicht gelöscht werden.")
        set({ folders: prev })
      })
    }
  },
}))
