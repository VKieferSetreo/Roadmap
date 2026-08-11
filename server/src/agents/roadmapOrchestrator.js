// Roadmap-Orchestrator — der Harness (Phasen-Workflow).
//
// Hält den GESAMTEN Planungszustand und arbeitet die Phasen strikt in Reihenfolge ab
// (Phase 0 → 8, Rundenschleife = Phase 3–6). Der Harness — nicht das Modell —
// erzwingt die harten Invarianten: Phase-0-Vollständigkeit ohne Defaults, max 5
// Runden mit der Eskalationstabelle, Verbot hart→weich, Konvergenz-Abbruch,
// Validierung VOR Merge, lokale Reparatur (2 Eingriffe) mit Re-Validierung, die
// Fallback-Kaskade und der Sonderfall nicht_befahrbar.
//
// Ports (async, Verträge in contracts.js; Referenz in stubs.js):
//   routing.initialRoute(auftrag) → InitialStreckenErgebnis          (Phase 1)
//   subAgent.bearbeite(subAgentAuftrag) → SubAgentErgebnis           (Phase 3, parallel)
//   validator.pruefe({ route, auftrag, ... }) → ValidierungsUrteil   (Phase 5, bindend)
//   llm.entscheideZuschnittSync({...}) → { abschnitte }              (Phase 3, optional)

import {
  RUNDEN_TABELLE,
  MAX_RUNDEN,
  MAX_LOKALE_REPARATUR,
  STATUS,
  ABBRUCH,
  MODI,
  KLASSE,
  validiereEingang,
  modusVon,
} from "./contracts.js"
import {
  schneideAbschnitte,
  fuegeAbschnitteZusammen,
  lokaleReparatur,
  bewerteVollstaendigeRoute,
  aktualisiereBestenliste,
  rundenHash,
  kandidatHash,
  tierVerteilung,
} from "./planning.js"

const strengsterModus = (stellen) =>
  stellen.reduce((m, s) => (MODI.indexOf(s.modus) > MODI.indexOf(m) ? s.modus : m), "keine")

const clampIdx = (i, n) => Math.max(0, Math.min(n - 1, Math.round(i)))

/** Signatur eines Zuschnitt-Abschnitts — identisch ⇒ derselbe Abschnitt (Regel 12). */
const signatur = (a) => `${a.abschnittId}|${a.startIdx}|${a.endIdx}|${[...a.stellenIdx].sort((x, y) => x - y).join(",")}`

/** Prüft, ob ein LLM-Zuschnitt jede Stelle genau einmal abdeckt. */
function zuschnittGueltig(abschnitte, anzahl) {
  if (!Array.isArray(abschnitte) || abschnitte.length === 0) return false
  const gesehen = new Set()
  for (const a of abschnitte) {
    if (!Array.isArray(a.stellenIdx) || a.stellenIdx.length === 0) return false
    for (const i of a.stellenIdx) {
      if (!Number.isInteger(i) || i < 0 || i >= anzahl || gesehen.has(i)) return false
      gesehen.add(i)
    }
  }
  return gesehen.size === anzahl
}

