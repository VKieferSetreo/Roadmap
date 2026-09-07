// Connector Quelle 0153: BASt Brückenstatistik Deutschland — Bauwerke mit SV-Kennzeichnung.
// Research-Fund 2026-06-22 (T-540). Bundesweiter offener ArcGIS-FeatureServer (CC BY 4.0), der
// EINZIGE flächige offene Brücken-Restriktionsquelle über alle Bundesländer (Bundesfernstraßen:
// BAB + Bundesstraßen). Wir ziehen NUR die Teilbauwerke mit sperrung_sv='ja' — die ~49k übrigen
// sind reine Infrastruktur und gehören NICHT in die Auswertung.
//
// WAS sperrung_sv BEDEUTET, IST NICHT DOKUMENTIERT (T-703, nachgeprüft am 06.09.2026). Hier stand
// früher „= harte GST-Sperrung". Das war eine Annahme, und sie ist widerlegt:
//   1. Das Feld steht NICHT in der BASt-Brückenstatistik. Deren offizielle CSV führt 17 Spalten
//      (id_nr … zustandsnotenklasse), sperrung_sv ist keine davon.
//   2. Der Dienst gehört esri_DE_content, nicht der BASt. Die Item-Beschreibung erklärt jede
//      Zustandsnotenklasse einzeln, zu sperrung_sv kein Wort; die BASt-Seite ebenso wenig.
//   3. Die Verteilung widerlegt jede Zustands-Lesart: bei sperrung_sv='ja' trägt der
//      Traglastindex 2.073 mal Stufe I (keine Defizite) und nur 190 mal Stufe V. Umgekehrt haben
//      2.187 Bauwerke mit Stufe V ein sperrung_sv='nein'. Wäre das Feld eine Folge des
//      Bauzustands, müsste es genau andersherum aussehen. 3.294 von 52.553 tragen 'ja'.
//
// Deshalb bleibt die Auswertung bei „auflagenpflichtig, Tragfähigkeit prüfen" (rules.js, T-601)
// und macht daraus KEINE Sperrung: das ist die Lesart, die durch die Daten gedeckt ist. Wer das
// später schärfen will, braucht erst eine Auskunft der BASt, keine neue Vermutung.
//
// WICHTIG (Welle-2-Korrektur): ASCII-URL ist tot (HTTP 400) → URL-encoded, Layer Brueckenstatistik25.
// f=geojson&outSR=4326 → WGS84 direkt. maxRecordCount=2000 → Paging über resultOffset. 3294 Treffer.
// breite (cm) ist die BAUWERKSbreite (Konstruktion), KEINE Fahrzeug-Breitenrestriktion → NICHT als
// maxBreiteM mappen (wäre Fehlalarm). zn=Zustandsnote (×10), trag_l_idx=Index I-V (keine Tonne).
// Einzige evaluierbare Restriktion = die SV-Sperrung → grundsaetzlicheGstSperre. Beschreibung
// bewusst OHNE m/t-Tokens, damit makeNormalized→extractStammdaten keine Scheinwerte zieht.

import { makeNormalized, getJson, stabilHash } from "./_helpers.js"

const QUELLE = "0153"
// Name geändert am 06.09.2026 (T-703): „schwerverkehrsgesperrt" behauptet eine Sperrung, die aus
// dem Feld nicht ableitbar ist (siehe Kopfkommentar). Die Funde sagen „auflagenpflichtig", der
// Quellenname muss dasselbe sagen — sonst widerspricht das Register dem Fund.
const QUELLE_NAME = "BASt Brückenstatistik — Brücken mit Auflagen für Schwertransporte (bundesweit)"
const BASE = "https://services2.arcgis.com/jUpNdisbWqRpMo35/arcgis/rest/services/Br%C3%BCckenstatistik_Deutschland/FeatureServer/0"
const LAYER = `${BASE}/query`

