// DATEX-II-Parser (dependency-frei) — SituationPublication-XML → NormalizedObstacle[].
// Wiederverwendbarer Kern für alle DATEX-II-Quellen (Mobilithek-Feeds aller Länder, BASt …).
// Bewusst tolerant/best-effort (DATEX II v2 + v3, herstellerspezifische Profile): wir
// extrahieren situationRecord-Blöcke und ziehen je Block Typ, Gültigkeit, Koordinaten und
// (wo vorhanden) Restriktionswerte. Verfeinert wird, sobald echte Feeds fließen.
//
// NormalizedObstacle (Connector-Vertrag): { externeId, kategorie, name, beschreibung?, lat, lng,
//   strassenRef?, attrs, gueltigVon?, gueltigBis?, realerStart?, quelle:{name,url,aktualisiertAm} }

import { cleanText } from "../util.js"
import { kuerzeAufWortgrenze, endeWennBefristet } from "./_helpers.js"

const tag = (xml, name) => {
  // erstes <name ...>…</name> (namespace-tolerant), non-greedy
  const m = xml.match(new RegExp(`<(?:[\\w.-]+:)?${name}\\b[^>]*>([\\s\\S]*?)</(?:[\\w.-]+:)?${name}>`, "i"))
  return m ? m[1].trim() : null
}
const attrOf = (openTag, attr) => {
  const m = openTag.match(new RegExp(`${attr}\\s*=\\s*"([^"]*)"`, "i"))
  return m ? m[1] : null
}
// DATEX-II-Freitext: der eigentliche Text steckt oft verschachtelt in
// <comment><values><value lang="de">…</value></values></comment><commentExtension>…roadworksName…
// Wir ziehen den deutschen <value> (sonst ersten value), sonst tag-frei. Verhindert, dass roher
// XML-Müll als Fund-Name/Beschreibung landet (NI/BAB-Feeds). Plain-Text bleibt unverändert.
function commentText(raw) {
  return cleanText(raw) || null
}

// Manche Feeds (z.B. Autobahn-GmbH/BAB-AkD) verdoppeln den Namen selbst im Quell-<value>:
// "A44 Grünpflege - A44 Grünpflege - Lage-1" bzw. "X - Y - X - Y - tail". Kollabiert einen
// wiederholten führenden Block (k Segmente == die nächsten k) zu einem.
function dedupeName(s) {
  if (!s || !s.includes(" - ")) return s
  const seg = s.split(" - ")
  for (let k = Math.floor(seg.length / 2); k >= 1; k--) {
    if (seg.slice(0, k).join("") === seg.slice(k, 2 * k).join("")) {
      return [...seg.slice(0, k), ...seg.slice(2 * k)].join(" - ")
    }
  }
  return s
}
const num = (s) => {
  if (s == null) return null
  const n = Number(String(s).replace(",", "."))
  return Number.isFinite(n) ? n : null
}
const dateOnly = (s) => {
  if (!s) return null
  const m = String(s).match(/\d{4}-\d{2}-\d{2}/)
  return m ? m[0] : null
}
// Hier gilt 200, nicht die 240 aus makeNormalized: parseDatex2 baut den NormalizedObstacle selbst
// und laeuft NICHT durch makeNormalized. Beide Grenzen bleiben unveraendert, nur die Art des
// Schnitts aendert sich (T-706).
const NAME_MAX = 200

