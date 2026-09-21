// Straßenklasse aus der Koordinate auflösen (Max 2026-09-20). 41,8 % des aktiven Bestands
// tragen kein strassen_ref; die Koordinate ist bei ALLEN davon vorhanden (gemessen: 32.905
// von 32.905). OSRM beantwortet aus einer Null-Längen-Route den Straßennamen und, wo es einen
// gibt, das Kennzeichen — daraus fällt die Klasse ab.
//
// Bewusst NICHT Nominatim: in Prod abgeschaltet und öffentlich auf 1 Abfrage/s gedrosselt.
// OSRM läuft self-hosted im selben Netz.

const RUNDUNG = 4 // ≈ 11 m — fein genug für Straßenidentität, grob genug als Cache-Schlüssel

/** Klasse aus OSRM-Antwort. Dieselbe Reihenfolge wie STRASSENKLASSE_CASE, damit beide Wege
 *  dasselbe Ergebnis liefern. null heisst: OSRM hat zwar geantwortet, die Kante traegt aber
 *  weder Kennzeichen noch Namen — was daraus folgt, entscheidet der Aufrufer. */
export function klasseAus(ref, name) {
  const r = String(ref ?? "").trim()
  if (/^A ?[0-9]/i.test(r)) return "autobahn"
  if (/^B ?[0-9]/i.test(r)) return "bundesstrasse"
  if (/^(L|St?) ?[0-9]/i.test(r)) return "landesstrasse"
  if (/^K ?[0-9]/i.test(r)) return "kreisstrasse"
  if (String(name ?? "").trim().length > 2) return "gemeindestrasse"
  return null
}

// Eine Kante im Fahrnetz OHNE Kennzeichen ist keine Autobahn, Bundes-, Landes- oder
// Kreisstrasse: diese vier tragen ihr Kennzeichen in OSM ausnahmslos, daran haengt die ganze
// Ableitung oben. Was uebrig bleibt, ist kommunal — das ist die Netzhierarchie, keine Notloesung
// (Max 2026-09-21: "Ohne Zuordnung darf es nicht geben").
//
// Gemessen an 300 Stichproben aus dem bis dahin nicht zugeordneten Bestand: ALLE lagen auf dem
// Fahrnetz, der Snap-Abstand betrug 0 bis 6 m. 251 davon auf einer Kante ganz ohne Name und
// Kennzeichen (unbenannte Wohn- und Wirtschaftswege), 36 mit Namen ohne Kennzeichen, 13 mit
// Kennzeichen. Es ist also kein Verortungsproblem: die Stellen liegen auf Strassen, die in OSM
// schlicht keinen Namen tragen.
const OHNE_KENNZEICHEN = "gemeindestrasse"

const runde = (n) => Number(Number(n).toFixed(RUNDUNG))

/** Eine Koordinate über OSRM auflösen. Gibt null zurück, wenn OSRM nichts Brauchbares liefert. */
async function frageOsrm(basis, lat, lng, fetchImpl, timeoutMs) {
  const url = `${basis.replace(/\/$/, "")}/route/v1/driving/${lng},${lat};${lng},${lat}`
    + "?steps=true&overview=false&annotations=false"
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetchImpl(url, { signal: ctrl.signal })
    if (!res.ok) return null
    const j = await res.json()
    const s = j?.routes?.[0]?.legs?.[0]?.steps?.[0]
    if (!s) return null
    // OSRM hat die Stelle auf einer Kante verortet. Traegt sie kein Kennzeichen, ist sie
    // kommunal (siehe OHNE_KENNZEICHEN). Vorher fiel dieser Fall als null durch und die Zeile
    // blieb dauerhaft ohne Klasse — 84 % der Stichprobe.
    const klasse = klasseAus(s.ref, s.name) ?? OHNE_KENNZEICHEN
    return { klasse, ref: s.ref ?? null, name: s.name ?? null }
  } catch {
    return null
  } finally {
    clearTimeout(t)
  }
}

/**
 * Füllt obstacles.strassen_klasse für Zeilen ohne strassen_ref.
 * `limit` begrenzt einen Lauf, damit der Job planbar bleibt und OSRM nicht flutet.
 */
