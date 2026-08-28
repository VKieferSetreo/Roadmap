// Streckensuche: Korridor durchsuchen statt eine Route planen.
//
// Geprueft wird mit einem Fake-Router (kein OSRM noetig): Die Suche darf nicht daran
// haengen, WIE die Geometrie entsteht — sie muss die richtigen Kanten anfragen, Blocker
// korrekt zuordnen, tauschen duerfen und im Budget bleiben.

import { describe, it, expect } from "vitest"
import { blockerAufKante, knotenImKorridor, kosten, repariereBlocker, mitRoutenCache, normalisiereStrassen, sucheKante, sucheKette, sucheStrecke, sucheStreckeMitVias, verbotAlsBlocker, STRAFE_KM } from "../src/engine/streckensuche.js"
import { haversineKm } from "../src/engine/geometry.js"

const S = { lat: 52.0, lng: 9.0 }
const Z = { lat: 48.0, lng: 11.0 }

/** Gerade Linie zwischen zwei Punkten, n Stuetzpunkte. */
const linie = (a, b, n = 40) =>
  Array.from({ length: n }, (_, i) => ({
    lat: a.lat + ((b.lat - a.lat) * i) / (n - 1),
    lng: a.lng + ((b.lng - a.lng) * i) / (n - 1),
  }))

describe("Blocker auf der Kante", () => {
  it("erkennt einen Blocker direkt auf der Linie und misst den Abstand", () => {
    const geo = linie(S, Z)
    const mitte = geo[20]
    const treffer = blockerAufKante(geo, [{ ...mitte, titel: "Vollsperrung" }])
    expect(treffer).toHaveLength(1)
    expect(treffer[0].abstandM).toBeLessThan(50)
    expect(treffer[0].km).toBeGreaterThan(0)
  })

  it("laesst ein Hindernis abseits der Fahrlinie aus", () => {
    const geo = linie(S, Z)
    const daneben = { lat: geo[20].lat + 0.05, lng: geo[20].lng, titel: "Nebenstrasse" } // ~5 km
    expect(blockerAufKante(geo, [daneben])).toHaveLength(0)
  })

  // Zwischen zwei Stuetzpunkten liegen bei grober Geometrie Kilometer — wer nur
  // Stuetzpunkte prueft, laesst Blocker dazwischen durchrutschen.
  it("misst gegen die Strecke, nicht gegen die Stuetzpunkte", () => {
    const grob = [S, Z]
    const mittig = { lat: (S.lat + Z.lat) / 2, lng: (S.lng + Z.lng) / 2, titel: "Bruecke" }
    expect(blockerAufKante(grob, [mittig])).toHaveLength(1)
  })
})

describe("Knoten im Korridor", () => {
  const knoten = [
    { name: "AK Mitte", lat: 50.0, lng: 10.0 }, // fast auf der Achse
    { name: "AS Nah", lat: 50.3, lng: 10.2 },
    { name: "AS Weit weg", lat: 53.5, lng: 6.0 }, // weit ausserhalb
    { name: "AS Hinter dem Ziel", lat: 46.0, lng: 12.5 },
  ]

  it("nimmt nur Knoten, deren Umweg im Korridor bleibt", () => {
    const treffer = knotenImKorridor(S, Z, knoten, { korridorKm: 60 })
    const namen = treffer.map((k) => k.name)
    expect(namen).toContain("AK Mitte")
    expect(namen).not.toContain("AS Weit weg")
    expect(namen).not.toContain("AS Hinter dem Ziel")
  })

  it("sortiert nach Umweg — der guenstigste zuerst", () => {
    const treffer = knotenImKorridor(S, Z, knoten, { korridorKm: 200 })
    expect(treffer[0].name).toBe("AK Mitte")
    expect(treffer[0].umwegKm).toBeLessThanOrEqual(treffer[1].umwegKm)
  })
})

