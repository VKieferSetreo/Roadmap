// Mock-Engine: erzeugt aus Strecken-Input + Transport-Stammdaten eine
// plausible Route-Polyline und eine Liste gefundener Hindernisse.
// Ersetzt später eine echte Backend-Analyse.

import type {
  Finding,
  FindingKategorie,
  FindingSeverity,
  RouteInput,
  RoutePoint,
  TransportData,
} from "@/types/domain"
import { resolveOrt } from "./cities"

const uid = () => Math.random().toString(36).slice(2, 10)

/** Haversine-Distanz in km zwischen zwei Punkten. */
function distanceKm(a: RoutePoint, b: RoutePoint): number {
  const R = 6371
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const lat1 = (a.lat * Math.PI) / 180
  const lat2 = (b.lat * Math.PI) / 180
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2)
  return 2 * R * Math.asin(Math.sqrt(h))
}

/** Subdividiert eine Segment-Folge und fügt straßenartiges Rauschen hinzu. */
function buildPolyline(waypoints: RoutePoint[]): RoutePoint[] {
  if (waypoints.length < 2) return waypoints
  const out: RoutePoint[] = []
  for (let s = 0; s < waypoints.length - 1; s++) {
    const a = waypoints[s]
    const b = waypoints[s + 1]
    const segKm = distanceKm(a, b)
    const steps = Math.max(8, Math.min(60, Math.round(segKm / 6)))
    for (let i = 0; i < steps; i++) {
      const t = i / steps
      // sanfte Sinus-Auslenkung quer zur Strecke → wirkt wie Straßenverlauf
      const wobble = Math.sin(t * Math.PI * 3) * 0.06 * (1 - Math.abs(t - 0.5) * 2)
      const dx = b.lng - a.lng
      const dy = b.lat - a.lat
      const len = Math.hypot(dx, dy) || 1
      // Normale (senkrecht zur Richtung)
      const nx = -dy / len
      const ny = dx / len
      out.push({
        lat: a.lat + dy * t + ny * wobble,
        lng: a.lng + dx * t + nx * wobble,
      })
    }
  }
  out.push(waypoints[waypoints.length - 1])
  return out
}

/** Erzeugt die Strecken-Geometrie aus dem Routen-Input. */
export function buildRouteGeometry(route: RouteInput): RoutePoint[] {
  if (route.mode === "startziel" && route.start && route.ziel) {
    const wps = [
      resolveOrt(route.start),
      ...(route.vias ?? []).filter(Boolean).map(resolveOrt),
      resolveOrt(route.ziel),
    ]
    return buildPolyline(wps)
  }
  // Upload-Modus ohne Geocoding: deterministischer Demo-Korridor aus dem Dateinamen.
  const seed = route.fileName ?? "strecke"
  const a = resolveOrt(seed + "-start")
  const b = resolveOrt(seed + "-ziel")
  return buildPolyline([a, b])
}

// ── Fund-Templates je Kategorie ───────────────────────────────────────────────

interface FindKategorieDef {
  kategorie: FindingKategorie
  titel: string
  /** baut Detail + Severity relativ zum Transport. */
  build: (t: TransportData) => { beschreibung: string; detail: Record<string, string>; severity: FindingSeverity }
  weight: number
}

const m = (n: number) => `${n.toFixed(2).replace(".", ",")} m`
const t = (n: number) => `${n.toFixed(1).replace(".", ",")} t`

function sev(critical: boolean, warn: boolean): FindingSeverity {
  return critical ? "kritisch" : warn ? "warnung" : "hinweis"
}

