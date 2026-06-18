// Analytics-Graphen (recharts, lazy geladen): aktive Nutzer je Tag (Säulen) +
// Nutzung je Nutzer (horizontale Balken). Setreo-Grün, gleiche Tooltip-Optik wie KategorieBar.

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import type { AnalyticsOverview } from "@/api/roadmap"

const GRUEN = "#87b52d"
const GRUEN_HELL = "#b7d97a"
const TOOLTIP = {
  borderRadius: 12,
  border: "1px solid rgb(229 229 232)",
  boxShadow: "0 8px 30px -6px rgba(16,24,40,.18)",
  fontSize: 12,
  fontFamily: "Inter, system-ui, sans-serif",
} as const

function Leer({ text = "Noch keine Daten" }: { text?: string }) {
  return <div className="flex h-44 items-center justify-center text-sm text-neutral-400">{text}</div>
}

/** Säulen: aktive Nutzer + manuelle Auswertungen je Tag (letzte 14 Tage). */
export function AktiveNutzerProTag({ data }: { data: AnalyticsOverview["proTag"] }) {
  if (!data.some((d) => d.nutzer > 0 || d.auswertungen > 0)) return <Leer text="Noch keine Aktivität in den letzten 14 Tagen" />
  const rows = data.map((d) => ({ ...d, label: `${d.tag.slice(8, 10)}.${d.tag.slice(5, 7)}` }))
  return (
    <div style={{ height: 240 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 4, right: 8, bottom: 0, left: -18 }} barGap={2}>
          <CartesianGrid vertical={false} stroke="#F4F4F5" />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#A1A1AA" }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
          <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#A1A1AA" }} axisLine={false} tickLine={false} />
          <Tooltip cursor={{ fill: "rgba(135,181,45,0.06)" }} contentStyle={TOOLTIP} />
          <Bar dataKey="nutzer" name="Aktive Nutzer" fill={GRUEN} radius={[4, 4, 0, 0]} maxBarSize={22} isAnimationActive animationDuration={500} />
          <Bar dataKey="auswertungen" name="Auswertungen" fill={GRUEN_HELL} radius={[4, 4, 0, 0]} maxBarSize={22} isAnimationActive animationDuration={500} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

/** Horizontale Balken: aktive Zeit (Minuten) je Nutzer, Top 12. */
export function NutzungJeNutzer({ data }: { data: AnalyticsOverview["proNutzer"] }) {
  const rows = data
    .filter((u) => u.aktivMin > 0 || u.sessions > 0)
    .slice(0, 12)
    .map((u) => ({ name: u.email.split("@")[0], aktivMin: u.aktivMin }))
  if (!rows.length) return <Leer />
  return (
    <div style={{ height: Math.max(176, rows.length * 30 + 30) }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid horizontal={false} stroke="#F4F4F5" />
          <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: "#A1A1AA" }} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 12, fill: "#52525B" }} axisLine={false} tickLine={false} />
          <Tooltip cursor={{ fill: "rgba(135,181,45,0.06)" }} contentStyle={TOOLTIP} />
          <Bar dataKey="aktivMin" name="Aktive Zeit (min)" fill={GRUEN} radius={[0, 4, 4, 0]} maxBarSize={18} isAnimationActive animationDuration={500} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
