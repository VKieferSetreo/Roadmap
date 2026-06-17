// Darstellungs-Metadaten für Fund-Kategorien und Schweregrade.
// Genutzt von Karte (Marker-Glyphen), Dashboard (Badges/Icons) und Detail-Overlay.

import {
  Ban,
  Construction,
  MapPin,
  MoveHorizontal,
  RotateCw,
  TrafficCone,
  TrainFront,
  TrendingUp,
  Weight,
  type LucideIcon,
} from "lucide-react"
import type { Finding, FindingKategorie, FindingSeverity } from "@/types/domain"
import type { BadgeProps } from "@/components/ui/Badge"

/** Sichtbare Funde = ohne manuell ausgeblendete. Basis ALLER Zählungen/Anzeigen/Karte/PDF —
 *  ausgeblendete Funde fließen nie in Aggregate ein (nur separat als „Ausgeblendet"). */
export const visibleFindings = (findings: Finding[]): Finding[] => findings.filter((f) => !f.hidden)
export const hiddenFindings = (findings: Finding[]): Finding[] => findings.filter((f) => f.hidden)

export const KATEGORIE_META: Record<FindingKategorie, { label: string; icon: LucideIcon }> = {
  // bruecke + tunnel haben CUSTOM-SVG (siehe CUSTOM_KAT_SVG unten) — das icon ist nur Fallback.
  bruecke: { label: "Brücke", icon: MoveHorizontal },
  tunnel: { label: "Tunnel", icon: MoveHorizontal },
  engstelle: { label: "Engstelle", icon: MoveHorizontal },
  gewicht: { label: "Gewicht", icon: Weight },
  kreisverkehr: { label: "Kreisverkehr", icon: RotateCw },
  baustelle: { label: "Baustelle", icon: Construction },
  sperrung: { label: "Sperrung", icon: Ban },
  bahnuebergang: { label: "Bahnübergang", icon: TrainFront },
  steigung: { label: "Steigung", icon: TrendingUp },
  ampel: { label: "Signalanlage", icon: TrafficCone },
  sonstige: { label: "Sonstiges Bauwerk", icon: MapPin },
}

/** Fallback für unbekannte Kategorien (z.B. neue Backend-Kategorie ohne FE-Update)
 *  — verhindert Render-Crashes (React #130) bei unerwarteten Werten. */
export const FALLBACK_KAT_META = { label: "Hindernis", icon: MapPin } as const

/** Sichere Meta-Auflösung: kennt die Kategorie nicht → Fallback statt undefined. */
export function katMeta(kategorie: string): { label: string; icon: LucideIcon } {
  return KATEGORIE_META[kategorie as FindingKategorie] ?? FALLBACK_KAT_META
}

// ── Stammdaten-Darstellung (Karten-Popups) ────────────────────────────────────

/** Lesbare Labels + Einheiten für die normalisierten Grenzwert-Attribute. */
const ATTR_LABEL: Record<string, { label: string; unit?: string }> = {
  maxHoeheM: { label: "Durchfahrtshöhe", unit: "m" },
  maxBreiteM: { label: "Restbreite", unit: "m" },
  restbreiteM: { label: "Restbreite", unit: "m" },
  maxGewichtT: { label: "Zul. Gesamtlast", unit: "t" },
  steigungPct: { label: "Steigung", unit: "%" },
  radiusM: { label: "Außenradius", unit: "m" },
  maxLaengeM: { label: "Max. Länge", unit: "m" },
  sperrlaengeM: { label: "Länge der Maßnahme", unit: "m" },
  zeitfenster: { label: "Zeitfenster" },
  vollsperrung: { label: "Vollsperrung" },
  halbseitig: { label: "Halbseitige Sperrung" },
  fahrbahnVerengt: { label: "Fahrbahn verengt" },
  anzahlFahrstreifen: { label: "Fahrstreifen (verbleibend)" },
  umleitung: { label: "Umleitung" },
  einbahnstrasse: { label: "Einbahnstraße" },
  sackgasse: { label: "Sackgasse" },
  havarie: { label: "Akut/Havarie" },
  medium: { label: "Versorgungsleitung" },
  spurenFrei: { label: "Fahrstreifen frei" },
  spurenGesperrt: { label: "Fahrstreifen gesperrt" },
  anmeldungErforderlich: { label: "Anmeldung erforderlich" },
}

