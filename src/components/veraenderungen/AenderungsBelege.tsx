// Die letzten Änderungen im Klartext (T-760).
//
// Max, 22.09.2026: "Fix das bitte das es jetzt den stand ist zieht und dann auch systematisch
// tracked wenn solche beispiele kommen das selbe baustelle anders behandelt wird."
//
// Eine Kopfzahl ohne Belege lässt sich nicht prüfen — genau deshalb fiel erst Max auf, dass
// 381 Änderungen nicht stimmen können. Diese Liste zeigt für jede gezählte Änderung, welches
// Feld sich von welchem Wert auf welchen bewegt hat.

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card"
import type { VeraenderungenUebersicht } from "@/api/roadmap"
import { formatDateDE } from "@/lib/format"
import { AMPEL } from "@/lib/ampel"

const FELD_LABEL: Record<string, string> = {
  gueltigBis: "Ende",
  restbreiteM: "Restbreite",
  maxHoeheM: "Durchfahrtshöhe",
  maxBreiteM: "Durchfahrtsbreite",
  maxGewichtT: "Gewichtsgrenze",
  maxAchslastT: "Achslast",
  maxLaengeM: "Länge",
  bezugsgewichtT: "Bezugsgewicht",
  verkehrsverbotLkwT: "Lkw-Verbot ab",
  vollsperrung: "Vollsperrung",
  halbseitig: "Halbseitige Sperrung",
  grundsaetzlicheGstSperre: "GST-Sperre",
  gesperrtKomplett: "Komplett gesperrt",
}

/** Ein Wert so, wie ein Mensch ihn liest. */
function wert(v: unknown): string {
  if (v == null) return "keine Angabe"
  if (typeof v === "boolean") return v ? "ja" : "nein"
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) return formatDateDE(v)
  return String(v)
}

export function AenderungsBelege({ belege }: { belege: VeraenderungenUebersicht["belege"] }) {
  if (!belege?.length) return null
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Was sich zuletzt geändert hat</CardTitle>
        <p className="text-xs text-neutral-400">
          Jede gezählte Änderung mit dem Feld, das die Quelle bewegt hat. Was wir selbst an den
          Daten ableiten, zählt nicht mit.
        </p>
      </CardHeader>
      <CardContent className="pt-2">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-xs text-neutral-500">
                <th className="pb-2 pr-3 font-medium">Tag</th>
                <th className="pb-2 pr-3 font-medium">Stelle</th>
                <th className="pb-2 font-medium">Änderung</th>
              </tr>
            </thead>
            <tbody>
              {belege.map((b, i) => (
                <tr key={`${b.tag}-${b.name}-${i}`} className="border-b border-neutral-100 last:border-0 align-top">
                  <td className="whitespace-nowrap py-2 pr-3 text-neutral-500">{formatDateDE(b.tag)}</td>
                  <td className="py-2 pr-3">
                    <span className="font-medium text-neutral-800">{b.strassenRef || "ohne Kennzeichen"}</span>
                    {b.name ? <span className="block text-xs text-neutral-500">{b.name}</span> : null}
                  </td>
                  <td className="py-2">
                    {Object.entries(b.aenderung).map(([feld, [alt, neu]]) => (
                      <span key={feld} className="block">
                        {FELD_LABEL[feld] ?? feld}{" "}
                        <span className="text-neutral-500">{wert(alt)}</span>
                        {" → "}
                        <span className="font-medium" style={{ color: AMPEL.rot }}>{wert(neu)}</span>
                      </span>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}
