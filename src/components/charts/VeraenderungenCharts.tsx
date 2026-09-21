// Änderungsverfolgung (recharts, lazy geladen): Zeitreihe neu/geändert/ausgelaufen/entfernt,
// Kategorie- und Straßenklassen-Aufschlüsselung, Laufzeit- und Vorlaufzeit-Verteilung.
//
// Farbcode ist eine AMPEL, keine kategoriale Palette (Max 2026-09-21): rot = schlecht für den
// Transportplaner, grün = gut. Neu rot (neues Hindernis), geändert orange, ausgelaufen gelb,
// entfernt grün (Hindernis weg). Dieselbe Ampel trägt Lauf- und Vorlaufzeit: je kurzfristiger
// bzw. länger laufend, desto röter. Der Farbcode ist app-weit fest und wird NIE nach Rang
// neu zugeordnet.
// "ausgelaufen" (planmäßig, gueltig_bis war schon erreicht) vs. "entfernt" (Maßnahme war noch
// gültig/unbefristet und verschwand trotzdem — das eigentlich auffällige Ereignis).
//
// Rot/Orange/Gelb/Grün ist bewusst NICHT rotgrün-sicher (validate_palette.js: CVD-FAIL,
// #87b52d↔#eda100 ΔE 0,9 protan). Max' Entscheidung vom 2026-09-21 auf ausdrücklichen
// Hinweis: "scheiss mal da auf rot grün blind". Die Trennung für Normalsicht ist dagegen
// gemessen: Rot ist auf #b42318 gesetzt statt auf ein helleres Rot, damit es sich von
// Orange #eb6834 abhebt (ΔE 17,4 normal, vorher 10,7 und damit unter der 15er-Schwelle).
// Wer die Werte anfasst: Validator laufen lassen, nicht nach Augenmaß entscheiden.

import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import type { VeraenderungenUebersicht } from "@/api/roadmap"
import { katMeta } from "@/components/project/findingMeta"
import { AMPEL } from "@/lib/ampel"

const FARBE = { neu: AMPEL.rot, geaendert: AMPEL.orange, ausgelaufen: AMPEL.gelb, entfernt: AMPEL.gruen } as const
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

// Recharts' Legend sortiert per Default (itemSorter="value") alphabetisch nach Beschriftung:
// aus "Neu, Geändert, Ausgelaufen, Entfernt" wurde "Ausgelaufen, Entfernt, Geändert, Neu",
// also eine andere Ordnung als im gestapelten Balken daneben. Wir wollen überall die fachliche
// Reihenfolge (Max 2026-09-21), deshalb Sortierung aus: stabiles Sortieren lässt die
// Eingabereihenfolge stehen. Gilt für Balken wie Donut.
const OHNE_SORTIERUNG = () => 0

// Wer im Betriebssystem "Bewegung reduzieren" gesetzt hat, bekommt die Diagramme fertig statt
// eingeblendet. Nebeneffekt, der uns Arbeit spart: ohne laufende Animation sind die Balken auch
// in einem automatisierten Browser sofort im Bild — mit Animation bleiben sie dort bei Frame 0
// stehen, weil requestAnimationFrame headless nicht tickt, und jeder Screenshot zeigt ein
// leeres Diagramm.
const BEWEGUNG = !(typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches)

/** Gestapelte Säulen: neu/geändert/ausgelaufen/entfernt je Tag. Das Kern-Chart der Auswertung —
 *  zeigt Tag für Tag, wie viel Bewegung im Bestand ist. */
// Grautoene fuer die Tage VOR dem Stichtag. Dort raeumt die Hygiene inaktive Zeilen bereits weg
// (30 Tage), weggefallene Massnahmen sind nur noch teilweise rekonstruierbar und vorzeitig
// entfernte gar nicht mehr. Die Balken bestehen dort also fast nur aus Neuanlagen. Sie farbig
// wie vollstaendige Tage zu zeichnen, waere eine Behauptung, die die Daten nicht tragen
// (Max 2026-09-21: "grau machen mit Tooltip, dass diese noch nicht systematisch erfasst wurden
// und Luecken sein koennen"). Vier Abstufungen, damit die Stapelung erkennbar bleibt.
const GRAU = { neu: "#c4c4c8", geaendert: "#b0b0b5", ausgelaufen: "#9c9ca2", entfernt: "#88888f" } as const
const UNVOLLSTAENDIG_HINWEIS = "Noch nicht systematisch erfasst, hier können Lücken sein"

