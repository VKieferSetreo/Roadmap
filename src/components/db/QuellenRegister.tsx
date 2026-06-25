// Quellenregister (DB-Tab, nur Setreo-intern): alle angebundenen Datenquellen mit Suche,
// Live-Ping ("ist sie erreichbar + wie viele Datensätze?") und aufklappbaren Details
// (Land, Typ, Intervall, letzter Abruf, Vollbestand).

import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { ChevronDown, Database, Plus, RefreshCw, Search, Signal, X } from "lucide-react"
import { Card } from "@/components/ui/Card"
import { Input } from "@/components/ui/Input"
import { Button } from "@/components/ui/Button"
import { Badge } from "@/components/ui/Badge"
import { EmptyState } from "@/components/shared/EmptyState"
import { SourceRequestDialog } from "./SourceRequestDialog"
import { api } from "@/api/roadmap"
import { useDataSourceStore } from "@/store/datasource"
import { formatRelativeDE } from "@/lib/format"
import { cn } from "@/lib/cn"

const LAENDER = [
  "Baden-Württemberg", "Bayern", "Berlin", "Brandenburg", "Bremen", "Hamburg", "Hessen",
  "Mecklenburg-Vorpommern", "Niedersachsen", "Nordrhein-Westfalen", "Rheinland-Pfalz",
  "Saarland", "Sachsen-Anhalt", "Sachsen", "Schleswig-Holstein", "Thüringen",
]
function landAus(name: string): string {
  for (const l of LAENDER) if (name.includes(l)) return l
  if (/autobahn|bundesweit|\bBAB\b|WSV|Mobilithek/i.test(name)) return "Bundesweit"
  return "—"
}

type PingState = { loading?: boolean; ok?: boolean; anzahl?: number; ms?: number; error?: string }

