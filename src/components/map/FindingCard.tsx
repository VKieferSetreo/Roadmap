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
import { ExternalLink, Sparkles, HelpCircle } from "lucide-react"
import { KategorieGlyph } from "@/components/project/KategorieGlyph"
import { formatGueltigkeit, SEVERITY_META } from "@/components/project/findingMeta"
import type { FindingKategorie, FindingSeverity } from "@/types/domain"
import { cn } from "@/lib/cn"
import { safeHref } from "@/lib/safeHref"

function Spacer() {
  return <hr className="my-2.5 border-t border-neutral-200/70" />
}

/** Daten-Stand formatieren: ISO-Zeitstempel → DD.MM.YYYY, relativer Text ("vor 12 min") unverändert. */
function fmtStand(v: string): string {
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[3]}.${m[2]}.${m[1]}` : v
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
          "whitespace-pre-line text-xs leading-relaxed text-neutral-700",
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
  quelle?: { name?: string | null; url?: string | null; aktualisiertAm?: string | null } | null
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
    // flex-col + Wachstums-Spacer: füllt die Mindesthöhe der Karte; Beschreibung bleibt oben,
    // Stammdaten/Aktion/Fußzeile werden so weit wie möglich nach unten geschoben.
    // flex-1 greift nur in einem Flex-Eltern (Popup-Hauptkarte); im DB-Dialog ohne Wirkung.
    <div className="fcard flex flex-1 flex-col">
      {/* 1. Schild (ohne Kasten, groß) mittig zum Titel+Untertitel-Block. Untertitel direkt
          unter dem Titel — minimaler Abstand (leading-tight, kein margin), darf umbrechen. */}
      <div className="flex items-center gap-3">
        <KategorieGlyph kategorie={kategorie} signKey={signKey} className="h-9 w-9 shrink-0" />
        {/* gap statt p-margin: Leaflet überschreibt p-margins im Popup (höhere Spezifität),
            der Flex-gap nicht — so bleibt der Mini-Abstand zuverlässig erhalten. */}
        <div className="flex min-w-0 flex-col gap-0.5 text-left">
          <p className="text-[15px] font-semibold leading-tight text-neutral-900">
            {titel}
            {/* EIN Zeichen am Titel sagt "an diesem Fund war KI beteiligt" (Max 01.09.2026).
                Welche Angabe es betrifft, zeigen die lila Werte im Raster darunter — und wo es
                keine gibt (die getragene Straße etwa steht im Untertitel), nennt der Hover sie.
                Ein Schild unter der Karte hat dafür zu viel Platz gekostet und stand auch dann
                da, wenn die Markierung im Raster die Frage längst beantwortet hatte. */}
            {detail?.["Ergänzt"] ? (
              <span title={`Durch KI ergänzt: ${detail["Ergänzt"]}`} className="ml-1 inline-block align-[-2px]">
                <Sparkles className="h-3.5 w-3.5 text-violet-600" aria-label={`Durch KI ergänzt: ${detail["Ergänzt"]}`} />
              </span>
            ) : null}
          </p>
          <p className="text-xs leading-tight text-neutral-500">{subtitle}</p>
        </div>
      </div>

      {media ? <div className="mt-3">{media}</div> : null}

      {/* 2. Beschreibung */}
      {beschreibung ? (
        <>
          <Spacer />
          <ReadMore text={beschreibung} />
        </>
      ) : null}

      {/* Wachstums-Spacer: drückt Stammdaten + alles darunter ans untere Kartenende. */}
      <div className="min-h-0 flex-1" aria-hidden />

      {/* 3. Stammdaten */}
      <Spacer />
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
        <div className="flex flex-col">
          <dt className="text-neutral-400">Gültig</dt>
          <dd className="font-medium tabular-nums text-neutral-800">
            {formatGueltigkeit(gueltigVon, gueltigBis)}
          </dd>
        </div>
        {Object.entries(detail ?? {})
          // "Zeitraum" bleibt draussen (Max 31.08.2026): die Zeile sagt nur, wie der Fund zum
          // eingestellten TRANSPORTzeitraum steht, und den kennt man aus den eigenen Einstellungen.
          // Auf der Karte zaehlt, wann die Massnahme selbst gilt — das steht in "Gültig".
          // Nur die Anzeige, im Fund bleibt der Wert stehen.
          .filter(([k]) => k !== "Ergänzt" && k !== "Zuordnung" && k !== "Zeitraum" && !k.startsWith("__"))
          .map(([k, v]) => {
            // Das Zeichen sitzt AN DER GEFUNDENEN STELLE (Max 31.08.2026), nicht nur unten am
            // Fund: wer auf eine Durchfahrtshöhe schaut, muss dort sehen, woher sie kommt.
            const ausKi = Array.isArray(detail?.__ki) && detail.__ki.includes(k)
            return (
              <div key={k} className="flex flex-col">
                <dt className="text-neutral-400">{k}</dt>
                <dd
                  className={cn("flex items-center gap-1 font-medium tabular-nums", ausKi ? "text-violet-700" : "text-neutral-800")}
                  /* Der Satz zur Herkunft haengt AM WERT, nicht mehr als Dauer-Schild unter dem
                     Fund (Max 01.09.2026: "brauchen nicht 'Durch KI extrahiert' immer, sondern
                     nur wenn ich per Hover drüber gehe"). Wer wissen will, woher die Zahl kommt,
                     zeigt auf sie — und sieht dann auch, WELCHE Angabe gemeint war. */
                  title={ausKi ? `Aus dem Beschreibungstext gelesen, nicht von der Behörde gemeldet${detail?.["Ergänzt"] ? `: ${detail["Ergänzt"]}` : ""}` : undefined}
                >
                  {v}
                  {/* Das Zeichen steht hinter dem Wert und traegt kein Wort (Max 31.08.2026):
                      der Wert ist die Information, die Herkunft eine Fussnote. */}
                  {ausKi ? (
                    <Sparkles className="h-3 w-3 shrink-0 text-violet-600"
                              aria-label="Durch KI extrahiert" />
                  ) : null}
                </dd>
              </div>
            )
          })}
      </dl>

      {/* Der KI-Hinweis sitzt am TITEL, nicht mehr als Schild hier unten (Max 01.09.2026: "dieser
          lila Badge soll raus"). Die Zuordnungs-Warnung bleibt: sie sagt etwas ganz anderes —
          nicht woher ein Wert kommt, sondern ob der Fund überhaupt zur Strecke gehört. */}
      {detail?.["Zuordnung"] && (
        <div className="mt-2 flex flex-col gap-1">
          {detail?.["Zuordnung"] ? (
            <span
              title="Es ließ sich nicht belegen, ob dieser Fund zur gefahrenen Strecke gehört. Er wird gezeigt, statt still verworfen zu werden."
              className="inline-flex w-fit items-center gap-1.5 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800 ring-1 ring-amber-200"
            >
              <HelpCircle className="h-3 w-3 shrink-0" aria-hidden />
              Zuordnung {detail["Zuordnung"]}
            </span>
          ) : null}
        </div>
      )}

      {/* 4. Zusatz (Kontakt o.ä.) */}
      {extra}

      {/* 5. Aktion über volle Breite */}
      {action ? (
        <>
          <Spacer />
          {action}
        </>
      ) : null}

      {/* 6. Fußzeile: Severity + Quelle. Die Quelle nimmt die Restbreite (flex-1) und füllt
          sie rechtsbündig — lange Namen brechen sauber statt eine schmale Spalte zu lassen. */}
      <Spacer />
      <div className="flex items-start justify-between gap-2">
        <span
          className={cn(
            "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium",
            meta.soft,
          )}
        >
          <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} />
          {meta.label}
        </span>
        {quelle?.name ? (
          quelle.url ? (
            <a
              href={safeHref(quelle.url)}
              target="_blank"
              rel="noreferrer"
              className="block flex-1 text-right text-xs font-medium text-neutral-500 transition-colors hover:text-neutral-800"
            >
              {quelle.name}
              <ExternalLink className="ml-1 inline h-3 w-3 shrink-0 align-text-bottom" />
            </a>
          ) : (
            <span className="flex-1 text-right text-xs font-medium text-neutral-500">{quelle.name}</span>
          )
        ) : null}
      </div>
      {/* T-481: Daten-Aktualität (Stand des letzten Abrufs) — ISO → DE-Datum, relativer Text as-is. */}
      {quelle?.aktualisiertAm ? (
        <p className="mt-1 text-right text-[11px] text-neutral-400">Stand: {fmtStand(quelle.aktualisiertAm)}</p>
      ) : null}
    </div>
  )
}
