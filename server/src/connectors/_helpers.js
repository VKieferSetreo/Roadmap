// Geteilte Connector-Helfer (dependency-frei) — die EINZIGE live genutzte Normalisierung.
// Der frühere Ursprung API/_lib/format.mjs (von 37 alten cron.mjs importiert) ist totes Legacy:
// nicht deployed, nicht von server/src importiert → kein reales Drift-Risiko (T-284, untersucht).
// Connectoren ziehen den vollen Quell-Bestand und mappen via makeNormalized() in den
// Importer-Vertrag (NormalizedObstacle). Koordinaten-Plausibilität + UTM-Reprojektion inklusive.

import zlib from "node:zlib"

/** Plausibilität: Punkt in der DE-Bbox? (verwirft kaputte Quell-Koords). */
export function inDeBbox(lat, lng) {
  return lat != null && lng != null && lat >= 47.2 && lat <= 55.1 && lng >= 5.8 && lng <= 15.1
}

/** Tonnage-Zahl aus Freitext — NUR wenn sie an einem Gewichts-Limit-Kontext hängt (T-253),
 *  sonst wird "40-t-Kran" / "25 t Asphalt" fälschlich zum Fahrzeug-Gewichtslimit und führt zu
 *  einer falschen Routen-Freigabe. Bei dedizierten Gewichts-Feldern (Brücken-/Lastfeeds) per
 *  { requireKontext: false } die rohe erste Zahl nehmen. */
export function tonnageAusText(text, { requireKontext = true } = {}) {
  if (!text) return null
  const s = String(text).replaceAll(",", ".")
  if (!requireKontext) {
    const m = s.match(/(\d+(?:\.\d+)?)\s*(?:t\b|to\b|tonnen)/i)
    return m ? Number(m[1]) : null
  }
  // Kontext-Wort höchstens ~25 Zeichen VOR der Zahl: "zul. Gesamtgewicht 7,5 t", "Tragfähigkeit
  // 16 t", "max 16 to", "gesperrt … über 7,5 t", "lastbeschränkt auf 30 t". Adjazenz statt
  // bloßer Anwesenheit → "40t-Kran, Tragfähigkeit 16 t" liefert korrekt 16, nicht 40.
  const vor = s.match(
    /(?:gesamtgewicht|zul[.\s]*ges|zgg|tragf[äa]hig\w*|tragkraft|tragl\w*|lastbe\w*|gewichtsbe\w*|gewichtsl\w*|zul[äa]ssig|\bmax\.?|gesperrt|[üu]ber|\bab\b|\bbis\b)[^.\d]{0,25}(\d+(?:\.\d+)?)\s*(?:t\b|to\b|tonnen)/i,
  )
  if (vor) return Number(vor[1])
  // Kontext NACH der Zahl: "7,5 t zul. Gesamtgewicht", "16 t zGG", "30 t Tragfähigkeit".
  const nach = s.match(
    /(\d+(?:\.\d+)?)\s*(?:t\b|to\b|tonnen)[^.\d]{0,20}(?:zul|gesamtgewicht|zgg|gewichtsbe|tragf|lastbe)/i,
  )
  return nach ? Number(nach[1]) : null
}

/** Erste Höhen-/Breiten-Meterzahl aus Freitext. */
export function meterAusText(text, schluessel = /(?:höhe|hoehe|breite|durchfahrt)/i) {
  if (!text) return null
  const s = String(text).replaceAll(",", ".")
  if (schluessel && !schluessel.test(s)) return null
  const m = s.match(/(\d+(?:\.\d+)?)\s*m\b/)
  return m ? Number(m[1]) : null
}

/** ISO-Datum (YYYY-MM-DD) aus Timestamp/Datum, sonst null. */
export function dateOnly(v) {
  if (!v) return null
  const m = String(v).match(/\d{4}-\d{2}-\d{2}/)
  if (m) return m[0]
  const d = String(v).match(/(\d{2})\.(\d{2})\.(\d{2,4})/)
  if (d) {
    const yyyy = d[3].length === 2 ? "20" + d[3] : d[3]
    return `${yyyy}-${d[2]}-${d[1]}`
  }
  return null
}

// T-452: deutscher Monatsname → 0-basierter Index (voll, 3-Buchstaben, mit/ohne Punkt, ä/ae).
const MONATE = [
  /jan/i, /feb/i, /m(?:ä|ae|a)r/i, /apr/i, /mai/i, /jun/i,
  /jul/i, /aug/i, /sep/i, /okt/i, /nov/i, /dez/i,
]
/** Freitext-Enddatum wie "Ende Dez. 2029" / "Dezember 2029" → LETZTER Tag des Monats (YYYY-MM-DD).
 *  Konservativ: nur wenn Monat UND 4-stelliges Jahr erkennbar; sonst null (kein Raten). */
