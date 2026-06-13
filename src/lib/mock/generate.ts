// Mock-Engine: erzeugt aus Strecken-Input + Transport-Stammdaten eine
// plausible Route-Polyline und eine Liste gefundener Hindernisse.
// Ersetzt später eine echte Backend-Analyse.

import type {
  Finding,
  FindingKategorie,
  FindingSeverity,
  FindingSource,
  ProjectRoute,
  RoutePoint,
  TransportData,
} from "@/types/domain"
// FindingSource wird in buildSourcePool zurückgegeben; Re-Export-Hinweis für Linter.
export type { FindingSource }
import { resolveOrt } from "./cities"

const uid = () => Math.random().toString(36).slice(2, 10)

/** Baut einen OSM-Deep-Link auf die konkrete Geo-Position (Marker + Zoom). */
function osmDeepLink(lat: number, lng: number, zoom = 17): string {
  const la = lat.toFixed(5)
  const ln = lng.toFixed(5)
  return `https://www.openstreetmap.org/?mlat=${la}&mlon=${ln}#map=${zoom}/${la}/${ln}`
}

/** Extrahiert das Straßenkürzel ("A24") aus einer Straßen-Ref wie "A24 km 102,3". */
function extractRoad(strassenRef: string | undefined, fallback = "A4"): string {
  return (strassenRef ?? "").split(/\s+/)[0] || fallback
}

interface SourceCtx {
  lat: number
  lng: number
  strassenRef: string
}

/** Baut für jede Kategorie einen Pool an Quellen mit möglichst echten Deep-Links.
 *  Pseudo-deep-Links bei geschlossenen Systemen (BASt SIB-Bauwerke, BKG, DB Netz)
 *  zeigen mindestens auf die zuständige Sektion statt nur auf die Domain-Root. */
function buildSourcePool(kategorie: FindingKategorie, ctx: SourceCtx): FindingSource[] {
  const osm = osmDeepLink(ctx.lat, ctx.lng)
  const road = extractRoad(ctx.strassenRef)
  const ahApi = `https://verkehr.autobahn.de/o/autobahn/${road}/services/roadworks`
  const ahApiClosure = `https://verkehr.autobahn.de/o/autobahn/${road}/services/closure`
  const ahApiWarn = `https://verkehr.autobahn.de/o/autobahn/${road}/services/warning`
  const mobiSearch = (q: string) => `https://mobilithek.info/offers?search=${encodeURIComponent(q)}`

  const bastSib = "https://www.bast.de/DE/Ingenieurbau/Anwendungen/SIB-Bauwerke/SIB-Bauwerke.html"
  const bkgDgm =
    "https://www.bkg.bund.de/DE/Produkte-und-Services/Shop-und-Downloads/Digitale-Geodaten/Digitales-Gelaendemodell/digitales-gelaendemodell.html"
  const dbNetzInfra = "https://fahrweg.dbnetze.com/fahrweg-de/start/das_unternehmen"

  switch (kategorie) {
    case "bruecke":
      return [
        { name: `Autobahn-API · ${road} Closure`, url: ahApiClosure, aktualisiertAm: "vor 12 min" },
        { name: "BASt SIB-Bauwerke · Bauwerkssuche", url: bastSib, aktualisiertAm: "vor 3 h" },
        { name: "OSM · Brücken-Position", url: osm, aktualisiertAm: "vor 1 h" },
      ]
    case "tunnel":
      return [
        { name: "OSM · Tunnel an Position", url: osm, aktualisiertAm: "vor 2 d" },
        { name: "BASt SIB-Bauwerke · Tunnelregister", url: bastSib, aktualisiertAm: "vor 1 d" },
      ]
    case "engstelle":
      return [
        { name: `Autobahn-API · ${road} Roadworks`, url: ahApi, aktualisiertAm: "vor 22 min" },
        {
          name: `Mobilithek · DATEX-II "${road}"`,
          url: mobiSearch(`${road} roadworks`),
          aktualisiertAm: "vor 8 min",
        },
      ]
    case "gewicht":
      return [
        { name: "BASt SIB-Bauwerke · Tragfähigkeit", url: bastSib, aktualisiertAm: "vor 6 h" },
        {
          name: "StVO §29(3) · Großraum-/Schwertransport",
          url: "https://www.gesetze-im-internet.de/stvo_2013/__29.html",
          aktualisiertAm: "vor 14 d",
        },
      ]
    case "kreisverkehr":
      return [{ name: "OSM · Kreisverkehr (Position)", url: osm, aktualisiertAm: "vor 1 d" }]
    case "baustelle":
      return [
        { name: `Autobahn-API · ${road} Roadworks`, url: ahApi, aktualisiertAm: "vor 9 min" },
        {
          name: `Mobilithek · DATEX-II "${road}"`,
          url: mobiSearch(`${road} baustelle`),
          aktualisiertAm: "vor 12 min",
        },
      ]
    case "bahnuebergang":
      return [
        { name: "OSM · railway=level_crossing", url: osm, aktualisiertAm: "vor 7 d" },
        { name: "DB Netz · Infrastruktur", url: dbNetzInfra, aktualisiertAm: "vor 30 d" },
      ]
    case "steigung":
      return [
        { name: "BKG · DGM200 Höhenmodell", url: bkgDgm, aktualisiertAm: "vor 90 d" },
        { name: "OSM · Höhen-Tags an Position", url: osm, aktualisiertAm: "vor 30 d" },
      ]
    case "ampel":
      return [
        { name: "OSM · Signalanlage (Position)", url: osm, aktualisiertAm: "vor 1 h" },
        {
          name: `Autobahn-API · ${road} Warnungen`,
          url: ahApiWarn,
          aktualisiertAm: "vor 1 h",
        },
      ]
    case "sperrung":
      return [
        { name: `Autobahn-API · ${road} Closure`, url: ahApiClosure, aktualisiertAm: "vor 15 min" },
        { name: "OSM · Sperrung/Umleitung (Position)", url: osm, aktualisiertAm: "vor 1 h" },
      ]
    default:
      return [{ name: "OSM · Position", url: osm, aktualisiertAm: "vor 1 h" }]
  }
}

