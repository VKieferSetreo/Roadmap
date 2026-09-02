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

import { dedupeObstacles, restriktionsProfil } from "../connectors/_helpers.js"
import { BATCH_ROWS, chunk, placeholders } from "../dbBatch.js"
import { durchsGate, schreibeBelege } from "../anreicherung/gate.js"
import { spieleEin } from "../anreicherung/einspielen.js"
import {
  buildFachId, insertParams, istLiveVerkehrsmeldung, istReineInfrastruktur,
  OBSTACLE_COLS, OBSTACLE_INSERT_COLS, OBSTACLE_INSERT_COL_COUNT,
  sachfeldBatchSql, sachfeldParams, SACHFELD_COL_COUNT, todayIso, validateObstacle,
} from "../obstaclesRepo.js"

// Bulk-Import-Speed (T-042): EINMAL je Lauf den Quellen-Bestand laden statt per-Zeile zu
// SELECTen — Upsert/Drift-Match/fachId laufen dann in-memory (kein N+1, kein per-Zeile-Lock).
const EXISTING_ALL_SQL = `SELECT ${OBSTACLE_COLS} FROM obstacles WHERE quellen_id = $1`
// T-262: Index = ALLES vor QUELLE(4)+DDMMYY(6), also fach_id ohne die letzten 10 Zeichen — NICHT
// fix die ersten 4. Sonst bricht der Zähler bei >9999 Einträgen/Quelle (5-stelliger Index, fach_id
// 15-stellig): substring(…,1,4) las nur "1000…", MAX blieb bei 9999 → Folge-Importe vergaben Index
// 10000+ erneut → Dubletten. length-10 liest 4- UND 5-stellige Indizes korrekt (14-stellig identisch).
const MAX_INDEX_SQL = `SELECT COALESCE(MAX(substring(fach_id FROM 1 FOR (length(fach_id) - 10))::int), 0) AS max_index
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
  // Das KI-Gate vor dem Schreiben (T-660). Ohne dieses Objekt laeuft der Import wie bisher —
  // Tests und Altpfade bleiben damit unveraendert.
  gate = null,
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
  let reconcileSuspended = false // T-627: Reconcile-Guard hat Massen-Deaktivierung abgewehrt → partial

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
          // T-609: Restriktions-Profil mit in den Drift-Kandidaten — eine Stelle kann mehrere Bauphasen
          // mit unterschiedlicher Breite tragen; ohne dieses Feld zog der Fuzzy-Match alle Phasen auf EINE
          // Zeile (last-write, schmalste Restbreite → falsch-kritisch). Profil statt Zeitfenster → kein
          // Churn bei rollenden Enddaten.
          const cand = { id: r.id, externe_id: r.externe_id, lat: Number(r.lat), lng: Number(r.lng), profil: restriktionsProfil(r.attrs) }
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
          // T-609: nur Kandidaten mit GLEICHEM Restriktions-Profil — sonst kollabiert der Drift-Match
          // Bauphasen unterschiedlicher Breite derselben Stelle auf eine Zeile (schmalste gewinnt).
          const itemProfil = restriktionsProfil(value.attrs)
          const near = cand
            ? cand.filter(
                (r) => r.profil === itemProfil && Math.abs(r.lat - value.lat) <= FUZZY_LAT && Math.abs(r.lng - value.lng) <= FUZZY_LNG,
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
          // T-611 (Voll-Bestand): NICHT reaktivieren, wenn die Quell-Meldung selbst schon abgelaufen ist
          // (gueltigBis < heute−Grace). Sonst belebt jeder Lauf abgelaufene Hindernisse zyklisch wieder
          // (0114/0141/0143/0146 hielten so jahrealte Meldungen aktiv). gueltigBis=null bleibt unbegrenzt.
          if (connector.vollbestand && target.aktiv === false) {
            const bis = value.gueltigBis ? String(value.gueltigBis).slice(0, 10) : null
            const graceCutoff = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)
            if (bis == null || bis >= graceCutoff) {
              pendingReactivate.add(target.id)
              stats.reaktiviert += 1
            }
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

      // ── DAS KI-GATE, vor dem Schreiben (T-660) ──────────────────────────────────────────
      //
      // Max, 01.09.2026: "dass Datenpunkte von den APIs nur geschrieben werden, WENN sie durch
      // das KI-Gate durch sind und enhanced wurden."
      //
      // NUR NEUE Punkte. Ein Update traegt seine Anreicherung schon in der Tabelle; sie hier
      // erneut zu rechnen kostete bei jedem der 140 taeglichen Laeufe das Vielfache.
      //
      // Die Stelle ist mit Absicht HIER und nicht frueher: erst nach der Schleife steht fest, wer
      // wirklich neu ist. Vorher wuerde das Gate ueber tausende Punkte laufen, die es laengst
      // gesehen hat.
      const gateBelege = []
      if (gate && pendingInserts.size) {
        const r = await durchsGate([...pendingInserts.values()], { ...gate, log: note })
        gateBelege.push(...r.belege)
        stats.gateGesehen = r.gesehen
        stats.gateGefunden = r.gefunden
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

      // ANGEREICHERTE WERTE WIEDERHERSTELLEN — nach JEDEM Import, ohne Ausnahme.
      //
      // Der Import hat obstacles.attrs gerade vollstaendig ueberschrieben (UPDATE_SACHFELDER_SQL:
      // `attrs = $10`). Alles, was die Anreicherung dort eingetragen hatte, ist damit weg. Die
      // Werte selbst stehen in der Anreicherungstabelle und sind nicht verloren — sie muessen nur
      // zurueck.
      //
      // Am 02.09.2026 gemessen, und es war der teuerste Fehler dieser zwei Tage: von 21.407
      // bestaetigten Angaben standen noch 773 im Bestand. Zwei Tage Rechenzeit waren auf der
      // Karte unsichtbar. Der Grund: spieleEin lief ausschliesslich in sync.js, und dort nur,
      // wenn OpenRouter erreichbar war — mit dem abgeschalteten Gate lief es also NIRGENDS mehr.
      //
      // Deshalb steht es jetzt HIER, im Importer selbst: es gibt keinen Importpfad, der daran
      // vorbeikommt. Die Abfrage fasst nur an, was sich wirklich aendert (1 s fuer 9.352 Punkte),
      // und ein Fehlschlag darf den Import nicht scheitern lassen.
      await spieleEin(q).catch((e) => note(`Anreicherung nicht zurueckgespielt: ${e.message}`))

      // Die Belege des Gates — erst jetzt, denn vorher hatten die Punkte keine ID. Zugeordnet
      // ueber (quellen_id, externe_id), dasselbe Paar, mit dem der Import sie wiedererkennt.
      if (gateBelege.length) {
        const b = await schreibeBelege(q, gateBelege, { modell: gate.modell, quellenId: connector.quelleId })
          .catch((e) => { note(`Gate: Belege nicht gespeichert (${e.message})`); return { geschrieben: 0 } })
        stats.gateBelege = b.geschrieben
      }

      // Reconcile: bei Vollbestand-Feeds Fehlende deaktivieren. Nur wenn wir
      // tatsächlich etwas Gültiges gesehen haben (sonst würde ein leerer/kaputter
      // Feed fälschlich den ganzen Bestand deaktivieren).
      if (connector.vollbestand && seen.size > 0 && result?.complete !== false) {
        // T-627/T-626: Reconcile-Plausibilitäts-Guard gegen Massen-Deaktivierung durch stillen
        // Teilbestand — hand-rolled Paging-Loops (0157/0212/0124/…) interpretieren eine per getJson
        // NULL zurückgegebene Fehler-Seite als "Feed-Ende" und liefern trotzdem complete=true; ein
        // Mobilithek-Teilcontainer (0146: 17 Records deaktivierten 738 Thüringen-Hindernisse = 73%)
        // hat dieselbe Wirkung. Würde der Reconcile einen GROSSEN Anteil des bestehenden aktiven
        // Bestands deaktivieren, ist das kein normaler Feed-Schwund → aussetzen + partial, statt real
        // existierende Hindernisse zu löschen (= gesperrte Strecke fälschlich "frei"). Selbstheilung
        // beim nächsten vollständigen Lauf. Kleiner Bestand (<50) bleibt ungeguarded (dort ist starke
        // Fluktuation normal und ein Fehl-Delete verkraftbar).
        const aktivAlt = existingRows.filter((r) => r.aktiv && r.externe_id != null)
        const weg = aktivAlt.reduce((n, r) => (seen.has(r.externe_id) ? n : n + 1), 0)
        const anteil = aktivAlt.length ? weg / aktivAlt.length : 0
        if (aktivAlt.length >= 50 && anteil > 0.4) {
          reconcileSuspended = true
          note(`Reconcile-Guard: ${weg}/${aktivAlt.length} (${Math.round(anteil * 100)}%) des aktiven Bestands würden deaktiviert — Verdacht Teilbestand/Feed-Fehler → übersprungen (status=partial, kein false-Deaktivieren)`)
        } else {
          const { rowCount } = await q.query(RECONCILE_SQL, [connector.quelleId, [...seen]])
          stats.deaktiviert = rowCount
          if (rowCount > 0) note(`Reconcile: ${rowCount} nicht mehr im Feed → deaktiviert`)
        }
      } else if (connector.vollbestand && result?.complete === false) {
        // T-311/T-314: Teilbestand → NICHT reconcilen, sonst verschwinden real existierende
        // Hindernisse und das Tool zeigt eine gesperrte Strecke faelschlich als frei.
        note("Teilbestand (complete=false) — Reconcile übersprungen (Schutz gegen false-Deaktivieren)")
      }
    })
    // T-314: Teilbestand ehrlich kennzeichnen (status='partial' statt 'ok'), damit Sync/Health
    // den degradierten Lauf sichtbar machen können (nicht stiller Voll-Erfolg).
    if (result?.complete === false && status === "ok") status = "partial"
    // T-627: hat der Reconcile-Guard eine Massen-Deaktivierung abgewehrt, ist der Lauf ebenfalls
    // degradiert (Verdacht Teilbestand) → partial, damit die Staleng/Health das sieht.
    if (reconcileSuspended && status === "ok") status = "partial"
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
  // T-476/T-626: letzter_abruf NUR bei echtem Daten-Refresh hochziehen. 'ok' und 'partial' haben
  // verwertbare Daten geliefert; 'warn' (Vollbestand-Feed mit 0 Einträgen = toter/kaputter Feed) und
  // 'error' NICHT — sonst stempelt sich eine tote Quelle (0124 Token-Pflicht, 0122/0217 aus Schedule
  // gefallen) selbst als „gerade frisch" und die Register-Staleng lügt.
  if (status === "ok" || status === "partial") {
    await db.query("UPDATE quellen SET letzter_abruf = now() WHERE id = $1", [connector.quelleId])
  }
  return doneRows[0]
}
