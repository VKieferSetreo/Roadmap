// Roadmap-Orchestrator — der Harness.
//
// Verdrahtet die Ports (Routing, Sub-Agent, Validierungslayer, LLM) mit dem
// deterministischen Kern (planning.js) und fährt den Runden-Loop nach Spec. Der
// Harness — nicht das Modell — erzwingt die harten Invarianten: max 5 Runden, die
// Runden-Tabelle, Konvergenz-Abbruch, die Fallback-Reihenfolge, das Verbot hart→weich.
//
// Ports (alle als Objekte mit den genannten Methoden; siehe stubs.js für lauffähige
// Referenz-Implementierungen):
//   routing.initialRoute(auftrag)            → InitialStreckenErgebnis   (Regel 1/2)
//   subAgent.bearbeite(subAgentAuftrag)      → SubAgentErgebnis          (Regel 4/5)
//   validator.pruefe({ route, auftrag, ... })→ ValidierungsUrteil        (Regel 6)
//   llm.entscheideZuschnitt({...})           → { abschnitte:[{abschnittId,stellenIdx,...}] } (Regel 4, optional)
//   log(eintrag)                             → void                      (Regel 19)

import {
  RUNDEN_TABELLE,
  MAX_RUNDEN,
  STATUS,
  ABBRUCH,
  MODI,
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

/** Prüft, ob ein Zuschnitt jede Stelle genau einmal abdeckt. */
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
    validiereEingang(auftrag)

    // Regel 1/2 — Initialstrecke + kritische Stellen.
    const init = await routing.initialRoute(auftrag)
    const geo = init.geometry ?? []
    const alleStellen = (init.kritischeStellen ?? []).map((s) => ({ ...s, modus: modusVon(s, auftrag) }))
    const warnliste = alleStellen.map((s) => ({
      ort: s.ort,
      typ: s.typ,
      grund_des_scheiterns: s.grund ?? "nur gemeldet (Modus keine)",
      modus: s.modus,
    }))
    log({ phase: "initial", distanzKm: init.distanzKm, stellen: alleStellen.length, harteSperre: !!init.harteSperreVorhanden })

    // Umfahrungspflichtige Stellen = Modus ≠ "keine". Stabile Liste über alle Runden.
    const pflicht = alleStellen.filter((s) => s.modus !== "keine")

    // Regel 3 — alle Stellen auf "keine": Sub-Agenten-Ebene überspringen.
    if (pflicht.length === 0) {
      return endErgebnis({
        route: { geometry: geo, distanzKm: init.distanzKm },
        status: STATUS.INITIAL,
        ungeloeste: warnliste,
        verbrauchteRunden: 0,
        abbruchgrund: ABBRUCH.GELOEST,
        reparaturen: [],
        wahl: [],
      })
    }

    // Rundenübergreifender Zustand.
    const bestenlisten = new Map() // abschnittId → SubAgentKandidat[]
    const letzteZuschnitte = new Map() // abschnittId → { startIdx, endIdx, stellenIdx }
    const reparaturenGesamt = []
    let besteVollstaendige = null // { wahl, bewertung, ungeloeste, route }
    let letzterHash = null
    let ablehnungskontext = new Map() // abschnittId → kontext (ab Runde 2)
    let verbrauchteRunden = 0
    let abbruchgrund = ABBRUCH.BUDGET

    for (let runde = 1; runde <= MAX_RUNDEN; runde++) {
      const params = RUNDEN_TABELLE[runde - 1]
      verbrauchteRunden = runde

      // ── Zuschnitt (Regel 4) — LLM-Ermessen mit deterministischem Netz. ──
      const abschnitte = ermittleZuschnitt(pflicht, geo, params, ablehnungskontext, runde)
      for (const a of abschnitte) letzteZuschnitte.set(a.abschnittId, a)
      log({ phase: "zuschnitt", runde, strategie: params.zuschnitt, abschnitte: abschnitte.map((a) => a.abschnittId) })

      // ── Sub-Agenten (Regel 5) — je Abschnitt eine isolierte Instanz. ──
      const ergebnisse = []
      for (const a of abschnitte) {
        const stellen = a.stellenIdx.map((i) => pflicht[i])
        const modus = strengsterModus(stellen)
        const subAuftrag = {
          abschnittId: a.abschnittId,
          // NUR der zugeschnittene Streckenteil — nie die Gesamtstrecke (Verbot).
          abschnitt: geo.slice(a.startIdx, a.endIdx + 1),
          stellen,
          modus,
          rundenParameter: {
            runde,
            tiers: params.tiers,
            zeitdeckelMin: params.zeitdeckelMin,
            strassenklasse: params.strassenklasse,
            weichMinProKm: params.weichMinProKm,
            meideAufschlagFaktor: params.meideAufschlagFaktor,
          },
          kontext: { fahrzeugprofil: auftrag.fahrzeugprofil, restriktionen: auftrag.restriktionen },
          ablehnungskontext: runde >= 2 ? ablehnungskontext.get(a.abschnittId) ?? null : null,
        }
        const erg = await subAgent.bearbeite(subAuftrag)
        const kandidaten = (erg?.kandidaten ?? []).map((c) => ({
          ...c,
          tier: c.tier ?? params.tiers[params.tiers.length - 1],
          hash: c.hash ?? kandidatHash(c),
          eintritt: c.eintritt ?? geo[a.startIdx],
          austritt: c.austritt ?? geo[a.endIdx],
        }))
        ergebnisse.push({ abschnittId: a.abschnittId, abschnitt: a, geloest: !!erg?.geloest, grund: erg?.grund, kandidaten, stellen })
        aktualisiereBestenliste(bestenlisten, a.abschnittId, kandidaten)
      }

      // ── Konvergenz-Abbruch (Regel 14). ──
      const hash = rundenHash(ergebnisse)
      if (letzterHash !== null && hash === letzterHash) {
        log({ phase: "konvergenz", runde })
        abbruchgrund = ABBRUCH.KONVERGENZ
        break
      }
      letzterHash = hash

      // ── Wahl bilden: bester Kandidat je Abschnitt. ──
      let wahl = ergebnisse
        .filter((e) => e.kandidaten.length > 0)
        .map((e) => ({ abschnitt: e.abschnitt, kandidat: (bestenlisten.get(e.abschnittId) ?? e.kandidaten)[0], ergebnis: e }))

      // ── Zusammenführung + lokale Reparatur (Regel 8/9). ──
      let { konflikte } = fuegeAbschnitteZusammen(geo, wahl)
      if (konflikte.length > 0) {
        const rep = lokaleReparatur(geo, wahl, bestenlisten)
        reparaturenGesamt.push(...rep.reparaturen)
        wahl = rep.wahl
        if (!rep.geloest) {
          // Merge nach erschöpfter Reparatur gescheitert → Runde verbraucht (Regel 12).
          log({ phase: "merge_gescheitert", runde, konflikte })
          ablehnungskontext = neuerAblehnungskontext(ergebnisse, "Zusammenführung gescheitert (Konflikt am Übergang)")
          continue
        }
      }

      const { route } = fuegeAbschnitteZusammen(geo, wahl)

      // ── Validierung (Regel 6/10) — auch reparierte Routen gehen hier durch. ──
      const urteil = await validator.pruefe({ route, auftrag, wahl: wahl.map((w) => w.abschnitt.abschnittId), stellen: pflicht })
      log({ phase: "validierung", runde, freigabe: !!urteil?.freigabe, grund: urteil?.grund })

      if (!urteil?.freigabe) {
        // Regel 7 — Urteil wird nicht überstimmt. Runde verbraucht (Regel 12).
        ablehnungskontext = neuerAblehnungskontext(ergebnisse, urteil?.grund ?? "Validierung abgelehnt", urteil?.befunde)
        continue
      }

      // Freigegeben: welche Pflicht-Stellen sind gelöst?
      const geloesteStellenIdx = new Set()
      for (const w of wahl) if (w.ergebnis.geloest) for (const i of w.ergebnis.abschnitt.stellenIdx) geloesteStellenIdx.add(i)
      const ungeloeste = pflicht
        .map((s, i) => ({ s, i }))
        .filter(({ i }) => !geloesteStellenIdx.has(i))
        .map(({ s }) => ({ ort: s.ort, typ: s.typ, grund_des_scheiterns: grundFuerStelle(s, ergebnisse), modus: s.modus }))

      const bewertung = bewerteVollstaendigeRoute({ wahl, ungeloesteAnzahl: ungeloeste.length })
      // Regel 15a — beste VOLLSTÄNDIGE (validierte) Route merken.
      if (!besteVollstaendige || bewertung < besteVollstaendige.bewertung) {
        besteVollstaendige = { wahl, bewertung, ungeloeste, route }
      }

      if (ungeloeste.length === 0) {
        // Alles gelöst und validiert → fertig (Regel 12 Abbruch "geloest").
        return endErgebnis({
          route,
          status: STATUS.VOLLSTAENDIG,
          ungeloeste: [],
          verbrauchteRunden,
          abbruchgrund: ABBRUCH.GELOEST,
          reparaturen: reparaturenGesamt,
          wahl,
        })
      }

      // Validiert, aber Stellen offen: nächste Runde ändert Freiheitsgrad (Tabelle).
      ablehnungskontext = neuerAblehnungskontext(
        ergebnisse.filter((e) => !e.geloest),
        "Stelle in dieser Runde nicht gelöst — größere Freiheitsgrade nötig",
      )
    }

    // ── Budget/Konvergenz erschöpft → Fallback-Reihenfolge (Regel 16). ──
    return await fallback({
      auftrag, init, geo, warnliste, pflicht,
      bestenlisten, letzteZuschnitte, besteVollstaendige,
      reparaturenGesamt, verbrauchteRunden, abbruchgrund, validator, log,
    })
  }

  // ── Zuschnitt-Ermittlung: LLM fragen, deterministisch absichern. ──
  function ermittleZuschnitt(pflicht, geo, params, ablehnungskontext, runde) {
    const deterministisch = () =>
      schneideAbschnitte(pflicht, geo, params.zuschnitt).map((a) => ({
        ...a,
        startIdx: clampIdx(a.startIdx, geo.length),
        endIdx: clampIdx(a.endIdx, geo.length),
      }))

    if (!llm?.entscheideZuschnitt) return deterministisch()

    try {
      const vorschlag = llm.entscheideZuschnittSync
        ? llm.entscheideZuschnittSync({ stellen: pflicht, runde, params, ablehnungskontext: [...ablehnungskontext.values()] })
        : null
      // Wir akzeptieren nur einen strukturell gültigen LLM-Zuschnitt; die Geometrie-
      // Grenzen (startIdx/endIdx) bleiben deterministisch, damit das Modell keine
      // Indizes erfinden kann. Ungültiges → deterministischer Zuschnitt (Prompt sagt das).
      if (vorschlag && zuschnittGueltig(vorschlag.abschnitte, pflicht.length)) {
        return abschnitteAusStellen(vorschlag.abschnitte, pflicht, geo, params)
      }
    } catch (e) {
      log({ phase: "llm_zuschnitt_fehler", runde, fehler: String(e?.message ?? e) })
    }
    return deterministisch()
  }

  return { plane }
}

