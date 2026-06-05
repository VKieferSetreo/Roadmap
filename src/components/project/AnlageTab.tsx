// Tab 1 — Streckeneingabe (Upload ODER Start/Ziel) + Transport-Stammdaten + Analyse-Start.

import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { toast } from "sonner"
import { ArrowRight, MapPin, Play, Plus, Route, Upload, X } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card"
import { Button } from "@/components/ui/Button"
import { Input, Label } from "@/components/ui/Input"
import { DropZone } from "@/components/upload/DropZone"
import { TransportDataForm } from "./TransportDataForm"
import { useProjectStore } from "@/store/projects"
import type { Project, RouteMode } from "@/types/domain"
import { cn } from "@/lib/cn"

export function AnlageTab({ project }: { project: Project }) {
  const navigate = useNavigate()
  const updateRoute = useProjectStore((s) => s.updateRoute)
  const updateTransport = useProjectStore((s) => s.updateTransport)
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
              <DropZone
                label="Streckendatei hochladen"
                hint="GPX, KML oder GeoJSON"
                accept=".gpx,.kml,.geojson,application/gpx+xml,application/vnd.google-earth.kml+xml"
                value={route.fileName}
                onFile={(file) => updateRoute(project.id, { fileName: file.name })}
                onClear={() => updateRoute(project.id, { fileName: undefined })}
              />
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
                    <Button type="button" variant="outline" size="icon" onClick={addVia} aria-label="Zwischenstation hinzufügen">
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
          <CardContent>
            <TransportDataForm
              value={project.transport}
              onChange={(patch) => updateTransport(project.id, patch)}
              disabled={running}
            />
          </CardContent>
        </Card>
      </div>

      {/* ── Aktionsleiste ── */}
      <Card>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {running ? (
            <div className="w-full">
              <div className="mb-1.5 flex items-center justify-between text-sm">
                <span className="font-medium text-neutral-700">{analysis?.step}</span>
                <span className="tabular-nums text-neutral-500">{Math.round(analysis?.progress ?? 0)}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-100">
                <div
                  className="h-full rounded-full bg-primary-500 transition-all duration-300"
                  style={{ width: `${analysis?.progress ?? 0}%` }}
                />
              </div>
            </div>
          ) : (
            <>
              <div className="text-sm text-neutral-600">
                {project.status === "fertig" ? (
                  <span>
                    Auswertung abgeschlossen ·{" "}
                    <strong className="text-neutral-800">{project.findings.length} Funde</strong> auf{" "}
                    {project.distanzKm?.toLocaleString("de-DE")} km
                  </span>
                ) : routeReady ? (
                  "Bereit zur Auswertung."
                ) : (
                  "Strecke festlegen, um die Auswertung zu starten."
                )}
              </div>
              <div className="flex items-center gap-2">
                {project.status === "fertig" ? (
                  <Button variant="outline" onClick={() => navigate(`/projekte/${project.id}/karte`)}>
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
