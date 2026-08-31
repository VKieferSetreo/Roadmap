// Neue Punkte anreichern, sobald sie hereinkommen (T-657).
//
// Max, 31.08.2026: "bau schon mal parallel das Modul, das bei neuen Punkten anspringt und diese
// dann auch verarbeitet."
//
// Der Bestandslauf ist einmalig. Danach kommen täglich neue Hindernisse über die Connectoren, und
// die brauchen dieselbe Behandlung — sonst zerfällt der Bestand mit jedem Sync weiter in
// angereicherte Altdaten und rohe Neuzugänge.
//
// ZWEI AUFGABEN, die zusammengehören:
//   1. neue Punkte durch die Pipeline schicken
//   2. die abgeleiteten Werte wieder nach attrs spielen — der Import hat sie gerade überschrieben
//
// WEG: lokal auf der Workstation für den Bestand, OpenRouter für den laufenden Betrieb (Max'
// Aufteilung). Ein Sync bringt selten mehr als ein paar hundert neue Punkte; dafür lohnt es
// nicht, einen Rechner zu wecken.
//
// FAIL-OPEN: schlägt die Anreicherung fehl, ist das kein Grund, einen Import scheitern zu lassen.
// Die Punkte sind dann eben roh, und der nächste Nachlauf holt sie.

import { laufeUeberBestand } from "./lauf.js"
import { spieleEin } from "./einspielen.js"
import { createModell, modellKonfig, erreichbar } from "./modell.js"

/** Wie viele neue Punkte ein einzelner Nachlauf höchstens anfasst. Bremse gegen den Fall, dass
 *  ein Connector einmal 50.000 Punkte neu anlegt und der Nachlauf stundenlang bindet. */
const OBERGRENZE = Number(process.env.ANREICHERUNG_NACHLAUF_MAX || 1000)

/**
 * @returns {{gelaufen: boolean, grund?: string, gesehen?: number, geschrieben?: number, eingespielt?: number}}
 */
export async function nachlauf(db, { weg = process.env.ANREICHERUNG_WEG || null, grenze = OBERGRENZE, gleichzeitig = 4, log = () => {} } = {}) {
  // Erst fragen, ob es ueberhaupt etwas zu tun gibt: die allermeisten Syncs bringen keine neuen
  // Punkte, und dann soll auch kein Erreichbarkeitstest laufen.
  const { rows: offenVorab } = await db.query(
    `SELECT count(*)::int AS n FROM obstacles o
      WHERE o.aktiv = true
        AND NOT EXISTS (SELECT 1 FROM anreicherung a
                         WHERE a.ziel_typ = 'obstacle' AND a.ziel_id = o.id::text)`,
  ).catch(() => ({ rows: [{ n: 0 }] }))
  if (!offenVorab[0]?.n) return { gelaufen: false, grund: "nichts Neues" }

  // REIHENFOLGE: erst die Workstation, dann OpenRouter. Das dreht Max' urspruengliche Aufteilung
  // um, und zwar aus einer Messung heraus: von vier freien OpenRouter-Modellen liefen zwei sofort
  // in HTTP 429, eines lieferte kein JSON, nur minimax-m3 antwortete brauchbar. Das lokale Modell
  // hat kein Limit und kostet nichts — es ist der bessere erste Griff, solange der Rechner laeuft.
  // OpenRouter bleibt der Rueckfall fuer die Zeiten, in denen er aus ist.
  const wege = weg ? [weg] : ["lokal", "openrouter"]
  let konfig = null
  for (const w of wege) {
    const k = modellKonfig(w)
    if (!k.verfuegbar) continue
    if (await erreichbar(k)) { konfig = k; break }
    log(`Anreicherung: ${w} nicht erreichbar, versuche den nächsten Weg`)
  }
  if (!konfig) return { gelaufen: false, grund: "kein Weg erreichbar" }

  // Zweite, jetzt MODELLBEZOGENE Zaehlung: die Punkte oben koennen von einem anderen Modell schon
  // gesehen worden sein. Fuer dieses hier waeren sie trotzdem offen.
  const { rows: offen } = await db.query(
    `SELECT count(*)::int AS n FROM obstacles o
      WHERE o.aktiv = true
        AND NOT EXISTS (SELECT 1 FROM anreicherung a
                         WHERE a.ziel_typ = 'obstacle' AND a.ziel_id = o.id::text AND a.modell = $1)`,
    [konfig.name],
  ).catch(() => ({ rows: [{ n: 0 }] }))
  if (!offen[0]?.n) return { gelaufen: false, grund: "nichts Neues" }

  const rufeModell = createModell(konfig)
  const rollen = { liest: rufeModell, prueft: rufeModell, nimmtAb: rufeModell }
  log(`Anreicherung: ${offen[0].n} neue Punkte, verarbeite bis zu ${grenze}`)

  const r = await laufeUeberBestand(db, {
    modell: konfig.name,
    rufeModell,
    rollen,
    grenze,
    gleichzeitig,
  })

  // Und zurück in den Bestand: der Import hat attrs gerade überschrieben, auch bei den Punkten,
  // die schon früher angereichert waren. Deshalb IMMER alles einspielen, nicht nur das Neue.
  const ein = await spieleEin(db, { modell: konfig.name }).catch(() => ({ aktualisiert: 0 }))
  log(`Anreicherung: ${r.gesehen} Punkte gesehen, ${r.geschrieben} Angaben, ${ein.aktualisiert} Punkte aktualisiert`)
  return { gelaufen: true, gesehen: r.gesehen, geschrieben: r.geschrieben, eingespielt: ein.aktualisiert, rest: r.rest }
}

/**
 * Nach einem Import aufrufen. Wirft nie: ein fehlgeschlagener Nachlauf darf keinen Sync
 * rückgängig machen, der ansonsten sauber durchgelaufen ist.
 */
export async function nachImport(db, optionen = {}) {
  try {
    return await nachlauf(db, optionen)
  } catch (e) {
    optionen.log?.(`Anreicherung übersprungen: ${e.message}`)
    return { gelaufen: false, grund: e.message }
  }
}