// Nicht gierig: ein Blocker kostet Umweg-Kilometer, ist aber kein Ausschluss. Eine
// Strecke darf einen Blocker gegen zwei tauschen, wenn sie dafuer deutlich kuerzer ist.
describe("Kosten", () => {
  it("bewertet Blocker als Umweg-Aequivalent", () => {
    expect(kosten(100, 0)).toBe(100)
    expect(kosten(100, 2)).toBe(100 + 2 * STRAFE_KM)
    // Ein deutlicher Umweg schlaegt einen verbleibenden Blocker — eine Strecke mit
    // offener Vollsperrung ist nicht "etwas schlechter", sie ist nicht fahrbar.
    expect(kosten(600, 0)).toBeLessThan(kosten(100, 4))
  })
})

describe("Kante suchen", () => {
  it("waehlt unter den OSRM-Alternativen die blockerfreie, auch wenn sie laenger ist", async () => {
    const geoKurz = linie(S, Z)
    const geoLang = linie({ lat: 52.0, lng: 8.0 }, { lat: 48.0, lng: 10.0 })
    const route = async () => [
      { geometry: geoKurz, distanzKm: 400, dauerMin: 300 },
      { geometry: geoLang, distanzKm: 430, dauerMin: 330 },
    ]
    const blocker = [{ ...geoKurz[20], titel: "Vollsperrung" }]
    const beste = await sucheKante(S, Z, { blocker, route })
    expect(beste.distanzKm).toBe(430)
    expect(beste.blocker).toHaveLength(0)
  })
})

describe("Bidirektionale Suche", () => {
  const knoten = [
    { name: "AK Ausweich", lat: 50.2, lng: 9.6 },
    { name: "AS Zweite", lat: 49.8, lng: 10.4 },
  ]

  it("gibt die direkte Strecke sofort zurueck, wenn sie frei ist", async () => {
    let aufrufe = 0
    const route = async () => {
      aufrufe++
      return [{ geometry: linie(S, Z), distanzKm: 400, dauerMin: 300 }]
    }
    const res = await sucheStrecke(S, Z, { blocker: [], knoten, route })
    expect(res.gefunden).toBe(true)
    expect(res.beste.blocker).toHaveLength(0)
    // Genau EIN Routing-Aufruf: ohne Problem gibt es nichts zu durchsuchen.
    expect(aufrufe).toBe(1)
  })

  it("weicht ueber einen Knoten aus, wenn direkt ein Blocker liegt", async () => {
    const direkt = linie(S, Z)
    const sperre = { ...direkt[20], titel: "Bruecke gesperrt" }
    const route = async (von, nach) => {
      // Alles, was ueber einen benannten Knoten laeuft, meidet die Sperre.
      const ueberKnoten = von.name !== "Start" || nach.name !== "Ziel"
      // Deutlich westlich an der Sperre vorbei — sonst streift die Ausweichlinie sie doch.
      const geo = ueberKnoten ? linie({ lat: 52.0, lng: 7.6 }, { lat: 48.0, lng: 9.6 }, 20) : direkt
      return [{ geometry: geo, distanzKm: ueberKnoten ? 230 : 400, dauerMin: 200 }]
    }
    const res = await sucheStrecke(S, Z, { blocker: [sperre], knoten, route, breite: 2 })
    expect(res.gefunden).toBe(true)
    expect(res.beste.blocker).toHaveLength(0)
    expect(res.beste.ueber.length).toBe(1)
    // Das Protokoll ist zugleich der Nachweis: es nennt Korridor, Kanten und Verbindung.
    expect(res.protokoll.some((p) => p.art === "korridor")).toBe(true)
    expect(res.protokoll.some((p) => p.art === "verbindung")).toBe(true)
  })

  // Eine Suche, die ins Budget laeuft, muss das sagen — sonst liest sich ein
  // abgebrochener Durchlauf wie ein erschoepfend durchsuchter Korridor.
  it("haelt das Kanten-Budget ein und weist es aus", async () => {
    let aufrufe = 0
    const direkt = linie(S, Z)
    const route = async () => {
      aufrufe++
      return [{ geometry: direkt, distanzKm: 400, dauerMin: 300 }]
    }
    const viele = Array.from({ length: 30 }, (_, i) => ({ name: `AS ${i}`, lat: 50 + i * 0.01, lng: 10 }))
    const res = await sucheStrecke(S, Z, {
      blocker: [{ ...direkt[20], titel: "Sperrung" }],
      knoten: viele,
      route,
      maxKanten: 5,
      breite: 10,
    })
    expect(aufrufe).toBe(5)
    expect(res.budgetErschoepft).toBe(true)
  })
})

