// Datums-, Zahl- und Währungsformatierung (de-DE).

import { format, parseISO } from "date-fns"
import { de } from "date-fns/locale"

export function formatDateDE(d: Date | string): string {
  const date = typeof d === "string" ? parseISO(d) : d
  return format(date, "dd.MM.yyyy", { locale: de })
}

export function formatDateTimeDE(d: Date | string): string {
  const date = typeof d === "string" ? parseISO(d) : d
  return format(date, "dd.MM.yyyy HH:mm", { locale: de })
}

/** ISO → „heute, 14:05 Uhr" / „gestern, 14:05 Uhr" / „13.06., 14:05 Uhr" / „noch nie".
 *  Gemeinsames „Letzter Stand"-Format (Header-Sync-Button + Anlage-Tab). */
export function formatStampDE(iso: string | null | undefined): string {
  if (!iso) return "noch nie"
  const d = parseISO(iso)
  const zeit = format(d, "HH:mm", { locale: de })
  const days = daysUntil(d)
  if (days === 0) return `heute, ${zeit} Uhr`
  if (days === -1) return `gestern, ${zeit} Uhr`
  return `${format(d, "dd.MM.", { locale: de })}, ${zeit} Uhr`
}

export function formatRelativeDE(d: Date | string): string {
  const date = typeof d === "string" ? parseISO(d) : d
  const days = daysUntil(date)
  // Uhrzeit an "heute"/"gestern" anhängen ("WANN heute?"). 00:00 = reines Datum ohne Zeit → weglassen.
  const zeit = date.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })
  const mitZeit = zeit === "00:00" ? "" : `, ${zeit}`
  if (days === 0) return `heute${mitZeit}`
  if (days === 1) return "morgen"
  if (days === -1) return `gestern${mitZeit}`
  if (days > 1) return `in ${days} Tagen`
  return `vor ${Math.abs(days)} Tagen`
}

export function daysUntil(d: Date | string): number {
  const date = typeof d === "string" ? parseISO(d) : d
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(date)
  target.setHours(0, 0, 0, 0)
  const diff = target.getTime() - today.getTime()
  return Math.round(diff / (1000 * 60 * 60 * 24))
}

export function getCalendarWeek(d: Date): number {
  const date = new Date(d.getTime())
  date.setHours(0, 0, 0, 0)
  date.setDate(date.getDate() + 3 - ((date.getDay() + 6) % 7))
  const week1 = new Date(date.getFullYear(), 0, 4)
  return (
    1 +
    Math.round(((date.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7)
  )
}

export function formatEuro(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "—"
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(cents / 100)
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}
