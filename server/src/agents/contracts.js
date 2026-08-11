// Verträge und Konstanten des Roadmap-Orchestrators.
//
// Warum diese Datei getrennt liegt: der Orchestrator ist eine LLM-Instanz, die den
// GESAMTEN Planungszustand hält, aber ihre harten Invarianten (max 5 Runden, die
// Runden-Tabelle, das Verbot hart→weich zu degradieren, die Fallback-Reihenfolge)
// dürfen NICHT im Ermessen des Modells liegen. Sie stehen hier als Code-Wahrheit,
// gegen die getestet wird. Der Prompt (prompts/roadmap-orchestrator.md) beschreibt
// dieselben Regeln in Prosa fürs Modell; diese Datei erzwingt sie.
//
// Schnittstellen zu Nachbar-Instanzen (Main-Orchestrator, Sub-Agent, Validierungs-
// layer) sind bewusst als reine Datenverträge (JSDoc-typedefs) gehalten, damit die
// parallel entstehenden Instanzen passgenau andocken können, ohne sich Code zu teilen.

/* eslint-disable no-unused-vars */

// ── Umfahrungsmodus ──────────────────────────────────────────────────────────
// Pro kritischer Stelle. "keine" heißt: Stelle nur warnen, nicht umfahren.
// "hart"/"weich" siehe Verbote — "hart" darf NIE automatisch zu "weich" werden.
export const MODI = Object.freeze(["keine", "weich", "hart"])

// ── Ergebnis-Status (Rückgabe an den Main-Orchestrator) ──────────────────────
export const STATUS = Object.freeze({
  VOLLSTAENDIG: "vollstaendig_geloest",
  TEILERGEBNIS: "teilergebnis",
  INITIAL: "initialstrecke",
  NICHT_BEFAHRBAR: "nicht_befahrbar",
})

export const ABBRUCH = Object.freeze({
  GELOEST: "geloest",
  BUDGET: "budget",
  KONVERGENZ: "konvergenz",
})

// ── Straßenklassen-Modus für den Zeitdeckel-Vergleich der Sub-Agenten ────────
export const STRASSENKLASSE = Object.freeze({ HART: "hart", WEICH: "weich" })

// ── Die Runden-Tabelle (Regel 12/13) ─────────────────────────────────────────
// Jede Runde MUSS mindestens einen Freiheitsgrad gegenüber der vorigen verändern —
// diese Tabelle garantiert das strukturell. `weichMinProKm` ist nur bei
// Straßenklasse "weich" gesetzt (2.0 min/km Aufschlag laut Spec, Runde 3+).
//
// `tiers`      = welche Sub-Agenten-Tiers die Runde spawnen darf (Rechen-/Qualitätsstufe).
// `zeitdeckelMin` = harte Obergrenze der Sub-Agenten-Zeit, die der Orchestrator mitgibt.
// `zuschnitt`  = Strategie, wie kritische Stellen zu Abschnitten geschnitten werden.
// `meideAufschlagFaktor` = Skalierung des Meidezonen-Radius-Aufschlags (Runde 4 halbiert).
export const RUNDEN_TABELLE = Object.freeze([
  { runde: 1, tiers: ["A"],           zeitdeckelMin: 15, strassenklasse: "hart",  weichMinProKm: null, zuschnitt: "je_stelle",        meideAufschlagFaktor: 1 },
  { runde: 2, tiers: ["A", "B"],      zeitdeckelMin: 30, strassenklasse: "hart",  weichMinProKm: null, zuschnitt: "unveraendert",     meideAufschlagFaktor: 1 },
  { runde: 3, tiers: ["A", "B", "C"], zeitdeckelMin: 45, strassenklasse: "weich", weichMinProKm: 2.0,  zuschnitt: "benachbart_fassen", meideAufschlagFaktor: 1 },
  // "alle" (Runde 4/5) = A+B+C. Es gibt bewusst kein Tier D: die Rückgabe
  // tier_verteilung kennt nur A_km/B_km/C_km, und "alle" meint alle drei Tiers.
  { runde: 4, tiers: ["A", "B", "C"], zeitdeckelMin: 45, strassenklasse: "weich", weichMinProKm: 2.0, zuschnitt: "groessere_fenster",           meideAufschlagFaktor: 0.5 },
  { runde: 5, tiers: ["A", "B", "C"], zeitdeckelMin: 45, strassenklasse: "weich", weichMinProKm: 2.0, zuschnitt: "neuberechnung_ab_gutem_punkt", meideAufschlagFaktor: 0.5 },
])

