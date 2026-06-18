// Seat-Code-Einlösung: ein verifizierter externer Nutzer ohne Mandanten-Zuordnung gibt
// hier seinen Seat-Code ein. Erfolg → App neu booten (Kontext hat danach einen Mandanten).
// Ersetzt im AppLayout die "kein Mandant"-Karte für externe Self-Service-Nutzer.

import { useState, type FormEvent } from "react"
import { KeyRound } from "lucide-react"
import { Button } from "@/components/ui/Button"
import { Input, Label } from "@/components/ui/Input"
import { api } from "@/api/roadmap"
import { ApiError } from "@/api/client"

// Backend-Fehlertexte reicht der API-Client nicht durch (er erwartet {code,message},
// das Backend sendet {error}). Wir mappen daher den HTTP-Status auf eine klare Meldung.
const FEHLER: Record<number, string> = {
  400: "Das ist kein gültiger Seat-Code. Bitte prüfen Sie die Eingabe.",
  403: "Die Lizenz dieses Mandanten ist abgelaufen. Bitte wenden Sie sich an Setreo.",
  404: "Dieser Seat-Code ist unbekannt.",
  409: "Dieser Seat-Code wurde bereits eingelöst, oder Ihr Konto ist bereits einem Mandanten zugeordnet.",
}

export function RedeemSeat({ email }: { email: string }) {
  const [code, setCode] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const trimmed = code.trim()
    if (!trimmed || busy) return
    setBusy(true)
    setError(null)
    try {
      await api.account.redeemSeat(trimmed)
      // Erfolg → App neu booten; der Kontext lädt danach mit zugeordnetem Mandanten.
      window.location.reload()
    } catch (err) {
      const status = err instanceof ApiError ? err.status : 0
      setError(FEHLER[status] ?? "Einlösung fehlgeschlagen. Bitte später erneut versuchen.")
      setBusy(false)
    }
  }

  return (
    <div className="flex h-full items-center justify-center px-4">
      <div className="w-full max-w-md rounded-xl border border-neutral-200 bg-white p-8 shadow-card">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-accent-100">
          <KeyRound className="h-6 w-6 text-accent-700" />
        </div>
        <h1 className="text-center text-lg font-bold text-neutral-900">Zugang freischalten</h1>
        <p className="mt-2 text-center text-sm text-neutral-500">
          Geben Sie Ihren Seat-Code ein, um Ihr Konto{" "}
          <span className="font-medium text-neutral-700">{email}</span> Ihrem Mandanten zuzuordnen.
        </p>
        <form onSubmit={submit} className="mt-6">
          <Label htmlFor="seatcode">Seat-Code</Label>
          <Input
            id="seatcode"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoFocus
            autoComplete="off"
            placeholder="XXXX-XXXX-XXXX"
            className="h-11 text-center font-mono text-lg uppercase tracking-widest"
          />
          {error ? (
            <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
              {error}
            </p>
          ) : null}
          <Button type="submit" loading={busy} disabled={!code.trim()} className="mt-5 w-full">
            Freischalten
          </Button>
        </form>
        <p className="mt-5 border-t border-neutral-100 pt-4 text-center text-xs text-neutral-400">
          Den Seat-Code erhalten Sie von Ihrem Setreo-Ansprechpartner.
        </p>
      </div>
    </div>
  )
}
