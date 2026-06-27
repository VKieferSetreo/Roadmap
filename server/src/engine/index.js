// Analyse-Engine v2: pro Projekt-Route (routes[]) Hindernisse im Korridor matchen
// → Regelwerk anwenden → Ergebnis transaktional persistieren (Findings ersetzen,
// Projekt updaten). EINE Gesamt-Auswertung über alle Strecken; jeder Fund kennt
// seine Route (routeId/routeName) und seine km-Position auf SEINER Route.
//
// Der Legacy-startziel-Pfad (resolveRoute.js inkl. OSRM/Nominatim-Kaskade) bleibt
// im Code, wird vom FE aber nicht mehr erzeugt — Routen kommen als Punktlisten.

import { rowToObstacle } from "../map.js"
import { BATCH_ROWS, chunk, placeholders } from "../dbBatch.js"
import { OBSTACLE_COLS } from "../obstaclesRepo.js"
import { downsample } from "./fallback.js"
import {
  bboxWithBuffer, buildRouteGrid, clipGeomToCorridor, coincidentRouteKm, cumulativeKm, haversineKm, nearestOnRoute, obstacleRouteRelation, totalKm,
} from "./geometry.js"
import { AUSWERTUNG_AUSGESCHLOSSEN, evaluate } from "./rules.js"
import { normRoadRef } from "../external/osrm.js"
import { ApiError, isFiniteNumber } from "../util.js"

// 2.1.0 (T-603): SEVAS-Kreuzungsfilter (coincidentRouteKm + Parallelität), Klon-Dedup (identische
// Geom), Orphan-Funde-Purge. Materielle Engine-Änderung → Version-Bump markiert sie in analysis_runs.
export const ENGINE_VERSION = "2.1.0"

// T-601 Überführungs-Filter: BASt-/Last-Brücken sind PUNKTE ohne eigene Geometrie und sitzen
// geometrisch AUF der Autobahn. Maßgeblich ist die GETRAGENE Straße (BASt hoechst_sachverhalt_oben
// → attrs.getrageneStrasse): Trägt das Bauwerk die Route-Straße, fährt der Transport DRAUF → echte
// (oft GST-)Restriktion, BEHALTEN. Trägt es eine andere Straße über/unter die Route (Route-Straße
// liegt UNTEN = Überführung, z.B. "K47 / A1") → der Transport fährt nur drunter → kein Fund.
// Fehlt das Strukturfeld (~13%, "Sonstige"/Bahn), greift eine KONSERVATIVE Namens-Heuristik, die
// nur eindeutige Überführungen aussortiert. SICHER: ohne Route-Refs wird nichts gefiltert;
// Strecken-Bauwerke (eigene Linien-Geometrie) sind über die Geometrie sauber zugeordnet → nie filtern.
const ROAD_ALL = /\b(a|b|l|k|st|s)\s?0*(\d{1,4})\b/gi
function roadRefsIn(s) {
  const out = []
  for (const m of String(s ?? "").toLowerCase().matchAll(ROAD_ALL)) {
    const p = m[1].toUpperCase()
    out.push((p === "S" ? "ST" : p) + m[2])
  }
  return out
}
const intersects = (refs, set) => refs.some((r) => set.has(r))

export function isCrossingStructure(obstacle, routeRefs) {
  if (obstacle.geom) return false
  if (obstacle.kategorie !== "bruecke" && obstacle.kategorie !== "tunnel") return false
  if (!routeRefs || routeRefs.size === 0) return false

  // AUTORITATIV: BASt liefert oben (getragene) + unten (gekreuzte) Straße strukturiert.
  // Fährt die Route auf der GETRAGENEN Straße (oben) → über die Brücke → echte Restriktion (behalten).
  // Fährt sie auf der GEKREUZTEN Straße (unten) → drunter durch = Überführung → kein Fund.
  // (jast_lage="O: Bund" = Autobahn oben = behalten; "U: Bund" = Autobahn unten = raus.)
  const getragen = normRoadRef(obstacle.attrs?.getrageneStrasse)
  const gekreuzt = normRoadRef(obstacle.attrs?.gekreuzteStrasse)
  if (getragen != null && routeRefs.has(getragen)) return false // Route fährt oben drüber → behalten
  if (gekreuzt != null && routeRefs.has(gekreuzt)) return true // Route fährt unten drunter → Überführung
  if (getragen != null) return true // trägt eine routenfremde Straße → Kreuzungsbauwerk → raus

  // FALLBACK (Bauwerk ohne Strukturfeld, ~13%): KONSERVATIV — nur EINDEUTIGE Überführungen raus,
  // sonst behalten. Die getragene Straße ist die Wahrheit (oben); fehlt sie, dürfen wir keine
  // echte Gewichts-Sperre verstecken (Max-Entscheid 2026-06-26: alle echten Sperren zeigen).
  const name = ` ${String(obstacle.name ?? "").toLowerCase()} `
  // (a) Name trägt die Route-Straße ("i.Z.(d.) A7" / "A7 (in km …) über …") → behalten.
  const carried = []
  for (const m of name.matchAll(/(?:i\.?\s*z\.?\s*d?\.?|im zuge (?:der |des |einer )?)\s*(?:bab\s*)?((?:a|b|l|k|st)\s?\d{1,4})/gi))
    carried.push(...roadRefsIn(m[1]))
  for (const m of name.matchAll(/((?:a|b|l|k|st)\s?\d{1,4})\s*(?:in km [\d.,\s]+)?\s*(?:über|ü\.)/gi))
    carried.push(...roadRefsIn(m[1]))
  if (intersects(carried, routeRefs)) return false
  // (b) Name führt eine ANDERE Sache "über" die Route-Straße → eindeutige Überführung → raus.
  const um = name.match(/(?:über|ü\.\s*d?\.?|ueber)\s*(?:die |der |den |das |dem |einen |einer )?(.*)$/)
  if (um && intersects(roadRefsIn(um[1].split(/[,;/]|\bkm\b/)[0]), routeRefs)) return true
  // sonst: im Zweifel BEHALTEN.
  return false
}