export const MAX_RUNDEN = RUNDEN_TABELLE.length // 5
export const MAX_LOKALE_REPARATUR = 2 // Regel 9
export const SUB_AGENT_ANLAEUFE = 3 // Anläufe je Sub-Agent, konsistent zu umfahreZonen

// Malus je ungelöster Stelle bei der Bestenlisten-Bewertung (Regel 15a). Das ist
// eine RANKING-Größe des Orchestrators (womit vergleiche ich zwei vollständige
// Routen), KEINE Wegekostenrechnung — die kommt fertig vom Sub-Agenten (Verbot).
// Bewusst groß, damit "eine Stelle mehr gelöst" fast immer schwerer wiegt als ein
// moderater Umweg.
export const MALUS_PRO_UNGELOESTE_STELLE = 100_000

// ── Datenverträge (nur zur Doku; JS prüft zur Laufzeit über validiereEingang) ─

/**
 * @typedef {Object} LatLng
 * @property {number} lat
 * @property {number} lng
 */

/**
 * Eingang vom Main-Orchestrator (Regel: Eingang).
 * @typedef {Object} PlanAuftrag
 * @property {LatLng|string} start
 * @property {LatLng|string} ziel
 * @property {Object} fahrzeugprofil       roh weitergereicht an Sub-Agenten
 * @property {Object} [restriktionen]      Höhe/Gewicht/Breite etc.
 * @property {Object} [zeitfenster]        Lenkzeit-/Nachtfahrverbot-Kontext für die Validierung
 * @property {"keine"|"weich"|"hart"} [umfahrungsmodusGlobal]  Default-Modus, wenn eine Stelle keinen eigenen trägt
 */

/**
 * Eine auf der Initialstrecke erkannte kritische Stelle.
 * @typedef {Object} KritischeStelle
 * @property {LatLng} ort
 * @property {string} typ                  "baustelle"|"sperrung"|"hoehe"|"gewicht"|"engstelle"|"sperrzone"|…
 * @property {"keine"|"weich"|"hart"} modus geltender Umfahrungsmodus DIESER Stelle
 * @property {number} [idx]                Index auf der Initialstrecken-Geometrie
 * @property {number} [radiusKm]           für Meidezonen
 * @property {string} [grund]              Klartext für die Warnliste
 */

/**
 * Was die Routing-Instanz (Adapter über die bestehende Engine) liefert.
 * @typedef {Object} InitialStreckenErgebnis
 * @property {LatLng[]} geometry
 * @property {number} distanzKm
 * @property {KritischeStelle[]} kritischeStellen
 * @property {boolean} harteSperreVorhanden  true, wenn mind. eine HARTE Sperre physisch auf der Route liegt
 * @property {Object} [provider]
 */

/**
 * Auftrag an EINEN Sub-Agenten (Regel 5). Enthält NIE die Gesamtstrecke oder die
 * Ergebnisse anderer Sub-Agenten (Verbot).
 * @typedef {Object} SubAgentAuftrag
 * @property {string} abschnittId
 * @property {LatLng[]} abschnitt          nur der zugeschnittene Streckenteil
 * @property {KritischeStelle[]} stellen   die kritischen Stellen dieses Abschnitts
 * @property {"keine"|"weich"|"hart"} modus geltender Umfahrungsmodus
 * @property {Object} rundenParameter      { runde, tiers, zeitdeckelMin, strassenklasse, weichMinProKm, meideAufschlagFaktor }
 * @property {Object} kontext              fahrzeugprofil/restriktionen (ohne Gesamtstrecke!)
 * @property {Object|null} ablehnungskontext  ab Runde 2: warum die Vorrunde hier scheiterte
 */