/** xsi:type / Element-Typ → unsere Kategorie. Best-effort über bekannte DATEX-Typen + Stichworte. */
function kategorieAusTyp(recordOpenTag, recordXml) {
  const t = (attrOf(recordOpenTag, "xsi:type") || "").toLowerCase()
  const low = (recordXml || "").toLowerCase()
  if (t.includes("maintenanceworks") || t.includes("roadworks") || t.includes("constructionworks")) return "baustelle"
  // Reale Feeds (Mobilithek): Bau-Sperrungen sind xsi:type RoadOrCarriagewayOrLaneManagement
  // MIT constructionWorkType/managedCause=roadworks → das sind Arbeitsstellen, keine reinen Sperrungen.
  if (low.includes("constructionworktype") || low.includes("roadworks") || low.includes("maintenanceworks")) return "baustelle"
  if (t.includes("roadorcarriageway") || t.includes("closure") || low.includes("carriagewayclosed") || low.includes("roadclosed")) return "sperrung"
  if (t.includes("networkmanagement") && (low.includes("weight") || low.includes("gewicht"))) return "gewicht"
  if (low.includes("heightlimit") || low.includes("maximumheight") || low.includes("durchfahrtshöhe")) return "bruecke"
  if (low.includes("widthlimit") || low.includes("maximumwidth")) return "engstelle"
  if (low.includes("weightlimit") || low.includes("maximumweight") || low.includes("gewichtsbesch")) return "gewicht"
  // Fallback: Verkehrsbehinderung mit Bauwerksbezug → baustelle, sonst sperrung
  return t.includes("roadworks") || low.includes("baustelle") ? "baustelle" : "sperrung"
}

// Alle Werte eines wiederholbaren Tags im Record (z.B. mehrere Management-Typen je Carriageway).
function tagAll(recordXml, name) {
  const re = new RegExp(`<(?:[\\w.-]+:)?${name}\\b[^>]*>([\\s\\S]*?)</(?:[\\w.-]+:)?${name}>`, "gi")
  return [...recordXml.matchAll(re)].map((mm) => mm[1].trim()).filter(Boolean)
}

// roadOrCarriagewayOrLaneManagementType-Werte, die eine VOLLE Sperrung bedeuten (DATEX-Enum).
const MGMT_VOLL = /^(roadclosed|carriagewayclosed)$/i

/** Strukturierte Sperr-Information aus RoadOrCarriagewayOrLaneManagement-Records — das EINZIGE,
 *  was die Mobilithek-Bau/Sperr-Feeds strukturiert führen (verifiziert am Live-XML 2026-06-17;
 *  Höhe/Gewicht/Länge sind in diesen Feeds NICHT enthalten). Liefert Sperrart, Spuren, Richtung. */
function sperrAttrsAusRecord(recordXml) {
  const out = {}
  const typen = tagAll(recordXml, "roadOrCarriagewayOrLaneManagementType")
  if (typen.length) {
    out.sperrungArt = typen[0]
    if (typen.some((t) => MGMT_VOLL.test(t))) out.vollsperrung = true
    // laneClosures/carriagewayPartiallyClosed/…AlternateLineTraffic = Teilsperrung (informativ,
    // KEIN harter Block-Flag — Schwertransport kann oft passieren).
    else if (typen.some((t) => /lane|partial|alternate|contraflow|shoulder/i.test(t))) out.teilsperrung = true
  }
  const gesperrt = num(tag(recordXml, "numberOfLanesRestricted"))
  const gesamt = num(tag(recordXml, "totalNumberOfLanes") || tag(recordXml, "numberOfLanes"))
  if (gesperrt != null) out.spurenGesperrt = gesperrt
  if (gesamt != null) out.spurenGesamt = gesamt
  const dir = (tag(recordXml, "directionRelativeOnLinearSection") || tag(recordXml, "alertCDirectionCoded") || "").trim()
  // T-611: DATEX-Richtungs-Enum in lesbares Deutsch mappen statt roh durchzureichen („positive"/„aligned"
  // landete sonst wörtlich im Popup als „Richtung positive"). Unspezifische/beide → weglassen.
  const r = mapDatexRichtung(dir)
  if (r) out.richtung = r
  return out
}

