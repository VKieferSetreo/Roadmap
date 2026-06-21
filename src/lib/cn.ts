import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// T-249: formatDateDE/daysUntil/getCalendarWeek lebten hier UND in @/lib/format (Single Source).
// Alle Aufrufer importieren aus @/lib/format → die Duplikate hier waren toter Code und sind raus.
