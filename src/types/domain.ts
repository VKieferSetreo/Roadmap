// Domänen-Modell für Roadmap — Schwertransport-Routenanalyse.
// Geteilt mit dem Backend (server/ liefert exakt diese Shapes, camelCase).

/** Lebenszyklus eines Projekts. */
export type ProjectStatus = "entwurf" | "analyse" | "fertig"

/** Eine hochgeladene Strecke eines Projekts (z.B. Hin- oder Rückfahrt).
 *  Mehrere Strecken pro Projekt; eine Gesamt-Auswertung über alle. */
export interface ProjectRoute {
  id: string
  /** Anzeigename im Ebenen-Panel (Default: Dateiname). */
  name: string
  fileName?: string
  /** Geometrie aus der Datei (GPX/KML/GeoJSON, client-seitig geparst, ≤1500 Punkte). */
  points: RoutePoint[]
  /** Hex-Farbe für Karte/Listen-Zuordnung (FE vergibt aus Palette). */
  farbe: string
}

/** Stammdaten des Transports — bestimmen, was auf der Strecke zum Problem wird. */
export interface TransportData {
  /** Gesamtlänge in Metern. */
  laenge: number
  /** Gesamtbreite in Metern. */
  breite: number
  /** Gesamthöhe in Metern. */
  hoehe: number
  /** Gesamtgewicht in Tonnen. */
  gesamtgewicht: number
  /** Anzahl Achsen (min. 2 — Zugmaschine). */
  achsen: number
  /** Achslast pro Achse in Tonnen (Länge === achsen). */
  achslasten: number[]
}

export type FindingKategorie =
  | "bruecke"
  | "engstelle"
  | "baustelle"
  | "sperrung"
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
  /** Position entlang SEINER Strecke in Kilometern ab Start. */
  km: number
  /** Zuordnung zur Projekt-Strecke (Multi-Strecken). */
  routeId?: string
  routeName?: string
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

/** Veröffentlichungs-Status eines Projekts (Share-Link für Externe). */
export interface ShareInfo {
  url: string
  hatPasswort: boolean
  createdAt: string
}

export interface Project {
  id: string
  name: string
  status: ProjectStatus
  /** ISO-Zeitstempel. */
  createdAt: string
  updatedAt: string
  /** Mandant, dem das Projekt gehört. */
  tenantId?: string
  /** Hochgeladene Strecken (Hin-/Rückfahrt, Varianten …). */
  routes: ProjectRoute[]
  transport: TransportData
  /** Geplanter Zeitraum des Transports. */
  zeitraum: TransportZeitraum
  findings: Finding[]
  /** Gesamt-Streckenlänge in km, Summe aller Strecken (nach Analyse gesetzt). */
  distanzKm?: number
  /** geschätzte Fahrzeit in Minuten (nach Analyse gesetzt). */
  fahrzeitMin?: number
  /** aktiver Share-Link (null/undefined = nicht veröffentlicht). */
  share?: ShareInfo | null
  /** gesetzt = Projekt ist archiviert (aus der Hauptliste ausgeblendet). */
  archiviertAm?: string | null
}

/** Mandant (Kunde) — Setreo-Admin verwaltet Mandanten + Mitglieder. */
export interface Tenant {
  id: string
  slug: string
  name: string
  mitglieder: string[]
  projekte: number
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
  /** Fachliche ID: Index (4) + Quellen-ID (4) + realer Start DDMMYY (6), z.B. 00030009010126. */
  fachId?: string
  quellenId?: string
  /** Datum, ab dem das Hindernis real greift (z.B. Baustellenstart). */
  realerStart?: string
  /** "global" = Setreo-/Connector-Daten (alle Mandanten) · "eigen" = Eintrag des eigenen Mandanten. */
  herkunft?: "global" | "eigen"
  /** true, wenn strukturierte Felder automatisch aus dem Meldungstext angereichert wurden (KI-Aufbereitung). */
  kiAufbereitet?: boolean
  createdAt: string
  updatedAt: string
}

/** Payload zum Anlegen eines (Kunden-)Hindernisses — Karten-Klick-Flow. */
export interface ObstacleCreate {
  kategorie: FindingKategorie
  name: string
  beschreibung?: string
  lat: number
  lng: number
  attrs: Record<string, number>
  gueltigVon?: string
  gueltigBis?: string
  realerStart?: string
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

// ── Nachrichtenzentrum / Glocke ───────────────────────────────────────────────

export type NotificationTyp = "neu" | "weggefallen" | "geaendert"
export type NotificationSeverity = FindingSeverity | "info"

/** Eine Benachrichtigung aus dem automatischen Re-Auswerten (GET /api/notifications). */
export interface AppNotification {
  id: string
  projektId?: string | null
  projektName?: string | null
  typ: NotificationTyp
  severity?: NotificationSeverity | null
  obstacleId?: string | null
  kategorie?: FindingKategorie | null
  titel: string
  beschreibung?: string | null
  km?: number | null
  routeName?: string | null
  strassenRef?: string | null
  gueltigVon?: string | null
  gueltigBis?: string | null
  createdAt: string
  readAt?: string | null
}

// ── Sync („Alle Quellen aktualisieren") ───────────────────────────────────────

/** Quellen-Status für die DB-Tab-Kopfzeile (GET /api/sync/status). */
export interface SyncSourceStatus {
  id: string
  name: string
  typ?: string | null
  abrufIntervall?: string | null
  letzterAbruf?: string | null
  aktiv: boolean
  /** Ist ein lauffähiger Connector registriert (nicht nur im Register gelistet)? */
  connector: boolean
  /** Liefert der Connector den vollen Bestand (Reconcile aktiv)? */
  vollbestand: boolean
}

export interface SyncStatus {
  quellen: SyncSourceStatus[]
  connectorAnzahl: number
  zuletztAktualisiert: string | null
  /** Läuft gerade ein Sync? Dann dessen Job-ID (zum Anhängen an den Fortschritt). */
  activeJobId: string | null
}

export interface SyncImportRun {
  quelleId: string
  status: "ok" | "error" | string
  stats?: Record<string, number>
  error?: string
}

/** Fortschritt eines Sync-Laufs (POST /api/sync, GET /api/sync/:id). */
export interface SyncJob {
  id: string
  status: "running" | "done" | "error"
  phase: "import" | "hygiene" | "rerun"
  total: number
  done: number
  current: { quelleId?: string; name: string } | null
  deaktiviertAbgelaufen: number
  rerun: {
    geprueft: number
    neuAusgewertet: number
    mitAenderung: number
    benachrichtigungen: number
  } | null
  runs: SyncImportRun[]
  startedAt: string
  finishedAt: string | null
  error: string | null
}

/** Default-Stammdaten für ein frisch angelegtes Projekt (typischer Schwertransport). */
export const DEFAULT_TRANSPORT: TransportData = {
  laenge: 24.5,
  breite: 3.0,
  hoehe: 4.2,
  gesamtgewicht: 68,
  achsen: 8,
  achslasten: [11.5, 11.5, 11.5, 11.5, 11.5, 11.5, 11.5, 11.5],
}

/** Farb-Palette für Projekt-Strecken (Reihenfolge = Vergabe-Reihenfolge). */
export const ROUTE_FARBEN = [
  "#527121", // Setreo-Dunkelgrün
  "#2563EB", // Blau
  "#9333EA", // Violett
  "#0D9488", // Petrol
  "#C2410C", // Terracotta
  "#DB2777", // Magenta
  "#4D7C0F", // Oliv
  "#7C3AED", // Indigo
] as const