describe("Mehrstufige Suche", () => {
  const S2 = { lat: 52.0, lng: 9.0 }
  const Z2 = { lat: 48.0, lng: 11.0 }
  const linie2 = (a, b, n = 30) =>
    Array.from({ length: n }, (_, i) => ({
      lat: a.lat + ((b.lat - a.lat) * i) / (n - 1),
      lng: a.lng + ((b.lng - a.lng) * i) / (n - 1),
    }))

  // Der Fall, um den es fachlich geht: rauf auf die Parallelachse, an der Sperre
  // vorbei, wieder runter. Das braucht ZWEI Zwischenknoten — mit nur einem bleibt
  // die Sperre auf der Strecke.
  it("verbindet zwei Knoten zu einer Parallelachse", async () => {
    const direkt = linie2(S2, Z2)
    const sperre = { ...direkt[15], titel: "Vollsperrung" }
    const A = { name: "AS Auffahrt", lat: 51.0, lng: 8.2 }
    const B = { name: "AS Abfahrt", lat: 49.0, lng: 9.2 }
    const route = async (von, nach) => {
      // Jede Kante, die NICHT Start→Ziel ist, laeuft westlich an der Sperre vorbei.
      const direktStrecke = von.name === "Start" && nach.name === "Ziel"
      const geo = direktStrecke ? direkt : linie2({ lat: von.lat, lng: von.lng - 0.6 }, { lat: nach.lat, lng: nach.lng - 0.6 }, 12)
      return [{ geometry: geo, distanzKm: direktStrecke ? 400 : 160, dauerMin: 120 }]
    }
    const res = await sucheStrecke(S2, Z2, { blocker: [sperre], knoten: [A, B], route, breite: 3, korridorKm: 300 })
    expect(res.beste.blocker).toHaveLength(0)
    expect(res.beste.ueber).toEqual(["AS Auffahrt", "AS Abfahrt"])
    expect(res.protokoll.some((p) => p.art === "fronten")).toBe(true)
  })

  // Dieselbe Verbindung taucht in mehreren Kombinationen auf. Ohne Cache wuerde sie
  // jedes Mal neu gerechnet und das Budget waere nach der halben Suche weg.
  it("rechnet jede Kante nur einmal", async () => {
    const gefragt = []
    const route = async (von, nach) => {
      gefragt.push(`${von.name ?? "?"}>${nach.name ?? "?"}`)
      return [{ geometry: linie2(von, nach, 8), distanzKm: 100, dauerMin: 90 }]
    }
    const direktSperre = { lat: 50.0, lng: 10.0, titel: "Sperrung" }
    const knotenListe = [
      { name: "AS Eins", lat: 51.0, lng: 9.2 },
      { name: "AS Zwei", lat: 49.0, lng: 10.4 },
    ]
    await sucheStrecke(S2, Z2, {
      blocker: [direktSperre],
      knoten: knotenListe,
      route,
      breite: 3,
      korridorKm: 300,
      maxKanten: 50,
    })
    expect(new Set(gefragt).size).toBe(gefragt.length)
  })

  // T-046: Die Knotenliste kennt nur Autobahnknoten. Zu einem Windpark in der Uckermark
  // liegt im ganzen Korridor keiner — vorher hatte die Suche dort nichts, worueber sie
  // haette ausweichen koennen, und lieferte die gesperrte Strecke zurueck.
  it("weicht auch ohne Autobahnknoten im Korridor aus", async () => {
    const direkt = linie2(S2, Z2)
    const sperre = { ...direkt[15], titel: "Bruecke gesperrt" }
    const route = async (von, nach) => {
      const direktStrecke = von.name === "Start" && nach.name === "Ziel"
      const geo = direktStrecke ? direkt : linie2({ lat: von.lat, lng: von.lng - 0.6 }, { lat: nach.lat, lng: nach.lng - 0.6 }, 12)
      return [{ geometry: geo, distanzKm: direktStrecke ? 400 : 210, dauerMin: 120 }]
    }
    const res = await sucheStrecke(S2, Z2, { blocker: [sperre], knoten: [], route, breite: 3, korridorKm: 300 })
    expect(res.protokoll.some((p) => p.art === "ausweich" && p.knoten === 0)).toBe(true)
    expect(res.beste.blocker).toHaveLength(0)
  })

  // Gegenprobe: solange es echte Knoten gibt, bleibt es bei ihnen — die kuenstlichen
  // Punkte sind der Notnagel, nicht der Normalfall.
  it("setzt keine kuenstlichen Punkte, wenn Knoten da sind", async () => {
    const direkt = linie2(S2, Z2)
    const sperre = { ...direkt[15], titel: "Vollsperrung" }
    // Schon EIN Knoten im Korridor ist eine Ausweichachse — dann bleibt es dabei.
    const knotenListe = [{ name: "AS Eins", lat: 51.0, lng: 8.2 }]
    const route = async (von, nach) => {
      const direktStrecke = von.name === "Start" && nach.name === "Ziel"
      const geo = direktStrecke ? direkt : linie2({ lat: von.lat, lng: von.lng - 0.6 }, { lat: nach.lat, lng: nach.lng - 0.6 }, 12)
      return [{ geometry: geo, distanzKm: direktStrecke ? 400 : 160, dauerMin: 120 }]
    }
    const res = await sucheStrecke(S2, Z2, { blocker: [sperre], knoten: knotenListe, route, breite: 3, korridorKm: 300 })
    expect(res.protokoll.some((p) => p.art === "ausweich")).toBe(false)
  })
})

