// Gemeinsames Karten-/Fund-Layout (Max 2026-06-19) — übergreifend für das Auswertungs-Popup
// (FindingMarker) UND den DB-Dialog (FindingMapDialog), damit das Design identisch ist.
//
// Aufbau (jeweils durch einen dünnen Spacer getrennt):
//   1. Großes StVO-Schild (ohne Farbkasten) + Titel, Untertitel dicht darunter
//   2. Beschreibung — auf 4 Zeilen geklemmt, „mehr lesen" klappt den vollen Text auf
//   3. Stammdaten (Gültigkeit + Detailwerte)
//   4. optionaler Zusatz (z.B. Kontaktblock)
//   5. Aktion über volle Breite (z.B. „Für die Auswertung ausblenden")
//   6. Fußzeile: Severity-Pille + Quelle

import { useLayoutEffect, useRef, useState, type ReactNode } from "react"
import { ExternalLink } from "lucide-react"
import { KategorieGlyph } from "@/components/project/KategorieGlyph"
import { formatGueltigkeit, SEVERITY_META } from "@/components/project/findingMeta"
import type { FindingKategorie, FindingSeverity } from "@/types/domain"
import { cn } from "@/lib/cn"

function Spacer() {
  return <hr className="my-3 border-t border-neutral-200/70" />
}

/** Beschreibung: 4 Zeilen, dann „mehr lesen" (klappt den vollen Text auf). */
function ReadMore({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  const [overflow, setOverflow] = useState(false)
  const ref = useRef<HTMLParagraphElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (el && !open) setOverflow(el.scrollHeight > el.clientHeight + 2)
  }, [text, open])
  return (
    <div>
      <p
        ref={ref}
        className={cn(
          "whitespace-pre-line text-sm leading-relaxed text-neutral-600",
          !open && "line-clamp-4",
        )}
      >
        {text}
      </p>
      {overflow ? (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="mt-1 text-xs font-semibold text-primary-600 transition-colors hover:text-primary-700"
        >
          {open ? "weniger anzeigen" : "mehr lesen"}
        </button>
      ) : null}
    </div>
  )
}

export interface FindingCardProps {
  kategorie: FindingKategorie
  titel: string
  severity: FindingSeverity
  /** vorgefügter Untertitel, z.B. „Baustelle · km 93,4 · A4". */
  subtitle: ReactNode
  beschreibung?: string | null
  gueltigVon?: string | null
  gueltigBis?: string | null
  detail?: Record<string, string | number>
  signKey?: string
  quelle?: { name?: string | null; url?: string | null } | null
  /** Medien zwischen Kopf und Beschreibung (z.B. die Leaflet-Karte im DB-Dialog). */
  media?: ReactNode
  /** Zusatzinhalt nach den Stammdaten (z.B. Kontaktblock eigener Einträge). */
  extra?: ReactNode
  /** Aktions-Button über volle Breite (z.B. Ausblenden / Eintrag verwerfen). */
  action?: ReactNode
}

export function FindingCard({
  kategorie,
  titel,
  severity,
  subtitle,
  beschreibung,
  gueltigVon,
  gueltigBis,
  detail,
  signKey,
  quelle,
  media,
  extra,
  action,
}: FindingCardProps) {
  const meta = SEVERITY_META[severity]
  return (
    <div>
      {/* 1. Schild (ohne Kasten, groß, an der Überschrift ausgerichtet) + Titel/Untertitel */}
      <div className="flex items-center gap-3">
        <KategorieGlyph kategorie={kategorie} signKey={signKey} className="h-9 w-9 shrink-0" />
        <p className="min-w-0 text-[15px] font-semibold leading-snug text-neutral-900">{titel}</p>
      </div>
      <p className="mt-1 text-xs text-neutral-500">{subtitle}</p>

      {media ? <div className="mt-3">{media}</div> : null}

      {/* 2. Beschreibung */}
      {beschreibung ? (
        <>
          <Spacer />
          <ReadMore text={beschreibung} />
        </>
      ) : null}

      {/* 3. Stammdaten */}
      <Spacer />
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
        <div className="flex flex-col">
          <dt className="text-neutral-400">Gültig</dt>
          <dd className="font-medium tabular-nums text-neutral-800">
            {formatGueltigkeit(gueltigVon, gueltigBis)}
          </dd>
        </div>
        {Object.entries(detail ?? {}).map(([k, v]) => (
          <div key={k} className="flex flex-col">
            <dt className="text-neutral-400">{k}</dt>
            <dd className="font-medium tabular-nums text-neutral-800">{v}</dd>
          </div>
        ))}
      </dl>

      {/* 4. Zusatz (Kontakt o.ä.) */}
      {extra}

      {/* 5. Aktion über volle Breite */}
      {action ? (
        <>
          <Spacer />
          {action}
        </>
      ) : null}

      {/* 6. Fußzeile: Severity + Quelle */}
      <Spacer />
      <div className="flex items-center justify-between gap-2">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium",
            meta.soft,
          )}
        >
          <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} />
          {meta.label}
        </span>
        {quelle?.name ? (
          quelle.url ? (
            <a
              href={quelle.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs font-medium text-neutral-500 transition-colors hover:text-neutral-800"
            >
              {quelle.name} <ExternalLink className="h-3 w-3" />
            </a>
          ) : (
            <span className="text-xs font-medium text-neutral-500">{quelle.name}</span>
          )
        ) : null}
      </div>
    </div>
  )
}
