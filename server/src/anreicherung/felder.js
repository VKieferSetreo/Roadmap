// Was das Modell auslesen darf, und in welcher Form (T-657).
//
// Max, 31.08.2026: "gib ihm ALLE Felder, in denen wir aus der API nichts rausbekommen (nicht das,
// was wir regelbasiert füllen), und die soll er mit dem, was er da rausbekommt, auffüllen. Da gibt
// es unfassbar viele Infos, die nur nicht sauber formalisiert wurden."
//
// Gemessen am Bestand (73.152 aktive Hindernisse) ist der Leerstand tatsächlich enorm:
//   maxAchslastT 99,9 %   maxBreiteM 99,6 %   maxLaengeM 99,1 %   gekreuzteStrasse 98,3 %
//   getrageneStrasse 96,1 %   restbreiteM 95,9 %   maxGewichtT 92,7 %   spurenGesperrt 88,6 %
//   vollsperrung 86,4 %   maxHoeheM 83,1 %   verkehrsverbotLkwT 80,3 %
//
// WARUM DIE FRAGEN SO WEIT GEFASST SIND: die erste Fassung fragte nach "zulässiger Gesamtmasse",
// im Text steht aber "Lkw-Durchfahrtsverbot über 3,5 t". Das Modell fand nichts, obwohl die Zahl
// dastand. 447 von 2.049 als leer vermerkten Punkten trugen eine Maßzahl im Text. Eine Frage muss
// die Formulierung der Quelle treffen, nicht die des Datenmodells.
//
// KEINE ORTSFELDER. Wo etwas liegt, entscheidet der deterministische Weg (siehe extrakt.js).

/** Ausgeschriebene Zahlen. "nur EIN Fahrstreifen frei" ist die haeufigste Form in deutschen
 *  Meldungen, und ohne diese Tabelle scheiterte jede Fahrstreifen-Angabe am Belegriegel: die
 *  Ziffer 1 steht in solchen Texten nirgends. */
const WORTZAHL = {
  kein: 0, keine: 0, keinen: 0, null: 0,
  ein: 1, eine: 1, einen: 1, einem: 1, einer: 1, eins: 1,
  zwei: 2, drei: 3, vier: 4, fuenf: 5, fünf: 5, sechs: 6, sieben: 7, acht: 8,
}

/** Zahl aus deutscher Schreibweise. "3,80" wie "3.80", "ca. 4 m" wie "4", "ein" wie 1. */
export function zahl(s) {
  const roh = String(s ?? "")
  const t = roh.replace(/(\d),(\d)/g, "$1.$2").match(/-?\d+(?:\.\d+)?/)
  if (t) {
    const n = Number(t[0])
    if (Number.isFinite(n)) return n
  }
  for (const [wort, n] of Object.entries(WORTZAHL)) {
    if (new RegExp(`\\b${wort}\\b`, "i").test(roh)) return n
  }
  return null
}

/** Zahl in einem Bereich, sonst null. Die Grenzen sind der Schutz gegen falsch gelesene Zahlen:
 *  Baujahr, Stationierung und Bauwerksnummer stehen in denselben Texten. */
const spanne = (von, bis) => (roh) => {
  const n = zahl(roh)
  return n != null && n >= von && n <= bis ? n : null
}

/** Ja/Nein aus einem Text. Nur eindeutige Wörter, alles andere ist keine Aussage. */
function jaNein(roh) {
  const t = String(roh ?? "").toLowerCase().trim()
  if (/^(ja|true|1|vorhanden|zutreffend)$/.test(t)) return true
  if (/^(nein|false|0|nicht vorhanden|keine)$/.test(t)) return false
  return null
}

/**
 * Ein Ja/Nein-Feld braucht eine ANDERE Ableitbarkeitsprobe als ein Maß.
 *
 * Bei "maxHoeheM = 4,20" muss die 4,20 im Beleg stehen, das ist einfach. Bei
 * "vollsperrung = ja" steht im Beleg aber "Vollsperrung der K 82 in der Ortsdurchfahrt" — das
 * Wort "ja" kommt dort nie vor. Die erste Fassung verwarf deshalb genau die richtigen Antworten:
 * gemessen scheiterten 5 von 19 Verwerfungen an dieser Stelle, obwohl sie stimmten.
 *
 * Statt des Werts muss hier das STICHWORT im Beleg stehen. Damit bleibt der Riegel scharf (der
 * Beleg muss zum Feld passen), ohne die Aussage zu verlangen, die es in Textform nicht gibt.
 */