const KATEGORIEN: FindKategorieDef[] = [
  {
    kategorie: "bruecke",
    titel: "Brückendurchfahrt",
    weight: 3,
    build: (tr) => {
      const hoehe = 3.6 + Math.random() * 1.2 // 3,60–4,80 m
      return {
        beschreibung: "Begrenzte Durchfahrtshöhe unter der Brücke prüfen.",
        detail: { Durchfahrtshöhe: m(hoehe), "Transporthöhe": m(tr.hoehe), Bauwerk: "Straßenbrücke" },
        severity: sev(hoehe < tr.hoehe + 0.05, hoehe < tr.hoehe + 0.4),
      }
    },
  },
  {
    kategorie: "tunnel",
    titel: "Tunnel",
    weight: 1,
    build: (tr) => {
      const hoehe = 3.8 + Math.random() * 0.9
      return {
        beschreibung: "Tunnelprofil — Höhe und Breite einhalten.",
        detail: { Tunnelhöhe: m(hoehe), Tunnellänge: `${(0.3 + Math.random() * 2).toFixed(1).replace(".", ",")} km` },
        severity: sev(hoehe < tr.hoehe + 0.05, hoehe < tr.hoehe + 0.5),
      }
    },
  },
  {
    kategorie: "engstelle",
    titel: "Fahrbahnengstelle",
    weight: 3,
    build: (tr) => {
      const breite = 2.7 + Math.random() * 1.1 // 2,70–3,80 m
      return {
        beschreibung: "Fahrbahn verengt sich — Restbreite gegen Transportbreite prüfen.",
        detail: { Fahrbahnbreite: m(breite), Transportbreite: m(tr.breite) },
        severity: sev(breite < tr.breite + 0.1, breite < tr.breite + 0.5),
      }
    },
  },
  {
    kategorie: "gewicht",
    titel: "Gewichtsbeschränkung",
    weight: 2,
    build: (tr) => {
      const last = 24 + Math.random() * 40 // 24–64 t
      return {
        beschreibung: "Zulässige Brücken-/Streckenlast prüfen, ggf. Lastverteilung nachweisen.",
        detail: { "Zul. Last": t(last), Gesamtgewicht: t(tr.gesamtgewicht), Achslast: t(tr.achslast) },
        severity: sev(last < tr.gesamtgewicht, last < tr.gesamtgewicht * 1.15),
      }
    },
  },
  {
    kategorie: "kreisverkehr",
    titel: "Kreisverkehr",
    weight: 2,
    build: (tr) => {
      const radius = 12 + Math.random() * 16
      return {
        beschreibung: "Schleppkurve im Kreisverkehr — Befahrbarkeit für die Fahrzeuglänge prüfen.",
        detail: { Außenradius: `${radius.toFixed(0)} m`, Fahrzeuglänge: m(tr.laenge) },
        severity: sev(radius < 15 && tr.laenge > 20, radius < 20),
      }
    },
  },
  {
    kategorie: "baustelle",
    titel: "Baustelle",
    weight: 2,
    build: () => ({
      beschreibung: "Aktive Baustelle mit Spurverengung — Durchfahrt zeitlich abstimmen.",
      detail: { Restbreite: m(2.8 + Math.random() * 0.6), Zeitraum: "befristet" },
      severity: Math.random() > 0.6 ? "warnung" : "hinweis",
    }),
  },
  {
    kategorie: "bahnuebergang",
    titel: "Bahnübergang",
    weight: 1,
    build: (tr) => ({
      beschreibung: "Höhengleicher Bahnübergang — Bodenfreiheit und Wartezeit beachten.",
      detail: { Sicherung: Math.random() > 0.5 ? "Schranke" : "Lichtzeichen", Fahrzeuglänge: m(tr.laenge) },
      severity: "hinweis",
    }),
  },
  {
    kategorie: "steigung",
    titel: "Starke Steigung",
    weight: 1,
    build: () => {
      const grad = 6 + Math.random() * 6
      return {
        beschreibung: "Längsneigung — Anfahrvermögen und Bremsweg berücksichtigen.",
        detail: { Längsneigung: `${grad.toFixed(1).replace(".", ",")} %` },
        severity: grad > 10 ? "warnung" : "hinweis",
      }
    },
  },
  {
    kategorie: "ampel",
    titel: "Signalanlage",
    weight: 1,
    build: (tr) => ({
      beschreibung: "Lichtsignalanlage mit knappem Abbiegeradius.",
      detail: { Abbiegeradius: `${(8 + Math.random() * 8).toFixed(0)} m`, Fahrzeuglänge: m(tr.laenge) },
      severity: "hinweis",
    }),
  },
]

const WEIGHTED: FindingKategorie[] = KATEGORIEN.flatMap((k) =>
  Array<FindingKategorie>(k.weight).fill(k.kategorie),
)

/** Erzeugt Funde entlang der Geometrie, gewichtet nach Transport-Stammdaten. */
export function generateFindings(
  geometry: RoutePoint[],
  transport: TransportData,
): Finding[] {
  if (geometry.length < 2) return []

  // kumulative km-Marken je Geometrie-Punkt
  const cum: number[] = [0]
  for (let i = 1; i < geometry.length; i++) {
    cum.push(cum[i - 1] + distanceKm(geometry[i - 1], geometry[i]))
  }
  const total = cum[cum.length - 1]

  const count = Math.max(4, Math.min(14, Math.round(total / 28) + 3))
  const findings: Finding[] = []
  const usedIdx = new Set<number>()

  for (let n = 0; n < count; n++) {
    let idx = 5 + Math.floor(Math.random() * (geometry.length - 10))
    if (Number.isNaN(idx) || idx < 1) idx = 1 + Math.floor(Math.random() * (geometry.length - 2))
    // leichte Streuung gegen Doppelbelegung
    while (usedIdx.has(idx) && idx < geometry.length - 1) idx++
    usedIdx.add(idx)

    const kategorie = WEIGHTED[Math.floor(Math.random() * WEIGHTED.length)]
    const def = KATEGORIEN.find((k) => k.kategorie === kategorie)!
    const built = def.build(transport)
    const p = geometry[idx]

    findings.push({
      id: uid(),
      kategorie,
      titel: def.titel,
      beschreibung: built.beschreibung,
      lat: p.lat,
      lng: p.lng,
      km: Math.round(cum[idx] * 10) / 10,
      severity: built.severity,
      detail: built.detail,
    })
  }

  return findings.sort((a, b) => a.km - b.km)
}

export interface AnalysisResult {
  routeGeometry: RoutePoint[]
  findings: Finding[]
  distanzKm: number
  fahrzeitMin: number
}

/** Komplettes Analyse-Ergebnis für ein Projekt. */
export function runMockAnalysis(route: RouteInput, transport: TransportData): AnalysisResult {
  const routeGeometry = buildRouteGeometry(route)
  let distanzKm = 0
  for (let i = 1; i < routeGeometry.length; i++) {
    distanzKm += distanceKm(routeGeometry[i - 1], routeGeometry[i])
  }
  distanzKm = Math.round(distanzKm)
  const findings = generateFindings(routeGeometry, transport)
  // Schwertransport: ~50 km/h Schnitt + Zuschlag pro kritischem Fund
  const kritisch = findings.filter((f) => f.severity === "kritisch").length
  const fahrzeitMin = Math.round((distanzKm / 48) * 60 + kritisch * 25)
  return { routeGeometry, findings, distanzKm, fahrzeitMin }
}
