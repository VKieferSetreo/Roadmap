// Änderungsverfolgung (recharts, lazy geladen): Zeitreihe neu/geändert/weggefallen,
// Kategorie-Aufschlüsselung, Laufzeit- und Vorlaufzeit-Verteilung.
//
// Farben nach dataviz-Skill-Palette (validate_palette.js, alle Checks PASS): die drei
// Ereignis-Typen sind ein fester, app-weiter Farbcode — NIE nach Rang neu zugeordnet.

import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import type { VeraenderungenUebersicht } from "@/api/roadmap"
import { katMeta } from "@/components/project/findingMeta"

const FARBE = { neu: "#1baf7a", geaendert: "#eb6834", weggefallen: "#2a78d6" } as const
const LABEL = { neu: "Neu", geaendert: "Geändert", weggefallen: "Weggefallen" } as const

const TOOLTIP = {
  borderRadius: 12,
  border: "1px solid rgb(229 229 232)",
  boxShadow: "0 8px 30px -6px rgba(16,24,40,.18)",
  fontSize: 12,
  fontFamily: "Inter, system-ui, sans-serif",
} as const

function Leer({ text = "Noch keine Daten in diesem Fenster" }: { text?: string }) {
  return <div className="flex h-44 items-center justify-center text-sm text-neutral-400">{text}</div>
}

/** Gestapelte Säulen: neu/geändert/weggefallen je Tag. Das Kern-Chart der Auswertung —
 *  zeigt Tag für Tag, wie viel Bewegung im Bestand ist. */
