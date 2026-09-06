// Single-Source axios-Instance:
//  - baseURL aus VITE_API_BASE_URL
//  - Request-Interceptor: X-Request-Id (auto-uuid), X-Trace-Id (propagation), Auth-Bearer
//  - Response-Interceptor: 401 → auth-failure-Event, typed ApiError-Mapping

import axios, { AxiosError, type AxiosRequestConfig, type AxiosResponse } from "axios"
import { newRequestId, getTraceId, persistTraceId } from "@/lib/trace"

export interface ApiErrorBody {
  code: string
  message: string
  request_id?: string
  details?: unknown
}

export class ApiError extends Error {
  status: number
  code: string
  requestId?: string
  details?: unknown

  constructor(body: ApiErrorBody, status: number) {
    super(body.message)
    this.name = "ApiError"
    this.status = status
    this.code = body.code
    this.requestId = body.request_id
    this.details = body.details
  }
}

const AUTH_STORAGE_KEY = "roadmap-auth-token"

export function getAuthToken(): string | null {
  if (typeof window === "undefined") return null
  try {
    return window.localStorage.getItem(AUTH_STORAGE_KEY)
  } catch {
    return null
  }
}

export function setAuthToken(token: string | null) {
  if (typeof window === "undefined") return
  try {
    if (token) window.localStorage.setItem(AUTH_STORAGE_KEY, token)
    else window.localStorage.removeItem(AUTH_STORAGE_KEY)
  } catch {
    // localStorage nicht verfügbar
  }
}

export const AUTH_FAILURE_EVENT = "roadmap:auth-failure"

function dispatchAuthFailure() {
  if (typeof window === "undefined") return
  window.dispatchEvent(new CustomEvent(AUTH_FAILURE_EVENT))
}

// Default: API liegt unter dem App-Basepfad (Dev "/api" via Vite-Proxy,
// Prod-Build "/roadmap/api" hinter dem setreo-proxy).
const baseURL = import.meta.env.VITE_API_BASE_URL ?? `${import.meta.env.BASE_URL}api`

export const axiosInstance = axios.create({
  baseURL,
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },
  timeout: 30_000,
})

// Aktiver Mandant (nur für Setreo-Admins relevant — wählt den Tenant-Kontext serverseitig).
// Wird vom Context-Store gesetzt; normale Nutzer haben ihren Tenant serverseitig fix.
// In localStorage gespiegelt, damit der gewählte Mandant einen Seiten-Reload überlebt
// (Mandantenwechsel lädt die Seite neu, damit alle Komponenten frisch fetchen).
const TENANT_STORAGE_KEY = "roadmap-tenant"

let tenantSlug: string | null = (() => {
  if (typeof window === "undefined") return null
  try {
    return window.localStorage.getItem(TENANT_STORAGE_KEY)
  } catch {
    return null
  }
})()

export function setTenantHeader(slug: string | null) {
  tenantSlug = slug
  if (typeof window === "undefined") return
  try {
    if (slug) window.localStorage.setItem(TENANT_STORAGE_KEY, slug)
    else window.localStorage.removeItem(TENANT_STORAGE_KEY)
  } catch {
    // localStorage nicht verfügbar
  }
}

axiosInstance.interceptors.request.use((config) => {
  config.headers.set("X-Request-Id", newRequestId())
  // T-322: FE-Build-Version mitschicken (Deploy-Skew passiv diagnostizierbar in API-Logs/GlitchTip).
  // Wert aus dem Build-Stempel VITE_BUILD_SHA; "dev" im lokalen Dev-Server.
  config.headers.set("X-FE-Version", import.meta.env.VITE_BUILD_SHA || "dev")
  const traceId = getTraceId()
  if (traceId) {
    config.headers.set("X-Trace-Id", traceId)
  }
  if (tenantSlug) {
    config.headers.set("X-Tenant", tenantSlug)
  }
  const token = getAuthToken()
  if (token) {
    config.headers.set("Authorization", `Bearer ${token}`)
  }
  return config
})