export function freitextMonatEnde(text) {
  const s = String(text ?? "")
  const jahr = s.match(/\b(20\d{2})\b/)
  if (!jahr) return null
  const monatIdx = MONATE.findIndex((re) => re.test(s))
  if (monatIdx < 0) return null
  // letzter Tag = Tag 0 des Folgemonats (UTC, damit kein TZ-Off-by-one, vgl. T-465)
  const last = new Date(Date.UTC(Number(jahr[1]), monatIdx + 1, 0)).getUTCDate()
  return `${jahr[1]}-${String(monatIdx + 1).padStart(2, "0")}-${String(last).padStart(2, "0")}`
}

const num = (v) => {
  if (v == null) return null
  const n = Number(String(v).replace(",", "."))
  return Number.isFinite(n) ? n : null
}

// ── Text-Extraktion ("Strip-downs") ───────────────────────────────────────────
// Viele Feeds (Autobahn, DATEX, Kommunen) packen Grenzwerte + Zeiträume NUR in den Freitext
// ("Maximale Durchfahrtsbreite: 10.75 m", "15.06.26 von 07:00 bis 19:00 Uhr"). Diese regelbasierten
// Extraktoren ziehen daraus strukturierte Stammdaten. Langfristig kommt ein LLM dahinter — bis dahin
// konservative Regex-Heuristiken (lieber nichts als falsch). Datums-Heuristik: kleinstes Datum = Start,
// größtes = Ende (Max-Vorgabe). Werte landen NUR in Lücken (vom Connector gesetzte Felder gewinnen).

/** Erste Meter-Angabe nach einem Schlüsselwort ("Breite … 3,5 m") → Zahl, sonst null. */
function masszahlNachWort(text, wortRe) {
  const m = String(text).replaceAll(",", ".").match(
    new RegExp(`(?:${wortRe})[^0-9]{0,14}?(\\d{1,3}(?:\\.\\d{1,2})?)\\s*m\\b`, "i"),
  )
  return m ? Number(m[1]) : null
}

/** Alle Datumsangaben (DD.MM.[YY]YY + ISO) → sortierte, plausible ISO-Liste (YYYY-MM-DD). */
function alleDaten(text) {
  const out = new Set()
  for (const m of String(text).matchAll(/\b(\d{1,2})\.(\d{1,2})\.(\d{2,4})\b/g)) {
    const tag = m[1].padStart(2, "0"), mon = m[2].padStart(2, "0")
    const jahr = m[3].length === 2 ? "20" + m[3] : m[3]
    if (Number(mon) >= 1 && Number(mon) <= 12 && Number(tag) >= 1 && Number(tag) <= 31) out.add(`${jahr}-${mon}-${tag}`)
  }
  for (const m of String(text).matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) out.add(`${m[1]}-${m[2]}-${m[3]}`)
  return [...out].filter((d) => d >= "2000-01-01" && d <= "2100-12-31").sort()
}

/** Erstes Straßen-Kennzeichen (A/B/L/K + Nummer) aus Freitext → "B252", sonst null. */
function strassenRefAus(text) {
  const m = String(text).match(/\b(A|B|L|K)[\s-]?(\d{1,4})\b/)
  return m ? `${m[1].toUpperCase()}${m[2]}` : null
}

/** Fahrtrichtung/Korridor aus Freitext → "Hamburg → Kassel" / "stadtauswärts" / "beide Richtungen". */
function richtungAus(text) {
  const s = String(text)
  const pfeil = s.match(/([A-ZÄÖÜ][\wäöüß.\- ]{1,28}?)\s*(?:→|->|–>|—>)\s*([A-ZÄÖÜ][\wäöüß.\- ]{1,28}?)(?=[\n,;.()|]|$)/)
  if (pfeil) return `${pfeil[1].trim()} → ${pfeil[2].trim()}`
  if (/in beide (?:fahrt)?richtungen|beidseitig|wechselseitig/i.test(s)) return "beide Richtungen"
  if (/stadtausw(?:ä|ae)rts/i.test(s)) return "stadtauswärts"
  if (/stadteinw(?:ä|ae)rts/i.test(s)) return "stadteinwärts"
  const fr = s.match(/(?:Fahrtrichtung|Richtung)\s+([A-ZÄÖÜ][\wäöüß.\- ]{1,28}?)(?=[\n,;.()|]|$)/i)
  return fr ? fr[1].trim() : null
}

