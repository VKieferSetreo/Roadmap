// Per-Mandant-URL: /roadmap/<slug>/<route>. Der Tenant-Slug ist das erste Pfad-Segment nach
// dem Build-Base (/roadmap), sofern es keine bekannte Top-Route ist. Der Tenant wird weiterhin
// serverseitig aus der Mitgliedschaft bestimmt — die URL ist Präsentation (und für Admins der
// aktive Mandant). Nur in Prod aktiv (Build-Base /roadmap); in Dev (Base /) bleibt alles ohne Slug.

export const BUILD_BASE = import.meta.env.BASE_URL.replace(/\/$/, "") // "/roadmap" (prod), "" (dev)

// Top-Level-Routen — diese ersten Segmente sind KEINE Mandanten-Slugs. Bei neuen Top-Routen
// hier ergänzen, sonst würde die Route als Slug missdeutet.
const KNOWN_TOP = new Set([
  "projekte",
  "datenbank",
  "mandanten",
  "debugging",
  "debug",
  "news",
  "einstellungen",
])

/** Mandanten-Slug aus der URL (erstes Segment nach Build-Base), falls vorhanden. Sonst null. */
export function slugFromPath(pathname: string = window.location.pathname): string | null {
  if (!BUILD_BASE) return null
  const rest = pathname.startsWith(BUILD_BASE) ? pathname.slice(BUILD_BASE.length) : pathname
  const seg = rest.split("/").filter(Boolean)[0]
  return seg && !KNOWN_TOP.has(seg) ? seg : null
}

/** Router-Basename inkl. Slug, falls in der URL vorhanden. */
export function routerBasename(): string {
  if (!BUILD_BASE) return "/"
  const slug = slugFromPath()
  return slug ? `${BUILD_BASE}/${slug}` : BUILD_BASE
}

/** URL für denselben In-App-Pfad, aber unter dem Slug des Mandanten (für die Umleitung). */
export function withSlug(slug: string, pathname: string = window.location.pathname): string {
  let rest = pathname.startsWith(BUILD_BASE) ? pathname.slice(BUILD_BASE.length) : pathname
  const cur = slugFromPath(pathname)
  if (cur) rest = rest.slice(`/${cur}`.length)
  if (rest && !rest.startsWith("/")) rest = `/${rest}`
  return `${BUILD_BASE}/${slug}${rest === "/" ? "" : rest}`
}