axiosInstance.interceptors.response.use(
  (response) => {
    const traceId = response.headers["x-trace-id"]
    if (typeof traceId === "string" && traceId.length > 0) {
      persistTraceId(traceId)
    }
    return response
  },
  (error: AxiosError<ApiErrorBody>) => {
    if (error.response?.status === 401) {
      setAuthToken(null)
      dispatchAuthFailure()
    }

    if (error.response?.data && typeof error.response.data === "object") {
      const body = error.response.data as ApiErrorBody & { error?: string }
      if (body.code && body.message) {
        return Promise.reject(new ApiError(body, error.response.status))
      }
      // T-316: Das Backend liefert seinen Fehlerkontrakt als {error:"…deutsche Meldung…"}.
      // Ohne dieses Mapping ginge JEDE Server-Meldung als generischer englischer NETWORK_ERROR
      // verloren (FE erwartete nur {code,message}). Status bleibt für die status-basierte Logik erhalten.
      if (typeof body.error === "string" && body.error) {
        return Promise.reject(
          new ApiError({ code: `HTTP_${error.response.status}`, message: body.error }, error.response.status),
        )
      }
    }

    // T-724: Hier stand bis zuletzt error.message — und das ist die englische axios-Zeile
    // ("Network Error", "timeout of 30000ms exceeded", "Request failed with status code 502").
    // Da die Aufrufer `err instanceof ApiError ? err.message : "<deutscher Fallback>"` schreiben,
    // gewann genau diese Zeile über den guten Fallback: der Disponent klickte „Route berechnen"
    // und bekam „timeout of 30000ms exceeded" als Toast. Deshalb feste deutsche Texte statt
    // Durchreichen; die Original-Meldung wandert unverändert nach details, damit der Support sie
    // weiterhin hat (sie darf nicht verlorengehen, sie ist nur nichts für den Nutzer).
    // Drei Texte statt zwei: kam eine Antwort MIT Status (z.B. 502 vom Proxy, Body nicht lesbar),
    // wäre „Netzwerkverbindung prüfen" eine falsche Anweisung — das Netz des Nutzers ist heil.
    // Die code-Einteilung (TIMEOUT/NETWORK_ERROR) bleibt unangetastet, sie steht als Support-Kürzel
    // im ErrorState; der Status steht zusätzlich im Klartext der Meldung.
    const timeout = error.code === "ECONNABORTED"
    const status = error.response?.status ?? 0
    // T-728j: 413 aus dem Sammel-Zweig herausgezogen. „Bitte in wenigen Minuten erneut versuchen"
    // ist hier eine Anweisung, die nie funktioniert: dieselbe Datei ist in fünf Minuten genauso
    // groß. Der Fall ist real erreichbar — das FE lässt PDFs bis 12 MB durch (RouteTab), die
    // DropZone je nach Aufruf bis 50 MB, express nimmt aber nur 20 MB (server/src/app.js) und ein
    // vorgelagerter Proxy kann noch früher abriegeln. Kommt das 413 vom Proxy statt von express,
    // ist der Body kein JSON und landet genau hier statt im {error}-Zweig oben.
    const message = timeout
      ? "Der Server hat nicht rechtzeitig geantwortet. Bitte erneut versuchen."
      : status === 413
        ? "Die Datei ist zu groß für den Server. Bitte eine kleinere Datei hochladen — erneutes Senden ändert daran nichts."
        : status > 0
          ? `Der Server konnte die Anfrage nicht verarbeiten (Fehler ${status}). Bitte in wenigen Minuten erneut versuchen.`
          : "Keine Verbindung zum Setreo-Server. Bitte Netzwerkverbindung prüfen."

    // T-728k: details wird von keiner Oberfläche gerendert (ErrorState zeigt nur message, code,
    // requestId) — seit T-724 wäre die Original-Zeile damit nirgends mehr sichtbar gewesen. Für den
    // Support ist genau sie die Diagnose („Network Error" vs. „timeout of 30000ms exceeded"), also
    // geht sie zusätzlich in die Konsole, zusammen mit Methode/Pfad/Status. Konsole statt Oberfläche,
    // weil der Disponent mit der englischen Zeile nichts anfangen kann; am Telefon reicht F12.
    // Prefix „[Roadmap]" wie in der ErrorBoundary, damit beides im selben Filter auftaucht.
    console.warn(
      `[Roadmap] API ${error.config?.method?.toUpperCase() ?? "?"} ${error.config?.url ?? "?"} → ${status || "keine Antwort"}: ${error.message}`,
    )

    return Promise.reject(
      new ApiError(
        {
          code: timeout ? "TIMEOUT" : "NETWORK_ERROR",
          message,
          details: error.message,
        },
        status,
      ),
    )
  },
)

export const axiosClient = <T>(config: AxiosRequestConfig): Promise<T> => {
  return axiosInstance.request<unknown, AxiosResponse<T>>(config).then((res) => res.data)
}

export default axiosClient
