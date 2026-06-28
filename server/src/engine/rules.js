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
  // Kein Transport-Zeitraum geplant → "gilt immer" (T-267). Die zeitliche Aussortierung
  // abgelaufener/zukünftiger Ereignisse passiert zentral in evaluate() (T-601, auf heute
  // angekert) — hier bleibt es bei "im Zweifel sichtbar", damit Vollsperrungen greifen.
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
  // T-610: ab 1 km als km anzeigen (11490 m → „11,49 km") — rohe 5-stellige Meter lasen sich falsch.
  ["sperrlaengeM", "Länge der Maßnahme", (v) => (v >= 1000 ? `${fmtKomma(v / 1000, 2)} km` : `${fmtKomma(v, 0)} m`)],
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

// #19 (Max 2026-06-21): trägt das Hindernis eine KONKRETE Last-/Schwertransport-Beschränkung?
// Solche Stellen (z.B. lastbeschränkte Brücke 100 t, Connector 0150) müssen IMMER angezeigt werden
// — auch wenn der Transport sie einhält (severity "hinweis") — denn der Disponent muss die Auflage
// kennen. Höhen-/Breiten-Daten „im Rahmen" bleiben unterdrückt, sonst flutet jede passierbare Brücke.
// Achslast bewusst NICHT (wird nicht ausgewertet, Max 2026-06-16).
function hatLastBeschraenkung(attrs) {
  return (
    num(attrs?.maxGewichtT) != null ||
    attrs?.gesperrtKomplett === true ||
    attrs?.grundsaetzlicheGstSperre === true
  )
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
  // T-268: Brücken/Tunnel können auch breitenbeschränkt sein (Tunnelröhre/Engstelle am Bauwerk).
  // Wird nur ausgewertet, wenn die Quelle maxBreiteM liefert — sonst keine Verschlimmbesserung.
  // (RID-Tunnelkategorie bleibt offen, solange keine Quelle Tunnelklassen liefert.)
  const maxB = num(attrs.maxBreiteM)
  const gstSperre = attrs.grundsaetzlicheGstSperre === true
  // Harte Vollsperre für (genehmigungspflichtigen) Schwerverkehr → Schwertransport darf NIE drüber.
  const komplett = attrs.gesperrtKomplett === true

  if (maxH == null && maxB == null && maxG == null && !gstSperre && !komplett) {
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

  if (maxB != null) {
    // T-268: gleiche gestufte Marge wie Höhe/Engstelle (<0,1 m kritisch, <0,5 m knapp).
    const spielraumB = round2(maxB - transport.breite)
    detail["Durchfahrtsbreite"] = fmtM(maxB)
    detail["Transportbreite"] = fmtM(transport.breite)
    detail["Spielraum (Breite)"] = fmtM(spielraumB)
    severity = schlimmer(severity, sev3(spielraumB < 0.1, spielraumB < 0.5))
    if (spielraumB < 0.1) gruende.push("Durchfahrtsbreite reicht nicht aus")
    else if (spielraumB < 0.5) gruende.push("Durchfahrtsbreite knapp")
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
    // T-601: NICHT pauschal "gesperrt" — grundsaetzlicheGstSperre = für Großraum-/Schwertransporte
    // auflagenpflichtig/tragfähigkeitsbeschränkt (Einzelfallprüfung), nicht für den Verkehr gesperrt.
    severity = schlimmer(severity, "warnung")
    detail["Schwertransport"] = "auflagenpflichtig (Tragfähigkeit für GST prüfen)"
    gruende.push("Großraum-/Schwertransport-auflagenpflichtig (Tragfähigkeit prüfen)")
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
    // T-611: VZ263 trägt jetzt maxAchslastT statt maxGewichtT → maxG ist null → dieser Hinweis greift
    // ohne hinterlegtes Gesamtgewicht; da Achslast bewusst NICHT bewertet wird (Max 2026-06-16) und
    // keine Last-Beschränkung i.S. hatLastBeschraenkung vorliegt, unterdrückt evaluate den Fund (kein
    // Falsch-Kritisch mehr). Die Achslast-Auflage bleibt auf der Hindernis-DB-Karte sichtbar.
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
  // T-270: Schwellen (8 %/5 %, 60 t/100 t) = Heuristik (Anfahrvermögen schwerer Züge), NICHT
  // aus einer Norm abgeleitet. Bei Bedarf nach Max-Freigabe gegen RAS/Schleppkurven kalibrieren.
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
    // T-270: Faktoren 2,2/1,6 × Außenradius = Schleppkurven-Faustregel (Heuristik), nicht aus Norm
    // abgeleitet; nach Max-Freigabe ggf. kalibrieren.
    severity: sev3(transport.laenge > 2.2 * r, transport.laenge > 1.6 * r),
    beschreibung: "Schleppkurve im Kreisverkehr. Befahrbarkeit für die Fahrzeuglänge prüfen.",
    detail: { Außenradius: `${fmtKomma(r, 0)} m`, Fahrzeuglänge: fmtM(transport.laenge) },
  }
}

// Eine "Vollsperrung" eines PARK-/RASTPLATZES mit 0 gesperrten Fahrstreifen ist KEINE
// Fahrbahn-Vollsperrung — die Durchfahrt bleibt frei. Der Connector setzt vollsperrung=true am
// Keyword "Vollsperrung"; bei "Vollsperrung der Parkplätze … 0 Fahrstreifen" führte das zu einer
// falschen kritischen Eskalation (Audit Kefenrod). Nur dann entschärfen, NICHT bei echten
// Fahrbahn-Sperrungen (spurenGesperrt > 0 oder unbekannt).
// T-611 (Audit R3, Max-Freigabe): erweitert um (a) reine Geh-/Radweg-Sperrungen (0218/0215 — Fahrbahn
// frei, kein Fahrbahn-/Straßen-/Spur-Bezug) und (b) Vollsperrung mit 0 Fahrstreifen + Rampen-/Überfahrt-
// Kontext (0145/0152 — „Überfahrt A14→A2"/„Einfahrt", die durchgehende Fahrbahn bleibt). Beides war
// fälschlich kritisch. Konservativ: nur mit positiver Evidenz, echte Fahrbahn-Vollsperrungen bleiben kritisch.
function nurNichtFahrbahnSperre(attrs, obstacle) {
  if (attrs?.vollsperrung !== true) return false
  const t = `${obstacle?.name ?? ""} ${obstacle?.beschreibung ?? ""}`
  // (a) nur Geh-/Radweg — kein Fahrbahn-/Straßen-/Fahrstreifen-Bezug. T-611: NICHT entschärfen, wenn die
  // Quelle die Maßnahme strukturiert als echte Fahrbahn-/Straßensperre kennzeichnet (DATEX
  // sperrungArt=roadClosed/carriagewayClosed) — sonst würde eine echte roadClosed-Vollsperrung, deren
  // Freitext nur nebenbei einen Radweg erwähnt, fälschlich auf Warnung gedrückt (0142 Bremen).
  if (!/^(roadclosed|carriagewayclosed)$/i.test(String(attrs?.sperrungArt ?? "")) &&
      /geh-?\s*\/?\s*radweg|\bradweg|\bgehweg|veloroute|radverkehr|fu(?:ß|ss)weg/i.test(t) &&
      !/fahrbahn|fahrstreifen|\bstra(?:ß|ss)e\b|\bfahrspur|\bspur\b/i.test(t)) return true
  // (b) 0 gesperrte Fahrstreifen + Parkplatz/Rampe/Überfahrt-Kontext → keine Fahrbahn-Sperrung
  if (num(attrs?.spurenGesperrt) === 0 &&
      /parkpl|rastpl|\bpwc\b|parkstreifen|rastanlage|park-?\s*und\s*rast|[üu]berfahrt|\beinfahrt|\bauffahrt|\babfahrt|\bausfahrt|rampe|verbindungsfahrbahn/i.test(t)) return true
  return false
}

// Prinzip (Max 2026-06-14): ALLE Baustellen auf der Strecke werden als Fund angezeigt
// (nie ausgeblendet). ROT (kritisch) nur, wenn die HINTERLEGTEN Daten eine Restriktion
// wirklich verletzen (Restbreite < Transportbreite oder Höhenbegrenzung < Transporthöhe).
// Ohne Verletzung: Warnung (aktiv im Zeitraum, zur Relevanz-Prüfung) bzw. Hinweis
// (außerhalb des Zeitraums). So sieht der Sachbearbeiter alles und entscheidet selbst.
function ruleBaustelle(attrs, transport, obstacle, zeitraum) {
  const rb = num(attrs.restbreiteM)
  const mh = num(attrs.maxHoeheM)
  const mg = num(attrs.maxGewichtT) // T-610: temporäres Gewichtslimit der Baustelle (z.B. saniertes BW)
  const overlap = overlapsZeitraum(obstacle, zeitraum)
  const detail = {
    ...(rb != null && { Restbreite: fmtM(rb), Transportbreite: fmtM(transport.breite) }),
    ...(mh != null && { Höhenbegrenzung: fmtM(mh), Transporthöhe: fmtM(transport.hoehe) }),
    ...(mg != null && { Gewichtslimit: fmtT(mg), Gesamtgewicht: fmtT(transport.gesamtgewicht) }),
    ...(attrs.vollsperrung === true && { Sperrung: "Vollsperrung" }),
    Zeitraum: !(zeitraum?.von || zeitraum?.bis) ? "Kein Transportzeitraum gesetzt"
      : overlap ? "überschneidet den Transportzeitraum" : "außerhalb des Transportzeitraums",
  }

  // ROT nur bei ECHTER Verletzung: Restbreite kleiner als die Transportbreite
  // (kein Sicherheitspuffer mehr — Max 2026-06-14: 3,25 m reicht für 3,20 m, darf
  // NICHT kritisch sein). Gleichstand „passt exakt" gilt als ausreichend.
  const breiteVerletzt = rb != null && rb < transport.breite
  const hoeheVerletzt = mh != null && mh < transport.hoehe
  // T-610: Baustellen-Gewichtslimit < Transportgewicht = harter Blocker (war bisher ungeprüft → False
  // Negative: ein 130-t-Transport an einem 30-t-Baustellenlimit blieb nur Warnung). Analog zur Brücke.
  const gewichtVerletzt = mg != null && mg < transport.gesamtgewicht
  // T-265: eine als 'baustelle' eingestufte Vollsperrung (0112/0210/0211/0214/0216/0302)
  // muss im Transportzeitraum kritisch sein, nicht nur gelb. T-602: reine Parkplatz-Sperrung
  // (0 Fahrstreifen) ist KEINE Fahrbahn-Vollsperrung → nicht eskalieren.
  const vollsperrung = attrs.vollsperrung === true && !nurNichtFahrbahnSperre(attrs, obstacle)
  // T-266: strukturelle Blocker, die bisher nur FE-Label waren, heben mindestens auf Warnung.
  const blocker = attrs.havarie === true || attrs.sackgasse === true ||
    attrs.einbahnstrasse === true || attrs.fahrbahnVerengt === true

  let severity
  let beschreibung
  if ((vollsperrung && overlap) || breiteVerletzt || hoeheVerletzt || gewichtVerletzt) {
    severity = "kritisch"
    const gruende = [
      breiteVerletzt && "Restbreite",
      hoeheVerletzt && "Durchfahrtshöhe",
      gewichtVerletzt && "Tragfähigkeit/Gewichtslimit",
    ].filter(Boolean)
    beschreibung = gruende.length
      ? `Baustelle: ${gruende.join(" + ")} reicht für den Transport nicht aus. Durchfahrt abstimmen oder umfahren.`
      : "Baustelle mit Vollsperrung im Transportzeitraum. Durchfahrt nicht möglich, Umfahrung erforderlich."
  } else if (overlap || blocker) {
    // Auf der Strecke, im Zeitraum aktiv, aber keine hinterlegte Restriktion verletzt
    // (oder keine Maße bekannt) → anzeigen zur Prüfung, NICHT automatisch rot.
    severity = "warnung"
    beschreibung = rb == null && mh == null && mg == null
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
  if (attrs.vollsperrung === true && !nurNichtFahrbahnSperre(attrs, obstacle) && overlap) severity = "kritisch"
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
      Zeitraum: !(zeitraum?.von || zeitraum?.bis) ? "Kein Transportzeitraum gesetzt"
      : overlap ? "überschneidet den Transportzeitraum" : "außerhalb des Transportzeitraums",
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
  // T-601: OHNE geplanten Transport-Zeitraum gemeldete EREIGNISSE (baustelle/sperrung) auf HEUTE
  // ankern → abgelaufene (gueltigBis < heute) UND Jahre entfernte Maßnahmen (gueltigVon > heute)
  // fallen KOMPLETT raus, statt als "überschneidet den Transportzeitraum" weiterzulaufen.
  // Brücken/Tunnel/Gewicht NICHT zeitfiltern — deren gueltigBis ist Datenstand, kein Lebensende.
  if (!von && !zEnde && EVENT_KATEGORIEN.has(obstacle.kategorie)) {
    const heute = dateOnly(new Date().toISOString())
    if (bis && bis < heute) return null
    if (wirksamAb && wirksamAb > heute) return null
  }

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
  // #19: Stellen mit konkreter Last-/Schwertransport-Beschränkung ebenfalls IMMER zeigen,
  // auch wenn der Transport sie einhält (lastbeschränkte Brücke 100 t etc.).
  if (
    result.severity === "hinweis" &&
    !EVENT_KATEGORIEN.has(obstacle.kategorie) &&
    !hatLastBeschraenkung(attrs)
  ) {
    return null
  }
  return {
    ...result,
    detail: withInfoAttrs(result.detail, attrs), // T-459: tote ATTR_LABEL beleben (reine Anzeige)
    titel: obstacle.name || DEFAULT_TITEL[obstacle.kategorie],
  }
}
