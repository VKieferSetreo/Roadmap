// Donut der Schweregrad-Verteilung mit Gesamtzahl im Zentrum (recharts).

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts"
import type { Finding, FindingSeverity } from "@/types/domain"
import { SEVERITY_META, SEVERITY_ORDER } from "@/components/project/findingMeta"

export function SeverityDonut({ findings }: { findings: Finding[] }) {
  const data = SEVERITY_ORDER.map((sev) => ({
    sev,
    name: SEVERITY_META[sev].label,
    value: findings.filter((f) => f.severity === sev).length,
  })).filter((d) => d.value > 0)

  if (findings.length === 0) {
    return (
      <div className="flex h-44 items-center justify-center text-sm text-neutral-400">
        Keine Funde
      </div>
    )
  }

  return (
    <div className="relative h-44">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius="62%"
            outerRadius="88%"
            paddingAngle={3}
            strokeWidth={2}
            stroke="#fff"
            isAnimationActive
            animationDuration={500}
          >
            {data.map((d) => (
              <Cell key={d.sev} fill={SEVERITY_META[d.sev as FindingSeverity].marker} />
            ))}
          </Pie>
          <Tooltip
            cursor={false}
            contentStyle={{
              borderRadius: 12,
              border: "1px solid rgb(229 229 232)",
              boxShadow: "0 8px 30px -6px rgba(16,24,40,.18)",
              fontSize: 12,
              fontFamily: "Inter, system-ui, sans-serif",
            }}
            formatter={(value, name) => [`${Number(value ?? 0)} Funde`, String(name)]}
          />
        </PieChart>
      </ResponsiveContainer>
      {/* Zentrum: Gesamtzahl */}
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold tabular-nums text-neutral-900">{findings.length}</span>
        <span className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">
          Funde
        </span>
      </div>
    </div>
  )
}
