// T-739 „Markierungen": eine hochgeladene Datei → Punkt-Ebenen (Parkplätze, Windräder, eigene
// Standorte). Getrennt von parseRouteFile.ts, weil dort nur die Koordinatenfolge zählt. Hier zählt
// jeder Standort einzeln, mit seinen Attributen aus der Datei, und je Layer der Datei (KML-Folder,
// Shapefile-Layer, GPKG-Punkttabelle) entsteht eine eigene Ebene.

import type { Markierung } from "@/types/domain"
import { unzip } from "./unzip"

export interface ParsedPunktEbene {
  name: string
  punkte: Markierung[]
  /** Nicht-fataler Befund zum Anzeigen (aktuell: fehlende .cpg im Shapefile-ZIP, Umlaute kaputt). */
  hinweis?: string
}

/** Harte Grenze je Ebene. Bewusst Ablehnung statt Ausdünnen: Ausdünnen löscht bei Punkten
 *  ganze Standorte, nicht bloß Stützpunkte einer Linie. */
export const MAX_PUNKTE_JE_EBENE = 5000
export const MAX_ATTRIBUTE_JE_PUNKT = 30
const MAX_SCHLUESSEL_LAENGE = 60
const MAX_WERT_LAENGE = 200
const MAX_NAME_LAENGE = 200

/** Spaltennamen, die als Überschrift des Punktes taugen (Vergleich kleingeschrieben). */
const NAME_SPALTEN = ["name", "titel", "title", "bezeichnung", "label"]

function kappe(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) : s
}

/** Koordinatenwert zu Zahl. Nicht über Number() allein: Number(null) und Number("") ergeben 0 —
 *  eine fehlende Länge würde damit still zu einem Punkt im Golf von Guinea. */
function zahl(v: unknown): number {
  if (typeof v === "number") return v
  if (typeof v === "string" && v.trim() !== "") return Number(v)
  return Number.NaN
}

/** Rohattribute auf den Vertrag bringen: nur Text, max. 30 Schlüssel, Schlüssel 60 / Wert 200 Zeichen. */
function normalisiereAttribute(roh: Record<string, unknown>): Record<string, string> | undefined {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(roh)) {
    if (Object.keys(out).length >= MAX_ATTRIBUTE_JE_PUNKT) break
    if (v === null || v === undefined) continue
    const schluessel = kappe(k.trim(), MAX_SCHLUESSEL_LAENGE)
    if (!schluessel) continue
    // DBF liefert Date-Objekte und Zahlen gemischt; angezeigt wird ohnehin alles als Text.
    const wert = v instanceof Date ? v.toISOString().slice(0, 10) : String(v)
    if (!wert.trim()) continue
    out[schluessel] = kappe(wert, MAX_WERT_LAENGE)
  }
  return Object.keys(out).length > 0 ? out : undefined
}

/** Eine Markierung aus rohen Werten bauen — oder null, wenn die Koordinate unbrauchbar ist.
 *  Einzige Stelle, an der Koordinaten geprüft und Attribute gekappt werden. */
export function baueMarkierung(
  lat: number,
  lng: number,
  name: string,
  roh: Record<string, unknown>,
): Markierung | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null
  const m: Markierung = { lat, lng }
  const n = kappe(name.trim(), MAX_NAME_LAENGE)
  if (n) m.name = n
  const attribute = normalisiereAttribute(roh)
  if (attribute) m.attribute = attribute
  return m
}

/** Erste Spalte, die als Überschrift taugt. */
export function nameAusAttributen(roh: Record<string, unknown>): string {
  for (const [k, v] of Object.entries(roh)) {
    if (NAME_SPALTEN.includes(k.trim().toLowerCase()) && typeof v === "string" && v.trim()) return v
  }
  return ""
}