// Findings-Persistenz (T-330): Spalten an einer Stelle für den Multi-Row-INSERT-Batch.
const FINDING_COLS = `project_id, obstacle_id, kategorie, severity, titel, beschreibung,
  lat, lng, km, detail, strassen_ref, gueltig_von, gueltig_bis, quelle, zustaendig,
  route_id, route_name, geom`
const FINDING_COL_COUNT = 18
const findingParams = (projectId, f) => [
  projectId, f.obstacleId, f.kategorie, f.severity, f.titel, f.beschreibung,
  f.lat, f.lng, f.km, JSON.stringify(f.detail ?? {}), f.strassenRef ?? null,
  f.gueltigVon ?? null, f.gueltigBis ?? null,
  f.quelle != null ? JSON.stringify(f.quelle) : null, f.zustaendig ?? null,
  f.routeId ?? null, f.routeName ?? null, f.geom != null ? JSON.stringify(f.geom) : null,
]

const round1 = (n) => Math.round(n * 10) / 10
const sanePoint = (p) => p && isFiniteNumber(p.lat) && isFiniteNumber(p.lng)

/** Alle Stützpunkte einer GeoJSON-Linie/MultiLinie als {lat,lng} (GeoJSON-Reihenfolge [lng,lat]). */
function geomPoints(geom) {
  if (!geom || typeof geom !== "object") return []
  const out = []
  const addLine = (line) => {
    if (!Array.isArray(line)) return
    for (const p of line) {
      if (Array.isArray(p) && isFiniteNumber(p[0]) && isFiniteNumber(p[1])) out.push({ lat: p[1], lng: p[0] })
    }
  }
  if (geom.type === "LineString") addLine(geom.coordinates)
  else if (geom.type === "MultiLineString" && Array.isArray(geom.coordinates)) geom.coordinates.forEach(addLine)
  return out
}

// Schrittweite für den (rein DARSTELLENDEN) Korridor-Clip an die Linienlänge koppeln: clip
// densifiziert alle stepM Meter einen Punkt und prüft je Punkt nearestOnRoute (O(Routenpunkte)) →
// Kost ≈ (Länge / stepM) × Routenpunkte. Bei festem stepM=15 blockierte eine ~50-km-Linie ~2 s.
// stepM so wählen, dass ~max. CLIP_SAMPLES Dense-Punkte entstehen → gedeckelte Kost; auf Karten-
// Zoom optisch unverändert und OHNE Einfluss auf Bewertung/severity (clip = nur gerenderte Linie).
const CLIP_SAMPLES = 300
function clipStepM(obstaclePts) {
  let lenM = 0
  for (let i = 1; i < obstaclePts.length; i++) lenM += haversineKm(obstaclePts[i - 1], obstaclePts[i]) * 1000
  return Math.max(15, Math.round(lenM / CLIP_SAMPLES))
}