function ersteKoordinate(geom) {
  const c = geom?.coordinates
  if (!Array.isArray(c)) return [null, null]
  let cur = c
  while (Array.isArray(cur) && Array.isArray(cur[0])) cur = cur[0]
  const lng = Number(cur?.[0]), lat = Number(cur?.[1])
  return Number.isFinite(lng) && Number.isFinite(lat) ? [lng, lat] : [null, null]
}

const clean = (s) => String(s ?? "").replace(/\s+/g, " ").trim()

// Traglastindex in Klartext (BASt-Skala I–V: I = erfüllt die Zieltragfähigkeit ohne bauliche
// Defizite, V = stärkste Defizite — KEINE Tonnage, sondern eine Tragfähigkeits-Defizitstufe).
// GST-Auflagenpflicht besteht unabhängig davon; die Stufe gibt das strukturelle Risiko.
const TLI = {
  I: "Stufe I/V — keine Tragfähigkeits-Defizite (baulich erfüllt)",
  II: "Stufe II/V — geringe Tragfähigkeits-Defizite",
  III: "Stufe III/V — mittlere Tragfähigkeits-Defizite",
  IV: "Stufe IV/V — deutliche Tragfähigkeits-Defizite",
  V: "Stufe V/V — stärkste Tragfähigkeits-Defizite",
}
function traglastindexText(raw) {
  const v = clean(raw)
  if (!v || v === "-" || v === "*") return null
  return `Traglastindex ${TLI[v] ?? v}` // GR/kZN/>GR unbekannt → roh durchreichen
}

/**
 * Ein Sachverhalt-Feld auseinandernehmen (T-702, gemessen am 07.09.2026 an allen 3.294
 * Datensätzen mit sperrung_sv='ja').
 *
 * DIE ANNAHME, DIE HIER FRÜHER STAND, IST WIDERLEGT. Die alte Fassung nahm mit
 * /\b(A|B|L|K|St)\s?0*(\d{1,4})\b/ den ERSTEN Straßen-Treffer im Feldtext, weil die Felder
 * angeblich längeren Fließtext mit mehreren Nummern tragen. Nachgezählt: sie tun es NICHT.
 * Beide Felder haben über den ganzen Bestand nur 36 bzw. 34 verschiedene Formen, und in KEINER
 * einzigen steht mehr als eine klassifizierte Nummer (Histogramm der Treffer je Feld:
 * oben 419×keine / 2.875×genau eine, unten 2.091×keine / 1.203×genau eine). Ein Verankern der
 * Nummer am Feldanfang statt „irgendwo im Text" ändert deshalb an 0 von 3.294 Datensätzen etwas.
 * Die Nummer war nie das Problem — die LAGE war es.
 *
 * DAS FELD IST "«Lage»: «Sachverhalt»", die Lage nach ASB-ING Anhang D6, und sie kennt DREI
 * Werte, nicht zwei: O (oben liegend), U (unten liegend) und E. Belegt ist das über das
 * Nachbarfeld jast_lage ("Lage entsprechend der Jahresstatistik nach ASB-ING Anhang D6"),
 * das dieselbe Vokabel führt ("O: Bundesautobahn", "U: Bundesstraße", "E: Bundesstraße") und
 * mit dem Präfix von hoechst_sachverhalt_oben in 115 von 116 E-Fällen übereinstimmt.
 * Der führende "*" markiert den maßgebenden Sachverhalt und sagt nichts über die Lage.
 *
 * DESHALB PRÜFT refAus DIE LAGE. Vorher las es hoechst_sachverhalt_oben blind als „getragen":
 * 116 Bauwerke tragen dort ein E, und bei ihnen liegt die Straße WEDER oben NOCH unten, das
 * Bauwerk ist ihr nur zugeordnet. Nachgelesen in den Namen: 90 dieser 116 (78 Prozent) nennen
 * ausdrücklich etwas, worauf ein Schwertransport nie fährt — "Radwegholzbrücke über den
 * Bullengraben" (E: B 188), "B 238, Busbucht / Hellbach", "Forstweg über WL Saale neben
 * B 240", "Radweg (seitl. B516) über Möhne", "UF Durchlass". Für die trug die Quelle bisher
 * getrageneStrasse = diese Bundesstraße, und die Engine machte daraus auf einer Route über
 * genau diese Straße ein „bewiesen: du fährst darüber". Das war eine Behauptung ohne Grundlage.
 *
 * Die S-KLASSE fehlte: Sachsen und Bayern liefern ihre Staatsstraßen hier als "S 8"/"S 2239",
 * und das alte Muster kannte nur "St". 28 Datensätze verloren ihre Nummer dadurch komplett.
 * "S" wird wie in normRoadRef (external/osrm.js) auf "ST" abgebildet, sonst vergleicht die
 * Engine zwei verschiedene Schreibweisen derselben Straße.
 *
 * `ast` = die Straße ist hier nur als RAMPE vertreten ("U: A 1 (Ast)"). Auch das ist keine
 * Erfindung: jast_lage führt "Ast der Bundesautobahn" als eigenen Lagewert neben
 * "Bundesautobahn". Wofür das gebraucht wird, steht unten an der Zuweisung.
 */