/** Tooltip, der unvollständige Tage als solche ausweist. */
function ZeitreiheTooltip({ active, payload, label }: {
  active?: boolean
  payload?: { name?: string; value?: number; payload?: { unvollstaendig?: boolean } }[]
  label?: string
}) {
  if (!active || !payload?.length) return null
  const unvollstaendig = payload[0]?.payload?.unvollstaendig
  return (
    // background gehoert hierher: den setzt sonst Recharts' eigener Tooltip-Container, und der
    // faellt weg, sobald man content= uebergibt. Ohne ihn stand der Kasten durchsichtig ueber
    // den Balken. Die Werte tragen ihre Kategoriefarbe wie im Balken selbst — auch an
    // ausgegrauten Tagen, denn die Farbe kodiert die Kategorie, nicht die Datenqualitaet.
    <div style={{ ...TOOLTIP, background: "#fff", padding: "8px 10px" }}>
      <p style={{ fontWeight: 600, marginBottom: 4, color: "#18181B" }}>{label}</p>
      {payload.filter((p) => (p.value ?? 0) > 0).map((p) => (
        <p key={p.name} style={{ margin: 0, color: FARBE[p.name as keyof typeof FARBE] ?? "#18181B" }}>
          {LABEL[p.name as keyof typeof LABEL] ?? p.name}: {p.value}
        </p>
      ))}
      {unvollstaendig ? (
        <p style={{ margin: "6px 0 0", maxWidth: 220, color: "#71717A", whiteSpace: "normal" }}>
          {UNVOLLSTAENDIG_HINWEIS}
        </p>
      ) : null}
    </div>
  )
}

