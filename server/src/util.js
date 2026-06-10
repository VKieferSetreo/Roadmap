// Kleine geteilte Helfer (Routen + Mapper).

export class ApiError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

/** Express-4-Wrapper: async-Fehler an den Error-Handler durchreichen. */
export const asyncHandler = (fn) => (req, res, next) => fn(req, res, next).catch(next)

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const isUuid = (s) => typeof s === "string" && UUID_RE.test(s)

/** timestamptz (pg liefert Date) → ISO-String. */
export function toIso(v) {
  if (v == null) return undefined
  return (v instanceof Date ? v : new Date(v)).toISOString()
}

/** date (pg liefert Date) → YYYY-MM-DD. */
export function toIsoDate(v) {
  if (v == null) return undefined
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  return String(v).slice(0, 10)
}

export const isPlainObject = (v) => v != null && typeof v === "object" && !Array.isArray(v)

export const isFiniteNumber = (v) => typeof v === "number" && Number.isFinite(v)
