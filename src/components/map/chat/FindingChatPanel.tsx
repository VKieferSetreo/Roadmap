// Pop-out-Panel rechts neben dem Fund-Popup — der Baustellen-Chat zur Baustelle.
// Zwei Chats pro Fund: öffentlich (DB-weit sichtbar, mit Organisation des Autors) und intern
// (nur eigener Mandant, ohne Organisation), jeweils mit Account + Zeitstempel. Tabs schalten
// den scope um, der Hook lädt/postet je scope. Das Panel füllt h-full und scrollt intern —
// Breite bleibt konstant (Container ist overflow-hidden).

import { useState } from "react"
import { cn } from "@/lib/cn"
import { useFindingChat } from "@/hooks/useFindingChat"
import { MessageList } from "./MessageList"
import { Composer } from "./Composer"

type ChatScope = "public" | "internal"

export function FindingChatPanel({
  findingKey,
  obstacleId,
}: {
  /** stabile Fund-Identität (key überlebt Re-Analyse), an die der Chat gebunden wird. */
  findingKey: string
  obstacleId?: string | null
}) {
  // T-448: Default = intern (nur eigener Mandant). „Öffentlich" ist DB-weit sichtbar und muss
  // eine bewusste Wahl sein — sonst landet eine interne Notiz versehentlich bei allen Mandanten.
  const [scope, setScope] = useState<ChatScope>("internal")
  // obstacleId vorerst ungenutzt durchgereicht — Naht für späteres Verknüpfen.
  void obstacleId

  const { messages, send, sendContact, loading, canPost } = useFindingChat(findingKey, scope)

  return (
    <div className="flex h-full flex-col">
      {/* Tab-Köpfe Öffentlich | Intern — gleiches Muster wie die Richtungs-Tabs */}
      <div className="m-2 flex gap-1 rounded-md bg-neutral-100 p-0.5 text-[11px] font-medium">
        {(
          [
            ["public", "Öffentlich"],
            ["internal", "Intern"],
          ] as const
        ).map(([s, label]) => (
          <button
            key={s}
            type="button"
            onClick={() => setScope(s)}
            className={cn(
              "flex-1 rounded px-2 py-1 text-center transition-colors",
              scope === s ? "bg-white text-primary-700 shadow-sm" : "text-neutral-500 hover:text-neutral-700",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* T-448: bei „Öffentlich" deutlich machen, dass dies DB-weit (alle Mandanten) sichtbar ist. */}
      {scope === "public" ? (
        <p className="mx-2 mb-1 rounded bg-amber-50 px-2 py-1 text-[11px] leading-snug text-amber-700">
          Öffentlich: sichtbar für alle Mandanten, inkl. Ihrer Organisation. Intern bleibt nur in Ihrem Mandanten.
        </p>
      ) : null}

      {/* Nachrichtenbereich — scrollt intern, hält das Panel auf konstanter Breite */}
      <div className="flex-1 overflow-y-auto px-3 py-2">
        <MessageList messages={messages} scope={scope} loading={loading} />
      </div>

      {/* Composer — postet je scope (Text + Kontaktdaten-Karte); deaktiviert wenn nicht angemeldet */}
      <Composer onSend={send} onSendContact={sendContact} disabled={!canPost} scope={scope} />
    </div>
  )
}