export function attrLabel(key: string): string {
  return ATTR_LABEL[key]?.label ?? key
}

function formatAttrValue(key: string, v: number | string | boolean): string {
  const meta = ATTR_LABEL[key]
  if (typeof v === "boolean") return v ? "ja" : "nein"
  if (typeof v === "number") return `${v.toLocaleString("de-DE")}${meta?.unit ? ` ${meta.unit}` : ""}`
  return String(v)
}

/** Alle Attribute eines Hindernisses → lesbare {label, value}-Zeilen. */
export function attrEntries(
  attrs: Record<string, number | string> | undefined,
): { label: string; value: string }[] {
  return Object.entries(attrs ?? {}).map(([k, v]) => ({
    label: attrLabel(k),
    value: formatAttrValue(k, v as number | string | boolean),
  }))
}

const fmtDate = (iso?: string | null) => (iso ? iso.split("-").reverse().join(".") : null)

/** "von – bis" / "ab/am von" / "bis bis" / "unbefristet".
 *  Nur Start, kein Ende: oft eine 1-Tages-Baustelle (Quelle liefert kein Enddatum),
 *  daher "ab/am" statt "ab" — ehrlich, weil wir Eintägigkeit nicht sicher wissen. */
export function formatGueltigkeit(von?: string | null, bis?: string | null): string {
  const v = fmtDate(von)
  const b = fmtDate(bis)
  if (v && b) return `${v} – ${b}`
  if (v) return `ab/am ${v}`
  if (b) return `bis ${b}`
  return "unbefristet"
}

/** Custom-SVG-Glyphen für Kategorien wo kein passendes Lucide-Icon existiert.
 *  stroke="currentColor" — Farbe wird vom umschließenden Element gesetzt.
 *  Wird sowohl in der Karte (Pins) als auch in Dashboard/Detail-Overlays verwendet. */
export const CUSTOM_KAT_SVG: Partial<Record<FindingKategorie, string>> = {
  // Baustelle — echtes StVO-Z123-Piktogramm: Bauarbeiter mit Schaufel über einem
  // Erdhaufen (statt des Lucide-Bauzauns). Deckungsgleich mit dem Karten-Pin-Glyph.
  baustelle: `<svg viewBox="4 7.5 11 8" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" width="100%" height="100%">
    <circle cx="8" cy="8.8" r="1.1" fill="currentColor" stroke="none"/>
    <path d="M7.7 10 L9.4 12.2"/>
    <path d="M9.4 12.2 L13.2 9.3"/>
    <path d="M12.5 9.9 L14.3 8.4"/>
    <path d="M12.3 10.3 L13.8 11.9"/>
    <path d="M8.6 12 L7.4 14.2"/>
    <path d="M4.8 14.6 Q9.2 11.6 14 14.6" stroke-width="1.3"/>
  </svg>`,
  // Brücke — Hängebrücke im Brooklyn-Bridge-Style.
  bruecke: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" width="100%" height="100%">
    <path d="M3 15 V6 Q5 9 7 6 V15"/>
    <path d="M17 15 V6 Q19 9 21 6 V15"/>
    <path d="M5 6 Q12 17 19 6"/>
    <path d="M9 10 V15"/>
    <path d="M12 12 V15"/>
    <path d="M15 10 V15"/>
    <path d="M2 15 H22"/>
    <path d="M8 15 V19"/>
    <path d="M16 15 V19"/>
  </svg>`,
  // Tunnel — Backsteinbogen-Portal (CH Signal 4.07 / Z 327).
  tunnel: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="100%" height="100%">
    <path d="M3 19 V12 Q3 4 12 4 Q21 4 21 12 V19"/>
    <path d="M6 12 Q6 7 12 7 Q18 7 18 12"/>
    <path d="M4 9 L6.5 10.2"/>
    <path d="M8 5 L9.5 7.4"/>
    <path d="M12 4 L12 7"/>
    <path d="M16 5 L14.5 7.4"/>
    <path d="M20 9 L17.5 10.2"/>
    <path d="M2 19 H22"/>
    <path d="M10.5 16.5 H13.5"/>
  </svg>`,
}

