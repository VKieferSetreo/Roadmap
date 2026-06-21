// Regelwerk: bewertet ein Hindernis gegen die Transport-Stammdaten + Zeitraum.
// evaluate() → { severity, titel, beschreibung, detail } | null (nicht relevant).
// Detail-Werte in deutscher Zahlformatierung (Komma, − für negative Werte).
// Stil-Vorgabe (Max 2026-06-14): in den von UNS generierten Texten KEINE Binde-/
// Gedankenstriche — vollständige Sätze mit Punkt statt „ — ".

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

// Brücke + Tunnel SIND wieder Teil der Auswertung (ruleBauwerk: Durchfahrtshöhe +
// Tragfähigkeit + grundsätzliche GST-Sperre). Funde ohne hinterlegte Werte bleiben "hinweis"
// und werden von evaluate() ausgeblendet (kein Flut an „Brücke ohne Höhe"). Nur "sonstige"
// (Stützmauern, Lärmschutz …) bleibt ausgeschlossen — keine GST-Relevanz (evaluate() → null).
export const AUSWERTUNG_AUSGESCHLOSSEN = ["sonstige"]

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
  // T-267: kein Transport-Zeitraum geplant → "gilt immer". Ein Hindernis ohne erkennbares
  // Transportfenster wird als potenziell relevant behandelt (nicht stumm ausgeblendet) —
  // sonst bliebe selbst eine Vollsperrung unkritisch.
  if (!zVon && !zBis) return true
  const oVon = dateOnly(obstacle.gueltigVon) ?? dateOnly(obstacle.realerStart) ?? "0000-01-01"
  const oBis = dateOnly(obstacle.gueltigBis) ?? "9999-12-31"
  return oVon <= (zBis ?? "9999-12-31") && (zVon ?? "0000-01-01") <= oBis
}

const sev3 = (kritisch, warnung) => (kritisch ? "kritisch" : warnung ? "warnung" : "hinweis")

// T-459/T-289: informative, NICHT severity-treibende Zahl-attrs zusätzlich ins detail spiegeln,
// damit sie in Popup/PDF/CSV erscheinen (die ATTR_LABEL-Labels im FE waren bisher tot). Reine
// Anzeige — verändert KEINE Severity. Nur Zahlen (makeNormalized droppt String-attrs ohnehin),
// nur setzen wenn die Regel das Feld nicht schon unter einem eigenen Label zeigt.
const INFO_ATTRS = [
  ["maxAchslastT", "Zul. Achslast", (v) => `${fmtKomma(v, 1)} t`],
  ["maxLaengeM", "Zul. Länge", (v) => `${fmtKomma(v, 1)} m`],
  ["sperrlaengeM", "Länge der Maßnahme", (v) => `${fmtKomma(v, 0)} m`],
  ["anzahlFahrstreifen", "Fahrstreifen (verbleibend)", (v) => String(v)],
  ["spurenGesperrt", "Gesperrte Fahrstreifen", (v) => String(v)],
]
function withInfoAttrs(detail, attrs) {
  const out = { ...(detail ?? {}) }
  for (const [key, label, fmt] of INFO_ATTRS) {
    const v = num(attrs?.[key])
    if (v != null && !(label in out)) out[label] = fmt(v)
  }
  return out
}

// ── Kategorie-Regeln ──────────────────────────────────────────────────────────

const SEV_ORDER = { hinweis: 1, warnung: 2, kritisch: 3 }
const schlimmer = (a, b) => (SEV_ORDER[a] >= SEV_ORDER[b] ? a : b)

/**
 * Bauwerk (Brücke/Tunnel): bewertet alle hinterlegten Restriktionen gemeinsam —
 * lichte Durchfahrtshöhe (maxHoeheM), Tragfähigkeit (maxGewichtT) und die grundsätzliche
 * Schwertransport-Sperre der Behörde (grundsaetzlicheGstSperre). Ergebnis = schlimmste
 * Einzelbewertung. Ohne JEDEN hinterlegten Wert → "hinweis" → evaluate() blendet aus
 * (kein Flut an „Brücke ohne Maße"). NRW liefert z.B. nur Last, BAYSIS Höhe+Last.
 */