// Nur ECHT redundante Punkt-Dubletten zusammenfassen: gleiche Route + Kategorie + (normalisierte)
// Bezeichnung + ko-lokalisiert (Δkm ≤ DUP_KM) = dasselbe reale Hindernis doppelt gemeldet.
// WICHTIG: Einträge mit eigener Linien-Geometrie (geom) werden NIE zusammengefasst — das sind
// distinkte Strecken, oft die zwei Fahrtrichtungen/Fahrbahnen derselben Maßnahme. Die bleiben
// beide erhalten ("nicht dass die rausgehen") und das FE stellt sie als EINEN aufsplittbaren
// Marker mit Tabs dar. Behalten wird der schwerste Fund.
const DUP_KM = 0.15 // 150 m — nur wirklich ko-lokalisierte Punkt-Dubletten
const SEV_RANK = { kritisch: 3, warnung: 2, hinweis: 1 }
// Gegenfahrbahn-Filter: ab dieser Winkeldifferenz (Grad) zwischen Hindernis-Linie und
// Route-Richtung gilt die Linie als Gegenfahrbahn → für diese Fahrtrichtung irrelevant.
// 120° = klar entgegengesetzt; alles darunter (parallel/quer/zweideutig) bleibt drin.
const OPPOSITE_DEG = 120
// Enger "Same-Lane"-Radius für den Gegenfahrbahn-Filter: Segmente ≤ SAME_LANE_M gelten
// richtungsunabhängig als unsere Fahrbahn. MUSS kleiner sein als der Match-Korridor (corridorM,
// ~20 m) — sonst fällt die nur wenige Meter daneben liegende Gegenfahrbahn unter "unsere
// Fahrbahn" und würde nie ausgeblendet (genau der Gegenverkehr-Bug). 8 m ≈ Fahrstreifenbreite.
const SAME_LANE_M = Number(process.env.SAME_LANE_M ?? 8)
const normName = (s) => String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ")

// T-603 (Daten-Audit 2026-06-27): SEVAS-Maß-Restriktionen (Höhe/Gewicht/Breite, Quelle 0157) sind
// Linien ENTLANG einer konkreten Straße. Liegt diese Straße QUER zur Route (Route über-/unterführt
// sie), berührt die Linie den 20-m-Match-Korridor nur am Kreuzungspunkt → die Auflage der gekreuzten
// Nebenstraße wird fälschlich dem Transport angehängt (geometrisch belegt: 27% der SEVAS-Funde lagen
// >80 m abseits, alle als kritisch). Der Überführungsfilter greift nicht (nur Punkt-Bauwerke ohne
// Geom). Diskriminator: läuft die Restriktionslinie DECKUNGSGLEICH (≤ SAME_LANE_M) auf der Route?
// >0 ⇒ Transport fährt auf der Straße → echte Auflage, behalten. ≈0 ⇒ nur gekreuzt → verwerfen.
const CROSS_MIN_KM = Number(process.env.SEVAS_CROSS_MIN_KM ?? 0.02) // 20 m deckungsgleicher Mindestlauf
const istMassRestriktion = (a) => !!a && (a.maxHoeheM != null || a.maxGewichtT != null || a.maxBreiteM != null)

// Zwei Linien-Geometrien sind IDENTISCH (byte-gleiche Koordinaten) — kommt vom Re-Import-Churn:
// dieselbe Quell-Restriktion landet als zwei Obstacle-Zeilen mit verschiedener obstacle_id, aber
// gleicher Geometrie (T-603/T-532). Solche Klone DÜRFEN gemergt werden; zwei VERSCHIEDENE Geometrien
// (echte Fahrtrichtungs-/Fahrbahn-Paare) bleiben getrennt.
const sameGeom = (a, b) => a && b && a.type === b.type && JSON.stringify(a.coordinates) === JSON.stringify(b.coordinates)

export function dedupeFindings(findings) {
  const kept = []
  for (const f of findings) {
    const key = `${f.routeId}|${f.kategorie}|${normName(f.titel)}`
    // Strecken-Funde (beide mit geom) NICHT mergen → Fahrtrichtungen bleiben getrennt; AUSNAHME:
    // byte-identische Geometrie = Re-Import-Klon derselben Stelle → doch mergen (T-603).
    const dup = kept.find(
      (k) => k.__key === key && Math.abs(k.km - f.km) <= DUP_KM && (!(k.geom && f.geom) || sameGeom(k.geom, f.geom)),
    )
    if (!dup) {
      kept.push({ ...f, __key: key })
      continue
    }
    const fr = SEV_RANK[f.severity] ?? 0
    const dr = SEV_RANK[dup.severity] ?? 0
    if (fr > dr || (fr === dr && f.geom && !dup.geom)) Object.assign(dup, f, { __key: key })
  }
  // eslint-disable-next-line no-unused-vars
  const same = kept.map(({ __key, ...f }) => f)
  return dropCrossSourceDuplicates(same)
}

// #22 (Max 2026-06-21): Dieselbe reale Stelle (obstacleId) wird oft von VIELEN Strecken eines
// Projekts passiert — bei z.B. 100 hochgeladenen Strecken über dieselbe Baustelle meldete die
// Engine 100 separate Funde. Über das ganze Projekt auf EINEN Fund je Stelle zusammenfassen
// (den schwersten behalten; bei Gleichstand den ersten = niedrigste km). Die km-/Routen-Zuordnung
// des behaltenen Funds bleibt erhalten (eine Strecke ist Repräsentant). Funde ohne obstacleId
// (sollte es nicht geben) bleiben unangetastet.
export function dedupeByObstacle(findings) {
  const byId = new Map()
  const out = []
  for (const f of findings) {
    if (f.obstacleId == null) {
      out.push(f)
      continue
    }
    const prev = byId.get(f.obstacleId)
    if (!prev) {
      byId.set(f.obstacleId, f)
      out.push(f)
      continue
    }
    // schwereren Fund behalten (in-place, Referenz in out bleibt erhalten)
    if ((SEV_RANK[f.severity] ?? 0) > (SEV_RANK[prev.severity] ?? 0)) Object.assign(prev, f)
  }
  return out
}

