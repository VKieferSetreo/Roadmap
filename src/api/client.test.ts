// Fehler-Übersetzung des Response-Interceptors (T-733: erste Frontend-Tests des Projekts).
//
// Getestet wird nicht über echtes HTTP, sondern über einen Adapter, der genau so scheitert wie
// axios im Ernstfall. Damit läuft die volle Kette — Request-Interceptor, dispatchRequest,
// Response-Interceptor — und geprüft wird das, was die Oberfläche am Ende in der Hand hält.

import { describe, it, expect, vi, beforeEach } from "vitest"
import { AxiosError, type InternalAxiosRequestConfig } from "axios"
import { axiosInstance, ApiError } from "./client"

let warnSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  // Der Interceptor schreibt die Original-Zeile bewusst in die Konsole (T-728k). Hier wird sie
  // abgefangen, damit sie den Testlauf nicht zumüllt — und geprüft, dass sie ankommt.
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
})

/** Lässt genau einen Aufruf scheitern wie axios es täte und liefert den Fehler zurück, den die
 *  Oberfläche zu sehen bekommt. */
async function fehlerBeimAufruf(opts: {
  /** Die englische Original-Zeile von axios. */
  message: string
  code?: string
  antwort?: { status: number; data?: unknown }
  url?: string
  method?: string
}): Promise<ApiError> {
  const adapter = (config: InternalAxiosRequestConfig) =>
    Promise.reject(
      new AxiosError(
        opts.message,
        opts.code,
        config,
        {},
        opts.antwort
          ? {
              data: opts.antwort.data,
              status: opts.antwort.status,
              statusText: "",
              headers: {},
              config,
            }
          : undefined,
      ),
    )
  try {
    await axiosInstance.request({
      url: opts.url ?? "/projects",
      method: opts.method ?? "get",
      adapter,
    })
  } catch (err) {
    if (err instanceof ApiError) return err
    throw err
  }
  throw new Error("Der Aufruf hätte scheitern müssen, tat es aber nicht")
}

/** Wortmarken der englischen axios-Meldungen. Keine davon darf beim Nutzer landen. */
const ENGLISCH = /Network Error|timeout of|exceeded|Request failed with status code/

// T-724: Der ApiError wurde aus error.message gebaut, also aus der englischen axios-Zeile. Weil
// die Aufrufer `err instanceof ApiError ? err.message : "<deutscher Fallback>"` schreiben, gewann
// immer die englische Zeile über den guten Fallback: der Disponent klickte „Route berechnen" und
// bekam „timeout of 30000ms exceeded" als Toast.
describe("Response-Interceptor — Netz und Zeitüberschreitung", () => {
  it("sagt bei fehlender Verbindung einen deutschen Satz statt Network Error", async () => {
    const err = await fehlerBeimAufruf({ message: "Network Error", code: "ERR_NETWORK" })
    expect(err.message).toBe("Keine Verbindung zum Setreo-Server. Bitte Netzwerkverbindung prüfen.")
    expect(err.message).not.toMatch(ENGLISCH)
    expect(err.code).toBe("NETWORK_ERROR")
    expect(err.status).toBe(0)
  })

  it("sagt bei Zeitüberschreitung einen deutschen Satz statt timeout of 30000ms exceeded", async () => {
    const err = await fehlerBeimAufruf({
      message: "timeout of 30000ms exceeded",
      code: "ECONNABORTED",
    })
    expect(err.message).toBe("Der Server hat nicht rechtzeitig geantwortet. Bitte erneut versuchen.")
    expect(err.message).not.toMatch(ENGLISCH)
    expect(err.code).toBe("TIMEOUT")
  })

  // Genau das ist der Grund, warum der deutsche Fallback der Aufrufer nie zog: es IST ein
  // ApiError, der Fallback wird gar nicht erst erreicht.
  it("wirft einen ApiError — der deutsche Fallback der Aufrufer greift hier nie", async () => {
    const err = await fehlerBeimAufruf({ message: "Network Error", code: "ERR_NETWORK" })
    expect(err).toBeInstanceOf(ApiError)
    expect(err.name).toBe("ApiError")
  })
})

// Drei Texte statt zwei: kam eine Antwort MIT Status (z.B. 502 vom Proxy, Body nicht lesbar), wäre
// „Netzwerkverbindung prüfen" eine falsche Anweisung — das Netz des Nutzers ist heil.
describe("Response-Interceptor — Antwort mit Status, aber ohne lesbaren Körper", () => {
  it("nennt bei einem 502 vom Proxy die Fehlernummer statt Request failed with status code 502", async () => {
    const err = await fehlerBeimAufruf({
      message: "Request failed with status code 502",
      antwort: { status: 502, data: "<html><body>502 Bad Gateway</body></html>" },
    })
    expect(err.message).toBe(
      "Der Server konnte die Anfrage nicht verarbeiten (Fehler 502). Bitte in wenigen Minuten erneut versuchen.",
    )
    expect(err.message).not.toMatch(ENGLISCH)
    expect(err.status).toBe(502)
  })

  it("schickt den Nutzer bei einem 502 nicht fälschlich in die eigene Netzwerkeinstellung", async () => {
    const err = await fehlerBeimAufruf({
      message: "Request failed with status code 502",
      antwort: { status: 502, data: "<html><body>502 Bad Gateway</body></html>" },
    })
    expect(err.message).not.toContain("Netzwerkverbindung")
  })
})

