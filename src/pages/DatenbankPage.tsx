// Datenbank — zwei Reiter:
//  - "Funde": echte Tabellenansicht aller Funde (sortierbar); Zeile öffnen → Karten-Popup
//    mit dem markierten Fund.
//  - "Karte": Übersichtskarte der zentralen Hindernis-Datenbank (alles, zoombar).
// Spalten-Draft fürs reale Datenformat: docs/HINDERNIS-DATENFORMAT.md.

import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { ArrowDown, ArrowUp, ArrowUpDown, Database, Map as MapIcon, Search } from "lucide-react"
import { PageContainer } from "@/components/layout/PageContainer"
import { Card } from "@/components/ui/Card"
import { Badge } from "@/components/ui/Badge"
import { Input } from "@/components/ui/Input"
import { Select } from "@/components/ui/Select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/Tabs"
import { EmptyState } from "@/components/shared/EmptyState"
import { SyncBar } from "@/components/db/SyncBar"
import { FindingMapDialog } from "@/components/map/FindingMapDialog"
import { ObstaclesMap } from "@/components/map/ObstaclesMap"
import { useProjectStore } from "@/store/projects"
import { useDataSourceStore } from "@/store/datasource"
import { useDebounce } from "@/hooks/useDebounce"
import { api, type DbFinding } from "@/api/roadmap"
import { KategorieGlyph } from "@/components/project/KategorieGlyph"
import { KATEGORIE_META, SEVERITY_META, SEVERITY_ORDER } from "@/components/project/findingMeta"
import type { FindingSeverity } from "@/types/domain"
import { cn } from "@/lib/cn"

type DbTab = "funde" | "karte"

export function DatenbankPage() {
  const [tab, setTab] = useState<DbTab>("funde")
  const mode = useDataSourceStore((s) => s.mode)

  return (
    <div className="h-full overflow-y-auto">
      <PageContainer
        title="Datenbank"
        description="Alle Funde in Tabellenform und die zentrale Hindernis-Datenbank auf der Karte."
        width="wide"
      >
        <div className="flex flex-col gap-4">
          {mode === "live" ? <SyncBar /> : null}

          <Tabs value={tab} onValueChange={(v) => setTab(v as DbTab)}>
            <TabsList>
              <TabsTrigger value="funde">
                <Database className="h-4 w-4" /> Funde
              </TabsTrigger>
              <TabsTrigger value="karte">
                <MapIcon className="h-4 w-4" /> Karte
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {tab === "funde" ? (
            <FundeTabelle live={mode === "live"} />
          ) : (
            <KarteTab live={mode === "live"} />
          )}
        </div>
      </PageContainer>
    </div>
  )
}

// ── Funde als echte Tabelle ───────────────────────────────────────────────────

type SortKey =
  | "fachId"
  | "kategorie"
  | "titel"
  | "projektName"
  | "routeName"
  | "km"
  | "severity"
  | "gueltigBis"
  | "zustaendig"

const SPALTEN: { key: SortKey; label: string; className?: string }[] = [
  { key: "fachId", label: "ID", className: "w-[130px]" },
  { key: "kategorie", label: "Kategorie", className: "w-[150px]" },
  { key: "titel", label: "Bezeichnung" },
  { key: "projektName", label: "Projekt" },
  { key: "routeName", label: "Strecke", className: "w-[110px]" },
  { key: "km", label: "km", className: "w-[70px] text-right" },
  { key: "severity", label: "Schweregrad", className: "w-[110px]" },
  { key: "gueltigBis", label: "Gültig bis", className: "w-[95px]" },
  { key: "zustaendig", label: "Zuständig" },
]

