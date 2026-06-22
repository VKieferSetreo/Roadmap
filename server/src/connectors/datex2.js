// DATEX-II-Parser (dependency-frei) — SituationPublication-XML → NormalizedObstacle[].
// Wiederverwendbarer Kern für alle DATEX-II-Quellen (Mobilithek-Feeds aller Länder, BASt …).
// Bewusst tolerant/best-effort (DATEX II v2 + v3, herstellerspezifische Profile): wir
// extrahieren situationRecord-Blöcke und ziehen je Block Typ, Gültigkeit, Koordinaten und
// (wo vorhanden) Restriktionswerte. Verfeinert wird, sobald echte Feeds fließen.
//
// NormalizedObstacle (Connector-Vertrag): { externeId, kategorie, name, beschreibung?, lat, lng,
//   strassenRef?, attrs, gueltigVon?, gueltigBis?, realerStart?, quelle:{name,url,aktualisiertAm} }

import { cleanText } from "../util.js"

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
  if (dir) out.richtung = dir
  return out
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
export function parseDatex2(xml, { quelleName = "DATEX II", quelleUrl = null, resolveTmc = null } = {}) {
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
      const bis = dateOnly(tag(rec, "overallEndTime") || tag(rec, "validityEndTime"))
      const { lat, lng, geom } = koordAusRecord(rec, resolveTmc)
      // Beschreibender Text: Record-Kommentar, sonst Situations-Kommentar (0144). Verdopplung
      // mancher Quellen ("X - X - Y", BAB-AkD 0145) über dedupeName glätten.
      const beschr = commentText(tag(rec, "generalPublicComment")) || commentText(tag(rec, "comment")) || sitComment || null
      const name = dedupeName(beschr || tag(rec, "situationRecordCreationReference") || `${kategorie} (DATEX)`)
      // roadNumber/roadName können — wie der Kommentar — verschachtelt sein → über commentText
      // bereinigen, sonst leakt roher XML als Straßen-Ref.
      const strasse = commentText(tag(rec, "roadNumber")) || commentText(tag(rec, "roadName")) || null

      obstacles.push({
        externeId: String(externeId),
        kategorie,
        name: String(name).slice(0, 200),
        beschreibung: dedupeName(beschr),
        lat,
        lng,
        ...(geom && { geom }),
        strassenRef: strasse,
        // Höhe/Gewicht/Breite (falls geführt) + strukturierte Sperrart/Spuren/Richtung.
        attrs: { ...attrsAusRecord(rec), ...sperrAttrsAusRecord(rec) },
        ...(von && { gueltigVon: von, realerStart: von }),
        ...(bis && { gueltigBis: bis }),
        quelle: { name: quelleName, url: quelleUrl, aktualisiertAm: now },
      })
    }
  }
  return obstacles
}
