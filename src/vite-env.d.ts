/// <reference types="vite/client" />

// shpjs liefert keine Typen — minimaler Stub für unseren Nutzungsumfang.
// ACHTUNG: parseZip/parseShp/parseDbf sind NAMED exports (shpjs/lib/index.js). Am Default hängt
// allein getShapefile. Ein Aufruf über den Default wirft zur Laufzeit.
declare module "shpjs" {
  /** Was parseZip liefert: eine FeatureCollection je .shp im Archiv. */
  interface ShpFeatureCollection {
    type?: string
    features?: unknown[]
    /** Basisname der .shp im Archiv — unser Ebenenname. */
    fileName?: string
  }
  export function parseZip(
    buffer: ArrayBuffer | Uint8Array,
    whiteList?: string[],
  ): Promise<ShpFeatureCollection | ShpFeatureCollection[]>
  export function parseShp(buffer: ArrayBuffer | DataView, prj?: unknown): unknown[]
  export function parseDbf(dbf: ArrayBuffer | DataView, cpg?: string): Record<string, unknown>[]

  /** Der Default kann NUR das: eine Datei/URL laden und als FeatureCollection zurückgeben.
   *  parseShp/parseDbf/parseZip hängen ausschließlich an den named exports oben. */
  const shp: (input: ArrayBuffer | string) => Promise<unknown>
  export default shp
}

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string
  readonly VITE_SENTRY_DSN?: string
  readonly VITE_BUILD_SHA?: string
  readonly VITE_BUILD_TIMESTAMP?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
