/// <reference types="vite/client" />

// shpjs liefert keine Typen — minimaler Stub für unseren Nutzungsumfang.
declare module "shpjs" {
  interface ShpFn {
    (input: ArrayBuffer | string): Promise<unknown>
    parseShp(buffer: ArrayBuffer, prj?: string): unknown[]
  }
  const shp: ShpFn
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