export function createRoadmapOrchestrator(ports = {}) {
  const { routing, subAgent, validator, llm = null } = ports
  const log = typeof ports.log === "function" ? ports.log : () => {}
  if (!routing?.initialRoute) throw new Error("Roadmap-Orchestrator: routing.initialRoute fehlt")
  if (!subAgent?.bearbeite) throw new Error("Roadmap-Orchestrator: subAgent.bearbeite fehlt")
  if (!validator?.pruefe) throw new Error("Roadmap-Orchestrator: validator.pruefe fehlt")

  /**
   * @param {import("./contracts.js").PlanAuftrag} auftrag
   * @returns {Promise<import("./contracts.js").OrchestratorErgebnis>}
   */
  async function plane(auftrag) {
    // ── Phase 0 — Auftrag prüfen (wirft AuftragUnvollstaendig, keine Defaults). ──
    validiereEingang(auftrag)

    // ── Phase 1 — Initialstrecke. ──
    const init = await routing.initialRoute(auftrag)
    const geo = init.geometry ?? []
    if (init.durchgehend === false || geo.length < 2) {
      log({ phase: "initial", durchgehend: false })
      return endErgebnis({
        route: null,
        status: STATUS.NICHT_BEFAHRBAR,
        ungeloeste: [scheiterStelle(init)],
        verbrauchteRunden: 0,
        abbruchgrund: ABBRUCH.GELOEST,
        reparaturen: [],
        wahl: [],
        ohneKurvenpruefung: [],
      })
    }

    // ── Phase 2 — Kritische Stellen klassifizieren. ──
    const alleStellen = (init.kritischeStellen ?? []).map((s) => ({
      ...s,
      modus: modusVon(s, auftrag),
      klasse: s.klasse === KLASSE.SPERRE || s.klasse === KLASSE.HINDERNIS ? s.klasse : KLASSE.HINDERNIS,
    }))
    log({ phase: "stellen", n: alleStellen.length, sperren: alleStellen.filter((s) => s.klasse === KLASSE.SPERRE).length })

    // Regel 8 — gar keine kritischen Stellen → vollständig gelöst.
    if (alleStellen.length === 0) {
      return endErgebnis({
        route: { geometry: geo, distanzKm: init.distanzKm },
        status: STATUS.VOLLSTAENDIG,
        ungeloeste: [],
        verbrauchteRunden: 0,
        abbruchgrund: ABBRUCH.GELOEST,
        reparaturen: [],
        wahl: [],
        ohneKurvenpruefung: [],
      })
    }

    const pflicht = alleStellen.filter((s) => s.modus !== "keine")

    // Regel 9 — alle Stellen auf "keine".
    if (pflicht.length === 0) {
      // Sonderfall: eine Sperre auf "keine" hebt die physische Unmöglichkeit nicht auf.
      const sperren = alleStellen.filter((s) => s.klasse === KLASSE.SPERRE)
      if (sperren.length > 0 || init.harteSperreVorhanden) {
        return endErgebnis({
          route: null,
          status: STATUS.NICHT_BEFAHRBAR,
          ungeloeste: (sperren.length ? sperren : alleStellen).map(stelleAusgabe("Sperre auf Modus keine — physisch unumfahrbar")),
          verbrauchteRunden: 0,
          abbruchgrund: ABBRUCH.GELOEST,
          reparaturen: [],
          wahl: [],
          ohneKurvenpruefung: [],
        })
      }
      return endErgebnis({
        route: { geometry: geo, distanzKm: init.distanzKm },
        status: STATUS.INITIAL,
        ungeloeste: alleStellen.map(stelleAusgabe("nur gemeldet (Modus keine)")),
        verbrauchteRunden: 0,
        abbruchgrund: ABBRUCH.GELOEST,
        reparaturen: [],
        wahl: [],
        ohneKurvenpruefung: [],
      })
    }

    // ── Rundenübergreifender Zustand. ──
    const bestenlisten = new Map() // abschnittId → SubAgentKandidat[]
    const akzeptiert = new Map() // signatur → Ergebnisobjekt (rundenübergreifend, Regel 12)
    const ablehnungskontext = new Map() // abschnittId → kontext (ab Runde 2 Pflicht)
    const ohneKurvenpruefung = new Map() // abschnittId → { ort, typ }
    const reparaturenGesamt = []
    let besteVollstaendige = null // { wahl, bewertung, ungeloeste, route }
    let letzterHash = null
    let letzteParams = null
    let letzteZuschnitte = new Map()
    let verbrauchteRunden = 0
    let abbruchgrund = ABBRUCH.BUDGET

    for (let runde = 1; runde <= MAX_RUNDEN; runde++) {
      const params = RUNDEN_TABELLE[runde - 1]
      verbrauchteRunden = runde

      // Regel 11 — Invariante: mind. ein Freiheitsgrad ändert sich (Tabelle garantiert es).
      if (letzteParams && paramSignatur(params) === paramSignatur(letzteParams)) {
        log({ phase: "invariante_verletzt", runde }) // strukturell unmöglich; nur Absicherung
      }
      letzteParams = params

      // ── Phase 3 — Zuschnitt + Beauftragung. ──
      const abschnitte = ermittleZuschnitt(pflicht, geo, params, ablehnungskontext)
      letzteZuschnitte = new Map(abschnitte.map((a) => [a.abschnittId, a]))

      // Regel 12 — nur offene (nicht akzeptierte) Abschnitte werden neu beauftragt.
      const wiederverwendet = []
      const offene = []
      for (const a of abschnitte) {
        const treffer = akzeptiert.get(signatur(a))
        if (treffer) wiederverwendet.push(treffer)
        else offene.push(a)
      }
      log({ phase: "zuschnitt", runde, strategie: params.zuschnitt, offen: offene.map((a) => a.abschnittId), reuse: wiederverwendet.map((e) => e.abschnitt.abschnittId) })

      // Regel 15 — Sub-Agenten PARALLEL, keiner kennt die Gesamtstrecke.
      const neue = await Promise.all(
        offene.map((a) => beauftrage({ a, geo, auftrag, params, runde, ablehnungskontext, subAgent })),
      )
      for (const e of neue) {
        aktualisiereBestenliste(bestenlisten, e.abschnitt.abschnittId, e.kandidaten)
        if (e.kurvengeprueft === false) ohneKurvenpruefung.set(e.abschnitt.abschnittId, { ort: stellenOrt(e.stellen), typ: e.stellen[0]?.typ })
      }

      const ergebnisse = [...wiederverwendet, ...neue]

      // ── Phase 4 — Einsammeln + Konvergenz-Hash (Geometrie-Hashes aller Kandidaten). ──
      const hash = rundenHash(ergebnisse.map((e) => ({ abschnittId: e.abschnitt.abschnittId, kandidaten: e.kandidaten })))
      if (letzterHash !== null && hash === letzterHash) {
        log({ phase: "konvergenz", runde })
        abbruchgrund = ABBRUCH.KONVERGENZ
        break
      }
      letzterHash = hash

      // Wahl je Abschnitt = bester Kandidat (Tier vor Kosten via Bestenliste).
      let wahl = ergebnisse
        .map((e) => ({ abschnitt: e.abschnitt, kandidat: besterKandidat(bestenlisten, e), ergebnis: e }))
        .filter((w) => w.kandidat)

      // ── Phase 5+6 — Validierung, dann Merge/Reparatur mit Re-Validierung. ──
      let reparaturVersuche = 0
      for (let inner = 0; inner < MAX_LOKALE_REPARATUR + 1; inner++) {
        const { route, konflikte } = fuegeAbschnitteZusammen(geo, wahl)
        const harteFehlschlaege = wahl.filter((w) => !w.ergebnis.geloest && strengsterModus(w.ergebnis.stellen) === "hart").map((w) => w.abschnitt.abschnittId)

        // Phase 5 — Validierung (bindend). Auch reparierte Routen laufen hier durch.
        const urteil = await validator.pruefe({
          route, auftrag,
          wahl: wahl.map((w) => w.abschnitt.abschnittId),
          stellen: pflicht,
          harteFehlschlaege,
        })
        log({ phase: "validierung", runde, inner, freigabe: !!urteil?.freigabe, grund: urteil?.grund })

        if (!urteil?.freigabe) {
          // Regel 24 — beanstandete Abschnitte bleiben offen, der Rest wird akzeptiert.
          const beanstandet = new Set(urteil?.beanstandeteAbschnitte ?? wahl.map((w) => w.abschnitt.abschnittId))
          for (const w of wahl) {
            if (beanstandet.has(w.abschnitt.abschnittId)) {
              akzeptiert.delete(signatur(w.abschnitt))
              ablehnungskontext.set(w.abschnitt.abschnittId, { grund: urteil?.grund ?? "Validierung abgelehnt", befunde: urteil?.befunde ?? null, verworfen: (bestenlisten.get(w.abschnitt.abschnittId) ?? []).map((c) => c.hash) })
            } else {
              akzeptiert.set(signatur(w.abschnitt), w.ergebnis)
            }
          }
          break // Runde verbraucht (Regel 24) → nächste Runde
        }

        // Phase 6 — Freigabe: geometrische Konflikte prüfen.
        if (konflikte.length === 0) {
          for (const w of wahl) akzeptiert.set(signatur(w.abschnitt), w.ergebnis)
          const ungeloeste = offeneStellen(pflicht, wahl)
          const bewertung = bewerteVollstaendigeRoute({ wahl, ungeloesteAnzahl: ungeloeste.length })
          if (!besteVollstaendige || bewertung < besteVollstaendige.bewertung) besteVollstaendige = { wahl, bewertung, ungeloeste, route }
          log({ phase: "fertig", runde })
          return endErgebnis({
            route,
            status: STATUS.VOLLSTAENDIG,
            ungeloeste,
            verbrauchteRunden,
            abbruchgrund: ABBRUCH.GELOEST,
            reparaturen: reparaturenGesamt,
            wahl,
            ohneKurvenpruefung: [...ohneKurvenpruefung.values()],
          })
        }

        // Konflikt → lokale Reparatur (Regel 28), max 2 Versuche gesamt.
        if (reparaturVersuche >= MAX_LOKALE_REPARATUR) {
          ablehnungskontext.clear()
          for (const w of wahl) ablehnungskontext.set(w.abschnitt.abschnittId, { grund: "Zusammenführung gescheitert", konflikte })
          break // Regel 30 — Runde verbraucht
        }
        const rep = lokaleReparatur(geo, wahl, bestenlisten)
        reparaturenGesamt.push(...rep.reparaturen)
        reparaturVersuche += rep.reparaturen.length || 1
        wahl = rep.wahl
        if (!rep.geloest) {
          for (const w of wahl) ablehnungskontext.set(w.abschnitt.abschnittId, { grund: "Zusammenführung gescheitert", konflikte })
          break // Runde verbraucht
        }
        // Reparatur gelungen → Schleife re-validiert (Regel 29).
      }
    }

    // ── Phase 7 — Fallback-Kaskade. ──
    return await fallback({
      auftrag, init, geo, alleStellen, pflicht, bestenlisten, letzteZuschnitte,
      besteVollstaendige, reparaturenGesamt, verbrauchteRunden, abbruchgrund, validator, log,
      ohneKurvenpruefung: [...ohneKurvenpruefung.values()],
    })
  }

  // ── Zuschnitt-Ermittlung: LLM fragen, deterministisch absichern. ──
  function ermittleZuschnitt(pflicht, geo, params, ablehnungskontext) {
    const deterministisch = () =>
      schneideAbschnitte(pflicht, geo, params.zuschnitt).map((a) => ({
        ...a,
        startIdx: clampIdx(a.startIdx, geo.length),
        endIdx: clampIdx(a.endIdx, geo.length),
        stellenObjekte: a.stellenIdx.map((i) => pflicht[i]),
      }))
    if (!llm?.entscheideZuschnittSync) return deterministisch()
    try {
      const vorschlag = llm.entscheideZuschnittSync({ stellen: pflicht, runde: params.runde, params, ablehnungskontext: [...ablehnungskontext.values()] })
      if (vorschlag && zuschnittGueltig(vorschlag.abschnitte, pflicht.length)) {
        return abschnitteAusStellen(vorschlag.abschnitte, pflicht, geo, params)
      }
    } catch (e) {
      log({ phase: "llm_zuschnitt_fehler", fehler: String(e?.message ?? e) })
    }
    return deterministisch()
  }

  return { plane }
}

