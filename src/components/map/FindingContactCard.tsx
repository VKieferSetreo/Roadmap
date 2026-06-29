// Zuständigkeits-Kachel: zeigt die aufgelöste zuständige Stelle (Resolver, T-613) als eigene
// kleine Bubble mit Kopf-Icon + Behörde / Abteilung / Mail / Tel / Standort. Leere Felder werden
// NIE angezeigt; ist nichts Verwertbares da, rendert die Kachel gar nicht.

import { Mail, MapPin, Phone, UserRound } from "lucide-react"
import { cn } from "@/lib/cn"
import type { FindingKontakt } from "@/types/domain"

const gmapsUrl = (adresse: string) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(adresse)}`

export function FindingContactCard({ kontakt, compact = false }: { kontakt: FindingKontakt; compact?: boolean }) {
  const { stelle, rolle, ansprechpartner, email, telefon, adresse } = kontakt
  // Zeile 1 = Behörde (oder namentlicher Ansprechpartner), Zeile 2 klein = Abteilung/Stelle.
  const behoerde = ansprechpartner || stelle
  const abteilung = ansprechpartner ? stelle : rolle
  if (!behoerde && !email && !telefon && !adresse) return null

  // Icons grün (primary), Link-Text blau & anklickbar (Mail/Tel/Standort = Google-Maps).
  const zeile = "flex items-center gap-1.5 text-[11px] font-medium text-blue-600 hover:underline"

  return (
    <div
      className={cn(
        "rounded-xl border border-neutral-200 bg-white shadow-xl",
        // compact = Bubble im Aufklapp-Panel: 2/3-Größe + großes pl-12, damit die Karte mit dem linken
        // Rand hinter der Hauptkarte liegt (Overlap), der Inhalt aber rechts daneben sichtbar bleibt.
        compact ? "py-2 pl-12 pr-3" : "p-3",
      )}
    >
      <div className="flex items-start gap-2">
        <span
          className={cn(
            "flex shrink-0 items-center justify-center rounded-full bg-primary-50 text-primary-600 ring-1 ring-primary-100",
            compact ? "h-7 w-7" : "h-9 w-9",
          )}
        >
          <UserRound className={compact ? "h-3.5 w-3.5" : "h-5 w-5"} />
        </span>
        <div className="min-w-0 flex-1">
          {/* Zeile 1: Behörde (schwarz) — direkt darunter die Abteilung. */}
          {behoerde ? (
            <p className={cn("font-semibold leading-tight text-neutral-900", compact ? "text-xs" : "text-sm")}>
              {behoerde}
            </p>
          ) : null}
          {abteilung ? <p className="truncate text-[10px] leading-tight text-neutral-500">{abteilung}</p> : null}
          {/* Mail · Tel · Standort — kompakt, gleiches Format; Standort als Google-Maps-Link. */}
          {email || telefon || adresse ? (
            <div className="mt-1 flex flex-col gap-0.5">
              {email ? (
                <a href={`mailto:${email}`} className={zeile}>
                  <Mail className="h-3 w-3 shrink-0 text-primary-500" />
                  <span className="truncate">{email}</span>
                </a>
              ) : null}
              {telefon ? (
                <a href={`tel:${telefon.replace(/\s+/g, "")}`} className={zeile}>
                  <Phone className="h-3 w-3 shrink-0 text-primary-500" />
                  {telefon}
                </a>
              ) : null}
              {adresse ? (
                <a href={gmapsUrl(adresse)} target="_blank" rel="noopener noreferrer" className={cn(zeile, "items-start")}>
                  <MapPin className="mt-0.5 h-3 w-3 shrink-0 text-primary-500" />
                  <span className="leading-snug">{adresse}</span>
                </a>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
