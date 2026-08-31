// Der Live-Stand des Anreicherungslaufs — als Zahlen und als Seite (T-657).
//
// Max, 31.08.2026: "will für mobile optimierten Live-Viewer der Auswertung, wie weit wir sind,
// das wäre wichtig."
//
// WAS HIER RAUSGEHT sind ausschließlich ZÄHLWERTE, keine Daten: wie viele Punkte gesehen, wie
// viele Angaben gefunden, wie viele abgewiesen. Deshalb braucht die Seite keine Anmeldung, und
// deshalb kann Max sie vom Handy aus offen lassen, während der Lauf durchläuft. Beispiele sind
// bewusst auf Bauwerksnamen und Straßennummern beschränkt — beides steht ohnehin in jeder
// öffentlichen Brückenstatistik.

import { Router } from "express"
import { fileURLToPath } from "node:url"
import { asyncHandler } from "../util.js"

export function anreicherungRouter({ db }) {
  const r = Router()

  r.get("/stand", asyncHandler(async (req, res) => {
    // Alles in EINER Abfrage: die Seite lädt im Sekundentakt nach, und drei Rundläufe zur
    // Datenbank je Aufruf wären an einem Lauf über 73.000 Punkte spürbar.
    const { rows } = await db.query(`
      SELECT
        (SELECT count(*)::int FROM obstacles WHERE aktiv = true) AS gesamt,
        (SELECT count(DISTINCT ziel_id)::int FROM anreicherung) AS gesehen,
        (SELECT count(*)::int FROM anreicherung WHERE stand = 'ok') AS gefunden,
        (SELECT count(*)::int FROM anreicherung WHERE stand = 'leer') AS leer,
        (SELECT count(*)::int FROM anreicherung WHERE stand = 'verworfen') AS verworfen,
        (SELECT max(erstellt_am) FROM anreicherung) AS zuletzt,
        -- PUNKTE je Minute, nicht Zeilen: die Zeilenzahl haengt daran, wie viele Felder ein Punkt
        -- offen hat, und das schwankt zwischen 1 und 18. Die alte Rechnung teilte pauschal durch
        -- 5 und war damit um das Dreifache zu optimistisch — sie versprach 228 Minuten Restzeit,
        -- wo es knapp 14 Stunden sind.
        (SELECT count(DISTINCT ziel_id)::int FROM anreicherung
          WHERE erstellt_am > now() - interval '1 minute') AS punkte_letzte_minute
    `).catch(() => ({ rows: [{}] }))

    const s = rows[0] ?? {}
    const jeFeld = await db.query(
      `SELECT feld, count(*) FILTER (WHERE stand = 'ok')::int AS gefunden
         FROM anreicherung GROUP BY feld ORDER BY 2 DESC`,
    ).catch(() => ({ rows: [] }))

    const proben = await db.query(
      `SELECT a.feld, a.wert, left(o.name, 60) AS name
         FROM anreicherung a JOIN obstacles o ON o.id::text = a.ziel_id
        WHERE a.stand = 'ok' ORDER BY a.erstellt_am DESC LIMIT 8`,
    ).catch(() => ({ rows: [] }))

    const gesehen = s.gesehen ?? 0
    const gesamt = s.gesamt ?? 0
    // Rest hochrechnen aus dem, was in der letzten Minute wirklich passiert ist. Ein Mittelwert
    // über den ganzen Lauf wäre nach einem Neustart tagelang falsch.
    const proMin = s.punkte_letzte_minute ?? 0
    res.json({
      gesamt,
      gesehen,
      anteil: gesamt ? Math.round((1000 * gesehen) / gesamt) / 10 : 0,
      gefunden: s.gefunden ?? 0,
      leer: s.leer ?? 0,
      verworfen: s.verworfen ?? 0,
      proMin,
      restMin: proMin > 0 ? Math.round((gesamt - gesehen) / proMin) : null,
      laeuft: proMin > 0,
      zuletzt: s.zuletzt ?? null,
      jeFeld: jeFeld.rows,
      proben: proben.rows,
    })
  }))

  /**
   * Die abgewiesenen Angaben, zum Ansehen und Herunterladen.
   *
   * Max, 31.08.2026: "alle abgewiesenen behalten — kann sein, dass wir die manuell später doch
   * noch benutzen." Aufgehoben werden sie seit Migration 069; ohne einen Weg, sie herauszuholen,
   * nuetzt das nichts. Jede Zeile traegt, was das Modell geantwortet hat (`wert`), worauf es sich
   * berief (`beleg`) und welcher Riegel gegriffen hat (`grund`).
   *
   * ?format=csv liefert eine Datei fuer die Tabellenkalkulation — "manuell nutzen" heisst in der
   * Praxis meistens: durchsehen und selbst entscheiden.
   */
  r.get("/verworfen", asyncHandler(async (req, res) => {
    const grenze = Math.min(Number(req.query.limit) || 500, 5000)
    const wo = ["a.stand = 'verworfen'"]
    const werte = []
    for (const [feld, spalte] of [["feld", "a.feld"], ["grund", "a.grund"]]) {
      if (req.query[feld]) { werte.push(`%${req.query[feld]}%`); wo.push(`${spalte} ILIKE $${werte.length}`) }
    }
    const { rows } = await db.query(
      `SELECT a.feld, a.roh_wert AS wert, a.beleg, a.grund, a.erstellt_am,
              o.name, o.kategorie, a.ziel_id
         FROM anreicherung a LEFT JOIN obstacles o ON o.id::text = a.ziel_id
        WHERE ${wo.join(" AND ")}
        ORDER BY a.erstellt_am DESC
        LIMIT ${grenze}`,
      werte,
    )

    if (req.query.format !== "csv") {
      const nachGrund = await db.query(
        `SELECT grund, count(*)::int AS anzahl FROM anreicherung
          WHERE stand = 'verworfen' GROUP BY grund ORDER BY 2 DESC`,
      ).catch(() => ({ rows: [] }))
      return res.json({ zeilen: rows, nachGrund: nachGrund.rows })
    }

    // Semikolon und BOM, damit Excel die Datei ohne Nachfrage richtig oeffnet.
    const feld = (v) => `"${String(v ?? "").replaceAll('"', '""')}"`
    const csv = ["Punkt;Kategorie;Feld;Wert;Beleg;Grund;Zeitpunkt;PunktId"]
      .concat(rows.map((z) => [z.name, z.kategorie, z.feld, z.wert, z.beleg, z.grund,
        z.erstellt_am?.toISOString?.() ?? z.erstellt_am, z.ziel_id].map(feld).join(";")))
      .join("\r\n")
    res.setHeader("Content-Type", "text/csv; charset=utf-8")
    res.setHeader("Content-Disposition", 'attachment; filename="anreicherung-verworfen.csv"')
    res.send("﻿" + csv)
  }))

  // Die Seite liegt UNTER /api, nicht daneben: der Proxy leitet ausschliesslich /roadmap/api/*
  // an diesen Dienst weiter. Ein eigener Pfad braeuchte eine Proxy-Aenderung; das waere ein
  // Eingriff in fremdes Terrain fuer eine Betriebsseite.
  // Erreichbar als https://setreo-intern.com/roadmap/api/anreicherung/viewer
  r.get("/viewer", (req, res) =>
    res.sendFile(fileURLToPath(new URL("../../public/anreicherung.html", import.meta.url))))

  return r
}
