// Row-Mapper: DB snake_case → API camelCase, exakt passend zu src/types/domain.ts.

import { toIso, toIsoDate } from "./util.js"

export function rowToProject(row, findings = []) {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    route: row.route_input ?? {},
    transport: row.transport ?? {},
    zeitraum: row.zeitraum ?? {},
    routeGeometry: row.route_geometry ?? [],
    findings,
    ...(row.distanz_km != null && { distanzKm: Number(row.distanz_km) }),
    ...(row.fahrzeit_min != null && { fahrzeitMin: Number(row.fahrzeit_min) }),
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
    aktiv: row.aktiv !== false,
    demo: row.demo === true,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  }
}