// Quellenübergreifende Dubletten: dieselbe Maßnahme aus ZWEI externen Quellen (z.B. Autobahn-Live
// + BAB-AkD-Planung über Mobilithek) erscheint doppelt — gleiche Route+Kategorie, km ≤ DUP_KM,
// aber unterschiedliche Quelle und meist unterschiedlicher Titel (greift der Titel-Dedup oben NICHT).
// Regel (Max 2026-06-19): den schwächeren Fund droppen, den KRITISCHEREN behalten. Gleich-schwere
// bleiben beide (könnten zwei Fahrtrichtungen oder echte Doppelmaßnahmen sein). Eigene Einträge
// (herkunft 'eigen') werden NIE automatisch gedroppt.
function dropCrossSourceDuplicates(findings) {
  const drop = new Set()
  for (const f of findings) {
    if (f.herkunft === "eigen" || drop.has(f)) continue
    for (const g of findings) {
      if (g === f || g.herkunft === "eigen" || drop.has(g)) continue
      if (f.routeId !== g.routeId || f.kategorie !== g.kategorie) continue
      if (Math.abs(f.km - g.km) > DUP_KM) continue
      if (normName(f.quelle?.name) === normName(g.quelle?.name)) continue // gleiche Quelle → behalten
      const rf = SEV_RANK[f.severity] ?? 0
      const rg = SEV_RANK[g.severity] ?? 0
      if (rf < rg) {
        drop.add(f)
        break
      }
      if (rg < rf) drop.add(g)
    }
  }
  return findings.filter((x) => !drop.has(x))
}

// T-607 (Audit-Runde 2): dieselbe physische Stelle erscheint mehrfach. (a) Brücken-Zwillinge je
// Fahrtrichtung — BASt/Autobahn-PUNKT-Brücken („… FR Hannover" / „… FR Oberhausen") am ~selben
// Punkt; der Gegenfahrbahn-Filter greift nur bei Linien-Geometrie (~15 %), Punkt-Brückenpaare
// entkommen, jedes Bauwerk erscheint 2× (eines ist die Gegenfahrbahn, die der Transport nie befährt).
// (b) Quell-übergreifende Doppelmeldung am identischen Ort (0001 Autobahn-live + 0145 AkD-Planung).
// Pro Route + GLEICHER Kategorie Funde ≤ LOC_M (Koord) und ≤ DUP_KM (km) zu EINEM zusammenfassen
// (schwerster; bei Gleichstand der mit Geom). Kategorie-KONSERVATIV: Baustelle wird NIE mit Sperrung
// verschmolzen (könnten distinkt sein — Max: nichts übersehen). Die Last/Restriktion gilt richtungs-
// unabhängig, daher ist der Merge zweier Richtungsdecks korrekt.
const LOC_M = 25
export function dedupeByLocation(findings) {
  const out = []
  for (const f of findings) {
    // NUR Punkt-Funde (kein geom): die FR-Zwillinge sind Punkt-Brücken; Linien-Hindernisse sind
    // bereits über den Gegenfahrbahn-Filter + dedupeFindings sauber richtungs-/dublettenbehandelt —
    // die werden hier NICHT angefasst (kein Risiko für die getunte Fahrtrichtungs-Logik).
    const twin = !f.geom && Number.isFinite(f.lat) && Number.isFinite(f.lng)
      ? out.find((k) =>
        !k.geom && k.routeId === f.routeId && k.kategorie === f.kategorie &&
        Math.abs(k.km - f.km) <= DUP_KM &&
        Number.isFinite(k.lat) && Number.isFinite(k.lng) &&
        haversineKm({ lat: k.lat, lng: k.lng }, { lat: f.lat, lng: f.lng }) * 1000 <= LOC_M)
      : null
    if (!twin) { out.push(f); continue }
    const fr = SEV_RANK[f.severity] ?? 0
    const tr = SEV_RANK[twin.severity] ?? 0
    if (fr > tr || (fr === tr && f.geom && !twin.geom)) Object.assign(twin, f)
  }
  return out
}

// FR-/Rifa-Richtungssuffix aus Brücken-/Tunnel-Titeln entfernen — nach dem Zwillings-Merge ist das
// Richtungs-Label sinnlos/irreführend (die Restriktion gilt beidseitig). Nur Bauwerks-Kategorien:
// bei Baustellen/Sperrungen kann „FR <Ort>" eine echte Richtungsangabe sein → unangetastet lassen.
function cleanBauwerkTitel(s) {
  return String(s ?? "")
    .replace(/\s*[,(]?\s*\b(FR|Rifa)\s+[A-Za-zÄÖÜäöüß.-]+\b\)?/g, "")
    .replace(/_FR\s*\w+(_\w+)?/gi, "")
    .replace(/\s{2,}/g, " ").replace(/\s*[/,]\s*$/, "").replace(/^\s*[/,]\s*/, "").trim()
}

