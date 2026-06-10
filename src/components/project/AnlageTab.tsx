// Tab 1 — Streckeneingabe (Upload ODER Start/Ziel) + Transport-Stammdaten + Zeitraum + Analyse-Start.

import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { toast } from "sonner"
import {
  AlertTriangle,
  ArrowRight,
  CalendarRange,
  Check,
  Loader2,
  MapPin,
  Play,
  Plus,
  Route,
  Upload,
  Waypoints,
  X,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card"
import { Button } from "@/components/ui/Button"
import { Input, Label } from "@/components/ui/Input"
import { TimePicker } from "@/components/ui/TimePicker"
import { DropZone } from "@/components/upload/DropZone"
import { TransportDataForm } from "./TransportDataForm"
import { ANALYSE_SCHRITTE, useProjectStore } from "@/store/projects"
import { parseRouteFile, routeLengthKm } from "@/lib/parseRouteFile"
import type { Project, RouteMode } from "@/types/domain"
import { cn } from "@/lib/cn"

export function AnlageTab({ project }: { project: Project }) {
  const navigate = useNavigate()
  const updateRoute = useProjectStore((s) => s.updateRoute)
  const updateTransport = useProjectStore((s) => s.updateTransport)
  const updateZeitraum = useProjectStore((s) => s.updateZeitraum)
  const runAnalysis = useProjectStore((s) => s.runAnalysis)
  const analysis = useProjectStore((s) => s.analysis[project.id])
  const [viaDraft, setViaDraft] = useState("")

  const running = analysis?.running ?? false
  const route = project.route
  const routeReady =
    route.mode === "upload"
      ? Boolean(route.fileName)
      : Boolean(route.start?.trim() && route.ziel?.trim())

  const setMode = (mode: RouteMode) => updateRoute(project.id, { mode })

  /** Upload: GPX/KML/GeoJSON sofort client-seitig parsen → echte Geometrie. */
  const onRouteFile = async (file: File) => {
    try {
      const parsed = await parseRouteFile(file)
      if (parsed) {
        updateRoute(project.id, { fileName: file.name, points: parsed.points })
        toast.success(
          `Strecke geladen: ${parsed.points.length.toLocaleString("de-DE")} Punkte · ca. ${routeLengthKm(parsed.points).toLocaleString("de-DE")} km.`,
        )
      } else {
        // Shapefile: akzeptiert, Geometrie entsteht erst bei der Auswertung
        updateRoute(project.id, { fileName: file.name, points: undefined })
        toast.info("Shapefile übernommen — die Strecken-Geometrie wird bei der Auswertung erzeugt.")
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Datei konnte nicht gelesen werden.")
    }
  }

  const addVia = () => {
    const v = viaDraft.trim()
    if (!v) return
    updateRoute(project.id, { vias: [...(route.vias ?? []), v] })
    setViaDraft("")
  }
  const removeVia = (i: number) =>
    updateRoute(project.id, { vias: (route.vias ?? []).filter((_, idx) => idx !== i) })

  const onRun = () => {
    if (!routeReady) {
      toast.error("Bitte zuerst die Strecke festlegen (Datei oder Start/Ziel).")
      return
    }
    runAnalysis(project.id)
    toast.info("Auswertung gestartet …")
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* ── Strecke ── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Route className="h-4 w-4 text-primary-600" /> Strecke
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="inline-flex w-full rounded-md border border-neutral-200 bg-neutral-50 p-1">
              {(
                [
                  { id: "startziel", label: "Start / Ziel", icon: MapPin },
                  { id: "upload", label: "Datei-Upload", icon: Upload },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setMode(opt.id)}
                  className={cn(
                    "flex flex-1 items-center justify-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium transition-colors",
                    route.mode === opt.id
                      ? "bg-white text-primary-700 shadow-sm"
                      : "text-neutral-500 hover:text-neutral-700",
                  )}
                >
                  <opt.icon className="h-4 w-4" /> {opt.label}
                </button>
              ))}
            </div>

            {route.mode === "upload" ? (
              <div className="flex flex-col gap-2.5">
                <DropZone
                  label="Streckendatei hochladen"
                  hint="GPX, KML, GeoJSON oder Shapefile (.shp / gezippt .zip)"
                  accept=".gpx,.kml,.geojson,.shp,.zip,application/gpx+xml,application/vnd.google-earth.kml+xml,application/zip,application/x-esri-shape"
                  value={route.fileName}
                  onFile={(file) => void onRouteFile(file)}
                  onClear={() =>
                    updateRoute(project.id, { fileName: undefined, points: undefined })
                  }
                />
                {route.points && route.points.length >= 2 ? (
                  <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-primary-200 bg-primary-50/70 px-2.5 py-1 text-[11px] font-medium tabular-nums text-primary-800">
                    <Waypoints className="h-3.5 w-3.5" />
                    {route.points.length.toLocaleString("de-DE")} Punkte · ca.{" "}
                    {routeLengthKm(route.points).toLocaleString("de-DE")} km erkannt
                  </span>
                ) : null}
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <div>
                  <Label htmlFor="start">Start</Label>
                  <Input
                    id="start"
                    value={route.start ?? ""}
                    onChange={(e) => updateRoute(project.id, { start: e.target.value })}
                    placeholder="z.B. Hamburg"
                  />
                </div>
                <div>
                  <Label htmlFor="ziel">Ziel</Label>
                  <Input
                    id="ziel"
                    value={route.ziel ?? ""}
                    onChange={(e) => updateRoute(project.id, { ziel: e.target.value })}
                    placeholder="z.B. München"
                  />
                </div>
                <div>
                  <Label>Zwischenstationen</Label>
                  <div className="flex gap-2">
                    <Input
                      value={viaDraft}
                      onChange={(e) => setViaDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault()
                          addVia()
                        }
                      }}
                      placeholder="Ort hinzufügen"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={addVia}
                      aria-label="Zwischenstation hinzufügen"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  {(route.vias ?? []).length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {(route.vias ?? []).map((v, i) => (
                        <span
                          key={`${v}-${i}`}
                          className="inline-flex items-center gap-1 rounded-full border border-neutral-200 bg-neutral-50 py-1 pl-3 pr-1 text-xs text-neutral-700"
                        >
                          {v}
                          <button
                            type="button"
                            onClick={() => removeVia(i)}
                            aria-label={`${v} entfernen`}
                            className="rounded-full p-0.5 text-neutral-400 hover:bg-neutral-200 hover:text-neutral-700"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Transport-Stammdaten ── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Transport-Stammdaten</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <TransportDataForm
              value={project.transport}
              onChange={(patch) => updateTransport(project.id, patch)}
              disabled={running}
            />
            {isLadungZuSchwer(project.transport) ? (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800"
              >
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-red-600" />
                <span>
                  <strong>Gesamtgewicht zu niedrig.</strong> Das Ladungsgewicht (
                  <span className="tabular-nums">{project.transport.ladungsgewicht} t</span>) ist
                  größer als das Gesamtgewicht (
                  <span className="tabular-nums">{project.transport.gesamtgewicht} t</span>) — bitte
                  korrigieren.
                </span>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {/* ── Transport-Zeitraum ── */}
      <Card>
        <CardContent className="flex flex-col gap-3 p-4">
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
                  <label className="flex items-center gap-1.5 text-xs text-neutral-600">
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

                {/* Eine Zeile: Von [Datum] [Zeit] → Bis [Datum] [Zeit] */}
                <div className="flex flex-wrap items-center gap-2">
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
                    className="w-[150px]"
                  />
                  {!ganztaegigEffective ? (
                    <TimePicker
                      ariaLabel="Startuhrzeit"
                      value={splitDateTime(project.zeitraum?.von).time || ""}
                      onChange={(t) => {
                        const date = splitDateTime(project.zeitraum?.von).date
                        if (!date) return
                        // Setze Uhrzeit → ganztaegig explizit auf false (sonst wäre Default wieder true)
                        updateZeitraum(project.id, { von: `${date}T${t}`, ganztaegig: false })
                      }}
                      disabled={running}
                      className="w-[110px]"
                    />
                  ) : null}
                  <span aria-hidden className="px-1 text-neutral-400">
                    →
                  </span>
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
                    className="w-[150px]"
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
                      className="w-[110px]"
                    />
                  ) : null}

                  {project.zeitraum?.von &&
                  project.zeitraum?.bis &&
                  !isZeitraumInvalid(project.zeitraum) ? (
                    <span className="ml-auto rounded-md border border-primary-100 bg-primary-50/60 px-2 py-1 text-[11px] font-semibold tabular-nums text-primary-800">
                      {durationLabel(project.zeitraum.von, project.zeitraum.bis)}
                    </span>
                  ) : null}
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

      {/* ── Aktionsleiste ── */}
      <Card>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
              <div className="text-sm text-neutral-600">
                {project.status === "fertig" ? (
                  <span>
                    Auswertung abgeschlossen ·{" "}
                    <strong className="text-neutral-800">{project.findings.length} Funde</strong>{" "}
                    auf {project.distanzKm?.toLocaleString("de-DE")} km
                  </span>
                ) : routeReady ? (
                  "Bereit zur Auswertung."
                ) : (
                  "Strecke festlegen, um die Auswertung zu starten."
                )}
              </div>
              <div className="flex items-center gap-2">
                {project.status === "fertig" ? (
                  <Button
                    variant="outline"
                    onClick={() => navigate(`/projekte/${project.id}/karte`)}
                  >
                    Ergebnis öffnen <ArrowRight className="h-4 w-4" />
                  </Button>
                ) : null}
                <Button onClick={onRun} disabled={!routeReady}>
                  <Play className="h-4 w-4" />
                  {project.status === "fertig" ? "Erneut auswerten" : "Auswertung fahren"}
                </Button>
              </div>
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

/** True wenn die Ladung schwerer ist als das Gesamtgewicht (Plausibilitätsfehler). */
function isLadungZuSchwer(t: { gesamtgewicht?: number; ladungsgewicht?: number }): boolean {
  const ladung = t.ladungsgewicht
  const gesamt = t.gesamtgewicht
  if (typeof ladung !== "number" || ladung <= 0) return false
  if (typeof gesamt !== "number" || gesamt <= 0) return false
  return ladung > gesamt
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
