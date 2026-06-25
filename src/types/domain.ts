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
  /** Exakte Kontroll-Wegpunkte (Start, Zwischenstopps, Ziel), mit denen die Strecke angelegt wurde
   *  — z.B. die gesetzten Pins bei Start/Ziel. Der Editor nutzt GENAU diese (akkurat), statt sie aus
   *  den OSRM-gesnappten Geometrie-Enden zu rekonstruieren. Fehlt bei Datei-Uploads (T-582). */
  waypoints?: RoutePoint[]
  /** Hex-Farbe für Karte/Listen-Zuordnung (FE vergibt aus Palette). */
  farbe: string
  /** Herkunft der Strecke — für die Zähler je Upload-Tab. Default „datei". */
  source?: RouteSource
  /** Geometrie ist nur eine grobe Schätzung (OSRM nicht erreichbar → Luftlinie/Korridor statt
   *  echtem Straßenweg). Karte zeichnet gestrichelt + Warnhinweis (T-480). */
  grob?: boolean
}

/** Quelle, über die eine Strecke angelegt wurde (= die Upload-Tabs). */
export type RouteSource = "datei" | "link" | "startziel" | "vemags"

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
  | "sonstige"

/** Wie kritisch ein Fund für den konkreten Transport ist. */
export type FindingSeverity = "kritisch" | "warnung" | "hinweis"

/** Grund fürs manuelle Ausblenden eines Funds (fließt in die /debug-Triage). */
export type HideReason =
  | "falsche_fahrbahn"
  | "falsche_daten"
  | "nicht_relevant"
  | "dublette"
  | "bereits_erledigt"
  | "sonstiges"

export const HIDE_REASON_LABEL: Record<HideReason, string> = {
  falsche_fahrbahn: "Falsche Fahrbahn / Gegenrichtung",
  falsche_daten: "Falsche Daten extrahiert",
  nicht_relevant: "Nicht relevant für diesen Transport",
  dublette: "Dublette",
  bereits_erledigt: "Bereits erledigt / vor Ort",
  sonstiges: "Sonstiges",
}

/** /debug-Triage: ein ausgeblendeter Fund (Admin-übergreifend). */
export interface HiddenFindingEntry {
  id: string
  projektId: string
  projektName: string | null
  findingKey: string
  obstacleId: string | null
  grund: HideReason
  grundText: string | null
  kontext: { kategorie?: string; titel?: string; quelleName?: string; strassenRef?: string }
  hiddenBy: string | null
  createdAt: string
}
export interface HiddenFindingsResponse {
  eintraege: HiddenFindingEntry[]
  grundZaehler: Partial<Record<HideReason, number>>
  quelleZaehler: Record<string, number>
}

/** Kontaktdaten eines eigenen (Kunden-)Eintrags. */
export interface Kontakt {
  /** Wer hat die Information gemeldet / kontaktiert. */
  melder?: string
  ansprechpartner?: string
  telefon?: string
}

/** Datenquelle eines Funds (Behörde, API, OSM …). */
export interface FindingSource {
  name: string
  /** Klickbarer Link zur Quelle (fehlt bei eigenen Einträgen). */
  url?: string
  /** ISO-Datum oder relativer Text, z.B. "vor 12 min". */
  aktualisiertAm?: string
  /** true = eigener Mandanten-Eintrag (FE färbt hellblau). */
  eigen?: boolean
  /** Kontaktdaten bei eigenen Einträgen. */
  kontakt?: Kontakt
}

/** Ein auf der Strecke gefundenes Hindernis / eine Auffälligkeit. */
export interface Finding {
  id: string
  /** Stabile Fund-Identität über Re-Analysen hinweg (vom Backend gesetzt) — für Ausblenden. */
  key?: string
  /** Vom Nutzer für dieses Projekt ausgeblendet (zählt nicht in Aggregate, nicht im Share). */
  hidden?: boolean
  hiddenGrund?: HideReason
  hiddenGrundText?: string
  /** ID des zugrundeliegenden Hindernisses (für „eigenen Eintrag verwerfen"). */
  obstacleId?: string | null
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
  /** GeoJSON-Geometrie (LineString/MultiLineString = Strecke) für Linien-Darstellung statt nur Punkt. */
  geom?: GeoJSONGeometry | null
  /** #14: vorab geladener ÖFFENTLICHER Chat (nur im externen Share gesetzt) → read-only anzeigen. */
  publicChat?: FindingChatMessage[]
}

/** Minimale GeoJSON-Geometrie (Punkt/Linie/Strecke) — für Karten-Rendering. */
export interface GeoJSONGeometry {
  type: string
  coordinates: unknown
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
  /** Optimistic-Lock-Token (T-466): wird bei jedem PATCH mitgesendet + serverseitig inkrementiert. */
  version?: number
  /** ISO-Zeitstempel. */
  createdAt: string
  updatedAt: string
  /** Mandant, dem das Projekt gehört. */
  tenantId?: string
  /** E-Mail des Erstellers (wer hat das Projekt angelegt) — Tracking + Mail-Empfänger + Icon. */
  erstelltVon?: string | null
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
  /** Ordner-Zuordnung (T-177), null/undefined = Wurzelebene. */
  folderId?: string | null
  /** Privatheit (058): null = geteilt (alle Mandanten-Mitglieder), gesetzt = privat (nur Besitzer). */
  owner?: string | null
}