// ── Sub-Agent beauftragen (Regel 13/14) ───────────────────────────────────────
async function beauftrage({ a, geo, auftrag, params, runde, ablehnungskontext, subAgent }) {
  const dieStellen = a.stellenObjekte
  const modus = strengsterModus(dieStellen)
  const subAuftrag = {
    abschnittId: a.abschnittId,
    abschnitt: geo.slice(a.startIdx, a.endIdx + 1), // NUR der Teil (Verbot Gesamtstrecke)
    stellen: dieStellen,
    modus,
    rundenParameter: {
      runde, tiers: params.tiers, zeitdeckelMin: params.zeitdeckelMin,
      strassenklasse: params.strassenklasse, weichMinProKm: params.weichMinProKm,
      meideAufschlagFaktor: params.meideAufschlagFaktor,
    },
    kontext: { fahrzeugprofil: auftrag.fahrzeugprofil, restriktionen: auftrag.restriktionen, zeitfenster: auftrag.zeitfenster },
    // Regel 14 — Ablehnungskontext ab Runde 2 Pflicht.
    ablehnungskontext: runde >= 2 ? ablehnungskontext.get(a.abschnittId) ?? null : null,
  }
  const erg = await subAgent.bearbeite(subAuftrag)
  const kandidaten = (erg?.kandidaten ?? []).map((c) => ({
    ...c,
    tier: c.tier ?? params.tiers[params.tiers.length - 1],
    hash: c.hash ?? kandidatHash(c), // Geometrie-Hash (Konvergenz)
    eintritt: c.eintritt ?? geo[a.startIdx],
    austritt: c.austritt ?? geo[a.endIdx],
  }))
  return { abschnitt: a, kandidaten, geloest: !!erg?.geloest, grund: erg?.grund, stellen: dieStellen, kurvengeprueft: erg?.kurvengeprueft }
}