export function VeraenderungenZeitreihe({ data, vollstaendigAb }: {
  data: VeraenderungenUebersicht["zeitreihe"]
  vollstaendigAb?: string
}) {
  if (!data.some((d) => TYPEN.some((t) => d[t] > 0))) return <Leer />
  const rows = data.map((d) => ({
    ...d,
    label: `${d.tag.slice(8, 10)}.${d.tag.slice(5, 7)}`,
    unvollstaendig: vollstaendigAb ? d.tag < vollstaendigAb : false,
  }))
  return (
    <div style={{ height: 260 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 4, right: 8, bottom: 0, left: -18 }} barGap={1}>
          <CartesianGrid vertical={false} stroke="#F4F4F5" />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#A1A1AA" }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
          <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#A1A1AA" }} axisLine={false} tickLine={false} />
          <Tooltip cursor={{ fill: "rgba(0,0,0,0.03)" }} content={<ZeitreiheTooltip />} />
          <Legend wrapperStyle={{ fontSize: 12 }} itemSorter={OHNE_SORTIERUNG} formatter={(k) => LABEL[k as keyof typeof LABEL]} />
          {TYPEN.map((t, i) => (
            <Bar
              key={t} dataKey={t} name={t} stackId="e" fill={FARBE[t]} isAnimationActive={BEWEGUNG} animationDuration={500}
              radius={i === TYPEN.length - 1 ? [3, 3, 0, 0] : undefined}
            >
              {rows.map((r) => (
                <Cell key={r.tag} fill={r.unvollstaendig ? GRAU[t] : FARBE[t]} />
              ))}
            </Bar>
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
          <Legend wrapperStyle={{ fontSize: 12 }} itemSorter={OHNE_SORTIERUNG} formatter={(k) => LABEL[k as keyof typeof LABEL]} />
          {TYPEN.map((t, i) => (
            <Bar
              key={t} dataKey={t} name={t} stackId="k" fill={FARBE[t]} maxBarSize={18} isAnimationActive={BEWEGUNG} animationDuration={500}
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
  // Max 2026-09-21: Staatsstrasse gehoert unter Landstrasse (dieselbe Baulast, nur anderer
  // Landesname), Gemeindestrasse ohne den Zusatz. Eine Restkategorie gibt es nicht mehr — jede
  // Stelle wird ueber Kennzeichen oder Koordinate einer der fuenf Klassen zugeordnet. Die
  // beiden Altnamen bleiben nur als Beschriftung fuer einen zwischengespeicherten Stand von
  // vor dem 21.09. stehen; im aktuellen Datenbestand kommen sie nicht mehr vor.
  autobahn: "Autobahn", bundesstrasse: "Bundesstraße", landesstrasse: "Landstraße",
  kreisstrasse: "Kreisstraße", gemeindestrasse: "Gemeindestraße",
  sonstige: "Gemeindestraße", unbekannt: "Gemeindestraße",
}

/** Horizontale Balken je Straßenklasse (Autobahn/Bundes-/Landes-/Kreisstraße/Sonstige), gestapelt
 *  nach Typ. Straßenklasse aus strassen_ref-Präfix (routes/veraenderungen.js STRASSENKLASSE_CASE). */
export function VeraenderungenProStrassenklasse({ data }: { data: VeraenderungenUebersicht["proStrassenklasse"] }) {
  return <GestapelteBalken data={data} labelFuer={(k) => STRASSENKLASSE_LABEL[k] ?? k} />
}

// Laufzeit: je länger die Maßnahme steht, desto länger die Behinderung — deshalb lang = rot.
const LAUFZEIT_LABEL: Record<string, string> = { kurz: "Kurz (bis 7 Tage)", mittel: "Mittel (8 bis 30 Tage)", lang: "Lang (über 30 Tage)", unbekannt: "Unbekannt" }
const LAUFZEIT_FARBE: Record<string, string> = {
  kurz: AMPEL.gruen, mittel: AMPEL.orange, lang: AMPEL.rot, unbekannt: AMPEL.grau,
}
// Vorlaufzeit: je kurzfristiger die Maßnahme auftaucht, desto weniger Zeit für Umplanung — spontan = rot.
const VORLAUF_LABEL: Record<string, string> = {
  spontan: "Spontan (bis 1 Tag)", kurzfristig: "Kurzfristig (2 bis 6 Tage)",
  geplant: "Geplant (7 bis 30 Tage)", langfristig: "Langfristig (über 30 Tage)", unbekannt: "Unbekannt",
}
const VORLAUF_FARBE: Record<string, string> = {
  spontan: AMPEL.rot, kurzfristig: AMPEL.orange, geplant: AMPEL.gelb, langfristig: AMPEL.gruen, unbekannt: AMPEL.grau,
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
  // Anzeige folgt der FACHLICHEN Klassenfolge aus `reihenfolge`, nicht der Segmentgroesse
  // (Max 2026-09-21 nachmittags; nimmt die Groessensortierung vom Vormittag zurueck). Die
  // Klassen sind eine Skala — kurz/mittel/lang, spontan bis langfristig —, und eine Skala
  // liest man in ihrer eigenen Ordnung, sonst springt die Ampelfarbe in der Legende.
  const rows = reihenfolge
    .map((k) => ({ key: k, name: labelMap[k] ?? k, value: daten[k] ?? 0 }))
    .filter((r) => r.value > 0)
  if (!rows.length) return <Leer />
  return (
    <div style={{ height: 220 }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={rows} dataKey="value" nameKey="name" innerRadius={48} outerRadius={78} paddingAngle={2} isAnimationActive={BEWEGUNG} animationDuration={500}>
            {rows.map((r) => <Cell key={r.key} fill={farbeMap[r.key]} stroke="#fff" strokeWidth={2} />)}
          </Pie>
          <Tooltip contentStyle={TOOLTIP} />
          <Legend wrapperStyle={{ fontSize: 11 }} layout="vertical" verticalAlign="middle" align="right" itemSorter={OHNE_SORTIERUNG} />
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
