// Tab 3 — Auswertungs-Dashboard: Kennzahlen + Charts + Streckenprofil +
// filterbare Fund-Liste. Export: CSV (echt) + PDF via Druck-Stylesheet.

import { Suspense, lazy, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { toast } from "sonner"
import {
  AlertTriangle,
  Building2,
  CalendarRange,
  ChevronDown,
  ClipboardList,
  Clock,
  Download,
  ExternalLink,
  EyeOff,
  FileDown,
  FileSpreadsheet,
  CheckCircle2,
  Loader2,
  MapPin,
  Play,
  Radio,
  RotateCcw,
  Route as RouteIcon,
  Ruler,
  Search,
  Weight,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card"
import { Badge } from "@/components/ui/Badge"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { Select } from "@/components/ui/Select"
import { EmptyState } from "@/components/shared/EmptyState"
import { AnimatedNumber } from "@/components/shared/AnimatedNumber"
import { StreckenBand } from "@/components/charts/StreckenBand"
import { ReportView } from "./ReportView"
import { ExportDialog, type ExportConfig } from "./ExportDialog"
import { DropdownMenu, DropdownItem } from "@/components/ui/DropdownMenu"
import { HideReasonDialog } from "./HideReasonDialog"
import { routeLengthKm } from "@/lib/parseRouteFile"
import { safeHref } from "@/lib/safeHref"
import {
  hiddenFindings as selectHidden,
  imExportZeitraum,
  katMeta,
  KATEGORIE_META,
  SEVERITY_META,
  SEVERITY_ORDER,
  sichtbaresDetail,
  visibleFindings,
} from "./findingMeta"
import { KategorieGlyph } from "./KategorieGlyph"
import { useProjectStore } from "@/store/projects"
import { HIDE_REASON_LABEL, routeFreigegeben, type Finding, type FindingSeverity, type Project } from "@/types/domain"
import { cn } from "@/lib/cn"

// Recharts nur laden, wenn der Dashboard-Tab wirklich offen ist (Code-Splitting)
const SeverityDonut = lazy(() =>
  import("@/components/charts/SeverityDonut").then((m) => ({ default: m.SeverityDonut })),
)
const KategorieBar = lazy(() =>
  import("@/components/charts/KategorieBar").then((m) => ({ default: m.KategorieBar })),
)

function ChartSkeleton() {
  return <div className="skeleton h-44 w-full rounded-lg" />
}

/** T-723: `fail()` im Store (projects.ts) legt ZWEI verschiedene Faelle in dasselbe `error`-Feld —
 *  den echten Fehlschlag (Engine/Server) und die T-467-Kollision (HTTP 409: fuer dieses Projekt
 *  laeuft bereits eine Auswertung, z.B. Doppelklick, zweiter Disponent, Nachtlauf). Nur der erste
 *  ist ein Fehlschlag; die Kollision heisst warten. Da der Store den Fall nicht markiert und uns
 *  nicht gehoert, erkennen wir ihn am Wortlaut. Aendert sich der dort, greift schlimmstenfalls
 *  wieder der Fehlschlag-Zweig — also der Zustand vor diesem Fix, kein neuer Schaden. */
const istKollision = (fehler?: string) => Boolean(fehler?.includes("läuft bereits eine Auswertung"))

/** Platzhalter an der Stelle des Positiv-Befunds, solange der Lauf noch nichts geliefert hat.
 *
 *  Eigene Komponente, weil sie als EINZIGE die tickenden Werte abonniert: der Store schreibt
 *  analysis[id] alle 420 ms neu (projects.ts, setInterval). Haengen Schritt und Prozent am
 *  DashboardTab selbst, rendert der ganze Reiter — Charts, Streckenbaender, Fund-Liste — rund
 *  2,4x pro Sekunde ueber die volle Laufdauer neu. So tickt nur diese Box.
 *
 *  Neutral, nicht gruen: an genau dieser Stelle stand die falsche gruene Entwarnung (T-239-Kachel).
 *  Wer aus zwei Metern auf den Schirm sieht, liest die Farbe, nicht den Text — und Gruen heisst in
 *  diesem Produkt „keine Hindernisse". Gruen bleibt deshalb dem abgeschlossenen Lauf vorbehalten,
 *  „laeuft" ist grau. */
function AuswertungLaeuft({ projectId }: { projectId: string }) {
  const step = useProjectStore((s) => s.analysis[projectId]?.step ?? "")
  const progress = useProjectStore((s) => s.analysis[projectId]?.progress ?? 0)
  return (
    <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-6 py-10 text-center">
      <Loader2 className="mx-auto h-9 w-9 animate-spin text-neutral-500" />
      {/* Live-Region NUR um diesen Satz: er steht vom Start bis zum Ende unveraendert und wird
          damit genau einmal vorgelesen. Schritt, Balken und Prozent darunter ticken alle 420 ms —
          in einer aria-live-Region liest ein Screenreader die komplette Laufzeit durch. Der
          Fortschrittsbalken im Reiter Anlage verzichtet aus demselben Grund ganz darauf; das Ende
          des Laufs meldet ohnehin der Abschluss-Toast (T-234). */}
      <p role="status" className="mt-3 text-base font-semibold text-neutral-800">
        Auswertung läuft …
      </p>
      <p className="mx-auto mt-1 max-w-md text-sm text-neutral-600">{step}</p>
      <div className="mx-auto mt-4 flex max-w-xs items-center gap-2">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-neutral-200">
          <div
            className="h-full rounded-full bg-neutral-400 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className="shrink-0 text-xs tabular-nums text-neutral-500">
          {Math.round(progress)}%
        </span>
      </div>
      <p className="mx-auto mt-3 max-w-md text-xs text-neutral-500">
        Die Funde erscheinen, sobald der Lauf abgeschlossen ist.
      </p>
    </div>
  )
}

export function DashboardTab({
  project,
  // T-664/F15: im oeffentlichen Share-Viewer gibt es keine Projektverwaltung — der Knopf
  // „Ausblenden" oeffnete dort die Gruende-Maske, und Bestaetigen tat nachweislich nichts
  // (kein Netzwerk-Call, kein Toast, weil s.projects im Share leer bleibt). Gleiches Gate wie
  // bei KarteTab, gleicher Default: aus, und die App schaltet es ein.
  canHide = false,
}: {
  project: Project
  canHide?: boolean
}) {
  const navigate = useNavigate()
  const [sevFilter, setSevFilter] = useState<FindingSeverity | "alle">("alle")
  const [katFilter, setKatFilter] = useState<string>("alle")
  const [routeFilter, setRouteFilter] = useState<string>("alle")
  const [query, setQuery] = useState("")
  const [expanded, setExpanded] = useState<string | null>(null)
  const [exportTarget, setExportTarget] = useState<"pdf" | "csv" | null>(null)
  const [reportCfg, setReportCfg] = useState<ExportConfig | null>(null)
  const [hideTarget, setHideTarget] = useState<Finding | null>(null)
  const [showHidden, setShowHidden] = useState(false)
  const [showAllFindings, setShowAllFindings] = useState(false)
  // #6 (Max 2026-06-21): Streckenprofil-Bänder progressiv — erst eines, „Mehr anzeigen" +10.
  const [shownProfiles, setShownProfiles] = useState(1)
  const listRef = useRef<HTMLDivElement>(null)
  const hideFinding = useProjectStore((s) => s.hideFinding)
  const unhideFinding = useProjectStore((s) => s.unhideFinding)
  const runAnalysis = useProjectStore((s) => s.runAnalysis)
  const loadProjects = useProjectStore((s) => s.loadProjects)
  const clearAnalysisError = useProjectStore((s) => s.clearAnalysisError)
  // T-220: läuft gerade eine (Re-)Auswertung? Dann fertigen Inhalt behalten statt Empty-Flash.
  // T-722/T-723: hier NUR die beiden primitiven Felder selektieren, nie das analysis-Objekt. Der
  // Store ersetzt analysis[id] waehrend des Laufs alle 420 ms (projects.ts, setInterval) — ein
  // Objekt-Selector bekaeme bei jedem Tick eine neue Referenz und wuerde dieses Dashboard mit
  // Charts, Streckenbaendern und Fund-Liste rund 2,4x pro Sekunde ueber die volle Laufdauer neu
  // rendern. running und error wechseln dagegen nur bei Start und Ende des Laufs.
  // Schritt und Prozent ticken zwangslaeufig — die abonniert allein <AuswertungLaeuft/> unten.
  const running = useProjectStore((s) => s.analysis[project.id]?.running ?? false)
  const laufFehler = useProjectStore((s) => s.analysis[project.id]?.error)

  // Ausgeblendete Funde fließen NIE in Aggregate/Liste/Charts — nur separat als "Ausgeblendet".
  const sichtbar = useMemo(() => visibleFindings(project.findings), [project.findings])
  const ausgeblendet = useMemo(() => selectHidden(project.findings), [project.findings])
  // T-722: Der Lauf hat noch nichts geliefert (typisch: erster Lauf, Auto-Auswertung nach dem
  // Streckenimport). Solange darf KEINE Flaeche eine Aussage ueber das Ergebnis machen — die Leere
  // ist der Zwischenstand, nicht der Befund. Bei der ERNEUTEN Auswertung ist das anders: da stehen
  // die Zahlen des letzten Laufs, und die bleiben bewusst stehen (T-220).
  const laeuftOhneErgebnis = running && sichtbar.length === 0

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return sichtbar
      .filter((f) => (sevFilter === "alle" ? true : f.severity === sevFilter))
      .filter((f) => (katFilter === "alle" ? true : f.kategorie === katFilter))
      .filter((f) => (routeFilter === "alle" ? true : f.routeId === routeFilter))
      .filter((f) =>
        q
          ? f.titel.toLowerCase().includes(q) ||
            f.beschreibung.toLowerCase().includes(q) ||
            katMeta(f.kategorie).label.toLowerCase().includes(q)
          : true,
      )
      .sort(
        (a, b) => SEVERITY_META[a.severity].rank - SEVERITY_META[b.severity].rank || a.km - b.km,
      )
  }, [sichtbar, sevFilter, katFilter, routeFilter, query])

  /** Start wie im Reiter Anlage (AnlageTab.onRun), nicht nackt. T-222: fehlt Hoehe oder
   *  Gesamtgewicht, prueft die Engine weder Durchfahrtshoehen noch Traglastgrenzen — der Lauf
   *  laeuft trotzdem, das Ergebnis ist aber unvollstaendig. Wer den Knopf hier drueckt, muss
   *  denselben Vorbehalt zu sehen bekommen wie im Reiter Anlage, sonst haelt er ein halb
   *  geprueftes Ergebnis fuer das ganze. Die Strecken-Pruefung (routeReady) steckt schon im
   *  `auswertbar`-Gate unten, deshalb hier nur die Mass-Warnung. */
  const starteAuswertung = () => {
    runAnalysis(project.id)
    const t = project.transport
    const fehltHoehe = !Number.isFinite(t?.hoehe) || (t?.hoehe ?? 0) <= 0
    const fehltGewicht = !Number.isFinite(t?.gesamtgewicht) || (t?.gesamtgewicht ?? 0) <= 0
    if (fehltHoehe || fehltGewicht) {
      toast.warning("Auswertung gestartet. Ohne Höhe/Gewicht bleiben Brücken-/Traglastgrenzen ungeprüft.")
    } else {
      toast.info("Auswertung gestartet …")
    }
  }

  // T-220: Empty-State nur wenn wirklich nichts da ist — während des Re-Auswertens (running) oder
  // bei vorhandenen Funden (z.B. server-seitig status='analyse' ohne Client-Timer) Inhalt behalten.
  if (project.status !== "fertig" && !running && project.findings.length === 0) {
    // T-723: ein fehlgeschlagener Lauf setzt den Status zurueck auf "entwurf"
    // (store/projects.ts, fail()) — der Reiter sah damit aus wie „noch nie gestartet", obwohl der
    // Disponent Strecke UND Auswertung hinter sich hat. Der Fehler stand nur im Reiter Eingabe und
    // in einem Toast, der laengst weg ist; die Folge war ein zweiter Upload derselben Strecke.
    // Der Knopf startet den Lauf hier direkt, statt auf die Eingabe zu verweisen.
    // Gate auf eine auswertbare Strecke: ungeprüfte VEMAGS-Strecken sind serverseitig vom Lauf
    // ausgeschlossen (T-593), ein „Erneut auswerten" wuerde damit sofort wieder scheitern.
    const auswertbar = project.routes.some((r) => r.points.length >= 2 && routeFreigegeben(r))
    const kollision = auswertbar && istKollision(laufFehler)
    const fehlgeschlagen = auswertbar && Boolean(laufFehler) && !kollision
    return (
      <div className="mx-auto flex h-full max-w-2xl items-center px-4 py-10">
        <EmptyState
          icon={kollision ? Clock : fehlgeschlagen ? AlertTriangle : ClipboardList}
          title={
            kollision
              ? "Auswertung läuft bereits"
              : fehlgeschlagen
                ? "Letzte Auswertung fehlgeschlagen"
                : "Noch keine Auswertung"
          }
          description={
            kollision
              ? "Für dieses Projekt rechnet gerade ein anderer Lauf — ein zweiter Start, ein Kollege oder der Nachtlauf. Ihre Strecken sind gespeichert. Kurz warten und dann aktualisieren."
              : fehlgeschlagen
                ? `${laufFehler} Ihre Strecken sind gespeichert — ein neuer Lauf genügt, erneutes Hochladen ist nicht nötig.`
                : "Sobald die Auswertung gefahren wurde, erscheinen hier alle Funde mit Details."
          }
          cta={
            // Kollision: ein zweites runAnalysis() liefe sofort in denselben 409. Was hilft, ist der
            // Ergebnis-Stand des fremden Laufs — also neu laden statt neu starten.
            // Der gemerkte Fehler MUSS dabei mit weg (T-731): er hängt am Store und überlebt das
            // Neuladen. Ohne clearAnalysisError bliebe „Auswertung läuft bereits" auch dann stehen,
            // wenn der fremde Lauf längst fertig ist und ebenfalls nichts gefunden hat — der Knopf
            // wäre eine Sackgasse, die auf sich selbst zeigt.
            kollision ? (
              <Button
                variant="outline"
                onClick={() => {
                  clearAnalysisError(project.id)
                  void loadProjects()
                }}
              >
                <RotateCcw className="h-4 w-4" /> Aktualisieren
              </Button>
            ) : fehlgeschlagen ? (
              <Button onClick={starteAuswertung}>
                <Play className="h-4 w-4" /> Erneut auswerten
              </Button>
            ) : (
              <Button onClick={() => navigate(`/projekte/${project.id}/route`)}>Zur Eingabe</Button>
            )
          }
        />
      </div>
    )
  }


  /** StreckenBand-Klick: Fund in der Liste aufklappen + hinscrollen. */
  const focusFinding = (id: string) => {
    setSevFilter("alle")
    setKatFilter("alle")
    setRouteFilter("alle")
    setQuery("")
    setShowAllFindings(true)
    setExpanded(id)
    requestAnimationFrame(() => {
      listRef.current
        ?.querySelector(`[data-finding-id="${id}"]`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" })
    })
  }

  // Export-Dialog bestätigt: Funde auf Zeitfenster + gewählte Strecken filtern, dann CSV sofort
  // bzw. PDF-Bericht öffnen (der filtert anhand der Config selbst).
  const handleExport = (cfg: ExportConfig) => {
    const target = exportTarget
    setExportTarget(null)
    if (target === "csv") {
      const findings = visibleFindings(project.findings).filter(
        (f) =>
          imExportZeitraum(f, cfg.von, cfg.bis) &&
          (cfg.severities.length === 0 || cfg.severities.includes(f.severity)) &&
          (f.routeId == null || cfg.routeIds.includes(f.routeId)),
      )
      exportCsv(project, findings)
    } else if (target === "pdf") {
      setReportCfg(cfg)
    }
  }

  // #5 (Max 2026-06-21): bei vielen Strecken ist die AGGREGIERTE Gesamtstrecke/-zeit (Summe über
  // alle z.B. 100 Strecken = 11.989 km / 239 h) sinnlos → Durchschnitt je Strecke zeigen. Bei
  // genau einer Strecke bleibt es die Strecke selbst (server-gerechnetes distanzKm/fahrzeitMin).
  // Prüfen-Gate (T-598): ungeprüfte VEMAGS-Strecken sind nicht ausgewertet → auch nicht in die
  // Kennzahlen (Ø km/Zeit je Strecke) einrechnen, sonst verzerrt eine ungesehene Strecke den Schnitt.
  const usableRoutes = project.routes.filter((r) => r.points.length >= 2 && routeFreigegeben(r))
  const mehrereStrecken = usableRoutes.length > 1
  const avgKm = usableRoutes.length
    ? usableRoutes.reduce((a, r) => a + routeLengthKm(r.points), 0) / usableRoutes.length
    : (project.distanzKm ?? 0)
  const streckeKm = mehrereStrecken ? Math.round(avgKm * 10) / 10 : (project.distanzKm ?? 0)
  const fahrzeitMin = mehrereStrecken ? Math.round((avgKm / 50) * 60) : (project.fahrzeitMin ?? 0)

  // Transport-Profil für die Eckdaten (keine Daten/Uhrzeiten).
  //
  // T-721: JEDES Maß einzeln, und ein fehlendes bleibt fehlend. Vorher machte `num` aus jedem
  // fehlenden Wert eine 0, und die Bedingung prüfte nur, ob MINDESTENS eines der drei da ist —
  // fehlte allein die Höhe, stand hier „24,5 m × 3 m × 0 m". Das ist die Stelle, an der ein
  // EXTERNER die Maße sieht: der geteilte Link rendert genau diese Kachel (ShareApp routet nur
  // Karte und Dashboard, nicht den Bericht). Eine erfundene 0 in einem Dokument, das das Haus
  // verlässt, ist schlimmer als ein sichtbarer Strich.
  const t = project.transport
  const mass = (v?: number) =>
    typeof v === "number" && Number.isFinite(v) && v > 0 ? v.toLocaleString("de-DE") : "—"
  const abmessung =
    t?.laenge || t?.breite || t?.hoehe
      ? `${mass(t?.laenge)} m × ${mass(t?.breite)} m × ${mass(t?.hoehe)} m`
      : "—"
  const gewicht = t?.gesamtgewicht ? `${mass(t.gesamtgewicht)} t` : "—"

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
      {/* Kennzahlen — 4 weiße Eckdaten */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          label={mehrereStrecken ? "Ø Strecke" : "Strecke"}
          value={streckeKm}
          suffix=" km"
          icon={<RouteIcon className="h-4 w-4" />}
          index={0}
        />
        <StatCard
          // T-664/F12: die Zahl ist km geteilt durch 50, keine Routing-Dauer. Das gehört ans
          // Label, sonst liest der Kunde sie als berechnete Fahrzeit. Der bessere Fix wäre, die
          // echte OSRM-Dauer zu verwenden (osrm.js dauerMin, sogar in dauer_min gecacht) — das
          // ist ein Eingriff in den Analysepfad und steckt in T-678.
          label={mehrereStrecken ? "Ø Fahrzeit (Schätzung)" : "Fahrzeit (Schätzung)"}
          text={`${Math.floor(fahrzeitMin / 60)} h ${fahrzeitMin % 60} min`}
          icon={<Clock className="h-4 w-4" />}
          index={1}
        />
        <StatCard
          label="Abmessung"
          text={abmessung}
          icon={<Ruler className="h-4 w-4" />}
          index={2}
        />
        <StatCard
          label="Gewicht"
          text={gewicht}
          icon={<Weight className="h-4 w-4" />}
          index={3}
        />
      </div>

      {/* Charts */}
      <div className="print-hidden grid grid-cols-1 gap-3 md:grid-cols-2">
        <Card className="animate-rise-in" style={{ animationDelay: "120ms" }}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Schweregrade</CardTitle>
          </CardHeader>
          <CardContent className="pt-1">
            {/* T-722: beide Diagramme schreiben bei leerer Menge „Keine Funde" (SeverityDonut,
                KategorieBar) — waehrend des ersten Laufs ist das dieselbe falsche Entwarnung wie
                der Positiv-Befund unten in der Liste. Solange nichts vorliegt, steht hier der
                Lade-Platzhalter, den es fuer den Chart-Nachladevorgang ohnehin schon gibt. */}
            {laeuftOhneErgebnis ? (
              <ChartSkeleton />
            ) : (
              <Suspense fallback={<ChartSkeleton />}>
                <SeverityDonut findings={filtered} />
              </Suspense>
            )}
          </CardContent>
        </Card>
        <Card className="animate-rise-in" style={{ animationDelay: "160ms" }}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Funde nach Kategorie</CardTitle>
          </CardHeader>
          <CardContent className="pt-1">
            {/* T-722: siehe Schweregrade-Karte — waehrend des ersten Laufs kein „Keine Funde". */}
            {laeuftOhneErgebnis ? (
              <ChartSkeleton />
            ) : (
              <Suspense fallback={<ChartSkeleton />}>
                {/* hoehenBasis = ungefiltert, damit die Karte beim Filtern nicht die Höhe wechselt (T-688) */}
                <KategorieBar findings={filtered} hoehenBasis={sichtbar} />
              </Suspense>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Streckenprofil — ein Band pro Strecke (eigene km-Achse). T-219: aus dem gefilterten Set.
          T-688: die Bedingung stand auf `filtered`, die Karte fiel damit beim Tippen im Suchfeld
          komplett aus dem Fluss, sobald ein Anschlag keine Treffer mehr ergab — rund 180 px, und
          Suchfeld und Filterleiste darunter sprangen mit. Jetzt entscheidet die UNGEFILTERTE
          Menge über das Vorhandensein der Karte, der Filter nur noch über ihren Inhalt. */}
      {sichtbar.length > 0 ? (
        <Card className="print-hidden animate-rise-in" style={{ animationDelay: "200ms" }}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">
              Streckenprofil: Funde entlang der {project.routes.length > 1 ? "Strecken" : "Strecke"}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 pt-1">
            {(() => {
              // Nur Strecken mit (gefilterten) Funden zeigen. Bei vielen Strecken progressiv:
              // erst `shownProfiles` Bänder, das nächste ausgegraut als Teaser, Rest hinter „Mehr anzeigen".
              const mitFunden = project.routes
                .filter((r) => r.points.length >= 2)
                .map((r) => ({ r, rf: filtered.filter((f) => f.routeId === r.id) }))
                .filter((x) => x.rf.length > 0)
              // T-688: trifft der Filter nichts, bleibt die Karte stehen und sagt es. Die feste
              // Höhe entspricht einem Band, damit der Wechsel zwischen „Treffer" und „kein
              // Treffer" die Filterleiste darunter nicht verschiebt.
              if (mitFunden.length === 0) {
                return (
                  <div className="flex h-[109px] items-center justify-center text-sm text-neutral-400">
                    Keine Funde im aktuellen Filter
                  </div>
                )
              }
              const sichtbar = mitFunden.slice(0, shownProfiles)
              const teaser = mitFunden[shownProfiles] // nächstes Band, ausgegraut
              const rest = mitFunden.length - shownProfiles
              const renderBand = ({ r, rf }: (typeof mitFunden)[number]) => (
                <div key={r.id}>
                  {project.routes.length > 1 ? (
                    <p className="mb-0.5 flex items-center gap-1.5 text-xs font-medium text-neutral-600">
                      <span className="h-2 w-2 rounded-full" style={{ background: r.farbe }} aria-hidden />
                      {r.name}
                    </p>
                  ) : null}
                  <StreckenBand
                    findings={rf}
                    distanzKm={routeLengthKm(r.points)}
                    selectedId={expanded}
                    onSelect={focusFinding}
                  />
                </div>
              )
              return (
                <>
                  {sichtbar.map(renderBand)}
                  {teaser ? (
                    <div
                      aria-hidden
                      className="pointer-events-none select-none"
                      style={{
                        opacity: 0.5,
                        filter: "blur(1px)",
                        WebkitMaskImage: "linear-gradient(to bottom, #000, transparent)",
                        maskImage: "linear-gradient(to bottom, #000, transparent)",
                      }}
                    >
                      {renderBand(teaser)}
                    </div>
                  ) : null}
                  {rest > 0 ? (
                    <button
                      onClick={() => setShownProfiles((n) => n + 10)}
                      className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-md border border-neutral-100 px-4 py-2 text-sm font-semibold text-primary-700 transition-colors hover:bg-neutral-50"
                    >
                      Mehr anzeigen ({rest} weitere)
                    </button>
                  ) : shownProfiles > 1 ? (
                    <button
                      onClick={() => setShownProfiles(1)}
                      className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-md border border-neutral-100 px-4 py-2 text-sm font-semibold text-neutral-500 transition-colors hover:bg-neutral-50"
                    >
                      Weniger anzeigen
                    </button>
                  ) : null}
                </>
              )
            })()}
          </CardContent>
        </Card>
      ) : null}

      {/* Filterleiste */}
      <div className="print-hidden flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Funde durchsuchen …"
            className="pl-9"
          />
        </div>
        <div className="inline-flex rounded-md border border-neutral-200 bg-neutral-50 p-1">
          {(["alle", ...SEVERITY_ORDER] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSevFilter(s)}
              className={cn(
                "cursor-pointer rounded px-3 py-1 text-xs font-medium capitalize transition-colors",
                sevFilter === s
                  ? "bg-white text-primary-700 shadow-sm"
                  : "text-neutral-500 hover:text-neutral-700",
              )}
            >
              {s === "alle" ? "Alle" : SEVERITY_META[s].label}
            </button>
          ))}
        </div>
        <Select
          value={katFilter}
          onChange={(e) => setKatFilter(e.target.value)}
          className="sm:w-44"
        >
          <option value="alle">Alle Kategorien</option>
          {Object.entries(KATEGORIE_META).map(([key, meta]) => (
            <option key={key} value={key}>
              {meta.label}
            </option>
          ))}
        </Select>
        {/* Download (nur nach abgeschlossener Auswertung): PDF oder CSV → Export-Dialog.
            T-688: bei einer ERNEUTEN Auswertung wechselt der Status auf „analyse", der Knopf fiel
            damit aus der Filterzeile und alles daneben rutschte. Wo schon Funde vorliegen, bleibt
            er jetzt stehen und ist für die Dauer des Laufs nur stummgeschaltet — der Bericht wäre
            in dem Moment ohnehin ein Zwischenstand. Beim allerersten Lauf gibt es weder Knopf noch
            Sprung, weil vorher auch keiner da war. */}
        {project.status === "fertig" || (running && project.findings.length > 0) ? (
          <DropdownMenu
            triggerLabel="Herunterladen: PDF oder CSV"
            trigger={
              <span
                title={running ? "Auswertung läuft — Download gleich wieder verfügbar" : "Herunterladen"}
                aria-disabled={running || undefined}
                className={cn(
                  "inline-flex h-9 shrink-0 items-center gap-2 rounded-md border border-neutral-200 bg-white px-3 text-sm font-medium text-neutral-700 shadow-sm transition-colors",
                  running
                    ? "pointer-events-none opacity-50"
                    : "cursor-pointer hover:bg-neutral-50 hover:text-neutral-900",
                )}
              >
                <Download className="h-4 w-4" /> Download
              </span>
            }
          >
            <DropdownItem onClick={() => setExportTarget("pdf")}>
              <FileDown className="h-4 w-4 text-neutral-400" /> PDF-Bericht
            </DropdownItem>
            <DropdownItem onClick={() => setExportTarget("csv")}>
              <FileSpreadsheet className="h-4 w-4 text-emerald-600" /> Excel (CSV)
            </DropdownItem>
          </DropdownMenu>
        ) : null}
      </div>

      {/* Fund-Liste — standardmäßig 3 Funde; Rest als nach unten weichgezeichneter
          Teaser hinter „Mehr anzeigen", damit die Liste nicht überlädt. */}
      {filtered.length === 0 ? (
        sichtbar.length === 0 ? (
          laeuftOhneErgebnis ? (
            // T-722: waehrend der Lauf laeuft, ist „keine Hindernisse" noch keine Aussage, sondern
            // nur der leere Zwischenstand. Beim ersten Lauf (Strecke geladen → Auto-Auswertung,
            // store/projects.ts addRoute) stand hier Sekunden vor 40 Funden die gruene Entwarnung.
            // Der Positiv-Befund aus T-239 bleibt, gilt aber nur noch fuer den ABGESCHLOSSENEN Lauf.
            <AuswertungLaeuft projectId={project.id} />
          ) : (
            // T-239: gar keine Funde = bestes Ergebnis → Positiv-Befund (grün) statt grauer Leere/Fehloptik.
            <div className="rounded-xl border border-primary-200 bg-primary-50/60 px-6 py-10 text-center">
              <CheckCircle2 className="mx-auto h-9 w-9 text-primary-600" />
              <p className="mt-3 text-base font-semibold text-primary-800">Keine Hindernisse gefunden</p>
              <p className="mx-auto mt-1 max-w-md text-sm text-primary-700/80">
                Auf der ausgewerteten Strecke wurden keine relevanten Restriktionen gefunden.
              </p>
            </div>
          )
        ) : (
          // Funde vorhanden, aber der Filter blendet alle aus → neutral (kein Positiv-Befund).
          <EmptyState title="Keine Funde für diesen Filter" />
        )
      ) : (
        <Card>
          <div ref={listRef}>
            <ul className="divide-y divide-neutral-100">
              {(showAllFindings ? filtered : filtered.slice(0, 3)).map((f) => (
                <FindingRow
                  key={f.id}
                  finding={f}
                  routeFarbe={project.routes.find((r) => r.id === f.routeId)?.farbe}
                  zeigeStrecke={project.routes.length > 1}
                  open={expanded === f.id}
                  onToggle={() => setExpanded(expanded === f.id ? null : f.id)}
                  onHide={canHide ? () => setHideTarget(f) : undefined}
                />
              ))}
            </ul>

            {/* Teaser: nächste Funde nach unten ausgeblendet + weichgezeichnet (nur Andeutung, nicht interaktiv). */}
            {!showAllFindings && filtered.length > 3 ? (
              <ul
                aria-hidden
                className="pointer-events-none select-none divide-y divide-neutral-100"
                style={{
                  maxHeight: 160,
                  overflow: "hidden",
                  filter: "blur(2px)",
                  WebkitMaskImage: "linear-gradient(to bottom, #000, transparent)",
                  maskImage: "linear-gradient(to bottom, #000, transparent)",
                }}
              >
                {filtered.slice(3, 6).map((f) => (
                  <FindingRow
                    key={f.id}
                    finding={f}
                    routeFarbe={project.routes.find((r) => r.id === f.routeId)?.farbe}
                    zeigeStrecke={project.routes.length > 1}
                    open={false}
                    onToggle={() => {}}
                  />
                ))}
              </ul>
            ) : null}

            {filtered.length > 3 ? (
              <button
                onClick={() => setShowAllFindings((v) => !v)}
                aria-expanded={showAllFindings}
                className="flex w-full cursor-pointer items-center justify-center gap-1.5 border-t border-neutral-100 px-4 py-3 text-sm font-semibold text-primary-700 transition-colors hover:bg-neutral-50"
              >
                {showAllFindings ? "Weniger anzeigen" : `Mehr anzeigen (${filtered.length - 3})`}
                <ChevronDown className={cn("h-4 w-4 transition-transform", showAllFindings && "rotate-180")} />
              </button>
            ) : null}
          </div>
        </Card>
      )}

      {/* Ausgeblendete Funde — separat, zählen nicht in die Aggregate; wieder einblendbar. */}
      {ausgeblendet.length > 0 ? (
        <Card className="print-hidden">
          <button
            onClick={() => setShowHidden((v) => !v)}
            aria-expanded={showHidden}
            className="flex w-full cursor-pointer items-center gap-2 px-4 py-3 text-left text-sm font-medium text-neutral-600 hover:bg-neutral-50"
          >
            <EyeOff className="h-4 w-4 text-neutral-400" />
            <span className="flex-1">Ausgeblendet ({ausgeblendet.length})</span>
            <ChevronDown className={cn("h-4 w-4 text-neutral-400 transition-transform", showHidden && "rotate-180")} />
          </button>
          {showHidden ? (
            <ul className="divide-y divide-neutral-100 border-t border-neutral-100">
              {ausgeblendet.map((f) => (
                <li key={f.id} className="flex items-center gap-3 px-4 py-2.5">
                  <KategorieGlyph kategorie={f.kategorie} className="h-4 w-4 shrink-0 text-neutral-400" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-neutral-600">{f.titel}</p>
                    <p className="truncate text-xs text-neutral-400">
                      {katMeta(f.kategorie).label} · km {f.km.toLocaleString("de-DE")}
                      {f.hiddenGrund ? ` · ${HIDE_REASON_LABEL[f.hiddenGrund]}` : ""}
                    </p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => unhideFinding(project.id, f)}>
                    <RotateCcw className="h-3.5 w-3.5" /> Einblenden
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}
        </Card>
      ) : null}

      {exportTarget ? (
        <ExportDialog
          project={project}
          target={exportTarget}
          onClose={() => setExportTarget(null)}
          onConfirm={handleExport}
        />
      ) : null}
      {reportCfg ? (
        <ReportView
          project={project}
          exportVon={reportCfg.von}
          exportBis={reportCfg.bis}
          routeIds={reportCfg.routeIds}
          severities={reportCfg.severities}
          onClose={() => setReportCfg(null)}
        />
      ) : null}
      {hideTarget ? (
        <HideReasonDialog
          finding={hideTarget}
          onClose={() => setHideTarget(null)}
          onConfirm={(grund, grundText) => hideFinding(project.id, hideTarget, grund, grundText)}
        />
      ) : null}
    </div>
  )
}

/** CSV-Export der Funde (Excel-tauglich: BOM + Semikolon). `findings` = bereits sichtbar +
 *  auf das Export-Zeitfenster gefiltert (Teiltransporte). */
function exportCsv(project: Project, findings: Finding[]) {
  const esc = (v: string | number | undefined) => {
    const s = String(v ?? "")
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const header = [
    "Strecke",
    "Kategorie",
    "Schweregrad",
    "Titel",
    "Beschreibung",
    "km",
    "Straßen-Ref",
    "Breite (lat)",
    "Länge (lng)",
    "Gültig von",
    "Gültig bis",
    "Grenzwerte",
    "Zuständig",
    "Quelle",
    "Quelle-URL",
  ]
  const rows = findings
    .slice()
    .sort((a, b) => a.km - b.km)
    .map((f) =>
      [
        f.routeName ?? "Ohne Zuordnung", // T-226: Strecken-Zuordnung sichtbar (auch routeId-lose Funde)
        katMeta(f.kategorie).label,
        SEVERITY_META[f.severity].label,
        f.titel,
        f.beschreibung,
        String(f.km).replace(".", ","),
        f.strassenRef,
        String(f.lat).replace(".", ","),
        String(f.lng).replace(".", ","),
        f.gueltigVon,
        f.gueltigBis,
        // T-461: Grenzwerte-Spalte analog zur PDF-Serialisierung (ReportView) — vorher fehlte f.detail im CSV.
        // T-664/F2: ohne die internen Schlüssel, sonst steht "__ki: " in der Kundendatei.
        sichtbaresDetail(f.detail)
          .map(([k, v]) => `${k}: ${v}`)
          .join(" · "),
        f.zustaendig,
        f.quelle?.name,
        f.quelle?.url,
      ]
        .map(esc)
        .join(";"),
    )
  // BOM, damit Excel das UTF-8 (Umlaute) korrekt erkennt
  const csv = "﻿" + [header.join(";"), ...rows].join("\r\n")
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `${project.name.replace(/[^\wäöüÄÖÜß -]+/g, "")} - Funde.csv`
  a.click()
  URL.revokeObjectURL(url)
}

function StatCard({
  label,
  value,
  text,
  suffix,
  icon,
  sev,
  index = 0,
}: {
  label: string
  value?: number
  text?: string
  suffix?: string
  icon?: React.ReactNode
  sev?: FindingSeverity
  index?: number
}) {
  return (
    <Card
      className={cn(
        "animate-rise-in",
        sev && (value ?? 0) > 0 && "border-transparent ring-1",
        sev && (value ?? 0) > 0 && SEVERITY_META[sev].soft,
      )}
      style={{ animationDelay: `${index * 40}ms` }}
    >
      <CardContent className="flex flex-col gap-1 p-3">
        <span
          className={cn(
            "flex items-center gap-1.5 text-xs",
            sev && (value ?? 0) > 0 ? "" : "text-neutral-500",
          )}
        >
          {sev ? (
            <span className={cn("inline-block h-2.5 w-2.5 rounded-full", SEVERITY_META[sev].dot)} />
          ) : (
            icon
          )}
          {label}
        </span>
        <span className="text-xl font-bold tabular-nums text-neutral-900">
          {text ?? (
            <>
              <AnimatedNumber value={value ?? 0} />
              {suffix ?? ""}
            </>
          )}
        </span>
      </CardContent>
    </Card>
  )
}

function FindingRow({
  finding,
  routeFarbe,
  zeigeStrecke,
  open,
  onToggle,
  onHide,
}: {
  finding: Finding
  routeFarbe?: string
  zeigeStrecke?: boolean
  open: boolean
  onToggle: () => void
  /** fehlt im Share-Viewer — dann wird der Knopf gar nicht erst gerendert (T-664/F15). */
  onHide?: () => void
}) {
  const kat = katMeta(finding.kategorie)
  const sev = SEVERITY_META[finding.severity]
  return (
    <li data-finding-id={finding.id}>
      <div className={cn("flex items-stretch border-l-2", sev.accent)}>
        <button
          onClick={onToggle}
          aria-expanded={open}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-neutral-50"
        >
          <span className={cn("rounded-md p-2", sev.chip)}>
            <KategorieGlyph kategorie={finding.kategorie} className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-neutral-900">{finding.titel}</p>
            <p className="flex items-center gap-1.5 truncate text-xs text-neutral-500">
              {zeigeStrecke && finding.routeName ? (
                <span className="inline-flex shrink-0 items-center gap-1">
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: routeFarbe ?? "#A1A1AA" }}
                    aria-hidden
                  />
                  {finding.routeName} ·
                </span>
              ) : null}
              <span className="truncate">
                {kat.label} · km {finding.km.toLocaleString("de-DE")}
                {finding.strassenRef ? ` · ${finding.strassenRef}` : ""}
              </span>
            </p>
          </div>
          <Badge variant={sev.badge} size="sm">
            {sev.label}
          </Badge>
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 text-neutral-400 transition-transform duration-200",
              open && "rotate-180",
            )}
          />
        </button>
        {onHide ? (
          <button
            onClick={onHide}
            aria-label="Fund ausblenden"
            title="Ausblenden (zählt nicht mehr in die Auswertung)"
            className="flex shrink-0 cursor-pointer items-center px-3 text-neutral-300 transition-colors hover:bg-neutral-50 hover:text-severity-kritisch"
          >
            <EyeOff className="h-4 w-4" />
          </button>
        ) : null}
      </div>
      {open ? (
        <div
          className={cn(
            "animate-fade-in space-y-4 border-l-2 border-t border-neutral-100 bg-neutral-50/60 px-4 py-4 pl-[60px]",
            sev.accent,
          )}
        >
          <p className="whitespace-pre-line text-sm leading-relaxed text-neutral-700">{finding.beschreibung}</p>

          {/* Strukturierte Details */}
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
            {finding.strassenRef ? (
              <div className="flex flex-col">
                <dt className="text-xs text-neutral-400">Straßen-Referenz</dt>
                <dd className="text-sm font-semibold tabular-nums text-neutral-800">
                  {finding.strassenRef}
                </dd>
              </div>
            ) : null}
            {sichtbaresDetail(finding.detail).map(([k, v]) => (
              <div key={k} className="flex flex-col">
                <dt className="text-xs text-neutral-400">{k}</dt>
                <dd className="text-sm font-medium tabular-nums text-neutral-800">{v}</dd>
              </div>
            ))}
          </dl>

          {/* Gültigkeit */}
          {finding.gueltigVon || finding.gueltigBis ? (
            <div className="flex items-start gap-2 text-xs">
              <CalendarRange className="mt-0.5 h-3.5 w-3.5 text-neutral-400" />
              <span className="text-neutral-600">
                <span className="font-semibold text-neutral-700">Gültig:</span>{" "}
                {finding.gueltigVon ? formatIsoDE(finding.gueltigVon) : "—"} bis{" "}
                {finding.gueltigBis ? formatIsoDE(finding.gueltigBis) : "Unbefristet"}
              </span>
            </div>
          ) : null}

          {/* Zuständige Stelle */}
          {finding.zustaendig ? (
            <div className="flex items-start gap-2 text-xs">
              <Building2 className="mt-0.5 h-3.5 w-3.5 text-neutral-400" />
              <span className="text-neutral-600">
                <span className="font-semibold text-neutral-700">Zuständig:</span>{" "}
                {finding.zustaendig}
              </span>
            </div>
          ) : null}

          {/* Geo */}
          <div className="flex items-start gap-2 text-xs">
            <MapPin className="mt-0.5 h-3.5 w-3.5 text-neutral-400" />
            {/* T-728d: deutsches Dezimalkomma (wie im CSV-Export) und „O" fuer Ost — „E" ist die
                englische Himmelsrichtung und stand als einziger Fremdkoerper in einer sonst
                durchgehend deutschen Oberflaeche. N/O sind fest: die Daten liegen in Deutschland. */}
            <span className="tabular-nums text-neutral-500">
              {finding.lat.toFixed(5).replace(".", ",")}° N ·{" "}
              {finding.lng.toFixed(5).replace(".", ",")}° O
            </span>
          </div>

          {/* Quelle als prominenter Link-Block */}
          {finding.quelle ? (
            <a
              href={safeHref(finding.quelle.url)}
              target="_blank"
              rel="noreferrer"
              className="group flex items-center justify-between gap-3 rounded-md border border-primary-200 bg-primary-50/40 px-3 py-2.5 transition-colors hover:border-primary-300 hover:bg-primary-50"
            >
              <div className="flex min-w-0 items-center gap-2">
                <Radio className="h-3.5 w-3.5 flex-shrink-0 text-primary-700" />
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-neutral-900">
                    {finding.quelle.name}
                  </div>
                  <div className="truncate font-mono text-[10px] text-neutral-500">
                    {finding.quelle.url}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1 whitespace-nowrap text-xs font-semibold text-primary-700">
                Zur Quelle
                <ExternalLink className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
              </div>
            </a>
          ) : null}
        </div>
      ) : null}
    </li>
  )
}

function formatIsoDE(iso: string): string {
  if (!iso) return ""
  const [y, m, d] = iso.split("-")
  return `${d}.${m}.${y}`
}
