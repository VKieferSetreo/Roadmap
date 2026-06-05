// Domänen-Modell für Roadmap — Schwertransport-Routenanalyse.
// Frontend-only: alle Typen werden aktuell aus dem Mock-Store (zustand) bedient,
// sind aber so geschnitten, dass ein späteres Backend sie 1:1 liefern kann.

/** Lebenszyklus eines Projekts. */
export type ProjectStatus = "entwurf" | "analyse" | "fertig"

/** Wie die Strecke definiert wurde. */
export type RouteMode = "upload" | "startziel"

export interface RouteInput {
  mode: RouteMode
  /** bei mode="upload": Name der hochgeladenen Streckendatei (GPX/KML/…). */
  fileName?: string
  /** bei mode="startziel": Start-Ort. */
  start?: string
  /** bei mode="startziel": Ziel-Ort. */
  ziel?: string
  /** optionale Zwischenstationen (nur startziel). */
  vias?: string[]
}

/** Stammdaten des Transports — bestimmen, was auf der Strecke zum Problem wird. */
export interface TransportData {
  fahrzeugTyp: string
  /** Gesamtlänge in Metern. */
  laenge: number
  /** Gesamtbreite in Metern. */
  breite: number
  /** Gesamthöhe in Metern. */
  hoehe: number
  /** Gesamtgewicht in Tonnen. */
  gesamtgewicht: number
  /** maximale Achslast in Tonnen. */
  achslast: number
  /** Anzahl Achsen. */
  achsen: number
  /** Beschreibung der Ladung. */
  ladung: string
}

export type FindingKategorie =
  | "bruecke"
  | "engstelle"
  | "baustelle"
  | "gewicht"
  | "bahnuebergang"
  | "kreisverkehr"
  | "ampel"
  | "steigung"
  | "tunnel"

/** Wie kritisch ein Fund für den konkreten Transport ist. */
export type FindingSeverity = "kritisch" | "warnung" | "hinweis"

/** Ein auf der Strecke gefundenes Hindernis / eine Auffälligkeit. */
export interface Finding {
  id: string
  kategorie: FindingKategorie
  titel: string
  beschreibung: string
  lat: number
  lng: number
  /** Position entlang der Strecke in Kilometern ab Start. */
  km: number
  severity: FindingSeverity
  /** Strukturierte Detailwerte, z.B. { "Durchfahrtshöhe": "3,80 m" }. */
  detail: Record<string, string>
}

export interface RoutePoint {
  lat: number
  lng: number
}

export interface Project {
  id: string
  name: string
  status: ProjectStatus
  /** ISO-Zeitstempel. */
  createdAt: string
  updatedAt: string
  route: RouteInput
  transport: TransportData
  /** Polyline der Strecke (leer bis zur Analyse). */
  routeGeometry: RoutePoint[]
  findings: Finding[]
  /** Streckenlänge in km (nach Analyse gesetzt). */
  distanzKm?: number
  /** geschätzte Fahrzeit in Minuten (nach Analyse gesetzt). */
  fahrzeitMin?: number
}

/** Default-Stammdaten für ein frisch angelegtes Projekt (typischer Schwertransport). */
export const DEFAULT_TRANSPORT: TransportData = {
  fahrzeugTyp: "Sattelzug mit Tieflader",
  laenge: 24.5,
  breite: 3.0,
  hoehe: 4.2,
  gesamtgewicht: 68,
  achslast: 11.5,
  achsen: 8,
  ladung: "",
}
