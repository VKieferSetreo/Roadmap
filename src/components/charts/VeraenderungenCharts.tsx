// Änderungsverfolgung (recharts, lazy geladen): Zeitreihe neu/geändert/ausgelaufen/entfernt,
// Kategorie- und Straßenklassen-Aufschlüsselung, Laufzeit- und Vorlaufzeit-Verteilung.
//
// Farben nach dataviz-Skill-Palette (validate_palette.js, alle Checks PASS): die vier
// Ereignis-Typen sind ein fester, app-weiter Farbcode — NIE nach Rang neu zugeordnet.
// "ausgelaufen" (planmäßig, gueltig_bis war schon erreicht) vs. "entfernt" (Maßnahme war noch
// gültig/unbefristet und verschwand trotzdem — das eigentlich auffällige Ereignis).

import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import type { VeraenderungenUebersicht } from "@/api/roadmap"
import { katMeta } from "@/components/project/findingMeta"

const FARBE = { neu: "#1baf7a", geaendert: "#eb6834", ausgelaufen: "#2a78d6", entfernt: "#4a3aa7" } as const
const LABEL = { neu: "Neu", geaendert: "Geändert", ausgelaufen: "Ausgelaufen", entfernt: "Entfernt" } as const

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

const TYPEN = ["neu", "geaendert", "ausgelaufen", "entfernt"] as const

/** Gestapelte Säulen: neu/geändert/ausgelaufen/entfernt je Tag. Das Kern-Chart der Auswertung —
 *  zeigt Tag für Tag, wie viel Bewegung im Bestand ist. */
export function VeraenderungenZeitreihe({ data }: { data: VeraenderungenUebersicht["zeitreihe"] }) {
  if (!data.some((d) => TYPEN.some((t) => d[t] > 0))) return <Leer />
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
          {TYPEN.map((t, i) => (
            <Bar
              key={t} dataKey={t} name={t} stackId="e" fill={FARBE[t]} isAnimationActive animationDuration={500}
              radius={i === TYPEN.length - 1 ? [3, 3, 0, 0] : undefined}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

/** Horizontale Balken je Dimension (Kategorie oder Straßenklasse), gestapelt nach Typ. Generisch,
 *  weil "Je Kategorie" und "Je Straßenklasse" dieselbe Form haben. */
function GestapelteBalken({
  data, labelFuer,
}: {
  data: VeraenderungenUebersicht["proKategorie"] | VeraenderungenUebersicht["proStrassenklasse"]
  labelFuer: (key: string) => string
}) {
  const keys = Array.from(new Set(TYPEN.flatMap((t) => Object.keys(data[t]))))
  const rows = keys
    .map((k) => {
      const row: Record<string, number | string> = { name: labelFuer(k) }
      let summe = 0
      for (const t of TYPEN) { const v = data[t][k] ?? 0; row[t] = v; summe += v }
      row.__summe = summe
      return row
    })
    .filter((r) => (r.__summe as number) > 0)
    .sort((a, b) => (b.__summe as number) - (a.__summe as number))
  if (!rows.length) return <Leer />
  return (
    <div style={{ height: Math.max(176, rows.length * 32 + 30) }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid horizontal={false} stroke="#F4F4F5" />
          <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: "#A1A1AA" }} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 12, fill: "#52525B" }} axisLine={false} tickLine={false} />
          <Tooltip cursor={{ fill: "rgba(0,0,0,0.03)" }} contentStyle={TOOLTIP} />
          <Legend wrapperStyle={{ fontSize: 12 }} formatter={(k) => LABEL[k as keyof typeof LABEL]} />
          {TYPEN.map((t, i) => (
            <Bar
              key={t} dataKey={t} name={t} stackId="k" fill={FARBE[t]} maxBarSize={18} isAnimationActive animationDuration={500}
              radius={i === TYPEN.length - 1 ? [0, 3, 3, 0] : undefined}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

/** Horizontale Balken je Kategorie (Baustelle/Sperrung/…), gestapelt nach Typ. */
export function VeraenderungenProKategorie({ data }: { data: VeraenderungenUebersicht["proKategorie"] }) {
  return <GestapelteBalken data={data} labelFuer={(k) => katMeta(k).label} />
}

const STRASSENKLASSE_LABEL: Record<string, string> = {
  autobahn: "Autobahn", bundesstrasse: "Bundesstraße", landesstrasse: "Landes-/Staatsstraße",
  kreisstrasse: "Kreisstraße", sonstige: "Sonstige", unbekannt: "Unbekannt",
}

/** Horizontale Balken je Straßenklasse (Autobahn/Bundes-/Landes-/Kreisstraße/Sonstige), gestapelt
 *  nach Typ. Straßenklasse aus strassen_ref-Präfix (routes/veraenderungen.js STRASSENKLASSE_CASE). */
export function VeraenderungenProStrassenklasse({ data }: { data: VeraenderungenUebersicht["proStrassenklasse"] }) {
  return <GestapelteBalken data={data} labelFuer={(k) => STRASSENKLASSE_LABEL[k] ?? k} />
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

/** Vorlaufzeit-Verteilung: wie spontan kommt eine Maßnahme rein. */
export function VeraenderungenVorlaufzeiten({ data }: { data: VeraenderungenUebersicht["vorlaufzeiten"] }) {
  return <VerteilungsDonut daten={data} labelMap={VORLAUF_LABEL} farbeMap={VORLAUF_FARBE} reihenfolge={["spontan", "kurzfristig", "geplant", "langfristig", "unbekannt"]} />
}
