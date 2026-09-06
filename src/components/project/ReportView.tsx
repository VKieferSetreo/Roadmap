// Druckfertiger Bericht (PDF über den Browser-Druckdialog): Vollbild-Overlay mit
// sauberem A4-Layout — Kopf, Transport-Daten, KPIs, Funde-Tabellen je Strecke.
// Beim Drucken ist NUR der Bericht sichtbar (body.printing-report, globals.css).

import { useEffect, useId, useRef } from "react"
import { createPortal } from "react-dom"
import { Printer, X } from "lucide-react"
import { SetreoLogo } from "@/components/shared/SetreoLogo"
import { Button } from "@/components/ui/Button"
import {
  imExportZeitraum,
  katMeta,
  SEVERITY_META,
  SEVERITY_ORDER,
  sichtbaresDetail,
  visibleFindings,
} from "./findingMeta"
import { routeLengthKm } from "@/lib/parseRouteFile"
import { formatDateDE, fundeText } from "@/lib/format"
import { routeFreigegeben, type Finding, type FindingSeverity, type Project } from "@/types/domain"
import { cn } from "@/lib/cn"
import { useFocusTrap } from "@/lib/useFocusTrap"

export function ReportView({
  project,
  exportVon = "",
  exportBis = "",
  routeIds,
  severities,
  onClose,
}: {
  project: Project
  exportVon?: string
  exportBis?: string
  /** Nur diese Strecken in den Bericht (leer/undefined = alle). */
  routeIds?: string[]
  /** Nur diese Schweregrade (leer/undefined = alle). */
  severities?: FindingSeverity[]
  onClose: () => void
}) {
  const routeSel = routeIds && routeIds.length ? new Set(routeIds) : null
  const sevSel = severities && severities.length ? new Set(severities) : null
  // T-728f: Das Overlay deckt den ganzen Bildschirm ab, war aber nur ein div per Portal — mit Tab
  // lief man unsichtbar durch die App dahinter weiter. Dieselbe Fokusführung wie Dialog.tsx:
  // Fokus beim Öffnen in den Bericht (erstes Fokusziel im DOM ist der Druck-Knopf der Toolbar,
  // genau der, den man hier zuerst braucht), Tab bleibt gefangen, beim Schließen gibt der Hook
  // den Fokus an den Auslöser zurück. Escape hängt am eigenen Listener unten und bleibt.
  const rootRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  useFocusTrap(rootRef, true)
  // Druck-Isolation: nur der Report ist beim Drucken sichtbar
  useEffect(() => {
    document.body.classList.add("printing-report")
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onEsc)
    return () => {
      document.body.classList.remove("printing-report")
      window.removeEventListener("keydown", onEsc)
    }
  }, [onClose])

  // Optionales Export-Zeitfenster (Teiltransporte) + Strecken-Auswahl.
  const sichtbar = visibleFindings(project.findings).filter(
    (f) =>
      imExportZeitraum(f, exportVon, exportBis) &&
      (!sevSel || sevSel.has(f.severity)) &&
      (!routeSel || f.routeId == null || routeSel.has(f.routeId)),
  )
  const counts = SEVERITY_ORDER.map((sev) => ({
    sev,
    n: sichtbar.filter((f) => f.severity === sev).length,
  }))
  // T-492: echter Daten-Stand = jüngstes Quell-Aktualisierungsdatum der enthaltenen Funde. NICHT
  // project.updatedAt (das jeder Sync-Rerun/Umbenennung auf "heute" zieht und Tagesaktualität
  // vortäuscht). Nur ISO-parsebare Werte; ohne datierte Quelle bleibt der Daten-Stand-Zusatz aus.
  const datenStand = sichtbar
    .map((f) => f.quelle?.aktualisiertAm)
    .filter((d): d is string => typeof d === "string" && /^\d{4}-\d{2}-\d{2}/.test(d))
    .map((d) => d.slice(0, 10))
    .sort()
    .at(-1)
  const t = project.transport
  // Prüfen-Gate (T-593/T-598): ungeprüfte VEMAGS-Strecken sind nie ausgewertet worden — die
  // Engine schließt sie über usableRoutes aus (server/src/engine/index.js:733), Dashboard, Karte
  // und Ebenen-Register tun dasselbe. Ohne das Gate hier hätte der Bericht Kilometer gedruckt,
  // zu denen es gar keine Funde gibt, und "3 von 5 Strecken" gegen eine Grundmenge gezählt, die
  // die Auswertung nie kannte.
  const auswertbar = project.routes.filter((r) => r.points.length >= 2 && routeFreigegeben(r))
  const routen = auswertbar.filter((r) => !routeSel || routeSel.has(r.id))
  // T-727: Der Kopf zeigte "N Strecken" (Auswahl beachtet) neben project.distanzKm (Auswahl
  // ignoriert) — bei 1 von 5 gewählten Strecken stand dort die Gesamtlänge aller fünf. Deshalb
  // die km-Summe aus genau den Strecken bilden, die im Blatt stehen: dann ergibt die Addition
  // der Strecken-Überschriften unten exakt die Kopfzahl (routeLengthKm rundet auf ganze km).
  // Alternative wäre gewesen, project.distanzKm bei Vollauswahl weiter zu nehmen (server-Wert
  // aus dem Routing) und nur bei Teilauswahl zu rechnen — verloren, weil derselbe Bericht dann
  // je nach Auswahl aus zwei unterschiedlichen Quellen zählt und der Externe die Differenz zur
  // Summe der Abschnitte nicht auflösen kann. Fahrzeit mit demselben 50-km/h-Schnitt wie der
  // Server (server/src/engine/index.js:1080) — es ändert sich die Grundlage, nicht die Formel.
  // BEWUSSTE ABWEICHUNG von der Dashboard-Kachel: die zeigt bei genau einer Strecke den
  // Server-Wert project.distanzKm, und der ist auf eine Nachkommastelle gerundet (round1,
  // engine/index.js:1074), während routeLengthKm je Strecke auf ganze km rundet — Dashboard
  // "234,7 km" gegen Bericht "235 km". Dieselbe Haversine-Rechnung, nur andere Rundung, also
  // maximal 0,5 km Unterschied je Strecke. Das Blatt gewinnt: der Externe hat den Bericht als
  // PDF in der Hand und kann die Abschnitte nachaddieren, das Dashboard hat er nicht.
  const berichtKm = routen.reduce((summe, r) => summe + routeLengthKm(r.points), 0)
  const berichtFahrzeitMin = Math.round((berichtKm / 50) * 60)
  const teilauswahl = routen.length < auswertbar.length
  // T-226: Bei mehreren Strecken werden routeId-lose Funde (oder solche, deren Strecke nicht
  // in der Auswahl ist) sonst still verschluckt. Eigene Sammel-Sektion, damit nichts fehlt.
  // (Bei genau einer Strecke saugt deren Sektion die routeId-losen Funde — siehe unten.)
  const zugeordnet = new Set(routen.map((r) => r.id))
  const ohneStrecke =
    routen.length > 1
      ? sichtbar
          .filter((f) => !f.routeId || !zugeordnet.has(f.routeId))
          .sort((a, b) => a.km - b.km)
      : []

  // Per Portal an document.body (NICHT in #root) — sonst versteckt die Druck-Regel
  // `body.printing-report #root { display:none }` auch den Bericht (er wäre ein Kind von #root)
  // → leeres/verhauenes PDF. Als Body-Geschwister von #root bleibt er im Druck sichtbar.
  return createPortal(
    <div
      id="report-print-root"
      ref={rootRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-[800] overflow-y-auto bg-neutral-100 outline-none"
    >
      {/* Toolbar (nicht im Druck) */}
      <div className="print-hidden sticky top-0 z-10 flex items-center justify-between border-b border-neutral-200 bg-white px-4 py-3 shadow-card">
        <p className="text-sm font-semibold text-neutral-800">Bericht: Vorschau</p>
        <div className="flex items-center gap-2">
          <Button onClick={() => window.print()}>
            <Printer className="h-4 w-4" /> Drucken / Als PDF speichern
          </Button>
          <Button variant="outline" onClick={onClose}>
            <X className="h-4 w-4" /> Schließen
          </Button>
        </div>
      </div>

      {/* A4-Blatt */}
      <div className="report-sheet mx-auto my-6 w-full max-w-[210mm] bg-white p-[14mm] shadow-overlay print:my-0 print:max-w-none print:p-0 print:shadow-none">
        {/* Kopf */}
        <header className="flex items-start justify-between border-b-2 border-primary-600 pb-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-primary-700">
              Routenanalyse-Bericht
            </p>
            <h1 id={titleId} className="mt-1 text-2xl font-bold tracking-tight text-neutral-900">
              {project.name}
            </h1>
            <p className="mt-1 text-xs text-neutral-500">
              Berichtsdatum {formatDateDE(project.updatedAt)} ·{" "}
              {teilauswahl
                ? `${routen.length} von ${auswertbar.length} Strecken (Auswahl)`
                : `${routen.length} ${routen.length === 1 ? "Strecke" : "Strecken"}`}{" "}
              · {berichtKm.toLocaleString("de-DE")} km{" "}
              {teilauswahl ? "in dieser Auswahl" : "gesamt"} ·{" "}
              {Math.floor(berichtFahrzeitMin / 60)} h {berichtFahrzeitMin % 60} min (geschätzt)
            </p>
            {/* T-492: Daten-Stand getrennt vom Berichtsdatum — der echte Aktualitäts-Anker der Funde. */}
            {datenStand ? (
              <p className="mt-0.5 text-xs text-neutral-500">
                Daten-Stand {formatDateDE(datenStand)}{" "}
                <span className="text-neutral-400">(jüngste enthaltene Quelle)</span>
              </p>
            ) : null}
            {exportVon || exportBis ? (
              <p className="mt-1 inline-flex rounded border border-primary-200 bg-primary-50/60 px-2 py-0.5 text-[11px] font-medium text-primary-700">
                Export-Zeitraum: {exportVon ? formatDateDE(exportVon) : "Beginn"} –{" "}
                {exportBis ? formatDateDE(exportBis) : "offen"} (nur Funde, die in diesem Zeitraum gelten)
              </p>
            ) : null}
          </div>
          <SetreoLogo height={34} />
        </header>

        {/* Transport + KPIs */}
        <section className="mt-5 grid grid-cols-2 gap-6">
          <div>
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
              Transport
            </h2>
            <table className="mt-1.5 w-full text-sm">
              <tbody>
                <tr>
                  <td className="py-0.5 pr-4 text-neutral-500">Maße (L × B × H)</td>
                  <td className="py-0.5 font-medium tabular-nums text-neutral-900">
                    {masszahl(t?.laenge, "m")} × {masszahl(t?.breite, "m")} ×{" "}
                    {masszahl(t?.hoehe, "m")}
                  </td>
                </tr>
                <tr>
                  <td className="py-0.5 pr-4 text-neutral-500">Gesamtgewicht</td>
                  <td className="py-0.5 font-medium tabular-nums text-neutral-900">
                    {masszahl(t?.gesamtgewicht, "t")}
                  </td>
                </tr>
                {project.zeitraum?.von ? (
                  <tr>
                    <td className="py-0.5 pr-4 text-neutral-500">Zeitraum</td>
                    <td className="py-0.5 font-medium tabular-nums text-neutral-900">
                      {formatDateDE(project.zeitraum.von)}
                      {project.zeitraum.bis ? ` – ${formatDateDE(project.zeitraum.bis)}` : ""}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <div>
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
              Funde ({sichtbar.length})
            </h2>
            <div className="mt-1.5 flex gap-2">
              {counts.map(({ sev, n }) => (
                <span
                  key={sev}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm font-semibold tabular-nums",
                    SEVERITY_META[sev].soft,
                  )}
                >
                  {n} {SEVERITY_META[sev].label}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* T-239: gar keine Funde = Positiv-Befund (Freigabe), nicht als Leere/Fehler lesen — gerade
            im extern geteilten PDF entscheidend für das Vertrauen.
            ABER NUR, WENN AUCH EINE STRECKE IM BLATT STEHT (T-731): seit das Prüfen-Gate hier greift,
            kann `routen` leer sein, obwohl der Nutzer im Export-Dialog etwas gewählt hat — der
            Dialog bietet auch ungeprüfte VEMAGS-Strecken an. Ohne diese Bedingung druckte der
            Bericht dann „0 von 3 Strecken · 0 km" UND gleichzeitig „Die Route ist frei befahrbar".
            Ein Blatt ohne eine einzige Strecke darf keine Freigabe aussprechen, erst recht nicht
            das Dokument, das das Haus verlässt. */}
        {sichtbar.length === 0 && routen.length > 0 ? (
          <section className="mt-6 rounded-lg border border-primary-300 bg-primary-50/60 px-5 py-6 text-center">
            <p className="text-base font-bold text-primary-800">Keine Hindernisse gefunden</p>
            <p className="mx-auto mt-1 max-w-lg text-sm text-primary-700">
              Auf der ausgewerteten Strecke wurden im gewählten Zeitraum keine relevanten Restriktionen
              gefunden. Die Route ist nach aktueller Datenlage frei befahrbar.
            </p>
          </section>
        ) : null}

        {/* Der Gegenfall, und er braucht eine eigene Ansage: nichts Auswertbares im Blatt. Ohne sie
            wäre der Bericht an dieser Stelle einfach leer, und Leere liest sich wie „nichts
            gefunden" — also wie eine Freigabe. */}
        {routen.length === 0 ? (
          <section className="mt-6 rounded-lg border border-amber-300 bg-amber-50 px-5 py-6 text-center">
            <p className="text-base font-bold text-amber-900">Keine ausgewertete Strecke in diesem Bericht</p>
            <p className="mx-auto mt-1 max-w-lg text-sm text-amber-800">
              Die gewählten Strecken sind noch nicht geprüft und freigegeben und wurden deshalb nie
              ausgewertet. Dieser Bericht trifft keine Aussage über ihre Befahrbarkeit.
            </p>
          </section>
        ) : null}

        {/* Funde je Strecke */}
        {routen.map((r) => {
          const findings = sichtbar
            .filter((f) => f.routeId === r.id || (!f.routeId && routen.length === 1))
            .sort((a, b) => a.km - b.km)
          return (
            <section key={r.id} className="mt-6">
              <h2 className="flex items-center gap-2 border-b border-neutral-200 pb-1.5 text-sm font-bold text-neutral-900">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ background: r.farbe }}
                  aria-hidden
                />
                {r.name}
                <span className="font-normal text-neutral-400">
                  · {routeLengthKm(r.points).toLocaleString("de-DE")} km · {fundeText(findings.length)}
                </span>
              </h2>
              {findings.length === 0 ? (
                <p className="mt-2 text-sm text-neutral-400">Keine Funde auf dieser Strecke.</p>
              ) : (
                <FundTabelle findings={findings} />
              )}
            </section>
          )
        })}

        {/* T-226: routeId-lose / streckenfremde Funde bei mehreren Strecken — nichts verschlucken. */}
        {ohneStrecke.length > 0 ? (
          <section className="mt-6">
            <h2 className="flex items-center gap-2 border-b border-neutral-200 pb-1.5 text-sm font-bold text-neutral-900">
              <span className="h-2.5 w-2.5 rounded-full bg-neutral-400" aria-hidden />
              Ohne eindeutige Streckenzuordnung
              <span className="font-normal text-neutral-400">· {fundeText(ohneStrecke.length)}</span>
            </h2>
            <FundTabelle findings={ohneStrecke} />
          </section>
        ) : null}

        {/* T-664/F16: Der Bericht verlässt das Haus und wird weitergereicht. Ohne Vorbehalt liest
            er sich wie eine Freigabe. Der Wortlaut ist die Kurzform des versionierten Textes aus
            DisclaimerContent, den jeder Nutzer beim Erstlogin bestätigt — kein neuer Rechtstext,
            nur derselbe an der Stelle, an der er gebraucht wird. */}
        <footer className="mt-8 border-t border-neutral-200 pt-3 text-[10px] leading-relaxed text-neutral-400">
          <p>
            Planungshilfe ohne Gewähr für Vollständigkeit, Richtigkeit und Aktualität. Ersetzt keine
            verbindliche behördliche Genehmigung. Verbindliche Auflagen und Streckenfreigaben sind
            ausschließlich bei den zuständigen Behörden einzuholen.
          </p>
          <p className="mt-1.5 flex items-center justify-between">
            <span>Erstellt mit Setreo Roadmap. Routenanalyse für Schwertransporte</span>
            <span>{formatDateDE(new Date())}</span>
          </p>
        </footer>
      </div>
    </div>,
    document.body,
  )
}