/** Analysierbare Routen: ≥2 valide Punkte (Geometrie) UND freigegeben.
 *  Prüfen-Gate (T-593): aus einem VEMAGS-Bescheid rekonstruierte Strecken werden erst nach
 *  manueller Prüfung (verifiziert=true) ausgewertet — ungeprüfte Strecken fließen NICHT in
 *  Findings/Schnitte/Dashboard (variierende Bescheid-Qualität, müssen erst sauber gezogen werden). */
export function usableRoutes(routes) {
  return (Array.isArray(routes) ? routes : [])
    .filter((r) => !(r?.source === "vemags" && r?.verifiziert !== true))
    .map((r) => ({
      ...r,
      points: Array.isArray(r?.points) ? r.points.filter(sanePoint) : [],
    }))
    .filter((r) => r.points.length >= 2)
}

/** Reine Analyse (ohne Persistenz): liest Hindernisse via db, berechnet Findings. */
export async function analyze({ db, project, corridorM, osrm = null }) {
  const routes = usableRoutes(project.routes)
  if (routes.length === 0) {
    // Gate (T-593): es können Strecken existieren, aber alle ungeprüft (VEMAGS) → für die Auswertung
    // nicht freigegeben. Klare Meldung statt „Strecke hochladen".
    const hatUngeprüft = (project.routes ?? []).some((r) => r?.source === "vemags" && r?.verifiziert !== true)
    throw new ApiError(
      422,
      hatUngeprüft
        ? "Keine freigegebene Strecke — bitte VEMAGS-Strecken erst prüfen & freigeben."
        : "Keine Strecke mit Punkten vorhanden — Strecke hochladen",
    )
  }

  // T-330: Geometrie/Korridor je Route einmal vorbereiten, dann EIN SELECT über die OR-Verknüpfung
  // aller Routen-Bboxen statt R einzelner Queries — jedes Hindernis (inkl. geom-Blob) wird so nur
  // einmal aus der DB gezogen, auch wenn es im Korridor mehrerer Teilstrecken liegt. Bewusst die
  // OR-Verknüpfung der kleinen Boxen, NICHT die umschließende Gesamt-Bbox: bei weit auseinander
  // liegenden Teilstrecken (mehrere Bundesländer) würde die Hüll-Box halb Deutschland in den Heap ziehen.
  // T-601: je Route die tatsächlich befahrenen Straßen-Refs aus OSRM ziehen (Steps) — Grundlage des
  // Überführungs-Filters. Wegpunkte bevorzugt (definieren die Route exakt), sonst die Punktliste
  // ausdünnen. Null bei fehlendem OSRM/Fehler → Filter greift dann nicht (konservativ).
  const routeRefs = await Promise.all(routes.map((route) => {
    if (!osrm) return null
    const wp = Array.isArray(route.waypoints) && route.waypoints.length >= 2
      ? route.waypoints
      : route.points.filter((_, i) => i % Math.max(1, Math.floor(route.points.length / 100)) === 0)
    return osrm.roadRefs(wp).catch(() => null)
  }))

  const routeCtx = routes.map((route, i) => {
    const geometry = downsample(route.points.map((p) => ({ lat: p.lat, lng: p.lng })))
    // Gitter-Index je Route einmal bauen → nearestOnRoute/clip prüfen nur nahe Segmente statt aller
    // ~2000 (Hauptkost bei langen Routen mit vielen Kandidaten-Hindernissen). Gleiche Treffer.
    return { route, geometry, cum: cumulativeKm(geometry), bbox: bboxWithBuffer(geometry, corridorM), grid: buildRouteGrid(geometry), refs: routeRefs[i] }
  })

  let findings = []
  let distanzKm = routeCtx.reduce((sum, c) => sum + totalKm(c.geometry), 0)

  // v3: globale Hindernisse + Kunden-Einträge des Projekt-Tenants. Bbox-Vorfilter in SQL, exaktes
  // Korridor-Matching danach in JS — pro Route gegen ihre eigene Bbox (gleiche Funde wie zuvor).
  const params = [project.tenantId ?? null]
  const boxSql = routeCtx
    .map((c) => {
      const i = params.push(c.bbox.minLat, c.bbox.maxLat, c.bbox.minLng, c.bbox.maxLng) - 4
      return `(lat BETWEEN $${i + 1} AND $${i + 2} AND lng BETWEEN $${i + 3} AND $${i + 4})`
    })
    .join(" OR ")
  const exclIdx = params.push(AUSWERTUNG_AUSGESCHLOSSEN)
  const { rows } = await db.query(
    `SELECT ${OBSTACLE_COLS}, geom FROM obstacles WHERE aktiv = true
       AND (tenant_id IS NULL OR tenant_id = $1::uuid)
       AND (${boxSql})
       AND kategorie <> ALL($${exclIdx}::text[])`, // Bauwerke raus — macht das Strecken-Engineering
    params,
  )
  const obstacles = rows.map(rowToObstacle)

  // Event-Loop-Schonung: Das Matching ist reine CPU (nearestOnRoute über die ganze Geometrie je
  // Hindernis, KEIN await im Loop) und lief bei langen Mehr-Strecken-Projekten ~70 s am Stück — das
  // blockiert den single-threaded Node-Loop, die API antwortet währenddessen NIEMANDEM (Health/Seiten/
  // andere Nutzer „gehen in die Knie"). Daher ~alle 40 ms den Loop freiwillig freigeben (setImmediate):
  // andere Requests werden zwischen den Häppchen bedient, die Analyse wird nur minimal länger.
  // ponytail: kooperatives Yielding (eine CPU / ein Loop). Echte Parallelität vieler schwerer Analysen
  // bräuchte eine Job-Queue / Worker-Thread — erst bauen, wenn gleichzeitige Langläufe real auftreten.
  let lastYield = Date.now()
  // Gibt den Event-Loop frei, wenn seit dem letzten Yield > ~40 ms CPU vergangen sind. Wird sowohl
  // je Hindernis als auch im inneren Stützpunkt-Scan aufgerufen — ein einzelnes langes Linien-
  // Hindernis (viele geom-Punkte) im großen Korridor-Bbox scannte sonst ~2 s am Stück (Lag-Spike).
  const maybeYield = async () => {
    if (Date.now() - lastYield > 40) {
      await new Promise((r) => setImmediate(r))
      lastYield = Date.now()
    }
  }
  for (const { route, geometry, cum, bbox, grid, refs } of routeCtx) {
    for (const obstacle of obstacles) {
      await maybeYield()
      // nur Hindernisse in der Bbox DIESER Route prüfen (inkl., wie BETWEEN zuvor).
      if (
        obstacle.lat < bbox.minLat || obstacle.lat > bbox.maxLat ||
        obstacle.lng < bbox.minLng || obstacle.lng > bbox.maxLng
      ) continue
      // T-601: Überführung/Unterführung — Punkt-Bauwerk auf einer Straße, die der Transport gar
      // nicht befährt (kreuzt sie nur). Vor dem teuren Geometrie-Matching aussortieren.
      if (isCrossingStructure(obstacle, refs)) continue
      const obstaclePts = geomPoints(obstacle.geom)
      // Punkt-Hindernis: Abstand des Punkts zur Route. Strecken-Hindernis (geom = Linie):
      // den Linien-Stützpunkt nehmen, der der Route am NÄCHSTEN ist — so greift eine an der
      // Route entlanglaufende Maßnahme auch dann, wenn ihr Mittel-/Ankerpunkt versetzt liegt,
      // und ein Punkt 16 m neben der Route fällt sauber raus.
      let near = nearestOnRoute({ lat: obstacle.lat, lng: obstacle.lng }, geometry, cum, grid)
      for (let pi = 0; pi < obstaclePts.length; pi++) {
        const p = obstaclePts[pi]
        if (near.distM <= corridorM) break // schon im Korridor — günstig, kein Weitersuchen nötig
        if ((pi & 63) === 0) await maybeYield() // alle 64 Stützpunkte den Loop atmen lassen
        const n = nearestOnRoute(p, geometry, cum, grid)
        if (n.distM < near.distM) near = n
      }
      if (near.distM > corridorM) continue

      // Gegenfahrbahn-Filter: Strecken-Meldungen (Linien-Geometrie, faktisch nur Autobahn)
      // laufen je Fahrbahn als eigene Linie in REISERICHTUNG (Daten geprüft: Koordinaten-
      // Reihenfolge = Fahrtrichtung). Läuft die Linie im Korridor ÜBERWIEGEND gegen die
      // Reiserichtung (Gegenfahrbahn), passiert der Transport sie nicht → ausblenden.
      // obstacleRouteRelation gewichtet segmentweise nach Länge mit lokalem Kurs; Punkte
      // und nur-quer/zweideutig liegende Linien → "none"/"parallel" → bleiben IMMER drin.
      // coincidentM = enger Same-Lane-Radius (NICHT der 20-m-Match-Korridor!), damit die nur
      // wenige Meter daneben liegende Gegenfahrbahn in den Bearing-Check-Ring fällt und als
      // gegenläufig ausgeblendet wird; relationM weiter, um den Mittelstreifen-Abstand zu erfassen.
      const relation = obstacleRouteRelation(obstaclePts, geometry, cum, {
        coincidentM: Math.min(SAME_LANE_M, corridorM),
        relationM: Math.max(corridorM * 3, 60),
        oppositeDeg: OPPOSITE_DEG,
      })
      if (relation === "opposite") continue
      // T-603: Maß-Restriktion (SEVAS Höhe/Gewicht/Breite) auf einer Linie, die die Route nur KREUZT
      // statt deckungsgleich auf ihr zu verlaufen → gilt der gekreuzten Straße, nicht uns → verwerfen.
      // Echte Auflagen auf der befahrenen Trasse (auch kurzes Erst-/Letztstück) laufen deckungsgleich
      // → coincidentRouteKm > 0 → bleiben. Greift nur bei Linien-Geom mit Maßwert-Attribut.
      if (
        obstacle.geom && istMassRestriktion(obstacle.attrs) &&
        coincidentRouteKm(obstaclePts, geometry, cum, SAME_LANE_M, grid) < CROSS_MIN_KM
      ) continue
      const verdict = evaluate(obstacle, project.transport, project.zeitraum)
      if (!verdict) continue
      // Linien-Geometrie auf den Routen-Korridor clippen → nur der durchfahrene Teil der Baustelle
      // wird gerendert (nicht die ganze, oft kilometerlange Quell-Linie). Fallback auf die volle
      // Linie, falls der Clip leer ausfällt — nie die Info ganz verlieren.
      // Perf/Stabilität: clipGeomToCorridor kostet ~ (Quell-Stützpunkte × Routenpunkte) und lief bei
      // sehr langen Linien-Hindernissen (~1700 Punkte) ~2 s synchron = der verbliebene Event-Loop-
      // Spike. Da der Clip NUR die gerenderte Linie bestimmt (keine Bewertung/severity), die Quelle
      // vorher auf ≤300 Punkte ausdünnen — auf Karten-Zoom optisch identisch. Yield direkt davor.
      await maybeYield()
      const geomFuerFund = obstacle.geom
        ? (clipGeomToCorridor(obstacle.geom, geometry, cum, Math.max(corridorM * 3, 60), { stepM: clipStepM(obstaclePts), grid }) ?? obstacle.geom)
        : null
      // T-607: Markerposition. Bei langen Linien-Hindernissen (Autobahn-/AkD-Baustellen über viele km)
      // ist obstacle.lat/lng der ANKER der Gesamtlinie und liegt bis zig km vom Routen-Schnittpunkt
      // entfernt (gemessen 58 km) → der Marker säße weit außerhalb der Route. Für Linien-Hindernisse
      // den der Route NÄCHSTEN Punkt der GECLIPPTEN Linie nehmen: clipGeomToCorridor ist densifiziert
      // + auf den Korridor reduziert (kein Downsample-Drift, kein 2-Punkt-Grobraster) → garantiert nah
      // an der befahrenen Trasse. Punkt-Hindernisse behalten ihre echte Koordinate.
      let markerPt = { lat: obstacle.lat, lng: obstacle.lng }
      if (obstacle.geom) {
        let best = Infinity
        for (const p of geomPoints(geomFuerFund)) {
          const d = nearestOnRoute(p, geometry, cum, grid).distM
          if (d < best) { best = d; markerPt = p }
        }
      }
      findings.push({
        obstacleId: obstacle.id,
        kategorie: obstacle.kategorie,
        severity: verdict.severity,
        titel: verdict.titel,
        // Popup zeigt den ECHTEN Quelltext (z.B. Autobahn-GmbH-Meldung), nicht unseren generierten
        // Satz. Die Bewertung steckt in severity + detail. Fallback auf den Regeltext, falls die Quelle
        // keinen Beschreibungstext liefert.
        beschreibung: (obstacle.beschreibung && obstacle.beschreibung.trim()) || verdict.beschreibung,
        detail: verdict.detail,
        // T-607: Marker an den Routen-Schnittpunkt (nächster Linien-Stützpunkt im Korridor), nicht an
        // den oft zig km entfernten Anker langer Linien-Hindernisse. Punkt-Hindernisse: = obstacle.
        lat: markerPt.lat,
        lng: markerPt.lng,
        geom: geomFuerFund, // auf den Routen-Korridor geclippte Strecke (nur durchfahrener Teil), sonst Punkt
        km: near.km, // Position auf SEINER Route — bereits deterministisch in nearestOnRoute() gerundet (#9)
        routeId: route.id,
        routeName: route.name,
        strassenRef: obstacle.strassenRef,
        gueltigVon: obstacle.gueltigVon,
        gueltigBis: obstacle.gueltigBis,
        quelle: obstacle.quelle,
        zustaendig: obstacle.zustaendig,
        herkunft: obstacle.herkunft, // 'global'|'eigen' — nur für Dedup (nicht persistiert)
      })
    }
  }
  findings = dedupeFindings(findings) // klare Dubletten (quellenübergreifend / beide Richtungen) rausschneiden
  findings = dedupeByObstacle(findings) // #22: dieselbe Stelle über viele Strecken → EIN Fund
  findings = dedupeByLocation(findings) // T-607: Brücken-Richtungszwillinge + quell-übergreifende Orts-Dubletten
  for (const f of findings) {
    if (f.kategorie === "bruecke" || f.kategorie === "tunnel") f.titel = cleanBauwerkTitel(f.titel)
  }
  findings.sort((a, b) => a.km - b.km)

  distanzKm = round1(distanzKm)
  const kritisch = findings.filter((f) => f.severity === "kritisch").length
  const warnung = findings.filter((f) => f.severity === "warnung").length
  // Reine Fahrzeit-Schätzung über die Strecke (≈50 km/h Schnitt für Schwertransport).
  // KEIN Zuschlag je Fund mehr — bei vielen Funden hätte das die Zeit unrealistisch
  // aufgebläht (734 km → 156 h war Unsinn).
  const fahrzeitMin = Math.round((distanzKm / 50) * 60)

  return {
    findings,
    distanzKm,
    fahrzeitMin,
    provider: { router: "upload", fallback: false },
    stats: {
      findings: findings.length,
      kritisch,
      warnung,
      hinweis: findings.length - kritisch - warnung,
      distanzKm,
      routen: routes.length,
    },
  }
}