function ruleBauwerk(art, attrs, transport) {
  const maxH = num(attrs.maxHoeheM)
  const maxG = num(attrs.maxGewichtT)
  const gstSperre = attrs.grundsaetzlicheGstSperre === true
  // Harte Vollsperre für (genehmigungspflichtigen) Schwerverkehr → Schwertransport darf NIE drüber.
  const komplett = attrs.gesperrtKomplett === true

  if (maxH == null && maxG == null && !gstSperre && !komplett) {
    return {
      severity: "hinweis",
      beschreibung: `${art} ohne hinterlegte Durchfahrtshöhe oder Tragfähigkeit. Vor Ort prüfen.`,
      detail: { Transporthöhe: fmtM(transport.hoehe), Gesamtgewicht: fmtT(transport.gesamtgewicht) },
    }
  }

  let severity = "hinweis"
  const detail = {}
  const gruende = []

  if (maxH != null) {
    const spielraum = round2(maxH - transport.hoehe)
    detail["Durchfahrtshöhe"] = fmtM(maxH)
    detail["Transporthöhe"] = fmtM(transport.hoehe)
    detail["Spielraum"] = fmtM(spielraum)
    severity = schlimmer(severity, sev3(spielraum < 0.1, spielraum < 0.5))
    if (spielraum < 0.1) gruende.push("Durchfahrtshöhe reicht nicht aus")
    else if (spielraum < 0.5) gruende.push("Durchfahrtshöhe knapp")
  }

  if (maxG != null) {
    const rest = round2(maxG - transport.gesamtgewicht)
    detail["Zul. Brückenlast"] = fmtT(maxG)
    detail["Gesamtgewicht"] = fmtT(transport.gesamtgewicht)
    detail["Reserve"] = fmtT(rest)
    severity = schlimmer(severity, sev3(rest < 0, rest < 10))
    if (rest < 0) gruende.push("Tragfähigkeit überschritten")
    else if (rest < 10) gruende.push("Tragfähigkeit knapp")
  }

  if (komplett) {
    severity = "kritisch"
    detail["Schwertransport"] = "gesperrt"
    gruende.push("für genehmigungspflichtigen Schwerverkehr gesperrt")
  } else if (gstSperre) {
    severity = schlimmer(severity, "warnung")
    detail["Schwertransport"] = "grundsätzlich gesperrt/auflagenpflichtig"
    gruende.push("grundsätzliche Schwertransport-Sperre")
  }

  const beschreibung =
    severity === "kritisch"
      ? `${art}: ${gruende.join(", ")}. Umfahren oder Ausnahmegenehmigung bzw. Nachweis erforderlich.`
      : severity === "warnung"
        ? `${art}: ${gruende.length ? `${gruende.join(", ")}. ` : ""}Vor der Fahrt prüfen.`
        : `${art} mit hinterlegten Werten im Rahmen.`

  return { severity, beschreibung, detail }
}

function ruleEngstelle(attrs, transport) {
  const maxB = num(attrs.maxBreiteM)
  if (maxB == null) {
    return {
      severity: "hinweis",
      beschreibung: "Engstelle ohne hinterlegte Restbreite. Vor Ort prüfen.",
      detail: { Transportbreite: fmtM(transport.breite) },
    }
  }
  const marge = round2(maxB - transport.breite)
  return {
    severity: sev3(marge < 0.10, marge < 0.50),
    beschreibung: "Fahrbahn verengt sich. Restbreite gegen Transportbreite prüfen.",
    detail: {
      Fahrbahnbreite: fmtM(maxB),
      Transportbreite: fmtM(transport.breite),
      Marge: fmtM(marge),
    },
  }
}

// Bewertung NUR über das Gesamtgewicht (Achslast-Thema entfernt, Max 2026-06-16): die
// Achslast-Verteilung war zu fehleranfällig/aufwändig; relevant ist die zulässige Gesamtlast.
function ruleGewicht(attrs, transport) {
  const maxG = num(attrs.maxGewichtT)
  if (maxG == null) {
    return {
      severity: "hinweis",
      beschreibung: "Gewichtsbeschränkung ohne hinterlegte Traglast. Bescheid prüfen.",
      detail: { Gesamtgewicht: fmtT(transport.gesamtgewicht) },
    }
  }
  const rest = round2(maxG - transport.gesamtgewicht)
  return {
    severity: sev3(rest < 0, rest < 10),
    beschreibung:
      rest < 0
        ? "Zulässige Last überschritten. Ausnahmegenehmigung bzw. Lastverteilungsnachweis erforderlich."
        : "Zulässige Last auf Brücke oder Strecke prüfen, ggf. Lastverteilung nachweisen.",
    detail: {
      "Zul. Gesamtlast": fmtT(maxG),
      Gesamtgewicht: fmtT(transport.gesamtgewicht),
      Reserve: fmtT(rest),
    },
  }
}