// T-635 (Data-Audit): tägliches Uhrzeit-Sperrfenster nächtlicher/zeitweiser Sperrungen → attrs.zeitfenster.
// REIN INFORMATIV (Popup) — die Severity wird NICHT gesenkt: Großraum-/Schwertransporte fahren häufig
// NACHTS unter genehmigungspflichtigen Nacht-Vollsperrungen, eine Nacht-Sperrung ist also relevant, nicht
// harmlos. (a) strukturiert aus recurringTimePeriodOfDay (startTimeOfPeriod/endTimeOfPeriod), (b) Freitext-
// Fallback NUR mit Pflicht-„h"/„Uhr" auf beiden Seiten (verifiziert an realen 0145-Daten „20h bis 5h",
// „19h-6h") — so treffen km-/Datumsangaben („km 10 bis 15") den Regex nicht.
function normHHMM(s) {
  const m = String(s ?? "").match(/^\s*(\d{1,2})(?::(\d{2}))?/)
  if (!m || Number(m[1]) > 23) return null
  return `${String(m[1]).padStart(2, "0")}:${m[2] ?? "00"}`
}
export function zeitfensterAusRecord(rec, text) {
  let von = normHHMM(tag(rec, "startTimeOfPeriod"))
  let bis = normHHMM(tag(rec, "endTimeOfPeriod"))
  if (!(von && bis)) {
    const m = String(text ?? "").match(/\b(\d{1,2})(?::(\d{2}))?\s*(?:h|uhr)\s*(?:bis|-|–|—)\s*(\d{1,2})(?::(\d{2}))?\s*(?:h|uhr)\b/i)
    if (m) { von = normHHMM(`${m[1]}:${m[2] ?? "00"}`); bis = normHHMM(`${m[3]}:${m[4] ?? "00"}`) }
  }
  if (!(von && bis) || von === bis) return {}
  const nurNachts = /\bnachts?\b|\bnächtlich/i.test(text ?? "") || Number(von.slice(0, 2)) > Number(bis.slice(0, 2))
  return { zeitfenster: `${von}–${bis}`, ...(nurNachts && { nurNachts: true }) }
}

// DATEX directionRelativeOnLinearSection / alertC-Codes → deutsche Fahrtrichtung. T-611.
function mapDatexRichtung(dir) {
  const d = String(dir).toLowerCase()
  if (!d) return null
  if (/^(positive|aligned|alongdrivingdirection|withdrivingdirection)$/.test(d)) return "in Fahrtrichtung"
  if (/^(negative|opposite|againstdrivingdirection)$/.test(d)) return "Gegenrichtung"
  if (/^(both|alldirections|unknown|allcarriageways)$/.test(d)) return null // unspezifisch → keine Richtung
  return dir // bereits lesbarer Freitext (z.B. Ortsname) → behalten
}

/** Restriktionswerte (Höhe/Breite/Gewicht in m/t) aus dem Record ziehen, soweit DATEX sie führt.
 *  T-429: DATEX kodiert Permanent-Limits NICHT nur als flache maximumHeight/Weight-Tags, sondern
 *  verschachtelt in <forVehiclesWithCharacteristicsOf>: <grossWeightCharacteristic><grossVehicleWeight>,
 *  <heightCharacteristic><vehicleHeight>, <widthCharacteristic><vehicleWidth>. An echtem 0147-Sample
 *  (Bayern) verifiziert: 40× grossVehicleWeight, 4× vehicleHeight, ALLE comparisonOperator=greaterThan
 *  (Fahrzeuge ÜBER dem Wert sind gesperrt → der Wert IST das Max-Limit). tag() matcht namespace-
 *  tolerant überall im Record, daher genügt die erweiterte Tag-Liste. (lessThan-Mindestmaße kommen in
 *  den Feeds nicht vor; käme eines, würde es als Max fehlinterpretiert — derzeit kein reales Vorkommen.) */
function attrsAusRecord(recordXml) {
  const attrs = {}
  const h = num(tag(recordXml, "maximumHeight") || tag(recordXml, "heightLimit") || tag(recordXml, "vehicleHeight"))
  const b = num(tag(recordXml, "maximumWidth") || tag(recordXml, "widthLimit") || tag(recordXml, "vehicleWidth"))
  const g = num(tag(recordXml, "maximumWeight") || tag(recordXml, "weightLimit") || tag(recordXml, "totalWeight") || tag(recordXml, "grossVehicleWeight"))
  const a = num(tag(recordXml, "maximumWeightPerAxle") || tag(recordXml, "axleWeightLimit"))
  if (h != null) attrs.maxHoeheM = h
  if (b != null) attrs.maxBreiteM = b
  if (g != null) attrs.maxGewichtT = g
  if (a != null) attrs.maxAchslastT = a
  return attrs
}

