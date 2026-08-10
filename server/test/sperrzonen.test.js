// Sperrzonen-Umfahrung: die Bausteine, aus denen umfahreZonen seine Alternativroute
// baut (Max 2026-07-15, Commits cbfb252/3db7f74/e886982/6d9e863).
//
// Warum es diese Datei gibt: der Strang ging im Juli mit roter CI auf Produktion und
// war dort vier Wochen ungetestet, obwohl der Setreo-AI-Agent `meide` als sein
// wichtigstes Umfahrungswerkzeug benutzt. Getestet wird die Geometrie- und
// Eingabeschicht plus die Statusmeldung von umfahreZonen — Letztere mit einem
// Fake-Router (osrm.route), damit die Iteration ohne echtes OSRM laeuft.

import { describe, expect, it } from "vitest"
import {
  ersteVerletzung,
  fuegeViaEin,
  parseMeide,
  routenQualitaet,
  seitlicherPunkt,
  umfahreZonen,
} from "../src/routes/route.js"
import { haversineKm } from "../src/engine/geometry.js"
import { createFakeDb } from "./helpers/fakeDb.js"

const KM_LNG_48 = 1 / (111.32 * Math.cos((48 * Math.PI) / 180))

/** Gerade West-Ost-Strecke bei 48° N, Punkt alle 100 m. */
function gerade(km, lat = 48, lng0 = 7) {
  const pts = []
  for (let i = 0; i <= km * 10; i++) pts.push({ lat, lng: lng0 + (i / 10) * KM_LNG_48 })
  return pts
}

describe("ersteVerletzung", () => {
  it("meldet null, wenn keine Zone die Route beruehrt", () => {
    const weitWeg = { lat: 50, lng: 7, radiusKm: 3 }
    expect(ersteVerletzung(gerade(50), [weitWeg])).toBeNull()
  })

  it("findet die Zone und den naechstliegenden Punkt", () => {
    const route = gerade(50)
    const mitte = route[Math.floor(route.length / 2)]
    const zone = { lat: mitte.lat, lng: mitte.lng, radiusKm: 2 }
    const v = ersteVerletzung(route, [zone])
    expect(v).not.toBeNull()
    expect(v.zone).toBe(zone)
    // Der gemeldete Punkt muss wirklich der dichteste sein.
    expect(haversineKm(route[v.idx], zone)).toBeLessThan(0.2)
  })

  it("greift genau am Radius: knapp drinnen trifft, knapp draussen nicht", () => {
    const route = gerade(50)
    const p = route[100] // 10 km ab Start
    const nordVersatz = (km) => ({ lat: p.lat + km / 110.6, lng: p.lng })
    expect(ersteVerletzung(route, [{ ...nordVersatz(2.9), radiusKm: 3 }])).not.toBeNull()
    expect(ersteVerletzung(route, [{ ...nordVersatz(3.1), radiusKm: 3 }])).toBeNull()
  })

  it("liefert die erste Zone der Liste, nicht die dichteste", () => {
    const route = gerade(50)
    const a = { ...route[400], radiusKm: 2 } // spaet auf der Strecke
    const b = { ...route[100], radiusKm: 2 } // frueh auf der Strecke
    expect(ersteVerletzung(route, [a, b]).zone).toBe(a)
  })
})

describe("seitlicherPunkt", () => {
  it("setzt den Pin im verlangten Abstand neben die Route", () => {
    const route = gerade(50)
    const via = seitlicherPunkt(route, 250, 5, 1)
    expect(haversineKm(via, route[250])).toBeGreaterThan(4.5)
    expect(haversineKm(via, route[250])).toBeLessThan(5.5)
  })

  it("legt die beiden Seiten auf gegenueberliegende Flanken", () => {
    const route = gerade(50) // Fahrtrichtung Ost
    const links = seitlicherPunkt(route, 250, 5, 1)
    const rechts = seitlicherPunkt(route, 250, 5, -1)
    // Senkrecht zu Ost heisst Nord bzw. Sued — die Seiten muessen sich trennen.
    expect(Math.sign(links.lat - route[250].lat)).toBe(-Math.sign(rechts.lat - route[250].lat))
    expect(haversineKm(links, rechts)).toBeGreaterThan(9)
  })

  it("bleibt am Anfang und am Ende der Geometrie im Rahmen (Index-Klemmung)", () => {
    const route = gerade(50)
    for (const idx of [0, 1, route.length - 2, route.length - 1]) {
      const via = seitlicherPunkt(route, idx, 4, 1)
      expect(Number.isFinite(via.lat)).toBe(true)
      expect(Number.isFinite(via.lng)).toBe(true)
      expect(haversineKm(via, route[idx])).toBeGreaterThan(3)
    }
  })
})

