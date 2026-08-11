// Deterministischer Kern des Roadmap-Orchestrators: Zuschnitt, Zusammenführung,
// lokale Reparatur, Bewertung, Konvergenz-Hash und Fallback-Auswahl.
//
// Alles hier ist absichtlich frei von LLM- und I/O-Aufrufen: es sind die Teile,
// die der Orchestrator NICHT dem Modell überlassen darf (Regel 9: "keine Reparatur
// per Urteil"; Regel 14/16: Konvergenz und Fallback strikt bestimmt). Der Harness
// (roadmapOrchestrator.js) verdrahtet diese Bausteine mit den Ports.

import { createHash } from "node:crypto"
import { haversineKm, totalKm } from "../engine/geometry.js"
import { MALUS_PRO_UNGELOESTE_STELLE, MAX_LOKALE_REPARATUR } from "./contracts.js"

// Ab wie viel Metern Sprung zwischen zwei Übergangspunkten gilt ein Übergang als
// "nicht zusammenpassend" (Regel 8). 150 m ist großzügig genug für OSRM-Snapping,
// aber eng genug, dass echte Lücken auffallen.
const UEBERGANG_SPRUNG_KM = 0.15

const rund = (n) => Math.round(Number(n) * 1e5) / 1e5

// ── Zuschnitt (Regel 4/12) ────────────────────────────────────────────────────
// Schneidet die (umfahrungspflichtigen) kritischen Stellen zu Abschnitten. Das
// "Ermessen" der Spec liegt hier als deterministische Strategie pro Runde vor; ein
// LLM-Port darf diese Vorschläge verfeinern, muss die Invarianten aber nicht hüten.
//
// stellen: [{ ort, typ, modus, idx, radiusKm }] — bereits auf modus≠"keine" gefiltert.
// Rückgabe: Abschnitte [{ abschnittId, stellenIdx:number[], startIdx, endIdx }].
export function schneideAbschnitte(stellen, geometry, strategie, { fensterKm = 6 } = {}) {
  const n = geometry.length
  const sortiert = [...stellen]
    .map((s, i) => ({ s, i }))
    .sort((a, b) => (a.s.idx ?? 0) - (b.s.idx ?? 0))

  // Radius jeder Stelle in Geometrie-Indizes umrechnen (grob über lokale Punktdichte).
  const kmProPunkt = n > 1 ? totalKm(geometry) / (n - 1) : 1
  const fensterPunkte = Math.max(1, Math.round(fensterKm / Math.max(kmProPunkt, 1e-6)))

  const roh = sortiert.map(({ s, i }) => {
    const idx = clampIdx(s.idx ?? Math.floor(n / 2), n)
    const spanne = s.radiusKm ? Math.round((s.radiusKm * 1.5) / Math.max(kmProPunkt, 1e-6)) : fensterPunkte
    return { stellenIdx: [i], startIdx: clampIdx(idx - spanne, n), endIdx: clampIdx(idx + spanne, n) }
  })

  let abschnitte = roh
  const fasseZusammen = strategie === "benachbart_fassen" || strategie === "groessere_fenster"
  const groesser = strategie === "groessere_fenster" || strategie === "neuberechnung_ab_gutem_punkt"

  if (groesser) {
    // Größere Fenster: Abschnittsgrenzen nach außen aufweiten.
    abschnitte = abschnitte.map((a) => ({
      ...a,
      startIdx: clampIdx(a.startIdx - fensterPunkte, n),
      endIdx: clampIdx(a.endIdx + fensterPunkte, n),
    }))
  }
  if (fasseZusammen) abschnitte = verschmelzeUeberlappende(abschnitte)

  // abschnittId ist rundenstabil über die kleinste enthaltene (originale) Stellen-
  // Position: derselbe Abschnitt trägt über alle Runden denselben Schlüssel, damit
  // die rundenübergreifende Bestenliste (Regel 15b) und die Fallback-Komposition
  // (Regel 16.1) Kandidaten verschiedener Runden demselben Abschnitt zuordnen können.
  return abschnitte.map((a) => ({ abschnittId: `S${Math.min(...a.stellenIdx)}`, ...a }))
}

/** Verschmilzt Abschnitte, deren Index-Bereiche sich berühren/überlappen. */
function verschmelzeUeberlappende(abschnitte) {
  const sortiert = [...abschnitte].sort((a, b) => a.startIdx - b.startIdx)
  const out = []
  for (const a of sortiert) {
    const letzter = out[out.length - 1]
    if (letzter && a.startIdx <= letzter.endIdx) {
      letzter.endIdx = Math.max(letzter.endIdx, a.endIdx)
      letzter.stellenIdx = [...letzter.stellenIdx, ...a.stellenIdx]
    } else {
      out.push({ ...a, stellenIdx: [...a.stellenIdx] })
    }
  }
  return out
}