export function VeraenderungenZeitreihe({ data }: { data: VeraenderungenUebersicht["zeitreihe"] }) {
  if (!data.some((d) => d.neu > 0 || d.geaendert > 0 || d.weggefallen > 0)) return <Leer />
  const rows = data.map((d) => ({ ...d, label: `${d.tag.slice(8, 10)}.${d.tag.slice(5, 7)}` }))
  return (
    <div style={{ height: 260 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 4, right: 8, bottom: 0, left: -18 }} barGap={1}>
          <CartesianGrid vertical={false} stroke="#F4F4F5" />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#A1A1AA" }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
          <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#A1A1AA" }} axisLine={false} tickLine={false} />
          <Tooltip cursor={{ fill: "rgba(0,0,0,0.03)" }} contentStyle={TOOLTIP} />
          <Legend wrapperStyle={{ fontSize: 12 }} formatter={(k) => LABEL[k as keyof typeof LABEL]} />
          <Bar dataKey="neu" name="neu" stackId="e" fill={FARBE.neu} isAnimationActive animationDuration={500} />
          <Bar dataKey="geaendert" name="geaendert" stackId="e" fill={FARBE.geaendert} isAnimationActive animationDuration={500} />
          <Bar dataKey="weggefallen" name="weggefallen" stackId="e" fill={FARBE.weggefallen} radius={[3, 3, 0, 0]} isAnimationActive animationDuration={500} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

/** Horizontale Balken je Kategorie (Baustelle/Sperrung/…), gestapelt nach Typ. */
export function VeraenderungenProKategorie({ data }: { data: VeraenderungenUebersicht["proKategorie"] }) {
  const kats = Array.from(new Set([...Object.keys(data.neu), ...Object.keys(data.geaendert), ...Object.keys(data.weggefallen)]))
  const rows = kats
    .map((k) => ({
      name: katMeta(k).label,
      neu: data.neu[k] ?? 0,
      geaendert: data.geaendert[k] ?? 0,
      weggefallen: data.weggefallen[k] ?? 0,
    }))
    .filter((r) => r.neu + r.geaendert + r.weggefallen > 0)
    .sort((a, b) => b.neu + b.geaendert + b.weggefallen - (a.neu + a.geaendert + a.weggefallen))
  if (!rows.length) return <Leer />
  return (
    <div style={{ height: Math.max(176, rows.length * 32 + 30) }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid horizontal={false} stroke="#F4F4F5" />
          <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: "#A1A1AA" }} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 12, fill: "#52525B" }} axisLine={false} tickLine={false} />
          <Tooltip cursor={{ fill: "rgba(0,0,0,0.03)" }} contentStyle={TOOLTIP} />
          <Legend wrapperStyle={{ fontSize: 12 }} formatter={(k) => LABEL[k as keyof typeof LABEL]} />
          <Bar dataKey="neu" name="neu" stackId="k" fill={FARBE.neu} maxBarSize={18} isAnimationActive animationDuration={500} />
          <Bar dataKey="geaendert" name="geaendert" stackId="k" fill={FARBE.geaendert} maxBarSize={18} isAnimationActive animationDuration={500} />
          <Bar dataKey="weggefallen" name="weggefallen" stackId="k" fill={FARBE.weggefallen} maxBarSize={18} radius={[0, 3, 3, 0]} isAnimationActive animationDuration={500} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

const LAUFZEIT_LABEL: Record<string, string> = { kurz: "Kurz (≤7 Tage)", mittel: "Mittel (8–30 Tage)", lang: "Lang (>30 Tage)", unbekannt: "Unbekannt" }
const LAUFZEIT_FARBE: Record<string, string> = { kurz: "#1baf7a", mittel: "#eb6834", lang: "#2a78d6", unbekannt: "#a1a1aa" }
const VORLAUF_LABEL: Record<string, string> = {
  spontan: "Spontan (≤1 Tag)", kurzfristig: "Kurzfristig (2–6 Tage)",
  geplant: "Geplant (7–30 Tage)", langfristig: "Langfristig (>30 Tage)", unbekannt: "Unbekannt",
}
const VORLAUF_FARBE: Record<string, string> = {
  spontan: "#eb6834", kurzfristig: "#eda100", geplant: "#1baf7a", langfristig: "#2a78d6", unbekannt: "#a1a1aa",
}

/** Verteilungs-Donut, generisch für Laufzeit- und Vorlaufzeit-Klassen. */
function VerteilungsDonut({
  daten, labelMap, farbeMap, reihenfolge,
}: {
  daten: Record<string, number | undefined>
  labelMap: Record<string, string>
  farbeMap: Record<string, string>
  reihenfolge: string[]
}) {
  const rows = reihenfolge
    .map((k) => ({ key: k, name: labelMap[k] ?? k, value: daten[k] ?? 0 }))
    .filter((r) => r.value > 0)
  if (!rows.length) return <Leer />
  return (
    <div style={{ height: 220 }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={rows} dataKey="value" nameKey="name" innerRadius={48} outerRadius={78} paddingAngle={2} isAnimationActive animationDuration={500}>
            {rows.map((r) => <Cell key={r.key} fill={farbeMap[r.key]} stroke="#fff" strokeWidth={2} />)}
          </Pie>
          <Tooltip contentStyle={TOOLTIP} />
          <Legend wrapperStyle={{ fontSize: 11 }} layout="vertical" verticalAlign="middle" align="right" />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}

/** Laufzeit-Verteilung der NEUEN Maßnahmen im Fenster (kurz/mittel/lang/unbekannt). */
export function VeraenderungenLaufzeiten({ data }: { data: VeraenderungenUebersicht["laufzeiten"] }) {
  return <VerteilungsDonut daten={data} labelMap={LAUFZEIT_LABEL} farbeMap={LAUFZEIT_FARBE} reihenfolge={["kurz", "mittel", "lang", "unbekannt"]} />
}

/** Vorlaufzeit-Verteilung — die Kernaussage für die GL: wie spontan kommt eine Maßnahme rein. */
export function VeraenderungenVorlaufzeiten({ data }: { data: VeraenderungenUebersicht["vorlaufzeiten"] }) {
  return <VerteilungsDonut daten={data} labelMap={VORLAUF_LABEL} farbeMap={VORLAUF_FARBE} reihenfolge={["spontan", "kurzfristig", "geplant", "langfristig", "unbekannt"]} />
}
