// Datenbank — projektübergreifende Fund-Suche.
// Frontend-Stub: aggregiert Funde aus allen Projekten im Store. Wird später
// gegen eine echte zentrale Funddatenbank (Backend) ausgetauscht.

import { useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Database, Info, Search } from "lucide-react"
import { PageContainer } from "@/components/layout/PageContainer"
import { Card } from "@/components/ui/Card"
import { Badge } from "@/components/ui/Badge"
import { Input } from "@/components/ui/Input"
import { Select } from "@/components/ui/Select"
import { EmptyState } from "@/components/shared/EmptyState"
import { useProjectStore } from "@/store/projects"
import { KATEGORIE_META, SEVERITY_META, SEVERITY_ORDER } from "@/components/project/findingMeta"
import type { Finding, FindingSeverity } from "@/types/domain"

interface DbRow {
  finding: Finding
  projektId: string
  projektName: string
}

export function DatenbankPage() {
  const navigate = useNavigate()
  const projects = useProjectStore((s) => s.projects)
  const [query, setQuery] = useState("")
  const [sevFilter, setSevFilter] = useState<FindingSeverity | "alle">("alle")
  const [katFilter, setKatFilter] = useState("alle")

  const rows: DbRow[] = useMemo(
    () =>
      projects.flatMap((p) =>
        p.findings.map((f) => ({ finding: f, projektId: p.id, projektName: p.name })),
      ),
    [projects],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return rows
      .filter((r) => (sevFilter === "alle" ? true : r.finding.severity === sevFilter))
      .filter((r) => (katFilter === "alle" ? true : r.finding.kategorie === katFilter))
      .filter((r) =>
        q
          ? r.finding.titel.toLowerCase().includes(q) ||
            r.finding.beschreibung.toLowerCase().includes(q) ||
            r.projektName.toLowerCase().includes(q) ||
            KATEGORIE_META[r.finding.kategorie].label.toLowerCase().includes(q)
          : true,
      )
  }, [rows, query, sevFilter, katFilter])

  return (
    <div className="h-full overflow-y-auto">
      <PageContainer
        title="Datenbank"
        description="Projektübergreifende Suche über alle gefundenen Hindernisse."
      >
        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-2 rounded-md border border-accent-400/40 bg-accent-100/50 px-3 py-2 text-xs text-accent-700">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Frontend-Demo: durchsucht aktuell die Funde der lokalen Projekte. Die zentrale
              Funddatenbank wird mit dem Backend angebunden.
            </span>
          </div>

          {/* Suche + Filter */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Funde, Projekte, Kategorien durchsuchen …"
                className="pl-9"
              />
            </div>
            <Select value={sevFilter} onChange={(e) => setSevFilter(e.target.value as FindingSeverity | "alle")} className="sm:w-40">
              <option value="alle">Alle Schweregrade</option>
              {SEVERITY_ORDER.map((s) => (
                <option key={s} value={s}>
                  {SEVERITY_META[s].label}
                </option>
              ))}
            </Select>
            <Select value={katFilter} onChange={(e) => setKatFilter(e.target.value)} className="sm:w-44">
              <option value="alle">Alle Kategorien</option>
              {Object.entries(KATEGORIE_META).map(([key, meta]) => (
                <option key={key} value={key}>
                  {meta.label}
                </option>
              ))}
            </Select>
          </div>

          <p className="text-xs text-neutral-400">
            {filtered.length} {filtered.length === 1 ? "Treffer" : "Treffer"}
          </p>

          {filtered.length === 0 ? (
            <EmptyState
              icon={Database}
              title="Keine Treffer"
              description={
                rows.length === 0
                  ? "Es wurden noch keine Auswertungen gefahren."
                  : "Für diese Suche gibt es keine Funde."
              }
            />
          ) : (
            <Card>
              <ul className="divide-y divide-neutral-100">
                {filtered.map(({ finding, projektId, projektName }) => {
                  const kat = KATEGORIE_META[finding.kategorie]
                  const sev = SEVERITY_META[finding.severity]
                  const Icon = kat.icon
                  return (
                    <li key={`${projektId}-${finding.id}`}>
                      <button
                        onClick={() => navigate(`/projekte/${projektId}/dashboard`)}
                        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-neutral-50"
                      >
                        <span className="rounded-md p-2 text-white" style={{ background: sev.marker }}>
                          <Icon className="h-4 w-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-neutral-900">{finding.titel}</p>
                          <p className="truncate text-xs text-neutral-500">
                            {projektName} · {kat.label} · km {finding.km.toLocaleString("de-DE")}
                          </p>
                        </div>
                        <Badge variant={sev.badge} size="sm">
                          {sev.label}
                        </Badge>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </Card>
          )}
        </div>
      </PageContainer>
    </div>
  )
}
