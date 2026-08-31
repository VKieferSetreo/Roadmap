// Ausgeblendete Strecken beim Kunden — und zwar SPURLOS (T-650).
//
// Max, 31.08.2026: "ausgeblendete Strecken sollen beim Kunden auch ausgeblendet sein und er
// soll nicht sehen, dass was ausgeblendet worden ist."
//
// Der zweite Halbsatz ist die eigentliche Zusage, und er zerfaellt in vier Abdruecke. Jeder
// bekommt hier seinen eigenen Fall, denn jeder einzelne verraet fuer sich allein, dass da
// noch etwas ist:
//
//   1. die Strecke in der Liste
//   2. Funde, die nur auf ihr liegen
//   3. ihr Name an Funden, die auf mehreren Strecken liegen
//   4. ihr Anteil an Gesamtlaenge und Fahrzeit

import { describe, it, expect } from "vitest"
import {
  istOeffentlich,
  oeffentlicheFunde,
  oeffentlicheKennzahlen,
  oeffentlicheRouten,
} from "../src/oeffentlicheSicht.js"
import { rowToShareData } from "../src/map.js"

// Zwei Strecken von je rund 11 km, damit die Anteilsrechnung nachrechenbar ist.
const strecke = (id, name, oeffentlich, lat0 = 52.0) => ({
  id,
  name,
  farbe: "#123456",
  points: [
    { lat: lat0, lng: 9.0 },
    { lat: lat0 + 0.1, lng: 9.0 },
  ],
  ...(oeffentlich === false ? { oeffentlich: false } : {}),
})

const A = strecke("r-a", "Hinfahrt", true)
const B = strecke("r-b", "Variante B", false, 53.0)

describe("Voreinstellung", () => {
  // Bestehende Strecken tragen das Feld nicht. Waere die Regel "nur was true ist", stuenden
  // alle bereits geteilten Projekte ab dem Update leer da.
  it("ohne Angabe ist eine Strecke sichtbar", () => {
    expect(istOeffentlich({ id: "x" })).toBe(true)
    expect(istOeffentlich({ id: "x", oeffentlich: true })).toBe(true)
    expect(istOeffentlich({ id: "x", oeffentlich: false })).toBe(false)
  })

  it("nur das ausdrueckliche false blendet aus", () => {
    expect(oeffentlicheRouten([A, B]).map((r) => r.id)).toEqual(["r-a"])
    expect(oeffentlicheRouten([A, { ...B, oeffentlich: true }])).toHaveLength(2)
  })
})

describe("Abdruck 2: Funde auf einer verborgenen Strecke", () => {
  it("ein Fund, der NUR auf der verborgenen Strecke liegt, faellt weg", () => {
    const funde = [{ key: "k1", routeId: "r-b" }, { key: "k2", routeId: "r-a" }]
    expect(oeffentlicheFunde(funde, [A, B]).map((f) => f.key)).toEqual(["k2"])
  })

  it("ein Fund ohne jeden Streckenbezug bleibt", () => {
    // Er haengt an keiner ausgeblendeten Strecke und kann sie darum nicht verraten.
    const funde = [{ key: "frei" }]
    expect(oeffentlicheFunde(funde, [A, B])).toHaveLength(1)
  })

  // Ein Altbestand-Fund kann auf eine geloeschte Strecke zeigen. Ihn wegzuwerfen waere ein
  // Datenverlust aus einem Grund, der mit dem Ausblenden nichts zu tun hat.
  it("ein Bezug auf eine Strecke, die es nicht mehr gibt, wirft den Fund nicht weg", () => {
    const funde = [{ key: "alt", routeId: "geloescht" }]
    expect(oeffentlicheFunde(funde, [A, B])).toHaveLength(1)
  })
})

describe("Abdruck 3: der Name der verborgenen Strecke an einem geteilten Fund", () => {
  // DER FALL, DEN MAN UEBERSIEHT. Der Fund liegt auf beiden Strecken, bleibt also sichtbar —
  // und trueg ohne diese Kuerzung "auch auf: Variante B" mit sich, waehrend es in der
  // Streckenliste des Kunden keine Variante B gibt.
  it("kuerzt routeIds auf die sichtbaren Strecken", () => {
    const funde = [{ key: "beide", routeId: "r-a", routeIds: ["r-a", "r-b"], routeName: "Hinfahrt" }]
    const [f] = oeffentlicheFunde(funde, [A, B])
    expect(f.routeIds).toBeUndefined() // unter zwei traegt routeId die Auskunft allein
    expect(f.routeId).toBe("r-a")
  })

  it("setzt den Repraesentanten um, wenn er selbst verborgen ist", () => {
    const funde = [{ key: "beide", routeId: "r-b", routeIds: ["r-b", "r-a"], routeName: "Variante B" }]
    const [f] = oeffentlicheFunde(funde, [A, B])
    expect(f.routeId).toBe("r-a")
    // Der Name des verborgenen Repraesentanten darf NICHT stehenbleiben.
    expect(f.routeName).toBeUndefined()
  })

  it("laesst den Namen stehen, wenn der Repraesentant sichtbar ist", () => {
    const funde = [{ key: "k", routeId: "r-a", routeName: "Hinfahrt" }]
    expect(oeffentlicheFunde(funde, [A, B])[0].routeName).toBe("Hinfahrt")
  })

  it("behaelt routeIds, wenn nach dem Kuerzen mehr als eine uebrig bleibt", () => {
    const C = strecke("r-c", "Umleitung", true, 54.0)
    const funde = [{ key: "drei", routeId: "r-a", routeIds: ["r-a", "r-b", "r-c"] }]
    expect(oeffentlicheFunde(funde, [A, B, C])[0].routeIds).toEqual(["r-a", "r-c"])
  })
})

