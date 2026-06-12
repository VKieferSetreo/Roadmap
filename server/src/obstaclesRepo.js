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
      tenantId: null, // wird vom Aufrufer gesetzt (Route/Importer), nie vom Client
      externeId: null,
    },
  }
}

export const INSERT_SQL = `INSERT INTO obstacles (kategorie, name, beschreibung, lat, lng, strassen_ref,
    zustaendig, quelle, attrs, gueltig_von, gueltig_bis, fach_id, quellen_id, realer_start,
    aktiv, demo, tenant_id, externe_id)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18) RETURNING *`

export const insertParams = (o) => [
  o.kategorie, o.name, o.beschreibung, o.lat, o.lng, o.strassenRef, o.zustaendig,
  o.quelle != null ? JSON.stringify(o.quelle) : null, JSON.stringify(o.attrs),
  o.gueltigVon, o.gueltigBis, o.fachId, o.quellenId, o.realerStart, o.aktiv, o.demo,
  o.tenantId ?? null, o.externeId ?? null,
]

/** Sachfeld-Update beim Re-Import: fachId/realerStart/aktiv/tenant bleiben stabil. */
export const UPDATE_SACHFELDER_SQL = `UPDATE obstacles SET kategorie = $2, name = $3, beschreibung = $4,
    lat = $5, lng = $6, strassen_ref = $7, zustaendig = $8, quelle = $9, attrs = $10,
    gueltig_von = $11, gueltig_bis = $12, updated_at = now()
  WHERE id = $1 RETURNING *`

export const sachfeldParams = (id, o) => [
  id, o.kategorie, o.name, o.beschreibung, o.lat, o.lng, o.strassenRef, o.zustaendig,
  o.quelle != null ? JSON.stringify(o.quelle) : null, JSON.stringify(o.attrs),
  o.gueltigVon, o.gueltigBis,
]

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