/** Maßangabe für den Berichtskopf: Zahl mit Einheit, fehlender Wert als Gedankenstrich (T-721).
 *  TransportDataForm schreibt ein geleertes Feld bewusst als undefined statt 0 (sonst prüfte die
 *  Engine eine erfundene Höhe von 0 m als gültig), die Anlage erlaubt das Leeren ausdrücklich.
 *  Das ungeschützte toLocaleString() darauf hat den kompletten Bericht — und damit die ganze
 *  Dashboard-Ansicht — in "Diese Ansicht konnte nicht geladen werden" gekippt. Jedes Maß wird
 *  einzeln geprüft: eine fehlende Höhe darf angegebene Länge und Breite nicht mitverschlucken.
 *  Einheit steht am Wert (wie in DashboardTab), sonst bliebe bei fehlendem Maß ein nacktes "m". */
function masszahl(v: number | undefined, einheit: string): string {
  // 0 ist hier KEIN zulässiges Maß, sondern eine Lücke: einen Transport mit 0 m Länge oder 0 t
  // Gewicht gibt es nicht, die 0 entsteht nur aus einem geleerten Feld oder einem Altdatensatz.
  // Muss dieselbe Lesart sein wie die Eckdaten-Kachel (DashboardTab.tsx:222-223, `t?.laenge ?
  // … : "—"`) — sonst stünde auf demselben Bildschirm für denselben Wert im Bericht "0 m" und
  // in der Auswertung "—". Negative Werte fallen aus demselben Grund mit heraus.
  if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) return "—"
  return `${v.toLocaleString("de-DE")} ${einheit}`
}

