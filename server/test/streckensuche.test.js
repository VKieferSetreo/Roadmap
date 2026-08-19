// Streckensuche: Korridor durchsuchen statt eine Route planen.
//
// Geprueft wird mit einem Fake-Router (kein OSRM noetig): Die Suche darf nicht daran
// haengen, WIE die Geometrie entsteht — sie muss die richtigen Kanten anfragen, Blocker
// korrekt zuordnen, tauschen duerfen und im Budget bleiben.

import { describe, it, expect } from "vitest"
import { blockerAufKante, knotenImKorridor, kosten, sucheKante, sucheStrecke, STRAFE_KM } from "../src/engine/streckensuche.js"

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