/** Projekt-Ordner (T-177). parentId=null → Überordner. owner: null = geteilt, gesetzt = privat (058). */
export interface Folder {
  id: string
  name: string
  parentId: string | null
  sortOrder: number
  owner?: string | null
}

/** Rolle eines Nutzers innerhalb seines Mandanten. */
export type TenantRole = "admin" | "user"

/** Nutzer eines Mandanten (Admin-Verwaltung). Kein Klartext-Passwort mehr (DSGVO) —
 *  Passwörter liegen ausschließlich gehasht in setreo-auth-extern. */
export interface TenantMember {
  email: string
  role: TenantRole
  /** Letzter Login (jüngstes analytics_sessions.last_seen), ISO oder null = nie gesehen. T-426. */
  lastSeen?: string | null
}

/** White-Label-Branding eines Mandanten (null/leere Felder = Setreo-Standard).
 *  accent = eine Akzentfarbe (#rrggbb) → die primary-Ramp wird daraus berechnet. */
export interface Branding {
  accent?: string | null
  /** Tab-Titel (document.title); leer = „Roadmap — Setreo". */
  appName?: string | null
  /** Kundenlogo als Data-URL (klein, FE-seitig herunterskaliert). */
  logo?: string | null
}

/** Mandant (Kunde) — Setreo-Admin verwaltet Mandanten + Nutzer. */
export interface Tenant {
  id: string
  slug: string
  name: string
  mitglieder: TenantMember[]
  projekte: number
  /** T-346: administrativ ausgesetzt (kein Produktzugriff für die Mitglieder). */
  suspended?: boolean
  /** White-Label (null = Setreo-Standard). */
  branding?: Branding | null
}

/** Lizenz eines Mandanten (Plan, Seats, Laufzeit). Buchhaltung rechnet extern. */
export interface TenantLicense {
  plan: string
  maxSeats: number
  /** ISO-Datum (YYYY-MM-DD) oder null = unbefristet. */
  validUntil: string | null
}

/** Ein Seat-Code einer Mandanten-Lizenz (ein Code = ein Seat). */
export interface SeatCode {
  code: string
  /** E-Mail des Nutzers, der den Code eingelöst hat (null = frei). */
  usedBy: string | null
  usedAt: string | null
}

/** News-Kategorie (steuert Badge/Label im Feed). */
export type NewsKategorie = "datenquelle" | "version" | "hinweis"

/** Eine Plattform-News (Setreo postet, alle sehen). */
export interface News {
  id: string
  kategorie: NewsKategorie
  titel: string
  body: string
  createdBy: string | null
  publishedAt: string
}

/** Kontaktdaten-Karte einer Chat-Nachricht (kind='contact') — z.B. die kontaktierte Behörde. */
export interface FindingChatContact {
  name?: string
  email?: string
  phone?: string
}

/** Eine Nachricht im Baustellen-Chat eines Funds.
 *  scope 'public' = DB-weit sichtbar (alle Mandanten), Organisation des Autors sichtbar.
 *  scope 'internal' = nur eigener Mandant, ohne Organisation.
 *  Autor wird IMMER serverseitig aus dem Kontext gesetzt — nie aus dem Body.
 *  kind 'text' = normale Nachricht (body Pflicht); 'contact' = Kontaktdaten-Karte (contact gesetzt). */
export interface FindingChatMessage {
  id: string
  findingKey: string
  scope: "public" | "internal"
  /** Bei fremden public-Nachrichten maskiert (null) — Datenminimierung; nur Organisation sichtbar (T-301#9). */
  authorEmail: string | null
  /** Organisation des Autors — nur bei scope 'public' gesetzt. */
  organisation?: string | null
  body: string
  /** Art der Nachricht — 'text' (Default) oder 'contact' (Kontaktdaten-Karte). */
  kind: "text" | "contact"
  /** Bei kind='contact' gesetzt: kontaktierte Stelle (mind. ein Feld). */
  contact?: FindingChatContact | null
  createdAt: string
  /** true = vom aktuell eingeloggten Nutzer verfasst (FE-Ausrichtung). */
  mine: boolean
}

