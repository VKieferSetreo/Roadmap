// Share-Viewer für externe Empfänger (setreo-cloud.com/<tenant>/<projekt>):
// Karte + Auswertung eines veröffentlichten Projekts — read-only, optional
// passwortgeschützt, KEINE Projektverwaltung. Wiederverwendet KarteTab/DashboardTab
// über einen MemoryRouter (deren interne navigate()-Aufrufe treffen echte Routen).

import { useEffect, useMemo, useState } from "react"
import { MemoryRouter, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom"
import { ClipboardList, Loader2, Lock, MapPinned, SearchX } from "lucide-react"
import { KarteTab } from "@/components/project/KarteTab"
import { DashboardTab } from "@/components/project/DashboardTab"
import { SetreoLogo } from "@/components/shared/SetreoLogo"
import { DisclaimerModal } from "@/components/account/DisclaimerModal"
import type { Finding, Project, ProjectRoute, TransportData } from "@/types/domain"
import { cn } from "@/lib/cn"

/** Daten-Payload des Public-Share-Endpoints (gestripped — nur Abmessungen als Stammdaten, T-223). */
interface ShareData {
  name: string
  distanzKm?: number
  fahrzeitMin?: number
  updatedAt: string
  transport?: TransportData
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
      zeitraum: {},
      findings: data.findings,
      distanzKm: data.distanzKm,
      fahrzeitMin: data.fahrzeitMin,
    }),
    [data, projectId],
  )

  return (
    <MemoryRouter initialEntries={[`/projekte/${projectId}/karte`]}>
      <Shell projektName={data.name}>
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

// ── Layout-Hülle (schlanker Chrome ohne Navigation/Verwaltung) ────────────────

function Shell({ children, projektName }: { children: React.ReactNode; projektName?: string }) {
  const inRouter = projektName !== undefined
  // T-#12: Haftungsausschluss als ansehbares Modal (gleicher vetted Text wie in der App), zusätzlich
  // zu den rechtlichen Links — kein neuer Rechtstext, nur Wiederverwendung.
  const [showDisclaimer, setShowDisclaimer] = useState(false)
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
        {inRouter ? <ShareTabs /> : null}
      </header>
      <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
      {/* T-#12: rechtlicher Footer wie auf den übrigen Setreo-Seiten + Haftungsausschluss. */}
      <footer className="flex shrink-0 flex-wrap items-center justify-center gap-x-4 gap-y-1 border-t border-neutral-100 bg-white px-4 py-2 text-[11px] text-neutral-400">
        <a href="https://setreo.de/impressum/" target="_blank" rel="noopener" className="transition-colors hover:text-neutral-600">Impressum</a>
        <a href="https://setreo.de/datenschutz/" target="_blank" rel="noopener" className="transition-colors hover:text-neutral-600">Datenschutz</a>
        <a href="https://setreo.de/agb/" target="_blank" rel="noopener" className="transition-colors hover:text-neutral-600">AGB</a>
        <button type="button" onClick={() => setShowDisclaimer(true)} className="transition-colors hover:text-neutral-600">
          Haftungsausschluss
        </button>
        <span className="text-neutral-300" aria-hidden>·</span>
        <span>Bereitgestellt über Setreo Roadmap</span>
      </footer>
      {showDisclaimer ? <DisclaimerModal mode="view" onClose={() => setShowDisclaimer(false)} /> : null}
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
