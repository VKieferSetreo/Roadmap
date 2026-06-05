// Seed-Projekte, damit das Dashboard beim ersten Start nicht leer ist.

import type { Project, RouteInput, TransportData } from "@/types/domain"
import { runMockAnalysis } from "./generate"

const uid = () => Math.random().toString(36).slice(2, 10)

function makeAnalysed(
  name: string,
  route: RouteInput,
  transport: TransportData,
  ageDays: number,
): Project {
  const res = runMockAnalysis(route, transport)
  const created = new Date(Date.now() - ageDays * 86400_000).toISOString()
  const updated = new Date(Date.now() - Math.max(0, ageDays - 1) * 86400_000).toISOString()
  return {
    id: uid(),
    name,
    status: "fertig",
    createdAt: created,
    updatedAt: updated,
    route,
    transport,
    routeGeometry: res.routeGeometry,
    findings: res.findings,
    distanzKm: res.distanzKm,
    fahrzeitMin: res.fahrzeitMin,
  }
}

export function buildSeedProjects(): Project[] {
  return [
    makeAnalysed(
      "Trafo-Transport Hamburg → München",
      { mode: "startziel", start: "Hamburg", ziel: "München", vias: ["Hannover", "Würzburg"] },
      {
        fahrzeugTyp: "Sattelzug mit Tieflader",
        laenge: 26.5,
        breite: 3.2,
        hoehe: 4.4,
        gesamtgewicht: 92,
        achslast: 12,
        achsen: 10,
        ladung: "Leistungstransformator 80 t",
      },
      6,
    ),
    makeAnalysed(
      "Windkraft-Rotorblatt Bremen → Leipzig",
      { mode: "startziel", start: "Bremen", ziel: "Leipzig", vias: ["Hannover"] },
      {
        fahrzeugTyp: "Selbstfahrer mit Rotorblattadapter",
        laenge: 62,
        breite: 4.0,
        hoehe: 4.6,
        gesamtgewicht: 78,
        achslast: 10,
        achsen: 12,
        ladung: "Rotorblatt 58 m",
      },
      2,
    ),
    {
      id: uid(),
      name: "Baumaschine Köln → Stuttgart",
      status: "entwurf",
      createdAt: new Date(Date.now() - 86400_000).toISOString(),
      updatedAt: new Date(Date.now() - 86400_000).toISOString(),
      route: { mode: "startziel", start: "Köln", ziel: "Stuttgart" },
      transport: {
        fahrzeugTyp: "Tieflader",
        laenge: 22,
        breite: 3.0,
        hoehe: 3.9,
        gesamtgewicht: 64,
        achslast: 11,
        achsen: 8,
        ladung: "Raupenbagger 45 t",
      },
      routeGeometry: [],
      findings: [],
    },
  ]
}
