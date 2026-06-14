// Sammelt automatisch den Kontext-Snapshot für einen Bug-Report: aktuelle View,
// Daten-/Seitenstatus, App-Version, Browser/Viewport. Liest die Zustand-Stores
// über getState() (kein React-Hook nötig) — so kann der Button von überall melden.

import type { BugReportKontext } from "@/types/domain"
import { useContextStore } from "@/store/context"
import { useDataSourceStore } from "@/store/datasource"
import { useProjectStore } from "@/store/projects"

export function collectBugContext(): { viewPath: string; kontext: BugReportKontext } {
  const ds = useDataSourceStore.getState()
  const ctx = useContextStore.getState()
  const projects = useProjectStore.getState().projects

  const viewPath = `${window.location.pathname}${window.location.search}${window.location.hash}`

  // Aktuelles Projekt aus der Route (/roadmap/projekte/:id[/:tab]) ableiten
  const m = window.location.pathname.match(/\/projekte\/([^/]+)(?:\/([^/]+))?/)
  const projektId = m?.[1]
  const projekt = projektId ? projects.find((p) => p.id === projektId) : undefined

  const kontext: BugReportKontext = {
    appVersion: ds.apiVersion ?? undefined,
    mode: ds.mode,
    viewPath,
    viewport: `${window.innerWidth}×${window.innerHeight}`,
    screen: `${window.screen.width}×${window.screen.height}`,
    sprache: navigator.language,
    userAgent: navigator.userAgent,
    zeitpunkt: new Date().toISOString(),
    datenstatus: {
      email: ctx.email || undefined,
      isAdmin: ctx.isAdmin,
      mandant: ctx.tenant ? `${ctx.tenant.name} (${ctx.tenant.slug})` : null,
      projekteGeladen: projects.length,
      aktuellerTab: m?.[2] ?? null,
      aktuellesProjekt: projekt ? { id: projekt.id, name: projekt.name, status: projekt.status } : null,
    },
  }

  return { viewPath, kontext }
}
