// Tab 3 — Auswertungs-Dashboard: Kennzahlen + Charts + Streckenprofil +
// filterbare Fund-Liste. Export: CSV (echt) + PDF via Druck-Stylesheet.

import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
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
  MapPin,
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
  visibleFindings,
} from "./findingMeta"
import { KategorieGlyph } from "./KategorieGlyph"
import { useProjectStore } from "@/store/projects"
import { HIDE_REASON_LABEL, type Finding, type FindingSeverity, type Project } from "@/types/domain"
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

export function DashboardTab({
  project,
}: {
  project: Project
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
  const listRef = useRef<HTMLDivElement>(null)
  const hideFinding = useProjectStore((s) => s.hideFinding)
  const unhideFinding = useProjectStore((s) => s.unhideFinding)
  // T-220: läuft gerade eine (Re-)Auswertung? Dann fertigen Inhalt behalten statt Empty-Flash.
  const running = useProjectStore((s) => s.analysis[project.id]?.running ?? false)

  // Ausgeblendete Funde fließen NIE in Aggregate/Liste/Charts — nur separat als "Ausgeblendet".
  const sichtbar = useMemo(() => visibleFindings(project.findings), [project.findings])
  const ausgeblendet = useMemo(() => selectHidden(project.findings), [project.findings])

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

  // T-220: Empty-State nur wenn wirklich nichts da ist — während des Re-Auswertens (running) oder
  // bei vorhandenen Funden (z.B. server-seitig status='analyse' ohne Client-Timer) Inhalt behalten.
  if (project.status !== "fertig" && !running && project.findings.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <EmptyState
          icon={ClipboardList}
          title="Noch keine Auswertung"
          description="Sobald die Auswertung gefahren wurde, erscheinen hier alle Funde mit Details."
          cta={
            <Button onClick={() => navigate(`/projekte/${project.id}/route`)}>Zur Eingabe</Button>
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

  // Transport-Profil für die Eckdaten (keine Daten/Uhrzeiten).
  const t = project.transport
  const num = (v?: number) => (v ?? 0).toLocaleString("de-DE")
  const abmessung =
    t?.laenge || t?.breite || t?.hoehe
      ? `${num(t?.laenge)} m × ${num(t?.breite)} m × ${num(t?.hoehe)} m`
      : "—"
  const gewicht = t?.gesamtgewicht ? `${num(t.gesamtgewicht)} t` : "—"

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
      {/* Kennzahlen — 4 weiße Eckdaten */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          label="Strecke"
          value={project.distanzKm ?? 0}
          suffix=" km"
          icon={<RouteIcon className="h-4 w-4" />}
          index={0}
        />
        <StatCard
          label="Fahrzeit"
          text={`${Math.floor((project.fahrzeitMin ?? 0) / 60)} h ${(project.fahrzeitMin ?? 0) % 60} min`}
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
            <Suspense fallback={<ChartSkeleton />}>
              <SeverityDonut findings={filtered} />
            </Suspense>
          </CardContent>
        </Card>
        <Card className="animate-rise-in" style={{ animationDelay: "160ms" }}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Funde nach Kategorie</CardTitle>
          </CardHeader>
          <CardContent className="pt-1">
            <Suspense fallback={<ChartSkeleton />}>
              <KategorieBar findings={filtered} />
            </Suspense>
          </CardContent>
        </Card>
      </div>

      {/* Streckenprofil — ein Band pro Strecke (eigene km-Achse). T-219: aus dem gefilterten Set. */}
      {filtered.length > 0 ? (
        <Card className="print-hidden animate-rise-in" style={{ animationDelay: "200ms" }}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">
              Streckenprofil — Funde entlang der {project.routes.length > 1 ? "Strecken" : "Route"}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 pt-1">
            {project.routes
              .filter((r) => r.points.length >= 2)
              .map((r) => {
                const routeFindings = filtered.filter((f) => f.routeId === r.id)
                if (routeFindings.length === 0) return null
                return (
                  <div key={r.id}>
                    {project.routes.length > 1 ? (
                      <p className="mb-0.5 flex items-center gap-1.5 text-xs font-medium text-neutral-600">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ background: r.farbe }}
                          aria-hidden
                        />
                        {r.name}
                      </p>
                    ) : null}
                    <StreckenBand
                      findings={routeFindings}
                      distanzKm={routeLengthKm(r.points)}
                      selectedId={expanded}
                      onSelect={focusFinding}
                    />
                  </div>
                )
              })}
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
        {/* Download (nur nach abgeschlossener Auswertung): PDF oder CSV → Export-Dialog. */}
        {project.status === "fertig" ? (
          <DropdownMenu
            triggerLabel="Herunterladen — PDF oder CSV"
            trigger={
              <span
                title="Herunterladen"
                className="inline-flex h-9 shrink-0 cursor-pointer items-center gap-2 rounded-md border border-neutral-200 bg-white px-3 text-sm font-medium text-neutral-700 shadow-sm transition-colors hover:bg-neutral-50 hover:text-neutral-900"
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
        <EmptyState title="Keine Funde für diesen Filter" />
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
                  onHide={() => setHideTarget(f)}
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
                    onHide={() => {}}
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
    "Zuständig",
    "Quelle",
    "Quelle-URL",
  ]
  const rows = findings
    .slice()
    .sort((a, b) => a.km - b.km)
    .map((f) =>
      [
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
  a.download = `${project.name.replace(/[^\wäöüÄÖÜß -]+/g, "")} — Funde.csv`
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
  onHide: () => void
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
        <button
          onClick={onHide}
          aria-label="Fund ausblenden"
          title="Ausblenden (zählt nicht mehr in die Auswertung)"
          className="flex shrink-0 cursor-pointer items-center px-3 text-neutral-300 transition-colors hover:bg-neutral-50 hover:text-severity-kritisch"
        >
          <EyeOff className="h-4 w-4" />
        </button>
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
            {Object.entries(finding.detail).map(([k, v]) => (
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
                {finding.gueltigBis ? formatIsoDE(finding.gueltigBis) : "unbefristet"}
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
            <span className="tabular-nums text-neutral-500">
              {finding.lat.toFixed(5)}° N · {finding.lng.toFixed(5)}° E
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
