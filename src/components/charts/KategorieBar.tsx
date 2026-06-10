// Horizontale Balken: Funde pro Kategorie, gestapelt nach Schweregrad (recharts).

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import type { Finding, FindingKategorie } from "@/types/domain"
import { KATEGORIE_META, SEVERITY_META, SEVERITY_ORDER } from "@/components/project/findingMeta"

export function KategorieBar({ findings }: { findings: Finding[] }) {
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

  if (rows.length === 0) {
    return (
      <div className="flex h-44 items-center justify-center text-sm text-neutral-400">
        Keine Funde
      </div>
    )
  }

  return (
    <div style={{ height: Math.max(176, rows.length * 34 + 30) }}>
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