const stichwort = {
  vollsperrung: /vollsperr|voll gesperrt|komplett gesperrt|gesperrt/i,
  teilsperrung: /teilsperr|teilweise gesperrt|teilw\. gesperrt|halbseit|einseitig/i,
  halbseitig: /halbseit|einseitig|wechselseitig|(nord|süd|sued|ost|west)seite|eine\s+(fahrbahn|seite)|abwechselnd/i,
  fahrbahnVerengt: /verengt|verengung|eingeengt|fahrstreifen.*(weg|entf)/i,
  einbahnstrasse: /einbahn/i,
  sackgasse: /sackgasse|keine durchfahrt/i,
  nurNachts: /nacht|nächtlich|22:|23:|00:|01:|02:|03:|04:|05:/i,
  umleitung: /umleitung|umgeleitet|umfahrung/i,
}

/** Straßennummer mit Landkreiskürzel ("K BA 10"), siehe osrm.normRoadRefWeit. */
let normRef = null
export function setzeRefNormalisierer(fn) { normRef = fn }
const ref = (roh) => (normRef ? normRef(roh) : null)

/**
 * Der Katalog. Jedes Feld: die Frage an das Modell (in der Sprache der QUELLE, nicht des
 * Datenmodells) und die Formprobe, die den Wert annimmt oder verwirft.
 */
