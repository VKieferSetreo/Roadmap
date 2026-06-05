export type Severity = "blocked" | "warning" | "ok"

export interface Restriction {
  label: string
  soll: string
  ist: string
  ok: boolean
}

export interface BlockadeEffect {
  detourKm: number
  extraTimeMin: number
  extraCostEur: number
}

export interface BlockadeSource {
  name: string
  lastUpdate: string
  url?: string
}

export interface BlockadeAuthority {
  name: string
  contact: string
  phone: string
  email: string
  url?: string
}

export interface BlockadeAttachment {
  title: string
  type: "pdf" | "image" | "doc"
  size: string
  url?: string
}

export interface Blockade {
  id: string
  severity: Severity
  category: string
  road: string
  km: string
  position: [number, number] // [lat, lng]
  title: string
  description: string
  /** Kurze Lead-Zeile (1 Satz). */
  detail?: string
  /** Hauptinhalt als Stichpunkte. */
  detailBullets?: string[]
  validFrom?: string
  validUntil?: string
  /** Soll-/Ist-Werte gegenüber Fahrzeug-Profil. */
  restrictions?: Restriction[]
  effect?: BlockadeEffect
  source?: BlockadeSource
  authority?: BlockadeAuthority
  attachments?: BlockadeAttachment[]
  /** Hinweise an den Fahrer (z.B. Zeitfenster, Lotsen-Pflicht). */
  notes?: string[]
}

export type InfraKind = "bridge" | "tunnel" | "height-limit" | "weight-limit"

export interface InfraMarker {
  id: string
  kind: InfraKind
  position: [number, number]
  label: string
  value?: string
}

export interface VehicleProfile {
  id: string
  name: string
  lengthM: number
  widthM: number
  heightM: number
  weightT: number
  axles: number
}

// Demo-Route Hamburg Hafen → Berlin (BMW Werk Marienfelde Richtung).
// Vereinfachte Polyline mit ~10 Stützpunkten — kein echtes Routing.
export const mockRoutePolyline: [number, number][] = [
  [53.5418, 9.9839], // Hamburg Hafen
  [53.5235, 10.0625],
  [53.4756, 10.1718],
  [53.4011, 10.4202],
  [53.3158, 10.6913],
  [53.2186, 10.9425],
  [53.0972, 11.2034],
  [52.9341, 11.6082],
  [52.7558, 12.1289],
  [52.6411, 12.6427],
  [52.5618, 13.1156],
  [52.4870, 13.4910], // Berlin
]

export const mockRouteSummary = {
  origin: "Hamburg Hafen",
  destination: "Berlin BMW-Werk",
  distanceKm: 297,
  durationH: 4.2,
  via: ["A24", "A10", "A100"],
}

export const mockVehicleProfiles: VehicleProfile[] = [
  { id: "default", name: "Standard-Schwertransport", lengthM: 18.75, widthM: 3.0, heightM: 4.0, weightT: 40, axles: 5 },
  { id: "ueberlange", name: "Überlanger Sondertransport", lengthM: 28.5, widthM: 3.5, heightM: 4.2, weightT: 56, axles: 7 },
  { id: "rotor", name: "Windkraft-Rotorblatt", lengthM: 67.0, widthM: 4.2, heightM: 4.6, weightT: 88, axles: 9 },
  { id: "trafo", name: "Transformator", lengthM: 22.0, widthM: 4.0, heightM: 4.8, weightT: 124, axles: 12 },
]

