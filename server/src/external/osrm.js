// OSRM-Router (nur serverseitig). Liefert null bei jedem Fehler/Timeout —
// der Aufrufer nutzt dann den deterministischen Geometrie-Fallback.

import { fetchJson } from "./http.js"

// Straßen-Referenz normalisieren: "A 1" → "A1", "B 252"/"B252" → "B252", "St 2580" → "ST2580",
// "L 99" → "L99", "K 142" → "K142". Führende Nullen weg. NUR klassifizierte Straßennummern
// (A/B/L/K/St/S) — gibt null für Straßennamen/leere Refs zurück (dann NICHT vergleichen).
export function normRoadRef(s) {
  const m = String(s ?? "").toUpperCase().match(/\b(A|B|L|K|ST|S)\s*0*(\d{1,4})\b/)
  return m ? `${m[1] === "S" ? "ST" : m[1]}${m[2]}` : null
}

/**
 * Wie normRoadRef, aber erkennt zusaetzlich Kreis- und Staatsstrassen MIT Landkreiskuerzel
 * ("K BA 10" in Bamberg, "K-NES 3" in Bad Neustadt, "K AN 7" in Ansbach). T-653.
 *
 * WARUM EIGEN und nicht in normRoadRef: dort wuerden "K BA 10" und "K CO 10" beide zu "K10"
 * zusammenfallen, obwohl es verschiedene Strassen in verschiedenen Landkreisen sind. Hier
 * bleibt das Kuerzel im Ergebnis ("KBA10"), die Werte sind also NICHT mit denen von normRoadRef
 * mischbar und dienen nur dem Vergleich untereinander.
 *
 * Das Kuerzel MUSS durch Leerzeichen oder Bindestrich getrennt sein. Ohne diese Bedingung liest
 * der Ausdruck "Stein 2" als ST+EIN+2 und "BSW 3" als B+SW+3 — beides Bauwerksnamen, keine Strassen.
 */
const REF_WEIT = /\b(A|B|L|K|ST|S)\s*(?:[- ]\s*([A-ZÄÖÜ]{2,3})\s*)?[- ]?\s*0*(\d{1,4})\b/
export function normRoadRefWeit(s) {
  const m = String(s ?? "").toUpperCase().match(REF_WEIT)
  if (!m) return null
  const klasse = m[1] === "S" ? "ST" : m[1]
  return m[2] ? `${klasse}${m[2]}${m[3]}` : `${klasse}${m[3]}`
}

/**
 * Die getragene und die gekreuzte Strasse aus dem BAUWERKSNAMEN lesen (T-653).
 *
 * WOZU: 12.976 der 16.278 Bauwerke tragen ueberhaupt kein Strukturfeld. Bei ihnen steht die Lage
 * nur im Namen, und der folgt erstaunlich verlaesslich drei Mustern. Gegen die 2.875 Bauwerke MIT
 * Strukturfeld nachgemessen: wenn der Name etwas sagt, stimmt es in 94 Prozent der Faelle, und ein
 * Teil der restlichen 6 Prozent sind gar keine Fehler, sondern Faelle, in denen der Name genauer
 * ist als die Quelle ("Bruecke K-NES 3" gegen ein Strukturfeld, das daraus "K3" gemacht hat).
 *
 * Die Muster, in dieser Reihenfolge, weil das spaetere das fruehere ueberstimmt:
 *   1. "«unten», UEF «oben»" / "«unten» Ueberfuehrung der «oben»" — nennt die Lage ausdruecklich
 *   2. "«oben» ueber «unten»" — das haeufigste im Bestand
 *   3. "Bruecke «oben» BW 1234" — die Strasse gleich am Anfang ist die getragene
 */
