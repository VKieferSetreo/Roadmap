// Fund-Marker für die Route. Mehrere Funde am selben Ort (z.B. zwei Fahrtrichtungen
// derselben Maßnahme) werden zu EINEM Marker zusammengefasst, der beim Öffnen Tabs
// zeigt — so geht keiner verloren, die Karte bleibt aber aufgeräumt.

import { useState } from "react"
import { Marker, Popup } from "react-leaflet"
import { Building2, ExternalLink, Phone, Trash2, User } from "lucide-react"
import type { Finding, ProjectRoute } from "@/types/domain"
import {
  EIGEN_BADGE,
  EIGEN_COLOR,
  formatGueltigkeit,
  istEigenerEintrag,
  katMeta,
  SEVERITY_META,
} from "@/components/project/findingMeta"
import { KategorieGlyph } from "@/components/project/KategorieGlyph"
import { findingPinIcon } from "./pins"
import { geomMidpoint } from "@/lib/geom"
import { cn } from "@/lib/cn"

const SEV_RANK: Record<string, number> = { kritisch: 3, warnung: 2, hinweis: 1 }

/** Popup-Inhalt EINES Funds (eine Richtung/Variante). */
function FindingDetail({
  f,
  routeColor,
  onDeleteOwn,
}: {
  f: Finding
  routeColor: string
  onDeleteOwn?: (obstacleId: string) => void
}) {
  const meta = SEVERITY_META[f.severity]
  const kat = katMeta(f.kategorie)
  const eigen = istEigenerEintrag(f.quelle)
  const kontakt = eigen ? f.quelle?.kontakt : undefined
  return (
    <>
      <div className="flex items-start gap-2.5">
        <span className={cn("shrink-0 rounded-lg p-2", meta.chip)}>
          <KategorieGlyph kategorie={f.kategorie} className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-neutral-900">{f.titel}</p>
          <p className="text-xs text-neutral-500">
            {kat.label} · km {f.km.toLocaleString("de-DE")}
            {f.strassenRef ? ` · ${f.strassenRef}` : ""}
          </p>
        </div>
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {f.routeName ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-neutral-50 px-2 py-0.5 text-[11px] font-medium text-neutral-600">
            <span className="h-2 w-2 rounded-full" style={{ background: routeColor }} />
            {f.routeName}
          </span>
        ) : null}
        {eigen ? (
          <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium", EIGEN_BADGE)}>
            Eigener Eintrag
          </span>
        ) : null}
      </div>

      {f.beschreibung ? (
        <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-neutral-600">{f.beschreibung}</p>
      ) : null}

      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 border-t border-neutral-200/70 pt-3 text-xs">
        <div className="flex flex-col">
          <dt className="text-neutral-400">Gültig</dt>
          <dd className="font-medium tabular-nums text-neutral-800">
            {formatGueltigkeit(f.gueltigVon, f.gueltigBis)}
          </dd>
        </div>
        {Object.entries(f.detail).map(([k, v]) => (
          <div key={k} className="flex flex-col">
            <dt className="text-neutral-400">{k}</dt>
            <dd className="font-medium tabular-nums text-neutral-800">{v}</dd>
          </div>
        ))}
      </dl>

      {f.zustaendig ? (
        <p className="mt-2.5 flex items-center gap-1.5 text-xs text-neutral-500">
          <Building2 className="h-3.5 w-3.5 shrink-0 text-neutral-400" />
          {f.zustaendig}
        </p>
      ) : null}

      {kontakt && (kontakt.melder || kontakt.ansprechpartner || kontakt.telefon) ? (
        <div className="mt-2.5 flex flex-col gap-1 rounded-lg bg-sky-50/70 px-2.5 py-2 text-xs text-neutral-600">
          {kontakt.melder ? (
            <p className="flex items-center gap-1.5">
              <User className="h-3.5 w-3.5 shrink-0 text-sky-500" />
              <span className="text-neutral-400">Gemeldet von:</span> {kontakt.melder}
            </p>
          ) : null}
          {kontakt.ansprechpartner ? (
            <p className="flex items-center gap-1.5">
              <User className="h-3.5 w-3.5 shrink-0 text-sky-500" />
              <span className="text-neutral-400">Ansprechpartner:</span> {kontakt.ansprechpartner}
            </p>
          ) : null}
          {kontakt.telefon ? (
            <p className="flex items-center gap-1.5">
              <Phone className="h-3.5 w-3.5 shrink-0 text-sky-500" />
              <a href={`tel:${kontakt.telefon.replace(/\s+/g, "")}`} className="font-medium text-sky-700 hover:underline">
                {kontakt.telefon}
              </a>
            </p>
          ) : null}
        </div>
      ) : null}

      {eigen && onDeleteOwn && f.obstacleId ? (
        <button
          type="button"
          onClick={() => {
            if (window.confirm("Diesen eigenen Eintrag wirklich verwerfen?")) {
              onDeleteOwn(f.obstacleId as string)
            }
          }}
          className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-2.5 py-1 text-[11px] font-medium text-red-600 transition-colors hover:bg-red-100"
        >
          <Trash2 className="h-3.5 w-3.5" /> Eintrag verwerfen
        </button>
      ) : null}

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-neutral-200/70 pt-3">
        <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium", meta.soft)}>
          <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} />
          {meta.label}
        </span>
        {f.quelle?.name ? (
          eigen || !f.quelle.url ? (
            <span className="text-xs font-medium text-neutral-500">{f.quelle.name}</span>
          ) : (
            <a
              href={f.quelle.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs font-medium text-neutral-500 transition-colors hover:text-neutral-800"
            >
              {f.quelle.name} <ExternalLink className="h-3 w-3" />
            </a>
          )
        ) : null}
      </div>
    </>
  )
}

