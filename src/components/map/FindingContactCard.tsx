// Zuständigkeits-Kachel: zeigt die aufgelöste zuständige Stelle (Resolver, T-613) als eigene
// kleine Bubble mit Kopf-Icon + Behörde / Abteilung / Mail / Tel / Standort. Leere Felder werden
// NIE angezeigt; ist nichts Verwertbares da, rendert die Kachel gar nicht.

import { Mail, MapPin, Phone, UserRound } from "lucide-react"
import { cn } from "@/lib/cn"
import type { FindingKontakt } from "@/types/domain"

export function FindingContactCard({ kontakt, compact = false }: { kontakt: FindingKontakt; compact?: boolean }) {
  const { stelle, rolle, ansprechpartner, email, telefon, adresse } = kontakt
  // Zeile 1 = Behörde (oder namentlicher Ansprechpartner), Zeile 2 klein = Abteilung/Stelle.
  const behoerde = ansprechpartner || stelle
  const abteilung = ansprechpartner ? stelle : rolle
  if (!behoerde && !email && !telefon && !adresse) return null

  return (
    <div className={cn("rounded-xl border border-neutral-200 bg-white shadow-xl", compact ? "p-2.5" : "p-3")}>
      <div className="flex items-start gap-2">
        <span
          className={cn(
            "flex shrink-0 items-center justify-center rounded-full bg-primary-50 text-primary-600 ring-1 ring-primary-100",
            compact ? "h-8 w-8" : "h-9 w-9",
          )}
        >
          <UserRound className={compact ? "h-4 w-4" : "h-5 w-5"} />
        </span>
        <div className="min-w-0 flex-1">
          {/* Zeile 1: Behörde */}
          {behoerde ? (
            <p className={cn("font-semibold leading-tight text-neutral-900", compact ? "text-xs" : "text-sm")}>
              {behoerde}
            </p>
          ) : null}
          {/* Zeile 2: Abteilung (klein) */}
          {abteilung ? <p className="mt-0.5 truncate text-[11px] text-neutral-500">{abteilung}</p> : null}
          {/* Mail · Tel · Standort — kompakt direkt darunter, gleiches Format */}
          {email || telefon || adresse ? (
            <div className="mt-1.5 flex flex-col gap-0.5">
              {email ? (
                <a
                  href={`mailto:${email}`}
                  className="flex items-center gap-1.5 text-[11px] font-medium text-primary-700 hover:underline"
                >
                  <Mail className="h-3 w-3 shrink-0 text-primary-500" />
                  <span className="truncate">{email}</span>
                </a>
              ) : null}
              {telefon ? (
                <a
                  href={`tel:${telefon.replace(/\s+/g, "")}`}
                  className="flex items-center gap-1.5 text-[11px] font-medium text-neutral-700 hover:underline"
                >
                  <Phone className="h-3 w-3 shrink-0 text-primary-500" />
                  {telefon}
                </a>
              ) : null}
              {adresse ? (
                <p className="flex items-start gap-1.5 text-[11px] text-neutral-500">
                  <MapPin className="mt-0.5 h-3 w-3 shrink-0 text-neutral-400" />
                  <span className="leading-snug">{adresse}</span>
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
