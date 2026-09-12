// Markierungs-Ebenen im Projekt-Store (T-739). Geprüft wird das, was beim Lesen NICHT offensichtlich
// ist: dass jede Ebene einer Datei eine EIGENE Farbe bekommt (die Vergabe läuft gegen den wachsenden
// Stand, nicht gegen den Stand vor dem Upload), dass eine freigewordene Farbe wieder vergeben wird
// und dass Projekte ohne das optionale Feld nicht umfallen.

import { beforeEach, describe, expect, it } from "vitest"
import { useProjectStore } from "@/store/projects"
import { MARKIERUNG_FARBEN } from "@/types/domain"
import { projekt } from "@/test/fixtures"
import type { Markierung, Project } from "@/types/domain"

const P = "projekt-markierungen"

function punkte(n: number): Markierung[] {
  return Array.from({ length: n }, (_, i) => ({ lat: 52 + i / 1000, lng: 10, name: `P${i}` }))
}

function laden(over: Partial<Project> = {}) {
  useProjectStore.setState({ projects: [{ ...projekt(), id: P, ...over }] })
}

const ebenen = () => useProjectStore.getState().getProject(P)?.markierungen ?? []

describe("Markierungs-Ebenen im Store", () => {
  beforeEach(() => laden())

  it("vergibt jeder Ebene EINER Datei eine eigene Farbe", () => {
    useProjectStore.getState().addMarkierungsEbenen(P, [
      { name: "Parkplätze", punkte: punkte(3) },
      { name: "Aufstellflächen", punkte: punkte(2) },
      { name: "Anlagen", punkte: punkte(1) },
    ])
    const farben = ebenen().map((e) => e.farbe)
    expect(farben).toEqual([MARKIERUNG_FARBEN[0], MARKIERUNG_FARBEN[1], MARKIERUNG_FARBEN[2]])
    expect(new Set(farben).size).toBe(3)
  })

  it("vergibt eine freigewordene Farbe erneut, statt weiterzuzählen", () => {
    const store = useProjectStore.getState()
    store.addMarkierungsEbenen(P, [
      { name: "A", punkte: punkte(1) },
      { name: "B", punkte: punkte(1) },
    ])
    store.removeMarkierungsEbene(P, ebenen()[0].id)
    store.addMarkierungsEbenen(P, [{ name: "C", punkte: punkte(1) }])
    expect(ebenen().map((e) => e.name)).toEqual(["B", "C"])
    expect(ebenen().find((e) => e.name === "C")?.farbe).toBe(MARKIERUNG_FARBEN[0])
  })

  it("arbeitet auf einem Projekt ohne das optionale Feld", () => {
    laden({ markierungen: undefined })
    useProjectStore.getState().addMarkierungsEbenen(P, [{ name: "Parkplätze", punkte: punkte(2) }])
    expect(ebenen()).toHaveLength(1)
    expect(ebenen()[0].punkte).toHaveLength(2)
  })

  it("benennt um und schaltet die Freigabe, ohne die Punkte anzufassen", () => {
    const store = useProjectStore.getState()
    store.addMarkierungsEbenen(P, [{ name: "Alt", punkte: punkte(4) }])
    const id = ebenen()[0].id
    store.updateMarkierungsEbene(P, id, { name: "Neu", oeffentlich: false })
    expect(ebenen()[0]).toMatchObject({ name: "Neu", oeffentlich: false })
    expect(ebenen()[0].punkte).toHaveLength(4)
  })

  it("ignoriert einen leeren Upload, statt eine Ebene ohne Inhalt anzulegen", () => {
    useProjectStore.getState().addMarkierungsEbenen(P, [])
    expect(ebenen()).toHaveLength(0)
  })
})