/** Ein Marker für eine Fund-Gruppe. >1 Fund (z.B. beide Richtungen) → Tabs zum Umschalten. */
export function FindingMarker({
  group,
  routes,
  selectedId,
  onSelect,
  onDeleteOwn,
}: {
  group: Finding[]
  routes: ProjectRoute[]
  selectedId?: string | null
  onSelect?: (id: string) => void
  onDeleteOwn?: (obstacleId: string) => void
}) {
  const [tab, setTab] = useState(0)
  // schwerster Fund bestimmt Pin-Farbe + Position
  const primary = [...group].sort((a, b) => (SEV_RANK[b.severity] ?? 0) - (SEV_RANK[a.severity] ?? 0))[0]
  const active = group.some((f) => f.id === selectedId)
  const eigen = istEigenerEintrag(primary.quelle)
  const pos = geomMidpoint(primary.geom) ?? ([primary.lat, primary.lng] as [number, number])
  const idx = Math.min(tab, group.length - 1)
  const current = group[idx]
  const routeColor = routes.find((r) => r.id === current.routeId)?.farbe ?? "#71717A"

  return (
    <Marker
      position={pos}
      icon={findingPinIcon(primary.kategorie, eigen ? EIGEN_COLOR : SEVERITY_META[primary.severity].marker, active)}
      eventHandlers={{ click: () => onSelect?.(primary.id) }}
      zIndexOffset={active ? 1000 : 0}
    >
      <Popup maxWidth={340} minWidth={300}>
        <div className="w-[300px] max-w-[78vw]">
          {group.length > 1 ? (
            <div className="mb-2.5 flex gap-1 rounded-md bg-neutral-100 p-0.5">
              {group.map((g, i) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => {
                    setTab(i)
                    onSelect?.(g.id)
                  }}
                  className={cn(
                    "flex flex-1 items-center justify-center gap-1 rounded px-2 py-1 text-[11px] font-medium transition-colors",
                    i === idx ? "bg-white text-primary-700 shadow-sm" : "text-neutral-500 hover:text-neutral-700",
                  )}
                  title={g.titel}
                >
                  <span className={cn("h-1.5 w-1.5 rounded-full", SEVERITY_META[g.severity].dot)} />
                  Richtung {i + 1}
                </button>
              ))}
            </div>
          ) : null}
          <FindingDetail f={current} routeColor={routeColor} onDeleteOwn={onDeleteOwn} />
        </div>
      </Popup>
    </Marker>
  )
}
