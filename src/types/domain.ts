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
  /** bei mode="upload": aus der Datei geparste Strecken-Geometrie (GPX/KML/GeoJSON).
   *  Shapefiles haben (noch) keine Client-Parsing-Unterstützung → points bleibt leer. */
  points?: RoutePoint[]
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
  /** Gesamtgewicht (Zugfahrzeug + Ladung) in Tonnen. */
  gesamtgewicht: number
  /** maximale Achslast in Tonnen. */
  achslast: number
  /** Anzahl Achsen. */
  achsen: number
  /** Beschreibung der Ladung. */
  ladung: string
  /** Reines Ladungsgewicht in Tonnen (für Plausibilitätsprüfung gegen gesamtgewicht). */
  ladungsgewicht?: number
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

/** Datenquelle eines Funds (Behörde, API, OSM …). */
export interface FindingSource {
  name: string
  url: string
  /** ISO-Datum oder relativer Text, z.B. "vor 12 min". */
  aktualisiertAm: string
}

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
  /** Konkrete Straßen-/km-Referenz, z.B. "A24 km 102,3". */
  strassenRef?: string
  /** Gültigkeitszeitraum als ISO-Datum (YYYY-MM-DD). */
  gueltigVon?: string
  gueltigBis?: string
  /** Optionale Datenquelle (Behörde, API, OSM …) mit klickbarem URL. */
  quelle?: FindingSource
  /** Zuständige Stelle (Behörde, Niederlassung). */
  zustaendig?: string
}

export interface RoutePoint {
  lat: number
  lng: number
}

/** Transport-Zeitraum (datetime im ISO-Format YYYY-MM-DDTHH:mm). */
export interface TransportZeitraum {
  von?: string
  bis?: string
  /** Wenn true, gilt der gesamte Tag (00:00 → 23:59) und die Uhrzeit-Auswahl entfällt. */
  ganztaegig?: boolean
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
  /** Geplanter Zeitraum des Transports. */
  zeitraum: TransportZeitraum
  /** Polyline der Strecke (leer bis zur Analyse). */
  routeGeometry: RoutePoint[]
  findings: Finding[]
  /** Streckenlänge in km (nach Analyse gesetzt). */
  distanzKm?: number
  /** geschätzte Fahrzeit in Minuten (nach Analyse gesetzt). */
  fahrzeitMin?: number
}

/** Eintrag der zentralen Hindernis-Datenbank (Backend). Die Analyse-Engine matcht
 *  diese Einträge gegen den Strecken-Korridor und bewertet sie pro Transport. */
export interface Obstacle {
  id: string
  kategorie: FindingKategorie
  name: string
  beschreibung?: string
  lat: number
  lng: number
  strassenRef?: string
  zustaendig?: string
  quelle?: FindingSource
  /** Kategorie-spezifische Grenzwerte: maxHoeheM, maxBreiteM, maxGewichtT,
   *  maxAchslastT, steigungPct, radiusM, restbreiteM … */
  attrs: Record<string, number | string>
  gueltigVon?: string
  gueltigBis?: string
  aktiv: boolean
  /** true für Seed-/Demo-Datensätze — echte Importe haben demo=false. */
  demo: boolean
  createdAt: string
  updatedAt: string
}

/** Aggregat-Kennzahlen vom Backend (GET /api/stats). */
export interface AppStats {
  projekte: number
  fertig: number
  funde: number
  kritisch: number
  warnung: number
  hinweis: number
  hindernisse: number
  hindernisseDemo: number
  letzteAnalyse?: string
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
  ladungsgewicht: 35,
}
