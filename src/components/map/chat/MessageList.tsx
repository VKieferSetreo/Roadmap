// Nachrichtenliste eines Baustellen-Chats (ein scope). Pro Eintrag: farbiger Initialen-Avatar
// mit Hover-Profil-Popover (E-Mail + Organisation nur bei public), Bubble mit Body und kompaktem
// Zeitstempel. Eigene Nachrichten (mine) rechtsbündig in eigener Bubble-Farbe.
// kind='contact' rendert eine Kontaktdaten-Karte (Name + mailto/tel + optionale Notiz).
// ponytail: Avatar + Popover leben inline hier, keine Extra-Datei.

import { useEffect, useRef } from "react"
import { Mail, Phone, UserRound } from "lucide-react"
import { cn } from "@/lib/cn"
import type { FindingChatMessage } from "@/types/domain"

// Kompakter de-DE-Zeitstempel (Tag.Monat, Stunde:Minute) — Intl ist erlaubt.
const fmtTime = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
})

// Kürzel aus dem lokalen Teil der E-Mail: an [._-] splitten, erste Buchstaben der ersten zwei
// Segmente; sonst erste 2 Zeichen. Immer Großbuchstaben.
function initials(email: string): string {
  const local = (email.split("@")[0] || email).trim()
  const segs = local.split(/[._-]+/).filter(Boolean)
  const raw =
    segs.length >= 2 ? segs[0][0] + segs[1][0] : local.slice(0, 2)
  return raw.toUpperCase() || "?"
}

// Deterministische Avatar-Farbe aus E-Mail-Hash — gleiche E-Mail = gleiche Farbe.
const AVATAR_COLORS = [
  "bg-rose-500",
  "bg-orange-500",
  "bg-amber-500",
  "bg-emerald-500",
  "bg-teal-500",
  "bg-sky-500",
  "bg-indigo-500",
  "bg-violet-500",
  "bg-fuchsia-500",
  "bg-pink-500",
]

function avatarColor(email: string): string {
  let h = 0
  for (let i = 0; i < email.length; i++) {
    h = (h * 31 + email.charCodeAt(i)) | 0
  }
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}

export function MessageList({
  messages,
  scope,
  loading,
}: {
  messages: FindingChatMessage[]
  scope: "public" | "internal"
  loading: boolean
}) {
  // Bei neuen Nachrichten (und Scope-Wechsel) ans Ende scrollen — block:'nearest' bewegt nur
  // den Scroll-Container, nicht die ganze Seite.
  const bottomRef = useRef<HTMLLIElement>(null)
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "nearest" })
  }, [messages.length, scope])

  if (loading && messages.length === 0) {
    return (
      <p className="px-1 py-6 text-center text-xs text-neutral-400">Lädt …</p>
    )
  }

  if (messages.length === 0) {
    return (
      <p className="px-1 py-6 text-center text-xs leading-relaxed text-neutral-400">
        Noch keine Einträge.
        <br />
        Hier entsteht der {scope === "public" ? "öffentliche" : "interne"} Chat zur Baustelle.
      </p>
    )
  }

  return (
    <ul className="flex flex-col gap-5">
      {messages.map((m) => {
        const ts = new Date(m.createdAt)
        return (
          <li
            key={m.id}
            className={cn("flex items-start gap-3", m.mine && "flex-row-reverse")}
          >
            {/* Avatar mit Hover-Profil-Popover */}
            <div className="group relative shrink-0">
              <div
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-semibold text-white",
                  avatarColor(m.authorEmail),
                )}
              >
                {initials(m.authorEmail)}
              </div>
              <div
                className={cn(
                  "pointer-events-none absolute top-8 z-30 hidden w-max max-w-[200px] rounded-md border border-neutral-200 bg-white px-2.5 py-1.5 text-[11px] shadow-lg group-hover:block",
                  m.mine ? "right-0" : "left-0",
                )}
              >
                <p className="font-medium text-neutral-800 break-words">{m.authorEmail}</p>
                {scope === "public" && m.organisation && (
                  <p className="mt-0.5 text-neutral-500 break-words">{m.organisation}</p>
                )}
              </div>
            </div>

            {/* Bubble + Meta */}
            <div className={cn("flex min-w-0 flex-col gap-1.5", m.mine && "items-end")}>
              {scope === "public" && m.organisation && (
                <span className="px-1 text-[10px] text-neutral-400 break-words">
                  {m.organisation}
                </span>
              )}
              {m.kind === "contact" ? (
                <ContactCard m={m} />
              ) : (
                <div
                  className={cn(
                    "max-w-full rounded-lg px-2.5 py-2 text-xs leading-relaxed whitespace-pre-line break-words",
                    m.mine ? "bg-primary-50 text-primary-900" : "bg-neutral-100 text-neutral-800",
                  )}
                >
                  {m.body}
                </div>
              )}
              <span className="px-1 text-[10px] text-neutral-400">{fmtTime.format(ts)}</span>
            </div>
          </li>
        )
      })}
      {/* Scroll-Anker: hält den Chat am unteren Ende, wenn neue Nachrichten kommen. */}
      <li ref={bottomRef} aria-hidden className="h-0" />
    </ul>
  )
}

/** Kontaktdaten-Karte (kind='contact'): Personen-Icon + Name fett, darunter Mail (mailto) +
 *  Tel (tel:) + optionale Notiz (body). */
function ContactCard({ m }: { m: FindingChatMessage }) {
  const c = m.contact ?? {}
  return (
    <div
      className={cn(
        "max-w-full rounded-lg border px-3 py-2.5 text-xs break-words",
        m.mine ? "border-primary-200 bg-primary-50" : "border-neutral-200 bg-white",
      )}
    >
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
            m.mine ? "bg-primary-100 text-primary-700" : "bg-neutral-100 text-neutral-600",
          )}
        >
          <UserRound className="h-3.5 w-3.5" />
        </span>
        <span className="min-w-0 break-words font-semibold text-neutral-800">
          {c.name || "Kontakt"}
        </span>
      </div>
      {(c.email || c.phone) && (
        <div className="mt-2 flex flex-col gap-1.5">
          {c.email && (
            <a
              href={`mailto:${c.email}`}
              className="flex items-center gap-1.5 text-primary-700 hover:underline break-all"
            >
              <Mail className="h-3.5 w-3.5 shrink-0" />
              {c.email}
            </a>
          )}
          {c.phone && (
            <a
              href={`tel:${c.phone.replace(/[^+\d]/g, "")}`}
              className="flex items-center gap-1.5 text-primary-700 hover:underline break-all"
            >
              <Phone className="h-3.5 w-3.5 shrink-0" />
              {c.phone}
            </a>
          )}
        </div>
      )}
      {m.body && (
        <p className="mt-2 leading-relaxed whitespace-pre-line text-neutral-600">{m.body}</p>
      )}
    </div>
  )
}