/** Hat die Kategorie einen Custom-SVG-Glyph statt eines Lucide-Icons? */
export function hasCustomGlyph(k: FindingKategorie): boolean {
  return CUSTOM_KAT_SVG[k] !== undefined
}

export const SEVERITY_META: Record<
  FindingSeverity,
  {
    label: string
    badge: NonNullable<BadgeProps["variant"]>
    /** Hex für Leaflet-SVG-Pins (DivIcon-Markup kann keine Tailwind-Klassen nutzen). */
    marker: string
    /** Punkt-/Dot-Hintergrund (Tailwind-Token). */
    dot: string
    /** gefüllter Icon-Chip (Tailwind-Token). */
    chip: string
    /** weiche Flächen-Variante: bg + border + text (Tailwind-Token). */
    soft: string
    /** linke Akzent-Kante für Listenzeilen. */
    accent: string
    rank: number
  }
> = {
  kritisch: {
    label: "Kritisch",
    badge: "kritisch",
    // NUR Kritisch ist rot (Max 2026-06-14). Warnung = klares Orange, Hinweis = klares Gelb.
    marker: "#DC2626",
    dot: "bg-severity-kritisch",
    chip: "bg-severity-kritisch text-white",
    soft: "bg-severity-kritisch-bg border-severity-kritisch-border text-severity-kritisch-text",
    accent: "border-l-severity-kritisch",
    rank: 0,
  },
  warnung: {
    label: "Warnung",
    badge: "warnung",
    marker: "#F59E0B",
    dot: "bg-severity-warnung",
    chip: "bg-severity-warnung text-white",
    soft: "bg-severity-warnung-bg border-severity-warnung-border text-severity-warnung-text",
    accent: "border-l-severity-warnung",
    rank: 1,
  },
  hinweis: {
    label: "Hinweis",
    badge: "hinweis",
    marker: "#EAB308",
    dot: "bg-severity-hinweis",
    chip: "bg-severity-hinweis text-white",
    soft: "bg-severity-hinweis-bg border-severity-hinweis-border text-severity-hinweis-text",
    accent: "border-l-severity-hinweis",
    rank: 2,
  },
}

export const SEVERITY_ORDER: FindingSeverity[] = ["kritisch", "warnung", "hinweis"]

// ── Eigene (Kunden-)Einträge ───────────────────────────────────────────────────
// Eigene Einträge werden UNABHÄNGIG von der Severity hellblau dargestellt (Max
// 2026-06-14) — sie sind sofort als „von uns gepflegt" erkennbar. Die Severity
// (kritisch/warnung) bleibt in den Badges/Texten erhalten, nur der Pin ist hellblau.
export const EIGEN_COLOR = "#38BDF8" // sky-400 — Hellblau für eigene Einträge
export const EIGEN_BADGE = "border-sky-200 bg-sky-50 text-sky-700"

/** Stammt der Fund/das Hindernis aus einem eigenen Mandanten-Eintrag? */
export function istEigenerEintrag(quelle?: { eigen?: boolean; name?: string } | null): boolean {
  if (!quelle) return false
  // Primär das explizite Flag; Fallback auf den Namen (Bestandsdaten vor dem Flag).
  return quelle.eigen === true || (typeof quelle.name === "string" && quelle.name.startsWith("Eigener Eintrag"))
}
