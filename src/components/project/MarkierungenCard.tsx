// Block „Markierungen & Standorte" (T-739) — steht direkt unter dem Strecken-Block. Lädt Punkte
// aus KML/KMZ/GeoJSON/Shapefile/GeoPackage, jede Datei wird zu einer oder mehreren Ebenen, die
// als eigene Ebene auf der Auswertungs-Karte liegen. Rein visuell: die Hindernis-Auswertung
// bleibt davon unberührt, deshalb löst der Upload hier auch keinen Analyse-Lauf aus.

import { useState } from "react"
import { toast } from "sonner"
import { Check, Loader2, MapPinned, Pencil, X } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card"
import { Input } from "@/components/ui/Input"
import { DropZone } from "@/components/upload/DropZone"
import { MarkierungsEbenenDialog } from "./MarkierungsEbenenDialog"
import { useProjectStore } from "@/store/projects"
import { MARKIERUNG_GRENZEN, markierungenUnvollstaendig } from "@/types/domain"
import type { Project } from "@/types/domain"
import type { ParsedPunktEbene } from "@/lib/parsePunkte"

const ACCEPT = ".kml,.kmz,.geojson,.json,.zip,.gpkg"

export function MarkierungenCard({ project }: { project: Project }) {
  const addEbenen = useProjectStore((s) => s.addMarkierungsEbenen)
  const removeEbene = useProjectStore((s) => s.removeMarkierungsEbene)
  const updateEbene = useProjectStore((s) => s.updateMarkierungsEbene)

  const [busy, setBusy] = useState(false)
  const [auswahl, setAuswahl] = useState<{ fileName: string; ebenen: ParsedPunktEbene[] } | null>(null)
  const [umbenennen, setUmbenennen] = useState<{ id: string; name: string } | null>(null)

  const ebenen = project.markierungen ?? []
  // T-739: Solange die Punkte nur als Zähler aus der Projektliste vorliegen, darf hier NICHTS
  // geändert werden — der Sync ließe das Feld aus (store/projects.ts#scheduleSync) und die
  // Änderung ginge still verloren. ProjectDetail holt die Punkte beim Öffnen nach, das dauert
  // einen Wimpernschlag; bis dahin zeigt die Liste ehrlich an, dass sie noch lädt.
  const laedtNach = markierungenUnvollstaendig(project)
  const punkteGesamt = ebenen.reduce((n, e) => n + (e.anzahl ?? e.punkte.length), 0)

  /** Grenzen, die am Projekt hängen (die Punktzahl je Ebene prüft schon der Parser). */
  function passtInsProjekt(neu: ParsedPunktEbene[]): boolean {
    if (ebenen.length + neu.length > MARKIERUNG_GRENZEN.ebenenJeProjekt) {
      toast.error(
        `Ein Projekt fasst höchstens ${MARKIERUNG_GRENZEN.ebenenJeProjekt} Ebenen. Bitte entfernen Sie zuerst eine.`,
      )
      return false
    }
    const summe = punkteGesamt + neu.reduce((n, e) => n + e.punkte.length, 0)
    if (summe > MARKIERUNG_GRENZEN.punkteJeProjekt) {
      toast.error(
        `Zusammen wären das ${summe.toLocaleString("de-DE")} Markierungen. Erlaubt sind ${MARKIERUNG_GRENZEN.punkteJeProjekt.toLocaleString("de-DE")} je Projekt.`,
      )
      return false
    }
    return true
  }

  function uebernehmen(fileName: string, gewaehlt: ParsedPunktEbene[]) {
    if (!passtInsProjekt(gewaehlt)) return
    addEbenen(
      project.id,
      gewaehlt.map((e) => ({ name: e.name, fileName, punkte: e.punkte })),
    )
    const punkte = gewaehlt.reduce((n, e) => n + e.punkte.length, 0)
    toast.success(
      gewaehlt.length === 1
        ? `${punkte.toLocaleString("de-DE")} Markierungen geladen.`
        : `${gewaehlt.length} Ebenen mit ${punkte.toLocaleString("de-DE")} Markierungen geladen.`,
    )
    for (const e of gewaehlt) if (e.hinweis) toast.warning(e.hinweis)
  }

  async function onFile(file: File) {
    setBusy(true)
    try {
      // parsePunkte selbst liegt ohnehin im Chunk der Projektansicht (RouteTab importiert
      // parseGpkg statisch, das wiederum parsePunkte). Was hier wirklich zählt: die schweren
      // Bibliotheken hängen an dynamischen Importen INNERHALB des Parsers — shpjs erst beim
      // ersten Shapefile, sql.js erst beim ersten GeoPackage.
      const { parsePunkteFile } = await import("@/lib/parsePunkte")
      const gelesen = await parsePunkteFile(file)
      const mitPunkten = gelesen.filter((e) => e.punkte.length > 0)
      if (mitPunkten.length === 0) {
        toast.error("In der Datei stehen keine Punkte. Enthält sie nur Linien oder Flächen?")
        return
      }
      if (mitPunkten.length === 1) uebernehmen(file.name, mitPunkten)
      else setAuswahl({ fileName: file.name, ebenen: mitPunkten })
    } catch (e) {
      // Nur unsere eigenen Meldungen durchreichen: die sind deutsch und sagen, was zu tun ist.
      // Alles andere (DOMException „NotReadableError" beim Dateizugriff, TypeError aus einer
      // Bibliothek) käme sonst als englischer Techniktext beim Disponenten an.
      const eigene = e instanceof Error && !(e instanceof DOMException) ? e.message : ""
      toast.error(eigene || "Die Datei konnte nicht gelesen werden. Bitte wählen Sie sie erneut aus.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <MapPinned className="h-4 w-4 text-primary-600" />
            Markierungen &amp; Standorte
          </CardTitle>
          <p className="text-sm text-neutral-500">
            Eigene Punkte zusätzlich zur Strecke, etwa Parkplätze, Aufstellflächen oder Anlagen. Sie
            erscheinen als eigene Ebene auf der Karte und zeigen beim Klick ihre Angaben aus der Datei.
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {laedtNach ? (
            <div className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-neutral-200 bg-neutral-50/50 px-4 py-8 text-sm text-neutral-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Vorhandene Markierungen werden geladen …
            </div>
          ) : busy ? (
            <div className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-neutral-200 bg-neutral-50/50 px-4 py-8 text-sm text-neutral-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Datei wird gelesen …
            </div>
          ) : (
            <DropZone
              accept={ACCEPT}
              label="Markierungen hinzufügen"
              hint="KML, KMZ, GeoJSON, Shapefile (.zip) oder GeoPackage"
              onFile={(file) => void onFile(file)}
              compact
            />
          )}

          <div className="flex flex-col gap-3 border-t border-neutral-100 pt-4">
            <div className="flex items-center gap-2">
              <MapPinned className="h-4 w-4 text-primary-600" />
              <span className="text-sm font-semibold text-neutral-900">Angelegte Ebenen</span>
              {ebenen.length > 0 ? (
                <span className="rounded-full bg-neutral-100 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-neutral-600">
                  {ebenen.length}
                </span>
              ) : null}
            </div>

            {ebenen.length === 0 ? (
              <p className="rounded-lg border border-dashed border-neutral-200 bg-neutral-50/50 px-4 py-8 text-center text-sm text-neutral-500">
                Noch keine Markierungen. Oben eine Datei mit Punkten hochladen.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {ebenen.map((e) => (
                  <li
                    key={e.id}
                    className="flex items-center gap-3 rounded-lg border border-neutral-200 bg-white px-3 py-2"
                  >
                    <span
                      className="h-3 w-3 shrink-0 rounded-full ring-2 ring-white"
                      style={{ background: e.farbe }}
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      {umbenennen?.id === e.id ? (
                        <form
                          className="flex items-center gap-2"
                          onSubmit={(ev) => {
                            ev.preventDefault()
                            const name = umbenennen.name.trim()
                            if (name) updateEbene(project.id, e.id, { name })
                            setUmbenennen(null)
                          }}
                        >
                          <Input
                            autoFocus
                            value={umbenennen.name}
                            maxLength={MARKIERUNG_GRENZEN.namensLaenge}
                            aria-label="Name der Ebene"
                            onChange={(ev) => setUmbenennen({ id: e.id, name: ev.target.value })}
                            onKeyDown={(ev) => {
                              if (ev.key === "Escape") setUmbenennen(null)
                            }}
                            className="h-7 py-0 text-sm"
                          />
                          <button
                            type="submit"
                            aria-label="Namen übernehmen"
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
                          >
                            <Check className="h-4 w-4" />
                          </button>
                        </form>
                      ) : (
                        <p className="truncate text-sm font-medium text-neutral-800">{e.name}</p>
                      )}
                      <p className="truncate text-xs tabular-nums text-neutral-400">
                        {e.fileName ? `${e.fileName} · ` : ""}
                        {(e.anzahl ?? e.punkte.length).toLocaleString("de-DE")}{" "}
                        {(e.anzahl ?? e.punkte.length) === 1 ? "Markierung" : "Markierungen"}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setUmbenennen({ id: e.id, name: e.name })}
                      disabled={laedtNach}
                      aria-label={`Ebene ${e.name} umbenennen`}
                      title="Umbenennen"
                      className="flex h-7 w-7 items-center justify-center rounded-md text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (
                          window.confirm(
                            `Ebene „${e.name}" mit ${(e.anzahl ?? e.punkte.length).toLocaleString("de-DE")} Markierungen wirklich entfernen? Das kann nicht rückgängig gemacht werden.`,
                          )
                        ) {
                          removeEbene(project.id, e.id)
                        }
                      }}
                      disabled={laedtNach}
                      aria-label={`Ebene ${e.name} entfernen`}
                      className="flex h-7 w-7 items-center justify-center rounded-md text-neutral-400 transition-colors hover:bg-severity-kritisch-bg hover:text-severity-kritisch disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </CardContent>
      </Card>

      {auswahl ? (
        <MarkierungsEbenenDialog
          fileName={auswahl.fileName}
          ebenen={auswahl.ebenen}
          onClose={() => setAuswahl(null)}
          onConfirm={(gewaehlt) => {
            uebernehmen(auswahl.fileName, gewaehlt)
            setAuswahl(null)
          }}
        />
      ) : null}
    </>
  )
}
