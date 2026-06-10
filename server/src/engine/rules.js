// Regelwerk: bewertet ein Hindernis gegen die Transport-Stammdaten + Zeitraum.
// evaluate() → { severity, titel, beschreibung, detail } | null (nicht relevant).
// Detail-Werte in deutscher Zahlformatierung (Komma, − für negative Werte).

export const KATEGORIEN = [
  "bruecke", "engstelle", "baustelle", "gewicht", "bahnuebergang",
  "kreisverkehr", "ampel", "steigung", "tunnel",
]

const DEFAULT_TITEL = {
  bruecke: "Brückendurchfahrt",
  tunnel: "Tunnel",
  engstelle: "Fahrbahnengstelle",
  gewicht: "Gewichtsbeschränkung",
  kreisverkehr: "Kreisverkehr",
  baustelle: "Baustelle",
  bahnuebergang: "Bahnübergang",
  steigung: "Starke Steigung",
  ampel: "Signalanlage",
}

// ── deutsche Zahlformatierung ─────────────────────────────────────────────────

export function fmtKomma(n, decimals = 2) {
  const s = Math.abs(n).toFixed(decimals).replace(".", ",")
  return (n < 0 ? "−" : "") + s
}
export const fmtM = (n) => `${fmtKomma(n, 2)} m`
export const fmtT = (n) => `${fmtKomma(n, 1)} t`
export const fmtPct = (n) => `${fmtKomma(n, 1)} %`

// ── Helfer ────────────────────────────────────────────────────────────────────

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null)

/** auf 2 Nachkommastellen runden — entschärft Float-Artefakte an Grenzwerten. */
const round2 = (n) => Math.round(n * 100) / 100

/** ISO-Datum-Anteil (YYYY-MM-DD) für lexikographischen Vergleich. */
const dateOnly = (v) => (v ? String(v).slice(0, 10) : null)

/** Überlappt die Gültigkeit des Hindernisses den Transport-Zeitraum? */
function overlapsZeitraum(obstacle, zeitraum) {
  const zVon = dateOnly(zeitraum?.von)
  const zBis = dateOnly(zeitraum?.bis)
  if (!zVon && !zBis) return false // kein Zeitraum geplant → keine Überlappung feststellbar
  const oVon = dateOnly(obstacle.gueltigVon) ?? "0000-01-01"
  const oBis = dateOnly(obstacle.gueltigBis) ?? "9999-12-31"
  return oVon <= (zBis ?? "9999-12-31") && (zVon ?? "0000-01-01") <= oBis
}

const sev3 = (kritisch, warnung) => (kritisch ? "kritisch" : warnung ? "warnung" : "hinweis")

// ── Kategorie-Regeln ──────────────────────────────────────────────────────────

function ruleHoehe(art, attrs, transport) {
  const maxH = num(attrs.maxHoeheM)
  if (maxH == null) {
    return {
      severity: "hinweis",
      beschreibung: `${art} ohne hinterlegte Durchfahrtshöhe — vor Ort prüfen.`,
      detail: { Transporthöhe: fmtM(transport.hoehe) },
    }
  }
  const spielraum = round2(maxH - transport.hoehe)
  return {
    severity: sev3(spielraum < 0.10, spielraum < 0.50),
    beschreibung:
      spielraum < 0.10
        ? `Durchfahrtshöhe reicht für den Transport nicht aus — ${art} umfahren oder Höhe reduzieren.`
        : `Begrenzte Durchfahrtshöhe — Spielraum knapp, Durchfahrt prüfen.`,
    detail: {
      Durchfahrtshöhe: fmtM(maxH),
      Transporthöhe: fmtM(transport.hoehe),
      Spielraum: fmtM(spielraum),
    },
  }
}