export async function loeseStrassenklassen(db, {
  basis = process.env.OSRM_URL || "",
  fetchImpl = fetch,
  limit = 4000,
  parallel = 6,
  timeoutMs = 8000,
  log = () => {},
} = {}) {
  if (!basis) { log("OSRM nicht konfiguriert — Straßenklassen-Auflösung übersprungen"); return { geprueft: 0 } }

  const { rows } = await db.query(
    `SELECT id, lat, lng FROM obstacles
      WHERE aktiv = true AND strassen_klasse IS NULL
        AND (strassen_ref IS NULL OR btrim(strassen_ref) = '')
        AND lat IS NOT NULL AND lng IS NOT NULL
      LIMIT $1`,
    [limit],
  )
  if (!rows.length) return { geprueft: 0, ausCache: 0, vonOsrm: 0, gesetzt: 0 }

  // 1. Was der Cache schon weiß — ein Rundtrip für alle.
  const schluessel = new Map()
  for (const r of rows) schluessel.set(r.id, `${runde(r.lat)},${runde(r.lng)}`)
  const paare = [...new Set(schluessel.values())].map((k) => k.split(","))
  const { rows: bekannt } = await db.query(
    `SELECT lat_r::text AS lat_r, lng_r::text AS lng_r, klasse FROM geo_strassenklasse
      WHERE (lat_r, lng_r) IN (SELECT (a->>0)::numeric, (a->>1)::numeric FROM jsonb_array_elements($1::jsonb) a)`,
    [JSON.stringify(paare)],
  )
  const cache = new Map(bekannt.map((b) => [`${Number(b.lat_r)},${Number(b.lng_r)}`, b.klasse]))
  const ausCache = cache.size

  // 2. Offene Koordinaten bei OSRM erfragen, mit begrenzter Parallelität.
  const offen = paare.map(([a, b]) => `${Number(a)},${Number(b)}`).filter((k) => !cache.has(k))
  let vonOsrm = 0
  for (let i = 0; i < offen.length; i += parallel) {
    const teil = offen.slice(i, i + parallel)
    const treffer = await Promise.all(teil.map(async (k) => {
      const [lat, lng] = k.split(",").map(Number)
      return [k, await frageOsrm(basis, lat, lng, fetchImpl, timeoutMs)]
    }))
    const schreiben = treffer.filter(([, v]) => v)
    if (schreiben.length) {
      await db.query(
        `INSERT INTO geo_strassenklasse (lat_r, lng_r, klasse, ref, strassenname)
         SELECT (a->>0)::numeric, (a->>1)::numeric, a->>2, a->>3, a->>4
           FROM jsonb_array_elements($1::jsonb) a
         ON CONFLICT (lat_r, lng_r) DO NOTHING`,
        [JSON.stringify(schreiben.map(([k, v]) => {
          const [lat, lng] = k.split(",")
          return [lat, lng, v.klasse, v.ref, v.name]
        }))],
      )
      for (const [k, v] of schreiben) cache.set(k, v.klasse)
      vonOsrm += schreiben.length
    }
  }

  // 3. Ergebnis an die Hindernisse schreiben.
  const zuSetzen = []
  for (const [id, k] of schluessel) {
    const klasse = cache.get(k)
    if (klasse) zuSetzen.push([id, klasse])
  }
  let gesetzt = 0
  for (let i = 0; i < zuSetzen.length; i += 500) {
    const teil = zuSetzen.slice(i, i + 500)
    const r = await db.query(
      `UPDATE obstacles o SET strassen_klasse = v.klasse
         FROM (SELECT (a->>0)::uuid AS id, a->>1 AS klasse FROM jsonb_array_elements($1::jsonb) a) v
        WHERE o.id = v.id`,
      [JSON.stringify(teil)],
    )
    gesetzt += r.rowCount
  }
  log(`Straßenklassen: ${rows.length} geprüft, ${ausCache} aus Cache, ${vonOsrm} neu von OSRM, ${gesetzt} gesetzt`)
  return { geprueft: rows.length, ausCache, vonOsrm, gesetzt }
}
