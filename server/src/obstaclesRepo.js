// Hindernis-Repository: geteilte Validierung, Insert/Update-SQL und die
// transaktionssichere fachId-Vergabe. Wird von der Obstacles-API (Kunden-POST,
// Quelle 0100) UND vom Import-Worker genutzt — EINE Quelle für das fachId-Schema.
//
// fachId = INDEX(4) + QUELLE(4) + DDMMYY(realerStart)   (docs/HINDERNIS-DATENFORMAT.md §1)
// INDEX = laufende Nummer pro Quelle: max(Index der Quelle) + 1, abgeleitet aus den
// ersten 4 Stellen bestehender fachIds. Transaktionssicher über pg_advisory_xact_lock
// pro Quelle — Aufrufer MUSS innerhalb von db.tx arbeiten (q = tx-Client).

import { KATEGORIEN } from "./engine/rules.js"
import { isFiniteNumber, isPlainObject } from "./util.js"

/** Quellen-ID für manuelle Kunden-Einträge (Quellen-Register '0100'). */
export const KUNDEN_QUELLE = "0100"

// "Gemeldete" Kategorien = aktiv gemeldete Abnormalitäten/Ereignisse (temporär,
// werden gemeldet) — im Gegensatz zur permanenten Infrastruktur (Brücken, Tunnel,
// Engstellen, Gewichts-/Achslast-Limits, Bahnübergänge, Kreisverkehre, Ampeln,
// Steigungen). Die Infrastruktur ziehen wir mit, blenden sie auf der Übersichts-
// karte aber aus — relevant fürs Auge sind nur die gemeldeten Ereignisse.
export const GEMELDETE_KATEGORIEN = ["baustelle", "sperrung"]

// Schlanke Spaltenliste für Lese-Queries: genau das, was rowToObstacle (map.js)
// braucht — OHNE die schweren jsonb-Blobs (roh, geom, zeitfenster). Wichtig für
// Performance: die Analyse einer langen Strecke matcht tausende Hindernisse im
// Bbox; SELECT * würde die Roh-Payloads aller Treffer übertragen → Timeout.
export const OBSTACLE_COLS = `id, kategorie, name, beschreibung, lat, lng, strassen_ref,
  zustaendig, quelle, attrs, gueltig_von, gueltig_bis, fach_id, quellen_id, realer_start,
  aktiv, demo, tenant_id, externe_id, created_at, updated_at`