describe("fuegeViaEin", () => {
  const route = gerade(50)
  const start = route[0]
  const ziel = route[route.length - 1]

  it("setzt den Umgehungs-Pin zwischen Start und Ziel", () => {
    const via = { lat: 48.05, lng: route[250].lng }
    const neu = fuegeViaEin([start, ziel], route, 250, via)
    expect(neu).toHaveLength(3)
    expect(neu[0]).toBe(start)
    expect(neu[1]).toBe(via)
    expect(neu[2]).toBe(ziel)
  })

  it("sortiert hinter den letzten Wegpunkt vor der Verletzung", () => {
    const w1 = route[100] // vor der Verletzung
    const w2 = route[400] // dahinter
    const via = { lat: 48.05, lng: route[250].lng }
    const neu = fuegeViaEin([start, w1, w2, ziel], route, 250, via)
    expect(neu.indexOf(via)).toBe(2) // hinter w1, vor w2
    expect(neu.indexOf(via)).toBeGreaterThan(neu.indexOf(w1))
    expect(neu.indexOf(via)).toBeLessThan(neu.indexOf(w2))
  })

  it("laesst die bestehende Reihenfolge unangetastet und den Eingabe-Array unveraendert", () => {
    const pins = [start, route[100], ziel]
    const kopie = [...pins]
    const neu = fuegeViaEin(pins, route, 250, { lat: 48.05, lng: 7.1 })
    expect(pins).toEqual(kopie) // keine Mutation
    expect(neu.filter((p) => pins.includes(p))).toEqual(pins) // Reihenfolge erhalten
  })
})

describe("parseMeide", () => {
  it("verwirft alles, was keine Liste ist", () => {
    for (const murks of [undefined, null, "A5", 42, { lat: 48, lng: 7 }]) {
      expect(parseMeide(murks)).toEqual([])
    }
  })

  it("setzt den Standardradius auf 3 km", () => {
    expect(parseMeide([{ lat: 48, lng: 7 }])[0].radiusKm).toBe(3)
  })

  it("klemmt den Radius auf 0,5 bis 8 km", () => {
    // Der Deckel ist Absicht: Riesenzonen zerlegen die Route, statt sie zu verbessern.
    expect(parseMeide([{ lat: 48, lng: 7, radiusKm: 0.1 }])[0].radiusKm).toBe(0.5)
    expect(parseMeide([{ lat: 48, lng: 7, radiusKm: 99 }])[0].radiusKm).toBe(8)
    expect(parseMeide([{ lat: 48, lng: 7, radiusKm: 4 }])[0].radiusKm).toBe(4)
  })

  it("nimmt hoechstens acht Zonen an", () => {
    const viele = Array.from({ length: 20 }, (_, i) => ({ lat: 48 + i / 100, lng: 7 }))
    expect(parseMeide(viele)).toHaveLength(8)
  })

  it("wirft Eintraege ohne brauchbare Koordinate weg", () => {
    const gemischt = [
      { lat: 48, lng: 7 },
      { lat: "keine Zahl", lng: 7 },
      { lng: 7 },
      { lat: 49, lng: null },
      { lat: 48.5, lng: 7.5, radiusKm: 2 },
    ]
    const raus = parseMeide(gemischt)
    expect(raus).toHaveLength(2)
    expect(raus.map((z) => z.lat)).toEqual([48, 48.5])
  })

  it("macht aus null/leer/false keine Koordinate 0 (Zone im Atlantik)", () => {
    // Number(null) und Number("") sind 0 — eine Zone mit fehlendem Feld waere
    // stumm auf den Nullmeridian gerutscht, haette nie eine Route verletzt und
    // dem Agenten "umfahren" fuer eine ungeprueste Sperrung gemeldet.
    for (const kaputt of [
      { lat: 49, lng: null },
      { lat: null, lng: 7 },
      { lat: 48, lng: "" },
      { lat: "  ", lng: 7 },
      { lat: false, lng: 7 },
      { lat: 48, lng: true },
    ]) {
      expect(parseMeide([kaputt])).toEqual([])
    }
  })

  it("nimmt Zahlen auch als Zeichenkette (JSON aus dem Agenten)", () => {
    const raus = parseMeide([{ lat: "48.5", lng: "7.5", radiusKm: "2" }])
    expect(raus).toEqual([{ lat: 48.5, lng: 7.5, radiusKm: 2 }])
  })
})