describe("Blocker systematisch abarbeiten", () => {
  const S3 = { lat: 53.0, lng: 9.0 }
  const Z3 = { lat: 48.0, lng: 11.0 }
  const linie3 = (a, b, n = 60) =>
    Array.from({ length: n }, (_, i) => ({
      lat: a.lat + ((b.lat - a.lat) * i) / (n - 1),
      lng: a.lng + ((b.lng - a.lng) * i) / (n - 1),
    }))

  it("umfaehrt eine Stelle lokal und laesst den Rest der Strecke stehen", async () => {
    const geo = linie3(S3, Z3)
    const sperre = { id: 1, ...geo[30], titel: "Bruecke gesperrt" }
    // Der Ersatz weicht nach Westen aus und trifft die Sperre nicht mehr.
    const route = async (von, nach) => [
      { geometry: [von, { lat: (von.lat + nach.lat) / 2, lng: von.lng - 0.8 }, nach], distanzKm: 60, dauerMin: 50 },
    ]
    const res = await repariereBlocker(
      { geometrie: geo, blocker: [sperre], distanzKm: 600 },
      { blocker: [sperre], route },
    )
    expect(res.blocker).toHaveLength(0)
    expect(res.repariert).toBe(1)
    // Anfang und Ende unveraendert.
    expect(res.geometrie[0]).toEqual(geo[0])
    expect(res.geometrie.at(-1)).toEqual(geo.at(-1))
  })

  it("uebernimmt keinen Ersatz, der mehr Blocker mitbringt als er loest", async () => {
    const geo = linie3(S3, Z3)
    const sperre = { id: 1, ...geo[30], titel: "Sperre" }
    const neueSperren = [
      { id: 2, lat: 50.6, lng: 8.2, titel: "neu 1" },
      { id: 3, lat: 50.4, lng: 8.2, titel: "neu 2" },
      { id: 4, lat: 50.2, lng: 8.2, titel: "neu 3" },
    ]
    // Die Ausweichlinie laeuft genau durch die drei neuen Sperren.
    const route = async () => [{ geometry: [{ lat: 50.8, lng: 8.2 }, { lat: 50.0, lng: 8.2 }], distanzKm: 90, dauerMin: 70 }]
    const res = await repariereBlocker(
      { geometrie: geo, blocker: [sperre], distanzKm: 600 },
      { blocker: [sperre, ...neueSperren], route },
    )
    expect(res.repariert).toBe(0)
    expect(res.blocker).toHaveLength(1)
  })

  it("sagt es, wenn die Stelle am Start liegt", async () => {
    const geo = linie3(S3, Z3)
    const protokoll = []
    const res = await repariereBlocker(
      { geometrie: geo, blocker: [{ id: 9, ...geo[0], titel: "direkt am Start" }], distanzKm: 600 },
      { blocker: [{ id: 9, ...geo[0] }], route: async () => [], protokoll },
    )
    expect(res.repariert).toBe(0)
    expect(protokoll.some((p) => /nicht umfahrbar/.test(p.ergebnis ?? ""))).toBe(true)
  })
})

