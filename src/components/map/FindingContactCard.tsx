// Zuständigkeits-Kachel: zeigt die aufgelöste zuständige Stelle (Resolver, T-613) als eigene
// kleine Bubble — Behörde / Abteilung / Mail / Tel / Standort über die volle Breite (kein Kopf-Icon).
// Leere Felder werden NIE angezeigt; ist nichts Verwertbares da, rendert die Kachel gar nicht.
// Klasse `fcontact` → globals.css setzt Leaflets p-Margin (18px) im Popup zurück.
// compact: pl-14 = 56px, exakt bündig mit der Person-Add-Blase unten im Chat (pl-12 + Composer-p-2).

import { Mail, MapPin, Phone } from "lucide-react"
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
        "fcontact rounded-xl border border-neutral-200 bg-white shadow-xl",
        compact ? "py-4 pl-14 pr-3" : "p-3",
      )}
    >
      {/* Zeile 1: Behörde (schwarz) — direkt darunter die Abteilung. */}
      {behoerde ? (
        <p className={cn("font-semibold leading-tight text-neutral-900", compact ? "text-xs" : "text-sm")}>
          {behoerde}
        </p>
      ) : null}
      {/* Zeile 2: Abteilung (klein) — Abstand ~0 (p-Margin per globals.css genullt). */}
      {abteilung ? <p className="truncate text-[10px] leading-tight text-neutral-500">{abteilung}</p> : null}
      {/* Mail · Tel · Standort — minimal abgesetzt, kompakt; Standort = Google-Maps-Link. */}
      {email || telefon || adresse ? (
        <div className="mt-1.5 flex flex-col gap-0.5">
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
  )
}
