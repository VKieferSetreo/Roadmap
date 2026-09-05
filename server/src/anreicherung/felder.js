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
  // Benennt der Text EINEN bestimmten Fahrstreifen, ist genau einer gemeint. "linker
  // Fahrstreifen gesperrt" scheiterte sonst am Belegriegel, obwohl die Aussage eindeutig ist.
  linke: 1, linker: 1, linken: 1, rechte: 1, rechter: 1, rechten: 1,
  mittlere: 1, mittlerer: 1, mittleren: 1, ueberholspur: 1, überholspur: 1, standspur: 1,
}

/**
 * Ziffern, die zu einer KENNUNG gehoeren und nie eine Anzahl oder ein Mass sind.
 *
 * Der teuerste Einzelfehler des Belegriegels, gemessen an 786 aufgezeichneten Verwerfungen:
 * zahl("St2086 Isen … nur ein Fahrstreifen abwechselnd frei") lieferte 2086. Das Modell hatte
 * "spurenFrei = 1" geantwortet, voellig richtig, und der Riegel verwarf es, weil er die
 * Strassennummer fuer die Fahrstreifenzahl hielt. Betroffen war jede Meldung, die mit ihrer
 * Strassennummer beginnt — in Bayern ist das die Regel.
 */
// Bewusst eine LISTE echter Strassenklassen und kein allgemeines "Buchstaben vor Ziffern": das
// traefe auch "Ab 250 t" oder "Bis 12 t" und schluckte die Zahl, um die es gerade geht.
const KENNUNGEN = [
  /\bHaus-?\s?Nr\.?\s?\d+/gi,                      // "Haus-Nr. 4" — vor der Strassenregel
  /\b\d{1,2}\.\d{1,2}\.\d{2,4}\b/g,                // 06.09.2026
  /\b\d{4}-\d{2}-\d{2}\b/g,                        // 2026-09-06
  /\b\d{1,2}:\d{2}\b/g,                            // 18:00 — eine Uhrzeit ist keine Anzahl
  /\bK\s?[A-ZÄÖÜ]{1,3}\s?\d{1,4}\b/g,              // "K BA 10", "KT56" — mit Landkreiskuerzel
  /\b(?:BAB|St|Sta|EU|FS|NW|LKR|OD|A|B|K|L|S)\s?\d{1,5}\b/g, // St2086, B301, FS16, A7, L5
]

