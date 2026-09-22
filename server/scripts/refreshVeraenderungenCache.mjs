// Den Cache der Änderungsauswertung SOFORT neu rechnen, statt bis zum 05:00-Cron zu warten.
//
// Gebraucht, wenn sich die Definition von "geändert" ändert (T-760): bis der Cache neu steht,
// zeigt die Seite — auch die öffentlich freigegebene — weiter die alten Zahlen.
//
// Warum ein eigenes Skript und kein `DELETE FROM veraenderungen_cache`: bei leerem Cache rechnet
// die Route im Request, und das 90-Tage-Fenster braucht rund 155 s gegen ein statement_timeout
// von 120 s im API-Pool. Der Nutzer bekäme einen Fehler statt Zahlen. Hier läuft dieselbe
// Rechnung wie im Worker-Cron, mit dessen großzügigem Timeout.
//
// Aufruf im laufenden Container:
//   docker exec <api-container> node scripts/refreshVeraenderungenCache.mjs

import { createPool, createDb } from "../src/db.js"
import { berechneUebersicht } from "../src/routes/veraenderungen.js"

const FENSTER = [7, 30, 90]

const pool = createPool(process.env.DATABASE_URL, { statementTimeoutMs: 300000 })
const db = createDb(pool)

try {
  for (const tage of FENSTER) {
    const t0 = Date.now()
    const payload = await berechneUebersicht(db, tage)
    await db.query(
      `INSERT INTO veraenderungen_cache (tage, payload, berechnet_am) VALUES ($1, $2, now())
       ON CONFLICT (tage) DO UPDATE SET payload = excluded.payload, berechnet_am = excluded.berechnet_am`,
      [tage, JSON.stringify(payload)],
    )
    const g = payload.gesamt
    console.log(
      `${tage} Tage in ${Math.round((Date.now() - t0) / 1000)}s: ` +
      `neu=${g.neu} geaendert=${g.geaendert} ausgelaufen=${g.ausgelaufen} entfernt=${g.entfernt} ` +
      `(Belege: ${payload.belege?.length ?? 0})`,
    )
  }
} finally {
  await pool.end().catch(() => {})
}
