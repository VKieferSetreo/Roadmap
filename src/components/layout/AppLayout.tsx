// App-Shell: Setreo-Header (oben) + [Sidebar | Inhalt] + Setreo-Footer (unten).
// Hält den globalen "Neues Projekt"-Dialog.

import { useEffect, useState } from "react"
import { Outlet, useLocation, useNavigate } from "react-router-dom"
import { SetreoHeader } from "./SetreoHeader"
import { SetreoFooter } from "./SetreoFooter"
import { AppSidebar } from "./AppSidebar"
import { ContentErrorBoundary } from "./ContentErrorBoundary"
import { NewProjectDialog } from "@/components/project/NewProjectDialog"
import { useProjectStore } from "@/store/projects"
import { useFolderStore } from "@/store/folders"
import { useNewsStore } from "@/store/news"
import { useUiStore } from "@/store/ui"
import { useAuthStore } from "@/store/auth"
import { useDataSourceStore } from "@/store/datasource"
import { useContextStore } from "@/store/context"
import { useHeartbeat } from "@/hooks/useHeartbeat"
import { RedeemSeat } from "@/components/account/RedeemSeat"
import { DisclaimerModal } from "@/components/account/DisclaimerModal"
import { api } from "@/api/roadmap"
import { BUILD_BASE, slugFromPath, withSlug } from "@/lib/tenantUrl"
import { Building2 } from "lucide-react"

export function AppLayout() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  // Desktop-Sidebar: nativ offen (Kollision-Format), einklappbar; Zustand+Wahl im
  // UI-Store (persistiert), damit auch das Karten-Overlay den Toggle bedienen kann.
  const sidebarOpen = useUiStore((s) => s.sidebarOpen)
  const toggleSidebar = useUiStore((s) => s.toggleSidebar)
  const createProject = useProjectStore((s) => s.createProject)
  const initData = useProjectStore((s) => s.initData)
  const loadFolders = useFolderStore((s) => s.loadFolders)
  const loadNews = useNewsStore((s) => s.loadNews)
  const newProjectOpen = useUiStore((s) => s.newProjectOpen)
  const closeNewProject = useUiStore((s) => s.closeNewProject)
  const fetchIdentity = useAuthStore((s) => s.fetchIdentity)
  const detect = useDataSourceStore((s) => s.detect)
  const mode = useDataSourceStore((s) => s.mode)
  const loadContext = useContextStore((s) => s.load)
  const ctxLoaded = useContextStore((s) => s.loaded)
  const isAdmin = useContextStore((s) => s.isAdmin)
  const tenant = useContextStore((s) => s.tenant)
  const extern = useContextStore((s) => s.extern)
  const email = useContextStore((s) => s.email)
  const [needDisclaimer, setNeedDisclaimer] = useState(false)
  const [acceptingDisc, setAcceptingDisc] = useState(false)

  // App-weiter Heartbeat (Plattform-Analytics) — pingt im Live-Modus, solange eingeloggt.
  useHeartbeat()

  // Boot: SSO-Identität holen + Datenquelle erkennen (Backend live vs. Demo-Modus).
  // Live: erst Nutzer-/Mandanten-Kontext (setzt X-Tenant für Admins), dann Projekte.
  useEffect(() => {
    void fetchIdentity()
    void detect().then(async (m) => {
      if (m === "live") await loadContext()
      await initData(m)
      await loadFolders()
      await loadNews()
    })
  }, [fetchIdentity, detect, initData, loadContext, loadFolders, loadNews])

  // Haftungsausschluss: beim Erst-Login (pro Person + Version) blockierend anzeigen.
  useEffect(() => {
    if (mode !== "live" || !ctxLoaded || !email) return
    let active = true
    void api.account
      .disclaimerStatus()
      .then((s) => {
        if (active && !s.accepted) setNeedDisclaimer(true)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [mode, ctxLoaded, email])

  const acceptDisclaimer = async () => {
    setAcceptingDisc(true)
    try {
      await api.account.acceptDisclaimer()
      setNeedDisclaimer(false)
    } catch {
      // bleibt offen — Nutzer kann erneut akzeptieren
    } finally {
      setAcceptingDisc(false)
    }
  }

  // Per-Mandant-URL: sobald der Mandant feststeht, die URL auf /roadmap/<slug>/... bringen.
  // Schleifensicher: nach dem Replace gilt slugFromPath() === tenant.slug → kein erneutes Replace.
  // Admin-Mandantenwechsel ändert tenant → Effekt feuert → URL folgt dem neuen Slug.
  useEffect(() => {
    if (!BUILD_BASE || mode !== "live" || !ctxLoaded || !tenant) return
    if (slugFromPath() === tenant.slug) return
    window.location.replace(withSlug(tenant.slug) + window.location.search)
  }, [mode, ctxLoaded, tenant])

  // Live + eingeloggt, aber keinem Mandanten zugeordnet → Arbeit nicht möglich.
  const keinMandant = mode === "live" && ctxLoaded && !isAdmin && !tenant

  return (
    <div className="flex h-screen flex-col bg-neutral-50">
      <SetreoHeader onMenuClick={() => setMobileNavOpen(true)} />

      <div className="flex min-h-0 flex-1">
        <AppSidebar
          open={sidebarOpen}
          onToggle={toggleSidebar}
          mobileOpen={mobileNavOpen}
          onClose={() => setMobileNavOpen(false)}
        />
        <main className="min-h-0 min-w-0 flex-1 overflow-hidden">
          {/* Fehler in einer Seite kapseln → Header + Sidebar (alle Reiter + Dropdown)
              bleiben IMMER stehen; Reset bei Routen-/Mandantenwechsel. */}
          <ContentErrorBoundary resetKey={`${pathname}|${tenant?.id ?? ""}`}>
            {keinMandant ? (
              extern ? (
                // Externer Self-Service-Nutzer ohne Mandant → Seat-Code einlösen.
                <RedeemSeat email={email} />
              ) : (
                <div className="flex h-full items-center justify-center px-4">
                  <div className="max-w-md rounded-xl border border-neutral-200 bg-white p-8 text-center shadow-card">
                    <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-accent-100">
                      <Building2 className="h-6 w-6 text-accent-700" />
                    </div>
                    <h1 className="text-lg font-bold text-neutral-900">Kein Mandant zugeordnet</h1>
                    <p className="mt-2 text-sm text-neutral-500">
                      Ihr Konto ist noch keinem Mandanten zugewiesen. Bitte wenden Sie sich an Setreo.
                      Sobald die Zuordnung steht, erscheinen hier die Projekte Ihres Teams.
                    </p>
                  </div>
                </div>
              )
            ) : (
              <Outlet />
            )}
          </ContentErrorBoundary>
        </main>
      </div>

      <SetreoFooter />

      <NewProjectDialog
        open={newProjectOpen}
        onClose={closeNewProject}
        onCreate={(name) => {
          void createProject(name)
            .then((p) => {
              closeNewProject()
              navigate(`/projekte/${p.id}/route`)
            })
            // T-230: bei Live-Fehler hat der Store bereits getoastet — Dialog offen lassen (Retry), kein Crash.
            .catch(() => {})
        }}
      />

      {needDisclaimer ? (
        <DisclaimerModal
          mode="accept"
          busy={acceptingDisc}
          onAccept={() => void acceptDisclaimer()}
        />
      ) : null}
    </div>
  )
}
