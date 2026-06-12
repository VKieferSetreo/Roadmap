// Seed-Projekte (Demo-Modus), damit das Dashboard beim ersten Start nicht leer ist.

import type { Project, ProjectRoute, TransportData } from "@/types/domain"
import { ROUTE_FARBEN } from "@/types/domain"
import { buildDemoGeometry, runMockAnalysis } from "./generate"

const uid = () => Math.random().toString(36).slice(2, 10)

/** YYYY-MM-DDTHH:mm relativ zu jetzt (lokale Uhrzeit per UTC-Offset). */
function iso(daysFromNow: number, hour = 6, minute = 0): string {
  const d = new Date(Date.now() + daysFromNow * 86400_000)
  d.setHours(hour, minute, 0, 0)
  // toISOString gibt UTC; wir nehmen lokal — bauen das Format manuell
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function demoRoute(
  name: string,
  start: string,
  ziel: string,
  vias: string[],
  idx: number,
): ProjectRoute {
  return {
    id: uid(),
    name,
    fileName: `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.gpx`,
    points: buildDemoGeometry(start, ziel, vias),
    farbe: ROUTE_FARBEN[idx % ROUTE_FARBEN.length],
  }
}

function makeAnalysed(
  name: string,
  routes: ProjectRoute[],
  transport: TransportData,
  ageDays: number,
  zeitraumStartIn = 14,
): Project {
  const res = runMockAnalysis(routes, transport)
  const created = new Date(Date.now() - ageDays * 86400_000).toISOString()
  const updated = new Date(Date.now() - Math.max(0, ageDays - 1) * 86400_000).toISOString()
  return {
    id: uid(),
    name,
    status: "fertig",
    createdAt: created,
    updatedAt: updated,
    routes,
    transport,
    zeitraum: {
      // Schwertransport-typisch: Nachtfahrt-Start 22:00, Ankunft 2 Tage später 14:00
      von: iso(zeitraumStartIn, 22, 0),
      bis: iso(zeitraumStartIn + 2, 14, 0),
    },
    findings: res.findings,
    distanzKm: res.distanzKm,
    fahrzeitMin: res.fahrzeitMin,
  }
}

export function buildSeedProjects(): Project[] {
  return [
    makeAnalysed(
      "Trafo-Transport Hamburg → München",
      [
        demoRoute("Hinfahrt", "Hamburg", "München", ["Hannover", "Würzburg"], 0),
        demoRoute("Rückfahrt", "München", "Hamburg", ["Kassel"], 1),
      ],
      {
        laenge: 26.5,
        breite: 3.2,
        hoehe: 4.4,
        gesamtgewicht: 92,
        achsen: 10,
        achslasten: Array(10).fill(9.2),
      },
      6,
    ),
    makeAnalysed(
      "Windkraft-Rotorblatt Bremen → Leipzig",
      [demoRoute("Hinfahrt", "Bremen", "Leipzig", ["Hannover"], 0)],
      {
        laenge: 62,
        breite: 4.0,
        hoehe: 4.6,
        gesamtgewicht: 78,
        achsen: 12,
        achslasten: Array(12).fill(6.5),
      },
      2,
    ),
    {
      id: uid(),
      name: "Baumaschine Köln → Stuttgart",
      status: "entwurf",
      createdAt: new Date(Date.now() - 86400_000).toISOString(),
      updatedAt: new Date(Date.now() - 86400_000).toISOString(),
      routes: [],
      transport: {
        laenge: 22,
        breite: 3.0,
        hoehe: 3.9,
        gesamtgewicht: 64,
        achsen: 8,
        achslasten: Array(8).fill(8),
      },
      zeitraum: { von: iso(28, 22, 0), bis: iso(30, 14, 0) },
      findings: [],
    },
  ]
}