/**
 * Strukturierte Stammdaten aus Freitext ziehen. Liefert nur gefundene Felder:
 *   { restbreiteM?, maxHoeheM?, maxGewichtT?, maxAchslastT?, sperrlaengeM?,
 *     gueltigVon?, gueltigBis?, zeitfenster?, strassenRef?, richtung? }
 * Konservativ: Maße brauchen ihr Schlüsselwort, ein EINZELNES Datum nur mit Gültigkeits-Kontext
 * (sonst würde ein "Stand: …"-Datum fälschlich als Beginn gewertet). Lieber nichts als falsch.
 */
export function extractStammdaten(text) {
  if (!text) return {}
  const s = String(text)
  const norm = s.replaceAll(",", ".")
  const out = {}

  // Maße müssen > 0 sein (0 m / 0 t ist keine echte Angabe, sondern "fehlt").
  const breite = masszahlNachWort(s, "durchfahrtsbreite|durchfahrbreite|fahrbahnbreite|restbreite|breite")
  if (breite > 0) out.restbreiteM = breite
  // T-254: bloßes "höhe" matchte das FAHRZEUG-Maß (Aufbau-/Gesamt-/Transport-/Lade-/Nutzhöhe) und
  // las es fälschlich als Durchfahrtshöhe → falsches Höhenlimit. Jetzt Clearance-Begriffe explizit
  // (Durchfahrts-/lichte Höhe, Höhenbeschränkung/-begrenzung) + bare "höhe" nur mit Negativ-Lookbehind
  // gegen die Fahrzeug-Komposita.
  const hoehe = masszahlNachWort(
    s,
    "durchfahrtsh(?:ö|oe)he|lichte\\s+h(?:ö|oe)he|h(?:ö|oe)henbeschr(?:ä|ae)nkung|h(?:ö|oe)henbegrenzung|" +
      "(?<!aufbau)(?<!gesamt)(?<!transport)(?<!lade)(?<!fahrzeug)(?<!nutz)(?<!bau)(?<!ist)h(?:ö|oe)he",
  )
  if (hoehe > 0) out.maxHoeheM = hoehe
  const gewicht = tonnageAusText(s)
  if (gewicht > 0) out.maxGewichtT = gewicht
  // Achslast: "Achslast 10 t", "zul. Achslast 11,5 t".
  const achslast = norm.match(/achslast[^0-9]{0,12}?(\d{1,2}(?:\.\d{1,2})?)\s*t\b/i)
  if (achslast && Number(achslast[1]) > 0) out.maxAchslastT = Number(achslast[1])
  // Länge der Maßnahme/Baustelle: "Länge: 24.92 km" → Meter (informativ, kein Fahrzeug-Limit).
  const laengeKm = norm.match(/l(?:ä|ae)ng[e]?[^0-9]{0,8}?(\d{1,3}(?:\.\d{1,2})?)\s*km\b/i)
  const laengeM = norm.match(/l(?:ä|ae)ng[e]?[^0-9]{0,8}?(\d{1,4}(?:\.\d{1,2})?)\s*m\b/i)
  const laenge = laengeKm ? Math.round(Number(laengeKm[1]) * 1000) : laengeM ? Math.round(Number(laengeM[1])) : 0
  if (laenge > 0) out.sperrlaengeM = laenge

  // Zeitfenster: "von 07:00 bis 19:00 Uhr" / "07.00-19.00".
  const zf = s.match(/(\d{1,2})[:.](\d{2})\s*(?:bis|-|–|—)\s*(\d{1,2})[:.](\d{2})/)
  if (zf) out.zeitfenster = `${zf[1].padStart(2, "0")}:${zf[2]}–${zf[3].padStart(2, "0")}:${zf[4]}`

  const ref = strassenRefAus(s)
  if (ref) out.strassenRef = ref
  const richtung = richtungAus(s)
  if (richtung) out.richtung = richtung

  // Sperrart (kontrolliertes Vokabular): Voll- vor Halbsperrung prüfen ("halbseitige Sperrung"
  // enthält "Sperrung", ist aber KEINE Vollsperrung).
  if (/vollsperrung|voll gesperrt|komplett gesperrt|gesamtsperrung/i.test(s)) out.vollsperrung = true
  else if (/halbseitig|einseitig|halbe sperrung|ein(?:en|es)?\s+fahrstreifen/i.test(s)) out.halbseitig = true

  // Zusätzliche GST-Signale (Workflow-entdeckt + adversarial verifiziert, FP-arm). Booleans nur true.
  // Fahrbahn-Verengung = wichtigstes Restbreiten-Surrogat, wenn keine cm-Angabe da ist.
  if (/\bFahrbahn\w*[^,.;]{0,40}?(?:eingeengt|verengt)|\bFahrbahn(?:einengung|verengung)\b|(?:Einengung|Verengung)\s+der\s+Fahrbahn/i.test(s)) out.fahrbahnVerengt = true
  const spuren = s.match(/auf\s+(einen|zwei|drei|vier|f(?:ü|ue)nf|\d{1,2})\s+Fahrstreifen\s+(?:verengt|reduziert|eingeengt)/i)
  if (spuren) {
    const wort = { einen: 1, zwei: 2, drei: 3, vier: 4, fünf: 5, fuenf: 5 }
    const n = wort[spuren[1].toLowerCase()] ?? Number(spuren[1])
    if (n > 0) out.anzahlFahrstreifen = n
  }
  // Umleitung: Negative-Lookbehind gegen "keine/ohne Umleitung" (im Workflow als FP-Fix bestätigt).
  if (/(?<!keine\s)(?<!ohne\s)(?:\bUmleitung(?:sstrecke)?\b|\bBedarfsumleitung\b|Verkehr wird (?:ü|ue)ber die Gegenfahrbahn geleitet)/i.test(s)) out.umleitung = true
  if (/\bEinbahnstra(?:ß|ss)e\b/i.test(s)) out.einbahnstrasse = true
  if (/\bSackgasse\b/i.test(s)) out.sackgasse = true // GST: kein Wenden möglich
  if (/\bHavarie\b|\bNotma(?:ß|ss)nahme\b|\bWasserrohrbruch\b/i.test(s)) out.havarie = true // akut/ungeplant
  // (bauwerkstyp bewusst NICHT extrahiert — redundant mit kategorie bruecke/tunnel, feuerte massenhaft
  //  auf generische OSM-Namen "Brücke (OSM)" und flaggte Infrastruktur fälschlich als KI-aufbereitet.)
  // "Kanal" braucht Bau-Kontext-Suffix — sonst feuert es auf geografische Gewässernamen
  // ("Rhein-Herne-Kanal", "Zum Kanal") statt auf eine Kanal-Baustelle.
  const medium = s.match(/\b(Fernw(?:ä|ae)rme|Trinkwasser|Wasserleitung|Gasleitung|Gasversorgung|Stromleitung|Stromnetz|Glasfaser|Breitband|Telekommunikation|Kommunikationsleitung|Kanal(?:isation|sanierung|arbeiten|bau|netz))\b/i)
  if (medium) out.medium = medium[1] // Bauanlass (Versorgungsleitung)

  // Datums-Heuristik: kleinstes = Start, größtes = Ende. Einzeldatum nur mit Gültigkeits-Kontext.
  const daten = alleDaten(s)
  const hatKontext = /\b(g(?:ü|ue)ltig|gilt|zeitraum|vom|bis|ab\s|baubeginn|bauende|dauer|gesperrt|sperrung|wirksam)\b/i.test(s)
  if (daten.length >= 2) {
    out.gueltigVon = daten[0]
    if (daten[daten.length - 1] !== daten[0]) out.gueltigBis = daten[daten.length - 1]
  } else if (daten.length === 1 && hatKontext) {
    out.gueltigVon = daten[0]
  }
  return out
}