export const mockBlockades: Blockade[] = [
  {
    id: "b-001",
    severity: "blocked",
    category: "Brücke gesperrt",
    road: "A24",
    km: "km 102",
    position: [53.3158, 10.6913],
    title: "Elbebrücke Lauenburg — Tonnage-Limit",
    description: "Brückentragfähigkeit 30 t überschritten (Profil: 56 t).",
    detail: "Brücke nach BASt-Nachrechnung auf 30 t herabgestuft.",
    detailBullets: [
      "Nachrechnung BASt-Bericht 02/2026 ergab reduzierte Tragfähigkeit (vorher 60 t, jetzt 30 t).",
      "Tonnage-Überschreitung von 26 t ist nicht über VEMAGS-Einzelfallgenehmigung abdeckbar.",
      "Brücke ist für diesen Transport bis Sanierung bzw. Ersatzneubau gesperrt.",
      "Geplante Sanierung: 09/2026 – 04/2027 (Quelle BVWP-Maßnahmenliste).",
    ],
    validFrom: "01.02.2026",
    validUntil: "30.09.2026",
    restrictions: [
      { label: "Gewicht", soll: "30 t", ist: "56 t", ok: false },
      { label: "Breite", soll: "4,00 m", ist: "3,50 m", ok: true },
      { label: "Höhe", soll: "4,50 m", ist: "4,20 m", ok: true },
      { label: "Achslast", soll: "11 t/Achse", ist: "14 t/Achse", ok: false },
    ],
    effect: {
      detourKm: 38,
      extraTimeMin: 52,
      extraCostEur: 240,
    },
    source: {
      name: "BASt SIB-Bauwerke",
      lastUpdate: "vor 3 h",
      url: "https://www.bast.de/",
    },
    authority: {
      name: "Autobahn GmbH Nordost",
      contact: "Sachgebiet Bauwerksprüfung",
      phone: "+49 30 47028-0",
      email: "leitstelle.nord@autobahn.de",
      url: "https://www.autobahn.de/die-autobahn/ueber-uns/niederlassungen/nordost",
    },
    attachments: [
      { title: "Nachrechnungsbericht 02/2026", type: "pdf", size: "1,4 MB", url: "https://www.bast.de/" },
      { title: "Bauwerksfoto Süd-Pfeiler", type: "image", size: "320 KB", url: "https://www.bast.de/" },
      { title: "Umleitungs-Skizze BVWP", type: "pdf", size: "780 KB", url: "https://www.bmv.bund.de/SharedDocs/DE/Anlage/G/bvwp-2030-gesamtplan.html" },
    ],
    notes: [
      "Alternative über B5 Lauenburg möglich, jedoch Lotsen-Pflicht ab 4,0 m Breite.",
      "VEMAGS-Antragsstelle: RP Karlsruhe (zentrale Genehmigungsbehörde).",
    ],
  },
  {
    id: "b-002",
    severity: "blocked",
    category: "Baustelle / Fahrbahnverengung",
    road: "A24",
    km: "km 156",
    position: [53.0972, 11.2034],
    title: "Baustelle Wittenburg — Fahrbahnverengung 3,20 m",
    description: "Durchgängige Breite 3,20 m; benötigt 3,50 m.",
    detail: "Erneuerung Fahrbahndecke FR Berlin — Engstelle 1,8 km.",
    detailBullets: [
      "Erneuerung der Fahrbahndecke in Fahrtrichtung Berlin (Asphaltbinder + Deckschicht).",
      "Restbreite in der Engstelle dauerhaft 3,20 m über 1,8 km.",
      "Kein Ausweichen über Standstreifen möglich (Schutzwand-Anschluss).",
      "Bei Sondertransporten > 3,30 m: zwingend Umleitung über B321.",
    ],
    validFrom: "21.05.2026",
    validUntil: "14.07.2026",
    restrictions: [
      { label: "Breite", soll: "3,20 m", ist: "3,50 m", ok: false },
      { label: "Höhe", soll: "—", ist: "4,20 m", ok: true },
      { label: "Gewicht", soll: "44 t", ist: "56 t", ok: false },
      { label: "Geschwindigkeit", soll: "60 km/h", ist: "—", ok: true },
    ],
    effect: {
      detourKm: 22,
      extraTimeMin: 31,
      extraCostEur: 140,
    },
    source: {
      name: "Mobilithek (DATEX-II)",
      lastUpdate: "vor 12 min",
      url: "https://mobilithek.info/",
    },
    authority: {
      name: "Autobahn GmbH Nordost · Niederlassung Schwerin",
      contact: "Baustellenkoordination",
      phone: "+49 385 12345-0",
      email: "ndl.schwerin@autobahn.de",
      url: "https://www.autobahn.de/die-autobahn/ueber-uns/niederlassungen/nordost/niederlassung-schwerin",
    },
    attachments: [
      { title: "Baustellen-Verkehrsführung VKF-Plan", type: "pdf", size: "2,1 MB", url: "https://verkehr.autobahn.de/o/autobahn/A24/services/roadworks" },
      { title: "Foto Engstelle km 156,4", type: "image", size: "510 KB", url: "https://mobilithek.info/" },
    ],
    notes: [
      "Empfohlene Ausweichroute über B321 Hagenow — Plate.",
      "Nachtdurchfahrt 22:00–05:00 Uhr nur in Begleitung BF3.",
    ],
  },
  {
    id: "b-003",
    severity: "warning",
    category: "Höhenbegrenzung knapp",
    road: "A10",
    km: "km 187",
    position: [52.6411, 12.6427],
    title: "Tunnel Berliner Ring — Höhe 4,20 m",
    description: "Profilhöhe 4,20 m bei Soll 4,00 m — Restmaß 20 cm.",
    detail: "Durchfahrt möglich, Sicherheitsabstand jedoch unter Standard.",
    detailBullets: [
      "Lichte Höhe Tunnel: 4,20 m, Transporthöhe: 4,00 m → Restmaß 20 cm.",
      "Üblicher Sicherheitsabstand 40 cm wird unterschritten.",
      "Geschwindigkeit in der Röhre auf max. 40 km/h reduzieren.",
      "Begleitfahrzeug BF2 empfohlen, Pflicht ab Restmaß < 30 cm.",
    ],
    validFrom: "01.01.2026",
    restrictions: [
      { label: "Höhe (lichte)", soll: "4,20 m", ist: "4,00 m", ok: true },
      { label: "Breite", soll: "3,80 m", ist: "3,50 m", ok: true },
      { label: "Sicherheitsabstand", soll: "40 cm", ist: "20 cm", ok: false },
    ],
    effect: {
      detourKm: 0,
      extraTimeMin: 8,
      extraCostEur: 30,
    },
    source: {
      name: "OSM + BASt Profilhöhen",
      lastUpdate: "vor 1 d",
    },
    authority: {
      name: "Autobahn GmbH Nordost",
      contact: "Verkehrsleitstelle",
      phone: "+49 30 47028-100",
      email: "leitstelle.nord@autobahn.de",
      url: "https://www.autobahn.de/die-autobahn/ueber-uns/niederlassungen/nordost",
    },
    attachments: [
      { title: "Tunnel-Profilzeichnung", type: "pdf", size: "640 KB", url: "https://www.bast.de/" },
    ],
    notes: [
      "Empfohlene Durchfahrtszeit: 23:00–05:00 Uhr (geringer Verkehr).",
      "Begleitfahrzeug BF2 ist Pflicht ab Restmaß < 30 cm.",
    ],
  },
  {
    id: "b-004",
    severity: "ok",
    category: "Strecke frei",
    road: "A100",
    km: "km 12",
    position: [52.4870, 13.4910],
    title: "Anschluss Marienfelde — Restprofil 4,50 m",
    description: "Keine aktiven Sperrungen, Restmaße im grünen Bereich.",
    detail: "Letzte Bauwerksprüfung 11/2025 — alle Restprofile im Soll.",
    detailBullets: [
      "Höhenprofil: 4,50 m (Fahrzeug 4,20 m → 30 cm Reserve).",
      "Breitenprofil: 3,75 m (Fahrzeug 3,50 m → 25 cm Reserve).",
      "Tonnage-Limit: 60 t (Fahrzeug 56 t).",
      "Routine-Kontrolle der Autobahn GmbH alle 6 Monate, nächste 05/2026.",
    ],
    validFrom: "11/2025",
    restrictions: [
      { label: "Höhe", soll: "4,50 m", ist: "4,20 m", ok: true },
      { label: "Breite", soll: "3,75 m", ist: "3,50 m", ok: true },
      { label: "Gewicht", soll: "60 t", ist: "56 t", ok: true },
    ],
    effect: {
      detourKm: 0,
      extraTimeMin: 0,
      extraCostEur: 0,
    },
    source: {
      name: "Autobahn-API (live)",
      lastUpdate: "vor 4 min",
      url: "https://verkehr.autobahn.de/",
    },
    authority: {
      name: "Autobahn GmbH Nordost",
      contact: "Routine-Bauwerksprüfung",
      phone: "+49 30 47028-0",
      email: "leitstelle.nord@autobahn.de",
      url: "https://www.autobahn.de/die-autobahn/ueber-uns/niederlassungen/nordost",
    },
    attachments: [],
    notes: ["Anlieferzeitfenster BMW Marienfelde: Mo–Fr 06:00–18:00."],
  },
]

export const mockInfra: InfraMarker[] = [
  { id: "i-bridge-1", kind: "bridge", position: [53.4011, 10.4202], label: "Elbbrücke Schwarzenbek", value: "60 t · 4,80 m" },
  { id: "i-bridge-2", kind: "bridge", position: [52.7558, 12.1289], label: "Havelbrücke Plaue", value: "44 t · 4,50 m" },
  { id: "i-tunnel-1", kind: "tunnel", position: [52.5618, 13.1156], label: "Tunnel Spandau", value: "4,30 m" },
  { id: "i-height", kind: "height-limit", position: [52.9341, 11.6082], label: "Brückenunterführung", value: "4,10 m" },
]

export function blockadeCounts(items: Blockade[]) {
  return {
    blocked: items.filter((b) => b.severity === "blocked").length,
    warning: items.filter((b) => b.severity === "warning").length,
    ok: items.filter((b) => b.severity === "ok").length,
  }
}

export function findBlockade(id: string | null | undefined): Blockade | null {
  if (!id) return null
  return mockBlockades.find((b) => b.id === id) ?? null
}