export const KATALOG = {
  // ── Maße ──────────────────────────────────────────────────────────────────
  maxHoeheM: {
    frage: "Lichte Durchfahrtshöhe in Metern? Auch als \"Höhenbeschränkung\", \"lichte Höhe\", \"max. Höhe\" oder Verkehrszeichen 265 formuliert.",
    pruefe: spanne(2, 10),
  },
  maxBreiteM: {
    frage: "Zulässige Durchfahrtsbreite in Metern? Auch \"Breitenbeschränkung\", \"max. Breite\", Zeichen 264.",
    pruefe: spanne(1.5, 25),
  },
  restbreiteM: {
    frage: "Verbleibende befahrbare Restbreite in Metern, etwa an einer Baustelle?",
    pruefe: spanne(1.5, 25),
  },
  maxLaengeM: {
    frage: "Zulässige Fahrzeuglänge in Metern? Auch \"Längenbeschränkung\", Zeichen 266.",
    pruefe: spanne(5, 200),
  },
  maxGewichtT: {
    frage: "Zulässige Gesamtmasse oder Tragfähigkeit in Tonnen? JEDE genannte Gewichtsgrenze für das ganze Fahrzeug zählt, gleich wie sie formuliert ist: \"Durchfahrtsverbot über … t\", \"Gewichtsbeschränkung\", \"Fahrverbot über … t\", \"Sperrung für Fahrzeuge über … t\", \"beschränkt auf … t\", \"Alleinfahrt ab … t\", Zeichen 262.",
    pruefe: spanne(2, 1000),
  },
  verkehrsverbotLkwT: {
    frage: "Lkw-Durchfahrtsverbot ab wie vielen Tonnen? Etwa \"Lkw-Durchfahrtsverbot über 3,5 t\", Zeichen 253.",
    pruefe: spanne(2, 60),
  },
  maxAchslastT: {
    frage: "Zulässige ACHSLAST in Tonnen (Last je Achse, nicht des ganzen Fahrzeugs)? Nur wenn ausdrücklich von Achslast oder Achsdruck die Rede ist, Zeichen 263.",
    pruefe: spanne(1, 30),
  },
  sperrlaengeM: {
    frage: "Länge des gesperrten oder eingeengten Abschnitts in Metern?",
    pruefe: spanne(5, 50000),
  },

  // ── Straßen (nur die Lage am Bauwerk, kein Ort) ───────────────────────────
  getrageneStrasse: {
    frage: "Welche Straße führt ÜBER das Bauwerk, wird also von ihm getragen? Bei \"X über Y\" ist X die getragene, bei \"im Zuge der X\" ebenfalls X.\n  Deutsche Straßenklassen: A = Autobahn, B = Bundesstraße, L = Landesstraße, K = Kreisstraße, St = Staatsstraße (Bayern und Sachsen), S = Staatsstraße (Sachsen). Kreisstraßen tragen oft ein Landkreiskürzel, etwa \"K\" gefolgt von zwei bis drei Buchstaben und einer Zahl.",
    pruefe: ref,
  },
  gekreuzteStrasse: {
    frage: "Welche Straße verläuft UNTER dem Bauwerk, wird also überquert? Bei \"X über Y\" ist Y die gekreuzte, bei \"Überführung der X über Y\" ebenfalls Y.",
    pruefe: ref,
  },

  // ── Art der Behinderung ───────────────────────────────────────────────────
  vollsperrung: { frage: "Ist die Straße voll gesperrt? (ja/nein)", pruefe: jaNein, belegMuster: stichwort.vollsperrung },
  teilsperrung: { frage: "Ist die Straße nur teilweise gesperrt? (ja/nein)", pruefe: jaNein, belegMuster: stichwort.teilsperrung },
  halbseitig: { frage: "Wird halbseitig gesperrt oder im Einbahnverkehr geführt? (ja/nein)", pruefe: jaNein, belegMuster: stichwort.halbseitig },
  fahrbahnVerengt: { frage: "Ist die Fahrbahn verengt? (ja/nein)", pruefe: jaNein, belegMuster: stichwort.fahrbahnVerengt },
  einbahnstrasse: { frage: "Ist es eine Einbahnstraße? (ja/nein)", pruefe: jaNein, belegMuster: stichwort.einbahnstrasse },
  sackgasse: { frage: "Ist es eine Sackgasse? (ja/nein)", pruefe: jaNein, belegMuster: stichwort.sackgasse },
  nurNachts: { frage: "Gilt die Maßnahme nur nachts? (ja/nein)", pruefe: jaNein, belegMuster: stichwort.nurNachts },
  umleitung: { frage: "Ist eine Umleitung eingerichtet? (ja/nein)", pruefe: jaNein, belegMuster: stichwort.umleitung },

  // ── Art und Zeit ──────────────────────────────────────────────────────────
  // Diese beiden hat das Modell im Test von sich aus geliefert ("sperrungArt=roadClosed",
  // "zeitfenster=08:00–15:00") und der Katalog wies sie als unbekanntes Feld ab. Genau solche
  // Angaben meint Max mit "unfassbar viele Infos, die nur nicht sauber formalisiert wurden".
  sperrungArt: {
    frage: "Um welche Art Sperrung handelt es sich? Antworte mit genau einem Wort: vollsperrung, teilsperrung, fahrstreifensperrung, richtungssperrung oder rampensperrung.",
    pruefe: (roh) => {
      const t = String(roh ?? "").toLowerCase().replace(/[^a-zäöüß]/g, "")
      const bekannt = ["vollsperrung", "teilsperrung", "fahrstreifensperrung", "richtungssperrung", "rampensperrung"]
      // Auch die englischen Begriffe der DATEX2-Quellen annehmen, sie stehen so in den Texten.
      const uebersetzt = { roadclosed: "vollsperrung", carriagewayclosed: "vollsperrung", lanesclosed: "fahrstreifensperrung", laneclosures: "fahrstreifensperrung" }
      const n = uebersetzt[t] ?? t
      if (bekannt.includes(n)) return n
      // Tippfehler und Kurzformen auffangen ("fahrenstreifen" statt "fahrstreifensperrung",
      // "vollsperr"). Ueber das Kernwort statt ueber den Wortanfang: das Modell verdreht die
      // Wortmitte, den Kern trifft es zuverlaessig.
      const kern = { voll: "vollsperrung", teil: "teilsperrung", fahr: "fahrstreifensperrung", spur: "fahrstreifensperrung", richtung: "richtungssperrung", rampe: "rampensperrung" }
      const treffer = [...new Set(Object.entries(kern).filter(([k]) => n.includes(k)).map(([, v]) => v))]
      return treffer.length === 1 ? treffer[0] : null
    },
    // Ein gesperrter Geh- oder Radweg ist KEINE Fahrbahnsperrung. In Produktion gefunden:
    // "Sperrung des Geh-/Radweges" wurde als Vollsperrung gefuehrt — fuer einen Schwertransport
    // ist das bedeutungslos, als Vollsperrung gelesen aber eine harte Aussage.
    belegMuster: /^(?!.*(geh-?\s*\/?\s*rad|gehweg|gehbahn|radweg|fu(ß|ss)weg|fu(ß|ss)g(ä|ae)nger))(?=.*(sperr|closed|closure|gesperrt)).*$/is,
  },
  zeitfenster: {
    // In Produktion gefunden: aus "von 19.08.2026 07:30 Uhr bis 03.09.2026 15:00 Uhr" wurde
    // "07:30-15:00". Das ist aber Beginn und Ende einer ZWEIWOECHIGEN Massnahme, kein taeglich
    // wiederkehrendes Fenster. Die Frage muss den Unterschied benennen, und der Beleg darf kein
    // Datum enthalten — steht dort eines, ist es eine Zeitspanne ueber Tage.
    frage: "Gilt die Maßnahme nur zu bestimmten TAGESZEITEN, die sich täglich wiederholen (etwa nachts oder werktags 8 bis 16 Uhr)? Dann HH:MM-HH:MM. Der Gesamtzeitraum der Maßnahme mit Datum zählt NICHT.",
    pruefe: (roh) => {
      const m = String(roh ?? "").match(/(\d{1,2})[:.]?(\d{2})?\s*(?:h|Uhr)?\s*(?:bis|-|–|—|to)\s*(\d{1,2})[:.]?(\d{2})?/i)
      if (!m) return null
      const h1 = Number(m[1]), h2 = Number(m[3])
      if (!(h1 >= 0 && h1 <= 24 && h2 >= 0 && h2 <= 24)) return null
      const zp = (h, min) => `${String(h).padStart(2, "0")}:${(min ?? "00").padStart(2, "0")}`
      return `${zp(h1, m[2])}-${zp(h2, m[4])}`
    },
    // Kein Datum im Beleg: "von 19.08.2026 07:30 Uhr bis 03.09.2026 15:00" ist ein Zeitraum
    // ueber Tage, kein Tagesfenster.
    belegMuster: /^(?!.*\d{1,2}\.\d{1,2}\.\d{2,4})(?=.*\d{1,2}\s*(?::|\.|h|Uhr)).*$/is,
  },

  // ── Fahrstreifen ──────────────────────────────────────────────────────────
  anzahlFahrstreifen: { frage: "Wie viele Fahrstreifen hat der Abschnitt insgesamt?", pruefe: spanne(1, 8) },
  spurenGesperrt: { frage: "Wie viele Fahrstreifen sind gesperrt?", pruefe: spanne(0, 8) },
  spurenFrei: { frage: "Wie viele Fahrstreifen bleiben befahrbar?", pruefe: spanne(0, 8) },
}