function ruleEngstelle(attrs, transport) {
  const maxB = num(attrs.maxBreiteM)
  if (maxB == null) {
    return {
      severity: "hinweis",
      beschreibung: "Engstelle ohne hinterlegte Restbreite — vor Ort prüfen.",
      detail: { Transportbreite: fmtM(transport.breite) },
    }
  }
  const marge = round2(maxB - transport.breite)
  return {
    severity: sev3(marge < 0.10, marge < 0.50),
    beschreibung: "Fahrbahn verengt sich — Restbreite gegen Transportbreite prüfen.",
    detail: {
      Fahrbahnbreite: fmtM(maxB),
      Transportbreite: fmtM(transport.breite),
      Marge: fmtM(marge),
    },
  }
}

/** Konservatives Prüfgewicht: bei inkonsistenten Stammdaten (Ladungsgewicht größer als
 *  angegebenes Gesamtgewicht) wird mit dem größeren Wert gerechnet — lieber zu streng
 *  warnen als eine Traglast-Überschreitung wegen Eingabefehlern zu übersehen. */
function pruefgewicht(transport) {
  const ladung = num(transport.ladungsgewicht)
  if (ladung != null && ladung > transport.gesamtgewicht) return ladung
  return transport.gesamtgewicht
}

function ruleGewicht(attrs, transport) {
  const maxG = num(attrs.maxGewichtT)
  const maxAchs = num(attrs.maxAchslastT)
  const pg = pruefgewicht(transport)
  if (maxG == null && maxAchs == null) {
    return {
      severity: "hinweis",
      beschreibung: "Gewichtsbeschränkung ohne hinterlegte Traglast — Bescheid prüfen.",
      detail: { Gesamtgewicht: fmtT(transport.gesamtgewicht) },
    }
  }
  let severity = "hinweis"
  const detail = {}
  if (maxG != null) {
    const rest = round2(maxG - pg)
    severity = sev3(rest < 0, rest < 10)
    detail["Zul. Gesamtlast"] = fmtT(maxG)
    detail["Gesamtgewicht"] = fmtT(transport.gesamtgewicht)
    if (pg !== transport.gesamtgewicht) detail["Prüfgewicht (Ladung)"] = fmtT(pg)
    detail["Reserve"] = fmtT(rest)
  }
  if (maxAchs != null) {
    detail["Zul. Achslast"] = fmtT(maxAchs)
    detail["Achslast"] = fmtT(transport.achslast)
    if (round2(maxAchs - transport.achslast) < 0) severity = "kritisch"
  }
  return {
    severity,
    beschreibung:
      severity === "kritisch"
        ? "Zulässige Last überschritten — Ausnahmegenehmigung/Lastverteilungsnachweis erforderlich."
        : "Zulässige Brücken-/Streckenlast prüfen, ggf. Lastverteilung nachweisen.",
    detail,
  }
}

function ruleSteigung(attrs, transport) {
  const pct = num(attrs.steigungPct)
  const pg = pruefgewicht(transport)
  if (pct == null) {
    return {
      severity: "hinweis",
      beschreibung: "Längsneigung ohne hinterlegten Wert — Anfahrvermögen berücksichtigen.",
      detail: { Gesamtgewicht: fmtT(transport.gesamtgewicht) },
    }
  }
  let severity = "hinweis"
  if (pct >= 8) severity = pg > 60 ? "kritisch" : "warnung"
  else if (pct >= 5) severity = pg > 100 ? "warnung" : "hinweis"
  const detail = { Längsneigung: fmtPct(pct), Gesamtgewicht: fmtT(transport.gesamtgewicht) }
  if (pg !== transport.gesamtgewicht) detail["Prüfgewicht (Ladung)"] = fmtT(pg)
  return {
    severity,
    beschreibung: "Längsneigung — Anfahrvermögen und Bremsweg berücksichtigen.",
    detail,
  }
}

function ruleKreisverkehr(attrs, transport) {
  const r = num(attrs.radiusM)
  if (r == null) {
    return {
      severity: "hinweis",
      beschreibung: "Kreisverkehr ohne hinterlegten Radius — Schleppkurve prüfen.",
      detail: { Fahrzeuglänge: fmtM(transport.laenge) },
    }
  }
  return {
    severity: sev3(transport.laenge > 2.2 * r, transport.laenge > 1.6 * r),
    beschreibung: "Schleppkurve im Kreisverkehr — Befahrbarkeit für die Fahrzeuglänge prüfen.",
    detail: { Außenradius: `${fmtKomma(r, 0)} m`, Fahrzeuglänge: fmtM(transport.laenge) },
  }
}

