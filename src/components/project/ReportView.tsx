// Druckfertiger Bericht (PDF über den Browser-Druckdialog): Vollbild-Overlay mit
// sauberem A4-Layout — Kopf, Transport-Daten, KPIs, Funde-Tabellen je Strecke.
// Beim Drucken ist NUR der Bericht sichtbar (body.printing-report, globals.css).

import { useEffect } from "react"
import { Printer, X } from "lucide-react"
import { SetreoLogo } from "@/components/shared/SetreoLogo"
import { Button } from "@/components/ui/Button"
import {
  imExportZeitraum,
  KATEGORIE_META,
  SEVERITY_META,
  SEVERITY_ORDER,
  visibleFindings,
} from "./findingMeta"
import { routeLengthKm } from "@/lib/parseRouteFile"
import { formatDateDE } from "@/lib/format"
import type { Project } from "@/types/domain"
import { cn } from "@/lib/cn"

export function ReportView({
  project,
  exportVon = "",
  exportBis = "",
  routeIds,
  onClose,
}: {
  project: Project
  exportVon?: string
  exportBis?: string
  /** Nur diese Strecken in den Bericht (leer/undefined = alle). */
  routeIds?: string[]
  onClose: () => void
}) {
  const routeSel = routeIds && routeIds.length ? new Set(routeIds) : null
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
      (!routeSel || f.routeId == null || routeSel.has(f.routeId)),
  )
  const counts = SEVERITY_ORDER.map((sev) => ({
    sev,
    n: sichtbar.filter((f) => f.severity === sev).length,
  }))
  const t = project.transport
  const routen = project.routes.filter(
    (r) => r.points.length >= 2 && (!routeSel || routeSel.has(r.id)),
  )

  return (
    <div id="report-print-root" className="fixed inset-0 z-[800] overflow-y-auto bg-neutral-100">
      {/* Toolbar (nicht im Druck) */}
      <div className="print-hidden sticky top-0 z-10 flex items-center justify-between border-b border-neutral-200 bg-white px-4 py-3 shadow-card">
        <p className="text-sm font-semibold text-neutral-800">Bericht — Vorschau</p>
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
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-neutral-900">
              {project.name}
            </h1>
            <p className="mt-1 text-xs text-neutral-500">
              Stand {formatDateDE(project.updatedAt)} · {routen.length}{" "}
              {routen.length === 1 ? "Strecke" : "Strecken"} ·{" "}
              {project.distanzKm?.toLocaleString("de-DE")} km gesamt ·{" "}
              {Math.floor((project.fahrzeitMin ?? 0) / 60)} h {(project.fahrzeitMin ?? 0) % 60} min
            </p>
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
                    {t.laenge.toLocaleString("de-DE")} × {t.breite.toLocaleString("de-DE")} ×{" "}
                    {t.hoehe.toLocaleString("de-DE")} m
                  </td>
                </tr>
                <tr>
                  <td className="py-0.5 pr-4 text-neutral-500">Gesamtgewicht</td>
                  <td className="py-0.5 font-medium tabular-nums text-neutral-900">
                    {t.gesamtgewicht.toLocaleString("de-DE")} t
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
                  · {routeLengthKm(r.points).toLocaleString("de-DE")} km · {findings.length} Funde
                </span>
              </h2>
              {findings.length === 0 ? (
                <p className="mt-2 text-sm text-neutral-400">Keine Funde auf dieser Strecke.</p>
              ) : (
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
                      <tr
                        key={f.id}
                        className="break-inside-avoid border-b border-neutral-100 align-top"
                      >
                        <td className="py-1.5 pr-2 text-right tabular-nums text-neutral-600">
                          {f.km.toLocaleString("de-DE")}
                        </td>
                        <td className="py-1.5 pr-2 text-neutral-700">
                          {KATEGORIE_META[f.kategorie].label}
                        </td>
                        <td className="py-1.5 pr-2">
                          <p className="font-medium text-neutral-900">
                            {f.titel}
                            {f.strassenRef ? (
                              <span className="font-normal text-neutral-400">
                                {" "}
                                · {f.strassenRef}
                              </span>
                            ) : null}
                          </p>
                          {/* Beschreibung — nur wenn vorhanden und nicht reine Titel-Wiederholung. */}
                          {f.beschreibung && f.beschreibung.trim() !== f.titel.trim() ? (
                            <p className="text-xs leading-snug text-neutral-600">{f.beschreibung}</p>
                          ) : null}
                          {Object.keys(f.detail).length || f.gueltigBis ? (
                            <p className="text-xs tabular-nums text-neutral-500">
                              {Object.entries(f.detail)
                                .map(([k, v]) => `${k}: ${v}`)
                                .join(" · ")}
                              {f.gueltigBis
                                ? `${Object.keys(f.detail).length ? " · " : ""}gültig bis ${f.gueltigBis
                                    .slice(0, 10)
                                    .split("-")
                                    .reverse()
                                    .join(".")}`
                                : ""}
                            </p>
                          ) : null}
                          {/* Quelle + URL — Nachvollziehbarkeit der Datenherkunft im Bericht. */}
                          {f.quelle?.name ? (
                            <p className="text-[10px] text-neutral-400">
                              Quelle: {f.quelle.name}
                              {f.quelle.url ? <span className="font-mono"> · {f.quelle.url}</span> : null}
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
              )}
            </section>
          )
        })}

        <footer className="mt-8 flex items-center justify-between border-t border-neutral-200 pt-3 text-[10px] text-neutral-400">
          <span>Erstellt mit Setreo Roadmap — Routenanalyse für Schwertransporte</span>
          <span>{formatDateDE(new Date())}</span>
        </footer>
      </div>
    </div>
  )
}