// T-676: der Artikel ist auch im ausgeschriebenen Zweig OPTIONAL. Mit Pflichtartikel fiel
// "A5; Überführung Wirtschaftsweg" durch dieses Muster und landete bei NAME_KOPF, das die A5 am
// Zeilenanfang als getragene Strasse las — dabei liegt dort der Wirtschaftsweg oben und wir
// fahren auf der A5 darunter durch.
const NAME_UEF = /(?:ü|ue)f(?:g)?\.?\s+(?:der|des|d\.)?\s*|(?:ü|ue)berf(?:ü|ue)hrung\s+(?:der|des|d\.)?\s*/i
const REF_ROH = String.raw`(?:A|B|L|K|St|S)\s*(?:[- ]\s*[A-ZÄÖÜ]{2,3}\s*)?[- ]?\s*\d{1,4}`
const NAME_UEBER = new RegExp(String.raw`(${REF_ROH})\s*(?:-Ast|-Aeste|-Äste)?\s+(?:ü|ue)ber\s+(?:die|den|das|dem|der)?\s*(.*)$`, "i")
const NAME_KOPF = new RegExp(String.raw`^\s*(?:BAB\s*)?(?:Br(?:ü|ue)cke|BW|Talbr(?:ü|ue)cke)?\s*(?:BAB\s*)?(${REF_ROH})\b`, "i")
// Was hinter dem Ueberfuehrungswort steht, noch einmal an "ueber" geteilt: davor liegt oben,
// dahinter unten. Nicht gierig, damit ein zweites "ueber" im Namen die Teilung nicht verschiebt.
const NAME_UEF_UEBER = /^(.*?)\s+(?:ü|ue)ber\s+(?:die|den|das|dem|der|d\.)?\s*(.*)$/i
// Steht IRGENDWO in diesem Stueck Text eine klassifizierte Nummer? Anders als NAME_UEBER, das
// die Nummer direkt vor dem "ueber" verlangt, fragt das hier nur "kommt eine vor" — als Sperre
// gegen mehrdeutige Namen, nicht zum Erkennen.
const REF_IRGENDWO = new RegExp(String.raw`\b(?:BAB\s*)?${REF_ROH}\b`, "i")

/**
 * Nur das Stueck HINTER dem "ueber", das noch zum Ueberquerten gehoert (T-699).
 *
 * Der Grund ist gemessen. Ohne diesen Schnitt nimmt normRoadRefWeit die erste Nummer im GANZEN
 * Rest, und der traegt im Bestand regelmaessig eine zweite, voellig andere Angabe:
 *   "Bruecke ueber die B87n im Zuge der L 37"   -> las L37 als unterquert. Die L37 ist die
 *                                                  GETRAGENE, unterquert wird die B87n.
 *   "Bruecke ueber die Tauschke/B 182, BW 7"    -> las B182 als unterquert. Ueberquert wird ein
 *                                                  Bach; die B182 traegt die Bruecke.
 *   "Bruecke ueber die DBAG/B169, OU Senftenberg" -> dasselbe mit einer Bahnstrecke.
 *   "Wirtschaftsweg ueber Geh-/Radweg (seitl. B236)" -> "seitlich" ist gar keine Lageangabe.
 *   "Forstweg ueber WL Saale neben B 240 in km 3,010" -> "neben" ebenso wenig.
 * Alle fuenf faenden nach dem Schnitt keine Nummer mehr und schweigen, statt die Lage umzudrehen.
 */