// Zwei Zwischenknoten reichen fuer eine Parallelachse. Sie reichen nicht, wenn der
// Umweg selbst wieder eine Stelle hat — dann braucht es drei oder vier.
describe("Ketten ueber mehr als zwei Knoten", () => {
  const S = { lat: 53.0, lng: 8.0 }
  const Z = { lat: 48.0, lng: 10.0 }
  const linie = (a, b, n = 20) =>
    Array.from({ length: n }, (_, i) => ({
      lat: a.lat + ((b.lat - a.lat) * i) / (n - 1),
      lng: a.lng + ((b.lng - a.lng) * i) / (n - 1),
    }))

  // Vier Knoten in Reihe. Jede Kante ueber mehr als einen Schritt fuehrt durch die
  // Sperre — nur die Kette A→B→C→D kommt sauber durch.
  it("findet eine Kette ueber drei Zwischenknoten", async () => {
    const knoten = [
      { name: "A", lat: 52.0, lng: 8.4, fortschritt: 0.2 },
      { name: "B", lat: 51.0, lng: 8.8, fortschritt: 0.4 },
      { name: "C", lat: 50.0, lng: 9.2, fortschritt: 0.6 },
      { name: "D", lat: 49.0, lng: 9.6, fortschritt: 0.8 },
    ]
    const reihe = ["Start", "A", "B", "C", "D", "Ziel"]
    const kante = async (von, nach) => {
      const i = reihe.indexOf(von.name ?? "Start")
      const j = reihe.indexOf(nach.name ?? "Ziel")
      // Ein Schritt in der Reihe ist frei, jeder Sprung darueber traegt einen Blocker.
      const sprung = j - i > 1
      return {
        geometry: linie(von, nach, 6),
        distanzKm: 120 * (j - i),
        blocker: sprung ? [{ titel: "Sperrung", lat: 50, lng: 9 }] : [],
        kosten: 120 * (j - i) + (sprung ? STRAFE_KM : 0),
      }
    }
    const kette = await sucheKette({ ...S, name: "Start" }, { ...Z, name: "Ziel" }, { knoten, kante })
    expect(kette.blocker).toHaveLength(0)
    expect(kette.ueber).toEqual(["A", "B", "C", "D"])
  })

  // Ohne Budget-Grenze wuerde die Suche im Korridor herumirren: eine Kante, die kein
  // Ergebnis liefert (Budget aus), beendet ihren Zweig.
  it("bricht ab, wenn keine Kante mehr kommt", async () => {
    const knoten = [{ name: "A", lat: 51.0, lng: 8.5, fortschritt: 0.3 }]
    const kette = await sucheKette({ ...S, name: "Start" }, { ...Z, name: "Ziel" }, { knoten, kante: async () => null })
    expect(kette).toBe(null)
  })
})

