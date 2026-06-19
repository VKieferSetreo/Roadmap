// Fund-Marker für die Route. Mehrere Funde am selben Ort (z.B. zwei Fahrtrichtungen
// derselben Maßnahme) werden zu EINEM Marker zusammengefasst, der beim Öffnen Tabs
// zeigt — so geht keiner verloren, die Karte bleibt aber aufgeräumt.

import { useState } from "react"
import { Marker, Popup } from "react-leaflet"
import { Building2, EyeOff, Phone, Trash2, User } from "lucide-react"
import type { Finding, ProjectRoute } from "@/types/domain"
import {
  EIGEN_BADGE,
  EIGEN_COLOR,
  istEigenerEintrag,
  katMeta,
  SEVERITY_META,
} from "@/components/project/findingMeta"
import { FindingCard } from "./FindingCard"
import { findingPinIcon } from "./pins"
import { geomMidpoint } from "@/lib/geom"
import { cn } from "@/lib/cn"

const SEV_RANK: Record<string, number> = { kritisch: 3, warnung: 2, hinweis: 1 }

/** Popup-Inhalt EINES Funds (eine Richtung/Variante) — gemeinsames FindingCard-Layout. */
function FindingDetail({
  f,
  onDeleteOwn,
  onHide,
}: {
  f: Finding
  onDeleteOwn?: (obstacleId: string) => void
  onHide?: (finding: Finding) => void
}) {
  const kat = katMeta(f.kategorie)
  const eigen = istEigenerEintrag(f.quelle)
  const kontakt = eigen ? f.quelle?.kontakt : undefined

  const subtitle = `${kat.label} · km ${f.km.toLocaleString("de-DE")}${f.strassenRef ? ` · ${f.strassenRef}` : ""}`

  // Zusatz nach den Stammdaten: eigener-Eintrag-Badge, Zuständigkeit, Kontaktblock.
  const extra =
    eigen || f.zustaendig || (kontakt && (kontakt.melder || kontakt.ansprechpartner || kontakt.telefon)) ? (
      <div className="mt-2.5 flex flex-col gap-2">
        {eigen ? (
          <span className={cn("inline-flex w-fit items-center rounded-full border px-2 py-0.5 text-[11px] font-medium", EIGEN_BADGE)}>
            Eigener Eintrag
          </span>
        ) : null}
        {f.zustaendig ? (
          <p className="flex items-center gap-1.5 text-xs text-neutral-500">
            <Building2 className="h-3.5 w-3.5 shrink-0 text-neutral-400" />
            {f.zustaendig}
          </p>
        ) : null}
        {kontakt && (kontakt.melder || kontakt.ansprechpartner || kontakt.telefon) ? (
          <div className="flex flex-col gap-1 rounded-lg bg-sky-50/70 px-2.5 py-2 text-xs text-neutral-600">
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
      </div>
    ) : null

  // Aktion über volle Breite: eigene Einträge verwerfen, sonst für die Auswertung ausblenden.
  const action =
    eigen && onDeleteOwn && f.obstacleId ? (
      <button
        type="button"
        onClick={() => {
          if (window.confirm("Diesen eigenen Eintrag wirklich verwerfen?")) {
            onDeleteOwn(f.obstacleId as string)
          }
        }}
        className="flex w-full items-center justify-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-100"
      >
        <Trash2 className="h-4 w-4" /> Eintrag verwerfen
      </button>
    ) : !eigen && onHide && !f.hidden ? (
      <button
        type="button"
        onClick={() => onHide(f)}
        className="flex w-full items-center justify-center gap-1.5 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-xs font-medium text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-severity-kritisch"
      >
        <EyeOff className="h-4 w-4" /> Für die Auswertung ausblenden
      </button>
    ) : null

  return (
    <FindingCard
      kategorie={f.kategorie}
      titel={f.titel}
      severity={f.severity}
      signKey={f.detail?.["Schwertransport"] === "gesperrt" ? "fahrverbot" : undefined}
      subtitle={subtitle}
      beschreibung={f.beschreibung}
      gueltigVon={f.gueltigVon}
      gueltigBis={f.gueltigBis}
      detail={f.detail}
      quelle={eigen ? { name: f.quelle?.name } : f.quelle}
      extra={extra}
      action={action}
    />
  )
}

/** Ein Marker für eine Fund-Gruppe. >1 Fund (z.B. beide Richtungen) → Tabs zum Umschalten. */
export function FindingMarker({
  group,
  routes,
  selectedId,
  onSelect,
  onDeleteOwn,
  onHide,
}: {
  group: Finding[]
  routes: ProjectRoute[]
  selectedId?: string | null
  onSelect?: (id: string) => void
  onDeleteOwn?: (obstacleId: string) => void
  onHide?: (finding: Finding) => void
}) {
  const [tab, setTab] = useState(0)
  // schwerster Fund bestimmt Pin-Farbe + Position
  const primary = [...group].sort((a, b) => (SEV_RANK[b.severity] ?? 0) - (SEV_RANK[a.severity] ?? 0))[0]
  const active = group.some((f) => f.id === selectedId)
  const eigen = istEigenerEintrag(primary.quelle)
  const pos = geomMidpoint(primary.geom) ?? ([primary.lat, primary.lng] as [number, number])
  const idx = Math.min(tab, group.length - 1)
  const current = group[idx]

  return (
    <Marker
      position={pos}
      icon={findingPinIcon(
        primary.kategorie,
        eigen ? EIGEN_COLOR : SEVERITY_META[primary.severity].marker,
        active,
        primary.detail?.["Schwertransport"] === "gesperrt" ? "fahrverbot" : undefined,
      )}
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
          <FindingDetail f={current} onDeleteOwn={onDeleteOwn} onHide={onHide} />
        </div>
      </Popup>
    </Marker>
  )
}