const QUELLEN_ID_RE = /^\d{4}$/
const FACH_ID_RE = /^\d{14}$/
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** Strenge ISO-Datums-Prüfung (YYYY-MM-DD, real existierendes Datum). */
export function isIsoDate(s) {
  if (typeof s !== "string" || !ISO_DATE_RE.test(s)) return false
  const d = new Date(`${s}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
}

export const todayIso = () => new Date().toISOString().slice(0, 10)

/** "YYYY-MM-DD" → "DDMMYY" (fachId-Datums-Segment). Ohne Datum: heute. */
export function formatDdmmyy(isoDate = todayIso()) {
  const s = String(isoDate)
  return s.slice(8, 10) + s.slice(5, 7) + s.slice(2, 4)
}

export const buildFachId = (index, quellenId, realerStart) =>
  String(index).padStart(4, "0") + quellenId + formatDdmmyy(realerStart)

/**
 * Normalisiert + validiert ein Obstacle aus Request/Import. → {ok, value|reason}
 *
 * Default = lenient (v2-kompatibel: Import/PATCH-Merge, name optional).
 * strict = Kunden-POST v3: name ≥3, lat/lng-Bounds, attrs numerisch (bool erlaubt,
 * z.B. anmeldungErforderlich), gueltigVon/Bis + realerStart als ISO-Datum,
 * quellenId 4-stellig, fachId 14-stellig.
 */
// Reine bestehende Infrastruktur OHNE Abweichung → NICHT importieren/anzeigen (Vorgabe Max):
// "wenn da einfach nur Infrastrukturelemente sind bei denen aber nix is, dann raus." Brücken/Tunnel/
// sonstige Bauwerke ohne Restriktion und das GST-Positiv-Routennetz (gstRoute) sind Standard-Themen,
// die das Strecken-Engineering abdeckt. SOBALD eine Abweichung dranhängt (Höhen-/Breiten-/Gewichts-/
// Achslast-Limit, GST-Sperre, Vollsperrung, Bezugsgewicht) ist es zu behalten — auch bei Brücken.
const RESTRIKTIONS_ATTRS = ["maxHoeheM", "maxBreiteM", "maxGewichtT", "maxAchslastT", "restbreiteM", "maxLaengeM", "bezugsgewichtT"]
const BLOCK_FLAGS = ["vollsperrung", "halbseitig", "grundsaetzlicheGstSperre", "gesperrtKomplett"]
const INFRA_KATEGORIEN = new Set(["bruecke", "tunnel", "sonstige"])

export function istReineInfrastruktur(o) {
  const attrs = (o && typeof o.attrs === "object" && o.attrs) || {}
  const hatAbweichung =
    RESTRIKTIONS_ATTRS.some((k) => attrs[k] != null && Number(attrs[k]) > 0) ||
    BLOCK_FLAGS.some((k) => attrs[k] === true)
  if (hatAbweichung) return false // Restriktion/Sperre vorhanden → Abweichung, behalten
  if (INFRA_KATEGORIEN.has(o?.kategorie)) return true // Bauwerk ohne jede Restriktion → raus
  if (attrs.gstRoute === true) return true // GST-Positiv-Netz (bestehende Widmung, keine Abweichung) → raus
  return false
}

// Live-/Ad-hoc-Verkehrsmeldungen (Pannen, Unfälle, Gefahren, Witterung, verlorene Ladung …) sind
// EPHEMER und für die PLANUNG eines Großraum-/Schwertransports (Tage/Wochen Vorlauf) wertlos
// (Vorgabe Max: "KEINE LIVE VERKEHRSDATEN — die Plattform ist zum Planen da, ad hoc bringt nix").
//
// Zweistufig, gegen die echten Daten verifiziert (0 False-Positives auf Autobahn-Baustellen 0001):
//  1) IMMER live — eindeutige Ad-hoc-Indikatoren, die in geplanten Baustellen NICHT vorkommen
//     (inkl. Fahrzeugbrand — NICHT bloßes "brand", das träfe Ortsnamen wie Brandenburg/Wüstenbrand).
//  2) MEHRDEUTIG (unfall/stau/defekt) — kommen auch in Baustellen-Texten ("Unfallschwerpunkt-
//     Sanierung", "Rückstau", "defekte Fahrbahndecke") und Ortsnamen vor → nur dann live, wenn KEIN
//     Bau-Kontext im Text steht. So fliegt der echte "Unfall/Stau/defekt"-Live-Eintrag raus, die
//     geplante Baustelle bleibt.
const LIVE_IMMER_RX =
  /gefahr durch|liegengeblieb|liegen geblieb|\bpanne\b|defekte[ns]? (pkw|lkw|kfz|fahrzeug|lastwagen|transporter|ampel)|bergung|geborgen|rettungseinsatz|rettungsdienst|umgestürzt|umgekippte|ölspur|verlorene? ladung|gegenstand auf der fahrbahn|hindernis auf der fahrbahn|tier(e)? auf der|falschfahrer|geisterfahrer|aquaplaning|glätte|glatteis|witterungsbedingt|fahrzeugbrand|brennende[sr]? (pkw|lkw|fahrzeug)|in brand geraten|lkw-brand|pkw-brand/i
const LIVE_MEHRDEUTIG_RX = /\bunfall|\bstau\b|\bdefekt/i
const BAU_KONTEXT_RX =
  /baustelle|bauarbeit|bauma(ß|ss)nahme|sanierung|erneuerung|bauphase|instandsetzung|instandhaltung|unterhaltung|beseitigung|leitung|sondernutzung|stra(ß|ss)enbau|fahrbahnerhalt|deckenbau|fahrbahndecke|brücke|gültig|zeitraum dieser|umleitung|sperrung wegen|vollsperrung|halbseitig|markierung/i

/** Ephemere Live-/Ad-hoc-Verkehrsmeldung (nicht planbar) → nicht importieren/anzeigen. */
export function istLiveVerkehrsmeldung(o) {
  const text = `${o?.name ?? ""} ${o?.beschreibung ?? ""}`
  if (LIVE_IMMER_RX.test(text)) return true
  if (LIVE_MEHRDEUTIG_RX.test(text) && !BAU_KONTEXT_RX.test(text)) return true
  return false
}

export function validateObstacle(input, { strict = false } = {}) {
  if (!isPlainObject(input)) return { ok: false, reason: "kein Objekt" }
  if (!KATEGORIEN.includes(input.kategorie)) {
    return { ok: false, reason: `ungültige kategorie: ${String(input.kategorie)}` }
  }
  const lat = input.lat
  const lng = input.lng
  if (!isFiniteNumber(lat) || !isFiniteNumber(lng)) {
    return { ok: false, reason: "lat/lng fehlen oder sind keine Zahlen" }
  }
  if (input.attrs !== undefined && !isPlainObject(input.attrs)) {
    return { ok: false, reason: "attrs muss ein Objekt sein" }
  }

  if (strict) {
    if (typeof input.name !== "string" || input.name.trim().length < 3) {
      return { ok: false, reason: "name erforderlich (mindestens 3 Zeichen)" }
    }
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return { ok: false, reason: "lat/lng außerhalb gültiger Bounds" }
    }
    for (const [key, v] of Object.entries(input.attrs ?? {})) {
      if (!isFiniteNumber(v) && typeof v !== "boolean") {
        return { ok: false, reason: `attrs.${key} muss numerisch sein` }
      }
    }
    for (const key of ["gueltigVon", "gueltigBis", "realerStart"]) {
      if (input[key] != null && !isIsoDate(input[key])) {
        return { ok: false, reason: `${key} muss ein ISO-Datum (YYYY-MM-DD) sein` }
      }
    }
    if (input.quellenId != null && !QUELLEN_ID_RE.test(input.quellenId)) {
      return { ok: false, reason: "quellenId muss 4-stellig sein" }
    }
    if (input.fachId != null && !FACH_ID_RE.test(input.fachId)) {
      return { ok: false, reason: "fachId muss 14-stellig sein (IIIIQQQQDDMMYY)" }
    }
  }

  return {
    ok: true,
    value: {
      kategorie: input.kategorie,
      name: typeof input.name === "string" ? input.name : null,
      beschreibung: typeof input.beschreibung === "string" ? input.beschreibung : null,
      lat,
      lng,
      strassenRef: typeof input.strassenRef === "string" ? input.strassenRef : null,
      zustaendig: typeof input.zustaendig === "string" ? input.zustaendig : null,
      quelle: isPlainObject(input.quelle) ? input.quelle : null,
      attrs: input.attrs ?? {},
      gueltigVon: input.gueltigVon ?? null,
      gueltigBis: input.gueltigBis ?? null,
      fachId: typeof input.fachId === "string" ? input.fachId : null,
      quellenId: typeof input.quellenId === "string" ? input.quellenId : null,
      realerStart: input.realerStart ?? null,
      aktiv: input.aktiv !== false,
      demo: input.demo === true,
      kiAufbereitet: input.kiAufbereitet === true,
      geom: isPlainObject(input.geom) ? input.geom : null,
      tenantId: null, // wird vom Aufrufer gesetzt (Route/Importer), nie vom Client
      externeId: null,
    },
  }
}

// Insert-Spalten an EINER Stelle — Single-Row-INSERT_SQL und der Importer-Batch (dbBatch)
// teilen sie sich, damit Spaltenreihenfolge und insertParams() nie auseinanderdriften.
export const OBSTACLE_INSERT_COLS = `kategorie, name, beschreibung, lat, lng, strassen_ref,
    zustaendig, quelle, attrs, gueltig_von, gueltig_bis, fach_id, quellen_id, realer_start,
    aktiv, demo, tenant_id, externe_id, ki_aufbereitet, geom`
export const OBSTACLE_INSERT_COL_COUNT = 20

export const INSERT_SQL = `INSERT INTO obstacles (${OBSTACLE_INSERT_COLS})
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20) RETURNING *`

export const insertParams = (o) => [
  o.kategorie, o.name, o.beschreibung, o.lat, o.lng, o.strassenRef, o.zustaendig,
  o.quelle != null ? JSON.stringify(o.quelle) : null, JSON.stringify(o.attrs),
  o.gueltigVon, o.gueltigBis, o.fachId, o.quellenId, o.realerStart, o.aktiv, o.demo,
  o.tenantId ?? null, o.externeId ?? null, o.kiAufbereitet === true,
  o.geom != null ? JSON.stringify(o.geom) : null,
]

/** Sachfeld-Update beim Re-Import: fachId/realerStart/aktiv/tenant bleiben stabil.
 *  ki_aufbereitet ist "sticky" (einmal true bleibt true), damit ein Re-Import ohne Treffer das Flag nicht löscht. */
export const UPDATE_SACHFELDER_SQL = `UPDATE obstacles SET kategorie = $2, name = $3, beschreibung = $4,
    lat = $5, lng = $6, strassen_ref = $7, zustaendig = $8, quelle = $9, attrs = $10,
    gueltig_von = $11, gueltig_bis = $12, ki_aufbereitet = (ki_aufbereitet OR $13), geom = $14, updated_at = now()
  WHERE id = $1 RETURNING *`

export const sachfeldParams = (id, o) => [
  id, o.kategorie, o.name, o.beschreibung, o.lat, o.lng, o.strassenRef, o.zustaendig,
  o.quelle != null ? JSON.stringify(o.quelle) : null, JSON.stringify(o.attrs),
  o.gueltigVon, o.gueltigBis, o.kiAufbereitet === true,
  o.geom != null ? JSON.stringify(o.geom) : null,
]
export const SACHFELD_COL_COUNT = 14 // sachfeldParams: id + 13 Sachfelder

/** Batch-Sachfeld-Update (T-329): N Updates als EIN `UPDATE … FROM (VALUES …)`-Join statt N Round-Trips.
 *  `valuesSql` = Platzhalter-Tupel aus dbBatch.placeholders(rows, SACHFELD_COL_COUNT), Params = flache
 *  sachfeldParams(id, value)-Liste. Casts, weil VALUES-Spalten sonst als text inferiert werden. fach_id/
 *  realer_start/aktiv/tenant bleiben — wie beim Single-Row-UPDATE — unberührt; ki_aufbereitet ist sticky. */
export const sachfeldBatchSql = (valuesSql) => `UPDATE obstacles AS o SET
    kategorie = v.kategorie, name = v.name, beschreibung = v.beschreibung,
    lat = v.lat::double precision, lng = v.lng::double precision,
    strassen_ref = v.strassen_ref, zustaendig = v.zustaendig,
    quelle = v.quelle::jsonb, attrs = v.attrs::jsonb,
    gueltig_von = v.gueltig_von::date, gueltig_bis = v.gueltig_bis::date,
    ki_aufbereitet = (o.ki_aufbereitet OR v.ki_aufbereitet::boolean),
    geom = v.geom::jsonb, updated_at = now()
  FROM (VALUES ${valuesSql}) AS v(id, kategorie, name, beschreibung, lat, lng, strassen_ref,
    zustaendig, quelle, attrs, gueltig_von, gueltig_bis, ki_aufbereitet, geom)
  WHERE o.id = v.id::uuid`

const MAX_INDEX_SQL = `SELECT COALESCE(MAX(substring(fach_id FROM 1 FOR 4)::int), 0) AS max_index
  FROM obstacles WHERE quellen_id = $1 AND fach_id ~ '^[0-9]{4}'`

/**
 * Vergibt die nächste fachId einer Quelle — MUSS innerhalb einer Transaktion laufen
 * (q = tx-Client). Der Advisory-Xact-Lock serialisiert konkurrierende Vergaben pro
 * Quelle bis zum Commit; max+1 selbst-heilt gegen Bestandsdaten/Lücken.
 */
export async function assignFachId(q, { quellenId, realerStart }) {
  await q.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`roadmap_fachid_${quellenId}`])
  const { rows } = await q.query(MAX_INDEX_SQL, [quellenId])
  const index = Number(rows[0]?.max_index ?? 0) + 1
  return buildFachId(index, quellenId, realerStart ?? todayIso())
}

/** Insert über das geteilte SQL — gibt die DB-Row zurück. */
export async function insertObstacle(q, value) {
  const { rows } = await q.query(INSERT_SQL, insertParams(value))
  return rows[0]
}
