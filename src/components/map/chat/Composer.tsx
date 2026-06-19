// Eingabe-Composer eines Baustellen-Chats. Autohöhe-Textarea (rows=1, max-h) + Senden-Button.
// Enter sendet, Shift+Enter macht einen Zeilenumbruch. Nach erfolgreichem Senden wird das Feld
// geleert. Bei disabled (nicht angemeldet) sind Feld + Button gesperrt und ein Hinweis erscheint.
// Leere/whitespace-only Eingaben werden nicht gesendet.
// Zusätzlich: runder Personen-Button öffnet ein kompaktes Kontaktformular (Name/E-Mail/Telefon/
// Notiz) für eine Kontaktdaten-Karte (z.B. die kontaktierte Behörde) — Submit ruft onSendContact.

import { useState } from "react"
import { Send, UserPlus } from "lucide-react"
import { cn } from "@/lib/cn"
import type { ContactInput } from "@/hooks/useFindingChat"

export function Composer({
  onSend,
  onSendContact,
  disabled,
  scope,
}: {
  onSend: (body: string) => Promise<void>
  onSendContact: (c: ContactInput) => Promise<void>
  disabled?: boolean
  scope: "public" | "internal"
}) {
  const [body, setBody] = useState("")
  const [sending, setSending] = useState(false)

  // Kontaktformular (aufklappender Bereich über dem Composer)
  const [contactOpen, setContactOpen] = useState(false)
  const [cName, setCName] = useState("")
  const [cEmail, setCEmail] = useState("")
  const [cPhone, setCPhone] = useState("")
  const [cNote, setCNote] = useState("")

  const canSend = !disabled && !sending && body.trim().length > 0
  // Mindestens ein Kontaktfeld (Name/E-Mail/Telefon) muss gesetzt sein.
  const hasContactField = !!(cName.trim() || cEmail.trim() || cPhone.trim())
  const canSendContact = !disabled && !sending && hasContactField

  async function submit() {
    if (!canSend) return
    setSending(true)
    try {
      await onSend(body.trim())
      setBody("")
    } finally {
      setSending(false)
    }
  }

  function resetContact() {
    setCName("")
    setCEmail("")
    setCPhone("")
    setCNote("")
    setContactOpen(false)
  }

  async function submitContact() {
    if (!canSendContact) return
    setSending(true)
    try {
      await onSendContact({
        name: cName.trim() || undefined,
        email: cEmail.trim() || undefined,
        phone: cPhone.trim() || undefined,
        note: cNote.trim() || undefined,
      })
      resetContact()
    } finally {
      setSending(false)
    }
  }

  if (disabled) {
    return (
      <div className="border-t border-neutral-100 p-2 text-center text-[11px] text-neutral-400">
        Zum Schreiben anmelden
      </div>
    )
  }

  return (
    <div className="border-t border-neutral-100">
      {/* Aufklappendes Kontaktformular über dem Composer */}
      {contactOpen && (
        <div className="flex flex-col gap-2 border-b border-neutral-100 bg-neutral-50 p-2.5">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-neutral-600">
            <UserPlus className="h-3.5 w-3.5" />
            Kontaktdaten hinzufügen
          </div>
          <input
            value={cName}
            disabled={sending}
            onChange={(e) => setCName(e.target.value)}
            placeholder="Name / Stelle (z.B. Straßenbauamt, Hr. Meyer)"
            className="rounded-md border border-neutral-200 bg-white px-2.5 py-1.5 text-xs text-neutral-800 placeholder:text-neutral-400 focus:border-primary-400 focus:outline-none"
          />
          <input
            value={cEmail}
            disabled={sending}
            type="email"
            onChange={(e) => setCEmail(e.target.value)}
            placeholder="E-Mail"
            className="rounded-md border border-neutral-200 bg-white px-2.5 py-1.5 text-xs text-neutral-800 placeholder:text-neutral-400 focus:border-primary-400 focus:outline-none"
          />
          <input
            value={cPhone}
            disabled={sending}
            type="tel"
            onChange={(e) => setCPhone(e.target.value)}
            placeholder="Telefon"
            className="rounded-md border border-neutral-200 bg-white px-2.5 py-1.5 text-xs text-neutral-800 placeholder:text-neutral-400 focus:border-primary-400 focus:outline-none"
          />
          <textarea
            rows={2}
            value={cNote}
            disabled={sending}
            onChange={(e) => setCNote(e.target.value)}
            placeholder="Kurze Notiz (optional)"
            className="resize-none rounded-md border border-neutral-200 bg-white px-2.5 py-1.5 text-xs text-neutral-800 placeholder:text-neutral-400 focus:border-primary-400 focus:outline-none"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={resetContact}
              disabled={sending}
              className="rounded-md px-2.5 py-1 text-[11px] font-medium text-neutral-500 hover:text-neutral-700"
            >
              Abbrechen
            </button>
            <button
              type="button"
              onClick={() => void submitContact()}
              disabled={!canSendContact}
              className={cn(
                "rounded-md bg-primary-600 px-3 py-1 text-[11px] font-medium text-white transition-opacity",
                canSendContact ? "opacity-100 hover:bg-primary-700" : "cursor-not-allowed opacity-40",
              )}
            >
              Hinzufügen
            </button>
          </div>
        </div>
      )}

      <div className="flex items-end gap-2 p-2">
        {/* Runder Personen-Button — öffnet/schließt das Kontaktformular */}
        <button
          type="button"
          onClick={() => setContactOpen((o) => !o)}
          disabled={sending}
          aria-label="Kontaktdaten hinzufügen"
          title="Kontaktdaten hinzufügen"
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition-colors",
            contactOpen
              ? "border-primary-300 bg-primary-50 text-primary-700"
              : "border-neutral-200 bg-white text-neutral-500 hover:bg-neutral-50 hover:text-neutral-700",
            sending && "cursor-not-allowed opacity-40",
          )}
        >
          <UserPlus className="h-4 w-4" />
        </button>
        <textarea
          rows={1}
          value={body}
          disabled={sending}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault()
              void submit()
            }
          }}
          placeholder={scope === "public" ? "Öffentlich antworten …" : "Intern antworten …"}
          className="max-h-24 min-h-9 flex-1 resize-none rounded-md border border-neutral-200 bg-white px-2.5 py-1.5 text-xs text-neutral-800 placeholder:text-neutral-400 focus:border-primary-400 focus:outline-none disabled:cursor-not-allowed disabled:bg-neutral-50"
        />
        <button
          type="button"
          onClick={() => void submit()}
          disabled={!canSend}
          aria-label="Senden"
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary-600 text-white transition-opacity",
            canSend ? "opacity-100 hover:bg-primary-700" : "cursor-not-allowed opacity-40",
          )}
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