/**
 * Kompletter Analyse-Lauf inkl. analysis_runs-Record und transaktionaler
 * Persistenz. Wirft bei Fehlern (Projekt bleibt dann unverändert, Run = error).
 */
export async function runAnalysis({ db, project, corridorM = 20, osrm = null }) {
  // T-467: verwaiste 'running'-Läufe (Prozess-Crash ohne finished_at) zuerst freigeben, sonst
  // blockiert der Partial-Unique-Index dauerhaft. 15 Min > jede reale Analyse (statement_timeout 2 Min).
  // WICHTIG: Der Reclaim MUSS zeit-prädikat-gebunden bleiben (nur Waisen >15 Min). Der
  // Partial-Unique-Index analysis_runs_one_running — NICHT dieser UPDATE — ist die Mutual-Exclusion;
  // ein Reclaim ohne Zeit-Prädikat ('alle running freigeben') öffnete ein Doppel-Run-Loch.
  await db.query(
    "UPDATE analysis_runs SET status = 'error', error = $2, finished_at = now() " +
      "WHERE project_id = $1 AND status = 'running' AND started_at < now() - interval '15 minutes'",
    [project.id, "stale (reclaimed)"],
  )
  let runRes
  try {
    runRes = await db.query(
      "INSERT INTO analysis_runs (project_id, status, engine_version) VALUES ($1, $2, $3) RETURNING id",
      [project.id, "running", ENGINE_VERSION],
    )
  } catch (err) {
    // analysis_runs_one_running (Partial-Unique-Index): es läuft bereits eine Auswertung für
    // dieses Projekt (Doppelklick / zweiter Disponent / Kollision mit Nacht-Rerun) → 409.
    if (err?.code === "23505") throw new ApiError(409, "Für dieses Projekt läuft bereits eine Auswertung")
    throw err
  }
  const runId = runRes.rows[0].id

  try {
    const result = await analyze({ db, project, corridorM, osrm })

    // Alte Findings ersetzen + Projekt aktualisieren — atomar
    await db.tx(async (q) => {
      await q.query("DELETE FROM findings WHERE project_id = $1", [project.id])
      // T-330: Findings als wenige Multi-Row-INSERTs statt eines INSERT-Round-Trips pro Fund.
      for (const part of chunk(result.findings, BATCH_ROWS)) {
        await q.query(
          `INSERT INTO findings (${FINDING_COLS}) VALUES ${placeholders(part.length, FINDING_COL_COUNT)}`,
          part.flatMap((f) => findingParams(project.id, f)),
        )
      }
      // updated_at NICHT anfassen: die Analyse (v.a. der nächtliche Auto-Rerun über ALLE
      // Projekte) ist keine Nutzer-Bearbeitung. Würde sie updated_at hochziehen, landeten
      // alle Projekte auf der Sync-Zeit und die „zuletzt bearbeitet"-Sortierung auf Home
      // wäre wertlos. updated_at bleibt damit = letzte echte Nutzer-Änderung (T-181).
      await q.query(
        `UPDATE projects SET status = $2, distanz_km = $3, fahrzeit_min = $4 WHERE id = $1`,
        [project.id, "fertig", result.distanzKm, result.fahrzeitMin],
      )
    })

    await db.query(
      `UPDATE analysis_runs SET status = $2, provider = $3, stats = $4, error = $5,
         finished_at = now() WHERE id = $1`,
      [runId, "done", JSON.stringify(result.provider), JSON.stringify(result.stats), null],
    )
    return result
  } catch (err) {
    await db.query(
      `UPDATE analysis_runs SET status = $2, provider = $3, stats = $4, error = $5,
         finished_at = now() WHERE id = $1`,
      [runId, "error", null, null, String(err?.message ?? err)],
    )
    throw err
  }
}
