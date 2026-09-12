// #15: GeoPackage (.gpkg) = SQLite-Datei mit mehreren Feature-Tabellen, je eine Strecke. Geometrie
// liegt als GPKG-Blob (Header + WKB) vor, oft in einem projizierten CRS (z.B. EPSG:4647 ETRS89/UTM32N).
// Wir lesen die Datei mit sql.js (SQLite-WASM), dekodieren die (Multi)LineString-Geometrie aus dem WKB
// und reprojizieren je Strecke nach WGS84 (lat/lng) über die im GPKG hinterlegte SRS-Definition (proj4).

import initSqlJs, { type SqlJsStatic } from "sql.js"
import wasmUrl from "sql.js/dist/sql-wasm.wasm?url"
import proj4 from "proj4"
import type { Markierung, RoutePoint } from "@/types/domain"
import { baueMarkierung, nameAusAttributen, type ParsedPunktEbene } from "./parsePunkte"

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

/** GPKG-Geometrie-Blob → [x,y]-Paare im Quell-CRS.
 *  modus "linie" liest (Multi)LineString, modus "punkt" liest (Multi)Point. Getrennt und nicht
 *  beides zugleich, damit der Streckenpfad unverändert bleibt: läse er auch Punkte, würde eine
 *  Punkttabelle mit drei Zeilen plötzlich als Strecke durchgehen. */
