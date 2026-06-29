// Fund-Marker für die Route. Mehrere Funde am selben Ort (z.B. zwei Fahrtrichtungen
// derselben Maßnahme) werden zu EINEM Marker zusammengefasst, der beim Öffnen Tabs
// zeigt — so geht keiner verloren, die Karte bleibt aber aufgeräumt.

import { memo, useState } from "react"
import { Marker, Popup, useMap } from "react-leaflet"
import { EyeOff, Plus, Phone, Trash2, User } from "lucide-react"
import type { Finding, FindingKontakt } from "@/types/domain"
import {
  EIGEN_BADGE,
  EIGEN_COLOR,
  istEigenerEintrag,
  katMeta,
  SEVERITY_META,
} from "@/components/project/findingMeta"
import { FindingCard } from "./FindingCard"
import { FindingContactCard } from "./FindingContactCard"
import { FindingChatPanel } from "./chat/FindingChatPanel"
import { ShareChatReadonly } from "./chat/ShareChatReadonly"
import { useFindingChatPresence } from "@/hooks/useFindingChat"
import { findingPinIcon } from "./pins"
import { geomMidpoint } from "@/lib/geom"
import { cn } from "@/lib/cn"

const SEV_RANK: Record<string, number> = { kritisch: 3, warnung: 2, hinweis: 1 }