const TRENNER = /\s*[/,(]|\s+(?:im zuge|i\.\s?z\.|neben|in km|bei km|zwischen)\b/i
const bisZumTrenner = (s) => String(s ?? "").split(TRENNER)[0]

/**
 * Ueberquert dieses Bauwerk etwas, das GAR KEINE STRASSE ist (T-699)?
 *
 * Max, 06.09.2026, an einem Fund "Mainbruecke Eddersheim" mit dem Schild "Streckenbezug
 * unbestaetigt": "aber bei sowas wie Mainbruecke weiss man das ja."
 *
 * Er hat recht, und der Grund ist einfach: ueber einem Fluss, einem Tal, einem Kanal oder einer
 * Bahnstrecke liegt keine Strasse, auf der wir statt dessen fahren koennten. Wer eine Mainbruecke
 * passiert, faehrt darueber. Die Frage "oben oder unten", die zuordnung() sonst beschaeftigt,
 * stellt sich hier nicht.
 *
 * Bis hierher konnte die Engine das nicht sehen: strasseAusName() sucht ausschliesslich nach
 * klassifizierten Nummern, und "Mainbruecke Eddersheim" nennt keine. Ergebnis war {oben: null,
 * unten: null} und damit "unbestimmt".
 *
 * DIE ZWEITE BEDINGUNG IST DIE WICHTIGERE: nennt der Name IRGENDEINE klassifizierte Strassennummer,
 * antwortet diese Funktion nicht. Denn dann kann genau sie die unterquerte sein. Gemessen am
 * 06.09.2026 gegen alle 16.519 Bauwerke im Bestand: ohne die Nummernsperre trifft das Muster 200
 * Bauwerke, darunter "UF K807 + Main + K808 - Mainbruecke Schwanheim" und "Lahnbruecke am
 * Taubenstein, UF Lahn, L 3020" — dort wird sehr wohl eine Strasse unterquert, und ein "wir fahren
 * drueber" waere schlicht falsch. Mit der Sperre bleiben 139 Bauwerke, und von denen trifft KEINES
 * mehr einen Fall mit brauchbarer gekreuzter Strasse im Strukturfeld.
 *
 * Der Preis sind 6 Bauwerke, die konservativ aussen vor bleiben, obwohl sie eindeutig waeren
 * ("RUHRBRUECKE B54" — dort ist die B54 die getragene). Das ist der richtige Tausch: die Regel
 * spricht einen Fund frei, und Freisprechen darf nur, wer sicher ist.
 */
const KREUZT_GEWAESSER =
  /\b(?:fluss|strom|kanal|hafen|see|teich|weiher|bach|graben|aue|sund|f(?:ö|oe)hrde|f(?:ö|oe)rde|watt|siel|deich)br(?:ü|ue)cke\b|\b(?:main|rhein|elbe|donau|weser|neckar|mosel|saale|spree|havel|ems|lahn|ruhr|lippe|aller|leine|isar|inn|lech|regnitz|naab|saar|fulda|werra|oder|neisse|nahe|sieg|wupper|erft|niers|eider|trave|warnow|peene|unstrut|mulde|bode|iller|wertach|amper|vils|rott|salzach|jagst|kocher|tauber|enz|murg|kinzig|dreisam|argen|schussen|rems|fils|brenz|paar|glonn|loisach|ammer|traun|alz|rednitz|pegnitz|wiesent|itz|rodach|schwarza|ilm|gera|helme|selke|ohre|st(?:ö|oe)r|pinnau|bille|alster|este|seeve|oste|hunte|hase|vechte|berkel|issel)[- ]?br(?:ü|ue)cke\b|(?:ü|ue)ber (?:den |die |das )?(?:main|rhein|elbe|donau|weser|neckar|mosel|kanal|fluss|bach|see|hafen|strom)\b/i
// OHNE Wortgrenze vorn, mit Absicht: im Bestand steht "Wiehltalbruecke" und "Moseltalbruecke"
// als EIN Wort, "Wupper-Talbruecke" mit Bindestrich. Ein \b davor faende nur die zweite Form.
const KREUZT_TAL = /talbr(?:ü|ue)cke\b|\bviadukt\b/i
const KREUZT_BAHN =
  /\b(?:bahn|eisenbahn|gleis)br(?:ü|ue)cke\b|(?:ü|ue)ber (?:die )?(?:bahn|bahnstrecke|bahnlinie|gleise|eisenbahn|db[- ]?ag|db[- ]strecke)\b/i
const KREUZT_KANAL =
  /\b(?:mittellandkanal|nord-ostsee-kanal|dortmund-ems-kanal|rhein-herne-kanal|datteln-hamm-kanal|wesel-datteln-kanal|elbe-seitenkanal|elbe-l(?:ü|ue)beck-kanal|k(?:ü|ue)stenkanal|stichkanal)\b/i
// Jede klassifizierte Nummer im Namen sperrt die Aussage — auch die getragene. Bewusst grober
// als REF_ROH: hier soll im Zweifel gesperrt werden, nicht erkannt.
const IRGENDEINE_NUMMER = /\b(?:A|B|L|K|St|S)\s?\d{1,4}\b|\bBAB\s?\d/i

export function kreuztKeineStrasse(name) {
  const t = String(name ?? "")
  if (IRGENDEINE_NUMMER.test(t)) return false
  return KREUZT_GEWAESSER.test(t) || KREUZT_TAL.test(t) || KREUZT_BAHN.test(t) || KREUZT_KANAL.test(t)
}

export function strasseAusName(name) {
  const t = String(name ?? "")
  const uef = t.match(NAME_UEF)
  if (uef) {
    const rest = t.slice(uef.index + uef[0].length)
    // "UEF «oben» ueber «unten»" — beide Muster in einem Namen, und dann gewinnt "ueber".
    // Ohne diese Teilung nahm die Zeile darunter die ERSTE Nummer im Rest, und die steht bei
    // diesem Muster hinter "ueber", ist also gerade die untere: aus "Uef Gemeindestr. ueber A1"
    // wurde oben = A1. Auf einer A1-Route hiess das "wir fahren oben drauf", obwohl wir
    // darunter durchfahren. Gemessen am 05.09.2026 an 1.593 Bruecken-Warnungen: 43 Faelle,
    // alle mit unbrauchbarem Strukturfeld (getragen == gekreuzt), also ohne anderen Auswegs.
    const geteilt = rest.match(NAME_UEF_UEBER)
    if (geteilt) {
      const unten = normRoadRefWeit(geteilt[2])
      // «oben» darf leer bleiben: "Uef eines Wanderweges ueber die A9" nennt oben gar keine
      // klassifizierte Strasse, und genau das ist die Aussage — dort faehrt niemand von uns.
      if (unten) return { oben: normRoadRefWeit(geteilt[1]), unten }
    }
    const oben = normRoadRefWeit(rest)
    const unten = normRoadRefWeit(t.slice(0, uef.index))
    // T-676: auch dann antworten, wenn NUR die untere Strasse bekannt ist. Der Fall ist im
    // Bestand der haeufigste: "A5; Üfg WiWeg Marienhof" nennt hinter dem Ueberfuehrungswort
    // einen Wirtschaftsweg, also keine klassifizierte Nummer. Vorher gab die Zeile mangels
    // `oben` gar nichts zurueck, der Name lief weiter bis NAME_KOPF, und das las die A5 am
    // Zeilenanfang als GETRAGENE Strasse. Auf einer A5-Route hiess das "wir fahren drueber",
    // obwohl wir darunter durchfahren. Gemessen: 85 von 157 Bauwerken mit Ueberfuehrungswort
    // trugen ein falsches `oben`.
    //
    // Die Reihenfolge im Namen entscheidet, und sie bleibt unangetastet: steht die Nummer HINTER
    // dem Ueberfuehrungswort ("Üf. BAB A 2 ü. Gemeindestr."), traegt das Bauwerk sie, und `oben`
    // gewinnt wie bisher. Steht sie DAVOR, ist sie die gekreuzte.
    if (oben || unten) return { oben, unten }
  }
  const ueber = t.match(NAME_UEBER)
  if (ueber) {
    const oben = normRoadRefWeit(ueber[1])
    if (oben) return { oben, unten: normRoadRefWeit(ueber[2]) }
  }
  // OHNE UEBERFUEHRUNGSWORT UND OHNE NUMMER DAVOR (T-699). "Gruenbruecke ueber die A 9" sagt
  // dasselbe wie "UEF ueber die A 9", nur ohne das Wort, an dem NAME_UEF haengt — und weil vor
  // dem "ueber" keine Nummer steht, greift auch NAME_UEBER nicht. Beides zusammen liess diese
  // Namen bis hier durchfallen: {oben: null, unten: null}, also "unbestimmt".
  //
  // Gemessen: 50 von 133 Bauwerks-Funden mit "ueber <Nummer>" im Namen sind genau das, und alle
  // stehen heute als Auflage in Auswertungen, ueber deren Fahrbahn sie in Wahrheit hinwegfuehren.
  // Beispiele aus der Produktion: "GRUENBRUECKE/Gruenbruecke ueber die B10", "79UE1 neu Bruecke
  // i.Z.d. Verb.-Weges Loesau-Nellschuetz/Wegbruecke ueber die BAB A 9".
  //
  // DIE BEDINGUNG "keine Nummer davor" IST DIE SICHERUNG: steht vorne eine, ist der Name
  // mehrdeutig ("Bruecke A6 Aeste A-T u. G-I / Overfly / ueber A6" nennt dieselbe Autobahn zwei
  // mal), und aus einer mehrdeutigen Angabe darf kein Verwerfen folgen. Verworfen wird ohnehin
  // erst in zuordnung() Z. 234, und dort nur mit gefuelltem Ortsfenster.
  const ohneWort = t.match(NAME_UEF_UEBER)
  if (ohneWort && !REF_IRGENDWO.test(ohneWort[1])) {
    const unten = normRoadRefWeit(bisZumTrenner(ohneWort[2]))
    if (unten) return { oben: null, unten }
  }
  const kopf = t.match(NAME_KOPF)
  return { oben: kopf ? normRoadRefWeit(kopf[1]) : null, unten: null }
}

/** Die einzelnen Schritte mit Strassennummer und Geometrie — {ref, punkte}[]. */
/**
 * Normalform eines Strassennamens fuer den Vergleich. "Sandbochumer Weg" und "Sandbochumer  weg"
 * sind dieselbe Strasse, "Hauptstr." und "Hauptstraße" auch.
 *
 * Die Abkuerzungen sind der Grund, warum hier ueberhaupt normalisiert wird: OSM schreibt mal
 * "Straße", mal "Str.", und ein Vergleich, der daran scheitert, wuerde eine Strasse fuer eine
 * andere halten — mit dem Namensvergleich in zuordnung() waere das ein zu Unrecht verworfener Fund.
 */
export const normStrassenName = (s) => {
  const roh = String(s ?? "").toLowerCase().trim()
  if (!roh) return null
  const n = roh
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/\bstr\.?\b/g, "strasse")
    .replace(/[^a-z0-9]+/g, "")
  return n.length >= 4 ? n : null // "b1", "am see" — zu kurz, um damit zu urteilen
}

