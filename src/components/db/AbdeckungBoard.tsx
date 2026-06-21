// Datenabdeckungs-Scoreboard (in-app, Datenbank-Reiter): Bundesländer × Datentypen.
// Pro Zelle die erreichte Quote Ist ÷ Max in % als Heatmap (dunkelrot 0 % → dunkelgrün 100 %),
// weißer Text. Ist/Max + Quelle je Zelle im Tooltip. Bewertet die Verfügbarkeit amtlicher Quellen.
//
// T-482: Daten kommen jetzt aus GET /api/abdeckung — DIESELBE Quelle wie die öffentliche Seite
// /roadmap/abdeckung (kein zweites hartkodiertes Literal mehr, keine Divergenz). %-Werte sind eine
// redaktionelle Einschätzung, kein Echtzeit-Status; Stand + echte Connector-Zahl aus der Antwort.

import { useQuery } from "@tanstack/react-query"
import { Database } from "lucide-react"
import { EmptyState } from "@/components/shared/EmptyState"
import { api } from "@/api/roadmap"
import { useDataSourceStore } from "@/store/datasource"

const avg = (a: number[]) => Math.round(a.reduce((x, y) => x + y, 0) / a.length)
// Erreichte Quote = Ist ÷ Max in % ("wieviel vom öffentlich Möglichen haben wir schon").
const quote = (ist: number, max: number) => (max > 0 ? Math.round((ist / max) * 100) : 0)
// Heatmap: dunkelrot (0 %) → dunkelgrün (100 %). FESTE dunkle Helligkeit (28 %) → weißer Zell-Text AA-lesbar.
const cellColor = (pct: number) => `hsl(${Math.round(Math.max(0, Math.min(100, pct)) * 1.3)} 60% 28%)`
const GRADIENT = "linear-gradient(to right, hsl(0 60% 28%), hsl(39 60% 28%), hsl(65 60% 28%), hsl(98 60% 28%), hsl(130 60% 28%))"

function fmtStand(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${m[3]}.${m[2]}.${m[1]}` : iso
}

function Cell({ ist, max, quelle, land, kat }: { ist: number; max: number; quelle: string; land: string; kat: string }) {
  const pct = quote(ist, max)
  return (
    <td
      className="border-l border-white/15 px-2 py-2 text-center"
      style={{ background: cellColor(pct) }}
      title={`${land} · ${kat} — ${pct}% (Ist ${ist} / Max ${max}): ${quelle}`}
    >
      <span className="tabular-nums text-sm font-bold text-white">{pct}%</span>
    </td>
  )
}

export function AbdeckungBoard() {
  const live = useDataSourceStore((s) => s.mode) === "live"
  const q = useQuery({
    queryKey: ["abdeckung"],
    queryFn: () => api.abdeckung(),
    enabled: live,
    staleTime: 60 * 60_000, // redaktionell, ändert sich selten
  })

  if (!live) {
    return (
      <EmptyState
        icon={Database}
        title="Abdeckung nicht verbunden"
        description="Die Abdeckungs-Übersicht lebt im Backend. Im Demo-Modus (ohne Server) nicht verfügbar."
      />
    )
  }
  if (q.isLoading) return <div className="skeleton h-64 w-full rounded-xl" />
  if (q.isError || !q.data) {
    return (
      <EmptyState icon={Database} title="Abdeckung nicht ladbar" description="Bitte später erneut versuchen." />
    )
  }

  const { kats: KATS, data: DATA, stand, connectoren, hinweis } = q.data
  const laender = Object.entries(DATA)
  const colIst = KATS.map((_, i) => laender.map(([, cells]) => cells[i][0]))
  const colMax = KATS.map((_, i) => laender.map(([, cells]) => cells[i][1]))

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] text-neutral-600">
        <span className="flex items-center gap-2">
          erreichte Abdeckung (Ist ÷ Max):
          <span className="tabular-nums">0 %</span>
          <span className="h-3.5 w-44 rounded" style={{ background: GRADIENT }} aria-hidden />
          <span className="tabular-nums">100 %</span>
        </span>
        <span className="text-neutral-500">Ist/Max je Zelle im Tooltip</span>
        <span className="ml-auto text-neutral-400">
          Stand {fmtStand(stand)} · {connectoren} angebundene Connectoren
        </span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
        <table className="w-full min-w-[720px] border-collapse">
          <thead>
            <tr>
              <th className="sticky left-0 bg-neutral-100 px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-neutral-600">Bundesland</th>
              {KATS.map((k) => (
                <th key={k} className="border-l border-neutral-200 bg-neutral-100 px-2 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-600">{k}</th>
              ))}
              <th className="border-l border-neutral-200 bg-neutral-100 px-2 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-600">Ø</th>
            </tr>
          </thead>
          <tbody>
            {laender.map(([land, cells]) => {
              const ist = cells.map((c) => c[0])
              const max = cells.map((c) => c[1])
              return (
                <tr key={land} className="border-t border-neutral-100 hover:bg-neutral-50/60">
                  <th className="px-4 py-1.5 text-left text-[13.5px] font-semibold text-neutral-900">
                    {land}
                    <span className="block text-[11px] font-normal text-neutral-500">Ø {quote(avg(ist), avg(max))}%</span>
                  </th>
                  {cells.map((c, i) => (
                    <Cell key={i} ist={c[0]} max={c[1]} quelle={c[2]} land={land} kat={KATS[i]} />
                  ))}
                  <Cell ist={avg(ist)} max={avg(max)} quelle="Durchschnitt über alle Datentypen" land={land} kat="Ø" />
                </tr>
              )
            })}
            <tr className="border-t-2 border-neutral-300 bg-neutral-50">
              <th className="px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-neutral-500">Ø je Datentyp</th>
              {KATS.map((k, i) => (
                <Cell key={k} ist={avg(colIst[i])} max={avg(colMax[i])} quelle="Durchschnitt über alle Länder" land={k} kat="Ø" />
              ))}
              <Cell ist={avg(colIst.flat())} max={avg(colMax.flat())} quelle="Gesamt" land="Gesamt" kat="Ø" />
            </tr>
          </tbody>
        </table>
      </div>

      <p className="text-xs leading-relaxed text-neutral-500">
        {hinweis} Die <b>%-Zahl</b> = Ist ÷ Max, der Anteil des öffentlich Möglichen, den wir schon haben.
        <b> Ist niedrig, Max hoch</b> = frei verfügbare Daten existieren, müssen nur angebunden werden
        (aktuell v. a. <b>Bayern</b> via BayernInfo). <b>Auch Max niedrig</b> = öffentlich nicht verfügbar
        (Brücken/Tunnel/Gewicht außerhalb NRW/Bayern/Berlin/Hamburg/Hessen — nur WSV-Brücken frei).
        Öffentliche Version: <code className="rounded bg-neutral-100 px-1">setreo-cloud.com/roadmap/abdeckung</code>
      </p>
    </div>
  )
}
