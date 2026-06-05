// Simpler Stunden-Picker: native <select> mit 24 Optionen (00:00 – 23:00).

import { Clock } from "lucide-react"
import { cn } from "@/lib/cn"

const HOURS: number[] = Array.from({ length: 24 }, (_, i) => i)
const formatSlot = (h: number) => `${String(h).padStart(2, "0")}:00`

interface TimePickerProps {
  value: string
  onChange: (v: string) => void
  disabled?: boolean
  id?: string
  ariaLabel?: string
  className?: string
}

export function TimePicker({
  value,
  onChange,
  disabled,
  id,
  ariaLabel,
  className,
}: TimePickerProps) {
  const hour = value ? Number.parseInt(value.split(":")[0] ?? "", 10) : Number.NaN
  const normalizedValue = Number.isFinite(hour) ? formatSlot(hour) : ""

  return (
    <div className={cn("relative", className)}>
      <Clock className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-400" />
      <select
        id={id}
        aria-label={ariaLabel}
        value={normalizedValue}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={cn(
          "input-base h-9 w-full appearance-none bg-white pl-8 pr-7 text-sm tabular-nums",
          "bg-[url('data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%23a1a1aa%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E')] bg-[length:14px] bg-[right_8px_center] bg-no-repeat",
          disabled && "cursor-not-allowed opacity-50",
        )}
      >
        {!normalizedValue ? <option value="">—:—</option> : null}
        {HOURS.map((h) => (
          <option key={h} value={formatSlot(h)}>
            {formatSlot(h)}
          </option>
        ))}
      </select>
    </div>
  )
}