// Baut aus einer LLM-Gruppierung (Stellen-Indizes) konkrete Abschnitte mit
// deterministischen Geometrie-Grenzen. Grenzen = Hülle der enthaltenen Stellen ±
// Fenster aus dem deterministischen Zuschnitt derselben Stellen.
function abschnitteAusStellen(gruppen, pflicht, geo, params) {
  return gruppen.map((g) => {
    const teilStellen = g.stellenIdx.map((i) => pflicht[i])
    const [one] = schneideAbschnitte(teilStellen, geo, params.zuschnitt)
    return {
      abschnittId: `S${Math.min(...g.stellenIdx)}`,
      stellenIdx: g.stellenIdx,
      startIdx: one.startIdx,
      endIdx: one.endIdx,
    }
  })
}

function neuerAblehnungskontext(ergebnisse, grund, befunde) {
  const m = new Map()
  for (const e of ergebnisse) m.set(e.abschnittId, { grund, befunde: befunde ?? null, letzterGrund: e.grund ?? null })
  return m
}

function grundFuerStelle(stelle, ergebnisse) {
  const e = ergebnisse.find((x) => x.stellen?.includes(stelle))
  return e?.grund ?? "keine gültige Umfahrung gefunden"
}

// ── Fallback (Regel 16 + 17) ──────────────────────────────────────────────────
async function fallback(ctx) {
  const {
    auftrag, init, geo, warnliste, pflicht, bestenlisten, letzteZuschnitte,
    besteVollstaendige, reparaturenGesamt, verbrauchteRunden, abbruchgrund, validator, log,
  } = ctx

  // 16.1 — Komposition aus den Abschnitts-Bestwerten.
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
      const urteil = await validator.pruefe({ route, auftrag, wahl: wahl.map((w) => w.abschnitt.abschnittId), stellen: pflicht })
      if (urteil?.freigabe) {
        log({ phase: "fallback", weg: "komposition", freigabe: true })
        const geloest = new Set()
        for (const w of wahl) if (bestenlisten.get(w.abschnitt.abschnittId)?.length) for (const i of w.abschnitt.stellenIdx) geloest.add(i)
        const ungeloeste = pflicht
          .map((s, i) => ({ s, i }))
          .filter(({ i }) => !geloest.has(i))
          .map(({ s }) => ({ ort: s.ort, typ: s.typ, grund_des_scheiterns: "nur teilweise gelöst", modus: s.modus }))
        return endErgebnis({
          route,
          status: ungeloeste.length === 0 ? STATUS.VOLLSTAENDIG : STATUS.TEILERGEBNIS,
          ungeloeste,
          verbrauchteRunden,
          abbruchgrund,
          reparaturen: [...reparaturenGesamt, ...repar],
          wahl,
        })
      }
    }
  }

  // 16.2 — beste vollständige (in einer Runde validierte) Route.
  if (besteVollstaendige) {
    log({ phase: "fallback", weg: "beste_vollstaendige" })
    return endErgebnis({
      route: besteVollstaendige.route,
      status: STATUS.TEILERGEBNIS,
      ungeloeste: besteVollstaendige.ungeloeste,
      verbrauchteRunden,
      abbruchgrund,
      reparaturen: reparaturenGesamt,
      wahl: besteVollstaendige.wahl,
    })
  }

  // 16.3 — Initialstrecke. Regel 17: harte Sperre ohne Umfahrung → nicht_befahrbar.
  const harteOffen = init.harteSperreVorhanden || pflicht.some((s) => s.modus === "hart")
  if (harteOffen) {
    log({ phase: "fallback", weg: "nicht_befahrbar" })
    const harteStellen = pflicht.filter((s) => s.modus === "hart")
    return endErgebnis({
      route: { geometry: geo, distanzKm: init.distanzKm },
      status: STATUS.NICHT_BEFAHRBAR,
      ungeloeste: (harteStellen.length ? harteStellen : pflicht).map((s) => ({
        ort: s.ort, typ: s.typ, grund_des_scheiterns: "harte Sperre, keine Umfahrung gefunden", modus: s.modus,
      })),
      verbrauchteRunden,
      abbruchgrund,
      reparaturen: reparaturenGesamt,
      wahl: [],
    })
  }

  log({ phase: "fallback", weg: "initialstrecke" })
  return endErgebnis({
    route: { geometry: geo, distanzKm: init.distanzKm },
    status: STATUS.INITIAL,
    ungeloeste: warnliste,
    verbrauchteRunden,
    abbruchgrund,
    reparaturen: reparaturenGesamt,
    wahl: [],
  })
}

// ── Rückgabe zusammensetzen (Regel: Rückgabe) ─────────────────────────────────
function endErgebnis({ route, status, ungeloeste, verbrauchteRunden, abbruchgrund, reparaturen, wahl }) {
  return {
    route,
    status,
    ungeloeste_stellen: ungeloeste,
    verbrauchte_runden: verbrauchteRunden,
    abbruchgrund,
    reparaturen: reparaturen.map((r) => ({ abschnitt: r.abschnitt, art: r.art, erfolgreich: r.erfolgreich })),
    tier_verteilung: tierVerteilung(wahl ?? []),
  }
}