/**
 * Die Route in Abschnitte, MIT Strassenname.
 *
 * Bis zum 01.09.2026 flog hier jeder Abschnitt ohne klassifizierte Nummer heraus (`if (!ref)
 * continue`), und der Name wurde gar nicht erst mitgenommen. Folge: die Engine wusste von
 * Gemeindestrassen nichts, und ein Fund auf dem "Sandbochumer Weg" liess sich nie widerlegen,
 * obwohl die Route dort gar nicht entlangfuehrt. Genau solche Funde standen dann in der
 * Auswertung.
 */
export function abschnitteAusLegs(legs) {
  const raus = []
  for (const leg of legs ?? []) {
    for (const step of leg.steps ?? []) {
      const ref = normRoadRef(String(step.ref ?? "").split(/[;,/]/)[0])
      const name = normStrassenName(step.name)
      const c = step?.geometry?.coordinates
      // Ohne beides ist der Abschnitt stumm — eine unbenannte Rampe etwa.
      if ((!ref && !name) || !Array.isArray(c) || !c.length) continue
      raus.push({ ref, name, punkte: c.map(([lng, lat]) => ({ lat, lng })) })
    }
  }
  return raus
}

/** Strassen-Refs aus OSRM-Legs (A/B/L/K/St). Gemeinsam genutzt von roadRefs und den Alternativen. */
export function refsAusLegs(legs) {
  const refs = new Set()
  for (const leg of legs ?? []) {
    for (const step of leg.steps ?? []) {
      for (const part of String(step.ref ?? "").split(/[;,/]/)) {
        const n = normRoadRef(part)
        if (n) refs.add(n)
      }
    }
  }
  return refs
}

