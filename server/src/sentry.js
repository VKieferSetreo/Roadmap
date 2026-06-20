// Error-Tracking via self-hosted GlitchTip (Sentry-kompatibel, T-163/468). No-op ohne SENTRY_DSN
// (z.B. Tests / lokal) → der Init-Code kann gefahrlos überall eingehängt werden.

import * as Sentry from "@sentry/node"

export function initSentry(role) {
  const dsn = process.env.SENTRY_DSN
  if (!dsn) return
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || "production",
    tracesSampleRate: 0, // nur Fehler, keine Performance-Traces (GlitchTip-Ingest schlank halten)
    serverName: role, // "api" | "worker"
  })
}

/** Fehler an GlitchTip melden — wirft NIE (Error-Tracking darf die App nicht brechen). */
export function captureException(err, extra) {
  if (!process.env.SENTRY_DSN) return
  try {
    Sentry.captureException(err, extra ? { extra } : undefined)
  } catch {
    /* ignorieren */
  }
}