// Deutschland-Plausibilität: ALLE DATEX-Quellen sind deutschlandweit. Manche Records liefern
// lat/lng VERTAUSCHT (→ Hindernis landet im Meer/Ausland, z.B. 0143 Brandenburg bei Jemen).
// Wir korrigieren vertauschte Koordinaten automatisch und verwerfen echte Müll-Koordinaten.
const inDe = (lat, lng) => lat >= 46 && lat <= 56 && lng >= 4 && lng <= 16
/** Liste von [lng,lat]-Paaren → korrigierte Liste (ggf. lat/lng-Tausch) oder null (ausserhalb DE). */
function correctDeCoords(coords) {
  const [lng, lat] = coords[0]
  if (inDe(lat, lng)) return coords
  if (inDe(lng, lat)) return coords.map(([a, b]) => [b, a]) // vertauscht → drehen
  return null // ausserhalb DE, nicht durch Tausch erklärbar → verwerfen
}

/** Koordinaten aus GML <posList> (Format "lat lng lat lng …", srsName WGS84 EPSG 4326).
 *  Liefert erste Position als Punkt + ganze Linie als GeoJSON LineString ([lng,lat]-Reihenfolge).
 *  null bei fehlenden/zu wenigen Werten ODER Koordinaten ausserhalb DE (nach Tausch-Korrektur). */
function posListGeom(recordXml) {
  const raw = tag(recordXml, "posList")
  if (!raw) return null
  const nums = raw.trim().split(/\s+/).map(Number).filter(Number.isFinite)
  const coords = []
  for (let i = 0; i + 1 < nums.length; i += 2) {
    const la = nums[i]
    const ln = nums[i + 1]
    // WGS84-Grobcheck; DE-Feincheck + Tausch-Korrektur danach in correctDeCoords.
    if (la >= -90 && la <= 90 && ln >= -180 && ln <= 180) coords.push([ln, la])
  }
  if (coords.length === 0) return null
  const fixed = correctDeCoords(coords)
  if (!fixed) return null
  return {
    lat: fixed[0][1],
    lng: fixed[0][0],
    geom: fixed.length >= 2 ? { type: "LineString", coordinates: fixed } : null,
  }
}

/** ALERT-C-Linear-Codes (Primary/Secondary-Location) aus dem Record — für TMC-only-Quellen
 *  (z.B. Niedersachsen) ohne lat/lng/posList. null wenn kein specificLocation vorhanden. */
function tmcAusRecord(recordXml) {
  const priBlock = tag(recordXml, "alertCMethod4PrimaryPointLocation")
  const secBlock = tag(recordXml, "alertCMethod4SecondaryPointLocation")
  const primary = num(tag(priBlock ?? recordXml, "specificLocation"))
  if (primary == null) return null
  const secondary = secBlock ? num(tag(secBlock, "specificLocation")) : null
  return { primary, secondary }
}

/** Erstes Koordinatenpaar (lat/lng) aus den Locations des Records — bevorzugt explizite
 *  latitude/longitude, dann GML posList (+ Linien-geom), dann ALERT-C/TMC via resolveTmc. */
function koordAusRecord(recordXml, resolveTmc) {
  const lat = num(tag(recordXml, "latitude"))
  const lng = num(tag(recordXml, "longitude"))
  if (lat != null && lng != null) {
    if (inDe(lat, lng)) return { lat, lng, geom: null }
    if (inDe(lng, lat)) return { lat: lng, lng: lat, geom: null } // vertauscht → drehen
    // sonst ausserhalb DE → ignorieren, weiter mit posList/TMC
  }
  const pl = posListGeom(recordXml)
  if (pl) return pl
  if (resolveTmc) {
    const tmc = tmcAusRecord(recordXml)
    const r = tmc && resolveTmc(tmc)
    if (r && Number.isFinite(r.lat) && Number.isFinite(r.lng)) return r
  }
  return { lat: null, lng: null, geom: null }
}