const clampIdx = (i, n) => Math.max(0, Math.min(n - 1, Math.round(i)))

// ── Zusammenführung (Regel 8) ─────────────────────────────────────────────────
// Setzt die Initialstrecke aus unveränderten Teilen + den gewählten Abschnitts-
// Kandidaten zusammen und meldet Konflikte, statt sie stumm zu glätten.
//
// wahl: [{ abschnitt:{startIdx,endIdx,abschnittId}, kandidat:{geometry,eintritt,austritt} }]
// Rückgabe: { route:{geometry,distanzKm}, konflikte:[{abschnittId,art,...}] }
export function fuegeAbschnitteZusammen(initialGeometry, wahl) {
  const belegt = [...wahl].sort((a, b) => a.abschnitt.startIdx - b.abschnitt.startIdx)
  const konflikte = []
  const geometry = []
  let cursor = 0 // nächster noch nicht übernommener Index der Initialstrecke

  for (let k = 0; k < belegt.length; k++) {
    const { abschnitt, kandidat } = belegt[k]
    const vorher = belegt[k - 1]

    // Regel 8: Index-Überlappung zweier benachbarter Umfahrungen.
    if (vorher && abschnitt.startIdx < vorher.abschnitt.endIdx) {
      konflikte.push({
        abschnittId: abschnitt.abschnittId,
        art: "ueberlappung",
        mitAbschnittId: vorher.abschnitt.abschnittId,
        ueberlappungPunkte: vorher.abschnitt.endIdx - abschnitt.startIdx,
      })
    }

    // Unveränderten Teil der Initialstrecke bis zum Abschnittsanfang übernehmen.
    if (abschnitt.startIdx > cursor) {
      geometry.push(...initialGeometry.slice(cursor, abschnitt.startIdx))
    }

    // Regel 8: passt der Eintrittspunkt an den bisherigen Verlauf an?
    const letzter = geometry[geometry.length - 1]
    if (letzter && kandidat.eintritt && haversineKm(letzter, kandidat.eintritt) > UEBERGANG_SPRUNG_KM) {
      konflikte.push({
        abschnittId: abschnitt.abschnittId,
        art: "uebergang_sprung",
        seite: "eintritt",
        sprungKm: rund(haversineKm(letzter, kandidat.eintritt)),
      })
    }

    geometry.push(...kandidat.geometry)
    cursor = Math.max(cursor, abschnitt.endIdx)
  }

  if (cursor < initialGeometry.length) geometry.push(...initialGeometry.slice(cursor))

  return { route: { geometry, distanzKm: totalKm(geometry) }, konflikte }
}

// ── Lokale Reparatur (Regel 9) ────────────────────────────────────────────────
// Nur zwei deterministische Eingriffe, max 2 Versuche, KEINE neuen Sub-Agenten,
// KEIN Rundenverbrauch:
//   a) Überlappung am Übergangspunkt beschneiden
//   b) alternativen Kandidaten aus der Abschnitts-Bestenliste einsetzen
//
// bestenlisten: Map<abschnittId, SubAgentKandidat[]> (absteigend nach Güte)
// Rückgabe: { wahl, reparaturen:[{abschnitt,art,erfolgreich}], erschoepft:boolean }
export function lokaleReparatur(initialGeometry, wahlEingang, bestenlisten) {
  let wahl = wahlEingang.map((w) => ({ ...w }))
  const reparaturen = []
  let versuche = 0

  while (versuche < MAX_LOKALE_REPARATUR) {
    const { konflikte } = fuegeAbschnitteZusammen(initialGeometry, wahl)
    if (konflikte.length === 0) return { wahl, reparaturen, erschoepft: false, geloest: true }

    const k = konflikte[0]
    versuche++

    if (k.art === "ueberlappung") {
      // a) Überlappung beschneiden: den späteren Abschnitt hinter das Ende des
      //    früheren schieben, sodass die Index-Bereiche sich nicht mehr schneiden.
      const spaeter = wahl.find((w) => w.abschnitt.abschnittId === k.abschnittId)
      const frueher = wahl.find((w) => w.abschnitt.abschnittId === k.mitAbschnittId)
      if (spaeter && frueher) {
        spaeter.abschnitt = { ...spaeter.abschnitt, startIdx: frueher.abschnitt.endIdx }
        reparaturen.push({ abschnitt: k.abschnittId, art: "ueberlappung_beschnitten", erfolgreich: true })
      } else {
        reparaturen.push({ abschnitt: k.abschnittId, art: "ueberlappung_beschnitten", erfolgreich: false })
      }
    } else {
      // b) alternativen Kandidaten einsetzen.
      const ziel = wahl.find((w) => w.abschnitt.abschnittId === k.abschnittId)
      const liste = bestenlisten.get(k.abschnittId) ?? []
      const aktuellerHash = ziel?.kandidat?.hash
      const alternative = liste.find((c) => c.hash !== aktuellerHash)
      if (ziel && alternative) {
        ziel.kandidat = alternative
        reparaturen.push({ abschnitt: k.abschnittId, art: "alternativer_kandidat", erfolgreich: true })
      } else {
        reparaturen.push({ abschnitt: k.abschnittId, art: "alternativer_kandidat", erfolgreich: false })
      }
    }
  }

  // Nach erschöpften Versuchen erneut prüfen — Erfolg entscheidet der Aufrufer per
  // Validierung, hier melden wir nur, ob die Geometrie jetzt konfliktfrei ist.
  const { konflikte } = fuegeAbschnitteZusammen(initialGeometry, wahl)
  return { wahl, reparaturen, erschoepft: true, geloest: konflikte.length === 0 }
}

