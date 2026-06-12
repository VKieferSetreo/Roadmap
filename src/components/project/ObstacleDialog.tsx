// Dialog zum Anlegen eines Kunden-Hindernisses (Karten-Klick-Flow): Kategorie mit
// passenden Grenzwert-Feldern, Gültigkeit, gespeichert tenant-eigen — wirkt bei der
// nächsten Auswertung ALLER Projekte des Mandanten.

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Dialog, DialogHeader } from "@/components/ui/Dialog"
import { Button } from "@/components/ui/Button"
import { Input, Label, Textarea } from "@/components/ui/Input"
import { Select } from "@/components/ui/Select"
import { KATEGORIE_META } from "./findingMeta"
import { api } from "@/api/roadmap"
import type { FindingKategorie, RoutePoint } from "@/types/domain"

/** Relevante Grenzwert-Felder je Kategorie (Draft docs/HINDERNIS-DATENFORMAT.md §4). */
const ATTR_FELDER: Record<
  FindingKategorie,
  { key: string; label: string; unit: string; step?: number }[]
> = {
  bruecke: [
    { key: "maxHoeheM", label: "Durchfahrtshöhe", unit: "m", step: 0.05 },
    { key: "maxGewichtT", label: "Zul. Gesamtlast", unit: "t" },
    { key: "maxAchslastT", label: "Zul. Achslast", unit: "t", step: 0.5 },
  ],
  tunnel: [
    { key: "maxHoeheM", label: "Durchfahrtshöhe", unit: "m", step: 0.05 },
    { key: "maxGewichtT", label: "Zul. Gesamtlast", unit: "t" },
  ],
  engstelle: [{ key: "maxBreiteM", label: "Restbreite", unit: "m", step: 0.05 }],
  gewicht: [
    { key: "maxGewichtT", label: "Zul. Gesamtlast", unit: "t" },
    { key: "maxAchslastT", label: "Zul. Achslast", unit: "t", step: 0.5 },
  ],
  baustelle: [
    { key: "restbreiteM", label: "Restbreite", unit: "m", step: 0.05 },
    { key: "maxHoeheM", label: "Höhenbegrenzung", unit: "m", step: 0.05 },
  ],
  steigung: [{ key: "steigungPct", label: "Steigung", unit: "%", step: 0.5 }],
  kreisverkehr: [{ key: "radiusM", label: "Außenradius", unit: "m" }],
  bahnuebergang: [{ key: "maxHoeheM", label: "Oberleitungshöhe", unit: "m", step: 0.05 }],
  ampel: [{ key: "maxHoeheM", label: "Auslegerhöhe", unit: "m", step: 0.05 }],
}

interface ObstacleDialogProps {
  /** Geklickte (gesnappte) Position auf der Strecke — null = Dialog zu. */
  position: RoutePoint | null
  onClose: () => void
  /** nach erfolgreichem Anlegen (z.B. Toast mit Re-Analyse-Angebot). */
  onCreated: () => void
}

export function ObstacleDialog({ position, onClose, onCreated }: ObstacleDialogProps) {
  const [kategorie, setKategorie] = useState<FindingKategorie>("baustelle")
  const [name, setName] = useState("")
  const [beschreibung, setBeschreibung] = useState("")
  const [attrs, setAttrs] = useState<Record<string, number>>({})
  const [realerStart, setRealerStart] = useState("")
  const [gueltigBis, setGueltigBis] = useState("")
  const [busy, setBusy] = useState(false)

  // Bei jedem Öffnen frisch starten (heutiges Datum als realer Start)
  useEffect(() => {
    if (!position) return
    setKategorie("baustelle")
    setName("")
    setBeschreibung("")
    setAttrs({})
    setRealerStart(new Date().toISOString().slice(0, 10))
    setGueltigBis("")
  }, [position])

  if (!position) return null

  const felder = ATTR_FELDER[kategorie]

  const submit = async () => {
    if (name.trim().length < 3) {
      toast.error("Bitte eine Bezeichnung angeben (min. 3 Zeichen).")
      return
    }
    setBusy(true)
    try {
      await api.createObstacle({
        kategorie,
        name: name.trim(),
        beschreibung: beschreibung.trim() || undefined,
        lat: position.lat,
        lng: position.lng,
        attrs,
        realerStart: realerStart || undefined,
        gueltigVon: realerStart || undefined,
        gueltigBis: gueltigBis || undefined,
      })
      onClose()
      onCreated()
    } catch {
      toast.error("Eintrag konnte nicht gespeichert werden.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onClose={onClose}>
      <DialogHeader
        title="Eintrag auf der Strecke erstellen"
        subtitle={
          <>
            Position {position.lat.toFixed(5)}° N · {position.lng.toFixed(5)}° E — gilt für alle
            Projekte Ihres Mandanten und fließt in künftige Auswertungen ein.
          </>
        }
        onClose={onClose}
      />
      <div className="flex flex-col gap-4 overflow-y-auto px-6 py-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="ob-kat">Kategorie</Label>
            <Select
              id="ob-kat"
              value={kategorie}
              onChange={(e) => {
                setKategorie(e.target.value as FindingKategorie)
                setAttrs({})
              }}
            >
              {Object.entries(KATEGORIE_META).map(([key, meta]) => (
                <option key={key} value={key}>
                  {meta.label}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="ob-name">Bezeichnung</Label>
            <Input
              id="ob-name"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder='z.B. "Baustelle Ortsdurchfahrt Melle"'
              maxLength={120}
            />
          </div>
        </div>

        {/* Grenzwerte passend zur Kategorie */}
        {felder.length > 0 ? (
          <div>
            <Label>Grenzwerte (optional — steuern die Bewertung)</Label>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {felder.map((f) => (
                <div key={f.key}>
                  <Label htmlFor={`ob-${f.key}`} className="text-[10px]">
                    {f.label}
                    <span className="ml-1 normal-case text-neutral-400">({f.unit})</span>
                  </Label>
                  <Input
                    id={`ob-${f.key}`}
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step={f.step ?? 1}
                    value={Number.isFinite(attrs[f.key]) ? attrs[f.key] : ""}
                    onChange={(e) => {
                      const v = e.target.valueAsNumber
                      setAttrs((prev) => {
                        const next = { ...prev }
                        if (Number.isFinite(v)) next[f.key] = v
                        else delete next[f.key]
                        return next
                      })
                    }}
                    className="tabular-nums"
                  />
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="ob-start">Greift ab</Label>
            <Input
              id="ob-start"
              type="date"
              value={realerStart}
              onChange={(e) => setRealerStart(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="ob-bis">Gültig bis (leer = unbefristet)</Label>
            <Input
              id="ob-bis"
              type="date"
              value={gueltigBis}
              min={realerStart || undefined}
              onChange={(e) => setGueltigBis(e.target.value)}
            />
          </div>
        </div>

        <div>
          <Label htmlFor="ob-desc">Beschreibung (optional)</Label>
          <Textarea
            id="ob-desc"
            rows={2}
            value={beschreibung}
            onChange={(e) => setBeschreibung(e.target.value)}
            placeholder="Worauf müssen Fahrer/Planung achten?"
            className="input-base"
          />
        </div>
      </div>
      <div className="flex items-center justify-end gap-2 border-t border-neutral-200 px-6 py-4">
        <Button variant="ghost" onClick={onClose}>
          Abbrechen
        </Button>
        <Button onClick={() => void submit()} disabled={busy}>
          Eintrag speichern
        </Button>
      </div>
    </Dialog>
  )
}
