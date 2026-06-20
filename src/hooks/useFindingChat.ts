// Baustellen-Chat pro Fund — zwei Scopes:
//  - 'public'   = DB-weit sichtbar (alle Mandanten), Organisation des Autors sichtbar.
//  - 'internal' = nur eigener Mandant, ohne Organisation.
// LIVE (Backend erreichbar): react-query gegen /api/finding-chat.
// DEMO (kein Backend): modul-lokaler In-Memory-Store, je Fund lazy mit Beispielen geseedet.

import { useCallback, useMemo, useState, useSyncExternalStore } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { api } from "@/api/roadmap"
import { useAuthStore } from "@/store/auth"
import { useDataSourceStore } from "@/store/datasource"
import type { FindingChatContact, FindingChatMessage } from "@/types/domain"

/** Eingabe für eine Kontaktdaten-Karte (note → body der Nachricht). */
export interface ContactInput {
  name?: string
  email?: string
  phone?: string
  note?: string
}

export interface UseFindingChatResult {
  messages: FindingChatMessage[]
  send: (body: string) => Promise<void>
  sendContact: (c: ContactInput) => Promise<void>
  loading: boolean
  canPost: boolean
}

// ── DEMO-Store ────────────────────────────────────────────────────────────────
// Map-Key = `${findingKey}|${scope}`. Re-Render via externem Listener-Set.
// Feste ISO-Literale als Seed-Zeitstempel — KEINE Laufzeit-Zeitfunktion im Modul-Top-Level.

type ChatKey = `${string}|public` | `${string}|internal`

const demoStore = new Map<string, FindingChatMessage[]>()
const listeners = new Set<() => void>()
let demoSeq = 0

function emit() {
  for (const l of listeners) l()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function chatKey(findingKey: string, scope: "public" | "internal"): ChatKey {
  return `${findingKey}|${scope}` as ChatKey
}

/** Liefert (und seedet beim ersten Zugriff) die Demo-Nachrichten eines Funds + Scopes. */
function ensureDemoSeed(findingKey: string, scope: "public" | "internal"): FindingChatMessage[] {
  const key = chatKey(findingKey, scope)
  const existing = demoStore.get(key)
  if (existing) return existing

  const seeded: FindingChatMessage[] =
    scope === "public"
      ? [
          {
            id: `demo-${key}-1`,
            findingKey,
            scope,
            authorEmail: "disponent@huber-schwertransporte.de",
            organisation: "Huber Schwertransporte GmbH",
            body: "Wir hatten hier letzte Woche eine Genehmigung — Umfahrung über die L121 hat gut funktioniert.",
            kind: "text",
            contact: null,
            createdAt: "2026-06-10T08:42:00.000Z",
            mine: false,
          },
          {
            id: `demo-${key}-2`,
            findingKey,
            scope,
            authorEmail: "planung@nordkran-logistik.de",
            organisation: "Nordkran Logistik AG",
            body: "Danke für den Hinweis. Gilt die Sperrung auch nachts oder nur tagsüber?",
            kind: "text",
            contact: null,
            createdAt: "2026-06-12T14:05:00.000Z",
            mine: false,
          },
        ]
      : [
          {
            id: `demo-${key}-1`,
            findingKey,
            scope,
            authorEmail: "kollege@setreo.de",
            body: "Intern notiert: Vor Ort am Montag geprüft, Begleitfahrzeug ist eingeplant.",
            kind: "text",
            contact: null,
            createdAt: "2026-06-11T09:15:00.000Z",
            mine: false,
          },
          {
            id: `demo-${key}-contact-1`,
            findingKey,
            scope,
            authorEmail: "kollege@setreo.de",
            body: "Zuständige Behörde — Rückruf am Dienstag vereinbart.",
            kind: "contact",
            contact: {
              name: "Straßenbauamt Lüneburg, Hr. Meyer",
              email: "genehmigung@sba-lueneburg.de",
              phone: "+49 4131 123456",
            },
            createdAt: "2026-06-11T11:30:00.000Z",
            mine: false,
          },
        ]

  demoStore.set(key, seeded)
  return seeded
}

function appendDemoMessage(
  findingKey: string,
  scope: "public" | "internal",
  email: string,
  body: string,
  kind: "text" | "contact" = "text",
  contact: FindingChatContact | null = null,
) {
  const key = chatKey(findingKey, scope)
  const list = ensureDemoSeed(findingKey, scope)
  demoSeq += 1
  const msg: FindingChatMessage = {
    id: `demo-${key}-new-${demoSeq}`,
    findingKey,
    scope,
    authorEmail: email,
    organisation: scope === "public" ? "Setreo" : null,
    body,
    kind,
    contact,
    // Demo: deterministische, aber plausible Zeitangabe relativ zum Klick (Laufzeit ist hier ok —
    // wir sind im Event-Handler, nicht im Modul-Top-Level).
    createdAt: new Date().toISOString(),
    mine: true,
  }
  demoStore.set(key, [...list, msg])
  emit()
}

/** Neuester createdAt-ISO über beide Demo-Scopes eines Funds (null = keine Nachrichten). */
function demoLatest(findingKey: string): string | null {
  let latest: string | null = null
  for (const scope of ["public", "internal"] as const) {
    for (const m of demoStore.get(chatKey(findingKey, scope)) ?? []) {
      if (!latest || m.createdAt > latest) latest = m.createdAt
    }
  }
  return latest
}

function useDemoMessages(findingKey: string, scope: "public" | "internal"): FindingChatMessage[] {
  const key = chatKey(findingKey, scope)
  // Snapshot muss referenzstabil sein (sonst Endlosschleife) → Seed einmalig, dann Map-Referenz.
  const getSnapshot = useCallback(() => {
    const existing = demoStore.get(key)
    if (existing) return existing
    return ensureDemoSeed(findingKey, scope)
  }, [key, findingKey, scope])
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

/** Chat eines Funds in einem Scope. LIVE → react-query, DEMO → In-Memory-Store. */
export function useFindingChat(
  findingKey: string,
  scope: "public" | "internal",
): UseFindingChatResult {
  const live = useDataSourceStore((s) => s.mode) === "live"
  const identity = useAuthStore((s) => s.identity)
  const qc = useQueryClient()

  // — LIVE —
  const query = useQuery({
    queryKey: ["finding-chat", findingKey, scope],
    queryFn: () => api.findingChat.list(findingKey, scope),
    enabled: live && !!findingKey,
    staleTime: 10_000,
  })

  const mutation = useMutation({
    mutationFn: (payload: {
      body?: string
      kind?: "text" | "contact"
      contact?: FindingChatContact
    }) => api.findingChat.post(findingKey, scope, payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["finding-chat", findingKey, scope] })
      void qc.invalidateQueries({ queryKey: ["finding-chat-presence", findingKey] })
    },
    // T-234: Senden darf nicht still scheitern — Nachricht behalten (Composer leert nicht).
    onError: () => toast.error("Nachricht konnte nicht gesendet werden — bitte erneut versuchen."),
  })

  // — DEMO —
  const demoMessages = useDemoMessages(findingKey, scope)
  const email = identity?.email ?? "demo@setreo.de"

  const sendLive = useCallback(
    async (body: string) => {
      await mutation.mutateAsync({ body })
    },
    [mutation],
  )

  const sendDemo = useCallback(
    async (body: string) => {
      appendDemoMessage(findingKey, scope, email, body)
    },
    [findingKey, scope, email],
  )

  const sendContactLive = useCallback(
    async (c: ContactInput) => {
      await mutation.mutateAsync({
        kind: "contact",
        contact: { name: c.name, email: c.email, phone: c.phone },
        body: c.note,
      })
    },
    [mutation],
  )

  const sendContactDemo = useCallback(
    async (c: ContactInput) => {
      appendDemoMessage(findingKey, scope, email, c.note ?? "", "contact", {
        name: c.name,
        email: c.email,
        phone: c.phone,
      })
    },
    [findingKey, scope, email],
  )

  if (live) {
    return {
      messages: query.data ?? [],
      send: sendLive,
      sendContact: sendContactLive,
      loading: query.isLoading,
      canPost: !!identity,
    }
  }
  return {
    messages: demoMessages,
    send: sendDemo,
    sendContact: sendContactDemo,
    loading: false,
    canPost: true,
  }
}