/** Kurzer, stabiler Hash (FNV-1a → base36). Für eindeutige, deterministische externeIds:
 *  Quell-IDs mancher Feeds sind nicht eindeutig (null/Dublette) → beim Upsert auf (quelle, externe_id)
 *  überschreiben sich Datensätze gegenseitig. Ein Geometrie-Suffix `${base}#${stabilHash(lat,lng,...)}`
 *  macht sie eindeutig OHNE Run-zu-Run-Drift (gleiche Geometrie → gleicher Hash → reconcile-stabil). */
export function stabilHash(...teile) {
  const s = teile.map((t) => (t == null ? "" : String(t))).join("|")
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(36)
}

// ── Genereller Dubletten-Filter (quellenübergreifend) ────────────────────────
// Viele Quellen liefern EIN Ereignis als mehrere Features (Segmente/Teile/Spuren):
// gleicher Name, gleiche Kategorie, ~gleicher Ort, verschiedene externe_ids
// (z.B. …-sperrung.001/.002/.003, APP_BEDARFSUMLEITUNGEN_843326/842, mehrere WFS-
// Features an einer Adresse). Das stapelt N Pins am selben Punkt. dedupeObstacles
// fasst solche Gruppen je Connector-Output zu EINEM Strecken-Hindernis zusammen.

