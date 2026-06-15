// Tab 1 — Strecken (Mehrfach-Upload mit Farben) + Transport-Stammdaten + Zeitraum +
// Analyse-Start + Veröffentlichen. Start/Ziel-Routing kommt in einem späteren Update.

import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { toast } from "sonner"
import {
  AlertTriangle,
  ArrowRight,
  CalendarRange,
  Check,
  Link2,
  Loader2,
  Navigation,
  Pencil,
  Play,
  Plus,
  Route,
  Upload,
  Waypoints,
  X,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { TimePicker } from "@/components/ui/TimePicker"
import { DropZone } from "@/components/upload/DropZone"
import { TransportDataForm } from "./TransportDataForm"
import { PublishCard } from "./PublishCard"
import { ANALYSE_SCHRITTE, useProjectStore } from "@/store/projects"
import { useDataSourceStore } from "@/store/datasource"
import { parseRouteFile, routeLengthKm } from "@/lib/parseRouteFile"
import { api, type RouteResult } from "@/api/roadmap"
import { ApiError } from "@/api/client"
import type { Project, RouteSource } from "@/types/domain"
import { cn } from "@/lib/cn"
import { formatStampDE } from "@/lib/format"

type StreckeTab = RouteSource // "datei" | "link" | "startziel"

/** Die drei Strecken-Quellen (= Tabs). Reihenfolge: Datei · Google-Link · Start/Ziel. */
const STRECKE_TABS = [
  { id: "datei", label: "Datei", icon: Upload },
  { id: "link", label: "Google-Link", icon: Link2 },
  { id: "startziel", label: "Start / Ziel", icon: Navigation },
] as const

const SOURCE_LABEL: Record<RouteSource, string> = {
  datei: "Datei",
  link: "Google-Link",
  startziel: "Start/Ziel",
}

export function AnlageTab({ project }: { project: Project }) {
  const navigate = useNavigate()
  const addRoute = useProjectStore((s) => s.addRoute)
  const removeRoute = useProjectStore((s) => s.removeRoute)
  const renameRoute = useProjectStore((s) => s.renameRoute)
  const updateTransport = useProjectStore((s) => s.updateTransport)
  const updateZeitraum = useProjectStore((s) => s.updateZeitraum)
  const runAnalysis = useProjectStore((s) => s.runAnalysis)
  const analysis = useProjectStore((s) => s.analysis[project.id])
  const mode = useDataSourceStore((s) => s.mode)

  const [tab, setTab] = useState<StreckeTab>("datei")
  const [editRouteId, setEditRouteId] = useState<string | null>(null)
  const [editName, setEditName] = useState("")
  // Link-Tab (Google-Maps) + Start/Ziel-Tab
  const [linkUrl, setLinkUrl] = useState("")
  const [linkBusy, setLinkBusy] = useState(false)
  const [szStart, setSzStart] = useState("")
  const [szZiel, setSzZiel] = useState("")
  const [szVias, setSzVias] = useState<string[]>([])
  const [szBusy, setSzBusy] = useState(false)

  const running = analysis?.running ?? false
  const routeReady = project.routes.some((r) => r.points.length >= 2)
  const countBySource = (s: RouteSource) =>
    project.routes.filter((r) => (r.source ?? "datei") === s).length

  /** Gemeinsamer Abschluss: berechnete Strecke als weitere Route anhängen + melden. */
  const addRouteFromResult = (res: RouteResult, name: string, source: RouteSource) => {
    addRoute(project.id, { name, points: res.points, source })
    const grob = res.provider.router === "fallback"
    toast.success(
      `Strecke „${name}" angelegt: ${res.points.length.toLocaleString("de-DE")} Punkte · ca. ${res.distanzKm.toLocaleString("de-DE", { maximumFractionDigits: 0 })} km` +
        (grob ? " (grobe Schätzung — Router nicht erreichbar)" : "."),
    )
  }

  /** Upload: GPX/KML/GeoJSON/Shapefile parsen → als weitere Strecke anhängen. */
  const onRouteFile = async (file: File) => {
    try {
      const parsed = await parseRouteFile(file)
      const name = file.name.replace(/\.(gpx|kml|geojson|json|zip|shp)$/i, "")
      addRoute(project.id, { name, fileName: file.name, points: parsed.points, source: "datei" })
      toast.success(
        `Strecke „${name}" geladen: ${parsed.points.length.toLocaleString("de-DE")} Punkte · ca. ${routeLengthKm(parsed.points).toLocaleString("de-DE")} km.`,
      )
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Datei konnte nicht gelesen werden.")
    }
  }

  /** Google-Maps-Link → Wegpunkte → optimaler Straßenweg (Router). */
  const onLinkLoad = async () => {
    const url = linkUrl.trim()
    if (!url) {
      toast.error("Bitte einen Google-Maps-Link einfügen.")
      return
    }
    setLinkBusy(true)
    try {
      const res = await api.route.maps(url)
      addRouteFromResult(res, "Google-Maps-Route", "link")
      setLinkUrl("")
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Link konnte nicht verarbeitet werden.")
    } finally {
      setLinkBusy(false)
    }
  }

  /** Start + Ziel (+ Zwischenstopps) → optimaler Straßenweg (Router). */
  const onStartZiel = async () => {
    const start = szStart.trim()
    const ziel = szZiel.trim()
    if (!start || !ziel) {
      toast.error("Bitte Start und Ziel angeben.")
      return
    }
    setSzBusy(true)
    try {
      const vias = szVias.map((v) => v.trim()).filter(Boolean)
      const res = await api.route.startziel(start, ziel, vias)
      addRouteFromResult(res, `${start} → ${ziel}`, "startziel")
      setSzStart("")
      setSzZiel("")
      setSzVias([])
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Route konnte nicht berechnet werden.")
    } finally {
      setSzBusy(false)
    }
  }

  const startRename = (routeId: string, current: string) => {
    setEditRouteId(routeId)
    setEditName(current)
  }
  const commitRename = () => {
    if (editRouteId && editName.trim()) renameRoute(project.id, editRouteId, editName.trim())
    setEditRouteId(null)
  }

  const onRun = () => {
    if (!routeReady) {
      toast.error("Bitte zuerst mindestens eine Strecke hochladen.")
      return
    }
    runAnalysis(project.id)
    toast.info("Auswertung gestartet …")
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* ── Strecken ── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Route className="h-4 w-4 text-primary-600" /> Strecken
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {/* Alle Strecken — quellenübergreifend (Datei / Google-Link / Start-Ziel) */}
            {project.routes.length > 0 ? (
              <ul className="flex flex-col gap-2">
                {project.routes.map((r) => (
                  <li
                    key={r.id}
                    className="flex items-center gap-2.5 rounded-lg border border-neutral-200 bg-white px-3 py-2"
                  >
                    <span
                      className="h-3 w-3 shrink-0 rounded-full ring-2 ring-white"
                      style={{ background: r.farbe }}
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      {editRouteId === r.id ? (
                        <Input
                          autoFocus
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          onBlur={commitRename}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") commitRename()
                            if (e.key === "Escape") setEditRouteId(null)
                          }}
                          className="h-7 text-sm"
                        />
                      ) : (
                        <p className="truncate text-sm font-medium text-neutral-800">{r.name}</p>
                      )}
                      <p className="truncate text-xs tabular-nums text-neutral-400">
                        {SOURCE_LABEL[r.source ?? "datei"]} ·{" "}
                        {r.fileName ? `${r.fileName} · ` : ""}
                        {r.points.length.toLocaleString("de-DE")} Punkte · ca.{" "}
                        {routeLengthKm(r.points).toLocaleString("de-DE")} km
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => startRename(r.id, r.name)}
                      aria-label={`Strecke ${r.name} umbenennen`}
                      disabled={running}
                      className="rounded-md p-1.5 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeRoute(project.id, r.id)}
                      aria-label={`Strecke ${r.name} entfernen`}
                      disabled={running}
                      className="rounded-md p-1.5 text-neutral-400 transition-colors hover:bg-severity-kritisch-bg hover:text-severity-kritisch"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            {project.routes.length > 1 ? (
              <p className="flex items-center gap-1.5 text-xs text-neutral-400">
                <Waypoints className="h-3.5 w-3.5" />
                Alle Strecken erscheinen farblich getrennt auf der Karte — einzeln
                ein-/ausblendbar.
              </p>
            ) : null}

            {/* Strecke hinzufügen — Quelle wählen (Anzahl je Quelle als Badge) */}
            <div className="inline-flex w-full rounded-md border border-neutral-200 bg-neutral-50 p-1">
              {STRECKE_TABS.map((opt) => {
                const n = countBySource(opt.id)
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setTab(opt.id)}
                    className={cn(
                      "flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded px-2.5 py-1.5 text-sm font-medium transition-colors",
                      tab === opt.id
                        ? "bg-white text-primary-700 shadow-sm"
                        : "text-neutral-500 hover:text-neutral-700",
                    )}
                  >
                    <opt.icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{opt.label}</span>
                    {n > 0 ? (
                      <span
                        className={cn(
                          "inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold leading-none",
                          tab === opt.id
                            ? "bg-primary-100 text-primary-700"
                            : "bg-neutral-200 text-neutral-600",
                        )}
                      >
                        {n}
                      </span>
                    ) : null}
                  </button>
                )
              })}
            </div>

            {tab === "datei" ? (
              <DropZone
                label={
                  project.routes.length > 0
                    ? "Weitere Strecke hochladen (z.B. Rückfahrt)"
                    : "Streckendatei hochladen"
                }
                hint="GPX, KML, GeoJSON oder Shapefile (.zip mit .prj / .shp)"
                accept=".gpx,.kml,.geojson,.json,.shp,.zip,application/gpx+xml,application/vnd.google-earth.kml+xml,application/zip,application/x-esri-shape"
                onFile={(file) => void onRouteFile(file)}
              />
            ) : tab === "link" ? (
              <div className="flex flex-col gap-2.5">
                <p className="text-xs text-neutral-500">
                  Google-Maps-Routenlink einfügen (Wegbeschreibung mit Start und Ziel). Der Link wird
                  aufgelöst und der optimale Straßenweg berechnet.
                </p>
                <div className="flex gap-2">
                  <Input
                    value={linkUrl}
                    onChange={(e) => setLinkUrl(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void onLinkLoad()
                    }}
                    placeholder="https://maps.app.goo.gl/… oder google.com/maps/dir/…"
                    disabled={linkBusy}
                    className="flex-1"
                  />
                  <Button onClick={() => void onLinkLoad()} disabled={linkBusy || !linkUrl.trim()}>
                    {linkBusy ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Link2 className="h-4 w-4" />
                    )}
                    Laden
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-2.5">
                <Input
                  value={szStart}
                  onChange={(e) => setSzStart(e.target.value)}
                  placeholder="Start (Ort oder Adresse)"
                  disabled={szBusy}
                />
                {szVias.map((v, i) => (
                  <div key={i} className="flex gap-2">
                    <Input
                      value={v}
                      onChange={(e) =>
                        setSzVias((arr) => arr.map((x, j) => (j === i ? e.target.value : x)))
                      }
                      placeholder={`Zwischenstopp ${i + 1}`}
                      disabled={szBusy}
                      className="flex-1"
                    />
                    <button
                      type="button"
                      onClick={() => setSzVias((arr) => arr.filter((_, j) => j !== i))}
                      aria-label={`Zwischenstopp ${i + 1} entfernen`}
                      disabled={szBusy}
                      className="rounded-md p-2 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                <Input
                  value={szZiel}
                  onChange={(e) => setSzZiel(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void onStartZiel()
                  }}
                  placeholder="Ziel (Ort oder Adresse)"
                  disabled={szBusy}
                />
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setSzVias((a) => [...a, ""])}
                    disabled={szBusy}
                    className="inline-flex items-center gap-1 text-xs font-medium text-primary-600 transition-colors hover:text-primary-700 disabled:opacity-50"
                  >
                    <Plus className="h-3.5 w-3.5" /> Zwischenstopp
                  </button>
                  <Button
                    onClick={() => void onStartZiel()}
                    disabled={szBusy || !szStart.trim() || !szZiel.trim()}
                  >
                    {szBusy ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Navigation className="h-4 w-4" />
                    )}
                    Route berechnen
                  </Button>
                </div>
                <p className="text-[11px] text-neutral-400">
                  Optimaler Weg ohne LKW-Restriktionen — die Restriktionen prüft anschließend die
                  Auswertung gegen die Hindernis-Datenbank.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Transport-Stammdaten ── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Transport-Stammdaten</CardTitle>
          </CardHeader>
          <CardContent>
            <TransportDataForm
              value={project.transport}
              onChange={(patch) => updateTransport(project.id, patch)}
              disabled={running}
            />
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
                  <label className="flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-xs text-neutral-600 transition-colors duration-200 hover:bg-neutral-50">
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

      {/* ── Auswertung-Block (Status + Aktionen) ── */}
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
                    {project.routes.length > 1 ? ` (${project.routes.length} Strecken)` : ""}
                  </span>
                ) : routeReady ? (
                  "Bereit zur Auswertung."
                ) : (
                  "Strecke hochladen, um die Auswertung zu starten."
                )}
              </div>
              {/* Aktionen nebeneinander: „Ergebnis öffnen" links, „Erneut auswerten" rechts
                  (etwas breiter). „Letzter Stand" hängt direkt unter dem Auswerten-Button,
                  im selben relativen Format wie der Header-Sync (heute/gestern/Datum). */}
              <div className="flex flex-wrap items-start justify-end gap-2">
                {project.status === "fertig" ? (
                  <Button
                    variant="outline"
                    onClick={() => navigate(`/projekte/${project.id}/karte`)}
                  >
                    Ergebnis öffnen <ArrowRight className="h-4 w-4" />
                  </Button>
                ) : null}
                <div className="flex flex-col gap-1">
                  <Button className="min-w-[210px]" onClick={onRun} disabled={!routeReady}>
                    <Play className="h-4 w-4" />
                    {project.status === "fertig" ? "Erneut auswerten" : "Auswertung starten"}
                  </Button>
                  {project.status === "fertig" ? (
                    <p className="whitespace-nowrap text-center text-xs text-neutral-400">
                      Letzter Stand: {formatStampDE(project.updatedAt)}
                    </p>
                  ) : null}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* ── Veröffentlichen — eigener Block (getrennt von der Auswertung) ── */}
      {project.status === "fertig" && mode === "live" && !running ? (
        <Card>
          <CardContent className="p-4">
            <PublishCard project={project} />
          </CardContent>
        </Card>
      ) : null}
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
