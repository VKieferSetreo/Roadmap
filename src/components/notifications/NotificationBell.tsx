// Glocke + Nachrichtenzentrum: zeigt Benachrichtigungen aus dem automatischen
// Re-Auswerten (neue/weggefallene/geänderte Funde). Badge pollt den Ungelesen-
// Zähler; beim Öffnen wird die Liste geladen. Klick auf eine Nachricht markiert
// sie gelesen und springt ins betroffene Projekt.
//
// Eigenes Popover statt DropdownMenu — das Panel scrollt und schließt nicht bei
// jedem Klick (Mark-as-read soll es offen lassen).

import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { useNavigate } from "react-router-dom"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import {
  ArrowDownCircle, Bell, Check, CheckCheck, Pencil, Trash2, TriangleAlert,
} from "lucide-react"
import { api } from "@/api/roadmap"
import { KATEGORIE_META } from "@/components/project/findingMeta"
import type { AppNotification, NotificationTyp } from "@/types/domain"
import { cn } from "@/lib/cn"

const POLL_MS = 30_000

const TYP_META: Record<NotificationTyp, { label: string; icon: typeof Bell; tone: string }> = {
  neu: { label: "Neuer Fund", icon: TriangleAlert, tone: "text-severity-kritisch-text" },
  weggefallen: { label: "Entfallen", icon: ArrowDownCircle, tone: "text-status-done-text" },
  geaendert: { label: "Geändert", icon: Pencil, tone: "text-severity-warnung-text" },
}

const SEVERITY_DOT: Record<string, string> = {
  kritisch: "bg-severity-kritisch-text",
  warnung: "bg-severity-warnung-text",
  hinweis: "bg-severity-hinweis-text",
  info: "bg-status-done-text",
}

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const min = Math.round(diffMs / 60_000)
  if (min < 1) return "gerade eben"
  if (min < 60) return `vor ${min} Min`
  const std = Math.round(min / 60)
  if (std < 24) return `vor ${std} Std`
  const tage = Math.round(std / 24)
  if (tage < 7) return `vor ${tage} Tg`
  return new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })
}