export function QuellenRegister() {
  const live = useDataSourceStore((s) => s.mode) === "live"
  const status = useQuery({
    queryKey: ["sync-status-register"],
    queryFn: () => api.sync.status(),
    enabled: live,
    staleTime: 30_000,
  })
  const [q, setQ] = useState("")
  const [pings, setPings] = useState<Record<string, PingState>>({})
  const [open, setOpen] = useState<string | null>(null)
  const [allPinging, setAllPinging] = useState(false)
  const [anfrageOpen, setAnfrageOpen] = useState(false)

  const quellen = useMemo(() => {
    const s = q.trim().toLowerCase()
    const list = status.data?.quellen ?? []
    if (!s) return list
    return list.filter((qq) => qq.id.includes(s) || qq.name.toLowerCase().includes(s) || landAus(qq.name).toLowerCase().includes(s))
  }, [status.data, q])

  const ping = async (id: string) => {
    setPings((p) => ({ ...p, [id]: { loading: true } }))
    try {
      const r = await api.sync.ping(id)
      setPings((p) => ({ ...p, [id]: r }))
    } catch {
      setPings((p) => ({ ...p, [id]: { ok: false, error: "Fehler" } }))
    }
  }

  // Zentral: alle Quellen mit Connector anpingen (5er-Pool, damit langsame Feeds nicht blockieren).
  const pingAlle = async () => {
    const ids = quellen.filter((qq) => qq.connector).map((qq) => qq.id)
    if (ids.length === 0) return
    setAllPinging(true)
    setPings((p) => {
      const n = { ...p }
      for (const id of ids) n[id] = { loading: true }
      return n
    })
    let i = 0
    const arbeiter = async () => {
      while (i < ids.length) await ping(ids[i++])
    }
    await Promise.all(Array.from({ length: 5 }, arbeiter))
    setAllPinging(false)
  }

  if (!live) {
    return (
      <EmptyState
        icon={Database}
        title="Quellenregister nicht verbunden"
        description="Das Register lebt im Backend. Im Demo-Modus (ohne Server) nicht verfügbar."
      />
    )
  }

  const mitConnector = (status.data?.quellen ?? []).filter((x) => x.connector).length

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Quelle, ID oder Land suchen …" className="pl-9" aria-label="Quellen durchsuchen" />
          {q ? (
            <button onClick={() => setQ("")} aria-label="Suche leeren" title="Suche leeren" className="absolute right-2.5 top-1/2 -translate-y-1/2 cursor-pointer rounded p-0.5 text-neutral-400 hover:text-neutral-700">
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>
        <span className="text-sm text-neutral-500">
          {quellen.length} Quellen · {mitConnector} mit Connector
        </span>
        <div className="flex-1" />
        <Button variant="outline" size="sm" onClick={() => void status.refetch()} disabled={status.isFetching}>
          <RefreshCw className={cn("h-3.5 w-3.5", status.isFetching && "animate-spin")} /> Aktualisieren
        </Button>
        <Button variant="outline" size="sm" onClick={() => void pingAlle()} loading={allPinging} disabled={mitConnector === 0}>
          <Signal className="h-3.5 w-3.5" />
          {allPinging ? "Pinge …" : "Ping"}
        </Button>
        <Button variant="outline" size="sm" onClick={() => setAnfrageOpen(true)}>
          <Plus className="h-3.5 w-3.5" /> Quelle anfragen
        </Button>
      </div>

      {status.isLoading ? (
        <div className="skeleton h-64 w-full rounded-xl" />
      ) : status.isError ? (
        // T-228: Ladefehler nicht als „keine Quelle" tarnen.
        <EmptyState
          icon={Database}
          title="Quellenregister nicht abrufbar"
          description="Die Quellen konnten gerade nicht geladen werden. Bitte später erneut versuchen."
        />
      ) : quellen.length === 0 ? (
        <EmptyState icon={Search} title="Keine Quelle gefunden" description={`Kein Treffer für „${q.trim()}".`} />
      ) : (
        <Card>
          <ul className="divide-y divide-neutral-100">
            {quellen.map((qq) => {
              const p = pings[qq.id]
              const isOpen = open === qq.id
              return (
                <li key={qq.id}>
                  <div className="flex items-center gap-3 px-4 py-2.5">
                    <button
                      onClick={() => setOpen(isOpen ? null : qq.id)}
                      aria-expanded={isOpen}
                      className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left"
                    >
                      <span className="font-mono text-xs tabular-nums text-neutral-400">{qq.id}</span>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-neutral-800">{qq.name}</span>
                      {/* Lizenz-Status: Ready (grün, kommerziell nutzbar) | Open (grau, unklar) | Intern (rot, NC). */}
                      {qq.lizenzStatus === "intern" ? (
                        <Badge variant="kritisch" size="sm" title="Kommerzielle Nutzung explizit untersagt — nur für interne Nutzung">Intern</Badge>
                      ) : qq.lizenzStatus === "open" ? (
                        <Badge variant="muted" size="sm" title="Lizenz unklar — kommerzielle Nutzung noch nicht bestätigt">Open</Badge>
                      ) : (
                        <Badge variant="success" size="sm" title="Lizenz erlaubt kommerzielle Nutzung">Ready</Badge>
                      )}
                      {qq.connector ? (
                        <Badge variant="success" size="sm">Connector</Badge>
                      ) : (
                        <Badge variant="muted" size="sm">Register</Badge>
                      )}
                      <ChevronDown className={cn("h-4 w-4 shrink-0 text-neutral-400 transition-transform", isOpen && "rotate-180")} />
                    </button>
                    {p ? (
                      <span className={cn(
                        "min-w-[96px] shrink-0 text-right text-xs tabular-nums",
                        p.loading ? "text-neutral-400" : p.ok ? "text-severity-hinweis-strong" : "text-severity-kritisch",
                      )}>
                        {p.loading ? "pinge …" : p.ok ? `live · ${p.anzahl} (${((p.ms ?? 0) / 1000).toFixed(1)}s)` : `Fehler · ${p.error ?? ""}`}
                      </span>
                    ) : null}
                  </div>
                  {isOpen ? (
                    <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 border-t border-neutral-100 bg-neutral-50/60 px-4 py-3 text-xs sm:grid-cols-4">
                      <Detail label="Typ" value={qq.typ ?? "—"} />
                      <Detail label="Abruf-Intervall" value={qq.abrufIntervall ?? "—"} />
                      <Detail label="Vollbestand" value={qq.vollbestand ? "ja (Reconcile)" : "nein"} />
                      <Detail label="Letzter Abruf" value={qq.letzterAbruf ? formatRelativeDE(qq.letzterAbruf) : "noch nie"} />
                      <Detail label="Status" value={qq.connector ? "Connector aktiv" : "nur im Register (kein Abruf)"} />
                      <div className="col-span-2 sm:col-span-4">
                        <dt className="text-neutral-400">Was wir ziehen</dt>
                        <dd className="text-neutral-700">{qq.name}</dd>
                      </div>
                    </dl>
                  ) : null}
                </li>
              )
            })}
          </ul>
        </Card>
      )}
      <SourceRequestDialog open={anfrageOpen} onClose={() => setAnfrageOpen(false)} />
    </div>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-neutral-400">{label}</dt>
      <dd className="font-medium text-neutral-700">{value}</dd>
    </div>
  )
}