// T-728j: „Bitte in wenigen Minuten erneut versuchen" ist beim 413 eine Anweisung, die nie
// funktioniert — dieselbe Datei ist in fünf Minuten genauso groß. Der Fall ist real erreichbar:
// das FE lässt PDFs bis 12 MB durch, express nimmt nur 20 MB, ein vorgelagerter Proxy riegelt
// womöglich früher ab. Kommt das 413 vom Proxy, ist der Körper kein JSON und landet genau hier.
describe("Response-Interceptor — zu große Datei (413)", () => {
  it("rät bei einer zu großen Datei zu einer kleineren Datei, nicht zum Abwarten", async () => {
    const err = await fehlerBeimAufruf({
      message: "Request failed with status code 413",
      antwort: { status: 413, data: "<html>413 Request Entity Too Large</html>" },
      method: "post",
      url: "/projects/1/bescheid",
    })
    expect(err.message).toContain("zu groß")
    expect(err.message).toContain("kleinere Datei")
  })

  it("gibt beim 413 keinen Rat, der dort nie hilft", async () => {
    const err = await fehlerBeimAufruf({
      message: "Request failed with status code 413",
      antwort: { status: 413, data: "<html>413 Request Entity Too Large</html>" },
      method: "post",
      url: "/projects/1/bescheid",
    })
    expect(err.message).not.toContain("erneut versuchen")
    expect(err.message).not.toContain("in wenigen Minuten")
    expect(err.status).toBe(413)
  })
})

// T-728k: details rendert keine Oberfläche (ErrorState zeigt nur message, code, requestId) — seit
// T-724 wäre die Original-Zeile damit nirgends mehr sichtbar. Für den Support ist genau sie die
// Diagnose („Network Error" gegen „timeout of 30000ms exceeded"), also geht sie zusätzlich in die
// Konsole, zusammen mit Methode, Pfad und Status.
describe("Response-Interceptor — die Original-Meldung geht nicht verloren", () => {
  it("hebt die englische Original-Zeile in details auf", async () => {
    const err = await fehlerBeimAufruf({ message: "Network Error", code: "ERR_NETWORK" })
    expect(err.details).toBe("Network Error")
  })

  it("schreibt Methode, Pfad, Status und Original-Zeile in die Konsole", async () => {
    await fehlerBeimAufruf({
      message: "Request failed with status code 502",
      antwort: { status: 502, data: "<html>502</html>" },
      method: "post",
      url: "/route/startziel",
    })
    const zeile = String(warnSpy.mock.calls.at(-1)?.[0])
    expect(zeile).toContain("[Roadmap]")
    expect(zeile).toContain("POST")
    expect(zeile).toContain("/route/startziel")
    expect(zeile).toContain("502")
    expect(zeile).toContain("Request failed with status code 502")
  })

  it("schreibt bei ausgefallenem Netz den Vermerk keine Antwort statt eines erfundenen Status", async () => {
    await fehlerBeimAufruf({ message: "Network Error", code: "ERR_NETWORK" })
    expect(String(warnSpy.mock.calls.at(-1)?.[0])).toContain("keine Antwort")
  })
})

// T-316: Das Backend liefert seinen Fehlerkontrakt als {error:"…deutsche Meldung…"}. Die festen
// deutschen Texte von T-724 dürfen diese Meldung nicht überschreiben — sie ist die genauere.
describe("Response-Interceptor — Meldungen des Servers", () => {
  it("reicht die deutsche Server-Meldung aus dem error-Feld unverändert durch", async () => {
    const err = await fehlerBeimAufruf({
      message: "Request failed with status code 400",
      antwort: { status: 400, data: { error: "Die Strecke enthält keine Punkte." } },
    })
    expect(err.message).toBe("Die Strecke enthält keine Punkte.")
    expect(err.code).toBe("HTTP_400")
    expect(err.status).toBe(400)
  })

  it("übernimmt den vollen Fehlerkontrakt mit Code und Request-Id, wenn der Server ihn liefert", async () => {
    const err = await fehlerBeimAufruf({
      message: "Request failed with status code 422",
      antwort: {
        status: 422,
        data: {
          code: "ROUTE_UNBERECHENBAR",
          message: "Zwischen Start und Ziel gibt es keinen befahrbaren Weg.",
          request_id: "req-4711",
        },
      },
    })
    expect(err.message).toBe("Zwischen Start und Ziel gibt es keinen befahrbaren Weg.")
    expect(err.code).toBe("ROUTE_UNBERECHENBAR")
    expect(err.requestId).toBe("req-4711")
  })
})
