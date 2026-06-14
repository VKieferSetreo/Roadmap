// Regelwerk: bewertet ein Hindernis gegen die Transport-Stammdaten + Zeitraum.
// evaluate() → { severity, titel, beschreibung, detail } | null (nicht relevant).
// Detail-Werte in deutscher Zahlformatierung (Komma, − für negative Werte).

export const KATEGORIEN = [
  "bruecke", "engstelle", "baustelle", "sperrung", "gewicht", "bahnuebergang",
  "kreisverkehr", "ampel", "steigung", "tunnel",
  // "sonstige": permanente Infrastruktur ohne GST-Routen-Relevanz (z.B. Stützmauern, Lärmschutz).
  // Wird gespeichert (nichts droppen) + auf der DB-Karte gezeigt, erzeugt aber keinen Routen-Fund
  // (evaluate() default → null). NICHT in EVENT_KATEGORIEN.
  "sonstige",
]

// Gemeldete Ereignisse (temporär, werden aktiv gemeldet) — immer als Fund anzeigen,
// auch ohne hinterlegte Maße. Alle anderen Kategorien sind permanente Infrastruktur,
// die nur bei einer echten Abweichung (warnung/kritisch) angezeigt wird.
const EVENT_KATEGORIEN = new Set(["baustelle", "sperrung"])

// Bauwerke (Brücke/Tunnel/sonstige Bauwerke) werden vom Strecken-Engineering separat bewertet
// (Durchfahrtshöhe/Tragfähigkeit) → NICHT in der Karten-Auswertung als Fund zeigen. Sie bleiben als
// Daten in der DB/Karte erhalten, erzeugen aber keinen Routen-Fund. Fokus der Auswertung: gemeldete
// Ereignisse (Baustellen/Sperrungen) + dynamische Restriktionen. Leicht umkehrbar (Liste anpassen).
export const AUSWERTUNG_AUSGESCHLOSSEN = ["bruecke", "tunnel", "sonstige"]