describe("routenQualitaet", () => {
  it("meldet eine gerade Route ohne Schleifen und mit Umwegfaktor um 1", () => {
    const route = gerade(50)
    const q = routenQualitaet(route, 50)
    expect(q.schleifen).toEqual([])
    expect(q.umwegFaktor).toBeGreaterThan(0.95)
    expect(q.umwegFaktor).toBeLessThan(1.1)
  })

  it("rechnet den Umwegfaktor gegen die Luftlinie", () => {
    const route = gerade(50)
    expect(routenQualitaet(route, 100).umwegFaktor).toBeGreaterThan(1.9) // doppelter Weg
  })

  it("laesst den Umwegfaktor weg, wenn die Luftlinie unter 1 km liegt", () => {
    // Bei Kurzstrecken ist das Verhaeltnis Rauschen, kein Qualitaetsmass.
    const kurz = gerade(0.5)
    expect(routenQualitaet(kurz, 0.6).umwegFaktor).toBeNull()
  })

  it("haelt unbrauchbare Eingaben aus", () => {
    expect(routenQualitaet([], 10).umwegFaktor).toBeNull()
    expect(routenQualitaet(gerade(50), NaN).umwegFaktor).toBeNull()
    expect(routenQualitaet(gerade(50), undefined).umwegFaktor).toBeNull()
  })
})

describe("umfahreZonen — Statusmeldung", () => {
  const basis = gerade(50)
  const basisOut = {
    geometry: basis,
    waypoints: [basis[0], basis.at(-1)],
    distanzKm: 50,
    provider: { geocoder: "test", router: "osrm", fallback: false },
  }
  const zoneA = { ...basis[100], radiusKm: 2 } // km 10
  const zoneB = { ...basis[400], radiusKm: 2 } // km 40

  /** Fake-OSRM: liefert unabhaengig von den Umgehungs-Pins immer dieselbe Geometrie. */
  const router = (geometry) => ({ route: async () => ({ geometry, distanzKm: 50, dauerMin: 40 }) })

  /** Basisroute mit einem Bogen nach Norden um `idx` — weicht der dortigen Zone aus. */
  const mitBogen = (idx, hoeheKm = 5, breite = 60) =>
    basis.map((p, i) => ({ lat: p.lat + (hoeheKm * Math.max(0, 1 - Math.abs(i - idx) / breite)) / 110.6, lng: p.lng }))

  it("meldet JEDE weiterhin durchfahrene Zone, nicht nur die erste", async () => {
    // Kern des Fehlers: jede Zone startet optimistisch auf umfahren:true, die
    // Schlusspruefung fragte aber nur ersteVerletzung ab — die zweite durchfahrene
    // Zone blieb damit als "umfahren" gemeldet.
    const { status } = await umfahreZonen(createFakeDb(), basisOut, [zoneA, zoneB], { osrm: router(basis) })
    expect(status.map((s) => s.umfahren)).toEqual([false, false])
    expect(status[1].grund).toBe("Route verlaeuft weiterhin durch die Zone")
  })

  it("laesst den bereits gesetzten Grund der aufgegebenen Zone stehen", async () => {
    const { status } = await umfahreZonen(createFakeDb(), basisOut, [zoneA, zoneB], { osrm: router(basis) })
    expect(status[0].grund).toBe("Keine Umfahrung gefunden (3 Anlaeufe)")
    expect(status[0]).not.toHaveProperty("versuche") // interner Zaehler gehoert nicht in die Antwort
  })

  it("laesst eine tatsaechlich umfahrene Zone auf umfahren:true", async () => {
    const { out, status } = await umfahreZonen(createFakeDb(), basisOut, [zoneA, zoneB], {
      osrm: router(mitBogen(100)),
    })
    expect(ersteVerletzung(out.geometry, [zoneA])).toBeNull()
    expect(status[0]).toEqual({ ...zoneA, umfahren: true })
    expect(status[1].umfahren).toBe(false)
  })

  it("ruehrt den Start/Ziel-Grund in der Schlusspruefung nicht an", async () => {
    // Zonen am Start/Ziel laufen gar nicht erst durch die Iteration — ihr Grund darf
    // nicht vom Sammeltext der Schlusspruefung ueberschrieben werden.
    const zoneZiel = { ...basis.at(-1), radiusKm: 3 }
    const { status } = await umfahreZonen(createFakeDb(), basisOut, [zoneZiel, zoneA], { osrm: router(basis) })
    expect(status[0].umfahren).toBe(false)
    expect(status[0].grund).toMatch(/Start\/Ziel/)
    expect(status[1].grund).toBe("Keine Umfahrung gefunden (3 Anlaeufe)")
  })

  it("meldet ohne Router fuer jede Zone offen ausbleibende Umfahrung", async () => {
    const { status } = await umfahreZonen(createFakeDb(), basisOut, [zoneA, zoneB], { osrm: null })
    expect(status.map((s) => s.umfahren)).toEqual([false, false])
    expect(status[0].grund).toBe("Routing ohne Wegpunkte/OSRM")
  })
})