const DEDUP_MIN_KEYS = new Set([
  "restbreiteM", "maxHoeheM", "maxBreiteM", "maxGewichtT", "maxAchslastT", "maxLaengeM", "spurenFrei",
])
const DEDUP_MAX_KEYS = new Set(["spurenGesperrt", "sperrlaengeM", "radiusM"])

/** Gruppenschlüssel: Kategorie + normalisierter Name + Ort auf 3 NK (≈100 m).
 *  Der Importer ruft dedupe je Connector-Output auf → quellen_id ist implizit konstant. */
export function dupGroupKey(o) {
  const name = String(o?.name ?? "").trim().toLowerCase().replace(/\s+/g, " ")
  const lat = Number(o?.lat)
  const lng = Number(o?.lng)
  const ll = Number.isFinite(lat) && Number.isFinite(lng) ? `${lat.toFixed(3)},${lng.toFixed(3)}` : "?"
  return `${o?.kategorie ?? ""}|${name}|${ll}`
}

/** Stabile externeId einer zusammengefassten Gruppe (gleich über Läufe → Upsert statt Insert,
 *  Reconcile deaktiviert die alten Einzel-Segmente). */
export function dupExterneId(o) {
  return `dup#${stabilHash(dupGroupKey(o))}`
}

function mergeGeoms(group) {
  const lines = []
  for (const o of group) {
    const g = o?.geom
    if (!g || !g.type) continue
    if (g.type === "LineString") lines.push(g.coordinates)
    else if (g.type === "MultiLineString") lines.push(...g.coordinates)
  }
  if (lines.length) return { type: "MultiLineString", coordinates: lines }
  return group.find((o) => o?.geom)?.geom ?? null
}

function mergeDupGroup(group) {
  const first = group[0]
  const attrs = {}
  for (const o of group) {
    for (const [k, v] of Object.entries(o?.attrs ?? {})) {
      if (typeof v === "boolean") { if (v) attrs[k] = true }
      else if (typeof v === "number") {
        if (DEDUP_MIN_KEYS.has(k)) attrs[k] = attrs[k] == null ? v : Math.min(attrs[k], v)
        else if (DEDUP_MAX_KEYS.has(k)) attrs[k] = attrs[k] == null ? v : Math.max(attrs[k], v)
        else attrs[k] = attrs[k] ?? v
      } else attrs[k] = attrs[k] ?? v
    }
  }
  const vons = group.map((o) => o?.gueltigVon).filter(Boolean).sort()
  const bisse = group.map((o) => o?.gueltigBis).filter(Boolean).sort()
  const gueltigVon = vons[0] ?? null
  const gueltigBis = bisse.length ? bisse[bisse.length - 1] : null
  const beschreibung = group.map((o) => o?.beschreibung).find((b) => b && String(b).trim()) ?? null
  return {
    ...first,
    externeId: dupExterneId(first),
    beschreibung,
    attrs,
    ...(gueltigVon ? { gueltigVon, realerStart: gueltigVon } : {}),
    ...(gueltigBis ? { gueltigBis } : {}),
    kiAufbereitet: group.some((o) => o?.kiAufbereitet),
    geom: mergeGeoms(group),
  }
}

/** Dubletten eines Connector-Outputs zusammenfassen → EIN Strecken-Hindernis je Gruppe
 *  (kombinierte Linien-Geometrie, schärfste Maße, weitester Zeitraum, stabile dup#-externeId).
 *  Singletons und Einträge ohne Namen bleiben unverändert (kein Über-Mergen). */
export function dedupeObstacles(items) {
  if (!Array.isArray(items)) return []
  const groups = new Map()
  const out = []
  for (const o of items) {
    if (!String(o?.name ?? "").trim()) {
      out.push(o) // ohne Name zu unspezifisch → nicht gruppieren
      continue
    }
    const k = dupGroupKey(o)
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k).push(o)
  }
  for (const group of groups.values()) {
    out.push(group.length === 1 ? group[0] : mergeDupGroup(group))
  }
  return out
}

/**
 * Baut ein NormalizedObstacle für den Importer (validateObstacle/insertObstacle).
 * Kaputte Koords (außerhalb DE) → null (Item wird dann mangels lat/lng übersprungen).
 * attrs: nur numerische/boolesche Grenzwerte; leere/null-Werte werden gefiltert.
 */
