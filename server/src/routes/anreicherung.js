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
import { AUSSICHTSLOS } from "../anreicherung/lauf.js"

export function anreicherungRouter({ db }) {
  const r = Router()

  r.get("/stand", asyncHandler(async (req, res) => {
    // JE LAUF, nicht mehr in einer Summe. Seit dem 01.09.2026 laufen zwei Modelle nacheinander
    // über denselben Bestand (7B über alles, danach 14B über die abgewiesenen Punkte). Eine
    // gemeinsame Zahl mischt sie und misst den zweiten Lauf gegen die falsche Grundmenge: er hat
    // nicht 73.000 Punkte vor sich, sondern die rund 9.400 mit behebbaren Verwerfungen.
    const { rows: laeufe } = await db.query(`
      SELECT modell,
             count(*) FILTER (WHERE stand = 'marke')::int AS punkte,
             count(*) FILTER (WHERE stand = 'ok' AND wert IS NOT NULL AND feld <> '_fertig')::int AS angaben,
             count(*) FILTER (WHERE stand = 'leer')::int AS leer,  -- Marken tragen 'marke' (migrations/071)
             count(*) FILTER (WHERE stand = 'verworfen')::int AS verworfen,
             max(erstellt_am) AS zuletzt,
             count(DISTINCT ziel_id) FILTER (WHERE erstellt_am > now() - interval '1 minute')::int AS pro_min
        FROM anreicherung
       GROUP BY modell ORDER BY max(erstellt_am) DESC`,
    ).catch(() => ({ rows: [] }))

    // Der aktive Lauf ist der, der in der letzten Minute geschrieben hat.
    const aktiv = laeufe.find((l) => l.pro_min > 0) ?? null
    const { rows: [g] } = await db.query(
      "SELECT count(*)::int AS n FROM obstacles WHERE aktiv = true",
    ).catch(() => ({ rows: [{ n: 0 }] }))

    // Wie viele Punkte hat der aktive Lauf VOR sich? Für den ersten Durchgang ist das der ganze
    // Bestand. Für eine zweite Runde nur die Punkte mit behebbaren Verwerfungen des Vormodells —
    // dieselbe Bedingung, nach der lauf.js seine Kandidaten wählt, sonst zeigt der Balken Unsinn.
    let grundmenge = g?.n ?? 0
    const vormodell = aktiv ? laeufe.find((l) => l.modell !== aktiv.modell && l.punkte > aktiv.punkte) : null
    if (aktiv && vormodell) {
      const { rows: [m] } = await db.query(
        `SELECT count(DISTINCT v.ziel_id)::int AS n FROM anreicherung v
          WHERE v.ziel_typ = 'obstacle' AND v.modell = $1 AND v.stand = 'verworfen'
            AND v.grund <> ALL($2::text[])`,
        [vormodell.modell, AUSSICHTSLOS],
      ).catch(() => ({ rows: [{ n: 0 }] }))
      if (m?.n) grundmenge = m.n
    }

    // NUR DER AKTIVE LAUF, und nur Felder, zu denen wirklich etwas gefunden wurde.
    //
    // Die erste Fassung gruppierte ueber die ganze Tabelle. Damit standen dort auch die
    // Feldnamen, die das Modell ERFUNDEN hat und die nur in Verwerfungen vorkommen — "parkbucht",
    // "gehwegGesperrt", "gegengasse", jeweils mit einer Null daneben. Rund siebzig Zeilen Rauschen
    // vor den zwanzig, die zaehlen.
    const nurAktiv = aktiv ? "AND a.modell = $1" : ""
    const werte = aktiv ? [aktiv.modell] : []
    const jeFeld = await db.query(
      `SELECT a.feld, count(*)::int AS gefunden
         FROM anreicherung a
        WHERE a.stand = 'ok' AND a.wert IS NOT NULL AND a.feld <> '_fertig' ${nurAktiv}
        GROUP BY a.feld HAVING count(*) > 0 ORDER BY 2 DESC`,
      werte,
    ).catch(() => ({ rows: [] }))

    // Mit Feldnamen: "false" oder "10" allein sagt niemandem, was gefunden wurde.
    const proben = await db.query(
      `SELECT a.feld, a.wert, left(o.name, 55) AS name
         FROM anreicherung a JOIN obstacles o ON o.id::text = a.ziel_id
        WHERE a.stand = 'ok' AND a.wert IS NOT NULL AND a.feld <> '_fertig' ${nurAktiv}
        ORDER BY a.erstellt_am DESC LIMIT 8`,
      werte,
    ).catch(() => ({ rows: [] }))

    const punkte = aktiv?.punkte ?? 0
    const proMin = aktiv?.pro_min ?? 0
    res.json({
      // Der aktive Lauf, prominent
      modell: aktiv?.modell ?? null,
      runde: aktiv && vormodell ? 2 : 1,
      gesamt: grundmenge,
      gesehen: punkte,
      anteil: grundmenge ? Math.round((1000 * Math.min(punkte, grundmenge)) / grundmenge) / 10 : 0,
      gefunden: aktiv?.angaben ?? 0,
      leer: aktiv?.leer ?? 0,
      verworfen: aktiv?.verworfen ?? 0,
      proMin,
      restMin: proMin > 0 ? Math.max(0, Math.round((grundmenge - punkte) / proMin)) : null,
      laeuft: proMin > 0,
      zuletzt: aktiv?.zuletzt ?? laeufe[0]?.zuletzt ?? null,
      // Alle Laeufe, damit der abgeschlossene nicht aus dem Blick faellt
      laeufe: laeufe.map((l) => ({
        modell: l.modell, punkte: l.punkte, angaben: l.angaben, verworfen: l.verworfen,
        laeuft: l.pro_min > 0,
      })),
      bestand: g?.n ?? 0,
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