// Der Agent sucht, fragt nach, sucht erneut — auf demselben Korridor. Ohne Cache
// ueber Suchen hinweg zahlt jede Runde denselben Routing-Aufruf noch einmal.
describe("Routen-Cache ueber Suchen hinweg", () => {
  it("fragt dieselbe Kante nur einmal, auch in einer zweiten Suche", async () => {
    let aufrufe = 0
    const roh = async () => {
      aufrufe++
      return [{ geometry: [{ lat: 50, lng: 9 }, { lat: 49, lng: 9 }], distanzKm: 100, dauerMin: 80 }]
    }
    const a = { lat: 50.1234, lng: 9.1234 }
    const b = { lat: 49.4321, lng: 9.4321 }
    const cached = mitRoutenCache(roh)
    await cached(a, b, { anzahl: 3 })
    await cached(a, b, { anzahl: 3 })
    expect(aufrufe).toBe(1)
  })

  it("merkt sich keine leere Antwort — sonst waere ein Router-Ausfall 30 Minuten lang die Wahrheit", async () => {
    let aufrufe = 0
    const roh = async () => {
      aufrufe++
      return []
    }
    const cached = mitRoutenCache(roh)
    await cached({ lat: 51, lng: 7 }, { lat: 50, lng: 7 })
    await cached({ lat: 51, lng: 7 }, { lat: 50, lng: 7 })
    expect(aufrufe).toBe(2)
  })
})

// "Auf keinen Fall ueber die A8" war bis zum 20.08.2026 nicht durchsetzbar: Sperrzonen
// sind Punkte mit Radius, eine ganze Autobahn bekommt man damit nicht weg. Im Eval-Lauf
// lieferte der Agent deshalb eine A8-Strecke aus, obwohl er in jeder Runde selbst
// schrieb, dass das ausgeschlossen sei.
describe("Verbotene Strassen", () => {
  const S = { lat: 49.0, lng: 8.4 }
  const Z = { lat: 48.8, lng: 9.2 }
  const linie = (a, b, n = 10) =>
    Array.from({ length: n }, (_, i) => ({ lat: a.lat + ((b.lat - a.lat) * i) / (n - 1), lng: a.lng + ((b.lng - a.lng) * i) / (n - 1) }))

  it("liest 'keine A 8' als A8", () => {
    expect(normalisiereStrassen(["keine A 8", "a8", "B 10", "Unsinn"])).toEqual(["A8", "B10"])
  })

  it("waehlt die laengere Strecke, wenn die kurze ueber die verbotene Strasse laeuft", async () => {
    const route = async () => [
      { geometry: linie(S, Z), distanzKm: 80, dauerMin: 60, strassen: new Set(["A8"]) },
      { geometry: linie(S, Z, 12), distanzKm: 105, dauerMin: 95, strassen: new Set(["B10", "B14"]) },
    ]
    const kante = await sucheKante(S, Z, { blocker: [], route, verboteneStrassen: ["A8"] })
    expect(kante.distanzKm).toBe(105)
    expect(kante.verstoesse).toEqual([])
  })

  it("sagt es, wenn ALLE Varianten die verbotene Strasse nutzen — statt sie stillschweigend zu nehmen", async () => {
    const route = async () => [{ geometry: linie(S, Z), distanzKm: 80, dauerMin: 60, strassen: new Set(["A8"]) }]
    const kante = await sucheKante(S, Z, { blocker: [], route, verboteneStrassen: ["A8"] })
    expect(kante.verstoesse).toEqual(["A8"])
  })

  it("fragt die Strassen nur ab, wenn es ein Verbot gibt — steps=true kostet Zeit", async () => {
    const gefragt = []
    const route = async (_a, _b, opt) => {
      gefragt.push(opt.mitStrassen)
      return [{ geometry: linie(S, Z), distanzKm: 80, dauerMin: 60 }]
    }
    await sucheKante(S, Z, { blocker: [], route })
    await sucheKante(S, Z, { blocker: [], route, verboteneStrassen: ["A8"] })
    expect(gefragt).toEqual([false, true])
  })
})