const SACHVERHALT = /^\*?\s*([OUE])\s*:\s*(.*)$/i
// Verankert am Anfang des Sachverhalts, nicht "irgendwo": was hier steht, IST die Straße dieses
// Feldes. Gemessen ohne Wirkung auf den Bestand (siehe oben), aber es hält die Zusage der
// Funktion — sie liefert die Nummer, die in DIESEM Feld gemeint ist, nicht die nächstbeste.
const REF_AM_ANFANG = /^(A|B|L|K|St|S)\s?0*(\d{1,4})\b/i

function sachverhalt(feld) {
  const m = clean(feld).match(SACHVERHALT)
  if (!m) return null // 0 von 3.294 Feldern kommen ohne Lage-Präfix — Unbekanntes schweigt
  const rest = m[2]
  const r = rest.match(REF_AM_ANFANG)
  const klasse = r ? r[1].toUpperCase() : null
  return {
    lage: m[1].toUpperCase(),
    ast: /\(\s*Ast\s*\)/i.test(rest),
    ref: r ? (klasse === "S" ? "ST" : klasse) + r[2] : null,
  }
}

/** Straßen-Ref eines Sachverhalt-Feldes, aber NUR wenn seine Lage die erwartete ist. */
export function refAus(feld, lage) {
  const s = sachverhalt(feld)
  return s && s.lage === lage && s.ref ? s.ref : undefined
}

async function ladeAlle({ pageSize = 2000, maxPages = 50, timeoutMs = 45000 } = {}) {
  const all = []
  for (let page = 0; page < maxPages; page++) {
    const url = `${LAYER}?where=${encodeURIComponent("sperrung_sv='ja'")}` +
      `&outFields=${encodeURIComponent("id_nr,bwnr,tbwnr,bauwerksname,zn,trag_l_idx,ort,kreis,bl,hoechst_sachverhalt_oben,hoechst_sachverhalt_unten")}` +
      `&outSR=4326&f=geojson&resultRecordCount=${pageSize}&resultOffset=${page * pageSize}`
    const data = await getJson(url, { timeoutMs })
    const feats = data?.features ?? []
    all.push(...feats)
    if (feats.length < pageSize) break
  }
  return all
}