function ruleSteigung(attrs, transport) {
  const pct = num(attrs.steigungPct)
  const gewicht = transport.gesamtgewicht
  if (pct == null) {
    return {
      severity: "hinweis",
      beschreibung: "Längsneigung ohne hinterlegten Wert. Anfahrvermögen berücksichtigen.",
      detail: { Gesamtgewicht: fmtT(gewicht) },
    }
  }
  let severity = "hinweis"
  if (pct >= 8) severity = gewicht > 60 ? "kritisch" : "warnung"
  else if (pct >= 5) severity = gewicht > 100 ? "warnung" : "hinweis"
  return {
    severity,
    beschreibung: "Längsneigung beachten. Anfahrvermögen und Bremsweg berücksichtigen.",
    detail: { Längsneigung: fmtPct(pct), Gesamtgewicht: fmtT(gewicht) },
  }
}

function ruleKreisverkehr(attrs, transport) {
  const r = num(attrs.radiusM)
  if (r == null) {
    return {
      severity: "hinweis",
      beschreibung: "Kreisverkehr ohne hinterlegten Radius. Schleppkurve prüfen.",
      detail: { Fahrzeuglänge: fmtM(transport.laenge) },
    }
  }
  return {
    severity: sev3(transport.laenge > 2.2 * r, transport.laenge > 1.6 * r),
    beschreibung: "Schleppkurve im Kreisverkehr. Befahrbarkeit für die Fahrzeuglänge prüfen.",
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
    ...(attrs.vollsperrung === true && { Sperrung: "Vollsperrung" }),
    Zeitraum: overlap ? "überschneidet den Transportzeitraum" : "außerhalb des Transportzeitraums",
  }

  // ROT nur bei ECHTER Verletzung: Restbreite kleiner als die Transportbreite
  // (kein Sicherheitspuffer mehr — Max 2026-06-14: 3,25 m reicht für 3,20 m, darf
  // NICHT kritisch sein). Gleichstand „passt exakt" gilt als ausreichend.
  const breiteVerletzt = rb != null && rb < transport.breite
  const hoeheVerletzt = mh != null && mh < transport.hoehe
  // T-265: eine als 'baustelle' eingestufte Vollsperrung (0112/0210/0211/0214/0216/0302)
  // muss im Transportzeitraum kritisch sein, nicht nur gelb.
  const vollsperrung = attrs.vollsperrung === true
  // T-266: strukturelle Blocker, die bisher nur FE-Label waren, heben mindestens auf Warnung.
  const blocker = attrs.havarie === true || attrs.sackgasse === true ||
    attrs.einbahnstrasse === true || attrs.fahrbahnVerengt === true

  let severity
  let beschreibung
  if ((vollsperrung && overlap) || breiteVerletzt || hoeheVerletzt) {
    severity = "kritisch"
    beschreibung =
      vollsperrung && !breiteVerletzt && !hoeheVerletzt
        ? "Baustelle mit Vollsperrung im Transportzeitraum. Durchfahrt nicht möglich, Umfahrung erforderlich."
        : breiteVerletzt && hoeheVerletzt
          ? "Baustelle verletzt Restbreite und Durchfahrtshöhe. Durchfahrt nicht möglich, bitte umfahren."
          : breiteVerletzt
            ? "Die Restbreite der Baustelle reicht für den Transport nicht aus. Durchfahrt abstimmen oder umfahren."
            : "Die Höhenbegrenzung der Baustelle reicht für den Transport nicht aus. Durchfahrt abstimmen oder umfahren."
  } else if (overlap || blocker) {
    // Auf der Strecke, im Zeitraum aktiv, aber keine hinterlegte Restriktion verletzt
    // (oder keine Maße bekannt) → anzeigen zur Prüfung, NICHT automatisch rot.
    severity = "warnung"
    beschreibung = rb == null && mh == null
      ? "Aktive Baustelle auf der Strecke. Keine Maße hinterlegt, Relevanz vor Ort prüfen."
      : "Aktive Baustelle auf der Strecke. Hinterlegte Maße reichen aus, Durchfahrt zeitlich abstimmen."
  } else {
    severity = "hinweis"
    beschreibung = "Baustelle auf der Strecke, aktuell außerhalb des Transportzeitraums."
  }
  return { severity, beschreibung, detail }
}

