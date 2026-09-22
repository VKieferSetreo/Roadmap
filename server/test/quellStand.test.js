// Was zaehlt als "Aenderung"? (T-760)
//
// Max' Definition, woertlich: "wir wollen nur das wenn quelle X eine baustelle bsp vom 01-03
// meldet und dann auf 01-05 verlaengert das das als veraenderung zaehlt. nicht was WIR mit den
// Daten machen." Jeder Fall hier ist an Prod-Daten vom 22.09.2026 gemessen, nicht ausgedacht.

import { describe, expect, it } from "vitest"
import { quellStand, standDiff, STAND_VERSION } from "../src/obstaclesRepo.js"

const stand = (o) => quellStand({ externeId: "ext-1", attrs: {}, ...o })

describe("quellStand / standDiff", () => {
  it("meldet Max' Beispiel: Baustelle wird von 01-03 auf 01-05 verlaengert", () => {
    const alt = stand({ gueltigVon: "2026-01-01", gueltigBis: "2026-03-01" })
    const neu = stand({ gueltigVon: "2026-01-01", gueltigBis: "2026-05-01" })
    expect(standDiff(alt, neu)).toEqual({ gueltigBis: ["2026-03-01", "2026-05-01"] })
  })

  it("meldet auch eine Verkuerzung — beide Richtungen sind eine Aussage der Quelle", () => {
    const alt = stand({ gueltigVon: "2026-01-01", gueltigBis: "2026-05-01" })
    const neu = stand({ gueltigVon: "2026-01-01", gueltigBis: "2026-03-01" })
    expect(standDiff(alt, neu)).toEqual({ gueltigBis: ["2026-05-01", "2026-03-01"] })
  })

  it("schweigt, wenn nur der BEGINN rollt — das ist unser Parser, nicht die Behoerde", () => {
    // Die Autobahn-Beschreibung listet jeden Termin ("22.09." / "23.09." / "28.09."); wir nehmen
    // den ersten. Faellt der abgelaufene ueber Nacht aus dem Text, wandert der Beginn.
    // 258 der 302 Eintraege vom 22.09.2026 hatten genau diese Signatur.
    const alt = stand({ gueltigVon: "2026-09-21", gueltigBis: "2026-09-25" })
    const neu = stand({ gueltigVon: "2026-09-22", gueltigBis: "2026-09-25" })
    expect(standDiff(alt, neu)).toBeNull()
  })

  it("schweigt bei Name, Kategorie und weichen attrs", () => {
    const alt = quellStand({ externeId: "e", gueltigBis: "2026-05-01", kategorie: "baustelle", name: "A2 Ost", attrs: { zeitfenster: "10:00–14:00", nurNachts: true } })
    const neu = quellStand({ externeId: "e", gueltigBis: "2026-05-01", kategorie: "sperrung", name: "A2 West", attrs: { zeitfenster: "12:00–16:00", nurNachts: false } })
    expect(standDiff(alt, neu)).toBeNull()
  })

  it("meldet eine echte Restriktionsaenderung: Restbreite 3,5 m auf 2,75 m", () => {
    const alt = stand({ gueltigBis: "2026-05-01", attrs: { restbreiteM: 3.5 } })
    const neu = stand({ gueltigBis: "2026-05-01", attrs: { restbreiteM: 2.75 } })
    expect(standDiff(alt, neu)).toEqual({ restbreiteM: [3.5, 2.75] })
  })

  it("schweigt bei Restriktionswerten AGGREGIERTER Zeilen — die mergen wir selbst", () => {
    // externe_id mit "#": mergeAutobahnGruppe/dedupeObstacles mergen restbreiteM ueber die
    // Gruppenmitglieder, die heute im Feed stehen. Wechselt die Gruppe, wechselt der Wert,
    // ohne dass jemand etwas gemeldet haette. Betroffen waren 42 der 293 Eintraege.
    const alt = quellStand({ externeId: "2026-0464#dup3", gueltigBis: "2026-05-01", attrs: { restbreiteM: 2.9 } })
    const neu = quellStand({ externeId: "2026-0464#dup3", gueltigBis: "2026-05-01", attrs: { restbreiteM: 3.5 } })
    expect(standDiff(alt, neu)).toBeNull()
    // Das ENDE zaehlt auch dort.
    const spaeter = quellStand({ externeId: "2026-0464#dup3", gueltigBis: "2026-07-01", attrs: { restbreiteM: 3.5 } })
    expect(standDiff(alt, spaeter)).toEqual({ gueltigBis: ["2026-05-01", "2026-07-01"] })
  })

  it("schweigt, wenn ein Wert VERSCHWINDET — dann hat unser Parser ihn verloren", () => {
    const alt = stand({ gueltigBis: "2026-05-01", attrs: { restbreiteM: 3.5 } })
    expect(standDiff(alt, stand({ gueltigBis: "2026-05-01" }))).toBeNull()
    expect(standDiff(alt, stand({ gueltigVon: "2026-01-01" }))).toBeNull()
  })

  it("schweigt, wenn das Ende auf den Beginn zurueckspringt — Ende-Heuristik bei einem Termin", () => {
    // Steht nach dem Wegfall eines Termins nur noch EIN Datum im Text, nimmt die Heuristik
    // denselben Tag als Ende. Das saehe wie eine Verkuerzung aus, ist aber keine.
    const alt = stand({ gueltigVon: "2026-09-22", gueltigBis: "2026-09-23" })
    const neu = stand({ gueltigVon: "2026-09-22", gueltigBis: "2026-09-22" })
    expect(standDiff(alt, neu)).toBeNull()
  })

  it("vergleicht nichts ueber Versionsgrenzen — sonst meldet ein Deploy den ganzen Bestand", () => {
    // Am 21.09.2026 erzeugte genau das 458 Falschmeldungen in einer Minute.
    const alt = { ...stand({ gueltigBis: "2026-03-01" }), _v: STAND_VERSION - 1 }
    expect(standDiff(alt, stand({ gueltigBis: "2026-05-01" }))).toBeNull()
    expect(standDiff(null, stand({ gueltigBis: "2026-05-01" }))).toBeNull()
  })

  it("normalisiert Zeitstempel auf den Tag — DB liefert Date, der Connector einen String", () => {
    const ausDb = quellStand({ externeId: "e", gueltigBis: new Date("2026-05-01T00:00:00Z"), attrs: {} })
    const ausFeed = quellStand({ externeId: "e", gueltigBis: "2026-05-01", attrs: {} })
    expect(standDiff(ausDb, ausFeed)).toBeNull()
  })
})
