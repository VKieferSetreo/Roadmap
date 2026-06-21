// Auto-UUID pro Request, Trace-Id propagation falls von Backend gesetzt.

export function newRequestId(): string {
  // T-363: nativer crypto.randomUUID() (es2022, secure context) statt der uuid-Lib für einen Aufruf.
  return crypto.randomUUID()
}

let currentTraceId: string | null = null

export function getTraceId(): string | null {
  return currentTraceId
}

export function setTraceId(traceId: string | null) {
  currentTraceId = traceId
}

/** Storage-Key for sessionStorage trace persistence (per-tab-Lifetime). */
const TRACE_STORAGE_KEY = "roadmap-trace-id"

export function loadPersistedTraceId() {
  if (typeof window === "undefined") return
  try {
    currentTraceId = window.sessionStorage.getItem(TRACE_STORAGE_KEY)
  } catch {
    currentTraceId = null
  }
}

export function persistTraceId(traceId: string | null) {
  setTraceId(traceId)
  if (typeof window === "undefined") return
  try {
    if (traceId) {
      window.sessionStorage.setItem(TRACE_STORAGE_KEY, traceId)
    } else {
      window.sessionStorage.removeItem(TRACE_STORAGE_KEY)
    }
  } catch {
    // sessionStorage may be disabled (private mode)
  }
}