const ZUSTAENDIG_POOL: Partial<Record<FindingKategorie, string[]>> = {
  bruecke: ["Autobahn GmbH Nordost", "Autobahn GmbH Südwest", "RP Karlsruhe — Bauwerksbehörde"],
  tunnel: ["Autobahn GmbH Nordost · Tunnelleitstelle", "Autobahn GmbH West · Tunnelbetrieb"],
  engstelle: ["Autobahn GmbH · Baustellenkoordination", "Landesbetrieb Mobilität"],
  gewicht: ["RP Karlsruhe — Genehmigungsbehörde (VEMAGS)", "Landratsamt — Straßenverkehrsbehörde"],
  kreisverkehr: ["Kommune — Straßenverkehrsbehörde"],
  baustelle: ["Autobahn GmbH · Niederlassung", "Landesbetrieb Mobilität"],
  bahnuebergang: ["DB Netz AG · Regionalbereich"],
  steigung: [],
  ampel: ["Kommune — Verkehrsleitstelle"],
}

function pickSource(kategorie: FindingKategorie, ctx: SourceCtx): FindingSource {
  const pool = buildSourcePool(kategorie, ctx)
  return pool[Math.floor(Math.random() * pool.length)]
}

function pickZustaendig(kategorie: FindingKategorie): string | undefined {
  const pool = ZUSTAENDIG_POOL[kategorie] ?? []
  if (!pool.length) return undefined
  return pool[Math.floor(Math.random() * pool.length)]
}

function isoDate(daysFromNow: number): string {
  return new Date(Date.now() + daysFromNow * 86400_000).toISOString().slice(0, 10)
}

function pickStrassenRef(km: number): string {
  const roads = ["A2", "A3", "A4", "A5", "A7", "A8", "A9", "A10", "A24", "B1", "B27", "B96"]
  const road = roads[Math.floor(Math.random() * roads.length)]
  const exact = (km + Math.random() * 0.9).toFixed(1).replace(".", ",")
  return `${road} km ${exact}`
}

