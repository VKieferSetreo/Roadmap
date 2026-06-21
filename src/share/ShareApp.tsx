// Share-Viewer für externe Empfänger (setreo-cloud.com/<tenant>/<projekt>):
// Karte + Auswertung eines veröffentlichten Projekts — read-only, optional
// passwortgeschützt, KEINE Projektverwaltung. Wiederverwendet KarteTab/DashboardTab
// über einen MemoryRouter (deren interne navigate()-Aufrufe treffen echte Routen).

import { useEffect, useMemo, useState } from "react"
import { MemoryRouter, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom"
import { ClipboardList, Download, ExternalLink, FileDown, Loader2, Lock, MapPinned, Route as RouteIcon, SearchX, X } from "lucide-react"
import { KarteTab } from "@/components/project/KarteTab"
import { DashboardTab } from "@/components/project/DashboardTab"
import { SetreoLogo } from "@/components/shared/SetreoLogo"
import { DisclaimerModal } from "@/components/account/DisclaimerModal"
import { DropdownMenu, DropdownItem } from "@/components/ui/DropdownMenu"
import { downloadKml, openInGoogleMaps } from "@/lib/routeExport"
import { routeLengthKm } from "@/lib/parseRouteFile"
import type { Finding, Project, ProjectRoute, TransportData, TransportZeitraum } from "@/types/domain"
import { cn } from "@/lib/cn"

/** Daten-Payload des Public-Share-Endpoints (gestripped — nur Abmessungen als Stammdaten, T-223). */
interface ShareData {
  name: string
  distanzKm?: number
  fahrzeitMin?: number
  updatedAt: string
  transport?: TransportData
  zeitraum?: TransportZeitraum // #12b: Transport-Zeitfenster für den Karten-Zeitstrahl extern
  routes: ProjectRoute[]
  findings: Finding[]
}

type ShareState =
  | { status: "laden" }
  | { status: "nicht-gefunden" }
  | { status: "ungueltig" } // T-250: Pfad unverständlich → kein gültiger Link (≠ zurückgezogen)
  | { status: "rate-limit" } // T-250: 429 → zu viele Versuche, nicht "nicht gefunden"
  | { status: "gesperrt"; name?: string; fehler?: string }
  | { status: "offen"; data: ShareData }

/** tenant/projekt aus dem Pfad (setreo-cloud.com/<tenant>/<projektId>). */
function parsePath(): { tenant: string; projectId: string } | null {
  const teile = window.location.pathname.split("/").filter(Boolean)
  if (teile.length !== 2) return null
  return { tenant: teile[0], projectId: teile[1] }
}

export function ShareApp() {
  const ref = useMemo(parsePath, [])
  const [state, setState] = useState<ShareState>({ status: "laden" })
  const [password, setPassword] = useState("")
  const [busy, setBusy] = useState(false)

  const apiBase = ref ? `/_share/api/${ref.tenant}/${ref.projectId}` : ""

  useEffect(() => {
    if (!ref) {
      setState({ status: "ungueltig" })
      return
    }
    fetch(apiBase)
      .then(async (res) => {
        if (res.status === 429) return setState({ status: "rate-limit" })
        if (!res.ok) return setState({ status: "nicht-gefunden" })
        const body = (await res.json()) as { locked: boolean; name?: string; data?: ShareData }
        if (body.locked) setState({ status: "gesperrt", name: body.name })
        else if (body.data) setState({ status: "offen", data: body.data })
        else setState({ status: "nicht-gefunden" })
      })
      .catch(() => setState({ status: "nicht-gefunden" }))
  }, [ref, apiBase])

  const unlock = async () => {
    if (!password.trim()) return
    setBusy(true)
    try {
      const res = await fetch(`${apiBase}/unlock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      })
      if (res.status === 401) {
        setState((s) =>
          s.status === "gesperrt"
            ? { ...s, fehler: "Passwort falsch — bitte erneut versuchen." }
            : s,
        )
        return
      }
      if (res.status === 429) {
        // T-250: Rate-Limit beim Entsperren → Eingabe behalten, Hinweis statt Voll-Screen.
        setState((s) =>
          s.status === "gesperrt"
            ? { ...s, fehler: "Zu viele Versuche — bitte einen Moment warten." }
            : s,
        )
        return
      }
      if (!res.ok) {
        setState({ status: "nicht-gefunden" })
        return
      }
      const body = (await res.json()) as { data: ShareData }
      setState({ status: "offen", data: body.data })
    } catch {
      // T-490: Netzwerkfehler beim Entsperren nicht still schlucken — Eingabe-Feld behalten.
      setState((s) =>
        s.status === "gesperrt"
          ? { ...s, fehler: "Verbindung fehlgeschlagen — bitte erneut versuchen." }
          : s,
      )
    } finally {
      setBusy(false)
    }
  }

  if (state.status === "laden") {
    return (
      <Shell>
        <div className="flex h-full items-center justify-center text-neutral-400">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Lade Routenanalyse …
        </div>
      </Shell>
    )
  }

  if (state.status === "nicht-gefunden") {
    return (
      <Shell>
        <CenterCard
          icon={<SearchX className="h-6 w-6 text-neutral-400" />}
          title="Link nicht verfügbar"
          text="Diese Freigabe existiert nicht oder wurde vom Ersteller zurückgezogen."
        />
      </Shell>
    )
  }

  if (state.status === "ungueltig") {
    return (
      <Shell>
        <CenterCard
          icon={<SearchX className="h-6 w-6 text-neutral-400" />}
          title="Ungültiger Link"
          text="Diese Adresse ist kein gültiger Freigabe-Link. Bitte prüfen Sie den vollständigen Link."
        />
      </Shell>
    )
  }

  if (state.status === "rate-limit") {
    return (
      <Shell>
        <CenterCard
          icon={<SearchX className="h-6 w-6 text-neutral-400" />}
          title="Zu viele Versuche"
          text="Bitte einen Moment warten und die Seite neu laden."
        />
      </Shell>
    )
  }

  if (state.status === "gesperrt") {
    return (
      <Shell>
        <CenterCard
          icon={<Lock className="h-6 w-6 text-primary-600" />}
          title={state.name ?? "Geschützte Routenanalyse"}
          text="Dieser Link ist passwortgeschützt. Bitte das Passwort eingeben, das Sie vom Ersteller erhalten haben."
        >
          <div className="mt-4 flex w-full max-w-xs flex-col gap-2">
            <input
              type="password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void unlock()
              }}
              placeholder="Passwort"
              aria-label="Passwort"
              className="h-10 rounded-md border border-neutral-300 bg-white px-3 text-sm focus-visible:border-primary-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
            />
            {state.fehler ? (
              <p role="alert" className="text-xs font-medium text-severity-kritisch">
                {state.fehler}
              </p>
            ) : null}
            <button
              onClick={() => void unlock()}
              disabled={busy || !password.trim()}
              className="h-10 cursor-pointer rounded-md bg-primary-600 text-sm font-medium text-white transition-colors hover:bg-primary-700 disabled:pointer-events-none disabled:opacity-50"
            >
              {busy ? "Prüfe …" : "Öffnen"}
            </button>
          </div>
        </CenterCard>
      </Shell>
    )
  }

  return <ShareViewer data={state.data} projectId={ref?.projectId ?? "share"} />
}

// ── Viewer (entsperrt) ────────────────────────────────────────────────────────

function ShareViewer({ data, projectId }: { data: ShareData; projectId: string }) {
  // #12a: Haftungsausschluss als Pop-up beim Öffnen (wie in der App), nicht in der Footer-Bar.
  const [showDisclaimer, setShowDisclaimer] = useState(true)
  // synthetisches Project-Objekt für die wiederverwendeten Tabs (read-only Felder)
  const project: Project = useMemo(
    () => ({
      id: projectId,
      name: data.name,
      status: "fertig",
      createdAt: data.updatedAt,
      updatedAt: data.updatedAt,
      routes: data.routes,
      transport: data.transport ?? { laenge: 0, breite: 0, hoehe: 0, gesamtgewicht: 0 },
      zeitraum: data.zeitraum ?? {}, // #12b: aus der Share-Payload → Zeitstrahl aktiv
      findings: data.findings,
      distanzKm: data.distanzKm,
      fahrzeitMin: data.fahrzeitMin,
    }),
    [data, projectId],
  )

  return (
    <>
      {showDisclaimer ? <DisclaimerModal mode="view" onClose={() => setShowDisclaimer(false)} /> : null}
      <MemoryRouter initialEntries={[`/projekte/${projectId}/karte`]}>
        <Shell projektName={data.name} routes={data.routes}>
          <Routes>
            <Route path="/projekte/:id/karte" element={<KarteTab project={project} canChat={false} />} />
            <Route
              path="/projekte/:id/dashboard"
              element={
                <div className="h-full overflow-y-auto px-4 py-6 lg:px-6">
                  <DashboardTab project={project} />
                </div>
              }
            />
            <Route path="*" element={<Navigate to={`/projekte/${projectId}/karte`} replace />} />
          </Routes>
        </Shell>
      </MemoryRouter>
    </>
  )
}

/** Tab-Leiste im Share-Header — nutzt den MemoryRouter. */
function ShareTabs() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const tab = pathname.endsWith("/dashboard") ? "dashboard" : "karte"
  const id = pathname.split("/")[2]

  return (
    <div className="flex items-center gap-1 rounded-md border border-neutral-200 bg-neutral-50 p-1">
      {(
        [
          { slug: "karte", label: "Karte", icon: MapPinned },
          { slug: "dashboard", label: "Auswertung", icon: ClipboardList },
        ] as const
      ).map((t) => (
        <button
          key={t.slug}
          onClick={() => navigate(`/projekte/${id}/${t.slug}`)}
          className={cn(
            "flex cursor-pointer items-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium transition-colors",
            tab === t.slug
              ? "bg-white text-primary-700 shadow-sm"
              : "text-neutral-500 hover:text-neutral-700",
          )}
        >
          <t.icon className="h-4 w-4" /> {t.label}
        </button>
      ))}
    </div>
  )
}

/** Download-Button im Share-Header → Maske mit allen Strecken; je Strecke KML/Google-Maps-Export. */
function ShareDownload({ routes }: { routes: ProjectRoute[] }) {
  const [open, setOpen] = useState(false)
  const usable = routes.filter((r) => r.points.length >= 2)
  if (usable.length === 0) return null

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Strecken herunterladen"
        className="flex h-9 cursor-pointer items-center gap-1.5 rounded-md border border-neutral-200 bg-white px-2.5 text-sm font-medium text-neutral-700 shadow-sm transition-colors hover:bg-neutral-50 hover:text-neutral-900"
      >
        <Download className="h-4 w-4" /> <span className="hidden sm:inline">Download</span>
      </button>

      {open ? (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4">
          <div className="absolute inset-0 animate-fade-in bg-neutral-950/50 backdrop-blur-[2px]" onClick={() => setOpen(false)} />
          <div className="relative flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-overlay">
            <header className="flex shrink-0 items-center gap-3 border-b border-neutral-200 px-4 py-3">
              <Download className="h-5 w-5 text-primary-600" />
              <h2 className="flex-1 text-sm font-semibold text-neutral-900">Strecke herunterladen</h2>
              <button type="button" onClick={() => setOpen(false)} aria-label="Schließen" className="rounded-md p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700">
                <X className="h-5 w-5" />
              </button>
            </header>
            <ul className="min-h-0 flex-1 divide-y divide-neutral-100 overflow-auto">
              {usable.map((r) => (
                <li key={r.id} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="h-3 w-3 shrink-0 rounded-full ring-2 ring-white" style={{ background: r.farbe }} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-neutral-800">{r.name}</p>
                    <p className="truncate text-xs tabular-nums text-neutral-400">
                      {r.points.length.toLocaleString("de-DE")} Punkte · ca. {routeLengthKm(r.points).toLocaleString("de-DE")} km
                    </p>
                  </div>
                  <DropdownMenu
                    triggerLabel={`Strecke ${r.name} herunterladen oder öffnen`}
                    trigger={
                      <span title="Herunterladen / in Google Maps öffnen" className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md border border-neutral-200 text-neutral-500 transition-colors hover:bg-neutral-50 hover:text-neutral-800">
                        <Download className="h-4 w-4" />
                      </span>
                    }
                  >
                    <DropdownItem onClick={() => openInGoogleMaps(r)}>
                      <ExternalLink className="h-4 w-4 text-neutral-400" /> In Google Maps öffnen
                    </DropdownItem>
                    <DropdownItem onClick={() => downloadKml(r)}>
                      <FileDown className="h-4 w-4 text-neutral-400" /> Als KML herunterladen
                    </DropdownItem>
                  </DropdownMenu>
                </li>
              ))}
            </ul>
            <p className="shrink-0 border-t border-neutral-100 px-4 py-2 text-[11px] text-neutral-400">
              <RouteIcon className="mr-1 inline h-3 w-3" />
              {usable.length} {usable.length === 1 ? "Strecke" : "Strecken"} in dieser Analyse.
            </p>
          </div>
        </div>
      ) : null}
    </>
  )
}

// ── Layout-Hülle (schlanker Chrome ohne Navigation/Verwaltung) ────────────────

function Shell({
  children,
  projektName,
  routes,
}: {
  children: React.ReactNode
  projektName?: string
  routes?: ProjectRoute[]
}) {
  const inRouter = projektName !== undefined
  return (
    <div className="flex h-screen flex-col bg-neutral-50">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-neutral-200/80 bg-white px-4 shadow-card lg:px-6">
        {/* T-#12: Logo führt zur Setreo-Cloud-Startseite. */}
        <a href="https://setreo-cloud.com" title="Zur Setreo-Cloud" className="shrink-0">
          <SetreoLogo height={26} />
        </a>
        <span className="text-neutral-300" aria-hidden>
          |
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-neutral-700">
          {projektName ?? "Routenanalyse"}
        </span>
        {inRouter ? (
          <div className="flex items-center gap-2">
            <ShareTabs />
            {routes && routes.length ? <ShareDownload routes={routes} /> : null}
          </div>
        ) : null}
      </header>
      <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
      {/* T-#12: rechtlicher Footer wie auf den übrigen Setreo-Seiten + Haftungsausschluss. */}
      <footer className="flex shrink-0 flex-wrap items-center justify-center gap-x-4 gap-y-1 border-t border-neutral-100 bg-white px-4 py-2 text-[11px] text-neutral-400">
        <a href="https://setreo.de/impressum/" target="_blank" rel="noopener" className="transition-colors hover:text-neutral-600">Impressum</a>
        <a href="https://setreo.de/datenschutz/" target="_blank" rel="noopener" className="transition-colors hover:text-neutral-600">Datenschutz</a>
        <a href="https://setreo.de/agb/" target="_blank" rel="noopener" className="transition-colors hover:text-neutral-600">AGB</a>
      </footer>
    </div>
  )
}

function CenterCard({
  icon,
  title,
  text,
  children,
}: {
  icon: React.ReactNode
  title: string
  text: string
  children?: React.ReactNode
}) {
  return (
    <div className="flex h-full items-center justify-center px-4">
      <div className="flex w-full max-w-md flex-col items-center rounded-xl border border-neutral-200 bg-white p-8 text-center shadow-card">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-neutral-100">
          {icon}
        </div>
        <h1 className="text-lg font-bold text-neutral-900">{title}</h1>
        <p className="mt-2 text-sm text-neutral-500">{text}</p>
        {children}
      </div>
    </div>
  )
}
