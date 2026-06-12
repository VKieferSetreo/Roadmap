// Row-Mapper: DB snake_case → API camelCase, exakt passend zum v2-Contract
// (SPEC-backend-v2.md — das FE wird parallel 1:1 dagegen gebaut).

import { toIso, toIsoDate } from "./util.js"

export function rowToProject(row, findings = [], share = null) {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    tenantId: row.tenant_id,
    routes: row.routes ?? [],
    transport: row.transport ?? {},
    zeitraum: row.zeitraum ?? {},
    findings,
    ...(row.distanz_km != null && { distanzKm: Number(row.distanz_km) }),
    ...(row.fahrzeit_min != null && { fahrzeitMin: Number(row.fahrzeit_min) }),
    share, // ShareInfo | null (null = kein/revoked Share)
  }
}

export function rowToFinding(row) {
  return {
    id: row.id,
    kategorie: row.kategorie,
    titel: row.titel ?? "",
    beschreibung: row.beschreibung ?? "",
    lat: Number(row.lat),
    lng: Number(row.lng),
    km: row.km != null ? Number(row.km) : 0,
    severity: row.severity,
    detail: row.detail ?? {},
    ...(row.route_id != null && { routeId: row.route_id }),
    ...(row.route_name != null && { routeName: row.route_name }),
    ...(row.strassen_ref != null && { strassenRef: row.strassen_ref }),
    ...(row.gueltig_von != null && { gueltigVon: toIsoDate(row.gueltig_von) }),
    ...(row.gueltig_bis != null && { gueltigBis: toIsoDate(row.gueltig_bis) }),
    ...(row.quelle != null && { quelle: row.quelle }),
    ...(row.zustaendig != null && { zustaendig: row.zustaendig }),
  }
}

export function rowToObstacle(row) {
  return {
    id: row.id,
    kategorie: row.kategorie,
    name: row.name ?? "",
    beschreibung: row.beschreibung ?? "",
    lat: Number(row.lat),
    lng: Number(row.lng),
    strassenRef: row.strassen_ref ?? null,
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
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
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