// Anfangspeilung a->b (0=Nord, 90=Ost) — fuer Fahrbahnseiten-bearings.
function bearing(a, b) {
  const rad = Math.PI / 180
  const la1 = a.lat * rad
  const la2 = b.lat * rad
  const dlo = (b.lng - a.lng) * rad
  const y = Math.sin(dlo) * Math.cos(la2)
  const x = Math.cos(la1) * Math.sin(la2) - Math.sin(la1) * Math.cos(la2) * Math.cos(dlo)
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360
}

// Pro Wegpunkt die Reiserichtung (Vorgaenger->Nachfolger) mit +-rng Toleranz. OSRM snappt dann auf
// die Fahrbahn IN Fahrtrichtung statt auf die Gegenfahrbahn -> keine U-Turn-Loops auf getrennten
// Fahrbahnen (Autobahn/zweispurige B-Strassen).
function routeBearings(wp, rng = 90) {
  const n = wp.length
  return wp
    .map((_, i) => {
      const a = i > 0 ? wp[i - 1] : wp[i]
      const b = i < n - 1 ? wp[i + 1] : wp[i]
      return a.lat === b.lat && a.lng === b.lng ? "0,180" : `${Math.round(bearing(a, b))},${rng}`
    })
    .join(";")
}

// Mittelpunkt eines Step-Polygonzugs (mittlerer Stützpunkt) — für die Meide-Zone einer
// Ortsdurchfahrt. Fallback: OSRM-maneuver.location [lng,lat]. Null, wenn nichts brauchbar.
function mittelpunkt(punkte, fallbackLngLat) {
  if (Array.isArray(punkte) && punkte.length) return punkte[Math.floor(punkte.length / 2)]
  if (Array.isArray(fallbackLngLat) && fallbackLngLat.length === 2) {
    const [lng, lat] = fallbackLngLat
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng }
  }
  return null
}