/** Eigene Mandanten-Lizenz (Anzeige für den Kunden): Plan, Laufzeit, Seat-Belegung. */
export interface AccountLicense {
  plan: string
  maxSeats: number
  validUntil: string | null
  seatsTotal: number
  seatsUsed: number
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
  /** GeoJSON-Geometrie (LineString/MultiLineString = Strecke) für Linien-Darstellung statt nur Punkt. */
  geom?: GeoJSONGeometry | null
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
  /** Optionale Kontaktdaten (Melder/Ansprechpartner/Telefon). */
  kontakt?: Kontakt
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
  /** Status des letzten (automatischen) Import-Laufs: "ok" | "error" | null (nie gelaufen).
   *  "error" = beim letzten 3×/Tag-Abruf nicht erreichbar → Warn-Indikator. */
  letzterStatus?: "ok" | "error" | string | null
  /** Quelle nur für INTERNE Nutzung freigegeben (keine kommerzielle Lizenz) → rotes "Intern"-Badge. */
  nurIntern?: boolean
  /** Lizenz-Status: "ready" (grün, kommerziell nutzbar) | "open" (grau, unklar) | "intern" (rot, NC). */
  lizenzStatus?: "ready" | "open" | "intern"
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
  phase: "import" | "verify" | "hygiene" | "rerun"
  total: number
  done: number
  current: { quelleId?: string; name: string } | null
  /** Abgleich des gezogenen Bestands mit der DB (Verifikations-Phase). */
  verify: {
    geprueft: number
    neu: number
    aktualisiert: number
    deaktiviert: number
    reaktiviert: number
    geaendert: number
  } | null
  deaktiviertAbgelaufen: number
  rerun: {
    geprueft: number
    neuAusgewertet: number
    mitAenderung: number
    benachrichtigungen: number
    /** true, wenn die Re-Analyse den globalen Lock nicht bekam (läuft schon) → Bilanz folgt asynchron (T-367). */
    skipped?: boolean
  } | null
  runs: SyncImportRun[]
  startedAt: string
  finishedAt: string | null
  error: string | null
  /** Geschätzte Restdauer in Sekunden (aus letzten Laufzeiten je Quelle); null wenn unbekannt. */
  etaSeconds?: number | null
}

// ── Bug-Reports (In-App-Fehlermeldung + /debug-Triage) ────────────────────────

export type BugReportStatus = "offen" | "in_arbeit" | "erledigt" | "verworfen"

/** E-Mail-Benachrichtigungs-Präferenz des Nutzers. */
export interface MailPref {
  enabled: boolean
  scope: "eigene" | "alle"
  severities: FindingSeverity[]
}

/** Automatisch erfasster Kontext-Snapshot zum Meldezeitpunkt. */
export interface BugReportKontext {
  appVersion?: string
  mode?: string
  viewPath?: string
  viewport?: string
  screen?: string
  sprache?: string
  userAgent?: string
  zeitpunkt?: string
  /** Daten-/Seitenstatus: Mandant, Projektzahl, aktuelles Projekt … */
  datenstatus?: Record<string, unknown>
  [key: string]: unknown
}

/** Eingabe beim Melden (POST /api/bug-reports). */
export interface BugReportCreate {
  beschreibung: string
  viewPath?: string
  kontext?: BugReportKontext
  /** Optionaler Seiten-Screenshot (data:image-JPEG, base64). */
  screenshot?: string | null
}

/** Ein Bug-Report (GET /api/bug-reports, nur Admin). */
export interface BugReport {
  id: string
  email: string
  tenantSlug?: string | null
  isAdmin: boolean
  beschreibung: string
  viewPath?: string | null
  kontext: BugReportKontext
  status: BugReportStatus
  notiz?: string | null
  /** T-373: ob ein Seiten-Screenshot existiert. Das Bild selbst lädt das FE lazy
   *  (api.bugReports.screenshot), nicht mehr in der Liste mit. */
  hasScreenshot?: boolean
  createdAt: string
  resolvedAt?: string | null
}

export interface BugReportList {
  reports: BugReport[]
  zaehler: Record<BugReportStatus, number>
}

// ── Quellen-Vorschläge (Nutzer schlägt neue Datenquelle vor → /debug-Triage) ──
export interface SourceRequestCreate {
  url: string
  beschreibung: string
}
export interface SourceRequest {
  id: string
  email: string
  tenantSlug?: string | null
  url: string
  beschreibung: string
  status: BugReportStatus
  notiz?: string | null
  createdAt: string
  resolvedAt?: string | null
}
export interface SourceRequestList {
  requests: SourceRequest[]
  zaehler: Record<BugReportStatus, number>
}

/** Default-Stammdaten für ein frisch angelegtes Projekt (typischer Schwertransport). */
export const DEFAULT_TRANSPORT: TransportData = {
  laenge: 24.5,
  breite: 3.0,
  hoehe: 4.2,
  gesamtgewicht: 68,
}

// Farb-Palette für Projekt-Strecken (Reihenfolge = Vergabe-Reihenfolge). Bewusst NUR kühle Töne
// (Blau/Violett/Magenta/Cyan) — KEIN Grün/Gelb/Rot/Orange (Max 2026-06-21): diese kollidieren mit
// den Severity-Farben der Fund-Marker (rot=kritisch, gelb=warnung, grün=frei) und sehen mit den
// Start/Ziel-Pins in Streckenfarbe komisch aus.
export const ROUTE_FARBEN = [
  "#2563EB", // Blau
  "#7C3AED", // Violett
  "#DB2777", // Magenta
  "#0EA5E9", // Himmelblau
  "#C026D3", // Fuchsia
  "#4F46E5", // Indigo
  "#0891B2", // Cyan
  "#1E40AF", // Dunkelblau
] as const
