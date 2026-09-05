// Abgeleitete Werte in den Bestand schreiben — mit Kennzeichnung (T-657).
//
// Max, 31.08.2026: "gerne in Prod schreiben, aber die KI-Flag behalten."
//
// WARUM DIE ANREICHERUNGSTABELLE TROTZDEM BLEIBT: der Import überschreibt `obstacles.attrs` bei
// JEDEM Lauf vollständig (obstaclesRepo.js, UPDATE_SACHFELDER_SQL: `attrs = $10`). Ein Wert, den
// wir dort hineinschreiben, ist beim nächsten Sync weg. Die Tabelle ist deshalb die Quelle, attrs
// die Nutzungsform — und dieser Schritt stellt sie nach jedem Import wieder her.
//
// Das hat einen zweiten Vorteil: fällt später auf, dass ein Modell systematisch danebenlag, lässt
// sich sein Beitrag zurücknehmen, ohne die Quelldaten zu beschädigen. Stünde er nur in attrs,
// wäre er von einer gemeldeten Angabe nicht mehr zu unterscheiden.

import { FELD_TYP, BOOL_FELDER, ZAHL_FELDER } from "./felder.js"

/**
 * Nur diese Formen dürfen in attrs landen — dieselben Typen, die die Regeln dort erwarten.
 *
 * T-664/F1: diese Funktion stand seit dem ersten Tag da und wurde im Schreibpfad NIE aufgerufen.
 * `spieleEin` aggregierte roh aus der Textspalte, und damit landete "true" als Zeichenkette in
 * attrs. Die Engine prüft strikt (`rules.js` `num()` nimmt nur `typeof number`, die Sperr-Regeln
 * vergleichen `=== true`), sah dort also nichts. Gemessen vor dem Fix: 2.056 Hindernisse mit
 * `vollsperrung: "true"`, dazu 9.294 `sperrungArt`, 1.794 `fahrbahnVerengt`, 1.104
 * `spurenGesperrt` — die gesamte Anreicherung war für die Bewertung unsichtbar.
 *
 * DER TYP KOMMT AUS DEM KATALOG, nicht aus dem Wert. Sonst würde aus der Straßenangabe
 * `getrageneStrasse: "471"` die Zahl 471, und aus `zeitfenster` und `sperrungArt` ebenfalls
 * Unsinn, sobald sie einmal rein numerisch daherkommen.
 */
export function typisiere(feld, wert) {
  if (FELD_TYP[feld] === "boolean") {
    if (wert === "true") return true
    if (wert === "false") return false
    return wert
  }
  if (FELD_TYP[feld] === "zahl") {
    const s = String(wert ?? "").trim()
    if (!/^-?\d+(?:\.\d+)?$/.test(s)) return wert
    const n = Number(s)
    return Number.isFinite(n) ? n : wert
  }
  return wert
}

/**
 * Überträgt alle bestätigten Ableitungen nach obstacles.attrs.
 *
 * NUR IN LÜCKEN: was die Quelle sagt, bleibt stehen. Der Abgleich passiert in SQL, damit auch
 * ein Lauf über 73.000 Punkte in einer Abfrage durchgeht statt in 73.000.
 *
 * `ki_aufbereitet` wird gesetzt, sobald mindestens ein Feld aus der Ableitung stammt. Das Flag
 * ist sticky (der Import löscht es nicht), die Feldliste steht in der Anreicherungstabelle.
 */