// Baut aus einer LLM-Gruppierung konkrete Abschnitte mit deterministischen Grenzen.
function abschnitteAusStellen(gruppen, pflicht, geo, params) {
  return gruppen.map((g) => {
    const teilStellen = g.stellenIdx.map((i) => pflicht[i])
    const [one] = schneideAbschnitte(teilStellen, geo, params.zuschnitt)
    return { abschnittId: `S${Math.min(...g.stellenIdx)}`, stellenIdx: g.stellenIdx, startIdx: one.startIdx, endIdx: one.endIdx, stellenObjekte: teilStellen }
  })
}

const stellenOrt = (stellen) => stellen?.[0]?.ort
const stelleAusgabe = (grund) => (s) => ({ ort: s.ort, typ: s.typ, grund_des_scheiterns: grund, modus: s.modus })
const scheiterStelle = (init) => ({ ort: init.sperrstelle?.ort ?? null, typ: init.sperrstelle?.typ ?? "sperre", grund_des_scheiterns: "keine durchgehende Route ab hier", modus: "hart" })
const paramSignatur = (p) => `${p.tiers.join("+")}|${p.zeitdeckelMin}|${p.strassenklasse}|${p.weichMinProKm}|${p.zuschnitt}|${p.meideAufschlagFaktor}`

