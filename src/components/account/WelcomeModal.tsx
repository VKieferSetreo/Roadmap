// Willkommens-/Erfolgs-Screen beim Erst-Login (T-487). Sichtbarkeit + Persistenz steuert der
// Aufrufer via @/lib/welcome (needsWelcome/markWelcomeSeen).

import { MapPinned, Route, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/Button"
import { markWelcomeSeen } from "@/lib/welcome"

export function WelcomeModal({ email, onClose }: { email: string | null; onClose: () => void }) {
  const dismiss = () => {
    markWelcomeSeen(email)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-neutral-900/50 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-50 text-primary-700">
            <Route className="h-5 w-5" />
          </span>
          <h2 className="text-lg font-bold text-neutral-900">Willkommen bei der Setreo Roadmap</h2>
        </div>
        <p className="text-sm leading-relaxed text-neutral-700">
          Schön, dass Sie da sind. Die Roadmap plant Schwertransport-Routen und prüft sie automatisch
          gegen Baustellen, Brücken, Höhen- und Gewichtsbeschränkungen aus behördlichen Datenquellen.
        </p>
        <ul className="mt-4 space-y-2.5 text-sm text-neutral-700">
          <li className="flex items-start gap-2.5">
            <Route className="mt-0.5 h-4 w-4 shrink-0 text-primary-600" />
            <span>Strecke per Datei, Google-Maps-Link oder Start/Ziel anlegen.</span>
          </li>
          <li className="flex items-start gap-2.5">
            <MapPinned className="mt-0.5 h-4 w-4 shrink-0 text-primary-600" />
            <span>Hindernisse und Auflagen erscheinen direkt auf der Karte.</span>
          </li>
          <li className="flex items-start gap-2.5">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary-600" />
            <span>Ergebnisse als PDF oder CSV exportieren und teilen.</span>
          </li>
        </ul>
        <div className="mt-6 flex justify-end">
          <Button onClick={dismiss}>Los geht&apos;s</Button>
        </div>
      </div>
    </div>
  )
}