// Fuehrungsvorgaben (Max 20.08.): "fahr so und so vorbei" — ein Via ist eine aktive
// Vorgabe, keine Umfahrung. Die Korridorsuche laeuft dann als Kette aufeinander-
// folgender Segmente; jedes Segment behaelt die volle Suche, nur eben zwischen den
// vorgegebenen Punkten.
describe("Fuehrungsvorgaben (Vias)", () => {
  const S = { lat: 52.0, lng: 9.0 }
  const V = { lat: 50.0, lng: 10.5 } // deutlich seitlich der S→Z-Achse (lng 9.0)
  const Z = { lat: 48.0, lng: 9.0 }

  it("zwingt die Strecke ueber den Via-Punkt", async () => {
    const route = async (von, nach) => [{ geometry: linie(von, nach, 12), distanzKm: 200, dauerMin: 150 }]
    const res = await sucheStreckeMitVias(S, Z, { vias: [V], blocker: [], knoten: [], route })
    expect(res.gefunden).toBe(true)
    // Die direkte Achse laeuft auf lng 9.0 — nur die Vorgabe bringt die Geometrie
    // in die Umgebung des Vias.
    expect(res.beste.geometrie.some((p) => haversineKm(p, V) < 1)).toBe(true)
    // Je Segment ein Protokoll-Eintrag: der Nachweis nennt die vorgegebene Kette.
    const segmente = res.protokoll.filter((p) => p.art === "segment")
    expect(segmente).toHaveLength(2)
    expect(segmente.map((s) => `${s.von}>${s.nach}`)).toEqual(["Start>Via 1", "Via 1>Ziel"])
    expect(res.beste.ueber).toContain("Via 1")
  })

  it("haelt das Kanten-Budget ueber alle Segmente hinweg ein", async () => {
    let aufrufe = 0
    const route = async (von, nach) => {
      aufrufe++
      return [{ geometry: linie(von, nach, 10), distanzKm: 300, dauerMin: 200 }]
    }
    // Je ein Blocker AUF der direkten Linie beider Segmente: kein Segment darf frueh
    // fertig sein, beide muessen suchen — und trotzdem bleibt die Summe im Deckel.
    const b1 = { ...linie(S, V, 10)[5], titel: "Sperre 1" }
    const b2 = { ...linie(V, Z, 10)[5], titel: "Sperre 2" }
    const viele = Array.from({ length: 20 }, (_, i) => ({ name: `AS ${i}`, lat: 51.5 - i * 0.1, lng: 9.3 }))
    const res = await sucheStreckeMitVias(S, Z, {
      vias: [V],
      blocker: [b1, b2],
      knoten: viele,
      route,
      maxKanten: 6,
      breite: 10,
    })
    expect(aufrufe).toBeLessThanOrEqual(6)
    // Eine Suche im Budget-Aus muss das sagen — auch ueber Segmente hinweg.
    expect(res.budgetErschoepft).toBe(true)
  })

  it("laesst den bisherigen Pfad ohne Vias unveraendert", async () => {
    let aufrufe = 0
    const route = async () => {
      aufrufe++
      return [{ geometry: linie(S, Z), distanzKm: 400, dauerMin: 300 }]
    }
    const res = await sucheStreckeMitVias(S, Z, { vias: [], blocker: [], knoten: [], route })
    expect(res.gefunden).toBe(true)
    // Genau EIN Routing-Aufruf wie bei sucheStrecke direkt — kein Verhaltensbruch.
    expect(aufrufe).toBe(1)
    expect(res.protokoll.some((p) => p.art === "segment")).toBe(false)
  })

  it("sammelt die Blocker beider Segmente im Ergebnis", async () => {
    const l1 = linie(S, V, 12)
    const l2 = linie(V, Z, 12)
    const b1 = { id: 1, ...l1[6], titel: "Sperre vor dem Via" }
    const b2 = { id: 2, ...l2[6], titel: "Sperre nach dem Via" }
    // Nichts ist umfahrbar: der Fake legt JEDE Anfrage ueber die Sperre des Abschnitts,
    // in dem sie liegt. (Eine stur gerade Linie zwischen zwei beliebigen Punkten reicht
    // dafuer nicht mehr — seit T-046 setzt die Suche ohne Knoten seitliche Ausweichziele,
    // und zwischen denen ginge die gerade Linie an der Sperre vorbei.) Beide Blocker
    // MUESSEN gesammelt im Ergebnis stehen bleiben.
    const route = async (von, nach) => {
      const mitte = { lat: (von.lat + nach.lat) / 2, lng: (von.lng + nach.lng) / 2 }
      const b = haversineKm(mitte, b1) <= haversineKm(mitte, b2) ? b1 : b2
      return [{ geometry: [...linie(von, b, 6), ...linie(b, nach, 6)], distanzKm: 200, dauerMin: 150 }]
    }
    const res = await sucheStreckeMitVias(S, Z, { vias: [V], blocker: [b1, b2], knoten: [], route })
    expect(res.gefunden).toBe(true)
    const titel = res.beste.blocker.map((b) => b.titel)
    expect(titel).toContain("Sperre vor dem Via")
    expect(titel).toContain("Sperre nach dem Via")
  })

  it("schneidet mehr als drei Vias ab", async () => {
    const route = async (von, nach) => [{ geometry: linie(von, nach, 8), distanzKm: 100, dauerMin: 80 }]
    const fuenf = Array.from({ length: 5 }, (_, i) => ({ lat: 51.5 - i * 0.7, lng: 9.4 }))
    const res = await sucheStreckeMitVias(S, Z, { vias: fuenf, blocker: [], knoten: [], route })
    // Drei Vias = vier Segmente — mehr ist keine Vorgabe mehr, sondern eine Planung.
    expect(res.protokoll.filter((p) => p.art === "segment")).toHaveLength(4)
  })
})

