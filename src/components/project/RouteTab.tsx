// Reiter „Route": oben Strecken anlegen (Datei · Google-Link · Start/Ziel, Anzahl je Quelle
// als Badge), unten die Liste der angelegten Strecken mit Mini-Preview. Aus dem früheren
// AnlageTab herausgelöst, damit die Anlage-Seite (Stammdaten + Veröffentlichung) schlank bleibt.

import { useState } from "react"
import { toast } from "sonner"
import { Download, ExternalLink, FileDown, Link2, Loader2, MapPin, Navigation, Pencil, Route, Upload, X } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card"
import { Button } from "@/components/ui/Button"
import { Input, Label } from "@/components/ui/Input"
import { Dialog, DialogHeader } from "@/components/ui/Dialog"
import { DropZone } from "@/components/upload/DropZone"
import { PlaceAutocomplete } from "./PlaceAutocomplete"
import { RoutePreview } from "./RoutePreview"
import { DropdownMenu, DropdownItem } from "@/components/ui/DropdownMenu"
import { downloadKml, openInGoogleMaps } from "@/lib/routeExport"
import { useProjectStore } from "@/store/projects"
import { parseRouteFile, routeLengthKm } from "@/lib/parseRouteFile"
import { api, type RouteResult } from "@/api/roadmap"
import { ApiError } from "@/api/client"
import type { Project, ProjectRoute, RoutePoint, RouteSource } from "@/types/domain"
import { cn } from "@/lib/cn"

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

/** Download/Öffnen je Strecke: Google-Maps-Route (neuer Tab) oder KML (Datei).
 *  Beides aus der Punkt-Geometrie erzeugt — egal wie die Strecke entstand. */
function RouteDownloadMenu({ route }: { route: ProjectRoute }) {
  return (
    <DropdownMenu
      triggerLabel={`Strecke ${route.name} herunterladen oder öffnen`}
      trigger={
        <span
          title="Herunterladen / in Google Maps öffnen"
          className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
        >
          <Download className="h-4 w-4" />
        </span>
      }
    >
      <DropdownItem onClick={() => openInGoogleMaps(route)}>
        <ExternalLink className="h-4 w-4 text-neutral-400" /> In Google Maps öffnen
      </DropdownItem>
      <DropdownItem onClick={() => downloadKml(route)}>
        <FileDown className="h-4 w-4 text-neutral-400" /> Als KML herunterladen
      </DropdownItem>
    </DropdownMenu>
  )
}

