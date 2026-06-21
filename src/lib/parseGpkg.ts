// #15: GeoPackage (.gpkg) = SQLite-Datei mit mehreren Feature-Tabellen, je eine Strecke. Geometrie
// liegt als GPKG-Blob (Header + WKB) vor, oft in einem projizierten CRS (z.B. EPSG:4647 ETRS89/UTM32N).
// Wir lesen die Datei mit sql.js (SQLite-WASM), dekodieren die (Multi)LineString-Geometrie aus dem WKB
// und reprojizieren je Strecke nach WGS84 (lat/lng) über die im GPKG hinterlegte SRS-Definition (proj4).

import initSqlJs, { type SqlJsStatic } from "sql.js"
import wasmUrl from "sql.js/dist/sql-wasm.wasm?url"
import proj4 from "proj4"
import type { RoutePoint } from "@/types/domain"

export interface GpkgRoute {
  name: string
  points: RoutePoint[]
}

let sqlPromise: Promise<SqlJsStatic> | null = null
function getSql() {
  if (!sqlPromise) sqlPromise = initSqlJs({ locateFile: () => wasmUrl })
  return sqlPromise
}

/** Gleichmäßig auf max Punkte ausdünnen (Start + Ende bleiben). */
function downsample(points: RoutePoint[], max = 2000): RoutePoint[] {
  if (points.length <= max) return points
  const step = (points.length - 1) / (max - 1)
  return Array.from({ length: max }, (_, i) => points[Math.round(i * step)])
}

/** GPKG-Geometrie-Blob → [x,y]-Paare im Quell-CRS ((Multi)LineString; Punkt-/Polygon ignoriert). */
function decodeGpkgGeometry(u8: Uint8Array): [number, number][] {
  if (u8.length < 8 || u8[0] !== 0x47 || u8[1] !== 0x50) return [] // Magic "GP"
  const envInd = (u8[3] >> 1) & 0x07 // Envelope-Indikator (Flags-Byte)
  const envBytes = ([0, 32, 48, 48, 64][envInd] ?? 0) as number
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength)
  let o = 8 + envBytes // GPKG-Header überspringen → Start der WKB

  // Eine WKB-Geometrie ab o lesen; sammelt LineString-Punkte (rekursiv für MultiLineString).
  const readGeom = (): [number, number][] => {
    const le = dv.getUint8(o) === 1
    o += 1
    const type = dv.getUint32(o, le)
    o += 4
    const base = type % 1000
    const dimFlag = Math.floor(type / 1000) // 0=XY,1=Z,2=M,3=ZM
    const dims = 2 + (dimFlag === 1 || dimFlag === 3 ? 1 : 0) + (dimFlag === 2 || dimFlag === 3 ? 1 : 0)
    const out: [number, number][] = []
    if (base === 2) {
      // LineString
      const n = dv.getUint32(o, le)
      o += 4
      for (let i = 0; i < n; i++) {
        const x = dv.getFloat64(o, le)
        const y = dv.getFloat64(o + 8, le)
        o += 8 * dims
        out.push([x, y])
      }
    } else if (base === 5) {
      // MultiLineString — n vollständige WKB-LineStrings hintereinander
      const nl = dv.getUint32(o, le)
      o += 4
      for (let i = 0; i < nl; i++) out.push(...readGeom())
    }
    return out
  }
  try {
    return readGeom()
  } catch {
    return []
  }
}

/** .gpkg → alle enthaltenen Strecken (eine je Feature-Tabelle), reprojiziert nach WGS84. */
export async function parseGpkg(file: File): Promise<GpkgRoute[]> {
  const SQL = await getSql()
  const db = new SQL.Database(new Uint8Array(await file.arrayBuffer()))
  try {
    // SRS-Definitionen (WKT/proj4) je srs_id aus dem GPKG selbst — kein Hardcoding von EPSG:4647.
    const srs: Record<number, string> = {}
    for (const r of db.exec("SELECT srs_id, definition FROM gpkg_spatial_ref_sys")[0]?.values ?? []) {
      srs[Number(r[0])] = String(r[1])
    }
    const geomCols = db.exec("SELECT table_name, column_name, srs_id FROM gpkg_geometry_columns")[0]?.values ?? []
    const srsOf = new Map<string, number>()
    const colOf = new Map<string, string>()
    for (const r of geomCols) {
      srsOf.set(String(r[0]), Number(r[2]))
      colOf.set(String(r[0]), String(r[1]))
    }
    const tables = (db.exec("SELECT table_name FROM gpkg_contents WHERE data_type = 'features' ORDER BY table_name")[0]?.values ?? []).map(
      (r) => String(r[0]),
    )

    const routes: GpkgRoute[] = []
    for (const t of tables) {
      const geomCol = colOf.get(t)
      if (!geomCol) continue
      const srsId = srsOf.get(t) ?? 4326
      const def = srs[srsId]
      // WGS84 = lat/lng. Wenn keine/ identische Definition → Koordinaten sind bereits lng/lat.
      const conv = def && srsId !== 4326 && srsId !== 4979 ? proj4(def, "WGS84") : null
      const res = db.exec(`SELECT "${geomCol}" FROM "${t}"`)[0]
      if (!res) continue
      const pts: RoutePoint[] = []
      for (const row of res.values) {
        const blob = row[0]
        if (!(blob instanceof Uint8Array)) continue
        for (const [x, y] of decodeGpkgGeometry(blob)) {
          const [lng, lat] = conv ? conv.forward([x, y]) : [x, y]
          if (Number.isFinite(lat) && Number.isFinite(lng)) pts.push({ lat, lng })
        }
      }
      if (pts.length >= 2) routes.push({ name: t, points: downsample(pts) })
    }
    return routes
  } finally {
    db.close()
  }
}
