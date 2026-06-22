// Import-Engine: führt EINEN Connector-Run aus — Upsert über (quellen_id, externe_id),
// fachId-Vergabe für neue Einträge (geteilt mit der API, src/obstaclesRepo.js),
// Statistik + import_runs-Protokoll + quellen.letzter_abruf.
//
// Vollbestand-Connectoren (connector.vollbestand): nach dem Upsert werden Einträge
// dieser Quelle, die NICHT mehr im Feed sind, deaktiviert (Reconcile —
// abgebaute/abgesagte Baustellen verschwinden); im Feed wieder auftauchende
// Einträge werden reaktiviert.
//
// Fehler im Connector → Run status 'error' mit Log; runImport wirft NIE
// (der Worker und der Admin-Trigger laufen immer weiter).

import { dedupeObstacles } from "../connectors/_helpers.js"
import { BATCH_ROWS, chunk, placeholders } from "../dbBatch.js"
import {
  buildFachId, insertParams, istLiveVerkehrsmeldung, istReineInfrastruktur,
  OBSTACLE_COLS, OBSTACLE_INSERT_COLS, OBSTACLE_INSERT_COL_COUNT,
  sachfeldBatchSql, sachfeldParams, SACHFELD_COL_COUNT, todayIso, validateObstacle,
} from "../obstaclesRepo.js"

// Bulk-Import-Speed (T-042): EINMAL je Lauf den Quellen-Bestand laden statt per-Zeile zu
// SELECTen — Upsert/Drift-Match/fachId laufen dann in-memory (kein N+1, kein per-Zeile-Lock).
const EXISTING_ALL_SQL = `SELECT ${OBSTACLE_COLS} FROM obstacles WHERE quellen_id = $1`
const MAX_INDEX_SQL = `SELECT COALESCE(MAX(substring(fach_id FROM 1 FOR 4)::int), 0) AS max_index
  FROM obstacles WHERE quellen_id = $1 AND fach_id ~ '^[0-9]{4}'`

// Drift-Schutz (T-078): findet ein bestehendes AKTIVES Hindernis derselben Quelle mit
// gleicher Kategorie + gleichem (normalisiertem) Namen im ~300m-Umkreis. Greift NUR wenn
// die exakte (quellen_id, externe_id) nicht matcht — fängt driftende Quell-IDs UND
// positions-bedingt kippende dup#-Hashes ab, sodass das obstacle_id stabil bleibt.
// Sonst meldet der Finding-Diff jeden Lauf „entfallen (km77)" + „neu (km76,9)".

// ~300 m Bounding-Box (1° lat ≈ 111 km; 1° lng ≈ 70 km bei 51°N).
const FUZZY_LAT = 0.003
const FUZZY_LNG = 0.0045
const normName = (name) => String(name ?? "").trim().toLowerCase().replace(/\s+/g, " ")
const dist2 = (a, b) => (a.lat - b.lat) ** 2 + (a.lng - b.lng) ** 2

// Fehlende Einträge der Quelle deaktivieren (nur Vollbestand-Feeds, nur was nicht
// mehr gesehen wurde). Manuelle Quelle 0100 ist nie betroffen (eigene quellen_id).
const RECONCILE_SQL = `UPDATE obstacles
     SET aktiv = false, updated_at = now()
   WHERE quellen_id = $1 AND aktiv = true AND externe_id IS NOT NULL
     AND externe_id <> ALL($2::text[])`

/**
 * @returns import_runs-Row des abgeschlossenen Runs:
 *   { id, quelle_id, status: 'ok'|'error', stats, log, started_at, finished_at }
 */