function ruleSperrung(attrs, transport, obstacle, zeitraum) {
  const overlap = overlapsZeitraum(obstacle, zeitraum)
  const rb = num(attrs.restbreiteM)
  const maxG = num(attrs.maxGewichtT)
  // T-266: strukturelle Blocker (bisher nur FE-Label) heben mindestens auf Warnung.
  const blocker = attrs.havarie === true || attrs.sackgasse === true ||
    attrs.einbahnstrasse === true || attrs.fahrbahnVerengt === true
  // Vollsperrung im Zeitraum = kritisch; sonst Gewichts-/Restbreite prüfen, sonst Hinweis.
  let severity = "hinweis"
  if (attrs.vollsperrung === true && overlap) severity = "kritisch"
  else if (rb != null && rb < transport.breite) severity = "kritisch"
  else if (maxG != null && maxG < transport.gesamtgewicht) severity = "kritisch"
  else if (overlap || blocker) severity = "warnung"
  return {
    severity,
    beschreibung:
      severity === "kritisch"
        ? "Strecke gesperrt bzw. für den Transport nicht passierbar. Umfahrung erforderlich."
        : "Sperrung oder Umleitung auf der Strecke. Durchfahrt bzw. Umleitungsführung prüfen.",
    detail: {
      ...(rb != null && { Restbreite: fmtM(rb) }),
      ...(maxG != null && { "Zul. Gesamtlast": fmtT(maxG) }),
      Zeitraum: overlap ? "überschneidet den Transportzeitraum" : "außerhalb des Transportzeitraums",
    },
  }
}

function ruleBahnuebergang(attrs, transport) {
  const maxH = num(attrs.maxHoeheM)
  const kritisch = maxH != null && transport.hoehe > maxH
  return {
    severity: kritisch ? "kritisch" : "hinweis",
    beschreibung: kritisch
      ? "Transporthöhe überschreitet die Oberleitungshöhe. Querung nur mit Abschaltung möglich."
      : "Höhengleicher Bahnübergang. Bodenfreiheit und Wartezeit beachten.",
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
      ? "Transporthöhe über Signalausleger. Anlage ggf. schwenken oder demontieren lassen."
      : "Lichtsignalanlage. Durchfahrt mit Begleitung abstimmen.",
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
      result = ruleBauwerk("Brücke", attrs, transport)
      break
    case "tunnel":
      result = ruleBauwerk("Tunnel", attrs, transport)
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
  // T-445: Längen-Limit (z.B. Thüringen KFZ_LAENGE→maxLaengeM) kategorie-übergreifend gegen die
  // Transportlänge prüfen. War bisher nur Anzeige-Attr → Überlängen-Transport blieb ungewarnt.
  // Greift nur, wenn das Hindernis ein Längen-Limit trägt (sonst no-op).
  const maxL = num(attrs.maxLaengeM)
  const transportL = num(transport?.laenge)
  if (maxL != null && transportL != null) {
    const rest = round2(maxL - transportL)
    result = {
      ...result,
      severity: schlimmer(result.severity, sev3(rest < 0, rest < 2)),
      detail: { ...result.detail, "Zul. Länge": fmtM(maxL), Transportlänge: fmtM(transportL), "Längen-Reserve": fmtM(rest) },
      beschreibung: rest < 0 ? `${result.beschreibung} Zulässige Fahrzeuglänge überschritten.` : result.beschreibung,
    }
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
    detail: withInfoAttrs(result.detail, attrs), // T-459: tote ATTR_LABEL beleben (reine Anzeige)
    titel: obstacle.name || DEFAULT_TITEL[obstacle.kategorie],
  }
}
