// Row-Mapper: DB snake_case → API camelCase, exakt passend zum v2-Contract
// (SPEC-backend-v2.md — das FE wird parallel 1:1 dagegen gebaut).

import { cleanText, toIso, toIsoDate } from "./util.js"

const normName = (s) => String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ")

/** Stabile Fund-Identität über Re-Analysen hinweg (findings.id wechselt bei jeder Analyse).
 *  Primär obstacle_id|route_id; Fallback Content-Hash für Funde ohne obstacle_id (manuell/Legacy).
 *  Akzeptiert eine findings-DB-Row (snake_case). Identisch zum FE-Vertrag (FE echot nur f.key). */
export function findingKey(row) {
  const routeId = row.route_id ?? ""
  if (row.obstacle_id) return `${row.obstacle_id}|${routeId}`
  return `c|${normName(row.kategorie)}|${normName(row.titel)}|${Math.round(Number(row.km ?? 0) * 10)}|${routeId}`
}

export function rowToProject(row, findings = [], share = null) {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    tenantId: row.tenant_id,
    erstelltVon: row.created_by ?? null, // Ersteller-E-Mail (Tracking + Mail-Empfänger + Icon)
    folderId: row.folder_id ?? null, // Ordner-Zuordnung (T-177), null = Wurzel
    routes: row.routes ?? [],
    transport: row.transport ?? {},
    zeitraum: row.zeitraum ?? {},
    findings,
    ...(row.distanz_km != null && { distanzKm: Number(row.distanz_km) }),
    ...(row.fahrzeit_min != null && { fahrzeitMin: Number(row.fahrzeit_min) }),
    share, // ShareInfo | null (null = kein/revoked Share)
    archiviertAm: toIso(row.archived_at) ?? null,
  }
}

export function rowToFinding(row) {
  return {
    id: row.id,
    key: findingKey(row), // stabile Identität für Ausblenden (FE echot sie nur zurück)
    kategorie: row.kategorie,
    titel: cleanText(row.titel),
    beschreibung: cleanText(row.beschreibung),
    lat: Number(row.lat),
    lng: Number(row.lng),
    km: row.km != null ? Number(row.km) : 0,
    severity: row.severity,
    detail: row.detail ?? {},
    ...(row.obstacle_id != null && { obstacleId: row.obstacle_id }),
    ...(row.route_id != null && { routeId: row.route_id }),
    ...(row.route_name != null && { routeName: row.route_name }),
    ...(row.strassen_ref != null && { strassenRef: cleanText(row.strassen_ref) || null }),
    ...(row.gueltig_von != null && { gueltigVon: toIsoDate(row.gueltig_von) }),
    ...(row.gueltig_bis != null && { gueltigBis: toIsoDate(row.gueltig_bis) }),
    ...(row.quelle != null && { quelle: row.quelle }),
    ...(row.zustaendig != null && { zustaendig: row.zustaendig }),
    ...(row.geom != null && { geom: row.geom }),
  }
}

export function rowToObstacle(row) {
  return {
    id: row.id,
    kategorie: row.kategorie,
    name: cleanText(row.name),
    beschreibung: cleanText(row.beschreibung),
    lat: Number(row.lat),
    lng: Number(row.lng),
    strassenRef: cleanText(row.strassen_ref) || null,
    zustaendig: row.zustaendig ?? null,
    quelle: row.quelle ?? null,
    attrs: row.attrs ?? {},
    gueltigVon: toIsoDate(row.gueltig_von) ?? null,
    gueltigBis: toIsoDate(row.gueltig_bis) ?? null,
    fachId: row.fach_id ?? null,
    quellenId: row.quellen_id ?? null,
    realerStart: toIsoDate(row.realer_start) ?? null,
    aktiv: row.aktiv !== false,
    demo: row.demo === true,
    kiAufbereitet: row.ki_aufbereitet === true,
    geom: row.geom ?? null,
    // v3: tenant_id NULL = globaler Eintrag, gesetzt = Kunden-Eintrag des Mandanten
    tenantId: row.tenant_id ?? null,
    herkunft: row.tenant_id == null ? "global" : "eigen",
    externeId: row.externe_id ?? null,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  }
}

/** Quellen-Register (v3) — Admin-Sicht inkl. letzter Abruf. */
export function rowToQuelle(row) {
  return {
    id: row.id,
    name: row.name,
    typ: row.typ ?? null,
    endpointUrl: row.endpoint_url ?? null,
    abrufIntervall: row.abruf_intervall ?? null,
    letzterAbruf: toIso(row.letzter_abruf) ?? null,
    aktiv: row.aktiv !== false,
  }
}

/** Import-Protokoll-Zeile (v3) — Run-Summary für Admin-Endpoints. */
export function rowToImportRun(row) {
  return {
    id: row.id,
    quelleId: row.quelle_id,
    status: row.status,
    stats: row.stats ?? {},
    log: row.log ?? null,
    startedAt: toIso(row.started_at),
    finishedAt: toIso(row.finished_at) ?? null,
  }
}

/** Benachrichtigung (Nachrichtenzentrum/Glocke) — DB-Row → API. */
export function rowToNotification(row) {
  return {
    id: row.id,
    projektId: row.project_id ?? null,
    projektName: row.projekt_name ?? null,
    typ: row.typ,
    severity: row.severity ?? null,
    obstacleId: row.obstacle_id ?? null,
    kategorie: row.kategorie ?? null,
    titel: cleanText(row.titel),
    beschreibung: row.beschreibung != null ? cleanText(row.beschreibung) : null,
    km: row.km != null ? Number(row.km) : null,
    routeName: row.route_name ?? null,
    strassenRef: row.strassen_ref ?? null,
    gueltigVon: toIsoDate(row.gueltig_von) ?? null,
    gueltigBis: toIsoDate(row.gueltig_bis) ?? null,
    createdAt: toIso(row.created_at),
    readAt: toIso(row.read_at) ?? null,
  }
}

/**
 * Gestrippte Public-Share-Sicht: KEINE Stammdaten (transport/zeitraum), KEINE
 * Admin-Felder (status, tenantId, share, createdAt). Nur Karte + Auswertung.
 */
export function rowToShareData(row, findings = []) {
  return {
    name: row.name,
    ...(row.distanz_km != null && { distanzKm: Number(row.distanz_km) }),
    ...(row.fahrzeit_min != null && { fahrzeitMin: Number(row.fahrzeit_min) }),
    updatedAt: toIso(row.updated_at),
    routes: (row.routes ?? []).map((r) => ({
      id: r.id,
      name: r.name,
      farbe: r.farbe,
      points: r.points ?? [],
    })),
    findings,
  }
}

export function rowToBugReport(row) {
  return {
    id: row.id,
    email: row.email,
    tenantSlug: row.tenant_slug ?? null,
    isAdmin: Boolean(row.is_admin),
    beschreibung: row.beschreibung,
    viewPath: row.view_path ?? null,
    kontext: row.kontext ?? {},
    status: row.status,
    notiz: row.notiz ?? null,
    screenshot: row.screenshot ?? null,
    createdAt: toIso(row.created_at),
    resolvedAt: toIso(row.resolved_at) ?? null,
  }
}

/** source_requests-Row → API-Shape (camelCase). */
export function rowToSourceRequest(row) {
  return {
    id: row.id,
    email: row.email,
    tenantSlug: row.tenant_slug ?? null,
    url: row.url,
    beschreibung: row.beschreibung,
    status: row.status,
    notiz: row.notiz ?? null,
    createdAt: toIso(row.created_at),
    resolvedAt: toIso(row.resolved_at) ?? null,
  }
}