function ruleBaustelle(attrs, transport, obstacle, zeitraum) {
  const rb = num(attrs.restbreiteM)
  const overlap = overlapsZeitraum(obstacle, zeitraum)
  let severity = "hinweis"
  if (rb != null && rb < transport.breite + 0.1) severity = "kritisch"
  else if (overlap) severity = "warnung"
  const detail = {
    ...(rb != null && { Restbreite: fmtM(rb), Transportbreite: fmtM(transport.breite) }),
    Zeitraum: overlap ? "überschneidet Transport-Zeitraum" : "außerhalb des Transport-Zeitraums",
  }
  return {
    severity,
    beschreibung:
      severity === "kritisch"
        ? "Baustellen-Restbreite reicht für den Transport nicht aus — Durchfahrt abstimmen oder umfahren."
        : "Aktive Baustelle mit Spurverengung — Durchfahrt zeitlich abstimmen.",
    detail,
  }
}

function ruleBahnuebergang(attrs, transport) {
  const maxH = num(attrs.maxHoeheM)
  const kritisch = maxH != null && transport.hoehe > maxH
  return {
    severity: kritisch ? "kritisch" : "hinweis",
    beschreibung: kritisch
      ? "Transporthöhe überschreitet die Oberleitungshöhe — Querung nicht möglich ohne Abschaltung."
      : "Höhengleicher Bahnübergang — Bodenfreiheit und Wartezeit beachten.",
    detail: {
      ...(maxH != null && { Oberleitungshöhe: fmtM(maxH), Transporthöhe: fmtM(transport.hoehe) }),
      Hinweis: "Anmeldung DB Netz erforderlich",
    },
  }
}

function ruleAmpel(attrs, transport) {
  const maxH = num(attrs.maxHoeheM)
  const warn = maxH != null && transport.hoehe > maxH
  return {
    severity: warn ? "warnung" : "hinweis",
    beschreibung: warn
      ? "Transporthöhe über Signalausleger — Anlage ggf. schwenken/demontieren lassen."
      : "Lichtsignalanlage — Durchfahrt mit Begleitung abstimmen.",
    detail: {
      ...(maxH != null && { Auslegerhöhe: fmtM(maxH), Transporthöhe: fmtM(transport.hoehe) }),
    },
  }
}

// ── Haupteinstieg ─────────────────────────────────────────────────────────────

/**
 * Bewertet ein Hindernis (camelCase-Obstacle) gegen Transport + Zeitraum.
 * null → Hindernis ist für diesen Transport nicht relevant (z.B. abgelaufen).
 */
export function evaluate(obstacle, transport, zeitraum = {}) {
  // Abgelaufen: Gültigkeit endet vor Beginn des Transport-Zeitraums
  const bis = dateOnly(obstacle.gueltigBis)
  const von = dateOnly(zeitraum?.von)
  if (bis && von && bis < von) return null

  const attrs = obstacle.attrs ?? {}
  let result
  switch (obstacle.kategorie) {
    case "bruecke":
      result = ruleHoehe("Brücke", attrs, transport)
      break
    case "tunnel":
      result = ruleHoehe("Tunnel", attrs, transport)
      break
    case "engstelle":
      result = ruleEngstelle(attrs, transport)
      break
    case "gewicht":
      result = ruleGewicht(attrs, transport)
      break
    case "steigung":
      result = ruleSteigung(attrs, transport)
      break
    case "kreisverkehr":
      result = ruleKreisverkehr(attrs, transport)
      break
    case "baustelle":
      result = ruleBaustelle(attrs, transport, obstacle, zeitraum)
      break
    case "bahnuebergang":
      result = ruleBahnuebergang(attrs, transport)
      break
    case "ampel":
      result = ruleAmpel(attrs, transport)
      break
    default:
      return null
  }
  return {
    ...result,
    titel: obstacle.name || DEFAULT_TITEL[obstacle.kategorie],
  }
}
