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

/** Bereinigt eingebetteten Markup-/DATEX-Müll in Anzeigetexten: zieht den deutschen
 *  <value lang="de">…</value> heraus, sonst strippt alle Tags. Leerstring wenn nichts bleibt.
 *  ponytail: Read-Time-Schutz gegen Alt-Daten mit <comment>-Brackets. Neue Importe sind schon
 *  sauber (Connector commentText), eine Re-Analyse macht das hier überflüssig. */
export function cleanText(raw) {
  if (raw == null) return ""
  const s = String(raw)
  if (!s.includes("<")) return s
  const de = s.match(/<value\b[^>]*lang="de"[^>]*>([\s\S]*?)<\/value>/i)
  const any = de || s.match(/<value\b[^>]*>([\s\S]*?)<\/value>/i)
  return (any ? any[1] : s).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
}

export const isPlainObject = (v) => v != null && typeof v === "object" && !Array.isArray(v)

export const isFiniteNumber = (v) => typeof v === "number" && Number.isFinite(v)

/**
 * Schutz gegen unbegrenzt hängende Hintergrund-Operationen (z.B. ein hängendes
 * rerunAffectedProjects, das sonst den Worker-Rerun-Lock oder den Sync-Job ewig
 * blockieren würde). Verliert das Race der Timeout → Reject; der Aufrufer gibt
 * den Lock im finally frei. Die Original-Promise läuft im Hintergrund weiter,
 * aber das System ist nicht mehr verklemmt.
 */
export function withTimeout(promise, ms, label = "Operation") {
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label}: Timeout nach ${ms} ms`)), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}