/** Haversine-Distanz in km zwischen zwei Punkten. */
function distanceKm(a: RoutePoint, b: RoutePoint): number {
  const R = 6371
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const lat1 = (a.lat * Math.PI) / 180
  const lat2 = (b.lat * Math.PI) / 180
  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2)
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

/** Deterministische Demo-Geometrie über Orte (für Seed-Projekte ohne echte Datei). */
export function buildDemoGeometry(start: string, ziel: string, vias: string[] = []): RoutePoint[] {
  const wps = [resolveOrt(start), ...vias.filter(Boolean).map(resolveOrt), resolveOrt(ziel)]
  return buildPolyline(wps)
}

// ── Fund-Templates je Kategorie ───────────────────────────────────────────────

interface FindKategorieDef {
  kategorie: FindingKategorie
  titel: string
  /** baut Detail + Severity relativ zum Transport. */
  build: (t: TransportData) => {
    beschreibung: string
    detail: Record<string, string>
    severity: FindingSeverity
  }
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
        detail: { Durchfahrtshöhe: m(hoehe), Transporthöhe: m(tr.hoehe), Bauwerk: "Straßenbrücke" },
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
        detail: {
          Tunnelhöhe: m(hoehe),
          Tunnellänge: `${(0.3 + Math.random() * 2).toFixed(1).replace(".", ",")} km`,
        },
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
        detail: {
          "Zul. Last": t(last),
          Gesamtgewicht: t(tr.gesamtgewicht),
          Achslast: t(Math.max(...tr.achslasten, 0)),
        },
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
      detail: {
        Sicherung: Math.random() > 0.5 ? "Schranke" : "Lichtzeichen",
        Fahrzeuglänge: m(tr.laenge),
      },
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
      detail: {
        Abbiegeradius: `${(8 + Math.random() * 8).toFixed(0)} m`,
        Fahrzeuglänge: m(tr.laenge),
      },
      severity: "hinweis",
    }),
  },
]

const WEIGHTED: FindingKategorie[] = KATEGORIEN.flatMap((k) =>
  Array<FindingKategorie>(k.weight).fill(k.kategorie),
)

/** Erzeugt Funde entlang der Geometrie, gewichtet nach Transport-Stammdaten. */
export function generateFindings(geometry: RoutePoint[], transport: TransportData): Finding[] {
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

    const km = Math.round(cum[idx] * 10) / 10
    const strassenRef = pickStrassenRef(km)
    findings.push({
      id: uid(),
      kategorie,
      titel: def.titel,
      beschreibung: built.beschreibung,
      lat: p.lat,
      lng: p.lng,
      km,
      severity: built.severity,
      detail: built.detail,
      strassenRef,
      gueltigVon: isoDate(-30 - Math.floor(Math.random() * 60)),
      gueltigBis: isoDate(30 + Math.floor(Math.random() * 180)),
      quelle: pickSource(kategorie, { lat: p.lat, lng: p.lng, strassenRef }),
      zustaendig: pickZustaendig(kategorie),
    })
  }

  return findings.sort((a, b) => a.km - b.km)
}

export interface AnalysisResult {
  findings: Finding[]
  distanzKm: number
  fahrzeitMin: number
}

/** Komplettes Analyse-Ergebnis für ein Projekt — EINE Auswertung über alle Strecken,
 *  Funde der jeweiligen Strecke zugeordnet (routeId/routeName, km auf SEINER Strecke). */
export function runMockAnalysis(routes: ProjectRoute[], transport: TransportData): AnalysisResult {
  let distanzKm = 0
  const findings: Finding[] = []
  for (const route of routes) {
    if (route.points.length < 2) continue
    for (let i = 1; i < route.points.length; i++) {
      distanzKm += distanceKm(route.points[i - 1], route.points[i])
    }
    for (const f of generateFindings(route.points, transport)) {
      findings.push({ ...f, routeId: route.id, routeName: route.name })
    }
  }
  distanzKm = Math.round(distanzKm)
  // Schwertransport: ~50 km/h Schnitt + Zuschlag pro kritischem Fund
  const kritisch = findings.filter((f) => f.severity === "kritisch").length
  const fahrzeitMin = Math.round((distanzKm / 48) * 60 + kritisch * 25)
  return { findings, distanzKm, fahrzeitMin }
}
