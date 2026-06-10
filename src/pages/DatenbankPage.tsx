// Datenbank — zwei Reiter:
//  - "Funde": projektübergreifende Fund-Suche (live: Server-Suche, demo: lokale Projekte)
//  - "Hindernisse": die zentrale Hindernis-Datenbank (Backend) — vorbereitet für echte
//    Daten, Demo-Datensätze sind als solche markiert.

import { useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { Building2, Database, Landmark, Search, TriangleAlert } from "lucide-react"
import { PageContainer } from "@/components/layout/PageContainer"
import { Card } from "@/components/ui/Card"
import { Badge } from "@/components/ui/Badge"
import { Input } from "@/components/ui/Input"
import { Select } from "@/components/ui/Select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/Tabs"
import { EmptyState } from "@/components/shared/EmptyState"
import { useProjectStore } from "@/store/projects"
import { useDataSourceStore } from "@/store/datasource"
import { useDebounce } from "@/hooks/useDebounce"
import { api, type DbFinding } from "@/api/roadmap"
import { KategorieGlyph } from "@/components/project/KategorieGlyph"
import { KATEGORIE_META, SEVERITY_META, SEVERITY_ORDER } from "@/components/project/findingMeta"
import type { FindingKategorie, FindingSeverity, Obstacle } from "@/types/domain"
import { cn } from "@/lib/cn"

type DbTab = "funde" | "hindernisse"

export function DatenbankPage() {
  const [tab, setTab] = useState<DbTab>("funde")
  const mode = useDataSourceStore((s) => s.mode)

  return (
    <div className="h-full overflow-y-auto">
      <PageContainer
        title="Datenbank"
        description="Projektübergreifende Funde und die zentrale Hindernis-Datenbank."
      >
        <div className="flex flex-col gap-4">
          <Tabs value={tab} onValueChange={(v) => setTab(v as DbTab)}>
            <TabsList>
              <TabsTrigger value="funde">
                <Search className="h-4 w-4" /> Funde
              </TabsTrigger>
              <TabsTrigger value="hindernisse">
                <Landmark className="h-4 w-4" /> Hindernisse
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {tab === "funde" ? (
            <FundeTab live={mode === "live"} />
          ) : (
            <HindernisseTab live={mode === "live"} />
          )}
        </div>
      </PageContainer>
    </div>
  )
}

// ── Funde (projektübergreifend) ───────────────────────────────────────────────

function FundeTab({ live }: { live: boolean }) {
  const navigate = useNavigate()
  const projects = useProjectStore((s) => s.projects)
  const [query, setQuery] = useState("")
  const [sevFilter, setSevFilter] = useState<FindingSeverity | "alle">("alle")
  const [katFilter, setKatFilter] = useState("alle")
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

  const filtered = useMemo(() => {
    if (live) return serverSearch.data ?? []
    const q = query.trim().toLowerCase()
    return localRows
      .filter((r) => (sevFilter === "alle" ? true : r.severity === sevFilter))
      .filter((r) => (katFilter === "alle" ? true : r.kategorie === katFilter))
      .filter((r) =>
        q
          ? r.titel.toLowerCase().includes(q) ||
            r.beschreibung.toLowerCase().includes(q) ||
            r.projektName.toLowerCase().includes(q) ||
            KATEGORIE_META[r.kategorie].label.toLowerCase().includes(q)
          : true,
      )
  }, [live, serverSearch.data, localRows, query, sevFilter, katFilter])

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
        {live && serverSearch.isLoading ? "Suche läuft …" : `${filtered.length} Treffer`}
        {live ? " · Live-Datenbank" : " · lokale Projekte (Demo)"}
      </p>

      {live && serverSearch.isLoading ? (
        <Card>
          <div className="flex flex-col gap-3 p-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="skeleton h-9 w-9 rounded-md" />
                <div className="flex-1">
                  <div className="skeleton h-3.5 w-2/3 rounded" />
                  <div className="skeleton mt-1.5 h-3 w-1/3 rounded" />
                </div>
              </div>
            ))}
          </div>
        </Card>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Database}
          title="Keine Treffer"
          description={
            filtered.length === 0 && !query && sevFilter === "alle" && katFilter === "alle"
              ? "Es wurden noch keine Auswertungen gefahren."
              : "Für diese Suche gibt es keine Funde."
          }
        />
      ) : (
        <Card>
          <ul className="divide-y divide-neutral-100">
            {filtered.map((f) => {
              const kat = KATEGORIE_META[f.kategorie]
              const sev = SEVERITY_META[f.severity]
              return (
                <li key={`${f.projektId}-${f.id}`}>
                  <button
                    onClick={() => navigate(`/projekte/${f.projektId}/dashboard`)}
                    className={cn(
                      "flex w-full cursor-pointer items-center gap-3 border-l-2 px-4 py-3 text-left transition-colors hover:bg-neutral-50",
                      sev.accent,
                    )}
                  >
                    <span className={cn("rounded-md p-2", sev.chip)}>
                      <KategorieGlyph kategorie={f.kategorie} className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-neutral-900">{f.titel}</p>
                      <p className="truncate text-xs text-neutral-500">
                        {f.projektName} · {kat.label} · km {f.km.toLocaleString("de-DE")}
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
  )
}

// ── Hindernis-Datenbank ───────────────────────────────────────────────────────

/** Lesbare Zusammenfassung der wichtigsten Grenzwerte eines Hindernisses. */
function attrsSummary(o: Obstacle): string {
  const num = (v: number | string | undefined) =>
    typeof v === "number" ? v.toLocaleString("de-DE") : v
  const parts: string[] = []
  if (o.attrs.maxHoeheM !== undefined) parts.push(`Höhe ≤ ${num(o.attrs.maxHoeheM)} m`)
  if (o.attrs.maxBreiteM !== undefined) parts.push(`Breite ≤ ${num(o.attrs.maxBreiteM)} m`)
  if (o.attrs.maxGewichtT !== undefined) parts.push(`Last ≤ ${num(o.attrs.maxGewichtT)} t`)
  if (o.attrs.maxAchslastT !== undefined) parts.push(`Achslast ≤ ${num(o.attrs.maxAchslastT)} t`)
  if (o.attrs.steigungPct !== undefined) parts.push(`Steigung ${num(o.attrs.steigungPct)} %`)
  if (o.attrs.radiusM !== undefined) parts.push(`Radius ${num(o.attrs.radiusM)} m`)
  if (o.attrs.restbreiteM !== undefined) parts.push(`Restbreite ${num(o.attrs.restbreiteM)} m`)
  return parts.join(" · ")
}

function HindernisseTab({ live }: { live: boolean }) {
  const [katFilter, setKatFilter] = useState("alle")
  const [query, setQuery] = useState("")
  const debouncedQuery = useDebounce(query, 300)

  const obstacles = useQuery({
    queryKey: ["obstacles", katFilter, debouncedQuery],
    queryFn: () =>
      api.listObstacles({
        kategorie: katFilter === "alle" ? undefined : katFilter,
        q: debouncedQuery || undefined,
      }),
    enabled: live,
    staleTime: 30_000,
  })

  if (!live) {
    return (
      <EmptyState
        icon={Landmark}
        title="Hindernis-Datenbank nicht verbunden"
        description="Die zentrale Hindernis-Datenbank lebt im Backend. Im Demo-Modus (ohne Server) werden Funde lokal simuliert — sobald die Anwendung gegen die Live-Datenbank läuft, erscheinen hier alle erfassten Hindernisse."
      />
    )
  }

  const rows = obstacles.data ?? []
  const demoCount = rows.filter((o) => o.demo).length

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Hindernisse durchsuchen (Name, Straße, Zuständigkeit) …"
            className="pl-9"
          />
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
      </div>

      <p className="text-xs text-neutral-400">
        {obstacles.isLoading
          ? "Lade Hindernisse …"
          : `${rows.length} Einträge${demoCount > 0 ? ` · davon ${demoCount} Demo-Datensätze` : ""}`}
      </p>

      {obstacles.isLoading ? (
        <Card>
          <div className="flex flex-col gap-3 p-4">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="skeleton h-9 w-9 rounded-md" />
                <div className="flex-1">
                  <div className="skeleton h-3.5 w-1/2 rounded" />
                  <div className="skeleton mt-1.5 h-3 w-2/3 rounded" />
                </div>
              </div>
            ))}
          </div>
        </Card>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Landmark}
          title="Noch keine Hindernisse erfasst"
          description="Die Datenbank ist bereit — Hindernisse können über die Import-Schnittstelle (GeoJSON/JSON) oder die API eingespielt werden. Analysen finden dann automatisch alle Hindernisse im Strecken-Korridor."
        />
      ) : (
        <Card>
          <ul className="divide-y divide-neutral-100">
            {rows.map((o) => {
              const kat = KATEGORIE_META[o.kategorie as FindingKategorie]
              const summary = attrsSummary(o)
              return (
                <li key={o.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="rounded-md bg-neutral-100 p-2 text-neutral-600">
                    <KategorieGlyph kategorie={o.kategorie} className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 truncate text-sm font-medium text-neutral-900">
                      {o.name}
                      {!o.aktiv ? (
                        <Badge variant="muted" size="xs">
                          inaktiv
                        </Badge>
                      ) : null}
                      {o.demo ? (
                        <Badge variant="accent" size="xs">
                          Demo
                        </Badge>
                      ) : null}
                    </p>
                    <p className="truncate text-xs text-neutral-500">
                      {kat?.label ?? o.kategorie}
                      {o.strassenRef ? ` · ${o.strassenRef}` : ""}
                      {summary ? ` · ${summary}` : ""}
                    </p>
                  </div>
                  {o.zustaendig ? (
                    <span className="hidden items-center gap-1.5 text-xs text-neutral-400 lg:flex">
                      <Building2 className="h-3.5 w-3.5" />
                      <span className="max-w-[220px] truncate">{o.zustaendig}</span>
                    </span>
                  ) : null}
                  {o.gueltigBis ? (
                    <span className="hidden items-center gap-1 text-xs text-neutral-400 md:flex">
                      <TriangleAlert className="h-3.5 w-3.5" />
                      bis {o.gueltigBis.split("-").reverse().join(".")}
                    </span>
                  ) : null}
                </li>
              )
            })}
          </ul>
        </Card>
      )}
    </div>
  )
}
