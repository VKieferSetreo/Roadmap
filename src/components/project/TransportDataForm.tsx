// Formular für die Transport-Stammdaten: Maße (Länge/Breite/Höhe) + Gesamtgewicht.
// Controlled — meldet Patches nach oben. Das Achslast-Thema wurde entfernt (Max 2026-06-16):
// bewertet wird nur das Gesamtgewicht gegen die zulässige Traglast.

import { Input, Label } from "@/components/ui/Input"
import type { TransportData } from "@/types/domain"

interface TransportDataFormProps {
  value: TransportData
  onChange: (patch: Partial<TransportData>) => void
  disabled?: boolean
}

const MASS_FIELDS = [
  { key: "laenge", label: "Länge", unit: "m", step: 0.1 },
  { key: "breite", label: "Breite", unit: "m", step: 0.1 },
  { key: "hoehe", label: "Höhe", unit: "m", step: 0.1 },
] as const

export function TransportDataForm({ value, onChange, disabled }: TransportDataFormProps) {
  // Leeres/ungültiges Feld → undefined statt 0. Sonst schreibt ein versehentlich geleertes
  // Feld eine 0 (z.B. Höhe 0 m), die die Auswertung als gültig behandelt und nichts mehr
  // flaggt — stille Untererfassung. undefined = "nicht angegeben", wird in der Engine nicht geprüft.
  const num = (raw: number): number | undefined => (Number.isFinite(raw) ? raw : undefined)

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
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
            onChange={(e) => onChange({ [f.key]: num(e.target.valueAsNumber) })}
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
          onChange={(e) => onChange({ gesamtgewicht: num(e.target.valueAsNumber) })}
          className="tabular-nums"
        />
      </div>
      <p className="col-span-2 text-xs text-neutral-500 sm:col-span-4">
        Leere Felder gelten als „nicht angegeben" und werden in der Auswertung nicht geprüft.
      </p>
    </div>
  )
}