/** Grenze durchsetzen und leere Ebenen verwerfen. Wirft bei Überschreitung. */
function pruefeGrenze(ebenen: ParsedPunktEbene[]): ParsedPunktEbene[] {
  for (const e of ebenen) {
    if (e.punkte.length > MAX_PUNKTE_JE_EBENE) {
      throw new Error(
        `Die Ebene „${e.name}" enthält ${e.punkte.length} Punkte. Bitte laden Sie höchstens ` +
          `${MAX_PUNKTE_JE_EBENE} Punkte je Ebene hoch. Es wird bewusst nicht ausgedünnt, damit ` +
          `keine Standorte verloren gehen.`,
      )
    }
  }
  return ebenen.filter((e) => e.punkte.length > 0)
}

// ---------------------------------------------------------------- KML / KMZ

/** Direktes Kind mit diesem lokalen Namen, als getrimmter Text. Direkt, damit ein <name> im
 *  Placemark nicht den <name> des Folders überschreibt und umgekehrt.
 *  Über die Geschwister und nicht über Array.from(el.children): ein <Document> mit 5.000
 *  Placemarks würde sonst je Placemark eine 5.000er-Liste materialisieren. */
function kindText(el: Element, tag: string): string {
  for (let kind = el.firstElementChild; kind; kind = kind.nextElementSibling) {
    if (kind.localName === tag) return (kind.textContent ?? "").trim()
  }
  return ""
}

/** Name des umschließenden <Folder>/<Document> — das ist die Ebene, in der das Placemark liegt.
 *  Je Container einmal gesucht, sonst wird das Lesen quadratisch. */
function ebenenName(placemark: Element, fallback: string, cache: Map<Element, string>): string {
  for (let el = placemark.parentElement; el; el = el.parentElement) {
    if (el.localName !== "Folder" && el.localName !== "Document") continue
    let n = cache.get(el)
    if (n === undefined) {
      n = kindText(el, "name")
      cache.set(el, n)
    }
    if (n) return n
  }
  return fallback
}

/** <description> plus <ExtendedData> in beiden gebräuchlichen Formen. */
function kmlAttribute(placemark: Element): Record<string, unknown> {
  const roh: Record<string, unknown> = {}
  const beschreibung = kindText(placemark, "description")
  if (beschreibung) roh.Beschreibung = beschreibung
  // <Data name="x"><value>y</value></Data>
  for (const d of Array.from(placemark.getElementsByTagNameNS("*", "Data"))) {
    const k = d.getAttribute("name")
    if (k) roh[k] = kindText(d, "value")
  }
  // <SchemaData><SimpleData name="x">y</SimpleData></SchemaData>
  for (const s of Array.from(placemark.getElementsByTagNameNS("*", "SimpleData"))) {
    const k = s.getAttribute("name")
    if (k) roh[k] = (s.textContent ?? "").trim()
  }
  return roh
}

/** KML-Text → eine Ebene je <Folder>/<Document>.
 *  Durchgehend getElementsByTagNameNS("*", …): bei Namespace-Präfixen (<kml:coordinates>)
 *  liefert getElementsByTagName NULL Treffer. */
export function parsePunkteKml(text: string, fallbackName = "Punkte"): ParsedPunktEbene[] {
  const doc = new DOMParser().parseFromString(text, "application/xml")
  if (doc.querySelector("parsererror")) {
    throw new Error("Die KML-Datei konnte nicht gelesen werden. Bitte prüfen Sie die Datei.")
  }
  const ebenen = new Map<string, Markierung[]>()
  const namenCache = new Map<Element, string>()
  for (const pm of Array.from(doc.getElementsByTagNameNS("*", "Placemark"))) {
    const geom = pm.getElementsByTagNameNS("*", "Point")[0]
    if (!geom) continue
    const roh = (geom.getElementsByTagNameNS("*", "coordinates")[0]?.textContent ?? "").trim()
    const [lng, lat] = (roh.split(/\s+/)[0] ?? "").split(",").map(zahl)
    const punkt = baueMarkierung(lat, lng, kindText(pm, "name"), kmlAttribute(pm))
    if (!punkt) continue
    const schluessel = ebenenName(pm, fallbackName, namenCache)
    const liste = ebenen.get(schluessel)
    if (liste) liste.push(punkt)
    else ebenen.set(schluessel, [punkt])
  }
  if (ebenen.size === 0) {
    throw new Error("Die Datei enthält keine Punkte. Erwartet wird ein <Placemark> mit <Point>.")
  }
  return pruefeGrenze(Array.from(ebenen, ([name, punkte]) => ({ name, punkte })))
}