describe("Abdruck 4: Gesamtlaenge und Fahrzeit", () => {
  // 340 km Summe neben 120 km sichtbarer Strecke — dafuer muss niemand rechnen koennen.
  it("skaliert Laenge und Fahrzeit auf den sichtbaren Anteil", () => {
    const k = oeffentlicheKennzahlen([A, B], { distanzKm: 100, fahrzeitMin: 200 })
    // Beide Strecken sind gleich lang, also bleibt die Haelfte.
    expect(k.distanzKm).toBe(50)
    expect(k.fahrzeitMin).toBe(100)
  })

  // Der Regelfall darf sich NICHT aendern: sind alle Strecken sichtbar, gelten die
  // gespeicherten Werte aus der Analyse unangetastet — die sind genauer als jede Nachrechnung.
  it("laesst die gespeicherten Werte in Ruhe, wenn nichts ausgeblendet ist", () => {
    const k = oeffentlicheKennzahlen([A, { ...B, oeffentlich: true }], { distanzKm: 100, fahrzeitMin: 200 })
    expect(k).toEqual({ distanzKm: 100, fahrzeitMin: 200 })
  })

  it("kommt mit fehlenden Werten zurecht", () => {
    expect(oeffentlicheKennzahlen([A, B], {})).toEqual({ distanzKm: undefined, fahrzeitMin: undefined })
  })
})

describe("Abdruck 1 und die ganze Antwort: rowToShareData", () => {
  const row = {
    name: "Projekt X",
    routes: [A, B],
    distanz_km: 100,
    fahrzeit_min: 200,
    transport: { laenge: 40, breite: 5, hoehe: 4.5, gesamtgewicht: 120 },
    zeitraum: {},
    updated_at: new Date("2026-08-31T08:00:00Z"),
  }

  it("liefert nur die freigegebene Strecke", () => {
    const d = rowToShareData(row, [])
    expect(d.routes.map((r) => r.id)).toEqual(["r-a"])
  })

  // Das Feld selbst waere der Abdruck: "oeffentlich: true" an jeder Strecke sagt, dass es
  // auch andere gibt.
  it("gibt das Freigabe-Feld NICHT nach aussen", () => {
    const d = rowToShareData(row, [])
    for (const r of d.routes) expect(r).not.toHaveProperty("oeffentlich")
    expect(JSON.stringify(d)).not.toContain("oeffentlich")
  })

  it("nennt die verborgene Strecke nirgends — auch nicht ihren Namen oder ihre Kennung", () => {
    const funde = [
      { key: "k1", routeId: "r-a", routeName: "Hinfahrt" },
      { key: "k2", routeId: "r-b", routeName: "Variante B" },
    ]
    const roh = JSON.stringify(rowToShareData(row, funde))
    expect(roh).not.toContain("Variante B")
    expect(roh).not.toContain("r-b")
  })

  it("und die Kennzahlen passen zu dem, was die Karte zeigt", () => {
    const d = rowToShareData(row, [])
    expect(d.distanzKm).toBe(50)
    expect(d.fahrzeitMin).toBe(100)
  })

  it("ohne Ausblenden bleibt die Antwort unveraendert", () => {
    const alles = { ...row, routes: [A, { ...B, oeffentlich: true }] }
    const d = rowToShareData(alles, [{ key: "k", routeId: "r-b", routeName: "Variante B" }])
    expect(d.routes).toHaveLength(2)
    expect(d.distanzKm).toBe(100)
    expect(d.findings[0].routeName).toBe("Variante B")
  })
})

// DIE STILLE FALLE: normalizeRoutes ersetzt beim Speichern das ganze Streckenarray und
// behaelt nur die Felder, die es namentlich kennt. Fehlt `oeffentlich` dort, verschwindet die
// Auswahl beim naechsten Speichern — und die ausgeblendete Strecke steht wieder beim Kunden.
// Niemand bemerkt das, weil die Oberflaeche bis zum Neuladen den richtigen Zustand zeigt.
// Genau so ist `verifiziert` schon einmal verlorengegangen (T-593).
describe("die Auswahl ueberlebt das Speichern", () => {
  it("normalizeRoutes behaelt oeffentlich: false", async () => {
    const { normalizeRoutes } = await import("../src/routes/projects.js")
    const [r] = normalizeRoutes([
      { id: "r-1", name: "Variante B", farbe: "#abc", points: [{ lat: 52, lng: 9 }], oeffentlich: false },
    ])
    expect(r.oeffentlich).toBe(false)
  })

  it("und speichert die Voreinstellung NICHT mit", () => {
    // Sichtbar ist die Voreinstellung. Das Feld auch dann zu schreiben, wenn es true ist,
    // blaehte jede bestehende Strecke um ein Feld auf, das nichts aussagt.
    return import("../src/routes/projects.js").then(({ normalizeRoutes }) => {
      const [an] = normalizeRoutes([{ id: "r-1", name: "A", farbe: "#abc", points: [], oeffentlich: true }])
      const [ohne] = normalizeRoutes([{ id: "r-2", name: "B", farbe: "#abc", points: [] }])
      expect(an).not.toHaveProperty("oeffentlich")
      expect(ohne).not.toHaveProperty("oeffentlich")
    })
  })
})