/**
 * Ergebnis eines Sub-Agenten. Der Orchestrator RECHNET KEINE Kosten — `kosten`
 * kommt fertig vom Sub-Agenten (Verbot).
 * @typedef {Object} SubAgentErgebnis
 * @property {string} abschnittId
 * @property {SubAgentKandidat[]} kandidaten  absteigend nach Güte; [0] ist der Vorschlag
 * @property {boolean} geloest             konnte die/den Stelle(n) umfahren?
 * @property {string} [grund]              wenn nicht gelöst: warum
 */

/**
 * @typedef {Object} SubAgentKandidat
 * @property {LatLng[]} geometry           Ersatz-Geometrie für den Abschnitt
 * @property {LatLng} eintritt             Übergangspunkt am Abschnittsanfang
 * @property {LatLng} austritt             Übergangspunkt am Abschnittsende
 * @property {number} kosten               Gesamtkosten dieses Kandidaten (vom Sub-Agenten gerechnet)
 * @property {number} distanzKm
 * @property {"A"|"B"|"C"|"D"} tier        welches Tier diesen Kandidaten erzeugt hat
 * @property {string} hash                 stabiler Kandidaten-Hash (für Konvergenz-Abbruch)
 */

/**
 * Urteil des Validierungslayers (Regel 6/7). Der Orchestrator darf es weder
 * überstimmen noch umgehen.
 * @typedef {Object} ValidierungsUrteil
 * @property {boolean} freigabe
 * @property {string} [grund]
 * @property {Object[]} [befunde]          z.B. Lenkzeit-Verletzung, Übergangs-Sprung
 */

/**
 * Rückgabe an den Main-Orchestrator (Regel: Rückgabe).
 * @typedef {Object} OrchestratorErgebnis
 * @property {Object} route
 * @property {"vollstaendig_geloest"|"teilergebnis"|"initialstrecke"|"nicht_befahrbar"} status
 * @property {Array<{ort:LatLng,typ:string,grund_des_scheiterns:string,modus:string}>} ungeloeste_stellen
 * @property {number} verbrauchte_runden
 * @property {"geloest"|"budget"|"konvergenz"} abbruchgrund
 * @property {Array<{abschnitt:string,art:string,erfolgreich:boolean}>} reparaturen
 * @property {{A_km:number,B_km:number,C_km:number}} tier_verteilung
 */

// ── Eingangsvalidierung ───────────────────────────────────────────────────────

const istKoordinate = (p) =>
  p && Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lng))

/** Wirft mit klarer Meldung, wenn der Eingang unbrauchbar ist. */
export function validiereEingang(auftrag) {
  if (!auftrag || typeof auftrag !== "object") {
    throw new Error("Roadmap-Orchestrator: Auftrag fehlt")
  }
  const hatOrt = (v) => (typeof v === "string" && v.trim()) || istKoordinate(v)
  if (!hatOrt(auftrag.start)) throw new Error("Roadmap-Orchestrator: Start fehlt oder ungültig")
  if (!hatOrt(auftrag.ziel)) throw new Error("Roadmap-Orchestrator: Ziel fehlt oder ungültig")
  const modus = auftrag.umfahrungsmodusGlobal
  if (modus != null && !MODI.includes(modus)) {
    throw new Error(`Roadmap-Orchestrator: unbekannter Umfahrungsmodus "${modus}"`)
  }
  return true
}

/** Modus einer Stelle bestimmen: Stellen-Modus vor globalem Default, sonst "keine". */
export function modusVon(stelle, auftrag) {
  if (stelle && MODI.includes(stelle.modus)) return stelle.modus
  if (auftrag && MODI.includes(auftrag.umfahrungsmodusGlobal)) return auftrag.umfahrungsmodusGlobal
  return "keine"
}