/**
 * Parst ein DATEX-II-Dokument (String) zu NormalizedObstacle[].
 * @param xml   DATEX-II-XML (SituationPublication)
 * @param meta  { quelleName, quelleUrl } für die quelle-Referenz
 */
// T-629: bayerische Kreisstraße aus dem BayernInfo-Namen („PAN 31 zwischen …", „OA 32 …", „DLG 10 …").
// NUR für 0147 (kreisRef=true): Kreis-Kürzel (1–3 Großbuchstaben) + Nr am TEXTANFANG, und NUR wenn direkt
// ein Straßen-Kontext folgt (zwischen/von/bis/Richtung/Ortsname). Der Boundary-Lookahead verhindert
// Fehlmatches auf Einheiten („VK 0,4kV" 0148) oder „BAB 14"/„RV 2025" (0145) — deshalb 0147-exklusiv.
export function kreisRefAus(text) {
  const m = String(text || "").match(/^([A-ZÄÖÜ]{1,3})\s?(\d{1,4}[a-z]?)\b(?=\s+(?:zwischen|von\b|bis\b|Richtung|[A-ZÄÖÜ][a-zäöü]))/)
  return m ? `${m[1]}${m[2]}` : null
}

export function parseDatex2(xml, { quelleName = "DATEX II", quelleUrl = null, resolveTmc = null, kreisRef = false } = {}) {
  if (typeof xml !== "string" || !xml.includes("ituation")) return []
  const now = new Date().toISOString()
  const obstacles = []

  // Über <situation>-Blöcke iterieren (DATEX-Hierarchie): so ist der SITUATIONS-Kommentar
  // (Geschwister des Records) als Namens-Fallback verfügbar — manche Feeds (KA-Tiefbauamt 0144)
  // tragen den beschreibenden Straßentext DORT, nicht im Record. Ohne <situation>-Wrapper
  // (abweichende Profile): global über die Records.
  const sitMatches = [...xml.matchAll(/<(?:[\w.-]+:)?situation\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?situation>/gi)]
  const blocks = sitMatches.length ? sitMatches.map((s) => s[1]) : [xml]
  const recRe = /<(?:[\w.-]+:)?situationRecord\b([^>]*)>([\s\S]*?)<\/(?:[\w.-]+:)?situationRecord>/gi
  for (const sitBlock of blocks) {
    const sitComment = commentText(tag(sitBlock, "generalPublicComment")) || commentText(tag(sitBlock, "comment"))
    recRe.lastIndex = 0
    let m
    while ((m = recRe.exec(sitBlock)) !== null) {
      const openTag = m[1]
      const rec = m[2]
      const externeId = attrOf(openTag, "id") || attrOf(openTag, "version") || null
      if (!externeId) continue
      // validityStatus=suspended: Situation ist DEFINIERT, aber NICHT in Kraft (z.B. eine SH-Brücke,
      // die windbedingt gesperrt werden KANN, aktuell aber frei ist). Ohne diesen Filter würde sie als
      // aktive Vollsperrung importiert → Fehlalarm. Nur 'suspended' raus; active/definedByValidityTimeSpec
      // (die echten geplanten Sperrungen mit Zeitfenster) bleiben.
      if (String(tag(rec, "validityStatus") || "").trim().toLowerCase() === "suspended") continue

      const kategorie = kategorieAusTyp(openTag, rec)
      const von = dateOnly(tag(rec, "overallStartTime") || tag(rec, "validityStartTime"))
      // T-713b: Enddatum jenseits jedes Planungshorizonts (2204, 2999) verwerfen statt es als
      // "bis 07.10.2204" in den Fund zu schreiben. Auch hier noetig, weil dieser Parser an
      // makeNormalized vorbeilaeuft, wo derselbe Deckel sitzt.
      const bis = endeWennBefristet(tag(rec, "overallEndTime") || tag(rec, "validityEndTime"))
      const { lat, lng, geom } = koordAusRecord(rec, resolveTmc)
      // Beschreibender Text: Record-Kommentar, sonst Situations-Kommentar (0144). Verdopplung
      // mancher Quellen ("X - X - Y", BAB-AkD 0145) über dedupeName glätten.
      const beschr = commentText(tag(rec, "generalPublicComment")) || commentText(tag(rec, "comment")) || sitComment || null
      // T-611 (Audit R3): stornierte Maßnahmen („entfällt") NICHT als aktives Hindernis importieren
      // (Thüringen 0146 lieferte u.a. eine Vollsperrung „entfällt" als aktiv). Konservativ: nur exakter
      // „entfällt"-Inhalt (kein Teilstring), analog zum suspended-Filter oben.
      if (/^\s*-?\s*entf[aä]llt\s*-?\s*$/i.test(beschr ?? "") || /^\s*-?\s*entf[aä]llt\s*-?\s*$/i.test(sitComment ?? "")) continue
      // roadNumber/roadName können — wie der Kommentar — verschachtelt sein → über commentText
      // bereinigen, sonst leakt roher XML als Straßen-Ref. T-611: umschließende Klammern strippen
      // (NI-DATEX 0143 liefert literal "[B169]"); fehlt die Ref ganz, per Straßen-Regex aus dem
      // Freitext ziehen (Bayern 0147 nennt die Straße nur als Titel-Token, nicht in roadNumber).
      const refRoh = commentText(tag(rec, "roadNumber")) || commentText(tag(rec, "roadName")) || null
      const strasse =
        (refRoh ? refRoh.replace(/^[[(]\s*|\s*[)\]]$/g, "").trim() : "") ||
        (beschr || "").match(/\b(?:A|B|St|L|K|S)\s?\d{1,4}[a-z]?\b/)?.[0]?.replace(/\s/g, "") ||
        (kreisRef ? kreisRefAus(beschr) : null) || // T-629: bayerische Kreisstraße (nur 0147)
        null
      // T-611: kein generischer "<kat> (DATEX)"-Platzhalter, wenn die Straße bekannt ist → "<Straße> — <kat>".
      const name = dedupeName(
        beschr || tag(rec, "situationRecordCreationReference") ||
        (strasse ? `${strasse} — ${kategorie}` : `${kategorie} (DATEX)`),
      )

      obstacles.push({
        externeId: String(externeId),
        kategorie,
        // T-706: an der Wortgrenze kuerzen statt hart zu kappen. Diese Quelle ist der Hauptbetroffene —
        // 0147 Bayern schreibt die ganze Lagebeschreibung in den Namen, 4.638 von 7.282 Eintraegen
        // endeten auf exakt 200 Zeichen, meist mitten im Wort ("… Fahrbahn auf 2 Fahrstreifen
        // verengt, V"). Die 200 bleiben die Grenze, das "…" zaehlt mit hinein.
        name: kuerzeAufWortgrenze(String(name), NAME_MAX),
        beschreibung: dedupeName(beschr),
        lat,
        lng,
        ...(geom && { geom }),
        strassenRef: strasse,
        // Höhe/Gewicht/Breite (falls geführt) + strukturierte Sperrart/Spuren/Richtung + Zeitfenster (Info).
        attrs: { ...attrsAusRecord(rec), ...sperrAttrsAusRecord(rec), ...zeitfensterAusRecord(rec, `${name} ${beschr ?? ""}`) },
        ...(von && { gueltigVon: von, realerStart: von }),
        ...(bis && { gueltigBis: bis }),
        quelle: { name: quelleName, url: quelleUrl, aktualisiertAm: now },
      })
    }
  }
  return obstacles
}