/** Zahl aus deutscher Schreibweise. "3,80" wie "3.80", "ca. 4 m" wie "4", "ein" wie 1. */
export function zahl(s) {
  let roh = String(s ?? "")
  for (const k of KENNUNGEN) roh = roh.replace(k, " ")
  const t = roh.replace(/(\d),(\d)/g, "$1.$2").match(/-?\d+(?:\.\d+)?/)
  if (t) {
    const n = Number(t[0])
    if (Number.isFinite(n)) return n
  }
  // Umlaute vorher aufloesen: "Ueberholspur" und "Überholspur" sind dasselbe Wort, und die
  // Quellen schreiben beides. Ohne diesen Schritt fand die Wortliste nur die eine Schreibweise.
  const flach = roh.toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
  for (const [wort, n] of Object.entries(WORTZAHL)) {
    const w = wort.replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue")
    // Mit Beugung: die Quellen schreiben "Sperrung DREIER Fahrstreifen" und "Sperrung EINES
    // Fahrstreifens". Ohne die Endungen scheiterte die Wortgrenze, und eine eindeutige Anzahl
    // ging verloren.
    if (new RegExp(`\\b${w}(er|en|em|es|e)?\\b`, "i").test(flach)) return n
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
/**
 * "Für beide Richtungen nur ein Fahrstreifen abwechselnd frei" — so meldet Bayern seine
 * Baustellen, fast wortgleich und tausendfach. Der Satz sagt dreierlei zugleich: die Fahrbahn ist
 * verengt, die Straße ist teilweise gesperrt, und es ist eine Fahrstreifensperrung. Keines der
 * Muster kannte die Formulierung, weil keines der Wörter "verengt", "Sperrung" oder "halbseitig"
 * darin vorkommt. Von 403 Verwerfungen mit einem Beleg AUS DER MELDUNG hingen 94 allein daran.
 */
const EINSPURIG = "nur ein(en|e)?\\s+(fahrstreifen|fahrspur|spur)|auf einen fahrstreifen|abwechselnd frei|einspurig"

/**
 * Ein gesperrter oder eingeengter GEH- ODER RADWEG ist fuer einen Schwertransport bedeutungslos.
 * Als Fahrbahneinschraenkung gelesen ist er eine harte Falschaussage — genau der Fehler, der am
 * 31.08.2026 in Produktion gefunden wurde ("Sperrung des Geh-/Radweges" als Vollsperrung
 * gefuehrt, 9.913 Eintraege verworfen). Der Ausschluss stand danach nur bei sperrungArt; bei
 * fahrbahnVerengt, teilsperrung und halbseitig ging dieselbe Meldung weiter durch.
 *
 * Die Pruefung ist bewusst KEIN reines Verbot: nennt der Beleg neben dem Gehweg auch die
 * Fahrbahn ("Vollsperrung; Einengung des Geh-/Radweges"), ist die Fahrbahnaussage echt und darf
 * nicht mit verworfen werden. Erst wo der Gehweg das einzige Objekt ist, wird abgewiesen.
 *
 * In FAHRBAHN steht mit Absicht kein "straße": Strassennamen kommen in fast jedem Beleg vor und
 * wuerden den Ausschluss wirkungslos machen.
 */
const GEHWEG = /geh-?\s*\/?\s*rad|gehweg|gehbahn|radweg|fu(ß|ss)weg|fu(ß|ss)g(ä|ae)nger/i
const FAHRBAHN = /fahrbahn|fahrstreifen|fahrspur|richtungsfahrbahn|vollsperr|durchfahrt/i
export const nurGehweg = (beleg) => GEHWEG.test(String(beleg ?? "")) && !FAHRBAHN.test(String(beleg ?? ""))

/**
 * VETO gegen „vollsperrung = ja", wenn der Beleg ein TEILOBJEKT sperrt (T-664/F6).
 *
 * `stichwort.vollsperrung` endet auf dem blanken „gesperrt", und das ist der Türöffner: „Ausfahrt
 * gesperrt", „Verbindungsfahrbahn gesperrt", „Parkbucht gesperrt" stützten damit eine Vollsperrung
 * der ganzen Straße. Gemessen am Bestand: von 2.900 Zeilen mit vollsperrung=true nennen nur 279
 * ausdrücklich eine Vollsperrung, die übrigen 2.621 tragen nur „gesperrt".
 *
 * Das blanke „gesperrt" darf trotzdem NICHT weg: „KU6 zwischen Willmersreuth und Heinersreuth
 * gesperrt" ist eine echte Vollsperrung, und solche Sätze sind die Mehrheit. Verworfen wird
 * deshalb nur, wo ein Teilobjekt das Sperrobjekt IST.
 *
 * STRECKE schlägt TEILOBJEKT, und das ist der Kern: in „B8 Passau Richtung Plattling zwischen
 * Passau und Ausfahrt Gaisbruck gesperrt" ist „Ausfahrt" ein Ortsname an der Abschnittsgrenze,
 * nicht das gesperrte Objekt. Ohne diesen Vorrang wären 41 echte Streckensperrungen mit
 * weggefallen. Geh-/Radweg steht bewusst NICHT in TEILOBJEKT (dafür gibt es `nurGehweg`), sonst
 * fiele „Richtungsfahrbahn gesperrt … Gehweg gesperrt, Radweg gesperrt" wegen des Gehwegs.
 *
 * Wirkung gemessen: 179 von 2.900 fallen (6,2 Prozent), Gegenprobe auf Streckensperrungen null.
 */
const TEILOBJEKT_GESPERRT =
  /ausfahrt|einfahrt|auffahrt|abfahrt|zufahrt|rampe|verbindungsfahrbahn|(ü|ue)berfahrt|(ü|ue)berleitung|anschlussstelle|fahrstreifen|fahrspur|\bspur\b|(ü|ue)berholspur|standstreifen|seitenstreifen|parkpl|rastpl|\bpwc\b|parkstreifen|parkbucht|rastanlage/i
const STRECKENBEZUG = /zwischen .{2,60} und |ortsdurchfahrt|richtungsfahrbahn|\bin h(ö|oe)he\b/i
const AUSDRUECKLICH_VOLL = /vollsperr|voll gesperrt|komplett gesperrt|gesamte.{0,20}gesperrt/i

export const nurTeilobjektGesperrt = (beleg, wert) => {
  if (wert !== true) return false // ein „nein" ist von Teilobjekten nicht betroffen
  const b = String(beleg ?? "")
  if (AUSDRUECKLICH_VOLL.test(b)) return false // die Quelle sagt es selbst
  if (STRECKENBEZUG.test(b)) return false // „zwischen X und Y" — Teilobjekt ist Ortsangabe
  return TEILOBJEKT_GESPERRT.test(b)
}

/**
 * PFLICHT-STICHWORT je Maßfeld (T-664/F5): der Beleg muss das Maß benennen, um das es geht.
 *
 * Der Wert-Abgleich allein reicht nicht. `zahl()` nimmt die erste Zahl im Beleg, und damit stützte
 * „Maximale Durchfahrtsbreite: 3,75 m" eine Achslast von 3,75 Tonnen. Gemessen am Bestand, und
 * zwar an den ANGENOMMENEN Angaben, nicht an den verworfenen:
 *   maxAchslastT   98 von 98 stammen aus einem Breitenbeleg. Ausnahmslos alle.
 *   maxLaengeM     38 von 41 falsch: „Länge: 19,08 km" ist die Strecke, nicht das Fahrzeug,
 *                  dazu Breiten und „Max. 80 km/h".
 *   sperrlaengeM   70 von 169 aus Straßennummern (FRG16, PAN30, PA50), Hausnummern
 *                  („Klenzestr. 35 - 49"), Kilometrierung („km 264+100"), Verkehrszeichen
 *                  („264/2,2 m") und einmal aus 55 STUNDEN („Sep 55-h-A7-VSp").
 *
 * Die Stichworte sind bewusst weit: „Verbot fuer ueber 3,5t" nennt das Wort Gewicht nicht und ist
 * trotzdem eine echte Gewichtsangabe, deshalb zählt auch eine Zahl mit angehängtem t. Verworfen
 * wird nur, wo der Beleg von etwas ANDEREM redet als das Feld.
 */
const TONNE_AM_WERT = String.raw`\d\s*(?:t|to)\b|tonn`
export const BELEG_NENNT = {
  maxHoeheM: /h(ö|oe)he|hoch|lichte|durchfahrtsh|265/i,
  maxBreiteM: /breite|breit|264/i,
  restbreiteM: /breite|breit|verengt|verengung|einengung|eingeengt/i,
  // „Länge: 9,76 km" ist die Streckenlänge. Eine Fahrzeuglängenbeschränkung heißt anders.
  maxLaengeM: /l(ä|ae)ngenbeschr|max\.?\s*l(ä|ae)nge|zul\.?\s*l(ä|ae)nge|fahrzeugl(ä|ae)nge|durchfahrtsl(ä|ae)nge|gespann|266/i,
  maxGewichtT: new RegExp(`gewicht|masse|traglast|tragf(ä|ae)hig|262|zul\\.?\\s?ges|${TONNE_AM_WERT}`, "i"),
  verkehrsverbotLkwT: new RegExp(`lkw|lastkraft|g(ü|ue)terkraft|253|${TONNE_AM_WERT}`, "i"),
  maxAchslastT: /achslast|achsdruck|achse|263/i,
  // „Haltverbot auf 17,50 m" nennt keine „Länge" und ist trotzdem eine, daher das Muster „auf N m".
  sperrlaengeM: /l(ä|ae)nge|lang|abschnitt|auf\s+[\d.,]+\s*m\b/i,
}

/** Eine in Kilometern genannte Zahl ist keine Fahrzeuglänge in Metern. */
export const laengeInKm = (beleg) => /\d\s*km\b/i.test(String(beleg ?? ""))

const stichwort = {
  vollsperrung: /vollsperr|voll gesperrt|komplett gesperrt|gesperrt/i,
  teilsperrung: new RegExp(`teilsperr|teilweise gesperrt|teilw\\. gesperrt|halbseit|einseitig|${EINSPURIG}`, "i"),
  halbseitig: /halbseit|einseitig|wechselseitig|(nord|süd|sued|ost|west)seite|eine\s+(fahrbahn|seite)|abwechselnd/i,
  fahrbahnVerengt: new RegExp(`verengt|verengung|einengung|eingeengt|schmaler|fahrstreifen.*(weg|entf)|${EINSPURIG}`, "i"),
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
    belegNennt: BELEG_NENNT.maxHoeheM,
    frage: "Lichte Durchfahrtshöhe in Metern? Auch als \"Höhenbeschränkung\", \"lichte Höhe\", \"max. Höhe\" oder Verkehrszeichen 265 formuliert.",
    pruefe: spanne(2, 10),
  },
  maxBreiteM: {
    belegNennt: BELEG_NENNT.maxBreiteM,
    frage: "Zulässige Durchfahrtsbreite in Metern? Auch \"Breitenbeschränkung\", \"max. Breite\", Zeichen 264.",
    pruefe: spanne(1.5, 25),
  },
  restbreiteM: {
    belegNennt: BELEG_NENNT.restbreiteM,
    frage: "Verbleibende befahrbare Restbreite in Metern, etwa an einer Baustelle?",
    pruefe: spanne(1.5, 25),
  },
  maxLaengeM: {
    belegNennt: BELEG_NENNT.maxLaengeM,
    belegVeto: laengeInKm,
    frage: "Zulässige Fahrzeuglänge in Metern? Auch \"Längenbeschränkung\", Zeichen 266.",
    pruefe: spanne(5, 200),
  },
  maxGewichtT: {
    belegNennt: BELEG_NENNT.maxGewichtT,
    frage: "Zulässige Gesamtmasse oder Tragfähigkeit in Tonnen? JEDE genannte Gewichtsgrenze für das ganze Fahrzeug zählt, gleich wie sie formuliert ist: \"Durchfahrtsverbot über … t\", \"Gewichtsbeschränkung\", \"Fahrverbot über … t\", \"Sperrung für Fahrzeuge über … t\", \"beschränkt auf … t\", \"Alleinfahrt ab … t\", Zeichen 262.",
    pruefe: spanne(2, 1000),
  },
  verkehrsverbotLkwT: {
    belegNennt: BELEG_NENNT.verkehrsverbotLkwT,
    frage: "Lkw-Durchfahrtsverbot ab wie vielen Tonnen? Etwa \"Lkw-Durchfahrtsverbot über 3,5 t\", Zeichen 253.",
    pruefe: spanne(2, 60),
  },
  maxAchslastT: {
    belegNennt: BELEG_NENNT.maxAchslastT,
    frage: "Zulässige ACHSLAST in Tonnen (Last je Achse, nicht des ganzen Fahrzeugs)? Nur wenn ausdrücklich von Achslast oder Achsdruck die Rede ist, Zeichen 263.",
    pruefe: spanne(1, 30),
  },
  sperrlaengeM: {
    belegNennt: BELEG_NENNT.sperrlaengeM,
    frage: "Länge des gesperrten oder eingeengten Abschnitts in Metern?",
    pruefe: spanne(5, 50000),
  },

  // ── Straßen (nur die Lage am Bauwerk, kein Ort) ───────────────────────────
  getrageneStrasse: {
    // Die Abkürzungen stehen hier, weil die Bauwerksverzeichnisse fast nur aus ihnen bestehen:
    // "UF Naesse Hofbieber, UeF L 3258, UF WiWeg" nennt eine Straße, und das Modell las sie nicht,
    // weil ihm niemand gesagt hat, was UeF heißt. Gemessen an 1.010 Punkten mit Leermeldung war
    // das der häufigste Grund, aus dem eine Straße im Namen unerkannt blieb.
    frage: "Welche Straße führt ÜBER das Bauwerk, wird also von ihm getragen? Bei \"X über Y\" ist X die getragene, bei \"im Zuge der X\" ebenfalls X.\n  Abkürzungen der Bauwerksverzeichnisse: ÜF/UeF/UEF = Überführung (die genannte Straße führt OBEN), UF = Unterführung (die genannte Straße führt UNTEN), BW = Bauwerksnummer (keine Straße), EÜ = Eisenbahnüberführung.\n  Deutsche Straßenklassen: A = Autobahn, B = Bundesstraße, L = Landesstraße, K = Kreisstraße, St = Staatsstraße (Bayern und Sachsen), S = Staatsstraße (Sachsen). Kreisstraßen tragen oft ein Landkreiskürzel, etwa \"K\" gefolgt von zwei bis drei Buchstaben und einer Zahl.",
    pruefe: ref,
  },
  gekreuzteStrasse: {
    frage: "Welche Straße verläuft UNTER dem Bauwerk, wird also überquert? Bei \"X über Y\" ist Y die gekreuzte, bei \"Überführung der X über Y\" ebenfalls Y.\n  Bei \"UF X\" (Unterführung) ist X die gekreuzte Straße. Ein Gewässer, ein Weg oder eine Bahnstrecke ist KEINE Straße — dann gibt es hier nichts zu melden.",
    pruefe: ref,
  },

  // ── Art der Behinderung ───────────────────────────────────────────────────
  vollsperrung: { frage: "Ist die Straße voll gesperrt? (ja/nein)", pruefe: jaNein, belegMuster: stichwort.vollsperrung, belegVeto: nurTeilobjektGesperrt },
  teilsperrung: { frage: "Ist die Straße nur teilweise gesperrt? (ja/nein)", pruefe: jaNein, belegMuster: stichwort.teilsperrung },
  halbseitig: { frage: "Wird halbseitig gesperrt oder im Einbahnverkehr geführt? (ja/nein)", pruefe: jaNein, belegMuster: stichwort.halbseitig },
  fahrbahnVerengt: { frage: "Ist die Fahrbahn verengt? (ja/nein)", pruefe: jaNein, belegMuster: stichwort.fahrbahnVerengt },
  einbahnstrasse: { frage: "Ist es eine Einbahnstraße? (ja/nein)", pruefe: jaNein, belegMuster: stichwort.einbahnstrasse },
  sackgasse: { frage: "Ist es eine Sackgasse? (ja/nein)", pruefe: jaNein, belegMuster: stichwort.sackgasse },
  nurNachts: { frage: "Gilt die Maßnahme nur nachts? (ja/nein)", pruefe: jaNein, belegMuster: stichwort.nurNachts },
  // "eingerichtet" war zu eng: die Quellen schreiben fast durchgängig "empfohlene Umleitung: über
  // …". Gemessen 32 Punkte, bei denen die Umleitung wörtlich im Text stand und das Feld leer blieb.
  umleitung: { frage: "Ist eine Umleitung eingerichtet, ausgewiesen oder empfohlen? (ja/nein)", pruefe: jaNein, belegMuster: stichwort.umleitung },

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
    // Einspurige Verkehrsfuehrung IST eine Fahrstreifensperrung, auch wenn das Wort "Sperrung"
    // in der Meldung nicht vorkommt — sonst faellt die haeufigste bayerische Formulierung durch.
    // Den Geh-/Radweg-Ausschluss uebernimmt jetzt FAHRBAHN_FELDER, einheitlich fuer alle Felder,
    // die sich auf die befahrbare Flaeche beziehen.
    belegMuster: new RegExp(`sperr|closed|closure|gesperrt|${EINSPURIG}`, "i"),
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

/** Felder, die sich auf die BEFAHRBARE Fläche beziehen. Für sie gilt `nurGehweg`: eine Meldung,
 *  die ausschließlich den Geh- oder Radweg betrifft, sagt über sie nichts aus. */
export const FAHRBAHN_FELDER = new Set([
  "vollsperrung", "teilsperrung", "halbseitig", "fahrbahnVerengt", "sperrungArt",
  "spurenGesperrt", "spurenFrei", "anzahlFahrstreifen", "sperrlaengeM", "restbreiteM", "maxBreiteM",
])

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

/**
 * Feldnamen, die das Modell erfindet, auf die echten abbilden. Gemessen: es antwortete mit
 * "fahrstreifensperrung", was es im Katalog nicht gibt — gemeint war sperrungArt. Die Angabe
 * wegzuwerfen, nur weil der Name daneben liegt, verschenkt eine richtige Aussage.
 */
export const FELD_ALIAS = {
  fahrstreifensperrung: "sperrungArt",
  vollsperrungArt: "sperrungArt",
  sperrung: "sperrungArt",
  sperrart: "sperrungArt",
  hoehe: "maxHoeheM",
  breite: "maxBreiteM",
  gewicht: "maxGewichtT",
  laenge: "maxLaengeM",
  achslast: "maxAchslastT",
  zeitraum: "zeitfenster",
}

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
