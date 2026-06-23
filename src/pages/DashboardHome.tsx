// Home — Hero (schlank) + Projekt-Übersicht mit Karten-/Listen-Ansicht.
// Seed/Initial-Load passiert zentral im AppLayout (Datasource-Detection).

import { Archive, ChevronDown, FolderPlus, LayoutGrid, List, Plus, RefreshCcw, Search, WifiOff, X } from "lucide-react"
import { useState } from "react"
import { useProjectStore } from "@/store/projects"
import { useUiStore } from "@/store/ui"
import { useSettingsStore, type ProjektAnsicht } from "@/store/settings"
import { ProjectCard, ProjectListRow } from "@/components/project/ProjectCard"
import { EmptyState } from "@/components/shared/EmptyState"
import { Card } from "@/components/ui/Card"
import { Button } from "@/components/ui/Button"
import { cn } from "@/lib/cn"

export function DashboardHome() {
  const projects = useProjectStore((s) => s.projects ?? [])
  const loading = useProjectStore((s) => s.loading)
  const placeholderCount = useProjectStore((s) => s.placeholderCount)
  const loadError = useProjectStore((s) => s.loadError) // T-228
  const loadProjects = useProjectStore((s) => s.loadProjects)
  const openNewProject = useUiStore((s) => s.openNewProject)
  const ansicht = useSettingsStore((s) => s.projektAnsicht)
  const setAnsicht = useSettingsStore((s) => s.setProjektAnsicht)
  const [archivOffen, setArchivOffen] = useState(false)
  const [suche, setSuche] = useState("")

  const aktive = projects.filter((p) => !p.archiviertAm)
  const archivierte = projects.filter((p) => Boolean(p.archiviertAm))
  const sorted = [...aktive].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  const sortedArchiv = [...archivierte].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))

  // Suche ab vielen Projekten einblenden; filtert nach Name, Ersteller-Mail & Beschreibung.
  const zeigeSuche = aktive.length > 6
  const q = suche.trim().toLowerCase()
  const gefiltert =
    zeigeSuche && q
      ? sorted.filter((p) =>
          [p.name, p.erstelltVon, (p as { beschreibung?: string }).beschreibung]
            .some((f) => String(f ?? "").toLowerCase().includes(q)),
        )
      : sorted

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-6xl px-4 py-8 lg:px-6">
        {/* Hero */}
        <div className="relative overflow-hidden rounded-2xl border border-primary-100 bg-gradient-to-br from-primary-50 via-white to-white p-6 shadow-card sm:p-8">
          {/* dezentes Routen-Motiv rechts */}
          <svg
            aria-hidden
            viewBox="0 0 320 180"
            className="pointer-events-none absolute -right-6 top-0 hidden h-full w-72 text-primary-200/70 md:block"
            fill="none"
          >
            <path
              d="M18 168 C 80 120, 60 76, 140 70 S 270 40, 306 8"
              stroke="currentColor"
              strokeWidth="3.2"
              strokeLinecap="round"
              strokeDasharray="1 10"
            />
            <path
              d="M30 160 C 92 116, 76 84, 152 78 S 262 50, 298 22"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              opacity="0.5"
            />
            <circle cx="18" cy="168" r="6" fill="#87B52D" stroke="#fff" strokeWidth="2.5" />
            <circle cx="306" cy="8" r="6" fill="#DC2626" stroke="#fff" strokeWidth="2.5" />
            <circle cx="306" cy="8" r="2" fill="#fff" />
            <circle cx="140" cy="70" r="4.5" fill="#EA580C" stroke="#fff" strokeWidth="2" />
          </svg>

          <div className="relative">
            <p className="text-xs font-semibold uppercase tracking-wider text-primary-600">
              Setreo Roadmap
            </p>
            <h1 className="mt-1.5 text-2xl font-bold tracking-tight text-neutral-900 sm:text-[1.7rem]">
              Routenanalyse für Schwertransporte
            </h1>
            <p className="mt-2 max-w-xl text-sm text-neutral-600">
              Strecke hochladen, Transport-Stammdaten erfassen, Auswertung starten.
              <br />
              Alle Hindernisse entlang der Route auf einen Blick.
            </p>
          </div>
        </div>

        {/* Projekt-Sektion */}
        <div className="mt-8 flex items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-neutral-900">Ihre Projekte</h2>
            <p className="text-sm text-neutral-500">
              {/* Während des Ladens schon die echte Anzahl (Vorab-Zähler) zeigen. */}
              {(() => {
                const n = loading ? placeholderCount : aktive.length
                return `${n} ${n === 1 ? "Projekt" : "Projekte"}`
              })()}
              {!loading && archivierte.length > 0 ? ` · ${archivierte.length} archiviert` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Ansicht: Karten ⇄ Liste */}
            <div
              className="inline-flex rounded-md border border-neutral-200 bg-neutral-50 p-1"
              role="group"
              aria-label="Ansicht wählen"
            >
              {(
                [
                  { id: "karten", label: "Karten", icon: LayoutGrid },
                  { id: "liste", label: "Liste", icon: List },
                ] as { id: ProjektAnsicht; label: string; icon: typeof List }[]
              ).map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => setAnsicht(opt.id)}
                  aria-pressed={ansicht === opt.id}
                  title={opt.label}
                  className={cn(
                    "flex cursor-pointer items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors",
                    ansicht === opt.id
                      ? "bg-white text-primary-700 shadow-sm"
                      : "text-neutral-500 hover:text-neutral-700",
                  )}
                >
                  <opt.icon className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{opt.label}</span>
                </button>
              ))}
            </div>
            <Button variant="outline" onClick={() => openNewProject()}>
              <Plus className="h-4 w-4" /> Projekt hinzufügen
            </Button>
          </div>
        </div>

        {/* Suchleiste — erst ab vielen Projekten (sonst überflüssig) */}
        {!loading && zeigeSuche ? (
          <div className="relative mt-5">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <input
              type="text"
              value={suche}
              onChange={(e) => setSuche(e.target.value)}
              placeholder="Projekte durchsuchen …"
              aria-label="Projekte durchsuchen"
              className="w-full rounded-lg border border-neutral-200 bg-white py-2 pl-9 pr-9 text-sm text-neutral-800 placeholder:text-neutral-400 focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-400"
            />
            {suche ? (
              <button
                onClick={() => setSuche("")}
                title="Suche leeren"
                aria-label="Suche leeren"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 cursor-pointer rounded p-0.5 text-neutral-400 transition-colors hover:text-neutral-700"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        ) : null}

        {loading ? (
          // YouTube-Stil: genau so viele Lade-Kacheln wie es echte Projekte gibt (Vorab-Zähler),
          // Shimmer-Platzhalter; die echten Karten kommen mit der vollen Liste auf einen Schlag rein.
          <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: Math.min(placeholderCount || 3, 24) }).map((_, i) => (
              <div
                key={i}
                className="h-[256px] overflow-hidden rounded-xl border border-neutral-200/80 bg-white shadow-card"
              >
                <div className="skeleton h-28 w-full rounded-t-xl" />
                <div className="flex flex-col gap-3 p-4">
                  <div className="skeleton h-4 w-3/4 rounded" />
                  <div className="skeleton h-3 w-1/2 rounded" />
                  <div className="skeleton mt-4 h-3 w-2/3 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : loadError && sorted.length === 0 ? (
          // T-228: Backend-Fehler NICHT als „erstes Projekt"-Onboarding tarnen (zahlender Bestandskunde).
          <div className="mt-6">
            <EmptyState
              icon={WifiOff}
              title="Projekte konnten nicht geladen werden"
              description="Das Backend ist gerade nicht erreichbar. Bitte Verbindung prüfen und erneut laden."
              cta={
                <Button onClick={() => void loadProjects()}>
                  <RefreshCcw className="h-4 w-4" /> Erneut laden
                </Button>
              }
            />
          </div>
        ) : sorted.length === 0 ? (
          <div className="mt-6">
            <EmptyState
              icon={FolderPlus}
              title="Los geht's: Ihr erstes Projekt"
              description="Legen Sie ein Projekt an, um eine Strecke zu analysieren."
              cta={<Button onClick={() => openNewProject()}>Neues Projekt anlegen</Button>}
            />
          </div>
        ) : gefiltert.length === 0 ? (
          <div className="mt-6">
            <EmptyState
              icon={Search}
              title="Keine Treffer"
              description={`Kein Projekt passt zu „${suche.trim()}".`}
            />
          </div>
        ) : ansicht === "karten" ? (
          <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {gefiltert.map((p, i) => (
              <ProjectCard key={p.id} project={p} index={i} />
            ))}
          </div>
        ) : (
          <Card className="mt-6">
            <ul className="divide-y divide-neutral-100">
              {gefiltert.map((p, i) => (
                <ProjectListRow key={p.id} project={p} index={i} />
              ))}
            </ul>
          </Card>
        )}

        {/* Archiv — eingeklappt, stört den Alltag nicht */}
        {sortedArchiv.length > 0 ? (
          <div className="mt-10">
            <button
              onClick={() => setArchivOffen((o) => !o)}
              aria-expanded={archivOffen}
              className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-neutral-500 transition-colors hover:text-neutral-800"
            >
              <Archive className="h-4 w-4" />
              Archiv ({sortedArchiv.length})
              <ChevronDown
                className={cn(
                  "h-4 w-4 transition-transform duration-200",
                  archivOffen && "rotate-180",
                )}
              />
            </button>
            {archivOffen ? (
              <Card className="mt-3 opacity-80">
                <ul className="divide-y divide-neutral-100">
                  {sortedArchiv.map((p, i) => (
                    <ProjectListRow key={p.id} project={p} index={i} />
                  ))}
                </ul>
              </Card>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}