/** Erkennt eine reine Punkt-Datei, damit der Strecken-Pfad sie nicht still zur Linie macht
 *  (parseKml lässt zwei Punkt-Koordinaten heute als Strecke durchgehen). */
export function istReinePunktDatei(text: string): boolean {
  let doc: Document
  try {
    doc = new DOMParser().parseFromString(text, "application/xml")
  } catch {
    return false
  }
  if (doc.querySelector("parsererror")) return false
  if (doc.getElementsByTagNameNS("*", "Point").length === 0) return false
  for (const tag of ["LineString", "LinearRing", "Polygon", "Track"]) {
    if (doc.getElementsByTagNameNS("*", tag).length > 0) return false
  }
  return true
}

/** KMZ = ZIP mit einer KML darin, üblicherweise doc.kml. */
async function kmlAusKmz(file: File): Promise<string> {
  let eintraege
  try {
    eintraege = await unzip(new Uint8Array(await file.arrayBuffer()))
  } catch (err) {
    // unzip wirft bereits verständliche Meldungen; alles andere (z. B. RangeError) übersetzen.
    throw err instanceof Error
      ? err
      : new Error("Die KMZ-Datei konnte nicht entpackt werden. Bitte prüfen Sie die Datei.")
  }
  const kmls = eintraege.filter((e) => e.name.toLowerCase().endsWith(".kml"))
  const treffer = kmls.find((e) => e.name.toLowerCase().endsWith("doc.kml")) ?? kmls[0]
  if (!treffer) throw new Error("Die KMZ-Datei enthält keine KML-Datei.")
  return new TextDecoder().decode(treffer.daten)
}

// ---------------------------------------------------------------- GeoJSON

interface GeoJsonKnoten {
  type?: string
  coordinates?: unknown
  geometry?: GeoJsonKnoten
  geometries?: GeoJsonKnoten[]
  features?: GeoJsonKnoten[]
  properties?: Record<string, unknown> | null
}

/** Point und MultiPoint einsammeln; properties werden zu Attributen. */
function sammlePunkte(knoten: GeoJsonKnoten, props: Record<string, unknown>, out: Markierung[]): void {
  if (!knoten || typeof knoten !== "object") return
  const einer = (c: unknown) => {
    if (!Array.isArray(c)) return
    const punkt = baueMarkierung(zahl(c[1]), zahl(c[0]), nameAusAttributen(props), props)
    if (punkt) out.push(punkt)
  }
  switch (knoten.type) {
    case "FeatureCollection":
      knoten.features?.forEach((f) => sammlePunkte(f, props, out))
      break
    case "Feature":
      if (knoten.geometry) sammlePunkte(knoten.geometry, knoten.properties ?? {}, out)
      break
    case "GeometryCollection":
      knoten.geometries?.forEach((g) => sammlePunkte(g, props, out))
      break
    case "Point":
      einer(knoten.coordinates)
      break
    case "MultiPoint":
      if (Array.isArray(knoten.coordinates)) knoten.coordinates.forEach(einer)
      break
  }
}