export async function runImport({
  db, connector, fetchImpl = globalThis.fetch, env = process.env, log = console.log,
}) {
  const { rows: startRows } = await db.query(
    "INSERT INTO import_runs (quelle_id, status) VALUES ($1, 'running') RETURNING *",
    [connector.quelleId],
  )
  const run = startRows[0]

  const stats = {
    gefunden: 0, neu: 0, aktualisiert: 0, uebersprungen: 0, deaktiviert: 0, reaktiviert: 0,
  }
  const logLines = []
  const note = (msg) => {
    logLines.push(msg)
    log(`[import ${connector.quelleId}] ${msg}`)
  }
  let status = "ok"

  try {
    // T-275: Default 4000ms war für paginierte WFS zu knapp (4s/Seite → Timeout → Abbruch →
    // stiller Teilbestand). fetchAllFeatures wirft bei Seiten-Timeout HART (kein Silent-Empty →
    // Reconcile-Schutz greift), 20s/Seite ist großzügig genug für träge Landes-WFS. Der Worker
    // setzt env zusätzlich (40000); dieser Default deckt den api-getriggerten Sync ab.
    const timeoutMs = Number(env.EXTERNAL_TIMEOUT_MS ?? 20000)
    // db wird durchgereicht für Connectoren, die gegen den Live-Bestand dedupen (0152 BAB-AlD
    // gegen 0001/0145). Bestehende Connectoren ignorieren den extra Parameter.
    const result = await connector.fetch({ fetchImpl, env, timeoutMs, log: note, db })
    const rawItems = Array.isArray(result?.obstacles) ? result.obstacles : []
    // Kaputte/leere Connector-Antwort sichtbar machen (sonst sieht ein „ok, 0 gefunden"
    // wie ein legitim leerer Feed aus). Reconcile bleibt durch seen.size>0 geschützt.
    if (!Array.isArray(result?.obstacles)) {
      note("Connector lieferte kein obstacles-Array — als leerer Feed behandelt (kein Reconcile)")
    }
    // Genereller Dubletten-Filter: ein Ereignis als N Features (gleicher Name+Ort+Kategorie)
    // → EIN Strecken-Hindernis. Stabile dup#-externeId; Vollbestand-Reconcile räumt die
    // alten Einzel-Segmente danach automatisch weg.
    const items = dedupeObstacles(rawItems)
    if (rawItems.length !== items.length) {
      note(`Dubletten zusammengefasst: ${rawItems.length} Features → ${items.length} Einträge`)
    }
    stats.gefunden = items.length

    // EIN tx pro Run: fachId-Sequenz konsistent, halbfertige Runs rollen zurück.
    const seen = new Set()
    await db.tx(async (q) => {
      // EINMAL den Quellen-Bestand laden → Exakt-Match + Drift-Match laufen in-memory (kein
      // per-Zeile-SELECT, T-042). byExterneId = Upsert-Schlüssel; fuzzyIndex = Drift-Kandidaten.
      const { rows: existingRows } = await q.query(EXISTING_ALL_SQL, [connector.quelleId])
      const byExterneId = new Map(existingRows.map((r) => [r.externe_id, r]))
      const fuzzyIndex = new Map() // `kategorie|normName` → [{id, externe_id, lat, lng}]
      for (const r of existingRows) {
        if (r.aktiv && r.lat != null && r.lng != null) {
          const k = `${r.kategorie}|${normName(r.name)}`
          const cand = { id: r.id, externe_id: r.externe_id, lat: Number(r.lat), lng: Number(r.lng) }
          const arr = fuzzyIndex.get(k)
          if (arr) arr.push(cand)
          else fuzzyIndex.set(k, [cand])
        }
      }
      // fachId-Sequenz EINMAL bestimmen: Advisory-Lock je Quelle (hält bis Commit) + MAX einmal,
      // dann in-memory hochzählen — statt Lock+MAX pro neuer Zeile (der T-042-Flaschenhals).
      await q.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`roadmap_fachid_${connector.quelleId}`])
      const maxRes = await q.query(MAX_INDEX_SQL, [connector.quelleId])
      let nextIndex = Number(maxRes.rows[0]?.max_index ?? 0) + 1

      // T-329: pro Zeile NICHT mehr einzeln schreiben — Entscheidungen sammeln, danach als
      // wenige Multi-Row-Statements flushen (statt bis zu ~19k Round-Trips pro Vollbestand-Lauf).
      const pendingUpdates = new Map() // obstacle-id → value (Sachfeld-Update, last-write-wins)
      const pendingReactivate = new Set() // obstacle-ids
      const pendingInserts = new Map() // externeId → value (fachId/realerStart bereits vergeben)

      for (const [index, item] of items.entries()) {
        const externeId =
          typeof item?.externeId === "string" && item.externeId.trim() ? item.externeId.trim() : null
        const check = validateObstacle(item)
        if (!externeId || !check.ok) {
          stats.uebersprungen += 1
          note(`Item ${index} übersprungen: ${!externeId ? "externeId fehlt" : check.reason}`)
          continue
        }
        // Reine bestehende Infrastruktur ohne Abweichung gar nicht erst speichern (Standard = Engineering).
        if (istReineInfrastruktur(check.value)) {
          stats.uebersprungen += 1
          stats.infrastruktur = (stats.infrastruktur ?? 0) + 1
          continue
        }
        // Ephemere Live-/Ad-hoc-Verkehrsmeldung (Panne/Gefahr/Witterung …) → nicht planbar, raus.
        if (istLiveVerkehrsmeldung(check.value)) {
          stats.uebersprungen += 1
          stats.liveVerkehr = (stats.liveVerkehr ?? 0) + 1
          continue
        }
        seen.add(externeId)
        const value = check.value
        value.quellenId = connector.quelleId
        value.tenantId = null // Importe sind IMMER global
        value.externeId = externeId
        value.demo = false

        let target = byExterneId.get(externeId) ?? null
        // Kein exakter Treffer? → Drift-Schutz in-memory: dasselbe reale Hindernis unter neuer
        // Quell-ID / leicht versetzter Position wiederfinden (gleiche Kategorie+Name, ~300m),
        // statt es neu anzulegen (sonst Reconcile-Churn jeden Lauf, T-078).
        if (!target && value.name && value.lat != null && value.lng != null) {
          const cand = fuzzyIndex.get(`${value.kategorie}|${normName(value.name)}`)
          const near = cand
            ? cand.filter(
                (r) => Math.abs(r.lat - value.lat) <= FUZZY_LAT && Math.abs(r.lng - value.lng) <= FUZZY_LNG,
              )
            : []
          if (near.length) {
            target = near.reduce((best, r) => (dist2(r, value) < dist2(best, value) ? r : best), near[0])
            // Der Treffer behält seine externe_id — die ins seen-Set, damit der
            // Vollbestand-Reconcile diese (noch im Feed vorhandene) Zeile nicht deaktiviert.
            seen.add(target.externe_id)
          }
        }
        if (target) {
          // Sachfeld-Update — fachId/realerStart bleiben stabil
          pendingUpdates.set(target.id, value) // gleiche id mehrfach → letzter Wert gewinnt (wie zuvor)
          stats.aktualisiert += 1
          // Vollbestand: wieder im Feed ⇒ reaktivieren (war's deaktiviert/abgelaufen).
          // Fuzzy-Treffer stammen aus dem aktiven Satz (kein aktiv-Feld) → nie reaktiviert.
          if (connector.vollbestand && target.aktiv === false) {
            pendingReactivate.add(target.id)
            stats.reaktiviert += 1
          }
        } else if (pendingInserts.has(externeId)) {
          // Zweites Item mit GLEICHER externe_id im selben Feed → kein zweiter INSERT (sonst
          // duplicate key obstacles_quelle_extern_ux). fachId des ersten behalten, Wert gewinnt
          // (bildet das frühere „UPDATE der gerade eingefügten Zeile"-Verhalten nach).
          const prev = pendingInserts.get(externeId)
          value.fachId = prev.fachId
          value.realerStart = prev.realerStart
          pendingInserts.set(externeId, value)
          stats.aktualisiert += 1
        } else {
          value.realerStart = value.realerStart ?? todayIso()
          value.fachId = buildFachId(nextIndex++, connector.quelleId, value.realerStart)
          pendingInserts.set(externeId, value)
          stats.neu += 1
        }
      }

      // Gesammelte Writes als wenige Multi-Row-Statements absetzen (T-329). Reihenfolge zwischen
      // Insert/Update/Reactivate ist beliebig (disjunkte bzw. idempotente Effekte auf je eine Zeile).
      for (const part of chunk([...pendingInserts.values()], BATCH_ROWS)) {
        await q.query(
          `INSERT INTO obstacles (${OBSTACLE_INSERT_COLS}) VALUES ${placeholders(part.length, OBSTACLE_INSERT_COL_COUNT)}`,
          part.flatMap(insertParams),
        )
      }
      for (const part of chunk([...pendingUpdates], BATCH_ROWS)) {
        await q.query(
          sachfeldBatchSql(placeholders(part.length, SACHFELD_COL_COUNT)),
          part.flatMap(([id, value]) => sachfeldParams(id, value)),
        )
      }
      if (pendingReactivate.size) {
        await q.query(
          "UPDATE obstacles SET aktiv = true, updated_at = now() WHERE id = ANY($1::uuid[])",
          [[...pendingReactivate]],
        )
      }

      // Reconcile: bei Vollbestand-Feeds Fehlende deaktivieren. Nur wenn wir
      // tatsächlich etwas Gültiges gesehen haben (sonst würde ein leerer/kaputter
      // Feed fälschlich den ganzen Bestand deaktivieren).
      if (connector.vollbestand && seen.size > 0 && result?.complete !== false) {
        const { rowCount } = await q.query(RECONCILE_SQL, [connector.quelleId, [...seen]])
        stats.deaktiviert = rowCount
        if (rowCount > 0) note(`Reconcile: ${rowCount} nicht mehr im Feed → deaktiviert`)
      } else if (connector.vollbestand && result?.complete === false) {
        // T-311/T-314: Teilbestand → NICHT reconcilen, sonst verschwinden real existierende
        // Hindernisse und das Tool zeigt eine gesperrte Strecke faelschlich als frei.
        note("Teilbestand (complete=false) — Reconcile übersprungen (Schutz gegen false-Deaktivieren)")
      }
    })
    // T-314: Teilbestand ehrlich kennzeichnen (status='partial' statt 'ok'), damit Sync/Health
    // den degradierten Lauf sichtbar machen können (nicht stiller Voll-Erfolg).
    if (result?.complete === false && status === "ok") status = "partial"
    // T-476: ein Vollbestand-Feed mit 0 Einträgen ist KEIN gesunder Voll-Erfolg (kaputter/leerer
    // Feed) → als 'warn' markieren, damit Staleness sichtbar wird statt grün durchzugehen.
    if (connector.vollbestand && stats.gefunden === 0 && status === "ok") {
      status = "warn"
      note("Vollbestand-Feed lieferte 0 Einträge — als 'warn' markiert (kein stiller Voll-Erfolg)")
    }
  } catch (err) {
    status = "error"
    note(`Fehler: ${err?.message ?? err}`)
  }

  const { rows: doneRows } = await db.query(
    `UPDATE import_runs SET status = $2, stats = $3, log = $4, finished_at = now()
     WHERE id = $1 RETURNING *`,
    [run.id, status, JSON.stringify(stats), logLines.length ? logLines.join("\n") : null],
  )
  // T-476: letzter_abruf NUR bei Nicht-Fehler hochziehen — sonst stempelt ein toter Feed sich
  // selbst als „gerade frisch" und die Staleness (zuletztAktualisiert = max(letzter_abruf)) lügt.
  if (status !== "error") {
    await db.query("UPDATE quellen SET letzter_abruf = now() WHERE id = $1", [connector.quelleId])
  }
  return doneRows[0]
}
