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

// T-716: Ein Datum, das Postgres als ::date annimmt. Die Form allein reicht nicht — /^\d{4}-\d{2}-\d{2}$/
// laesst '2026-02-30' und '2026-13-01' durch, und der Cast wirft dann erst beim UPDATE ganz am Ende,
// also NACHDEM der import_run bereits auf 'ok' geschrieben wurde: der Lauf steht als erfolgreich im
// Protokoll, die Exception platzt danach aus runImport heraus, und der Worker-Scheduler faengt sie
// (runImport sollte laut Kopfkommentar nie werfen). Ein Tippfehler im Connector wuerde so zu einem
// Ausfall an einer Stelle, die mit ihm nichts zu tun hat. Deshalb hier auf Existenz pruefen:
// Date.UTC normalisiert einen 30. Februar still auf den 2. Maerz — stimmt der Rueckweg nicht
// zeichengleich, gab es den Tag nicht.
function istEchtesDatum(s) {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const [j, m, t] = s.split("-").map(Number)
  const d = new Date(Date.UTC(j, m - 1, t))
  return d.getUTCFullYear() === j && d.getUTCMonth() === m - 1 && d.getUTCDate() === t
}

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
  // T-716: Stand einer Schnappschuss-Quelle (Datei/PDF-Auszug), falls der Connector ihn meldet.
  let standAm = null
  // T-718: der Feed hat geantwortet „nichts Neues" (HTTP 304/204) — kein leerer, sondern ein
  // unveränderter Bestand. Der Unterschied entscheidet unten über Status und letzter_abruf.
  let unveraendert = false
  // T-720: Verhältnis-Warnung (Teil-Kollaps) — sie ist ein 'warn', hat aber Daten geliefert.
  let einbruch = false

  try {
    // T-275: Default 4000ms war für paginierte WFS zu knapp (4s/Seite → Timeout → Abbruch →
    // stiller Teilbestand). fetchAllFeatures wirft bei Seiten-Timeout HART (kein Silent-Empty →
    // Reconcile-Schutz greift), 20s/Seite ist großzügig genug für träge Landes-WFS. Der Worker
    // setzt env zusätzlich (40000); dieser Default deckt den api-getriggerten Sync ab.
    const timeoutMs = Number(env.EXTERNAL_TIMEOUT_MS ?? 20000)
    // db wird durchgereicht für Connectoren, die gegen den Live-Bestand dedupen (0152 BAB-AlD
    // gegen 0001/0145). Bestehende Connectoren ignorieren den extra Parameter.
    const result = await connector.fetch({ fetchImpl, env, timeoutMs, log: note, db })
    // T-716: Quellen, die einen Schnappschuss lesen statt einen Feed zu ziehen (0126: geparste
    // Behörden-PDF von der Platte), melden den Stand ihres Inhalts mit. Nur ein EXISTIERENDES
    // ISO-Datum wird übernommen (istEchtesDatum, nicht bloß die Form) — ein Freitext-„Stand" oder
    // ein '2026-02-30' darf nicht in eine Zeitspalte laufen.
    if (typeof result?.standAm === "string") {
      if (istEchtesDatum(result.standAm)) standAm = result.standAm
      // Nicht stumm verwerfen: ein Connector, der einen Stand meldet, den wir wegwerfen, hat ein
      // Parser-Problem — und der Lauf sähe sonst genauso aus wie einer ganz ohne Stand.
      else note(`Stand-Datum der Quelle unbrauchbar, ignoriert: ${String(result.standAm).slice(0, 40)}`)
    }
    // T-718: 304/204 kommt als eigenes Feld herein (mobilithek.js setzt es seit jeher) — bis zum
    // 05.09.2026 hat es hier niemand gelesen. Der Vermerk in den Stats ist kein Schmuck: er
    // unterscheidet im Protokoll „nichts Neues" von „nichts da" und hält unten (T-720) die
    // 304-Läufe aus dem Median heraus, der sonst für jeden Delta-Feed gegen null liefe.
    unveraendert = result?.unveraendert === true
    if (unveraendert) stats.unveraendert = true
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
    //
    // T-695: hier war ein Schalter „leerIstGueltig" vorgesehen, um Dauer-Warnungen von Feeds zu
    // unterdruecken, die oft nichts melden. Die Messung hat ihn erledigt: von 68 Quellen haben in
    // 60 Tagen genau drei NIE Daten geliefert (0121 in 187 Laeufen, 0151 in 187, 0159 in 55). Das
    // ist kein „manchmal leer", das ist ein Dauerausfall. Wer den stummschaltet, verliert genau
    // die Meldung, die ihn haette finden lassen. Der richtige Weg ist, die tote Quelle
    // stillzulegen, nicht ihre Warnung.
    //
    // T-718: „0 Einträge" heißt aber nicht immer „nichts bekommen". Ein Delta-Feed, der auf
    // If-Modified-Since mit 304 antwortet, sagt genau das Gegenteil: der Bestand steht, es hat sich
    // nichts geändert. Gemessen am 05.09.2026 lief er trotzdem in diese Regel — 0140 Niedersachsen
    // 139 von 289 Läufen auf 'warn', 0142 Bremen 78, 0148 RLP 42, und weil 'warn' unten auch das
    // letzter_abruf-Update unterdrückt, zeigte das Frontend eine kerngesunde Quelle als nicht
    // erreichbar, sobald der letzte Lauf des Tages ein 304 war. Ein korrekt arbeitender Feed darf
    // nicht dafür bestraft werden, dass er korrekt arbeitet.
    if (connector.vollbestand && stats.gefunden === 0 && status === "ok" && !unveraendert) {
      status = "warn"
      note("Vollbestand-Feed lieferte 0 Einträge — als 'warn' markiert (kein stiller Voll-Erfolg)")
    }
    // T-695: dieselbe Frage fuer Quellen OHNE Vollbestand. Sie umgingen die Regel darueber und
    // konnten dadurch beliebig lange still nichts liefern. Gefunden an Quelle 0121 (GST-Negativ-
    // karten Sachsen): 187 Laeufe, kein einziger Eintrag, Status durchgehend "ok". Die Seite
    // antwortet mit HTTP 200 und traegt schlicht keine PDF-Links mehr — der Betreiber hat sie
    // umgebaut, und niemand hat es gesehen.
    //
    // EIN leerer Lauf ist hier kein Fehler (eine Ereignisquelle darf nichts zu melden haben),
    // deshalb faellt das Urteil ueber ein Zeitfenster: hat die Quelle in vierzehn Tagen KEIN
    // einziges Mal etwas geliefert, ist sie faktisch tot und sagt es jetzt auch.
    if (!connector.vollbestand && stats.gefunden === 0 && status === "ok") {
      try {
        const { rows } = await db.query(
          `SELECT count(*) FILTER (WHERE (stats->>'gefunden')::int > 0)::int AS mit_daten,
                  count(*)::int AS laeufe
             FROM import_runs
            WHERE quelle_id = $1 AND started_at > now() - interval '14 days'`,
          [connector.quelleId],
        )
        const { mit_daten: mitDaten = 0, laeufe = 0 } = rows[0] ?? {}
        if (laeufe >= 5 && mitDaten === 0) {
          status = "warn"
          note(`seit 14 Tagen kein einziger Eintrag (${laeufe} Läufe) — Quelle liefert nichts mehr`)
        }
      } catch (err) {
        // Die Zusatzprüfung darf einen sonst gesunden Lauf nie kippen.
        note(`Leerlauf-Prüfung übersprungen: ${err?.message ?? err}`)
      }
    }

    // ── T-720: der TEIL-Kollaps ────────────────────────────────────────────────────────────
    //
    // Alle Regeln bis hierher hängen an der Null: T-476 „Vollbestand mit 0 Einträgen", T-627
    // „Reconcile würde fast alles deaktivieren", T-695 „14 Tage nichts geliefert". Eine Quelle, die
    // statt 12.295 Datensätzen nur noch 300 liefert, ist damit grün — Status ok, letzter_abruf
    // frisch, Indikator grün. Gemessen am 05.09.2026: 0123 BAYSIS 12.295 gefunden / 12.113
    // übersprungen (98,5 %) / 182 aktiv, 0220 Leipzig 68,9 % Wegwerfquote, 0140 38,9 %. Fiele 0123
    // morgen von 182 auf 5 verwertbare Punkte, würde das nichts und niemand melden.
    //
    // ZWEI ZAHLEN, WEIL EINE NICHT REICHT: „gefunden" sieht den Feed selbst schrumpfen; neu+
    // aktualisiert („verwertet") sieht den Bestand schrumpfen, den dieser Lauf am Leben hält —
    // genau der Fall, in dem der Feed unverändert groß bleibt und nur die Auswertung kippt (ein
    // umbenanntes Attribut, und istReineInfrastruktur wirft alles weg). Der aktive Bestand selbst
    // wird nirgends historisiert; neu+aktualisiert ist sein Vorlauf und steht in jedem alten
    // import_runs-Datensatz, also ohne Schemaänderung rückwirkend messbar.
    //
    // WARUM DER MEDIAN DER LETZTEN 14 TAGE der richtige Maßstab ist: er eicht sich je Quelle
    // selbst. Die dokumentierten Sonderfälle (reine Kataster, istReineInfrastruktur wirft 100 %
    // weg — 0110/0111/0116/0125/0303) haben einen Median von 0 verwerteten Punkten und schlagen
    // deshalb per Konstruktion nie an; sie fallen zusätzlich schon durch laeufe >= 5 (wöchentlicher
    // Takt = 2 Läufe in 14 Tagen). Ein fester Schwellwert hätte für jede Quelle einzeln gepflegt
    // werden müssen und wäre nach dem ersten Feed-Umbau falsch gewesen.
    //
    // DIE ZAHLEN: unter 40 % des Medians ist kein Rauschen mehr — dieselbe Grenze, die T-627 für
    // den Reconcile-Guard gemessen hat, und damit eine Zahl weniger im Kopf. MEDIAN_MIN = 20 hält
    // kleine Quellen draußen, bei denen 12 → 4 Baustellen ein normaler Dienstag ist. Die Schwelle
    // ist bewusst eher empfindlich als eher stumm: ein Fehlalarm kostet einen gelben Punkt im
    // Register und eine Mail, ein übersehener Teil-Kollaps kostet eine Streckenauswertung, die
    // eine gesperrte Brücke nicht mehr kennt.
    //
    // 304-Läufe sind hier ausgenommen (siehe oben) — „nichts Neues" ist kein Einbruch, und ein
    // Delta-Feed liefe sonst bei jedem korrekten 304 in die Warnung.
    const EINBRUCH_ANTEIL = 0.4
    const MEDIAN_MIN = 20
    if (status === "ok" && !unveraendert) {
      try {
        const { rows } = await db.query(
          // percentile_cont sortiert über double precision — der jsonb-Text wird deshalb direkt
          // dorthin gecastet und nicht über numeric (das ginge nur über einen impliziten Cast).
          `SELECT count(*)::int AS laeufe,
                  percentile_cont(0.5) WITHIN GROUP (ORDER BY (stats->>'gefunden')::double precision) AS med_gefunden,
                  percentile_cont(0.5) WITHIN GROUP (ORDER BY
                    COALESCE((stats->>'neu')::double precision, 0)
                    + COALESCE((stats->>'aktualisiert')::double precision, 0)
                  ) AS med_verwertet
             FROM import_runs
            WHERE quelle_id = $1 AND started_at > now() - interval '14 days'
              AND status IN ('ok', 'partial') AND stats->>'gefunden' IS NOT NULL
              AND stats->>'unveraendert' IS NULL`,
          [connector.quelleId],
        )
        const laeufe = Number(rows[0]?.laeufe ?? 0)
        const medGefunden = Number(rows[0]?.med_gefunden ?? 0)
        const medVerwertet = Number(rows[0]?.med_verwertet ?? 0)
        const verwertet = stats.neu + stats.aktualisiert
        const eingebrochen = []
        // laeufe >= 5 wie bei der Leerlauf-Prüfung: aus zwei Datenpunkten ist kein Median zu holen.
        if (laeufe >= 5) {
          if (medGefunden >= MEDIAN_MIN && stats.gefunden < medGefunden * EINBRUCH_ANTEIL) {
            eingebrochen.push(`gefunden ${stats.gefunden} statt üblicher ${Math.round(medGefunden)}`)
          }
          if (medVerwertet >= MEDIAN_MIN && verwertet < medVerwertet * EINBRUCH_ANTEIL) {
            eingebrochen.push(`verwertbar ${verwertet} statt üblicher ${Math.round(medVerwertet)}`)
          }
        }
        if (eingebrochen.length) {
          status = "warn"
          einbruch = true
          note(`Einbruch gegenüber dem Median der letzten 14 Tage (${laeufe} Läufe): ` +
               `${eingebrochen.join("; ")} — als 'warn' markiert (Verdacht auf Teil-Ausfall der Quelle)`)
        }
      } catch (err) {
        // Wie bei der Leerlauf-Prüfung: eine Zusatzmessung darf einen gesunden Lauf nie kippen.
        note(`Einbruch-Prüfung übersprungen: ${err?.message ?? err}`)
      }
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
  //
  // T-720: der Einbruchs-'warn' ist die eine Ausnahme. Er sagt „die Quelle liefert weniger als
  // sonst", nicht „die Quelle liefert nichts" — sie war erreichbar und hat Daten gebracht. Bliebe
  // letzter_abruf hier stehen, behauptete das Register zusätzlich einen Abruf-Ausfall, den es nicht
  // gab; dass die Quelle degradiert ist, trägt der Run-Status und über ihn der Frontend-Indikator
  // (OHNE_FRISCHE_DATEN in sourceHealth.ts zählt 'warn' bereits als „nicht frisch").
  if (status === "ok" || status === "partial" || einbruch) {
    // T-716: bei einer Schnappschuss-Quelle ist der Stand der Daten die ehrliche Antwort auf
    // „zuletzt aktualisiert", nicht der Zeitpunkt des Dateilesens. 0126 stand mit einem
    // PDF-Auszug vom 27.02.2026 dauerhaft auf „vor 30 Minuten" — eine Quelle, die per
    // Konstruktion nie ausfallen kann, sah dadurch als einzige immer perfekt aus.
    // Kleinster Eingriff ohne Schemaänderung; die saubere Lösung wäre eine eigene Spalte
    // (quellen.stand_am) neben letzter_abruf, siehe Ticket-Rückmeldung.
    //
    // OFFEN, UND ZWAR SICHTBAR: das UI-Label passt danach nicht mehr zum Inhalt. Für 0126 steht im
    // Register künftig „Letzter Abruf: vor 6 Monaten", obwohl die Quelle dreimal täglich sauber
    // durchläuft — die Spalte trägt jetzt den Stand der DATEN, nicht den des ABRUFS. Das Label
    // gehört mitgeändert (auf „Datenstand", für alle Quellen gleich richtig), und zwar an EINER
    // Stelle: src/components/db/QuellenRegister.tsx, <Detail label="Letzter Abruf" …> in der
    // Quellen-Detailzeile. Nicht Teil dieser Änderung — Frontend-Datei, eigenes Ticket.
    if (standAm) {
      await db.query("UPDATE quellen SET letzter_abruf = $2::date WHERE id = $1", [connector.quelleId, standAm])
    } else {
      await db.query("UPDATE quellen SET letzter_abruf = now() WHERE id = $1", [connector.quelleId])
    }
  }
  return doneRows[0]
}