export function parsePunkteGeoJson(text: string, name = "Punkte"): ParsedPunktEbene[] {
  let wurzel: GeoJsonKnoten
  try {
    wurzel = JSON.parse(text) as GeoJsonKnoten
  } catch {
    throw new Error("Die GeoJSON-Datei konnte nicht gelesen werden. Bitte prüfen Sie die Datei.")
  }
  const punkte: Markierung[] = []
  sammlePunkte(wurzel, {}, punkte)
  if (punkte.length === 0) {
    throw new Error("Die Datei enthält keine Punkte. Erwartet werden Point- oder MultiPoint-Geometrien.")
  }
  return pruefeGrenze([{ name, punkte }])
}

// ---------------------------------------------------------------- Shapefile

/** Shapefile-ZIP über shpjs: liest Punkte, Attribute und reprojiziert über die .prj.
 *  parseZip ist ein NAMED export — am Default hängt allein getShapefile. */
async function parsePunkteShapefile(file: File, fallbackName: string): Promise<ParsedPunktEbene[]> {
  const { parseZip } = await import("shpjs") // lazy — hält den Haupt-Bundle klein
  let roh
  try {
    roh = await parseZip(await file.arrayBuffer())
  } catch {
    throw new Error("Das Shapefile konnte nicht gelesen werden. Enthält das ZIP eine .shp-Datei?")
  }
  const ebenen: ParsedPunktEbene[] = []
  for (const fc of Array.isArray(roh) ? roh : [roh]) {
    const punkte: Markierung[] = []
    sammlePunkte(fc as GeoJsonKnoten, {}, punkte)
    if (punkte.length === 0) continue
    const ebene: ParsedPunktEbene = { name: fc.fileName?.trim() || fallbackName, punkte }
    // FALLE, live reproduziert: fehlt die .cpg, dekodiert parsedbf als UTF-8 und aus
    // „Rastplatz Süd" wird Ersatzzeichen-Müll. Nicht abbrechen, nur benennen.
    const kaputt = punkte.some(
      (p) =>
        (p.name ?? "").includes("\uFFFD") ||
        Object.values(p.attribute ?? {}).some((w) => w.includes("\uFFFD")),
    )
    if (kaputt) {
      ebene.hinweis =
        "Einige Umlaute konnten nicht gelesen werden: dem Shapefile fehlt die .cpg-Datei mit der " +
        "Zeichenkodierung. Die Punkte sind vollständig, nur die Schreibweise kann abweichen."
    }
    ebenen.push(ebene)
  }
  if (ebenen.length === 0) {
    throw new Error("Das Shapefile enthält keine Punkte, sondern nur Linien oder Flächen.")
  }
  return pruefeGrenze(ebenen)
}

// ---------------------------------------------------------------- Einstieg

/** Eine hochgeladene Datei → Punkt-Ebenen, eine je Layer in der Datei.
 *  Wirft bei echten Fehlern eine Error mit einer Meldung, die dem Nutzer angezeigt werden kann. */
export async function parsePunkteFile(file: File): Promise<ParsedPunktEbene[]> {
  const endung = file.name.toLowerCase()
  const basis = file.name.replace(/\.[^.]+$/, "").trim() || "Punkte"
  if (endung.endsWith(".kml")) return parsePunkteKml(await file.text(), basis)
  if (endung.endsWith(".kmz")) return parsePunkteKml(await kmlAusKmz(file), basis)
  if (endung.endsWith(".geojson") || endung.endsWith(".json")) {
    return parsePunkteGeoJson(await file.text(), basis)
  }
  if (endung.endsWith(".zip")) return parsePunkteShapefile(file, basis)
  if (endung.endsWith(".gpkg")) {
    const { parseGpkgPunkte } = await import("./parseGpkg") // lazy — sql.js ist groß
    const ebenen = await parseGpkgPunkte(file)
    if (ebenen.length === 0) throw new Error("Das GeoPackage enthält keine Punkttabelle.")
    return pruefeGrenze(ebenen)
  }
  throw new Error(
    "Format nicht unterstützt. Bitte KML, KMZ, GeoJSON, Shapefile (.zip) oder GeoPackage (.gpkg) verwenden.",
  )
}
