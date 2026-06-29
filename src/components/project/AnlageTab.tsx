// Reiter „Anlage": Transport-Stammdaten + Zeitraum + Auswertung starten + Veröffentlichung.
// Die Strecken-Anlage (Datei / Google-Link / Start-Ziel) liegt im eigenen Reiter Route.

import { useNavigate } from "react-router-dom"
import { toast } from "sonner"
import { AlertTriangle, ArrowRight, CalendarRange, Check, CheckCircle2, Loader2, Play, Route as RouteIcon, Truck } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { TimePicker } from "@/components/ui/TimePicker"
import { TransportDataForm } from "./TransportDataForm"
import { PublishCard } from "./PublishCard"
import { SEVERITY_META, SEVERITY_ORDER, visibleFindings } from "./findingMeta"
import { ANALYSE_SCHRITTE, useProjectStore } from "@/store/projects"
import type { Project } from "@/types/domain"
import { cn } from "@/lib/cn"
import { formatStampDE } from "@/lib/format"

export function AnlageTab({ project }: { project: Project }) {
  const navigate = useNavigate()
  const updateTransport = useProjectStore((s) => s.updateTransport)
  const updateZeitraum = useProjectStore((s) => s.updateZeitraum)
  const runAnalysis = useProjectStore((s) => s.runAnalysis)
  const analysis = useProjectStore((s) => s.analysis[project.id])

  const running = analysis?.running ?? false
  const routeReady = project.routes.some((r) => r.points.length >= 2)

  // T-222: ohne Höhe/Gewicht prüft die Engine keine Durchfahrtshöhen/Traglastgrenzen — weich warnen.
  const t = project.transport
  const fehltHoehe = !Number.isFinite(t?.hoehe) || (t?.hoehe ?? 0) <= 0
  const fehltGewicht = !Number.isFinite(t?.gesamtgewicht) || (t?.gesamtgewicht ?? 0) <= 0
  const fehltMass = fehltHoehe || fehltGewicht

  // Kennzahlen für den „abgeschlossen"-Zustand: Funde nach Severity aufgeschlüsselt (farbige Chips).
  const fertigeFunde = project.status === "fertig" ? visibleFindings(project.findings) : []
  const sevCounts = SEVERITY_ORDER.map((sev) => ({ sev, n: fertigeFunde.filter((f) => f.severity === sev).length }))

  const onRun = () => {
    if (!routeReady) {
      toast.error("Bitte zuerst oben eine Strecke anlegen.")
      return
    }
    runAnalysis(project.id)
    if (fehltMass) {
      toast.warning("Auswertung gestartet. Ohne Höhe/Gewicht bleiben Brücken-/Traglastgrenzen ungeprüft.")
    } else {
      toast.info("Auswertung gestartet …")
    }
  }

  return (
    <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-5 lg:grid-cols-2">
      {/* ── Transport-Stammdaten — volle Breite ── */}
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Truck className="h-4 w-4 text-primary-600" /> Transport-Stammdaten
          </CardTitle>
        </CardHeader>
        <CardContent>
          <TransportDataForm
            value={project.transport}
            onChange={(patch) => updateTransport(project.id, patch)}
            disabled={running}
          />
        </CardContent>
      </Card>

      {/* ── Transport-Zeitraum ── */}
      <Card className="h-full">
        <CardContent className="flex h-full flex-col gap-3 p-4">
          {(() => {
            // Effective ganztägig: explizit gesetzt → der Wert. Sonst: true wenn weder von noch bis eine Uhrzeit haben.
            const ganztaegigEffective =
              project.zeitraum?.ganztaegig ??
              (!hasExplicitTime(project.zeitraum?.von) && !hasExplicitTime(project.zeitraum?.bis))
            return (
              <>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-sm font-semibold text-neutral-800">
                    <CalendarRange className="h-4 w-4 text-primary-600" /> Transport-Zeitraum
                  </span>
                  <div className="flex items-center gap-2">
                  {/* Dauer-Badge links neben „Ganztägig" (Max 2026-06-29). */}
                  {project.zeitraum?.von &&
                  project.zeitraum?.bis &&
                  !isZeitraumInvalid(project.zeitraum) ? (
                    <span className="inline-flex h-7 items-center rounded-md border border-primary-100 bg-primary-50/60 px-2.5 text-[11px] font-semibold tabular-nums text-primary-800">
                      {durationLabel(project.zeitraum.von, project.zeitraum.bis)}
                    </span>
                  ) : null}
                  <label className="flex h-7 cursor-pointer items-center gap-1.5 rounded-md px-2 text-xs text-neutral-600 transition-colors duration-200 hover:bg-neutral-50">
                    <input
                      type="checkbox"
                      checked={ganztaegigEffective}
                      onChange={(e) => {
                        const next = e.target.checked
                        const von = splitDateTime(project.zeitraum?.von).date
                        const bis = splitDateTime(project.zeitraum?.bis).date
                        updateZeitraum(project.id, {
                          ganztaegig: next,
                          ...(next
                            ? {
                                von: von ? `${von}T00:00` : project.zeitraum?.von,
                                bis: bis ? `${bis}T23:59` : project.zeitraum?.bis,
                              }
                            : {
                                von: von ? `${von}T06:00` : project.zeitraum?.von,
                                bis: bis ? `${bis}T18:00` : project.zeitraum?.bis,
                              }),
                        })
                      }}
                      disabled={running}
                      className="h-3.5 w-3.5 rounded border-neutral-300 text-primary-600 focus:ring-primary-500"
                    />
                    Ganztägig
                  </label>
                  </div>
                </div>

                {/* Zwei Zeilen: Von [Datum] [Uhrzeit] — direkt darunter Bis [Datum] [Uhrzeit]. */}
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <span className="w-7 shrink-0 text-xs font-medium text-neutral-500">Von</span>
                    <Input
                      aria-label="Startdatum"
                      type="date"
                      value={splitDateTime(project.zeitraum?.von).date}
                      onChange={(e) => {
                        const time = splitDateTime(project.zeitraum?.von).time || "06:00"
                        updateZeitraum(project.id, {
                          von: e.target.value
                            ? `${e.target.value}T${ganztaegigEffective ? "00:00" : time}`
                            : "",
                        })
                      }}
                      disabled={running}
                      className="min-w-0 flex-1"
                    />
                    {!ganztaegigEffective ? (
                      <TimePicker
                        ariaLabel="Startuhrzeit"
                        value={splitDateTime(project.zeitraum?.von).time || ""}
                        onChange={(t) => {
                          const date = splitDateTime(project.zeitraum?.von).date
                          if (!date) return
                          updateZeitraum(project.id, { von: `${date}T${t}`, ganztaegig: false })
                        }}
                        disabled={running}
                        className="w-[136px] shrink-0"
                      />
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-7 shrink-0 text-xs font-medium text-neutral-500">Bis</span>
                    <Input
                      aria-label="Enddatum"
                      type="date"
                      value={splitDateTime(project.zeitraum?.bis).date}
                      onChange={(e) => {
                        const time = splitDateTime(project.zeitraum?.bis).time || "18:00"
                        updateZeitraum(project.id, {
                          bis: e.target.value
                            ? `${e.target.value}T${ganztaegigEffective ? "23:59" : time}`
                            : "",
                        })
                      }}
                      disabled={running}
                      min={splitDateTime(project.zeitraum?.von).date || undefined}
                      className="min-w-0 flex-1"
                    />
                    {!ganztaegigEffective ? (
                      <TimePicker
                        ariaLabel="Enduhrzeit"
                        value={splitDateTime(project.zeitraum?.bis).time || ""}
                        onChange={(t) => {
                          const date = splitDateTime(project.zeitraum?.bis).date
                          if (!date) return
                          updateZeitraum(project.id, { bis: `${date}T${t}`, ganztaegig: false })
                        }}
                        disabled={running}
                        className="w-[136px] shrink-0"
                      />
                    ) : null}
                  </div>
                </div>

                {/* Fehlermeldung bei Bis vor Von */}
                {project.zeitraum?.von &&
                project.zeitraum?.bis &&
                isZeitraumInvalid(project.zeitraum) ? (
                  <div
                    role="alert"
                    className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800"
                  >
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-red-600" />
                    <span>
                      <strong>Zeitraum nicht möglich.</strong> Bitte Datum / Uhrzeit korrigieren.
                    </span>
                  </div>
                ) : null}
              </>
            )
          })()}
        </CardContent>
      </Card>

      {/* ── Für Externe freigeben (neben dem Zeitraum) — immer anzeigen (auch vor der Auswertung
          und im Demo-Modus), sonst klafft hier eine Lücke. Freigeben ist jederzeit möglich; der
          Link aktualisiert sich mit der nächsten Auswertung. ── */}
      {!running ? (
        <Card className="h-full">
          <CardContent className="flex h-full flex-col p-4">
            <PublishCard project={project} />
          </CardContent>
        </Card>
      ) : null}

      {/* ── Auswertung-Block (Status + Aktionen) — volle Breite ── */}
      <Card className="lg:col-span-2">
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          {running ? (
            <div className="w-full animate-fade-in">
              <div className="mb-1.5 flex items-center justify-between text-sm">
                <span className="font-medium text-neutral-700">{analysis?.step}</span>
                <span className="tabular-nums text-neutral-500">
                  {Math.round(analysis?.progress ?? 0)}%
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-100">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-primary-400 to-primary-600 transition-all duration-300"
                  style={{ width: `${analysis?.progress ?? 0}%` }}
                />
              </div>
              {/* Schritt-Checkliste */}
              <ol className="mt-3 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {ANALYSE_SCHRITTE.map((step, i) => {
                  const currentIdx = ANALYSE_SCHRITTE.indexOf(analysis?.step ?? "")
                  const state = i < currentIdx ? "done" : i === currentIdx ? "active" : "pending"
                  return (
                    <li
                      key={step}
                      className={cn(
                        "flex items-center gap-2 text-xs transition-colors",
                        state === "done" && "text-primary-700",
                        state === "active" && "font-medium text-neutral-800",
                        state === "pending" && "text-neutral-400",
                      )}
                    >
                      {state === "done" ? (
                        <Check className="h-3.5 w-3.5 shrink-0 text-primary-600" />
                      ) : state === "active" ? (
                        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary-600" />
                      ) : (
                        <span className="ml-1 mr-1 h-1.5 w-1.5 shrink-0 rounded-full bg-neutral-300" />
                      )}
                      {step.replace(" …", "")}
                    </li>
                  )
                })}
              </ol>
            </div>
          ) : (
            <>
              {project.status === "fertig" ? (
                <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
                  {/* Erfolg + Kennzahlen */}
                  <div className="flex min-w-0 flex-col gap-2.5">
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-50 text-primary-600 ring-1 ring-primary-100">
                        <CheckCircle2 className="h-5 w-5" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-neutral-900">Auswertung abgeschlossen</p>
                        <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-neutral-400">
                          <span className="inline-flex items-center gap-1">
                            <RouteIcon className="h-3 w-3" />
                            {project.distanzKm?.toLocaleString("de-DE")} km
                          </span>
                          {project.routes.length > 1 ? <span>· {project.routes.length} Strecken</span> : null}
                          <span>· Stand {formatStampDE(project.updatedAt)}</span>
                        </p>
                      </div>
                    </div>
                    {/* Severity-Aufschlüsselung als farbige Chips — Funde auf einen Blick nach Schweregrad. */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      {fertigeFunde.length === 0 ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-primary-200 bg-primary-50 px-2.5 py-1 text-xs font-semibold text-primary-700">
                          <Check className="h-3.5 w-3.5" /> Keine Funde
                        </span>
                      ) : (
                        sevCounts
                          .filter((c) => c.n > 0)
                          .map(({ sev, n }) => (
                            <span
                              key={sev}
                              className={cn(
                                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold tabular-nums",
                                SEVERITY_META[sev].soft,
                              )}
                            >
                              <span className={cn("h-1.5 w-1.5 rounded-full", SEVERITY_META[sev].dot)} />
                              {n} {SEVERITY_META[sev].label}
                            </span>
                          ))
                      )}
                    </div>
                  </div>

                  {/* Aktionen */}
                  <div className="flex flex-wrap items-center gap-2">
                    <Button variant="outline" onClick={() => navigate(`/projekte/${project.id}/karte`)}>
                      Ergebnis öffnen <ArrowRight className="h-4 w-4" />
                    </Button>
                    <Button onClick={onRun} disabled={!routeReady}>
                      <Play className="h-4 w-4" /> Erneut auswerten
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="text-sm text-neutral-600">
                    {routeReady ? "Bereit zur Auswertung." : "Oben eine Strecke anlegen, um die Auswertung zu starten."}
                  </div>
                  <div className="flex flex-wrap items-start justify-end gap-2">
                    <Button className="min-w-[210px]" onClick={onRun} disabled={!routeReady}>
                      <Play className="h-4 w-4" /> Auswertung starten
                    </Button>
                  </div>
                </>
              )}
              {/* T-222: Weicher Hinweis (nicht-blockierend) wenn Höhe/Gewicht fehlen — die Auswertung
                  kann dann Durchfahrtshöhen/Traglastgrenzen nicht prüfen. */}
              {fehltMass && routeReady ? (
                <div
                  role="alert"
                  className="mt-3 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"
                >
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    {fehltHoehe && fehltGewicht
                      ? "Höhe und Gesamtgewicht fehlen"
                      : fehltHoehe
                        ? "Höhe fehlt"
                        : "Gesamtgewicht fehlt"}{". "}
                    Ohne diese Angaben prüft die Auswertung keine Durchfahrtshöhen bzw. Traglastgrenzen.
                  </span>
                </div>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>

    </div>
  )
}

/** Splittet YYYY-MM-DDTHH:mm in { date, time }. Reines Datum (ohne T) → time = "". */
function splitDateTime(value: string | undefined): { date: string; time: string } {
  if (!value) return { date: "", time: "" }
  if (!value.includes("T")) return { date: value, time: "" }
  const [d, t = ""] = value.split("T")
  return { date: d, time: t.slice(0, 5) }
}

/** True wenn der String eine echte Uhrzeit enthält (T-Teil und nicht "00:00").
 *  „T00:00" oder „T23:59" gelten als Ganztägig-Marker, nicht als gesetzte Uhrzeit. */
function hasExplicitTime(s: string | undefined): boolean {
  if (!s || !s.includes("T")) return false
  const t = s.split("T")[1] ?? ""
  const hhmm = t.slice(0, 5)
  return hhmm !== "" && hhmm !== "00:00" && hhmm !== "23:59"
}

/** True wenn der „Bis"-Zeitpunkt vor dem „Von"-Zeitpunkt liegt. */
function isZeitraumInvalid(z: { von?: string; bis?: string }): boolean {
  if (!z.von || !z.bis) return false
  const a = new Date(z.von).getTime()
  const b = new Date(z.bis).getTime()
  if (Number.isNaN(a) || Number.isNaN(b)) return false
  return b < a
}

/** Dauer zwischen zwei datetime-local Strings als „X Tage Y h" oder „Y h Z min". */
function durationLabel(vonIso: string, bisIso: string): string {
  const a = new Date(vonIso).getTime()
  const b = new Date(bisIso).getTime()
  const diffMin = Math.max(0, Math.round((b - a) / 60_000))
  if (diffMin < 60) return `${diffMin} min`
  const totalH = Math.floor(diffMin / 60)
  const min = diffMin % 60
  if (totalH < 24) return min ? `${totalH} h ${min} min` : `${totalH} h`
  const days = Math.floor(totalH / 24)
  const h = totalH % 24
  return h ? `${days} d ${h} h` : `${days} d`
}