// PREVIEW (T-613 Stufe 1): solange der Zuständigkeits-Resolver noch keine echten Daten an die
// Funde hängt, zeigt die Kontakt-Kachel auf AUTOBAHN-Funden die echte zuständige GST-Niederlassung
// als Beispiel (Region-genau folgt aus dem ArcGIS-Layer; Telefon/Adresse aus dem laufenden Scrape).
// Sobald f.kontakt vom Backend kommt, hat das Vorrang und diese Vorschau entfällt.
const PREVIEW_GST_KONTAKT: FindingKontakt = {
  stelle: "Autobahn GmbH – Niederlassung Rheinland",
  rolle: "Großraum- & Schwertransport (GST)",
  email: "gst.rheinland@autobahn.de",
  telefon: "+49 2151 36807-0",
  adresse: "Willy-Brandt-Platz 2, 47805 Krefeld",
}
// Autobahn-Bezug am Straßenref/Titel erkennen (A7, A 7, "BAB A1", "(A99)" …), ohne B96A o.ä. falsch zu treffen.
const istAutobahnRef = (s: string) => /(?:^|[\s(\/])A ?\d/.test(s)

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
    eigen || (kontakt && (kontakt.melder || kontakt.ansprechpartner || kontakt.telefon)) ? (
      <div className="mt-2.5 flex flex-col gap-2">
        {eigen ? (
          <span className={cn("inline-flex w-fit items-center rounded-full border px-2 py-0.5 text-[11px] font-medium", EIGEN_BADGE)}>
            Eigener Eintrag
          </span>
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
// T-379: memoisiert — bei stabilen group/Callbacks (RouteMap memoisiert groupFindings) rendert
// ein Marker nicht mehr bei jedem Karten-Render mit. Vergleich ist flach (props).
function FindingMarkerImpl({
  group,
  selectedId,
  onSelect,
  onDeleteOwn,
  onHide,
  canChat = true,
}: {
  group: Finding[]
  selectedId?: string | null
  onSelect?: (id: string) => void
  onDeleteOwn?: (obstacleId: string) => void
  onHide?: (finding: Finding) => void
  /** Baustellen-Chat anbieten. App = true; öffentliche Freigabe = false (T-224: kein Chat,
   *  kein Demo-Seed-Leak an externe Empfänger). */
  canChat?: boolean
}) {
  const [tab, setTab] = useState(0)
  // Pop-out-Chat-Panel (Gerüst): rechts ausfahrbar, ohne das Leaflet-Popup zu verschieben.
  const [chatOpen, setChatOpen] = useState(false)
  const map = useMap()
  // schwerster Fund bestimmt Pin-Farbe + Position
  const primary = [...group].sort((a, b) => (SEV_RANK[b.severity] ?? 0) - (SEV_RANK[a.severity] ?? 0))[0]
  const active = group.some((f) => f.id === selectedId)
  const eigen = istEigenerEintrag(primary.quelle)
  const pos = geomMidpoint(primary.geom) ?? ([primary.lat, primary.lng] as [number, number])
  const idx = Math.min(tab, group.length - 1)
  const current = group[idx]
  // Roter Punkt am Chat-Button nur bei UNGELESENEN Nachrichten; markSeen() beim Öffnen löscht
  // ihn. Query nur für den aktiven (geöffneten) Marker — sonst feuert sie für jeden Marker.
  const { hasUnread, markSeen } = useFindingChatPresence(current.key ?? current.id, active && canChat)
  // #14: extern (Share) reist der ÖFFENTLICHE Chat mit dem Fund mit → read-only anzeigen, KEINE
  // gegatete API/kein Posten. App-Pfad (canChat) bleibt unverändert.
  const shareChat = current.publicChat
  const showChat = canChat || shareChat !== undefined
  // Zuständigkeits-Kachel: echter Resolver-Kontakt (primary.kontakt) hat Vorrang; sonst auf
  // Autobahn-Funden die GST-Vorschau (s. PREVIEW_GST_KONTAKT). Sonst keine Kachel.
  const kontakt: FindingKontakt | undefined =
    primary.kontakt ??
    (istAutobahnRef(`${primary.strassenRef ?? ""} | ${primary.titel ?? ""}`) ? PREVIEW_GST_KONTAKT : undefined)

  // Ohne endliche Koordinaten keinen Marker setzen: ein [NaN,NaN]-Marker bricht Leaflets
  // Zoom-Animation und lässt andere Marker beim Zoomen verschwinden (spawnen/despawnen).
  if (!Number.isFinite(pos[0]) || !Number.isFinite(pos[1])) return null

  return (
    <Marker
      position={pos}
      icon={findingPinIcon(
        primary.kategorie,
        eigen ? EIGEN_COLOR : SEVERITY_META[primary.severity].marker,
        active,
        primary.detail?.["Schwertransport"] === "gesperrt" ? "fahrverbot" : undefined,
      )}
      eventHandlers={{
        click: () => {
          onSelect?.(primary.id)
          // Marker nach unten-links rücken → Platz oben/rechts fürs Ticket + Chat-Panel,
          // damit das Ticket maximal sichtbar ist. (Leaflet-autoPan ist am Popup aus.)
          const p = map.latLngToContainerPoint(pos)
          const size = map.getSize()
          map.panBy([Math.round(p.x - size.x * 0.3), Math.round(p.y - size.y * 0.8)], {
            animate: true,
          })
        },
      }}
      zIndexOffset={active ? 1000 : 0}
    >
      {/* Normales Schließverhalten (Klick woanders / anderer Marker schließt). Damit Chat-
          Interaktionen das Ticket NICHT schließen, stoppt das Chat-Panel die Klick-Weitergabe
          (es liegt über der Karte). autoPan aus — wir pannen selbst beim Marker-Klick. */}
      <Popup className="fcard-popup" maxWidth={340} minWidth={300} autoPan={false}>
        {/* Vertikaler Stapel: oben die Hauptkarte (Ticket) mit Chat, darunter — wenn ein Kontakt
            vorliegt — die Zuständigkeits-Kachel im selben Design (gap-3 Abstand). Der Chat hängt
            NUR an der Hauptkarte (eigener relative-Container), die Kachel ist ein Geschwister. */}
        <div className="flex w-[300px] max-w-[78vw] flex-col gap-3">
        {/* Wrapper: die Hauptkarte (z-10) bestimmt allein die von Leaflet gemessene Box.
            Geister-Karte + Pop-out-Panel sind position:absolute (out of flow) → kein
            Reposition/Clipping, das Popup bleibt am Marker stehen. */}
        <div className="relative">
          {/* Geister-Karte als Collapsed-Hinweis: schaut rechts minimal hervor (origin-right +
              scale-90 hält die rechte Kante und schiebt sie 8px raus → man sieht, dass dahinter
              etwas ist). Nur an/aus, kein Fade. */}
          {showChat && !chatOpen ? (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 origin-right translate-x-2 scale-90 rounded-xl border border-neutral-200 bg-white shadow-md"
            />
          ) : null}

          {/* Clip-Container rechts der Hauptkarte (z-0 dahinter). overflow-hidden kappt den
              Links-Überstand, wenn das (breitere) Panel hinter der Hauptkarte hervorgeschoben
              wird — so bleibt es eine reine Schiebe-Animation ohne Transparenz. */}
          {/* pointer-events-none am Container → die (unsichtbare) Fläche über der Karte fängt
              die Maus NICHT ab; nur das ausgeklappte Panel selbst ist interaktiv. */}
          {showChat ? (
          <div className="pointer-events-none absolute inset-y-[1.5%] left-[calc(100%-1.25rem)] -right-[27rem] z-0 overflow-hidden">
            {/* ZWEI separate gestapelte Bubbles (mit Luft = gap-2 dazwischen), die mit dem einen
                Plus-Toggle rausfahren: oben die kompakte Kontakt-Bubble, darunter die Chat-Bubble.
                Jede Bubble fährt EIGENSTÄNDIG (leichter Versatz über delay) — kein gemeinsamer
                Kasten mehr. pl-9 hält sie rechts neben der Hauptkarte; overflow-hidden des
                Eltern-Containers blendet sie im Ruhezustand sauber aus. */}
            <div
              id={`finding-chat-${primary.id}`}
              role="region"
              aria-label="Kontakt & Chat"
              aria-hidden={!chatOpen}
              // Klicks NICHT zur Karte durchreichen → Senden/Kontakt schließt das Ticket nicht.
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === "Escape") setChatOpen(false)
              }}
              className={cn(
                "flex h-full w-[420px] flex-col gap-2 pl-9",
                chatOpen ? "pointer-events-auto" : "pointer-events-none",
              )}
            >
              {/* Bubble 1: Kontakt — eigene kleine Karte, fährt zuerst raus. */}
              {kontakt ? (
                <div
                  className={cn(
                    "shrink-0 transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] will-change-transform",
                    chatOpen ? "translate-x-0" : "-translate-x-[160%]",
                  )}
                >
                  <FindingContactCard kontakt={kontakt} compact />
                </div>
              ) : null}
              {/* Bubble 2: Chat — eigene Karte, fährt minimal später raus (separat). */}
              <div
                className={cn(
                  "flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-xl",
                  "transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] will-change-transform",
                  chatOpen ? "translate-x-0 delay-75" : "-translate-x-[160%]",
                )}
              >
                {shareChat ? (
                  <ShareChatReadonly messages={shareChat} />
                ) : (
                  <FindingChatPanel findingKey={current.key ?? current.id} obstacleId={current.obstacleId} />
                )}
              </div>
            </div>
          </div>
          ) : null}

          {/* Hauptkarte — bestimmt die Leaflet-Box. min-h hält eine angenehme Mindesthöhe,
              max-h + scroll fängt langen Inhalt ab. flex-col, damit die FindingCard (flex-1)
              die Mindesthöhe füllt und ihre Stammdaten/Fußzeile nach unten schiebt. */}
          <div className="relative z-10 flex max-h-[60vh] min-h-[20rem] w-[300px] max-w-[78vw] flex-col overflow-y-auto rounded-xl border border-neutral-200 bg-white p-3 shadow-xl">
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

          {/* Chat-Button auf der rechten Kante (Sibling des Wrappers, NICHT im Scroll-Div) —
              öffnet/schließt das Chat-Panel. Rote Markierung bei Einträgen. */}
          {showChat ? (
          <button
            type="button"
            aria-expanded={chatOpen}
            aria-controls={`finding-chat-${primary.id}`}
            aria-label={chatOpen ? "Kontakt & Chat schließen" : "Kontakt & Chat öffnen"}
            title={chatOpen ? "Kontakt & Chat schließen" : "Kontakt & Chat öffnen"}
            onClick={() => {
              if (!chatOpen) markSeen()
              setChatOpen((o) => !o)
            }}
            className={cn(
              "absolute right-0 top-1/2 z-20 flex h-7 w-7 -translate-y-1/2 translate-x-1/2 items-center justify-center rounded-full border shadow-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-1",
              chatOpen
                ? "border-primary-300 bg-primary-50 text-primary-600"
                : "border-neutral-200 bg-white text-neutral-500 hover:text-primary-600",
            )}
          >
            <Plus className={cn("h-4 w-4 transition-transform duration-200", chatOpen && "rotate-45")} />
            {hasUnread ? (
              <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-red-500" />
            ) : null}
          </button>
          ) : null}
        </div>

        {/* Zuständigkeit liegt jetzt als kompakte Karte oben im Aufklapp-Panel (über dem Chat),
            nicht mehr als separate Dauer-Kachel → Ruhezustand kompakt. */}
        </div>
      </Popup>
    </Marker>
  )
}

export const FindingMarker = memo(FindingMarkerImpl)
