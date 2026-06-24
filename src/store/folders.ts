// Ordner-Store (T-177) — tenant-geteilte Projekt-Ordner, live vom Backend.
// Wird zusammen mit den Projekten geladen (initData / Tenant-Wechsel). Optimistische
// Updates mit Server-Reconcile. Im Demo-Modus rein lokal (kein Backend).

import { create } from "zustand"
import { toast } from "sonner"
import type { Folder } from "@/types/domain"
import { api } from "@/api/roadmap"
import { isLive } from "./datasource"
import { useContextStore } from "./context"

const uid = () => Math.random().toString(36).slice(2, 10)

interface FolderStore {
  folders: Folder[]
  loadFolders: () => Promise<void>
  /** isPrivate (058): Wurzelordner in der Privat-Zone anlegen (owner = eigener Account). */
  createFolder: (name: string, parentId?: string | null, isPrivate?: boolean) => Promise<Folder | null>
  renameFolder: (id: string, name: string) => void
  /** Ordner verschieben: parentId = Zielordner oder null (Wurzel). isPrivate (058): bei Wurzel-Drop
   *  die Zielzone (true = privat, false = geteilt); in einen Ordner wird sie geerbt. */
  moveFolder: (id: string, parentId: string | null, isPrivate?: boolean) => void
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

  createFolder: async (name, parentId = null, isPrivate = false) => {
    const clean = name.trim()
    if (!clean) return null
    if (isLive()) {
      try {
        const folder = await api.folders.create(clean, parentId, isPrivate)
        set((s) => ({ folders: [...s.folders, folder] }))
        return folder
      } catch {
        toast.error("Ordner konnte nicht angelegt werden.")
        return null
      }
    }
    // Demo: Zone lokal bestimmen (in einem Ordner → dessen owner; sonst private-Flag).
    const parentOwner = parentId != null ? (get().folders.find((f) => f.id === parentId)?.owner ?? null) : null
    const owner = parentId != null ? parentOwner : isPrivate ? (useContextStore.getState().email || "privat") : null
    const folder: Folder = { id: uid(), name: clean, parentId: parentId ?? null, sortOrder: 0, owner }
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

  moveFolder: (id, parentId, isPrivate) => {
    const prev = get().folders
    const folder = prev.find((f) => f.id === id)
    if (!folder) return
    // Zielzone: in einen Ordner → dessen owner erben; auf Wurzel → private-Flag (sonst bisherige Zone).
    const parentOwner = parentId != null ? (prev.find((f) => f.id === parentId)?.owner ?? null) : null
    const newOwner =
      parentId != null
        ? parentOwner
        : isPrivate === true
          ? (useContextStore.getState().email || folder.owner || "privat")
          : isPrivate === false
            ? null
            : (folder.owner ?? null)
    if ((folder.parentId ?? null) === (parentId ?? null) && (folder.owner ?? null) === (newOwner ?? null)) return
    // owner-Kaskade im FE: die ganze Unterstruktur in dieselbe Zone (sonst rendert sie in der falschen).
    const subtree = new Set([id])
    const stack = [id]
    while (stack.length) {
      const top = stack.pop() as string
      for (const c of prev.filter((f) => f.parentId === top)) {
        subtree.add(c.id)
        stack.push(c.id)
      }
    }
    set((s) => ({
      folders: s.folders.map((f) =>
        f.id === id ? { ...f, parentId, owner: newOwner } : subtree.has(f.id) ? { ...f, owner: newOwner } : f,
      ),
    }))
    if (isLive()) {
      api.folders.move(id, parentId, isPrivate).catch(() => {
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