/** localStorage-Key für den zuletzt gesehenen Zeitstempel eines Fund-Chats. */
function seenKey(findingKey: string): string {
  return `finding-chat-seen:${findingKey}`
}

function readSeen(findingKey: string): string | null {
  try {
    return localStorage.getItem(seenKey(findingKey))
  } catch {
    return null
  }
}

/** Ungelesen-Indikator (roter Punkt) für einen Fund-Chat — vergleicht den neuesten Zeitstempel
 *  (LIVE: presence.latest, DEMO: neueste createdAt über beide Scopes) gegen einen pro Fund in
 *  localStorage gemerkten lastSeen. markSeen() (beim Öffnen des Chats) setzt lastSeen=latest.
 *  `enabled` gaten, damit die presence-Query NICHT für jeden Marker der Karte feuert, sondern
 *  nur für den geöffneten/aktiven (sonst N Queries pro Kartenladen). */
export function useFindingChatPresence(
  findingKey: string,
  enabled = true,
): { hasUnread: boolean; markSeen: () => void } {
  const live = useDataSourceStore((s) => s.mode) === "live"
  // lastSeen als State, damit markSeen() ein Re-Render auslöst (Punkt verschwindet sofort).
  const [lastSeen, setLastSeen] = useState<string | null>(() => readSeen(findingKey))

  const query = useQuery({
    queryKey: ["finding-chat-presence", findingKey],
    queryFn: () => api.findingChat.presence(findingKey),
    enabled: live && !!findingKey && enabled,
    staleTime: 30_000,
  })

  // DEMO: an beide Scopes abonnieren, damit demoLatest() bei neuen Nachrichten neu rendert.
  const demoPublic = useDemoMessages(findingKey, "public")
  const demoInternal = useDemoMessages(findingKey, "internal")

  const latest = useMemo<string | null>(() => {
    if (live) return query.data?.latest ?? null
    void demoPublic
    void demoInternal
    return demoLatest(findingKey)
  }, [live, query.data, findingKey, demoPublic, demoInternal])

  const hasUnread = !!enabled && !!latest && (!lastSeen || latest > lastSeen)

  const markSeen = useCallback(() => {
    if (!latest) return
    try {
      localStorage.setItem(seenKey(findingKey), latest)
    } catch {
      /* localStorage nicht verfügbar — Unread bleibt rein in-memory */
    }
    setLastSeen(latest)
  }, [findingKey, latest])

  return { hasUnread, markSeen }
}
