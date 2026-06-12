// Formular für die Transport-Stammdaten (v2: Maße + Gesamtgewicht + Achs-Konfigurator).
// Controlled — meldet Patches nach oben. Die Achszahl steuert die LKW-Visualisierung,
// unter jeder Achse wird die jeweilige Achslast gepflegt.

import { Input, Label } from "@/components/ui/Input"
import { TruckAxles } from "./TruckAxles"
import type { TransportData } from "@/types/domain"
import { cn } from "@/lib/cn"

interface TransportDataFormProps {
  value: TransportData
  onChange: (patch: Partial<TransportData>) => void
  disabled?: boolean
}

const MIN_ACHSEN = 2
const MAX_ACHSEN = 16

const MASS_FIELDS = [
  { key: "laenge", label: "Länge", unit: "m", step: 0.1 },
  { key: "breite", label: "Breite", unit: "m", step: 0.1 },
  { key: "hoehe", label: "Höhe", unit: "m", step: 0.1 },
] as const

export function TransportDataForm({ value, onChange, disabled }: TransportDataFormProps) {
  const setAchsen = (raw: number) => {
    const achsen = Math.max(MIN_ACHSEN, Math.min(MAX_ACHSEN, Math.round(raw) || MIN_ACHSEN))
    // Achslasten-Array mitführen: kürzen bzw. mit der letzten bekannten Last auffüllen
    const fill = value.achslasten[value.achslasten.length - 1] ?? 11.5
    const achslasten =
      achsen <= value.achslasten.length
        ? value.achslasten.slice(0, achsen)
        : [...value.achslasten, ...Array(achsen - value.achslasten.length).fill(fill)]
    onChange({ achsen, achslasten })
  }

  const summeAchslasten = value.achslasten.reduce((s, v) => s + (v || 0), 0)
  const lastUnplausibel = summeAchslasten > 0 && summeAchslasten < value.gesamtgewicht

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {MASS_FIELDS.map((f) => (
          <div key={f.key}>
            <Label htmlFor={f.key}>
              {f.label}
              <span className="ml-1 normal-case text-neutral-400">({f.unit})</span>
            </Label>
            <Input
              id={f.key}
              type="number"
              inputMode="decimal"
              step={f.step}
              min={0}
              disabled={disabled}
              value={Number.isFinite(value[f.key]) ? value[f.key] : ""}
              onChange={(e) => onChange({ [f.key]: e.target.valueAsNumber || 0 })}
              className="tabular-nums"
            />
          </div>
        ))}
        <div>
          <Label htmlFor="gesamtgewicht">
            Gesamtgewicht
            <span className="ml-1 normal-case text-neutral-400">(t)</span>
          </Label>
          <Input
            id="gesamtgewicht"
            type="number"
            inputMode="decimal"
            step={1}
            min={0}
            disabled={disabled}
            value={Number.isFinite(value.gesamtgewicht) ? value.gesamtgewicht : ""}
            onChange={(e) => onChange({ gesamtgewicht: e.target.valueAsNumber || 0 })}
            className="tabular-nums"
          />
        </div>
        <div>
          <Label htmlFor="achsen">Achsen</Label>
          <Input
            id="achsen"
            type="number"
            inputMode="numeric"
            step={1}
            min={MIN_ACHSEN}
            max={MAX_ACHSEN}
            disabled={disabled}
            value={value.achsen}
            onChange={(e) => setAchsen(e.target.valueAsNumber)}
            className="tabular-nums"
          />
        </div>
      </div>

      {/* Achs-Konfigurator: Zugmaschine + Module, Achslast je Achse */}
      <div className="rounded-lg border border-neutral-200 bg-neutral-50/60 p-3">
        <div className="mb-1 flex items-baseline justify-between gap-2">
          <Label className="mb-0">Achslasten (t)</Label>
          <span
            className={cn(
              "text-[11px] tabular-nums",
              lastUnplausibel ? "font-medium text-severity-warnung-text" : "text-neutral-400",
            )}
          >
            Summe {summeAchslasten.toLocaleString("de-DE", { maximumFractionDigits: 1 })} t
            {lastUnplausibel
              ? ` — unter Gesamtgewicht (${value.gesamtgewicht.toLocaleString("de-DE")} t)`
              : ""}
          </span>
        </div>
        <TruckAxles
          achslasten={value.achslasten}
          onChange={(achslasten) => onChange({ achslasten })}
          disabled={disabled}
        />
      </div>
    </div>
  )
}