/** Felder, die NUR bei Bauwerken sinnvoll sind. Eine Baustelle hat keine getragene Straße, und
 *  danach zu fragen lädt zu Fehlschlüssen ein. */
export const NUR_BAUWERK = new Set(["getrageneStrasse", "gekreuzteStrasse"])

/**
 * Felder, die dieselbe Sache aus verschiedenen Blickwinkeln beschreiben. Steht eines davon schon
 * in der Quelle, wird nach den anderen nicht mehr gefragt.
 *
 * Der Anlass, gemessen am 31.08.2026: 1.063 Punkte mit "Lkw-Durchfahrtsverbot über 3,5 t" tragen
 * verkehrsverbotLkwT = 3,5 und wurden trotzdem nach maxGewichtT gefragt. Das Modell antwortete
 * dort — richtig — nichts, denn 3,5 t ist ein Verbot und keine Tragfähigkeit. Die Frage war also
 * jedes Mal ein verschenkter Aufruf, und sie lädt geradezu dazu ein, dieselbe Zahl ins zweite
 * Feld zu schreiben.
 */
const VERWANDT = [
  ["maxGewichtT", "verkehrsverbotLkwT", "maxAchslastT"],
  ["maxBreiteM", "restbreiteM"],
  ["vollsperrung", "teilsperrung", "sperrungArt"],
]

/** Welche Felder soll dieser Punkt beantworten? Nur, was die Quelle offen lässt — was sie sagt,
 *  gilt, und ein Modell soll es nicht "korrigieren". */
export function offeneFelderFuer(o) {
  const attrs = o?.attrs && typeof o.attrs === "object" ? o.attrs : {}
  const bauwerk = o?.kategorie === "bruecke" || o?.kategorie === "tunnel"
  // Welche Gruppen die Quelle schon beantwortet hat — danach wird gar nicht mehr gefragt.
  const beantwortet = new Set(
    VERWANDT.filter((gruppe) => gruppe.some((f) => attrs[f] != null)).flat(),
  )
  return Object.keys(KATALOG).filter(
    (f) => attrs[f] == null && !beantwortet.has(f) && (bauwerk || !NUR_BAUWERK.has(f)),
  )
}