export function NotificationBell() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  // Position des (per Portal an body gehängten) Panels — fixed, unter der Glocke.
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null)
  const navigate = useNavigate()
  const qc = useQueryClient()

  const unread = useQuery({
    queryKey: ["notif-unread"],
    queryFn: () => api.notifications.unreadCount(),
    refetchInterval: POLL_MS,
    refetchOnWindowFocus: true,
  })

  const list = useQuery({
    queryKey: ["notif-list"],
    queryFn: () => api.notifications.list(),
    enabled: open,
    staleTime: 5_000,
  })

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["notif-unread"] })
    void qc.invalidateQueries({ queryKey: ["notif-list"] })
  }

  // T-234: Aktionen dürfen nicht still scheitern (Badge bliebe falsch stehen) → onError-Toast.
  const markRead = useMutation({
    mutationFn: (id: string) => api.notifications.read(id),
    onSuccess: invalidate,
    onError: () => toast.error("Konnte nicht als gelesen markiert werden."),
  })
  const markAll = useMutation({
    mutationFn: () => api.notifications.readAll(),
    onSuccess: invalidate,
    onError: () => toast.error("Konnte nicht alle als gelesen markieren."),
  })
  const deleteAll = useMutation({
    mutationFn: () => api.notifications.deleteAll(),
    onSuccess: invalidate,
    onError: () => toast.error("Nachrichten konnten nicht gelöscht werden."),
  })

  useEffect(() => {
    if (!open) return
    // Panel an der Glocke ausrichten (rechtsbündig, knapp darunter). Der Header ist
    // sticky → die Glocke sitzt stabil am Viewport-Rand; bei Resize/Scroll neu rechnen.
    const place = () => {
      const r = ref.current?.getBoundingClientRect()
      if (r) setPos({ top: r.bottom + 8, right: Math.max(8, window.innerWidth - r.right) })
    }
    place()
    const onClick = (e: MouseEvent) => {
      const t = e.target as Node
      if (ref.current?.contains(t) || panelRef.current?.contains(t)) return
      setOpen(false)
    }
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    window.addEventListener("mousedown", onClick)
    window.addEventListener("keydown", onEsc)
    window.addEventListener("resize", place)
    window.addEventListener("scroll", place, true)
    return () => {
      window.removeEventListener("mousedown", onClick)
      window.removeEventListener("keydown", onEsc)
      window.removeEventListener("resize", place)
      window.removeEventListener("scroll", place, true)
    }
  }, [open])

  const count = unread.data ?? 0
  const items = list.data?.notifications ?? []

  const onItemClick = (n: AppNotification) => {
    if (!n.readAt) markRead.mutate(n.id)
    if (n.projektId) {
      setOpen(false)
      // Direkt zur Karte des Projekts und auf die betroffene Baustelle springen (Deep-Link).
      const focus = n.obstacleId ? `?focus=${encodeURIComponent(n.obstacleId)}` : ""
      navigate(`/projekte/${n.projektId}/karte${focus}`)
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={`Nachrichten${count > 0 ? ` (${count} ungelesen)` : ""}`}
        className="relative rounded-md p-2 text-neutral-600 transition-colors hover:bg-neutral-100"
      >
        <Bell className="h-5 w-5" />
        {count > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-severity-kritisch-text px-1 text-[10px] font-bold leading-none text-white">
            {count > 99 ? "99+" : count}
          </span>
        ) : null}
      </button>

      {open && pos
        ? createPortal(
          <div
            ref={panelRef}
            style={{ position: "fixed", top: pos.top, right: pos.right }}
            className="z-[1500] w-[min(92vw,380px)] animate-fade-in overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-lg"
          >
          <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-neutral-900">Nachrichten</p>
              <p className="text-xs text-neutral-500">
                Änderungen an Ihren Auswertungen
              </p>
            </div>
            <div className="flex items-center gap-1">
              {count > 0 ? (
                <button
                  type="button"
                  onClick={() => markAll.mutate()}
                  disabled={markAll.isPending}
                  aria-label="Alle als gelesen markieren"
                  title="Alle als gelesen markieren"
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600 disabled:opacity-50"
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                </button>
              ) : null}
              {items.length > 0 ? (
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm("Alle Nachrichten löschen?")) deleteAll.mutate()
                  }}
                  disabled={deleteAll.isPending}
                  aria-label="Alle Nachrichten löschen"
                  title="Alle löschen"
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-neutral-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>
          </div>

          <div className="max-h-[min(70vh,440px)] overflow-y-auto">
            {list.isLoading ? (
              <div className="flex flex-col gap-2 p-4">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="skeleton h-12 w-full rounded" />
                ))}
              </div>
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
                <Bell className="h-7 w-7 text-neutral-300" />
                <p className="text-sm font-medium text-neutral-600">Keine Nachrichten</p>
                <p className="max-w-[260px] text-xs text-neutral-500">
                  Sobald sich nach einer Datenaktualisierung Funde auf Ihren Strecken ändern,
                  erscheint hier eine Meldung.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-neutral-100">
                {items.map((n) => {
                  const meta = TYP_META[n.typ]
                  const Icon = meta.icon
                  const dot = SEVERITY_DOT[n.severity ?? "info"] ?? "bg-neutral-300"
                  const kat = n.kategorie ? KATEGORIE_META[n.kategorie]?.label : null
                  return (
                    <li key={n.id}>
                      <button
                        type="button"
                        onClick={() => onItemClick(n)}
                        className={cn(
                          "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-neutral-50",
                          !n.readAt && "bg-primary-50/40",
                        )}
                      >
                        <span className={cn("mt-0.5 shrink-0", meta.tone)}>
                          <Icon className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className="truncate text-sm font-medium text-neutral-900">
                              {n.titel}
                            </span>
                            {!n.readAt ? (
                              <span className={cn("h-2 w-2 shrink-0 rounded-full", dot)} />
                            ) : null}
                          </span>
                          {n.beschreibung ? (
                            <span className="mt-0.5 block truncate text-xs text-neutral-500">
                              {n.beschreibung}
                            </span>
                          ) : null}
                          <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-neutral-500">
                            <span className="font-medium text-neutral-600">{meta.label}</span>
                            {kat ? <span>· {kat}</span> : null}
                            {n.projektName ? <span>· {n.projektName}</span> : null}
                            {n.routeName ? <span>· {n.routeName}</span> : null}
                            {n.km != null ? <span>· km {n.km.toLocaleString("de-DE")}</span> : null}
                            <span>· {relativeTime(n.createdAt)}</span>
                          </span>
                        </span>
                        {!n.readAt ? (
                          <span
                            role="button"
                            tabIndex={0}
                            aria-label="Als gelesen markieren"
                            onClick={(e) => {
                              e.stopPropagation()
                              markRead.mutate(n.id)
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.stopPropagation()
                                markRead.mutate(n.id)
                              }
                            }}
                            className="mt-0.5 shrink-0 rounded p-1 text-neutral-300 transition-colors hover:bg-neutral-100 hover:text-neutral-600"
                          >
                            <Check className="h-3.5 w-3.5" />
                          </span>
                        ) : null}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
          </div>,
          document.body,
        )
        : null}
    </div>
  )
}
