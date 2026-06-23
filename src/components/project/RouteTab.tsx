// Reiter „Route": oben Strecken anlegen (Datei · Google-Link · Start/Ziel, Anzahl je Quelle
// als Badge), unten die Liste der angelegten Strecken mit Mini-Preview. Aus dem früheren
// AnlageTab herausgelöst, damit die Anlage-Seite (Stammdaten + Veröffentlichung) schlank bleibt.

import { useState } from "react"
import { toast } from "sonner"
import { Download, ExternalLink, FileDown, FileText, Flag, Link2, Loader2, MapPin, MapPinned, Navigation, Pencil, Play, Plus, Route, Upload, X } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card"
import { Button } from "@/components/ui/Button"
import { Input, Label } from "@/components/ui/Input"
import { Dialog, DialogHeader } from "@/components/ui/Dialog"
import { DropZone } from "@/components/upload/DropZone"
import { PlaceAutocomplete } from "./PlaceAutocomplete"
import { MapPointPicker } from "./MapPointPicker"
import { RoutePreview } from "./RoutePreview"
import { RouteEditDialog } from "./RouteEditDialog"
import { DropdownMenu, DropdownItem } from "@/components/ui/DropdownMenu"
import { downloadKml, openInGoogleMaps } from "@/lib/routeExport"
import { useProjectStore } from "@/store/projects"
import { parseRouteFile, routeLengthKm } from "@/lib/parseRouteFile"
import { parseGpkg, type GpkgRoute } from "@/lib/parseGpkg"
import { GpkgRouteSelectDialog } from "./GpkgRouteSelectDialog"
import { VemagsRouteSelectDialog } from "./VemagsRouteSelectDialog"
import { api, type RouteResult, type VemagsResult } from "@/api/roadmap"
import { ApiError } from "@/api/client"
import type { Project, ProjectRoute, RoutePoint, RouteSource } from "@/types/domain"
import { cn } from "@/lib/cn"

// #9: Ein Start/Ziel/Zwischenpunkt. label = Anzeige + Geocoding-Text; lat/lng = exakte Pin-Position.
type SzPoint = { id: string; label: string; lat: number | null; lng: number | null }
const makeSzPoint = (): SzPoint => ({ id: crypto.randomUUID(), label: "", lat: null, lng: null })
// Routing-Wert: exakte Koordinate (Picker) als "lat,lng", sonst der Label-Text (Backend geokodiert).
const szValue = (p: SzPoint) => (p.lat != null && p.lng != null ? `${p.lat},${p.lng}` : p.label.trim())

/** Die Strecken-Quellen (= Tabs). Reihenfolge (Max): Datei · VEMAGS · Google-Link · Start/Ziel. */
const STRECKE_TABS = [
  { id: "datei", label: "Datei", icon: Upload },
  { id: "vemags", label: "Vemags", icon: FileText },
  { id: "link", label: "Google-Link", icon: Link2 },
  { id: "startziel", label: "Start / Ziel", icon: Navigation },
] as const

const SOURCE_LABEL: Record<RouteSource, string> = {
  datei: "Datei",
  link: "Google-Link",
  startziel: "Start/Ziel",
  vemags: "VEMAGS-Bescheid",
}