const DEFAULT_TITEL = {
  bruecke: "Brückendurchfahrt",
  tunnel: "Tunnel",
  engstelle: "Fahrbahnengstelle",
  gewicht: "Gewichtsbeschränkung",
  kreisverkehr: "Kreisverkehr",
  baustelle: "Baustelle",
  sperrung: "Sperrung",
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
  const oVon = dateOnly(obstacle.gueltigVon) ?? dateOnly(obstacle.realerStart) ?? "0000-01-01"
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

/** Höchste Achslast aus dem v2-Array (achslasten: number[]) — null wenn leer/fehlt. */
function maxAchslast(transport) {
  const lasten = Array.isArray(transport.achslasten)
    ? transport.achslasten.filter((v) => typeof v === "number" && Number.isFinite(v))
    : []
  return lasten.length ? Math.max(...lasten) : null
}

function ruleGewicht(attrs, transport) {
  const maxG = num(attrs.maxGewichtT)
  const maxAchs = num(attrs.maxAchslastT)
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
    const rest = round2(maxG - transport.gesamtgewicht)
    severity = sev3(rest < 0, rest < 10)
    detail["Zul. Gesamtlast"] = fmtT(maxG)
    detail["Gesamtgewicht"] = fmtT(transport.gesamtgewicht)
    detail["Reserve"] = fmtT(rest)
  }
  if (maxAchs != null) {
    const achslast = maxAchslast(transport)
    detail["Zul. Achslast"] = fmtT(maxAchs)
    if (achslast != null) {
      detail["Achslast"] = fmtT(achslast)
      if (round2(maxAchs - achslast) < 0) severity = "kritisch"
    }
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
  const gewicht = transport.gesamtgewicht
  if (pct == null) {
    return {
      severity: "hinweis",
      beschreibung: "Längsneigung ohne hinterlegten Wert — Anfahrvermögen berücksichtigen.",
      detail: { Gesamtgewicht: fmtT(gewicht) },
    }
  }
  let severity = "hinweis"
  if (pct >= 8) severity = gewicht > 60 ? "kritisch" : "warnung"
  else if (pct >= 5) severity = gewicht > 100 ? "warnung" : "hinweis"
  return {
    severity,
    beschreibung: "Längsneigung — Anfahrvermögen und Bremsweg berücksichtigen.",
    detail: { Längsneigung: fmtPct(pct), Gesamtgewicht: fmtT(gewicht) },
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

// Prinzip (Max 2026-06-14): ALLE Baustellen auf der Strecke werden als Fund angezeigt
// (nie ausgeblendet). ROT (kritisch) nur, wenn die HINTERLEGTEN Daten eine Restriktion
// wirklich verletzen (Restbreite < Transportbreite oder Höhenbegrenzung < Transporthöhe).
// Ohne Verletzung: Warnung (aktiv im Zeitraum, zur Relevanz-Prüfung) bzw. Hinweis
// (außerhalb des Zeitraums). So sieht der Sachbearbeiter alles und entscheidet selbst.
function ruleBaustelle(attrs, transport, obstacle, zeitraum) {
  const rb = num(attrs.restbreiteM)
  const mh = num(attrs.maxHoeheM)
  const overlap = overlapsZeitraum(obstacle, zeitraum)
  const detail = {
    ...(rb != null && { Restbreite: fmtM(rb), Transportbreite: fmtM(transport.breite) }),
    ...(mh != null && { Höhenbegrenzung: fmtM(mh), Transporthöhe: fmtM(transport.hoehe) }),
    Zeitraum: overlap ? "überschneidet Transport-Zeitraum" : "außerhalb des Transport-Zeitraums",
  }

  const breiteVerletzt = rb != null && rb < transport.breite + 0.1
  const hoeheVerletzt = mh != null && mh < transport.hoehe

  let severity
  let beschreibung
  if (breiteVerletzt || hoeheVerletzt) {
    severity = "kritisch"
    beschreibung = breiteVerletzt && hoeheVerletzt
      ? "Baustelle verletzt Restbreite UND Durchfahrtshöhe — Durchfahrt nicht möglich, umfahren."
      : breiteVerletzt
        ? "Baustellen-Restbreite reicht für den Transport nicht aus — Durchfahrt abstimmen oder umfahren."
        : "Baustellen-Höhenbegrenzung reicht für den Transport nicht aus — Durchfahrt abstimmen oder umfahren."
  } else if (overlap) {
    // Auf der Strecke, im Zeitraum aktiv, aber keine hinterlegte Restriktion verletzt
    // (oder keine Maße bekannt) → anzeigen zur Prüfung, NICHT automatisch rot.
    severity = "warnung"
    beschreibung = rb == null && mh == null
      ? "Aktive Baustelle auf der Strecke — keine Maße hinterlegt, Relevanz vor Ort prüfen."
      : "Aktive Baustelle auf der Strecke — hinterlegte Maße reichen aus, Durchfahrt zeitlich abstimmen."
  } else {
    severity = "hinweis"
    beschreibung = "Baustelle auf der Strecke — aktuell außerhalb des Transport-Zeitraums."
  }
  return { severity, beschreibung, detail }
}

function ruleSperrung(attrs, transport, obstacle, zeitraum) {
  const overlap = overlapsZeitraum(obstacle, zeitraum)
  const rb = num(attrs.restbreiteM)
  const maxG = num(attrs.maxGewichtT)
  // Vollsperrung im Zeitraum = kritisch; sonst Gewichts-/Restbreite prüfen, sonst Hinweis.
  let severity = "hinweis"
  if (attrs.vollsperrung === true && overlap) severity = "kritisch"
  else if (rb != null && rb < transport.breite + 0.1) severity = "kritisch"
  else if (maxG != null && maxG < transport.gesamtgewicht) severity = "kritisch"
  else if (overlap) severity = "warnung"
  return {
    severity,
    beschreibung:
      severity === "kritisch"
        ? "Strecke gesperrt bzw. für den Transport nicht passierbar — Umfahrung erforderlich."
        : "Sperrung/Umleitung auf der Strecke — Durchfahrt bzw. Umleitungsführung prüfen.",
    detail: {
      ...(rb != null && { Restbreite: fmtM(rb) }),
      ...(maxG != null && { "Zul. Gesamtlast": fmtT(maxG) }),
      Zeitraum: overlap ? "überschneidet Transport-Zeitraum" : "außerhalb des Transport-Zeitraums",
    },
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
  // Noch nicht wirksam: greift erst ab gueltigVon (Fallback realerStart) —
  // liegt das NACH dem Ende des Transport-Zeitraums, ist es nicht relevant.
  const wirksamAb = dateOnly(obstacle.gueltigVon) ?? dateOnly(obstacle.realerStart)
  const zEnde = dateOnly(zeitraum?.bis)
  if (wirksamAb && zEnde && wirksamAb > zEnde) return null

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
    case "sperrung":
      result = ruleSperrung(attrs, transport, obstacle, zeitraum)
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
  // Infrastruktur (Brücke/Tunnel/Engstelle/Gewicht/Steigung/Kreisverkehr/Bahnübergang/
  // Ampel): nur ECHTE Abweichungen von der Norm zeigen. Reine "Hinweis"-Funde ohne
  // hinterlegten Grenzwert (z.B. „Brücke ohne hinterlegte Durchfahrtshöhe") sind
  // normale Bauwerksdaten ohne Abweichung → ausblenden. Gemeldete Ereignisse
  // (Baustellen/Sperrungen) bleiben dagegen IMMER sichtbar (Max-Wunsch).
  if (result.severity === "hinweis" && !EVENT_KATEGORIEN.has(obstacle.kategorie)) {
    return null
  }
  return {
    ...result,
    titel: obstacle.name || DEFAULT_TITEL[obstacle.kategorie],
  }
}