export async function spieleEin(db, { modell = null } = {}) {
  // Die Typisierung passiert in SQL, weil auch die Aggregation dort passiert — ein Lauf über
  // 73.000 Punkte soll eine Abfrage bleiben. Die Feldlisten kommen aus dem Katalog (FELD_TYP),
  // damit hier nichts geraten wird und ein neues Feld seinen Typ automatisch mitbringt.
  // Die Regex ist dieselbe wie in typisiere(): nur eine saubere Dezimalzahl wird zur Zahl.
  const { rows } = await db.query(
    `WITH abgeleitet AS (
       SELECT ziel_id::uuid AS id, jsonb_object_agg(feld, CASE
                WHEN feld = ANY($1::text[]) AND wert IN ('true', 'false') THEN to_jsonb(wert::boolean)
                WHEN feld = ANY($2::text[]) AND wert ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN to_jsonb(wert::numeric)
                ELSE to_jsonb(wert)
              END) AS werte
         FROM anreicherung
        WHERE ziel_typ = 'obstacle' AND stand = 'ok' AND wert IS NOT NULL
          AND (geprueft IS NULL OR geprueft = true)
          ${modell ? "AND modell = $3" : ""}
        GROUP BY ziel_id
     )
     UPDATE obstacles o
        SET attrs = a.werte || coalesce(o.attrs, '{}'::jsonb),
            ki_aufbereitet = true,
            updated_at = now()
       FROM abgeleitet a
      WHERE o.id = a.id
        -- Nur anfassen, was sich wirklich ändert: sonst schreibt jeder Lauf alle Zeilen neu und
        -- updated_at verliert seine Aussage.
        AND (a.werte || coalesce(o.attrs, '{}'::jsonb)) IS DISTINCT FROM coalesce(o.attrs, '{}'::jsonb)
      RETURNING o.id`,
    modell ? [BOOL_FELDER, ZAHL_FELDER, modell] : [BOOL_FELDER, ZAHL_FELDER],
  )
  return { aktualisiert: rows.length }
}

/**
 * Die Gegenrichtung: alle abgeleiteten Werte wieder aus dem Bestand entfernen.
 *
 * Gebaut, bevor sie gebraucht wird, und das mit Absicht. Wer Werte aus einem Modell in
 * Produktivdaten schreibt, muss sie auch wieder herausbekommen — sonst ist die Entscheidung
 * unumkehrbar, und unumkehrbare Entscheidungen trifft man nicht auf Verdacht.
 *
 * NUR UEBER DIESE FUNKTION zurueckrollen, nie mit einem SQL von Hand ueber `ki_aufbereitet`.
 * Das Flag ist KEIN Marker fuer diese Anreicherung: mehrere Connectoren setzen es ebenfalls fuer
 * ihre eigene Feldableitung (autobahn.js, _helpers.js), und die BASt-Bruecken allein tragen es
 * 2.313 mal. Am 31.08.2026 habe ich genau diesen Fehler gemacht und ueber das Flag geloescht:
 * 20 gemeldete sperrungArt-Werte gingen dabei verloren. Welche Felder wirklich aus der Ableitung
 * stammen, steht ausschliesslich in der Anreicherungstabelle — und nur nach der geht diese
 * Funktion.
 */
export async function nimmZurueck(db, { modell = null } = {}) {
  const { rows } = await db.query(
    `WITH abgeleitet AS (
       SELECT ziel_id::uuid AS id, array_agg(feld) AS felder
         FROM anreicherung
        WHERE ziel_typ = 'obstacle' AND stand = 'ok' ${modell ? "AND modell = $1" : ""}
        GROUP BY ziel_id
     )
     UPDATE obstacles o
        SET attrs = (SELECT coalesce(jsonb_object_agg(k, v), '{}'::jsonb)
                       FROM jsonb_each(coalesce(o.attrs, '{}'::jsonb)) AS e(k, v)
                      WHERE NOT (k = ANY(a.felder))),
            updated_at = now()
       FROM abgeleitet a
      WHERE o.id = a.id
      RETURNING o.id`,
    modell ? [modell] : [],
  )
  return { bereinigt: rows.length }
}

/** Welche Felder eines Punktes stammen aus der Ableitung? Für die Kennzeichnung auf der Karte. */
export async function kiFelderJePunkt(db, obstacleIds) {
  const ids = [...new Set((obstacleIds ?? []).filter(Boolean).map(String))]
  if (!ids.length) return new Map()
  const { rows } = await db.query(
    `SELECT ziel_id, array_agg(feld) AS felder
       FROM anreicherung
      WHERE ziel_typ = 'obstacle' AND stand = 'ok' AND wert IS NOT NULL
        AND (geprueft IS NULL OR geprueft = true) AND ziel_id = ANY($1)
      GROUP BY ziel_id`,
    [ids],
  ).catch(() => ({ rows: [] }))
  return new Map(rows.map((r) => [r.ziel_id, r.felder]))
}
