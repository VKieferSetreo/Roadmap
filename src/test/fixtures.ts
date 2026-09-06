// Baukästen für die Frontend-Tests (T-733): ein Projekt, eine Strecke, ein Fund.
//
// Warum Builder statt Literale im Test: die Berichts-Tests unterscheiden sich jeweils in genau
// EINEM Punkt (geleertes Maß, Teilauswahl, ungeprüfte VEMAGS-Strecke). Steht das Projekt jedes
// Mal komplett im Test, geht dieser eine Punkt zwischen dreißig Zeilen Beiwerk unter — und der
// Leser sieht nicht mehr, was der Test eigentlich behauptet.

import type { Finding, Project, ProjectRoute, RoutePoint, TransportData } from "@/types/domain"

// Fortlaufende IDs: mehrere Strecken in einem Projekt brauchen verschiedene ids, sonst zieht
// `routen.map(r => r.id)` sie zusammen und die Fund-Zuordnung im Bericht wird zufällig.
let lfd = 0
const naechsteId = (praefix: string) => `${praefix}-${++lfd}`

// Kilometer je Grad geografischer Breite bei R = 6371 km — exakt der Radius, mit dem
// routeLengthKm rechnet (parseRouteFile.ts:169). Damit ergibt punkteMitLaenge(120) im Bericht
// auch wirklich „120 km" und der Test kann eine Zahl behaupten statt einer Größenordnung.
const KM_JE_GRAD_BREITE = (2 * Math.PI * 6371) / 360

/** Zwei Punkte auf demselben Längengrad, deren Abstand exakt `km` Kilometer beträgt. */
export function punkteMitLaenge(km: number, startLat = 52, lng = 10): RoutePoint[] {
  return [
    { lat: startLat, lng },
    { lat: startLat + km / KM_JE_GRAD_BREITE, lng },
  ]
}

/** Eine Strecke. `laengeKm` setzt die Geometrie, alles andere überschreibt direkt. */
export function strecke(over: Partial<ProjectRoute> & { laengeKm?: number } = {}): ProjectRoute {
  const { laengeKm = 120, ...rest } = over
  return {
    id: naechsteId("route"),
    name: "Nordroute",
    points: punkteMitLaenge(laengeKm),
    farbe: "#2563EB",
    source: "datei",
    ...rest,
  }
}

/** Eine ungeprüfte VEMAGS-Strecke (Prüfen-Gate, T-593): existiert im Projekt, ist aber nie
 *  ausgewertet worden — genau der Fall, an dem der Bericht eine Freigabe aussprach (T-731). */
export function ungeprueteVemagsStrecke(
  over: Partial<ProjectRoute> & { laengeKm?: number } = {},
): ProjectRoute {
  return strecke({ name: "Aus VEMAGS-Bescheid", source: "vemags", verifiziert: false, ...over })
}

/** Ein Fund. Default: kritisch, auf km 12, ohne Streckenzuordnung. */
export function fund(over: Partial<Finding> = {}): Finding {
  return {
    id: naechsteId("fund"),
    kategorie: "bruecke",
    titel: "Brücke Elbeweg",
    beschreibung: "Durchfahrtshöhe geringer als die Transporthöhe.",
    lat: 52.1,
    lng: 10.1,
    km: 12,
    severity: "kritisch",
    detail: {},
    ...over,
  }
}

/** Transport-Overrides dürfen ein Feld ausdrücklich auf `undefined` setzen — das ist der Zustand,
 *  den TransportDataForm beim Leeren eines Feldes wirklich schreibt (und der T-721 ausgelöst hat).
 *  Die Domäne deklariert die vier Maße als `number`; genau diese Zusage hält die Anwendung nicht
 *  ein, deshalb steht hier ein Cast statt einer Typänderung am Produktionscode. */
type ProjektOverrides = Partial<Omit<Project, "transport">> & { transport?: Partial<TransportData> }

export function projekt(over: ProjektOverrides = {}): Project {
  const { transport, ...rest } = over
  return {
    id: naechsteId("projekt"),
    name: "Turbine nach Hamburg",
    status: "fertig",
    createdAt: "2026-08-01T09:00:00.000Z",
    updatedAt: "2026-09-01T09:00:00.000Z",
    routes: [strecke()],
    findings: [],
    zeitraum: {},
    transport: {
      laenge: 24.5,
      breite: 3,
      hoehe: 4.2,
      gesamtgewicht: 68,
      ...transport,
    } as TransportData,
    ...rest,
  }
}