// Maß-Attribute, bei denen 0 KEIN echter Grenzwert ist (0 = "keine Angabe", zeigt sonst "0 m"/"0 t").
const NULL_BEI_NULL = new Set([
  "restbreiteM", "maxBreiteM", "maxHoeheM", "maxGewichtT", "maxAchslastT", "maxLaengeM", "sperrlaengeM", "radiusM",
])

// extractStammdaten-Felder, die KEINE attrs sind (eigene Spalten / Top-Level) — Rest wandert in attrs.
// T-255: 'richtung' wandert jetzt als Freitext-attr in attrs (NICHT in die CHECK-Spalte 'richtung' aus
// Migration 006) — es ist ein Ortskontext-Wort ("Nord"/"Ri. Hamburg"), kein kontrolliertes Enum.
const EX_NICHT_ATTR = new Set(["gueltigVon", "gueltigBis", "strassenRef"])

// T-256/T-460: attrs sind Grenzwerte (number/boolean) PLUS wenige belegte Freitext-Felder. Vorher
// liess der Initial-Filter nur number|boolean durch, der Extraktions-Merge schrieb aber Strings
// ungeprüft zurück → inkonsistent (Connector-Strings still weg, Extraktions-Strings überlebten).
// Eine Regel für BEIDE Stellen: number/boolean immer (0-Sentinel bei Maßen droppen), Strings nur
// aus dieser Whitelist (sonst gehört der Text in die Beschreibung, nicht in die Grenzwert-attrs).
const STRING_ATTRS = new Set(["zeitfenster", "medium", "richtung"])
function attrErlaubt(k, v) {
  if (v == null || v === "") return false
  if (typeof v === "number") return !(v === 0 && NULL_BEI_NULL.has(k))
  if (typeof v === "boolean") return true
  if (typeof v === "string") return STRING_ATTRS.has(k) && v.trim() !== ""
  return false
}

/** Freitext säubern: HTML-Tags raus, Entities dekodieren, Mehrfach-Spaces zusammenziehen, trimmen.
 *  Zeilenumbrüche bleiben erhalten (sinnvolle Struktur, z.B. Autobahn-Meldungen). null-sicher. */
export function stripHtml(text) {
  if (text == null) return null
  const s = String(text)
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/[ \t]{2,}/g, " ").replace(/[ \t]+\n/g, "\n").trim()
  return s || null
}

export function makeNormalized({
  externeId, kategorie, name = null, beschreibung = null, lat, lng,
  strassenRef = null, attrs = {}, gueltigVon = null, gueltigBis = null, realerStart = null,
  quelleName = null, quelleUrl = null, geom = null,
}) {
  let nlat = lat != null ? Number(lat) : null
  let nlng = lng != null ? Number(lng) : null
  if (nlat != null && nlng != null && !inDeBbox(nlat, nlng)) {
    nlat = null
    nlng = null
  }
  const cleanAttrs = Object.fromEntries(
    Object.entries(attrs || {}).filter(([k, v]) => attrErlaubt(k, v)),
  )
  beschreibung = stripHtml(beschreibung)

  // Strip-down: fehlende Grenzwerte/Zeiträume aus dem Freitext (Name + Beschreibung) nachziehen.
  // Nur Lücken füllen — vom Connector explizit gesetzte Werte bleiben unangetastet.
  const ex = extractStammdaten([name, beschreibung].filter(Boolean).join(" · "))
  let extrahiert = false
  // Alle extrahierten attrs generisch übernehmen (außer den Nicht-attr-Feldern) — nur Lücken füllen.
  for (const [k, v] of Object.entries(ex)) {
    if (EX_NICHT_ATTR.has(k)) continue
    // T-460: gleicher Filter wie initial — kein ungeprüftes String-Zurückschreiben mehr.
    if (cleanAttrs[k] == null && attrErlaubt(k, v)) { cleanAttrs[k] = v; extrahiert = true }
  }
  let vonFinal = gueltigVon, bisFinal = gueltigBis
  if (vonFinal == null && ex.gueltigVon) { vonFinal = ex.gueltigVon; extrahiert = true }
  if (bisFinal == null && ex.gueltigBis) { bisFinal = ex.gueltigBis; extrahiert = true }
  let refFinal = strassenRef
  if ((refFinal == null || refFinal === "") && ex.strassenRef) { refFinal = ex.strassenRef; extrahiert = true }

  const besch = beschreibung != null ? String(beschreibung) : null
  return {
    externeId: externeId != null ? String(externeId) : null,
    kategorie,
    name: name != null ? String(name).slice(0, 240) : null,
    // Beschreibung = PURER Quelltext (was die Behörde/Quelle liefert), keine eigenen Notizen.
    // Dass strukturierte Felder abgeleitet wurden, markiert separat das kiAufbereitet-Flag/Badge.
    beschreibung: besch,
    lat: nlat,
    lng: nlng,
    strassenRef: refFinal != null ? String(refFinal) : null,
    attrs: cleanAttrs,
    gueltigVon: dateOnly(vonFinal),
    gueltigBis: dateOnly(bisFinal),
    realerStart: dateOnly(realerStart),
    kiAufbereitet: extrahiert, // Flag: aus Freitext angereichert → FE-Badge "mit KI-Aufbereitung"
    geom: geom && typeof geom === "object" ? geom : null, // GeoJSON-Geometrie (Strecke) für Linien-Render
    quelle: { name: quelleName, url: quelleUrl, aktualisiertAm: new Date().toISOString() },
  }
}

