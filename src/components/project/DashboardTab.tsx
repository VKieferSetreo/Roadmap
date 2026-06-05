// Tab 3 — Auswertungs-Dashboard: Kennzahlen + filterbare Fund-Liste mit Detail.

import { useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  Building2,
  CalendarRange,
  ChevronDown,
  ClipboardList,
  Clock,
  ExternalLink,
  FileDown,
  FileSpreadsheet,
  MapPin,
  Radio,
  Route as RouteIcon,
  Search,
} from "lucide-react"
import { Card, CardContent } from "@/components/ui/Card"
import { Badge } from "@/components/ui/Badge"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { Select } from "@/components/ui/Select"
import { EmptyState } from "@/components/shared/EmptyState"
import { KATEGORIE_META, SEVERITY_META, SEVERITY_ORDER } from "./findingMeta"
import { KategorieGlyph } from "./KategorieGlyph"
import type { Finding, FindingSeverity, Project } from "@/types/domain"
import { cn } from "@/lib/cn"

export function DashboardTab({ project }: { project: Project }) {
  const navigate = useNavigate()
  const [sevFilter, setSevFilter] = useState<FindingSeverity | "alle">("alle")
  const [katFilter, setKatFilter] = useState<string>("alle")
  const [query, setQuery] = useState("")
  const [expanded, setExpanded] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return project.findings
      .filter((f) => (sevFilter === "alle" ? true : f.severity === sevFilter))
      .filter((f) => (katFilter === "alle" ? true : f.kategorie === katFilter))
      .filter((f) =>
        q
          ? f.titel.toLowerCase().includes(q) ||
            f.beschreibung.toLowerCase().includes(q) ||
            KATEGORIE_META[f.kategorie].label.toLowerCase().includes(q)
          : true,
      )
      .sort((a, b) => SEVERITY_META[a.severity].rank - SEVERITY_META[b.severity].rank || a.km - b.km)
  }, [project.findings, sevFilter, katFilter, query])

  if (project.status !== "fertig") {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <EmptyState
          icon={ClipboardList}
          title="Noch keine Auswertung"
          description="Sobald die Auswertung gefahren wurde, erscheinen hier alle Funde mit Details."
          cta={<Button onClick={() => navigate(`/projekte/${project.id}/anlage`)}>Zur Anlage</Button>}
        />
      </div>
    )
  }

  const counts = SEVERITY_ORDER.map((sev) => ({
    sev,
    n: project.findings.filter((f) => f.severity === sev).length,
  }))

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      {/* Kennzahlen */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatCard label="Strecke" value={`${project.distanzKm?.toLocaleString("de-DE")} km`} icon={<RouteIcon className="h-4 w-4" />} />
        <StatCard
          label="Fahrzeit"
          value={`${Math.floor((project.fahrzeitMin ?? 0) / 60)} h ${(project.fahrzeitMin ?? 0) % 60} min`}
          icon={<Clock className="h-4 w-4" />}
        />
        {counts.map(({ sev, n }) => (
          <StatCard
            key={sev}
            label={SEVERITY_META[sev].label}
            value={String(n)}
            dot={SEVERITY_META[sev].marker}
          />
        ))}
      </div>

      {/* Export-Buttons */}
      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" size="sm">
          <FileDown className="h-3.5 w-3.5" />
          PDF
        </Button>
        <Button variant="outline" size="sm">
          <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" />
          Excel
        </Button>
      </div>

      {/* Filterleiste */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
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
                "rounded px-3 py-1 text-xs font-medium capitalize transition-colors",
                sevFilter === s ? "bg-white text-primary-700 shadow-sm" : "text-neutral-500 hover:text-neutral-700",
              )}
            >
              {s === "alle" ? "Alle" : SEVERITY_META[s].label}
            </button>
          ))}
        </div>
        <Select value={katFilter} onChange={(e) => setKatFilter(e.target.value)} className="sm:w-44">
          <option value="alle">Alle Kategorien</option>
          {Object.entries(KATEGORIE_META).map(([key, meta]) => (
            <option key={key} value={key}>
              {meta.label}
            </option>
          ))}
        </Select>
      </div>

      {/* Fund-Liste */}
      {filtered.length === 0 ? (
        <EmptyState title="Keine Funde für diesen Filter" />
      ) : (
        <Card>
          <ul className="divide-y divide-neutral-100">
            {filtered.map((f) => (
              <FindingRow
                key={f.id}
                finding={f}
                open={expanded === f.id}
                onToggle={() => setExpanded(expanded === f.id ? null : f.id)}
              />
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}

function StatCard({
  label,
  value,
  icon,
  dot,
}: {
  label: string
  value: string
  icon?: React.ReactNode
  dot?: string
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1 p-3">
        <span className="flex items-center gap-1.5 text-xs text-neutral-500">
          {dot ? <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: dot }} /> : icon}
          {label}
        </span>
        <span className="text-xl font-bold tabular-nums text-neutral-900">{value}</span>
      </CardContent>
    </Card>
  )
}

function FindingRow({
  finding,
  open,
  onToggle,
}: {
  finding: Finding
  open: boolean
  onToggle: () => void
}) {
  const kat = KATEGORIE_META[finding.kategorie]
  const sev = SEVERITY_META[finding.severity]
  return (
    <li>
      <button
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-neutral-50"
      >
        <span className="rounded-md p-2 text-white" style={{ background: sev.marker }}>
          <KategorieGlyph kategorie={finding.kategorie} className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-neutral-900">{finding.titel}</p>
          <p className="truncate text-xs text-neutral-500">
            {kat.label} · km {finding.km.toLocaleString("de-DE")}
          </p>
        </div>
        <Badge variant={sev.badge} size="sm">
          {sev.label}
        </Badge>
        <ChevronDown
          className={cn("h-4 w-4 shrink-0 text-neutral-400 transition-transform", open && "rotate-180")}
        />
      </button>
      {open ? (
        <div className="space-y-4 border-t border-neutral-100 bg-neutral-50/60 px-4 py-4 pl-[60px]">
          <p className="text-sm text-neutral-700">{finding.beschreibung}</p>

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
            <span className="text-neutral-500 tabular-nums">
              {finding.lat.toFixed(5)}° N · {finding.lng.toFixed(5)}° E
            </span>
          </div>

          {/* Quelle als prominenter Link-Block */}
          {finding.quelle ? (
            <a
              href={finding.quelle.url}
              target="_blank"
              rel="noreferrer"
              className="group flex items-center justify-between gap-3 rounded-md border border-primary-200 bg-primary-50/40 px-3 py-2.5 transition-colors hover:bg-primary-50 hover:border-primary-300"
            >
              <div className="flex min-w-0 items-center gap-2">
                <Radio className="h-3.5 w-3.5 flex-shrink-0 text-primary-700" />
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-neutral-900">
                    {finding.quelle.name}
                  </div>
                  <div className="truncate text-[10px] font-mono text-neutral-500">
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
