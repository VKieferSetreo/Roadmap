// Formular für die Transport-Stammdaten. Controlled — meldet Patches nach oben.

import { Input, Label } from "@/components/ui/Input"
import type { TransportData } from "@/types/domain"

interface TransportDataFormProps {
  value: TransportData
  onChange: (patch: Partial<TransportData>) => void
  disabled?: boolean
}

interface NumField {
  key: keyof TransportData
  label: string
  unit: string
  step: number
}

const NUM_FIELDS: NumField[] = [
  { key: "laenge", label: "Länge", unit: "m", step: 0.1 },
  { key: "breite", label: "Breite", unit: "m", step: 0.1 },
  { key: "hoehe", label: "Höhe", unit: "m", step: 0.1 },
  { key: "gesamtgewicht", label: "Gesamtgewicht", unit: "t", step: 1 },
  { key: "achslast", label: "Achslast", unit: "t", step: 0.5 },
  { key: "achsen", label: "Achsen", unit: "", step: 1 },
]

export function TransportDataForm({ value, onChange, disabled }: TransportDataFormProps) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <Label htmlFor="fahrzeugTyp">Fahrzeugtyp</Label>
        <Input
          id="fahrzeugTyp"
          value={value.fahrzeugTyp}
          disabled={disabled}
          onChange={(e) => onChange({ fahrzeugTyp: e.target.value })}
          placeholder="z.B. Sattelzug mit Tieflader"
        />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {NUM_FIELDS.map((f) => (
          <div key={f.key}>
            <Label htmlFor={f.key}>
              {f.label}
              {f.unit ? <span className="ml-1 normal-case text-neutral-400">({f.unit})</span> : null}
            </Label>
            <Input
              id={f.key}
              type="number"
              inputMode="decimal"
              step={f.step}
              min={0}
              disabled={disabled}
              value={Number.isFinite(value[f.key] as number) ? (value[f.key] as number) : ""}
              onChange={(e) => onChange({ [f.key]: e.target.valueAsNumber || 0 } as Partial<TransportData>)}
              className="tabular-nums"
            />
          </div>
        ))}
      </div>

      <div>
        <Label htmlFor="ladung">Ladung</Label>
        <Input
          id="ladung"
          value={value.ladung}
          disabled={disabled}
          onChange={(e) => onChange({ ladung: e.target.value })}
          placeholder="z.B. Leistungstransformator 80 t"
        />
      </div>
    </div>
  )
}