/** PDF → base64 (ohne data:-Präfix) für den serverseitigen In-memory-Parse. */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ""))
    reader.onerror = () => reject(reader.error ?? new Error("Datei konnte nicht gelesen werden."))
    reader.readAsDataURL(file)
  })
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
  const updateTransport = useProjectStore((s) => s.updateTransport)
  const running = useProjectStore((s) => s.analysis[project.id]?.running ?? false)

  const [tab, setTab] = useState<RouteSource>("datei")
  /** Strecke im Editor (T-197), null = geschlossen. */
  const [editRoute, setEditRoute] = useState<ProjectRoute | null>(null)
  const [linkUrl, setLinkUrl] = useState("")
  const [linkBusy, setLinkBusy] = useState(false)
  // #9: Start/Ziel + optionale Zwischenpunkte (untereinander, je Punkt Ortssuche ODER Karten-Pin).
  // lat/lng gesetzt = exakte Pin-Position (geht als "lat,lng" durch, Backend geokodiert NICHT neu);
  // sonst geokodiert das Backend den Label-Text.
  const [szPoints, setSzPoints] = useState<SzPoint[]>(() => [makeSzPoint(), makeSzPoint()])
  const [pickerIdx, setPickerIdx] = useState<number | null>(null)
  const [szBusy, setSzBusy] = useState(false)
  // Geparste/geladene Strecke, wartet auf Namensvergabe (kleine Maske) vor dem Anlegen.
  // Gilt für KML-Datei UND Google-Link (Max-Wunsch: bei beiden Namen vergeben; nur GeoPackage
  // bringt native Tabellennamen mit und überspringt die Maske).
  const [pendingFile, setPendingFile] = useState<
    { points: RoutePoint[]; fileName?: string; suggest: string; source: RouteSource; grob?: boolean } | null
  >(null)
  const [pendingName, setPendingName] = useState("")
  // #15: GeoPackage mit mehreren Strecken → Auswahl-Maske.
  const [gpkg, setGpkg] = useState<{ fileName: string; routes: GpkgRoute[] } | null>(null)
  const [gpkgBusy, setGpkgBusy] = useState(false)
  // T-567: VEMAGS-Bescheid wird hochgeladen + serverseitig geparst (PDF nie gespeichert).
  const [vemagsBusy, setVemagsBusy] = useState(false)
  // Geparstes VEMAGS-Ergebnis → Auswahl-Maske (welche Fahrtwegteile laden), analog zu GeoPackage.
  const [vemags, setVemags] = useState<{ fileName: string; result: VemagsResult } | null>(null)

  const addRouteFromResult = (res: RouteResult, name: string, source: RouteSource) => {
    // T-480: Luftlinie-Fallback dauerhaft an der Strecke vermerken (gestrichelt + Banner),
    // nicht nur als Einmal-Toast — sonst sieht die grobe Schätzung nach Reload wie ein echter Weg aus.
    const grob = res.provider.router === "fallback"
    addRoute(project.id, { name, points: res.points, source, ...(grob ? { grob: true } : {}) })
    toast.success(
      `Strecke „${name}" angelegt: ${res.points.length.toLocaleString("de-DE")} Punkte · ca. ${res.distanzKm.toLocaleString("de-DE", { maximumFractionDigits: 0 })} km` +
        (grob ? " (grobe Schätzung, Router nicht erreichbar)." : "."),
    )
  }

  const onRouteFile = async (file: File) => {
    const name = file.name.toLowerCase()
    // #15: NUR KML (eine Strecke) + GPKG (mehrere → Auswahl-Maske). VEMAGS-Bescheide (PDF) laufen
    // bewusst NUR über den eigenen Tab „VEMAGS-Bescheid" (Max 2026-06-23), nicht hier.
    if (name.endsWith(".gpkg")) {
      try {
        const routes = await parseGpkg(file)
        if (routes.length === 0) {
          toast.error("Keine Strecken im GeoPackage gefunden.")
          return
        }
        setGpkg({ fileName: file.name, routes })
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "GeoPackage konnte nicht gelesen werden.")
      }
      return
    }
    if (!name.endsWith(".kml")) {
      toast.error("Nur KML- oder GeoPackage-Dateien (.kml, .gpkg).")
      return
    }
    try {
      const parsed = await parseRouteFile(file)
      // Nicht sofort anlegen: erst Namen vergeben lassen (keine Datei-Namen als Strecken-Namen).
      const suggest = file.name.replace(/\.kml$/i, "")
      setPendingFile({ points: parsed.points, fileName: file.name, suggest, source: "datei" })
      setPendingName(suggest)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Datei konnte nicht gelesen werden.")
    }
  }

  // #15: gewählte GeoPackage-Strecken als einzelne Strecken anlegen.
  const loadGpkgRoutes = (selected: GpkgRoute[]) => {
    setGpkgBusy(true)
    for (const r of selected) {
      addRoute(project.id, { name: r.name, fileName: gpkg?.fileName, points: r.points, source: "datei" })
    }
    toast.success(`${selected.length} Strecke${selected.length === 1 ? "" : "n"} aus GeoPackage angelegt.`)
    setGpkgBusy(false)
    setGpkg(null)
  }

  const confirmPending = () => {
    if (!pendingFile) return
    const name = pendingName.trim()
    if (name.length < 2) return
    const grob = pendingFile.grob === true
    addRoute(project.id, {
      name,
      fileName: pendingFile.fileName,
      points: pendingFile.points,
      source: pendingFile.source,
      ...(grob ? { grob: true } : {}),
    })
    toast.success(
      `Strecke „${name}" angelegt: ${pendingFile.points.length.toLocaleString("de-DE")} Punkte · ca. ${routeLengthKm(pendingFile.points).toLocaleString("de-DE")} km` +
        (grob ? " (grobe Schätzung, Router nicht erreichbar)." : "."),
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
      // Wie KML: erst Namen vergeben lassen (Maske), dann anlegen — kein stiller „Google-Maps-Route".
      setPendingFile({
        points: res.points,
        suggest: "Google-Maps-Route",
        source: "link",
        grob: res.provider.router === "fallback",
      })
      setPendingName("Google-Maps-Route")
      setLinkUrl("")
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Link konnte nicht verarbeitet werden.")
    } finally {
      setLinkBusy(false)
    }
  }

  // #9 Punkt-Handler. Tippen → Label setzen + Pin-Koordinate verwerfen (re-geocoden). Picker → Label+Koord.
  const setPointLabel = (i: number, label: string) =>
    setSzPoints((ps) => ps.map((p, idx) => (idx === i ? { ...p, label, lat: null, lng: null } : p)))
  const setPointFromPicker = (i: number, r: { lat: number; lng: number; label: string }) =>
    setSzPoints((ps) => ps.map((p, idx) => (idx === i ? { ...p, label: r.label, lat: r.lat, lng: r.lng } : p)))
  const addViaAfter = (i: number) => setSzPoints((ps) => [...ps.slice(0, i + 1), makeSzPoint(), ...ps.slice(i + 1)])
  const removeVia = (i: number) => setSzPoints((ps) => (ps.length <= 2 ? ps : ps.filter((_, idx) => idx !== i)))

  const onStartZiel = async () => {
    const startVal = szValue(szPoints[0])
    const zielVal = szValue(szPoints[szPoints.length - 1])
    if (!startVal || !zielVal) {
      toast.error("Bitte Start und Ziel angeben.")
      return
    }
    const vias = szPoints.slice(1, -1).map(szValue).filter(Boolean)
    setSzBusy(true)
    try {
      const res = await api.route.startziel(startVal, zielVal, vias)
      const nameOf = (p: SzPoint) => p.label.trim() || szValue(p)
      addRouteFromResult(res, `${nameOf(szPoints[0])} → ${nameOf(szPoints[szPoints.length - 1])}`, "startziel")
      setSzPoints([makeSzPoint(), makeSzPoint()])
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Route konnte nicht berechnet werden.")
    } finally {
      setSzBusy(false)
    }
  }

  // T-567: VEMAGS-Bescheid (PDF) → Server extrahiert Fahrtweg (Punkt 9) + Maße. Pro Fahrtwegteil
  // eine Strecke anlegen, Maße in die Fahrzeug-Spec übernehmen. PDF wird nie gespeichert.
  const onVemagsFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      toast.error("Bitte einen VEMAGS-Bescheid als PDF hochladen.")
      return
    }
    if (file.size > 12 * 1024 * 1024) {
      toast.error("PDF zu groß (max. 12 MB).")
      return
    }
    setVemagsBusy(true)
    try {
      const res = await api.route.vemags(await fileToBase64(file))
      if (res.strecken.filter((s) => s.points.length >= 2).length === 0) {
        toast.error("Aus dem Bescheid konnte keine Strecke rekonstruiert werden.")
        return
      }
      // Nicht sofort laden: Auswahl-Maske öffnen (welche Fahrtwegteile), analog GeoPackage.
      setVemags({ fileName: file.name, result: res })
    } catch (err) {
      toast.error(
        err instanceof ApiError
          ? err.status === 404
            ? "Der VEMAGS-Upload ist derzeit deaktiviert."
            : err.message
          : "Bescheid konnte nicht verarbeitet werden.",
      )
    } finally {
      setVemagsBusy(false)
    }
  }

  // Gewählte VEMAGS-Fahrtwegteile als Strecken anlegen + Maße aus dem Bescheid übernehmen.
  const loadVemagsRoutes = (selected: VemagsResult["strecken"]) => {
    if (!vemags) return
    const ok = selected.filter((s) => s.points.length >= 2)
    if (ok.length === 0) return
    const { laengeM, breiteM, hoeheM, masseT } = vemags.result.spec
    const specPatch = {
      ...(laengeM != null && { laenge: laengeM }),
      ...(breiteM != null && { breite: breiteM }),
      ...(hoeheM != null && { hoehe: hoeheM }),
      ...(masseT != null && { gesamtgewicht: masseT }),
    }
    if (Object.keys(specPatch).length > 0) updateTransport(project.id, specPatch)
    for (const s of ok) {
      addRoute(project.id, { name: s.name, points: s.points, source: "vemags", ...(s.grob ? { grob: true } : {}) })
    }
    const massText = Object.keys(specPatch).length
      ? ` · Maße übernommen (${[laengeM && `L ${laengeM} m`, breiteM && `B ${breiteM} m`, hoeheM && `H ${hoeheM} m`, masseT && `${masseT} t`].filter(Boolean).join(" · ")})`
      : ""
    toast.success(
      `${ok.length} Strecke${ok.length === 1 ? "" : "n"} aus VEMAGS-Bescheid rekonstruiert${massText}. Vor der Fahrt prüfen.`,
    )
    setVemags(null)
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
          {/* Quelle wählen */}
          <div className="inline-flex w-full rounded-md border border-neutral-200 bg-neutral-50 p-1">
            {STRECKE_TABS.map((opt) => {
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
                </button>
              )
            })}
          </div>

          {/* Quellen-Inhalt mit moderater Mindesthöhe → kein Springen beim Tab-Wechsel; oben ausgerichtet */}
          <div className="flex min-h-[116px] flex-col justify-start">
          {tab === "datei" ? (
            <div className="flex flex-col gap-2.5">
              <p className="text-xs text-neutral-500">
                Streckendatei hochladen. KML enthält eine Strecke, GeoPackage (.gpkg) mehrere zur
                Auswahl. Die geladene Strecke wird 1:1 übernommen und nicht optimiert oder verändert.
              </p>
              <DropZone
                compact
                label={
                  project.routes.length > 0
                    ? "Weitere Strecke hochladen"
                    : "Streckendatei hochladen"
                }
                hint="KML (eine Strecke) oder GeoPackage (.gpkg, mehrere Strecken zur Auswahl)"
                accept=".kml,.gpkg,application/vnd.google-earth.kml+xml,application/geopackage+sqlite3"
                onFile={(file) => void onRouteFile(file)}
              />
            </div>
          ) : tab === "link" ? (
            <div className="flex flex-col gap-2.5">
              <p className="text-xs text-neutral-500">
                Google-Maps-Routenlink (Wegbeschreibung mit Start und Ziel) einfügen. Die im Link
                hinterlegte Strecke wird inklusive aller gesetzten Zwischenstopps 1:1 übernommen. Es
                wird nichts optimiert oder verändert.
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
          ) : tab === "vemags" ? (
            <div className="flex flex-col gap-2.5">
              <p className="text-xs text-neutral-500">
                VEMAGS-Genehmigungsbescheid hochladen. Fahrtweg und Maße werden ausgelesen und je
                Fahrtwegteil als Strecke rekonstruiert; das PDF wird nicht gespeichert. Je nach
                Dokumentenqualität sind Abweichungen von der Originalstrecke möglich.
              </p>
              {vemagsBusy ? (
                <div className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-neutral-200 bg-neutral-50/50 px-4 py-8 text-sm text-neutral-500">
                  <Loader2 className="h-4 w-4 animate-spin" /> Bescheid wird ausgewertet …
                </div>
              ) : (
                <DropZone
                  compact
                  label="VEMAGS-Bescheid hochladen"
                  hint="Der Fahrtweg wird basierend auf den Rohdaten rekonstruiert und kann Fehler aufweisen."
                  accept=".pdf,application/pdf"
                  onFile={(file) => void onVemagsFile(file)}
                />
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              <p className="mb-1.5 text-xs text-neutral-500">
                Start und Ziel als Ort oder Adresse eingeben; die Route wird über das Straßennetz
                berechnet und als Strecke angelegt. Zwischen zwei Feldern erscheint beim Überfahren
                ein Plus, mit dem sich ein Zwischenpunkt einfügen lässt.
              </p>
              {/* #9: Start/Ziel untereinander; Plus je Lücke fügt einen Zwischenpunkt ein. Pro Punkt
                  Ortssuche ODER Karten-Pin (genaue Position). */}
              {szPoints.map((p, i) => {
                const isStart = i === 0
                const isZiel = i === szPoints.length - 1
                const ph = isStart
                  ? "Start (Ort oder Adresse)"
                  : isZiel
                    ? "Ziel (Ort oder Adresse)"
                    : "Zwischenpunkt (Ort oder Adresse)"
                return (
                  <div key={p.id}>
                    <div className="flex items-center gap-2">
                      {isStart ? (
                        <Play aria-hidden className="h-3.5 w-3.5 shrink-0 fill-neutral-900 text-neutral-900" />
                      ) : isZiel ? (
                        <Flag aria-hidden className="h-3.5 w-3.5 shrink-0 fill-neutral-900 text-neutral-900" />
                      ) : (
                        <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-neutral-400" />
                      )}
                      <PlaceAutocomplete
                        className="flex-1"
                        value={p.label}
                        onChange={(v) => setPointLabel(i, v)}
                        placeholder={ph}
                        disabled={szBusy}
                      />
                      <button
                        type="button"
                        onClick={() => setPickerIdx(i)}
                        disabled={szBusy}
                        title="Auf der Karte setzen"
                        className={cn(
                          "rounded-lg border px-2 py-2 transition hover:bg-neutral-50",
                          p.lat != null ? "border-primary-300 text-primary-600" : "border-neutral-200 text-neutral-500",
                        )}
                      >
                        <MapPinned className="h-4 w-4" />
                      </button>
                      {!isStart && !isZiel ? (
                        <button
                          type="button"
                          onClick={() => removeVia(i)}
                          disabled={szBusy}
                          title="Zwischenpunkt entfernen"
                          className="rounded-lg border border-neutral-200 px-2 py-2 text-neutral-400 transition hover:bg-red-50 hover:text-red-600"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      ) : null}
                    </div>
                    {!isZiel ? (
                      // Lücke standardmäßig zusammengezogen; beim Überfahren öffnet sie sich, ein Trenner-
                      // Strich erscheint und das Plus zum Einfügen eines Zwischenpunkts wird sichtbar.
                      <div className="group relative flex h-2 items-center justify-center transition-all duration-150 hover:h-9">
                        <span
                          aria-hidden
                          className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-neutral-200 opacity-0 transition-opacity duration-150 group-hover:opacity-100"
                        />
                        <button
                          type="button"
                          onClick={() => addViaAfter(i)}
                          disabled={szBusy}
                          title="Zwischenpunkt einfügen"
                          className="relative z-10 flex h-6 w-6 items-center justify-center rounded-full border border-dashed border-neutral-300 bg-white text-neutral-500 opacity-0 transition duration-150 hover:border-neutral-500 hover:text-neutral-800 focus-visible:opacity-100 group-hover:opacity-100"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : null}
                  </div>
                )
              })}
              <div className="flex justify-end pt-1">
                <Button
                  onClick={() => void onStartZiel()}
                  disabled={szBusy || !szValue(szPoints[0]) || !szValue(szPoints[szPoints.length - 1])}
                >
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
                    <p className="flex items-center gap-1.5 truncate text-sm font-medium text-neutral-800">
                      {r.name}
                      {/* T-480: grobe Schätzung kenntlich machen — kein echter Straßenweg. */}
                      {r.grob ? (
                        <span
                          title="OSRM war beim Anlegen nicht erreichbar. Der Verlauf ist nur eine grobe Luftlinien-Schätzung."
                          className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700"
                        >
                          grobe Schätzung
                        </span>
                      ) : null}
                    </p>
                    <p className="truncate text-xs tabular-nums text-neutral-400">
                      {SOURCE_LABEL[r.source ?? "datei"]} · {r.fileName ? `${r.fileName} · ` : ""}
                      {r.points.length.toLocaleString("de-DE")} Punkte · ca.{" "}
                      {routeLengthKm(r.points).toLocaleString("de-DE")} km
                    </p>
                  </div>
                  <RouteDownloadMenu route={r} />
                  <button
                    type="button"
                    onClick={() => setEditRoute(r)}
                    aria-label={`Strecke ${r.name} bearbeiten`}
                    title="Bearbeiten: Wegpunkte, Verlauf und Name"
                    disabled={running}
                    className="flex h-7 w-7 items-center justify-center rounded-md text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
                  >
                    <Pencil className="h-4 w-4" />
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
                    className="flex h-7 w-7 items-center justify-center rounded-md text-neutral-400 transition-colors hover:bg-severity-kritisch-bg hover:text-severity-kritisch"
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
            subtitle={`${pendingFile.fileName ?? SOURCE_LABEL[pendingFile.source]} · ${pendingFile.points.length.toLocaleString("de-DE")} Punkte`}
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
            <p className="mt-1.5 text-xs text-neutral-400">Sprechender Name statt Dateiname, 2–80 Zeichen.</p>
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

      {/* Strecken-Editor (T-197): Wegpunkte ziehen/fixieren, live OSRM, Speichern → Re-Auswertung. */}
      <RouteEditDialog
        open={!!editRoute}
        route={editRoute}
        projectId={project.id}
        onClose={() => setEditRoute(null)}
      />

      {/* #15: GeoPackage-Streckenauswahl. */}
      <GpkgRouteSelectDialog
        open={!!gpkg}
        fileName={gpkg?.fileName ?? ""}
        routes={gpkg?.routes ?? []}
        busy={gpkgBusy}
        onClose={() => setGpkg(null)}
        onConfirm={loadGpkgRoutes}
      />

      {/* T-567: VEMAGS-Fahrtwegteil-Auswahl. Bedingt gemountet → frischer State (Vorauswahl) je Upload. */}
      {vemags ? (
        <VemagsRouteSelectDialog
          open
          fileName={vemags.fileName}
          result={vemags.result}
          onClose={() => setVemags(null)}
          onConfirm={loadVemagsRoutes}
        />
      ) : null}

      {/* #9: Karten-Picker für den gerade gewählten Punkt. */}
      <MapPointPicker
        open={pickerIdx !== null}
        title={
          pickerIdx === 0
            ? "Start auf der Karte setzen"
            : pickerIdx === szPoints.length - 1
              ? "Ziel auf der Karte setzen"
              : "Zwischenpunkt auf der Karte setzen"
        }
        initial={
          pickerIdx !== null && szPoints[pickerIdx]?.lat != null
            ? { lat: szPoints[pickerIdx].lat as number, lng: szPoints[pickerIdx].lng as number, label: szPoints[pickerIdx].label }
            : null
        }
        onConfirm={(r) => {
          if (pickerIdx !== null) setPointFromPicker(pickerIdx, r)
        }}
        onClose={() => setPickerIdx(null)}
      />
    </div>
  )
}
