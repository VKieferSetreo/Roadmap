// Externe Freigabelinks der Änderungsauswertung. Nur für Admins sichtbar.
//
// Der Token steht ausschließlich in der URL und wird serverseitig nur als Hash gespeichert.
// Deshalb gibt es die fertige Adresse GENAU EINMAL — direkt nach dem Anlegen. Diese Karte
// macht das sichtbar, statt den Nutzer später vergeblich suchen zu lassen.

import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Check, Copy, Link2, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { api } from "@/api/roadmap"
import { formatDateDE } from "@/lib/format"

export function VeraenderungenFreigaben() {
  const qc = useQueryClient()
  const [name, setName] = useState("")
  const [frisch, setFrisch] = useState<{ id: string; url: string } | null>(null)
  const [kopiert, setKopiert] = useState(false)

  const liste = useQuery({
    queryKey: ["veraenderungen-freigaben"],
    queryFn: () => api.veraenderungen.freigaben(),
  })

  const anlegen = useMutation({
    mutationFn: () => api.veraenderungen.freigabeAnlegen({ name: name.trim() || undefined }),
    onSuccess: (f) => {
      setFrisch({ id: f.id, url: f.url })
      setName("")
      setKopiert(false)
      void qc.invalidateQueries({ queryKey: ["veraenderungen-freigaben"] })
    },
    onError: () => toast.error("Link konnte nicht angelegt werden."),
  })

  const widerrufen = useMutation({
    mutationFn: (id: string) => api.veraenderungen.freigabeWiderrufen(id),
    onSuccess: (_r, id) => {
      if (frisch?.id === id) setFrisch(null)
      toast.success("Link widerrufen. Er funktioniert ab sofort nicht mehr.")
      void qc.invalidateQueries({ queryKey: ["veraenderungen-freigaben"] })
    },
    onError: () => toast.error("Widerrufen fehlgeschlagen."),
  })

  async function kopieren(url: string) {
    try {
      await navigator.clipboard.writeText(url)
      setKopiert(true)
      setTimeout(() => setKopiert(false), 2000)
    } catch {
      // Zwischenablage kann blockiert sein (kein sicherer Kontext, Berechtigung verweigert).
      // Die Adresse steht daneben und lässt sich markieren — kein Grund für eine Fehlermeldung.
      toast.info("Bitte die Adresse von Hand kopieren.")
    }
  }

  const aktive = (liste.data?.freigaben ?? []).filter((f) => !f.widerrufen_am)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Link2 className="h-4 w-4 text-primary-600" />
          Externe Freigabe
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-neutral-600">
          Ein Link, der diese Auswertung ohne Anmeldung zeigt: schreibgeschützt, ohne
          Suchmaschinen-Eintrag, jederzeit widerrufbar. Wer den Link hat, sieht die Zahlen.
        </p>

        <div className="flex flex-wrap gap-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Wofür ist der Link? (optional)"
            className="min-w-[200px] flex-1"
            maxLength={120}
          />
          <Button onClick={() => anlegen.mutate()} loading={anlegen.isPending}>
            Link erstellen
          </Button>
        </div>

        {frisch ? (
          <div className="rounded-lg border border-primary-200 bg-primary-50 p-3">
            <p className="mb-2 text-xs font-semibold text-primary-800">
              Diese Adresse wird nur jetzt angezeigt. Später lässt sie sich nicht mehr
              herstellen, nur ersetzen.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <code className="min-w-0 flex-1 break-all rounded bg-white px-2 py-1.5 text-xs text-neutral-800">
                {frisch.url}
              </code>
              <Button size="sm" variant="outline" onClick={() => void kopieren(frisch.url)}>
                {kopiert ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                <span className="ml-1.5">{kopiert ? "Kopiert" : "Kopieren"}</span>
              </Button>
            </div>
          </div>
        ) : null}

        {aktive.length ? (
          <ul className="divide-y divide-neutral-100 rounded-lg border border-neutral-200">
            {aktive.map((f) => (
              <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-neutral-800">
                    {f.name || "Ohne Bezeichnung"}
                  </p>
                  <p className="text-xs text-neutral-500">
                    angelegt {formatDateDE(f.erstellt_am)}
                    {f.erstellt_von ? ` von ${f.erstellt_von}` : ""}
                    {" · "}
                    {f.zugriffe ? `${f.zugriffe.toLocaleString("de-DE")} Aufrufe` : "noch nicht aufgerufen"}
                  </p>
                </div>
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() => widerrufen.mutate(f.id)}
                  loading={widerrufen.isPending && widerrufen.variables === f.id}
                  aria-label={`Link „${f.name || "Ohne Bezeichnung"}" widerrufen`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span className="ml-1.5">Widerrufen</span>
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-neutral-500">Derzeit ist kein Link aktiv.</p>
        )}
      </CardContent>
    </Card>
  )
}