export function createOsrm({
  // T-338: KEINE stille Default-URL auf den öffentlichen OSRM-Demoserver (Routen-/Bewegungsdaten
  // dürfen nicht ungewollt zu einem Dritt-Dienst gehen, und der Demoserver ist nicht produktiv).
  // Ohne konfigurierte (self-hosted) OSRM_URL ist der Router deaktiviert (→ null); der Aufrufer
  // nutzt dann den deterministischen Geometrie-Fallback.
  baseUrl = process.env.OSRM_URL || "",
  timeoutMs = Number(process.env.EXTERNAL_TIMEOUT_MS ?? 4000),
  fetchImpl = globalThis.fetch,
} = {}) {
  if (!baseUrl) return null
  return {
    /** @returns {{geometry:{lat:number,lng:number}[],distanzKm:number,dauerMin:number}|null} */
    async route(waypoints) {
      const coords = waypoints.map((p) => `${p.lng},${p.lat}`).join(";")
      // continue_straight=true: an Zwischen-Wegpunkten NICHT wenden (kein „hinfahren und zurück").
      // Für unsere geordneten Korridor-Wegpunkte gewünscht — und ein langer Transport kann an einem
      // Wegpunkt ohnehin keine enge Kehre fahren. (Ist beim Auto-Profil bereits Default; explizit
      // gesetzt = robust gegen Profiländerungen.) Echte LKW-Kurvenradien bräuchten ein HGV-Profil.
      const base = `${baseUrl.replace(/\/$/, "")}/route/v1/driving/${coords}?overview=full&geometries=geojson&continue_straight=true`
      // bearings = Fahrtrichtung je Wegpunkt → korrekte Fahrbahnseite (gegen U-Turn-Loops). Fallback
      // OHNE bearings, falls OSRM mit dem Richtungs-Constraint keinen Snap/Route findet (NoSegment).
      for (const url of [`${base}&bearings=${routeBearings(waypoints)}`, base]) {
        const data = await fetchJson(url, {
          timeoutMs,
          fetchImpl,
          headers: { "User-Agent": "setreo-roadmap/1.0" },
        }).catch(() => null)
        const route = data?.code === "Ok" ? data.routes?.[0] : null
        const coordsOut = route?.geometry?.coordinates
        if (Array.isArray(coordsOut) && coordsOut.length >= 2) {
          return {
            geometry: coordsOut.map(([lng, lat]) => ({ lat, lng })),
            distanzKm: route.distance / 1000,
            dauerMin: route.duration / 60,
          }
        }
      }
      return null
    },

    /**
     * Wie route(), aber mit ALTERNATIVEN: OSRM liefert bis zu `anzahl` echte Varianten
     * derselben Verbindung (andere Korridore, nicht nur Feinvarianten).
     *
     * Fuer die Streckensuche ist das der billigste Weg zu Vielfalt: ein Aufruf, mehrere
     * Korridore, keine geratenen Via-Punkte. OSRM liefert Alternativen nur ohne
     * Zwischenpunkte (zwei Wegpunkte) — mit mehr Punkten faellt es still auf eine Route
     * zurueck, deshalb hier bewusst nur Start und Ziel einer KANTE.
     * @returns {{geometry:{lat,lng}[],distanzKm:number,dauerMin:number}[]}
     */
    async routeAlternativen(von, nach, { anzahl = 3, mitStrassen = false } = {}) {
      const coords = `${von.lng},${von.lat};${nach.lng},${nach.lat}`
      // steps=true kostet auf langen Strecken spuerbar Zeit — deshalb nur, wenn der
      // Aufrufer die befahrenen Strassen wirklich braucht (Verbot des Nutzers).
      const url =
        `${baseUrl.replace(/\/$/, "")}/route/v1/driving/${coords}` +
        `?overview=full&geometries=geojson&alternatives=${Math.max(1, Math.min(Number(anzahl) || 3, 5))}` +
        (mitStrassen ? "&steps=true" : "")
      const data = await fetchJson(url, { timeoutMs: mitStrassen ? Math.max(timeoutMs, 30000) : timeoutMs, fetchImpl, headers: { "User-Agent": "setreo-roadmap/1.0" } }).catch(() => null)
      if (data?.code !== "Ok" || !Array.isArray(data.routes)) return []
      return data.routes
        .map((r) => {
          const c = r?.geometry?.coordinates
          if (!Array.isArray(c) || c.length < 2) return null
          const strassen = mitStrassen ? refsAusLegs(r.legs) : null
          // Abschnitte mit Strassennummer UND eigener Geometrie: nur damit laesst sich
          // sagen, WO genau eine bestimmte Strasse befahren wird — die Voraussetzung,
          // um ein Verbot in umfahrbare Punkte zu uebersetzen.
          const abschnitte = mitStrassen ? abschnitteAusLegs(r.legs) : null
          return { geometry: c.map(([lng, lat]) => ({ lat, lng })), distanzKm: r.distance / 1000, dauerMin: r.duration / 60, strassen, abschnitte }
        })
        .filter(Boolean)
    },

    /**
     * Menge der Straßen-Refs (A/B/L/K/St), die die Route tatsächlich befährt — aus den OSRM-Steps.
     * Für den Überführungs-Filter (T-601): ein Punkt-Bauwerk auf einer Straße, die NICHT in dieser
     * Menge ist, wird vom Transport nur gekreuzt, nicht befahren. Null bei Fehler/Timeout (→ Filter
     * greift dann nicht, konservativ). @returns {Set<string>|null}
     */
    async roadRefs(waypoints) {
      const wp = (Array.isArray(waypoints) ? waypoints : []).filter((p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lng))
      if (wp.length < 2) return null
      const coords = wp.map((p) => `${p.lng},${p.lat}`).join(";")
      const url = `${baseUrl.replace(/\/$/, "")}/route/v1/driving/${coords}?overview=false&steps=true&continue_straight=true`
      // T-602: steps=true auf sehr langen Routen (800+ km) ist langsam — großzügiges Timeout, damit
      // der Überführungsfilter auch im Worker-Rerun (Default 4 s) greift und nicht still degradiert.
      // Einmaliger Batch-Call je Route, nicht latenzkritisch.
      const data = await fetchJson(url, { timeoutMs: Math.max(timeoutMs, 30000), fetchImpl, headers: { "User-Agent": "setreo-roadmap/1.0" } }).catch(() => null)
      if (data?.code !== "Ok") return null
      return refsAusLegs(data.routes?.[0]?.legs)
    },

    /**
     * Wie roadRefs, aber zusaetzlich MIT der Geometrie je Schritt (T-653).
     *
     * WOZU: roadRefs liefert eine flache Menge aller Strassen der ganzen Route, ohne Ortsbezug.
     * Faehrt eine Route A7 UND A2, gilt damit die Bruecke "AK Hannover-Ost, A7 ueber A2" als
     * befahren, egal an welchem Kilometer sie liegt. Gemessen: 12 solcher Funde in vier
     * Projekten. Mit den Schritt-Geometrien laesst sich stattdessen fragen, welche Strasse wir
     * AN DIESER STELLE fahren, und genau das ist die Frage, auf die es ankommt.
     *
     * roadRefs bleibt unangetastet: sie hat zwei weitere Aufrufer, und ein Umbau haette deren
     * Verhalten stillschweigend mitverschoben.
     *
     * @returns {{refs: Set<string>, abschnitte: {ref: string, punkte: {lat,lng}[]}[]}|null}
     */
    async strassenAbschnitte(waypoints) {
      const wp = (Array.isArray(waypoints) ? waypoints : []).filter((p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lng))
      if (wp.length < 2) return null
      const coords = wp.map((p) => `${p.lng},${p.lat}`).join(";")
      // geometries=geojson zusaetzlich zu steps: nur so tragen die Schritte Koordinaten.
      const url = `${baseUrl.replace(/\/$/, "")}/route/v1/driving/${coords}?overview=false&steps=true&geometries=geojson&continue_straight=true`
      const data = await fetchJson(url, { timeoutMs: Math.max(timeoutMs, 30000), fetchImpl, headers: { "User-Agent": "setreo-roadmap/1.0" } }).catch(() => null)
      if (data?.code !== "Ok") return null
      const legs = data.routes?.[0]?.legs
      return { refs: refsAusLegs(legs), abschnitte: abschnitteAusLegs(legs) }
    },

    /**
     * Die Route in geordnete Straßen-Abschnitte zerlegt — je OSRM-Step ein Eintrag mit
     * Ref(s), Name, Länge, km-Bereich und Mittelpunkt. Basis für die Ortsdurchfahrt-
     * Erkennung (Konzept „Ortschaften umfahren"): ein Abschnitt OHNE klassifizierten Ref
     * ist ein Kandidat für eine innerörtliche Gemeindestraße. `osmKlasse` bleibt hier null
     * (OSRM liefert die highway-Klasse nicht) — sie wird im Route-Handler per Nominatim-
     * Reverse ergänzt. Null bei Fehler/Timeout (→ Aufrufer verzichtet auf die Erkennung).
     * @returns {Promise<Array<{vonKm:number,bisKm:number,laengeKm:number,ref:string|null,
     *   refs:string[],name:string|null,osmKlasse:string|null,mitte:{lat:number,lng:number}|null}>|null>}
     */
    async roadSegments(waypoints) {
      const wp = (Array.isArray(waypoints) ? waypoints : []).filter((p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lng))
      if (wp.length < 2) return null
      const coords = wp.map((p) => `${p.lng},${p.lat}`).join(";")
      const url = `${baseUrl.replace(/\/$/, "")}/route/v1/driving/${coords}?overview=false&steps=true&geometries=geojson&continue_straight=true`
      const data = await fetchJson(url, { timeoutMs: Math.max(timeoutMs, 30000), fetchImpl, headers: { "User-Agent": "setreo-roadmap/1.0" } }).catch(() => null)
      if (data?.code !== "Ok") return null
      const segmente = []
      let km = 0
      for (const leg of data.routes?.[0]?.legs ?? []) {
        for (const step of leg.steps ?? []) {
          const laengeKm = (Number(step.distance) || 0) / 1000
          const vonKm = km
          const bisKm = km + laengeKm
          km = bisKm
          const refs = [...new Set(String(step.ref ?? "").split(/[;,/]/).map(normRoadRef).filter(Boolean))]
          const punkte = Array.isArray(step.geometry?.coordinates) ? step.geometry.coordinates.map(([lng, lat]) => ({ lat, lng })) : []
          segmente.push({
            vonKm,
            bisKm,
            laengeKm,
            ref: refs[0] ?? null,
            refs,
            name: (typeof step.name === "string" && step.name) ? step.name : null,
            osmKlasse: null,
            mitte: mittelpunkt(punkte, step.maneuver?.location),
          })
        }
      }
      return segmente.length ? segmente : null
    },

    /** Leichter Erreichbarkeits-Ping für /api/health (T-471). Kurzer Timeout, wirft nie. */
    async ping() {
      // Stuttgart (lng,lat) — liegt sicher im DE-Graph. /nearest ist billiger als /route.
      const url = `${baseUrl.replace(/\/$/, "")}/nearest/v1/driving/9.18,48.78?number=1`
      const data = await fetchJson(url, {
        timeoutMs: 2000,
        fetchImpl,
        headers: { "User-Agent": "setreo-roadmap/1.0" },
      }).catch(() => null)
      return data?.code === "Ok"
    },
  }
}
