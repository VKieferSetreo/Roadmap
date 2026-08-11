// Lauffähige Referenz-Ports für den Roadmap-Orchestrator.
//
// Zweck: (1) der Orchestrator-Loop ist damit ohne echtes OSRM/DB/LLM vollständig
// lauffähig und testbar; (2) sie dokumentieren die Verträge als Code. Die echten
// Adapter (routingAdapter über resolveRoute/umfahreZonen, ein Anthropic-/Ollama-LLM,
// der Validierungslayer als eigene Instanz) ersetzen diese Stubs 1:1.

import { haversineKm, totalKm } from "../engine/geometry.js"
import { SUB_AGENT_ANLAEUFE } from "./contracts.js"

/** Routing-Port aus einem festen Initialstrecken-Ergebnis (für Tests/Dev). */
export function stubRouting(init) {
  return {
    async initialRoute() {
      return {
        geometry: init.geometry ?? [],
        distanzKm: init.distanzKm ?? totalKm(init.geometry ?? []),
        kritischeStellen: init.kritischeStellen ?? [],
        harteSperreVorhanden: !!init.harteSperreVorhanden,
        durchgehend: init.durchgehend,
        sperrstelle: init.sperrstelle,
        provider: init.provider ?? { router: "stub" },
      }
    },
  }
}

/**
 * Sub-Agent-Port. Ohne `fn` löst er jede Stelle mit einem deterministischen
 * Nord-Bogen um den Abschnitt (kosten = Abschnittslänge). Mit `fn(auftrag)` steuern
 * Tests gezielt Szenarien (Ablehnung, Nicht-Lösung, Konvergenz).
 */
export function stubSubAgent(fn) {
  return {
    async bearbeite(auftrag) {
      if (typeof fn === "function") return fn(auftrag)
      return { abschnittId: auftrag.abschnittId, geloest: true, kandidaten: [bogenKandidat(auftrag)] }
    },
  }
}

/** Deterministischer Umfahrungs-Kandidat: Abschnitt leicht nach Norden gebogen. */
export function bogenKandidat(auftrag, { hoeheKm = 3, tier } = {}) {
  const a = auftrag.abschnitt
  if (!a || a.length < 2) {
    return { geometry: a ?? [], eintritt: a?.[0], austritt: a?.at(-1), kosten: 0, distanzKm: 0, tier: tier ?? auftrag.rundenParameter.tiers.at(-1), hash: `leer:${auftrag.abschnittId}` }
  }
  const mitte = (a.length - 1) / 2
  const geometry = a.map((p, i) => ({
    lat: p.lat + (hoeheKm * Math.max(0, 1 - Math.abs(i - mitte) / mitte)) / 110.6,
    lng: p.lng,
  }))
  const distanzKm = totalKm(geometry)
  return {
    geometry,
    eintritt: a[0],
    austritt: a.at(-1),
    kosten: distanzKm, // "kommt fertig vom Sub-Agenten" — hier: Länge als Proxy
    distanzKm,
    tier: tier ?? auftrag.rundenParameter.tiers.at(-1),
    hash: `bogen:${auftrag.abschnittId}:${auftrag.rundenParameter.runde}:${hoeheKm}`,
  }
}

/**
 * Validierungslayer-Port. Ohne `fn` gibt er immer frei. Bei Ablehnung kann `fn`
 * `beanstandeteAbschnitte:[abschnittId]` mitgeben (Regel 24); ohne Angabe gelten
 * alle Abschnitte der Komposition als beanstandet.
 */
export function stubValidator(fn) {
  return {
    async pruefe(eingang) {
      if (typeof fn === "function") return fn(eingang)
      return { freigabe: true }
    },
  }
}

/** Optionaler LLM-Zuschnitt-Port (synchron, damit Tests ihn ohne await steuern). */
export function stubLlm(entscheideZuschnittSync) {
  return { entscheideZuschnitt: true, entscheideZuschnittSync }
}

export { haversineKm }
