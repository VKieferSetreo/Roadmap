// Zuständigkeits-Kachel unter dem Fund-Ticket: zeigt die aufgelöste zuständige Stelle
// (Resolver, T-613) mit Profil-Icon, Ansprechpartner/Stelle und Kontakt. Eigene Karte im
// selben Design wie das Ticket, mit Abstand darüber. Leere Felder werden NIE angezeigt;
// ist nichts Verwertbares da, rendert die Kachel gar nicht.

import { Mail, MapPin, Phone, UserRound } from "lucide-react"
import { cn } from "@/lib/cn"
import type { FindingKontakt } from "@/types/domain"

export function FindingContactCard({ kontakt, compact = false }: { kontakt: FindingKontakt; compact?: boolean }) {
  const { stelle, rolle, ansprechpartner, email, telefon, adresse } = kontakt
  // Kopf: namentlicher Ansprechpartner zuerst, sonst die Stelle. Zweitzeile = die jeweils andere Info.
  const primaer = ansprechpartner || stelle
  const sekundaer = ansprechpartner ? stelle : rolle
  if (!primaer && !email && !telefon && !adresse) return null

  // compact = Variante im Aufklapp-Panel (über dem Chat): ohne Schatten, enger, kleineres Icon.
  return (
    <div className={cn("rounded-xl border border-neutral-200 bg-white", compact ? "p-2.5" : "p-3 shadow-xl")}>
      <div className={cn("flex items-start", compact ? "gap-2" : "gap-2.5")}>
        <span className={cn("flex shrink-0 items-center justify-center rounded-full bg-primary-50 text-primary-600 ring-1 ring-primary-100", compact ? "h-7 w-7" : "h-9 w-9")}>
          <UserRound className={compact ? "h-4 w-4" : "h-5 w-5"} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">Zuständig</p>
          {primaer ? <p className="truncate text-sm font-semibold text-neutral-900">{primaer}</p> : null}
          {sekundaer ? <p className="truncate text-xs text-neutral-500">{sekundaer}</p> : null}
          {email || telefon || adresse ? (
            <div className="mt-1.5 flex flex-col gap-1">
              {email ? (
                <a
                  href={`mailto:${email}`}
                  className="flex items-center gap-1.5 text-xs font-medium text-primary-700 hover:underline"
                >
                  <Mail className="h-3.5 w-3.5 shrink-0 text-primary-500" />
                  <span className="truncate">{email}</span>
                </a>
              ) : null}
              {telefon ? (
                <a
                  href={`tel:${telefon.replace(/\s+/g, "")}`}
                  className="flex items-center gap-1.5 text-xs font-medium text-neutral-700 hover:underline"
                >
                  <Phone className="h-3.5 w-3.5 shrink-0 text-primary-500" />
                  {telefon}
                </a>
              ) : null}
              {adresse ? (
                <p className="flex items-start gap-1.5 text-xs text-neutral-500">
                  <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-neutral-400" />
                  <span>{adresse}</span>
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