// ── Bewertung & Bestenlisten (Regel 15) ───────────────────────────────────────
// Gesamtkosten = Summe der (vom Sub-Agenten gelieferten!) Kandidat-Kosten + Malus
// je ungelöster Stelle. Der Orchestrator rechnet keine Wegekosten — er summiert und
// rankt nur.
export function bewerteVollstaendigeRoute({ wahl, ungeloesteAnzahl }) {
  const kosten = wahl.reduce((s, w) => s + (Number(w.kandidat?.kosten) || 0), 0)
  return kosten + ungeloesteAnzahl * MALUS_PRO_UNGELOESTE_STELLE
}

/**
 * Fügt Kandidaten in die rundenübergreifende Abschnitts-Bestenliste ein.
 * Bei Gleichstand (gleiche Kosten) gewinnt die höhere Tier (Regel 15b).
 */
export function aktualisiereBestenliste(bestenlisten, abschnittId, kandidaten) {
  const liste = bestenlisten.get(abschnittId) ?? []
  const zusammen = [...liste]
  for (const c of kandidaten) {
    if (!zusammen.some((x) => x.hash === c.hash)) zusammen.push(c)
  }
  zusammen.sort((a, b) => {
    if (a.kosten !== b.kosten) return a.kosten - b.kosten
    return tierRang(b.tier) - tierRang(a.tier) // Gleichstand → höhere Tier zuerst
  })
  bestenlisten.set(abschnittId, zusammen)
  return zusammen
}

// Höhere Tier = mehr Rechenaufwand/Qualität → höherer Rang. A<B<C.
const tierRang = (t) => ({ A: 1, B: 2, C: 3 }[t] ?? 0)

// ── Konvergenz-Hash (Regel 14) ────────────────────────────────────────────────
// Stabiler Hash über die Kandidaten-Hashes einer Runde. Zwei Runden mit gleichem
// Hash bedeuten identische Kandidaten → sofortiger Abbruch statt Budgetverbrauch.
export function rundenHash(ergebnisseProAbschnitt) {
  const teile = [...ergebnisseProAbschnitt]
    .map((e) => `${e.abschnittId}:${(e.kandidaten ?? []).map((c) => c.hash).join(",")}`)
    .sort()
  return createHash("sha1").update(teile.join("|")).digest("hex")
}

/** Kandidaten-Hash, falls ein Sub-Agent keinen mitliefert (Fallback). */
export function kandidatHash(kandidat) {
  const norm = (kandidat.geometry ?? [])
    .map((p) => `${rund(p.lat)},${rund(p.lng)}`)
    .join(";")
  return createHash("sha1").update(`${rund(kandidat.kosten ?? 0)}|${norm}`).digest("hex")
}

// ── Tier-Verteilung (Rückgabe) ────────────────────────────────────────────────
export function tierVerteilung(wahl) {
  const v = { A_km: 0, B_km: 0, C_km: 0 }
  for (const w of wahl) {
    const km = Number(w.kandidat?.distanzKm) || 0
    const key = `${w.kandidat?.tier}_km`
    if (key in v) v[key] += km
  }
  v.A_km = rund(v.A_km)
  v.B_km = rund(v.B_km)
  v.C_km = rund(v.C_km)
  return v
}
