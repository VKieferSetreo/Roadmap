// News-Store: lädt den Feed + hält den Gelesen-Stempel (localStorage, per Gerät — bewusst
// kein DB-Read-Status, vgl. Migration 032). Liefert die Ungelesen-Anzahl für den roten
// Punkt am News-Nav. „Gelesen" = beim Öffnen der News-Seite wird der Stempel auf jetzt gesetzt.

import { create } from "zustand"
import type { News } from "@/types/domain"
import { api } from "@/api/roadmap"
import { isLive } from "./datasource"

const SEEN_KEY = "roadmap-news-seen"

function readSeen(): string | null {
  try {
    return window.localStorage.getItem(SEEN_KEY)
  } catch {
    return null
  }
}

interface NewsStore {
  news: News[]
  seenAt: string | null
  loadNews: () => Promise<void>
  markAllSeen: () => void
  /** Anzahl Einträge, die nach dem letzten Öffnen veröffentlicht wurden. */
  unreadCount: () => number
}

export const useNewsStore = create<NewsStore>()((set, get) => ({
  news: [],
  seenAt: readSeen(),

  loadNews: async () => {
    if (!isLive()) return
    try {
      const news = await api.news.list()
      set({ news: Array.isArray(news) ? news : [] })
    } catch {
      // still — News sind nicht kritisch fürs Laden
    }
  },

  markAllSeen: () => {
    const now = new Date().toISOString()
    try {
      window.localStorage.setItem(SEEN_KEY, now)
    } catch {
      /* ignore */
    }
    set({ seenAt: now })
  },

  unreadCount: () => {
    const { news, seenAt } = get()
    if (!seenAt) return news.length
    return news.filter((n) => n.publishedAt > seenAt).length
  },
}))
