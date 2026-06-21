// #14: Read-only-Ansicht des ÖFFENTLICHEN Fund-Chats für externe Share-Empfänger. Nur lesen —
// kein Eingabefeld, kein interner Scope. Nachrichten kommen vorab mit der Share-Payload (finding.publicChat).

import { Lock, MessageCircle, Phone, User } from "lucide-react"
import type { FindingChatMessage } from "@/types/domain"

const fmt = (iso: string) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })
}

export function ShareChatReadonly({ messages }: { messages: FindingChatMessage[] }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-neutral-100 px-3 py-2.5">
        <MessageCircle className="h-4 w-4 text-primary-600" />
        <span className="text-sm font-semibold text-neutral-900">Öffentlicher Chat</span>
        <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-500">
          <Lock className="h-3 w-3" /> nur lesen
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2.5">
        {messages.length === 0 ? (
          <p className="py-10 text-center text-sm text-neutral-400">Noch keine öffentlichen Nachrichten.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {messages.map((m) => (
              <li key={m.id} className="rounded-lg border border-neutral-100 bg-neutral-50 px-3 py-2">
                <div className="mb-1 flex items-center justify-between gap-2 text-[11px] text-neutral-400">
                  <span className="font-medium text-neutral-600">{m.organisation || "Öffentlich"}</span>
                  <span className="tabular-nums">{fmt(m.createdAt)}</span>
                </div>
                {m.kind === "contact" && m.contact ? (
                  <div className="flex flex-col gap-0.5 text-sm text-neutral-700">
                    {m.contact.name ? (
                      <span className="flex items-center gap-1.5"><User className="h-3.5 w-3.5 text-neutral-400" />{m.contact.name}</span>
                    ) : null}
                    {m.contact.phone ? (
                      <span className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5 text-neutral-400" />{m.contact.phone}</span>
                    ) : null}
                    {m.contact.email ? <span className="pl-5 text-neutral-500">{m.contact.email}</span> : null}
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap text-sm text-neutral-700">{m.body}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