/** GET → JSON (Timeout, Fehler → null). */
export async function getJson(url, { timeoutMs = 30000, headers = {} } = {}) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), headers: { "user-agent": "roadmap-connector/1.0", ...headers } })
    if (!r.ok) return null
    return await r.json()
  } catch {
    return null
  }
}

/** GET → Text. */
export async function getText(url, { timeoutMs = 30000, headers = {} } = {}) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), headers: { "user-agent": "roadmap-connector/1.0", ...headers } })
    if (!r.ok) return null
    return await r.text()
  } catch {
    return null
  }
}

/** Paginierter WFS/OGC-API-Voll-Abruf → GeoJSON-Features. Läuft bis der Bestand vollständig ist
 *  (Seite < pageSize ODER all.length ≥ numberMatched), NICHT bis zu einem fixen Seiten-Cap — sonst
 *  würde ein zu niedriges maxPages den Bestand still abschneiden (und Reconcile löscht das Fehlende).
 *  maxPages ist nur noch ein hoher Sicherheits-Backstop; wird er erreicht, warnt log(). */
export async function fetchAllFeatures(baseUrl, { mode = "wfs2", pageSize = 1000, maxPages = 500, timeoutMs = 45000, log = () => {} } = {}) {
  const all = []
  let matched = null
  for (let page = 0; page < maxPages; page++) {
    const sep = baseUrl.includes("?") ? "&" : "?"
    let url
    if (mode === "wfs2") url = `${baseUrl}${sep}count=${pageSize}&startIndex=${page * pageSize}`
    else if (mode === "wfs1") url = `${baseUrl}${sep}maxFeatures=${pageSize}`
    else url = `${baseUrl}${sep}limit=${pageSize}&offset=${page * pageSize}`
    // T-504: WFS-Server (z.B. Hamburg 0134) scheitern intermittent an einer Folgeseite. Pro Seite
    // bis zu 3× mit Backoff versuchen, bevor wir abbrechen — ein transienter Hänger heilt sich so,
    // statt einen sonst erfolgreichen Voll-Abruf in 'error' (Teilbestand) zu kippen.
    let data = null
    for (let attempt = 0; attempt < 3 && data == null; attempt++) {
      if (attempt > 0) {
        log(`fetchAllFeatures: Seite startIndex ${page * pageSize} fehlgeschlagen — Retry ${attempt}/2`)
        await new Promise((r) => setTimeout(r, 1000 * attempt))
      }
      data = await getJson(url, { timeoutMs })
    }
    // T-311/T-314: ein (auch nach Retries) fehlgeschlagener Seitenabruf ist KEIN leerer/letzter Feed.
    // Werfen → runImport setzt status='error', der Vollbestand-Reconcile läuft NICHT auf einem
    // Teilbestand (sonst würde der ungeladene Rest fälschlich deaktiviert = "Strecke frei").
    if (data == null) {
      throw new Error(
        `fetchAllFeatures: Seitenabruf fehlgeschlagen (startIndex ${page * pageSize}) nach 3 Versuchen — Teilbestand, Reconcile-Schutz`,
      )
    }
    const feats = data?.features ?? []
    if (matched == null && Number.isFinite(data?.numberMatched)) matched = data.numberMatched
    all.push(...feats)
    if (feats.length < pageSize || mode === "wfs1") return all // letzte Seite / WFS1 ohne Offset
    if (matched != null && all.length >= matched) return all // vollständig laut numberMatched
    if (page === maxPages - 1) log(`fetchAllFeatures: Sicherheits-Cap maxPages=${maxPages} erreicht bei ${all.length}${matched != null ? `/${matched}` : ""} — Bestand evtl. abgeschnitten`)
  }
  return all
}

