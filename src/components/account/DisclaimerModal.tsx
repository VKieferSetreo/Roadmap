// Haftungsausschluss: beim Erst-Login blockierend (mode="accept", pro Person + Version),
// jederzeit in den Einstellungen erneut ansehbar (mode="view"). Text = reine Anzeige,
// die akzeptierte Version trackt das Backend (disclaimer_acceptances).

import { ShieldAlert } from "lucide-react"
import { Button } from "@/components/ui/Button"

export function DisclaimerContent() {
  return (
    <div className="space-y-3 text-sm leading-relaxed text-neutral-700">
      <p>
        Die Setreo Roadmap ist eine <strong>Planungshilfe</strong> für Schwertransport-Routen. Die
        angezeigten Hindernisse, Baustellen und Auflagen stammen aus öffentlichen und behördlichen
        Datenquellen und werden <strong>ohne Gewähr</strong> für Vollständigkeit, Richtigkeit und
        Aktualität bereitgestellt.
      </p>
      <p>
        Die <strong>Setreo GmbH</strong> übernimmt keine Haftung für Schäden, die aus der Nutzung
        dieser Daten oder der Planungsergebnisse entstehen. Die Ergebnisse ersetzen keine
        verbindliche behördliche Genehmigung.
      </p>
      <p>
        Verbindliche Transportgenehmigungen, Auflagen und Streckenfreigaben sind ausschließlich bei
        den zuständigen Behörden einzuholen. Die Nutzung erfolgt auf eigene Verantwortung.
      </p>
    </div>
  )
}

export function DisclaimerModal({
  mode,
  busy = false,
  onAccept,
  onClose,
}: {
  mode: "accept" | "view"
  busy?: boolean
  onAccept?: () => void
  onClose?: () => void
}) {
  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-neutral-900/50 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-severity-warnung-bg text-severity-warnung">
            <ShieldAlert className="h-5 w-5" />
          </span>
          <h2 className="text-lg font-bold text-neutral-900">Haftungsausschluss</h2>
        </div>
        <DisclaimerContent />
        <div className="mt-6 flex justify-end gap-2">
          {mode === "view" ? (
            <Button variant="outline" onClick={onClose}>
              Schließen
            </Button>
          ) : (
            <Button onClick={onAccept} loading={busy}>
              Gelesen und akzeptiert
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
