// Seed-Projekte, damit das Dashboard beim ersten Start nicht leer ist.

import type { Project, RouteInput, TransportData } from "@/types/domain"
import { runMockAnalysis } from "./generate"

const uid = () => Math.random().toString(36).slice(2, 10)

/** YYYY-MM-DDTHH:mm relativ zu jetzt (lokale Uhrzeit per UTC-Offset). */
function iso(daysFromNow: number, hour = 6, minute = 0): string {
  const d = new Date(Date.now() + daysFromNow * 86400_000)
  d.setHours(hour, minute, 0, 0)
  // toISOString gibt UTC; wir nehmen lokal — bauen das Format manuell
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function makeAnalysed(
  name: string,
  route: RouteInput,
  transport: TransportData,
  ageDays: number,
  zeitraumStartIn: number = 14,
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
    zeitraum: {
      // Schwertransport-typisch: Nachtfahrt-Start 22:00, Ankunft 2 Tage später 14:00
      von: iso(zeitraumStartIn, 22, 0),
      bis: iso(zeitraumStartIn + 2, 14, 0),
    },
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
      zeitraum: { von: iso(28, 22, 0), bis: iso(30, 14, 0) },
      routeGeometry: [],
      findings: [],
    },
  ]
}
