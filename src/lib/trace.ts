// Auto-UUID pro Request, Trace-Id propagation falls von Backend gesetzt.

import { v4 as uuidv4 } from "uuid"

export function newRequestId(): string {
  return uuidv4()
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