// Ein Verbot als reine Strafe zu rechnen reicht nicht: der Router liefert von sich aus
// immer wieder dieselbe Autobahn, und auf der B10 liegt kein Autobahnknoten, ueber den
// die Suche ausweichen koennte. Also wird die verbotene Strasse zu Punkten, um die
// herum gesucht wird — wie bei einer Baustelle.
describe("Verbot als Umfahrungspunkte", () => {
  it("tastet den verbotenen Abschnitt ab und laesst den Rest liegen", () => {
    const punkte = Array.from({ length: 40 }, (_, i) => ({ lat: 48.8 + i * 0.02, lng: 9.0 }))
    const varianten = [
      { abschnitte: [{ ref: "A8", punkte }, { ref: "B10", punkte: punkte.slice(0, 5) }] },
    ]
    const blocker = verbotAlsBlocker(varianten, ["A8"], { abstandKm: 15 })
    expect(blocker.length).toBeGreaterThan(1)
    expect(blocker.every((b) => b.vorgabe === "A8")).toBe(true)
    // Abstand eingehalten: bei ~87 km Laenge und 15 km Raster bleiben eine Handvoll.
    expect(blocker.length).toBeLessThan(10)
  })

  it("liefert nichts, wenn die verbotene Strasse gar nicht vorkommt", () => {
    const varianten = [{ abschnitte: [{ ref: "B10", punkte: [{ lat: 48, lng: 9 }] }] }]
    expect(verbotAlsBlocker(varianten, ["A8"])).toEqual([])
  })
})