function FundeTabelle({ live }: { live: boolean }) {
  const projects = useProjectStore((s) => s.projects)
  const [query, setQuery] = useState("")
  const [sevFilter, setSevFilter] = useState<FindingSeverity | "alle">("alle")
  const [katFilter, setKatFilter] = useState("alle")
  const [sortKey, setSortKey] = useState<SortKey>("km")
  const [sortDir, setSortDir] = useState<1 | -1>(1)
  const [selected, setSelected] = useState<DbFinding | null>(null)
  const debouncedQuery = useDebounce(query, 300)

  // Live: Server-Suche. Demo: lokale Aggregation über die Projekt-Funde.
  const serverSearch = useQuery({
    queryKey: ["db-findings", debouncedQuery, sevFilter, katFilter],
    queryFn: () =>
      api.searchFindings({
        q: debouncedQuery || undefined,
        severity: sevFilter === "alle" ? undefined : sevFilter,
        kategorie: katFilter === "alle" ? undefined : katFilter,
      }),
    enabled: live,
    staleTime: 15_000,
  })

  const localRows: DbFinding[] = useMemo(
    () =>
      projects.flatMap((p) =>
        p.findings.map((f) => ({ ...f, projektId: p.id, projektName: p.name })),
      ),
    [projects],
  )

  const rows = useMemo(() => {
    let r: DbFinding[]
    if (live) {
      r = serverSearch.data ?? []
    } else {
      const q = query.trim().toLowerCase()
      r = localRows
        .filter((x) => (sevFilter === "alle" ? true : x.severity === sevFilter))
        .filter((x) => (katFilter === "alle" ? true : x.kategorie === katFilter))
        .filter((x) =>
          q
            ? x.titel.toLowerCase().includes(q) ||
              x.beschreibung.toLowerCase().includes(q) ||
              x.projektName.toLowerCase().includes(q) ||
              KATEGORIE_META[x.kategorie].label.toLowerCase().includes(q)
            : true,
        )
    }
    const dir = sortDir
    return [...r].sort((a, b) => {
      if (sortKey === "km") return (a.km - b.km) * dir
      if (sortKey === "severity")
        return (SEVERITY_META[a.severity].rank - SEVERITY_META[b.severity].rank) * dir
      const av = String(a[sortKey] ?? "")
      const bv = String(b[sortKey] ?? "")
      return av.localeCompare(bv, "de") * dir
    })
  }, [live, serverSearch.data, localRows, query, sevFilter, katFilter, sortKey, sortDir])

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir((d) => (d === 1 ? -1 : 1))
    else {
      setSortKey(key)
      setSortDir(1)
    }
  }

  return (
    <div className="flex flex-col gap-4">
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
        <Select
          value={sevFilter}
          onChange={(e) => setSevFilter(e.target.value as FindingSeverity | "alle")}
          className="sm:w-40"
        >
          <option value="alle">Alle Schweregrade</option>
          {SEVERITY_ORDER.map((s) => (
            <option key={s} value={s}>
              {SEVERITY_META[s].label}
            </option>
          ))}
        </Select>
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
      </div>

      <p className="text-xs text-neutral-400">
        {live && serverSearch.isLoading ? "Suche läuft …" : `${rows.length} Einträge`}
        {live ? " · Live-Datenbank" : " · lokale Projekte (Demo)"} · Zeile öffnen zeigt die Karte
      </p>

      {live && serverSearch.isLoading ? (
        <Card>
          <div className="flex flex-col gap-3 p-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="skeleton h-9 w-full rounded" />
            ))}
          </div>
        </Card>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Database}
          title="Keine Treffer"
          description={
            !query && sevFilter === "alle" && katFilter === "alle"
              ? "Es wurden noch keine Auswertungen gefahren."
              : "Für diese Suche gibt es keine Funde."
          }
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-neutral-200 bg-neutral-50/80">
                  {SPALTEN.map((sp) => (
                    <th
                      key={sp.key}
                      aria-sort={
                        sortKey === sp.key ? (sortDir === 1 ? "ascending" : "descending") : "none"
                      }
                      className={cn(
                        "px-3 py-2.5 text-left font-medium text-neutral-500",
                        sp.className,
                      )}
                    >
                      <button
                        onClick={() => toggleSort(sp.key)}
                        className="inline-flex cursor-pointer items-center gap-1 text-xs uppercase tracking-wide transition-colors hover:text-neutral-800"
                      >
                        {sp.label}
                        {sortKey === sp.key ? (
                          sortDir === 1 ? (
                            <ArrowUp className="h-3 w-3" />
                          ) : (
                            <ArrowDown className="h-3 w-3" />
                          )
                        ) : (
                          <ArrowUpDown className="h-3 w-3 opacity-40" />
                        )}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((f) => {
                  const sev = SEVERITY_META[f.severity]
                  return (
                    <tr
                      key={`${f.projektId}-${f.id}`}
                      onClick={() => setSelected(f)}
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") setSelected(f)
                      }}
                      className="cursor-pointer border-b border-neutral-100 transition-colors last:border-0 hover:bg-primary-50/40 focus-visible:bg-primary-50/40 focus-visible:outline-none"
                    >
                      <td className="px-3 py-2.5 font-mono text-xs text-neutral-500">
                        {f.fachId ?? "—"}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="inline-flex items-center gap-1.5 text-neutral-700">
                          <span className="inline-flex h-5 w-5 items-center justify-center rounded bg-neutral-100">
                            <KategorieGlyph kategorie={f.kategorie} className="h-3 w-3" />
                          </span>
                          {KATEGORIE_META[f.kategorie].label}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 font-medium text-neutral-900">{f.titel}</td>
                      <td className="max-w-[200px] truncate px-3 py-2.5 text-neutral-600">
                        {f.projektName}
                      </td>
                      <td className="max-w-[110px] truncate px-3 py-2.5 text-neutral-600">
                        {f.routeName ?? "—"}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-neutral-600">
                        {f.km.toLocaleString("de-DE")}
                      </td>
                      <td className="px-3 py-2.5">
                        <Badge variant={sev.badge} size="sm">
                          {sev.label}
                        </Badge>
                      </td>
                      <td className="px-3 py-2.5 tabular-nums text-neutral-600">
                        {f.gueltigBis ? f.gueltigBis.split("-").reverse().join(".") : "—"}
                      </td>
                      <td className="max-w-[220px] truncate px-3 py-2.5 text-neutral-600">
                        {f.zustaendig ?? "—"}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <FindingMapDialog finding={selected} onClose={() => setSelected(null)} />
    </div>
  )
}

// ── Übersichtskarte der Hindernis-Datenbank ───────────────────────────────────

function KarteTab({ live }: { live: boolean }) {
  const obstacles = useQuery({
    queryKey: ["obstacles-alle"],
    queryFn: () => api.listObstacles(),
    enabled: live,
    staleTime: 60_000,
  })

  if (!live) {
    return (
      <EmptyState
        icon={MapIcon}
        title="Hindernis-Datenbank nicht verbunden"
        description="Die zentrale Hindernis-Datenbank lebt im Backend. Im Demo-Modus (ohne Server) ist die Übersichtskarte nicht verfügbar."
      />
    )
  }

  if (obstacles.isLoading) {
    return <div className="skeleton h-[60vh] min-h-[380px] w-full rounded-xl" />
  }

  return (
    <div className="h-[calc(100vh-320px)] min-h-[420px]">
      <ObstaclesMap obstacles={obstacles.data ?? []} />
    </div>
  )
}
