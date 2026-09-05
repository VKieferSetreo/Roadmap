// Horizontale Balken: Funde pro Kategorie, gestapelt nach Schweregrad (recharts).

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import type { Finding, FindingKategorie } from "@/types/domain"
import { KATEGORIE_META, SEVERITY_META, SEVERITY_ORDER } from "@/components/project/findingMeta"

/**
 * @param findings die GEFILTERTE Menge, sie bestimmt die Balken
 * @param hoehenBasis die UNGEFILTERTE Menge, sie bestimmt nur die Höhe (T-688)
 */
export function KategorieBar({
  findings,
  hoehenBasis,
}: {
  findings: Finding[]
  hoehenBasis?: Finding[]
}) {
  const rows = (Object.keys(KATEGORIE_META) as FindingKategorie[])
    .map((kat) => {
      const subset = findings.filter((f) => f.kategorie === kat)
      return {
        name: KATEGORIE_META[kat].label,
        kritisch: subset.filter((f) => f.severity === "kritisch").length,
        warnung: subset.filter((f) => f.severity === "warnung").length,
        hinweis: subset.filter((f) => f.severity === "hinweis").length,
        total: subset.length,
      }
    })
    .filter((r) => r.total > 0)
    .sort((a, b) => b.total - a.total)

  // T-688: die Höhe hing an `rows.length`, also an der GEFILTERTEN Menge. Jeder Klick auf einen
  // Schweregrad-Schalter änderte damit die Kartenhöhe (34 px je Kategorie), die Karte darunter
  // sprang um rund 100 px hoch, und der nächste Klick landete auf einem anderen Element. Die Höhe
  // richtet sich jetzt nach der ungefilterten Menge und steht damit über den ganzen Filtervorgang
  // still. Bewusst nicht einfach fest verdrahtet: bei elf Kategorien wären die Balken sonst so
  // gedrängt, dass die Beschriftung nicht mehr lesbar ist.
  const zeilenFuerHoehe = hoehenBasis
    ? new Set(hoehenBasis.map((f) => f.kategorie)).size
    : rows.length
  const hoehe = Math.max(176, zeilenFuerHoehe * 34 + 30)

  if (rows.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-sm text-neutral-400"
        style={{ height: hoehe }}
      >
        Keine Funde
      </div>
    )
  }

  return (
    <div style={{ height: hoehe }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid horizontal={false} stroke="#F4F4F5" />
          <XAxis
            type="number"
            allowDecimals={false}
            tick={{ fontSize: 11, fill: "#A1A1AA" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="name"
            width={92}
            tick={{ fontSize: 12, fill: "#52525B" }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            cursor={{ fill: "rgba(135,181,45,0.06)" }}
            contentStyle={{
              borderRadius: 12,
              border: "1px solid rgb(229 229 232)",
              boxShadow: "0 8px 30px -6px rgba(16,24,40,.18)",
              fontSize: 12,
              fontFamily: "Inter, system-ui, sans-serif",
            }}
          />
          {SEVERITY_ORDER.map((sev) => (
            <Bar
              key={sev}
              dataKey={sev}
              name={SEVERITY_META[sev].label}
              stackId="sev"
              fill={SEVERITY_META[sev].marker}
              radius={sev === "hinweis" ? [0, 4, 4, 0] : undefined}
              maxBarSize={18}
              isAnimationActive
              animationDuration={500}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