/** Erster Punkt (lng,lat) aus einer GeoJSON-Geometrie; UTM (>1000) → WGS84 reprojiziert. */
export function ersterPunkt(geom, zone = 32) {
  if (!geom || !geom.coordinates) return [null, null]
  let c = geom.coordinates
  while (Array.isArray(c) && Array.isArray(c[0])) c = c[0]
  if (!Array.isArray(c)) return [null, null]
  if (Math.abs(c[0]) > 1000) return utmZuWgs84(c[0], c[1], zone)
  return [c[0], c[1]]
}

export { num }

/** UTM (EPSG:25832 Zone 32 / 25833 Zone 33, ETRS89≈WGS84) → [lng, lat]. */
export function utmZuWgs84(easting, northing, zone = 32) {
  const a = 6378137.0, f = 1 / 298.257223563
  const k0 = 0.9996, e2 = f * (2 - f), ep2 = e2 / (1 - e2)
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2))
  const x = easting - 500000.0, y = northing
  const M = y / k0
  const mu = M / (a * (1 - e2 / 4 - (3 * e2 * e2) / 64 - (5 * e2 ** 3) / 256))
  const phi1 =
    mu + ((3 * e1) / 2 - (27 * e1 ** 3) / 32) * Math.sin(2 * mu) +
    ((21 * e1 ** 2) / 16 - (55 * e1 ** 4) / 32) * Math.sin(4 * mu) +
    ((151 * e1 ** 3) / 96) * Math.sin(6 * mu)
  const N1 = a / Math.sqrt(1 - e2 * Math.sin(phi1) ** 2)
  const T1 = Math.tan(phi1) ** 2
  const C1 = ep2 * Math.cos(phi1) ** 2
  const R1 = (a * (1 - e2)) / (1 - e2 * Math.sin(phi1) ** 2) ** 1.5
  const D = x / (N1 * k0)
  const lat = phi1 - ((N1 * Math.tan(phi1)) / R1) *
      ((D * D) / 2 - ((5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * ep2) * D ** 4) / 24 +
        ((61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * ep2 - 3 * C1 * C1) * D ** 6) / 720)
  const lng = (D - ((1 + 2 * T1 + C1) * D ** 3) / 6 +
      ((5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * ep2 + 24 * T1 * T1) * D ** 5) / 120) / Math.cos(phi1)
  const lng0 = (zone * 6 - 183) * (Math.PI / 180)
  return [(lng0 + lng) * (180 / Math.PI), lat * (180 / Math.PI)]
}

/** Ganze GeoJSON-Geometrie (Point/Line/Multi) aus UTM (zone) → WGS84 [lng,lat] reprojizieren. */
export function reprojGeom(geom, zone) {
  if (!geom?.coordinates) return null
  const map = (c) => (Array.isArray(c[0]) ? c.map(map) : utmZuWgs84(c[0], c[1], zone))
  return { type: geom.type, coordinates: map(geom.coordinates) }
}

/** Binär-Abruf (für ZIP/Downloads). Buffer oder null bei Fehler. */
export async function getBuffer(url, { timeoutMs = 45000, headers = {} } = {}) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), headers: { "user-agent": "roadmap-connector/1.0", ...headers } })
    if (!r.ok) return null
    return Buffer.from(await r.arrayBuffer())
  } catch {
    return null
  }
}

/** Eine Datei aus einem ZIP-Buffer entpacken (dependency-frei, stored + deflate über zlib).
 *  Scannt lokale Datei-Header (PK\x03\x04); erster Treffer auf nameRegex gewinnt. Buffer oder null. */
export function unzipEntry(buf, nameRegex) {
  if (!buf || buf.length < 30) return null
  for (let i = 0; i + 30 <= buf.length; i++) {
    if (buf.readUInt32LE(i) !== 0x04034b50) continue // kein lokaler Header hier
    const method = buf.readUInt16LE(i + 8)
    const compSize = buf.readUInt32LE(i + 18)
    const nameLen = buf.readUInt16LE(i + 26)
    const extraLen = buf.readUInt16LE(i + 28)
    const name = buf.toString("utf8", i + 30, i + 30 + nameLen)
    const dataStart = i + 30 + nameLen + extraLen
    if (compSize === 0) continue // Data-Descriptor-ZIP (Größe erst nach den Daten) — nicht unterstützt
    if (nameRegex.test(name)) {
      const data = buf.subarray(dataStart, dataStart + compSize)
      try {
        return method === 0 ? data : zlib.inflateRawSync(data)
      } catch {
        return null
      }
    }
    i = dataStart + compSize - 1 // hinter diesen Eintrag springen (i++ der Schleife addiert 1)
  }
  return null
}