export const bastBrueckenConnector = {
  quelleId: QUELLE,
  name: QUELLE_NAME,
  schedule: "0 4 * * *", // 1× täglich nachts — Brücken-Sperrlisten ändern sich langsam
  vollbestand: true, // wir ziehen den GESAMTEN sperrung_sv='ja'-Bestand → Reconcile räumt aufgehobene Sperrungen

  async fetch({ timeoutMs = 45000, log = () => {} } = {}) {
    const feats = await ladeAlle({ timeoutMs })
    log(`${QUELLE}: ${feats.length} Brücken mit SV-Kennzeichnung`)

    const obstacles = feats.map((f) => {
      const p = f.properties ?? {}
      const [lng, lat] = ersteKoordinate(f.geometry)
      // Beschreibung OHNE m/t-Einheiten (sonst extractStammdaten-Scheinwerte). Zustandsnote (zn)
      // bewusst NICHT ausgegeben — inkonsistent kodiert (mal ×10, mal roh) und ohnehin keine
      // GST-Restriktion. Traglastindex (I–V/GR) trägt keine Einheit → unkritisch.
      const idx = traglastindexText(p.trag_l_idx)
      const oben = sachverhalt(p.hoechst_sachverhalt_oben)
      const unten = sachverhalt(p.hoechst_sachverhalt_unten)
      // Nur Lage O trägt. Lage E heißt „zugeordnet, aber weder oben noch unten" (116 Bauwerke).
      const getragen = oben?.lage === "O" ? oben.ref : null
      // WENN UNTEN NUR EIN AST DERSELBEN STRASSE LIEGT, IST DAS KEINE GEKREUZTE STRASSE (T-702).
      // 66 Bauwerke sehen so aus: "*O: A 39" oben, "U: A 39 (Ast)" unten. Die Engine verglich
      // zwei gleiche Werte, hielt die Angabe für kaputt (engine/index.js `brauchbar`) und warf
      // BEIDE weg — auf einer A39-Route blieb „unbestimmt", obwohl das Bauwerk erklärtermaßen
      // die A39 trägt. Die Namen sagen es ausdrücklich: "BSW 3 über A 39-Ast(Rampe 702)",
      // "Brücke A73 über Äste der AS LIF-Nord", "A 1 / Äste A 1 [AS Heiligenhafen Mitte]".
      // Gemessen: 65 Urteile kippen dadurch von „unbestimmt" auf „bewiesen", KEIN einziges auf
      // „widerlegt" — die Regel kann nur bestätigen, nie freisprechen.
      //
      // NUR bei GLEICHER Straße. Ein Ast einer ANDEREN Straße unten bleibt stehen, sonst gingen
      // 10 richtige Verwerfungen verloren ("Geh- u. Radwegbrücke" über einem B433-Ast: dort
      // fahren wir unten durch, der Fund gehört weg).
      //
      // Die Gegenrichtung — Ast OBEN, Hauptfahrbahn unten ("O: A 10 (Ast)" / "*U: A 10", 64
      // Bauwerke) — bleibt bewusst unangetastet und damit weiter stumm. Sie aufzulösen hieße
      // 33 Funde zu LÖSCHEN, gestützt auf die Annahme, die Route liege auf der Hauptfahrbahn
      // und nicht auf der Rampe. Die Annahme lässt sich aus den Daten nicht belegen, und
      // Freisprechen darf nur, wer sicher ist.
      //
      // LAGE E MACHT AUCH DAS UNTEN-FELD STUMM (nachgetragen 07.09.2026). Steht oben ein E
      // ("zugeordnet, aber weder oben noch unten"), sagt die Quelle über die Höhenlage GAR
      // NICHTS — dann darf das Unten-Feld allein erst recht nicht löschen. Ohne diese Zeile
      // entstand genau der Fehler, gegen den T-702 steht: `getragen` fiel weg, `gekreuzt` blieb,
      // und in der Engine greift `if (untenGefahren && !obenGefahren) return "widerlegt"` VOR
      // jeder Namensprüfung — die Sicherungen `quellenWidersprechen` und `ausName` kommen dort
      // gar nicht mehr zum Zug. Gemessen an allen 3.294 Quellsätzen mit einem Zwei-Straßen-Fenster
      // (Autobahnkreuz): 4 Bauwerke kippten von „bewiesen" auf „widerlegt", der Fund verschwand.
      // Klarster Fall: O="*E: A 14", U="U: A 2", Name „Kreuzungsbauwerk A14 über A2" — der Name
      // sagt ausdrücklich, dass das Bauwerk die A14 TRÄGT, und genau dieser Fund fiel weg.
      // Betroffen sind die 6 E-Datensätze mit Unten-Ref; sie sind jetzt wieder vollständig stumm
      // und laufen damit in die Namensheuristik, wie jedes Bauwerk ohne Strukturfeld.
      const gekreuzt =
        oben?.lage === "E"
          ? null
          : unten?.lage === "U" && !(unten.ast && unten.ref === getragen)
            ? unten.ref
            : null
      const ortBl = [clean(p.ort), clean(p.bl)].filter(Boolean).join(", ")
      // T-601: NICHT "gesperrt" — sperrung_sv='ja' = die Brücke ist in der BASt-Liste der für
      // Großraum-/Schwertransporte (GST) TRAGFÄHIGKEITSRELEVANTEN Bauwerke. Die Strecke ist offen;
      // für GST ist die Tragfähigkeit (Traglastindex) gegen das Transportgewicht zu prüfen
      // (Auflage/Einzelfallgenehmigung möglich). "gesperrt" wäre eine Falschaussage (Max 2026-06-27).
      // T-603: NICHT "tragfähigkeitsbeschränkt" — das liest sich im selben Satz mit "Traglastindex
      // Stufe I — keine Defizite" widersprüchlich (267 Funde). sperrung_sv='ja' = die Brücke steht auf
      // der GST-Liste = für Großraum-/Schwertransporte AUFLAGENPFLICHTIG (Tragfähigkeit gegen das
      // Transportgewicht prüfen, Einzelfallgenehmigung möglich) — das ist unabhängig vom Traglastindex
      // (Listung ≠ reduzierte Kapazität). So bleibt der Satz mit "Stufe I — keine Defizite" konsistent.
      const beschreibung = ["Für Großraum-/Schwertransporte auflagenpflichtig — Tragfähigkeit prüfen (BASt-Brückenstatistik)", idx, ortBl]
        .filter(Boolean).join(". ") || null
      // Stabile externeId: Bauwerks- + Teilbauwerksnummer (ändern sich nicht) + Geo-Hash als Diskriminator.
      const externeId = `${clean(p.bwnr) || "x"}-${clean(p.tbwnr) || "0"}#${stabilHash(lat, lng, p.id_nr)}`
      return makeNormalized({
        externeId,
        kategorie: "bruecke",
        name: clean(p.bauwerksname) || `Brücke ${clean(p.bwnr)}`,
        beschreibung,
        lat, lng,
        // T-610: angezeigte Straße = die GETRAGENE (vom Transport befahrene) Straße, nicht die gekreuzte
        // Unterführungsstraße. Vorher zog makeNormalized die Straße aus dem rohen Bauwerksnamen → oft die
        // gekreuzte (B49/K155) statt der Route-Straße (A5/A7) → irreführendes Label auf ~108/305 Brücken.
        //
        // T-702: hier steht bewusst `oben.ref` und NICHT `getragen` — das Label darf die Straße auch
        // bei Lage E nennen ("Radwegbrücke an der B 188"), denn es verortet nur und beweist nichts:
        // für Brücken zieht die Engine aus strassenRef kein Urteil (engine/index.js prüft dort
        // ausdrücklich !istBauwerk). Gemessen ändert sich die Anzeige an 9 von 3.294 Bauwerken, und
        // zwar nur nach oben: die S-Klasse liefert 9 Labels, die vorher ganz fehlten.
        strassenRef: oben?.ref ?? undefined,
        attrs: {
          grundsaetzlicheGstSperre: true, // sperrung_sv='ja' = harte GST-Sperrung
          // T-601: getragene (oben) + gekreuzte (unten) Straße → Engine-Überführungsfilter.
          // Route auf der getragenen Straße = fährt DRÜBER (behalten); Route auf der gekreuzten
          // Straße = fährt DRUNTER durch = Überführung (raus).
          getrageneStrasse: getragen ?? undefined,
          gekreuzteStrasse: gekreuzt ?? undefined,
        },
        quelleName: QUELLE_NAME, quelleUrl: "https://www.bast.de",
      })
    })

    const ids = new Set(obstacles.map((o) => o.externeId))
    if (ids.size !== obstacles.length) {
      log(`${QUELLE}: WARN externeId-Kollision — ${obstacles.length} Features, ${ids.size} distinct`)
    }
    return { obstacles }
  },
}