function besterKandidat(bestenlisten, ergebnis) {
  const bl = bestenlisten.get(ergebnis.abschnitt.abschnittId)
  if (bl && bl.length) return bl[0]
  return ergebnis.kandidaten?.[0] ?? null
}

/** Pflicht-Stellen ohne gelösten Abschnitt in der aktuellen Wahl. */
function offeneStellen(pflicht, wahl) {
  const geloest = new Set()
  for (const w of wahl) if (w.ergebnis.geloest) for (const s of w.ergebnis.stellen) geloest.add(s)
  return pflicht.filter((s) => !geloest.has(s)).map((s) => ({ ort: s.ort, typ: s.typ, grund_des_scheiterns: "keine gültige Umfahrung gefunden", modus: s.modus }))
}

// ── Phase 7 — Fallback-Kaskade (Regel 32–36) ──────────────────────────────────
async function fallback(ctx) {
  const {
    auftrag, init, geo, alleStellen, pflicht, bestenlisten, letzteZuschnitte,
    besteVollstaendige, reparaturenGesamt, verbrauchteRunden, abbruchgrund, validator, log, ohneKurvenpruefung,
  } = ctx

  // Stufe 1 — Komposition aus den Bestwerten (Tier vor Kosten) → teilergebnis.
  const komposition = [...letzteZuschnitte.values()]
    .map((abschnitt) => {
      const kandidat = (bestenlisten.get(abschnitt.abschnittId) ?? [])[0]
      return kandidat ? { abschnitt, kandidat } : null
    })
    .filter(Boolean)

  if (komposition.length > 0) {
    let wahl = komposition
    let { konflikte } = fuegeAbschnitteZusammen(geo, wahl)
    const repar = []
    if (konflikte.length > 0) {
      const rep = lokaleReparatur(geo, wahl, bestenlisten)
      repar.push(...rep.reparaturen)
      wahl = rep.wahl
      konflikte = fuegeAbschnitteZusammen(geo, wahl).konflikte
    }
    if (konflikte.length === 0) {
      const { route } = fuegeAbschnitteZusammen(geo, wahl)
      const urteil = await validator.pruefe({ route, auftrag, wahl: wahl.map((w) => w.abschnitt.abschnittId), stellen: pflicht, harteFehlschlaege: [] })
      if (urteil?.freigabe) {
        log({ phase: "fallback", weg: "komposition" })
        return endErgebnis({
          route, status: STATUS.TEILERGEBNIS, ungeloeste: teilUngeloest(pflicht, wahl),
          verbrauchteRunden, abbruchgrund, reparaturen: [...reparaturenGesamt, ...repar], wahl, ohneKurvenpruefung,
        })
      }
    }
  }

  // Stufe 2 — beste vollständige (validierte) Route → teilergebnis.
  if (besteVollstaendige) {
    log({ phase: "fallback", weg: "beste_vollstaendige" })
    return endErgebnis({
      route: besteVollstaendige.route, status: STATUS.TEILERGEBNIS, ungeloeste: besteVollstaendige.ungeloeste,
      verbrauchteRunden, abbruchgrund, reparaturen: reparaturenGesamt, wahl: besteVollstaendige.wahl, ohneKurvenpruefung,
    })
  }

  // Sonderfall vor Stufe 3 (Regel 35) — harte Sperre ohne Umfahrung → nicht_befahrbar.
  const harteSperre = init.harteSperreVorhanden || alleStellen.some((s) => s.klasse === KLASSE.SPERRE) || pflicht.some((s) => s.modus === "hart")
  if (harteSperre) {
    log({ phase: "fallback", weg: "nicht_befahrbar" })
    const sperren = pflicht.filter((s) => s.modus === "hart" || s.klasse === KLASSE.SPERRE)
    return endErgebnis({
      route: null, status: STATUS.NICHT_BEFAHRBAR,
      ungeloeste: (sperren.length ? sperren : pflicht).map(stelleAusgabe("harte Sperre, keine Umfahrung gefunden")),
      verbrauchteRunden, abbruchgrund, reparaturen: reparaturenGesamt, wahl: [], ohneKurvenpruefung,
    })
  }

  // Stufe 3 — Initialstrecke.
  log({ phase: "fallback", weg: "initialstrecke" })
  return endErgebnis({
    route: { geometry: geo, distanzKm: init.distanzKm }, status: STATUS.INITIAL,
    ungeloeste: alleStellen.map(stelleAusgabe("nicht gelöst — Budget/Konvergenz erschöpft")),
    verbrauchteRunden, abbruchgrund, reparaturen: reparaturenGesamt, wahl: [], ohneKurvenpruefung,
  })
}

function teilUngeloest(pflicht, wahl) {
  const abgedeckt = new Set()
  for (const w of wahl) for (const i of w.abschnitt.stellenIdx) abgedeckt.add(i)
  return pflicht.map((s, i) => ({ s, i })).filter(({ i }) => !abgedeckt.has(i)).map(({ s }) => ({ ort: s.ort, typ: s.typ, grund_des_scheiterns: "nur teilweise gelöst", modus: s.modus }))
}

// ── Phase 8 — Rückgabe zusammensetzen ─────────────────────────────────────────
function endErgebnis({ route, status, ungeloeste, verbrauchteRunden, abbruchgrund, reparaturen, wahl, ohneKurvenpruefung }) {
  return {
    route,
    status,
    ungeloeste_stellen: ungeloeste,
    verbrauchte_runden: verbrauchteRunden,
    abbruchgrund,
    reparaturen: reparaturen.map((r) => ({ abschnitt: r.abschnitt, art: r.art, erfolgreich: r.erfolgreich })),
    tier_verteilung: tierVerteilung(wahl ?? []),
    abschnitte_ohne_kurvenpruefung: ohneKurvenpruefung ?? [],
  }
}