/** Fund-Tabelle (km · Kategorie · Fund/Grenzwerte · Schweregrad · Zuständig) — geteilt von
 *  Strecken-Sektion und der Sammel-Sektion „Ohne eindeutige Streckenzuordnung" (T-226). */
function FundTabelle({ findings }: { findings: Finding[] }) {
  return (
    <table className="mt-2 w-full border-collapse text-[13px]">
      <thead>
        <tr className="border-b border-neutral-300 text-left text-[10px] uppercase tracking-wide text-neutral-400">
          <th className="w-[52px] py-1.5 pr-2 text-right font-medium">km</th>
          <th className="w-[110px] py-1.5 pr-2 font-medium">Kategorie</th>
          <th className="py-1.5 pr-2 font-medium">Fund / Grenzwerte</th>
          <th className="w-[86px] py-1.5 pr-2 font-medium">Schweregrad</th>
          <th className="w-[150px] py-1.5 font-medium">Zuständig</th>
        </tr>
      </thead>
      <tbody>
        {findings.map((f) => (
          <tr key={f.id} className="break-inside-avoid border-b border-neutral-100 align-top">
            <td className="py-1.5 pr-2 text-right tabular-nums text-neutral-600">
              {f.km.toLocaleString("de-DE")}
            </td>
            <td className="py-1.5 pr-2 text-neutral-700">{katMeta(f.kategorie).label}</td>
            <td className="py-1.5 pr-2">
              <p className="font-medium text-neutral-900">
                {f.titel}
                {f.strassenRef ? (
                  <span className="font-normal text-neutral-400"> · {f.strassenRef}</span>
                ) : null}
              </p>
              {/* Beschreibung — nur wenn vorhanden und nicht reine Titel-Wiederholung. */}
              {f.beschreibung && f.beschreibung.trim() !== f.titel.trim() ? (
                <p className="text-xs leading-snug text-neutral-600">{f.beschreibung}</p>
              ) : null}
              {sichtbaresDetail(f.detail).length || f.gueltigBis ? (
                <p className="text-xs tabular-nums text-neutral-500">
                  {sichtbaresDetail(f.detail)
                    .map(([k, v]) => `${k}: ${v}`)
                    .join(" · ")}
                  {f.gueltigBis
                    ? `${sichtbaresDetail(f.detail).length ? " · " : ""}gültig bis ${f.gueltigBis
                        .slice(0, 10)
                        .split("-")
                        .reverse()
                        .join(".")}`
                    : ""}
                </p>
              ) : null}
              {/* Quelle + URL + Stand — Nachvollziehbarkeit + Daten-Aktualität im Bericht (T-481). */}
              {f.quelle?.name ? (
                <p className="text-[10px] text-neutral-400">
                  Quelle: {f.quelle.name}
                  {/* T-688: ohne break-all bricht eine lange Quellen-URL nicht um und schiebt die Tabelle
                      ueber den Blattrand — im gedruckten PDF ist der Text dann abgeschnitten. */}
                  {f.quelle.url ? <span className="break-all font-mono"> · {f.quelle.url}</span> : null}
                  {f.quelle.aktualisiertAm
                    ? ` · Stand ${/^\d{4}-\d{2}-\d{2}/.test(f.quelle.aktualisiertAm) ? formatDateDE(f.quelle.aktualisiertAm.slice(0, 10)) : f.quelle.aktualisiertAm}`
                    : null}
                </p>
              ) : null}
            </td>
            <td className="py-1.5 pr-2">
              <span
                className={cn(
                  "inline-block rounded-md border px-1.5 py-0.5 text-[11px] font-semibold",
                  SEVERITY_META[f.severity].soft,
                )}
              >
                {SEVERITY_META[f.severity].label}
              </span>
            </td>
            <td className="py-1.5 text-xs text-neutral-600">{f.zustaendig ?? "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