function decodeGpkgGeometry(u8: Uint8Array, modus: "linie" | "punkt" = "linie"): [number, number][] {
  if (u8.length < 8 || u8[0] !== 0x47 || u8[1] !== 0x50) return [] // Magic "GP"
  if ((u8[3] & 0x10) !== 0) return [] // Empty-Flag: Geometrie ist leer, es folgt nichts Brauchbares
  const envInd = (u8[3] >> 1) & 0x07 // Envelope-Indikator (Flags-Byte)
  const envBytes = ([0, 32, 48, 48, 64][envInd] ?? 0) as number
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength)
  let o = 8 + envBytes // GPKG-Header überspringen → Start der WKB

  // Eine WKB-Geometrie ab o lesen; rekursiv für die Multi-Varianten.
  const readGeom = (): [number, number][] => {
    const le = dv.getUint8(o) === 1
    o += 1
    const type = dv.getUint32(o, le)
    o += 4
    const base = type % 1000
    const dimFlag = Math.floor(type / 1000) // 0=XY,1=Z,2=M,3=ZM
    const dims = 2 + (dimFlag === 1 || dimFlag === 3 ? 1 : 0) + (dimFlag === 2 || dimFlag === 3 ? 1 : 0)
    const out: [number, number][] = []
    if (modus === "punkt" && base === 1) {
      // Point — genau eine Koordinate
      const x = dv.getFloat64(o, le)
      const y = dv.getFloat64(o + 8, le)
      o += 8 * dims
      out.push([x, y])
    } else if (modus === "punkt" && base === 4) {
      // MultiPoint — n vollständige WKB-Points hintereinander
      const np = dv.getUint32(o, le)
      o += 4
      for (let i = 0; i < np; i++) out.push(...readGeom())
    } else if (modus === "linie" && base === 2) {
      // LineString
      const n = dv.getUint32(o, le)
      o += 4
      for (let i = 0; i < n; i++) {
        const x = dv.getFloat64(o, le)
        const y = dv.getFloat64(o + 8, le)
        o += 8 * dims
        out.push([x, y])
      }
    } else if (modus === "linie" && base === 5) {
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

/** Nur für den Test: die reine WKB-Dekodierung ohne SQLite drumherum. */
export const _decodeGpkgGeometry = decodeGpkgGeometry

type GpkgDb = InstanceType<SqlJsStatic["Database"]>

/** Katalog eines GPKG: SRS-Definitionen, Geometriespalte und srs_id je Tabelle, Tabellenliste. */
function leseGpkgMeta(db: GpkgDb) {
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
  return { srs, srsOf, colOf, tables }
}

/** Reprojektion in WGS84 für eine Tabelle, oder null wenn die Koordinaten schon lng/lat sind.
 *  FALLE: proj4() wirft bei definition = 'undefined' — die GPKG-Spezifikation schreibt solche
 *  Zeilen für srs_id -1 und 0 ausdrücklich vor — und wirft dabei einen String, keine Error-Instanz.
 *  Ungefangen reißt das die ganze Datei mit. */
function srsKonverter(def: string | undefined, srsId: number): proj4.Converter | null | "kaputt" {
  if (!def || def === "undefined" || srsId === 4326 || srsId === 4979) return null
  try {
    return proj4(def, "WGS84")
  } catch {
    return "kaputt"
  }
}

/** .gpkg → alle enthaltenen Strecken (eine je Feature-Tabelle), reprojiziert nach WGS84. */
export async function parseGpkg(file: File): Promise<GpkgRoute[]> {
  const SQL = await getSql()
  const db = new SQL.Database(new Uint8Array(await file.arrayBuffer()))
  try {
    const { srs, srsOf, colOf, tables } = leseGpkgMeta(db)

    const routes: GpkgRoute[] = []
    for (const t of tables) {
      const geomCol = colOf.get(t)
      if (!geomCol) continue
      const srsId = srsOf.get(t) ?? 4326
      const def = srs[srsId]
      // WGS84 = lat/lng. Wenn keine/ identische Definition → Koordinaten sind bereits lng/lat.
      // T-739: derselbe Guard wie im Punktpfad. Vorher riss eine einzige kaputte SRS-Definition
      // (in GeoPackages der Regelfall bei srs_id -1 und 0) die GANZE Datei mit.
      const conv = srsKonverter(def, srsId)
      if (conv === "kaputt") continue
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

/** .gpkg → Punkt-Ebenen (T-739), eine je Tabelle mit Punktgeometrie. Attribute kommen aus
 *  SELECT * (sql.js liefert die Spaltennamen mit); Geometriespalte und fid bleiben außen vor.
 *  Tabellen ohne Punkte oder mit kaputter SRS-Definition werden übersprungen, nicht geworfen —
 *  eine unbrauchbare Tabelle darf die übrigen nicht mitreißen. */
export async function parseGpkgPunkte(file: File): Promise<ParsedPunktEbene[]> {
  const SQL = await getSql()
  const db = new SQL.Database(new Uint8Array(await file.arrayBuffer()))
  try {
    const { srs, srsOf, colOf, tables } = leseGpkgMeta(db)
    const ebenen: ParsedPunktEbene[] = []
    for (const t of tables) {
      const geomCol = colOf.get(t)
      if (!geomCol) continue
      const conv = srsKonverter(srs[srsOf.get(t) ?? 4326], srsOf.get(t) ?? 4326)
      if (conv === "kaputt") continue
      const res = db.exec(`SELECT * FROM "${t}"`)[0]
      if (!res) continue
      const geomIdx = res.columns.indexOf(geomCol)
      if (geomIdx < 0) continue

      const punkte: Markierung[] = []
      for (const row of res.values) {
        const blob = row[geomIdx]
        if (!(blob instanceof Uint8Array)) continue
        const attribute: Record<string, unknown> = {}
        res.columns.forEach((spalte, i) => {
          if (i === geomIdx || spalte.toLowerCase() === "fid") return
          const wert = row[i]
          if (wert !== null && !(wert instanceof Uint8Array)) attribute[spalte] = wert
        })
        const name = nameAusAttributen(attribute)
        for (const [x, y] of decodeGpkgGeometry(blob, "punkt")) {
          const [lng, lat] = conv ? conv.forward([x, y]) : [x, y]
          const punkt = baueMarkierung(lat, lng, name, attribute)
          if (punkt) punkte.push(punkt)
        }
      }
      if (punkte.length > 0) ebenen.push({ name: t, punkte })
    }
    return ebenen
  } finally {
    db.close()
  }
}
