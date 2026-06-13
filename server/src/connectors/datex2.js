// DATEX-II-Parser (dependency-frei) — SituationPublication-XML → NormalizedObstacle[].
// Wiederverwendbarer Kern für alle DATEX-II-Quellen (Mobilithek-Feeds aller Länder, BASt …).
// Bewusst tolerant/best-effort (DATEX II v2 + v3, herstellerspezifische Profile): wir
// extrahieren situationRecord-Blöcke und ziehen je Block Typ, Gültigkeit, Koordinaten und
// (wo vorhanden) Restriktionswerte. Verfeinert wird, sobald echte Feeds fließen.
//
// NormalizedObstacle (Connector-Vertrag): { externeId, kategorie, name, beschreibung?, lat, lng,
//   strassenRef?, attrs, gueltigVon?, gueltigBis?, realerStart?, quelle:{name,url,aktualisiertAm} }

const tag = (xml, name) => {
  // erstes <name ...>…</name> (namespace-tolerant), non-greedy
  const m = xml.match(new RegExp(`<(?:[\\w.-]+:)?${name}\\b[^>]*>([\\s\\S]*?)</(?:[\\w.-]+:)?${name}>`, "i"))
  return m ? m[1].trim() : null
}
const attrOf = (openTag, attr) => {
  const m = openTag.match(new RegExp(`${attr}\\s*=\\s*"([^"]*)"`, "i"))
  return m ? m[1] : null
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
  if (t.includes("roadorcarriageway") || t.includes("closure") || low.includes("carriagewayclosed") || low.includes("roadclosed")) return "sperrung"
  if (t.includes("networkmanagement") && (low.includes("weight") || low.includes("gewicht"))) return "gewicht"
  if (low.includes("heightlimit") || low.includes("maximumheight") || low.includes("durchfahrtshöhe")) return "bruecke"
  if (low.includes("widthlimit") || low.includes("maximumwidth")) return "engstelle"
  if (low.includes("weightlimit") || low.includes("maximumweight") || low.includes("gewichtsbesch")) return "gewicht"
  // Fallback: Verkehrsbehinderung mit Bauwerksbezug → baustelle, sonst sperrung
  return t.includes("roadworks") || low.includes("baustelle") ? "baustelle" : "sperrung"
}

/** Restriktionswerte (Höhe/Breite/Gewicht in m/t) aus dem Record ziehen, soweit DATEX sie führt. */
function attrsAusRecord(recordXml) {
  const attrs = {}
  const h = num(tag(recordXml, "maximumHeight") || tag(recordXml, "heightLimit"))
  const b = num(tag(recordXml, "maximumWidth") || tag(recordXml, "widthLimit"))
  const g = num(tag(recordXml, "maximumWeight") || tag(recordXml, "weightLimit") || tag(recordXml, "totalWeight"))
  const a = num(tag(recordXml, "maximumWeightPerAxle") || tag(recordXml, "axleWeightLimit"))
  if (h != null) attrs.maxHoeheM = h
  if (b != null) attrs.maxBreiteM = b
  if (g != null) attrs.maxGewichtT = g
  if (a != null) attrs.maxAchslastT = a
  return attrs
}

/** Erstes Koordinatenpaar (lat/lng) aus den Locations des Records. */
function koordAusRecord(recordXml) {
  const lat = num(tag(recordXml, "latitude"))
  const lng = num(tag(recordXml, "longitude"))
  return { lat, lng }
}

/**
 * Parst ein DATEX-II-Dokument (String) zu NormalizedObstacle[].
 * @param xml   DATEX-II-XML (SituationPublication)
 * @param meta  { quelleName, quelleUrl } für die quelle-Referenz
 */
export function parseDatex2(xml, { quelleName = "DATEX II", quelleUrl = null } = {}) {
  if (typeof xml !== "string" || !xml.includes("ituation")) return []
  const now = new Date().toISOString()
  const obstacles = []

  // Alle <situationRecord ...>…</situationRecord>-Blöcke (namespace-tolerant)
  const recRe = /<(?:[\w.-]+:)?situationRecord\b([^>]*)>([\s\S]*?)<\/(?:[\w.-]+:)?situationRecord>/gi
  let m
  while ((m = recRe.exec(xml)) !== null) {
    const openTag = m[1]
    const rec = m[2]
    const externeId = attrOf(openTag, "id") || attrOf(openTag, "version") || null
    if (!externeId) continue

    const kategorie = kategorieAusTyp(openTag, rec)
    const von = dateOnly(tag(rec, "overallStartTime") || tag(rec, "validityStartTime"))
    const bis = dateOnly(tag(rec, "overallEndTime") || tag(rec, "validityEndTime"))
    const { lat, lng } = koordAusRecord(rec)
    const name =
      tag(rec, "generalPublicComment") ||
      tag(rec, "comment") ||
      tag(rec, "situationRecordCreationReference") ||
      `${kategorie} (DATEX)`
    const strasse = tag(rec, "roadNumber") || tag(rec, "roadName") || null

    obstacles.push({
      externeId: String(externeId),
      kategorie,
      name: String(name).slice(0, 200),
      beschreibung: tag(rec, "generalPublicComment") || null,
      lat,
      lng,
      strassenRef: strasse,
      attrs: attrsAusRecord(rec),
      ...(von && { gueltigVon: von, realerStart: von }),
      ...(bis && { gueltigBis: bis }),
      quelle: { name: quelleName, url: quelleUrl, aktualisiertAm: now },
    })
  }
  return obstacles
}