export function RouteTab({ project }: { project: Project }) {
  const addRoute = useProjectStore((s) => s.addRoute)
  const removeRoute = useProjectStore((s) => s.removeRoute)
  const renameRoute = useProjectStore((s) => s.renameRoute)
  const running = useProjectStore((s) => s.analysis[project.id]?.running ?? false)

  const [tab, setTab] = useState<RouteSource>("datei")
  const [editRouteId, setEditRouteId] = useState<string | null>(null)
  const [editName, setEditName] = useState("")
  const [linkUrl, setLinkUrl] = useState("")
  const [linkBusy, setLinkBusy] = useState(false)
  const [szStart, setSzStart] = useState("")
  const [szZiel, setSzZiel] = useState("")
  const [szBusy, setSzBusy] = useState(false)
  // Datei geparst, wartet auf Namensvergabe (kleine Maske) vor dem Anlegen.
  const [pendingFile, setPendingFile] = useState<{ points: RoutePoint[]; fileName: string; suggest: string } | null>(null)
  const [pendingName, setPendingName] = useState("")

  const countBySource = (s: RouteSource) =>
    project.routes.filter((r) => (r.source ?? "datei") === s).length

  const addRouteFromResult = (res: RouteResult, name: string, source: RouteSource) => {
    addRoute(project.id, { name, points: res.points, source })
    const grob = res.provider.router === "fallback"
    toast.success(
      `Strecke „${name}" angelegt: ${res.points.length.toLocaleString("de-DE")} Punkte · ca. ${res.distanzKm.toLocaleString("de-DE", { maximumFractionDigits: 0 })} km` +
        (grob ? " (grobe Schätzung — Router nicht erreichbar)." : "."),
    )
  }

  const onRouteFile = async (file: File) => {
    try {
      const parsed = await parseRouteFile(file)
      // Nicht sofort anlegen: erst Namen vergeben lassen (keine Datei-Namen als Strecken-Namen).
      const suggest = file.name.replace(/\.(gpx|kml|geojson|json|zip|shp)$/i, "")
      setPendingFile({ points: parsed.points, fileName: file.name, suggest })
      setPendingName(suggest)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Datei konnte nicht gelesen werden.")
    }
  }

  const confirmPending = () => {
    if (!pendingFile) return
    const name = pendingName.trim()
    if (name.length < 2) return
    addRoute(project.id, { name, fileName: pendingFile.fileName, points: pendingFile.points, source: "datei" })
    toast.success(
      `Strecke „${name}" angelegt: ${pendingFile.points.length.toLocaleString("de-DE")} Punkte · ca. ${routeLengthKm(pendingFile.points).toLocaleString("de-DE")} km.`,
    )
    setPendingFile(null)
    setPendingName("")
  }

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

  const onStartZiel = async () => {
    const start = szStart.trim()
    const ziel = szZiel.trim()
    if (!start || !ziel) {
      toast.error("Bitte Start und Ziel angeben.")
      return
    }
    setSzBusy(true)
    try {
      const res = await api.route.startziel(start, ziel, [])
      addRouteFromResult(res, `${start} → ${ziel}`, "startziel")
      setSzStart("")
      setSzZiel("")
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Route konnte nicht berechnet werden.")
    } finally {
      setSzBusy(false)
    }
  }

  const commitRename = () => {
    if (editRouteId && editName.trim()) renameRoute(project.id, editRouteId, editName.trim())
    setEditRouteId(null)
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
      {/* ── Strecke hinzufügen ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Route className="h-4 w-4 text-primary-600" /> Strecke hinzufügen
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {/* Quelle wählen — Anzahl je Quelle als Badge */}
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

          {/* Quellen-Inhalt mit moderater Mindesthöhe → kein Springen beim Tab-Wechsel; oben ausgerichtet */}
          <div className="flex min-h-[116px] flex-col justify-start">
          {tab === "datei" ? (
            <DropZone
              compact
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
                  {linkBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
                  Laden
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {/* Start + Ziel nebeneinander (kompakt) */}
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <PlaceAutocomplete
                  value={szStart}
                  onChange={setSzStart}
                  placeholder="Start (Ort oder Adresse)"
                  disabled={szBusy}
                />
                <PlaceAutocomplete
                  value={szZiel}
                  onChange={setSzZiel}
                  placeholder="Ziel (Ort oder Adresse)"
                  disabled={szBusy}
                />
              </div>
              <div className="flex justify-end">
                <Button onClick={() => void onStartZiel()} disabled={szBusy || !szStart.trim() || !szZiel.trim()}>
                  {szBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Navigation className="h-4 w-4" />}
                  Route berechnen
                </Button>
              </div>
            </div>
          )}
          </div>

          {/* ── Angelegte Strecken — im selben Block, durch Trennlinie abgesetzt ── */}
          <div className="flex flex-col gap-3 border-t border-neutral-100 pt-4">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-primary-600" />
              <span className="text-sm font-semibold text-neutral-900">Angelegte Strecken</span>
              {project.routes.length > 0 ? (
                <span className="rounded-full bg-neutral-100 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-neutral-600">
                  {project.routes.length}
                </span>
              ) : null}
            </div>
          {project.routes.length === 0 ? (
            <p className="rounded-lg border border-dashed border-neutral-200 bg-neutral-50/50 px-4 py-8 text-center text-sm text-neutral-500">
              Noch keine Strecke. Oben über Datei, Google-Link oder Start / Ziel anlegen.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {project.routes.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center gap-3 rounded-lg border border-neutral-200 bg-white px-3 py-2"
                >
                  <RoutePreview points={r.points} color={r.farbe} />
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
                      {SOURCE_LABEL[r.source ?? "datei"]} · {r.fileName ? `${r.fileName} · ` : ""}
                      {r.points.length.toLocaleString("de-DE")} Punkte · ca.{" "}
                      {routeLengthKm(r.points).toLocaleString("de-DE")} km
                    </p>
                  </div>
                  <RouteDownloadMenu route={r} />
                  <button
                    type="button"
                    onClick={() => {
                      setEditRouteId(r.id)
                      setEditName(r.name)
                    }}
                    aria-label={`Strecke ${r.name} umbenennen`}
                    disabled={running}
                    className="rounded-md p-1.5 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm(`Strecke „${r.name}" wirklich entfernen? Das kann nicht rückgängig gemacht werden.`)) {
                        removeRoute(project.id, r.id)
                      }
                    }}
                    aria-label={`Strecke ${r.name} entfernen`}
                    disabled={running}
                    className="rounded-md p-1.5 text-neutral-400 transition-colors hover:bg-severity-kritisch-bg hover:text-severity-kritisch"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          </div>
        </CardContent>
      </Card>

      {pendingFile ? (
        <Dialog open onClose={() => setPendingFile(null)} size="sm">
          <DialogHeader
            title="Strecke benennen"
            subtitle={`${pendingFile.fileName} · ${pendingFile.points.length.toLocaleString("de-DE")} Punkte`}
            onClose={() => setPendingFile(null)}
          />
          <div className="px-6 py-5">
            <Label htmlFor="route-name">Name der Strecke</Label>
            <Input
              id="route-name"
              autoFocus
              value={pendingName}
              onChange={(e) => setPendingName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") confirmPending()
              }}
              placeholder="z.B. Hinfahrt Werk → Baustelle"
              maxLength={80}
            />
            <p className="mt-1.5 text-xs text-neutral-400">Sprechender Name statt Dateiname — 2–80 Zeichen.</p>
          </div>
          <div className="flex items-center justify-end gap-2 border-t border-neutral-200 px-6 py-4">
            <Button variant="ghost" onClick={() => setPendingFile(null)}>
              Abbrechen
            </Button>
            <Button onClick={confirmPending} disabled={pendingName.trim().length < 2}>
              Strecke anlegen
            </Button>
          </div>
        </Dialog>
      ) : null}
    </div>
  )
}
