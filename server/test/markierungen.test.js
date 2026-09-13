// Punkt-Ebenen am Projekt (T-739): Persistenz, Whitelist und die Mengengrenzen.
//
// Der Kern dieser Suite ist die VERTRAUENSGRENZE: das Frontend prüft dieselben Grenzen, aber der
// Server darf sich darauf nicht verlassen — die Requests hier kommen ohne Frontend zustande.

import request from "supertest"
import { describe, expect, it } from "vitest"
import { MARKIERUNG_GRENZEN, normalizeMarkierungen } from "../src/routes/projects.js"
import { createProject, makeApp } from "./helpers/testApp.js"

const punkte = (n, ab = 0) =>
  Array.from({ length: n }, (_, i) => ({ lat: 53 + (i + ab) / 100_000, lng: 10 + (i + ab) / 100_000 }))

describe("Markierungen: PATCH speichert und liest zurück", () => {
  it("speichert Ebene samt Punkten, Namen und Attributen", async () => {
    const { app } = makeApp()
    const p = await createProject(app)
    const res = await request(app).patch(`/api/projects/${p.id}`).send({
      markierungen: [{
        id: "m-1",
        name: "Parkplätze",
        fileName: "parkplaetze.kml",
        farbe: "#0F766E",
        punkte: [{ lat: 53.5, lng: 10.0, name: "P1", attribute: { Betreiber: "Stadt", Plätze: 12 } }],
      }],
    })
    expect(res.status).toBe(200)
    expect(res.body.markierungen).toHaveLength(1)
    expect(res.body.markierungen[0]).toMatchObject({
      id: "m-1", name: "Parkplätze", fileName: "parkplaetze.kml", farbe: "#0F766E",
    })
    // Attributwerte sind IMMER Text (Vertrag Record<string,string>) — die 12 kommt als "12" zurück.
    expect(res.body.markierungen[0].punkte[0]).toEqual({
      lat: 53.5, lng: 10.0, name: "P1", attribute: { Betreiber: "Stadt", Plätze: "12" },
    })
    // Beim erneuten Laden unverändert da (nicht nur in der PATCH-Antwort).
    const wieder = await request(app).get(`/api/projects/${p.id}`)
    expect(wieder.body.markierungen[0].punkte).toHaveLength(1)
  })

  it("ersetzt das ganze Array und lässt bestehende Ebenen unangetastet, wenn das Feld fehlt", async () => {
    const { app } = makeApp()
    const p = await createProject(app)
    await request(app).patch(`/api/projects/${p.id}`).send({
      markierungen: [{ id: "m-1", name: "A", farbe: "#0F766E", punkte: punkte(3) }],
    })
    // PATCH ohne markierungen → bleibt stehen (kein stilles Leeren).
    const ohne = await request(app).patch(`/api/projects/${p.id}`).send({ name: "Neuer Name" })
    expect(ohne.body.markierungen).toHaveLength(1)
    // PATCH mit markierungen → ersetzt, nicht gemerged.
    const ersetzt = await request(app).patch(`/api/projects/${p.id}`).send({
      markierungen: [{ id: "m-2", name: "B", farbe: "#6D28D9", punkte: punkte(1) }],
    })
    expect(ersetzt.body.markierungen.map((e) => e.id)).toEqual(["m-2"])
    // Und explizit leeren geht auch.
    const leer = await request(app).patch(`/api/projects/${p.id}`).send({ markierungen: [] })
    expect(leer.body.markierungen).toEqual([])
  })

  it("vergibt Defaults und verwirft unbekannte Felder (Whitelist)", async () => {
    const { app } = makeApp()
    const p = await createProject(app)
    const res = await request(app).patch(`/api/projects/${p.id}`).send({
      markierungen: [{
        punkte: [{ lat: 53.5, lng: 10.0, gewicht: 42 }],
        heimlich: "sollte verschwinden",
        oeffentlich: true, // Voreinstellung → wird NICHT gespeichert (nur false ist ein Zustand)
      }],
    })
    const e = res.body.markierungen[0]
    expect(e.id).toBeTruthy()
    expect(e.name).toBe("Ebene 1")
    expect(e.farbe).toBe("#0F766E")
    expect(e.fileName).toBeUndefined()
    expect(e.heimlich).toBeUndefined()
    expect(e.oeffentlich).toBeUndefined()
    expect(e.punkte[0]).toEqual({ lat: 53.5, lng: 10.0 }) // gewicht fällt weg
  })

  it("kaputte Shapes → 400", async () => {
    const { app } = makeApp()
    const p = await createProject(app)
    expect((await request(app).patch(`/api/projects/${p.id}`).send({ markierungen: "kaputt" })).status).toBe(400)
    expect((await request(app).patch(`/api/projects/${p.id}`).send({ markierungen: [1] })).status).toBe(400)
    expect((await request(app).patch(`/api/projects/${p.id}`).send({ markierungen: [{ punkte: "x" }] })).status).toBe(400)
  })
})

describe("Markierungen: ein Listen-Stand darf keine Punkte löschen", () => {
  // Gemessen am 13.09. gegen eine echte Postgres: 5 Punkte in der DB, ein PATCH mit dem Stand aus
  // GET /api/projects (punkte: [], anzahl: n) — danach 0. Das Frontend schützt sich davor, der Server
  // muss es aber auch tun: ein alter Tab oder ein anderer Client schriebe sonst still Datenverlust.
  it("lehnt eine Ebene mit `anzahl` ab, statt ihre Punkte zu überschreiben", async () => {
    const { app } = makeApp()
    const p = await createProject(app)
    await request(app).patch(`/api/projects/${p.id}`).send({
      markierungen: [{ id: "m-1", name: "Parkplätze", farbe: "#0F766E", punkte: punkte(3) }],
    })

    const liste = await request(app).get("/api/projects")
    const listenStand = liste.body.projects.find((x) => x.id === p.id).markierungen
    expect(listenStand[0]).toMatchObject({ punkte: [], anzahl: 3 })

    const res = await request(app).patch(`/api/projects/${p.id}`).send({ markierungen: listenStand })
    expect(res.status).toBe(409)
    expect(res.body.error).toMatch(/nicht vollständig geladen/)

    // Und das ist der eigentliche Beleg: die Punkte stehen noch.
    const detail = await request(app).get(`/api/projects/${p.id}`)
    expect(detail.body.markierungen[0].punkte).toHaveLength(3)
  })

  it("lässt ein PATCH ohne das Feld markierungen die Punkte unberührt", async () => {
    const { app } = makeApp()
    const p = await createProject(app)
    await request(app).patch(`/api/projects/${p.id}`).send({
      markierungen: [{ id: "m-1", name: "Parkplätze", farbe: "#0F766E", punkte: punkte(3) }],
    })
    const res = await request(app).patch(`/api/projects/${p.id}`).send({ name: "Umbenannt" })
    expect(res.status).toBe(200)
    const detail = await request(app).get(`/api/projects/${p.id}`)
    expect(detail.body.name).toBe("Umbenannt")
    expect(detail.body.markierungen[0].punkte).toHaveLength(3)
  })
})

describe("Markierungen: die Grenzen greifen serverseitig", () => {
  it("kappt eine Ebene auf 5.000 Punkte, statt sie zu verlieren oder auszudünnen", () => {
    const [e] = normalizeMarkierungen([{ name: "Viele", farbe: "#0F766E", punkte: punkte(6000) }])
    expect(e.punkte).toHaveLength(MARKIERUNG_GRENZEN.punkteJeEbene)
    // NICHT ausgedünnt: es sind die ERSTEN 5.000, lückenlos in Originalreihenfolge.
    expect(e.punkte[0]).toEqual({ lat: 53, lng: 10 })
    expect(e.punkte[1].lat).toBeCloseTo(53.00001, 8)
  })

  it("deckelt die Punkte ÜBER ALLE Ebenen, nicht nur je Ebene", () => {
    // Fünf volle Ebenen wären 25.000 Punkte. Der Gesamtdeckel (20.000) muss vorher greifen,
    // sonst könnte man ihn durch Aufteilen auf viele Ebenen umgehen.
    const ebenen = normalizeMarkierungen(
      Array.from({ length: 5 }, (_, i) => ({ name: `E${i}`, farbe: "#0F766E", punkte: punkte(5000) })),
    )
    const gesamt = ebenen.reduce((n, e) => n + e.punkte.length, 0)
    expect(gesamt).toBe(MARKIERUNG_GRENZEN.punkteJeProjekt)
    // Die vorderen Ebenen bleiben voll, die letzte läuft leer — kein Ausdünnen quer über alles.
    expect(ebenen[0].punkte).toHaveLength(MARKIERUNG_GRENZEN.punkteJeEbene)
    expect(ebenen[4].punkte).toHaveLength(0)
  })

  it("mehr als 50 Ebenen → 400 mit klarer Meldung (statt stiller Verluste)", async () => {
    const { app } = makeApp()
    const p = await createProject(app)
    const viele = Array.from({ length: 51 }, (_, i) => ({ name: `E${i}`, farbe: "#0F766E", punkte: punkte(1, i) }))
    const res = await request(app).patch(`/api/projects/${p.id}`).send({ markierungen: viele })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/höchstens 50 Markierungs-Ebenen/)
    // 50 gehen durch.
    const ok = await request(app).patch(`/api/projects/${p.id}`).send({ markierungen: viele.slice(0, 50) })
    expect(ok.status).toBe(200)
    expect(ok.body.markierungen).toHaveLength(50)
  })

  it("kappt Attribute auf 30 je Punkt und wirft Verschachteltes weg", () => {
    const attribute = Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`k${i}`, `w${i}`]))
    attribute.verschachtelt = { nein: true } // Objekte fliegen raus statt "[object Object]"
    const [e] = normalizeMarkierungen([{ punkte: [{ lat: 53, lng: 10, attribute }] }])
    const a = e.punkte[0].attribute
    expect(Object.keys(a)).toHaveLength(MARKIERUNG_GRENZEN.attributeJePunkt)
    expect(Object.keys(a)).toContain("k0") // die ERSTEN 30, nicht irgendwelche
    expect(a.verschachtelt).toBeUndefined()
  })

  it("kappt Attribut-Schlüssel auf 60 und Attribut-Werte auf 200 Zeichen", () => {
    const attribute = { ["x".repeat(200)]: "y".repeat(500) }
    const [e] = normalizeMarkierungen([{ punkte: [{ lat: 53, lng: 10, attribute }] }])
    const [key] = Object.keys(e.punkte[0].attribute)
    expect(key).toHaveLength(MARKIERUNG_GRENZEN.attributSchluesselLaenge)
    expect(e.punkte[0].attribute[key]).toHaveLength(MARKIERUNG_GRENZEN.attributWertLaenge)
  })

  it("verwirft kaputte Koordinaten punktweise, nicht die ganze Ebene", () => {
    const [e] = normalizeMarkierungen([{
      name: "Gemischt",
      punkte: [
        { lat: 53.5, lng: 10.0 },
        { lat: Number.NaN, lng: 10.0 },
        { lat: 53.5, lng: Number.POSITIVE_INFINITY },
        { lat: 91, lng: 10 }, // außerhalb der Erde (z.B. Shapefile in falscher Projektion)
        { lat: 53, lng: -181 },
        { lat: "53.5", lng: "10.0" }, // Strings sind keine Zahlen
        null,
      ],
    }])
    expect(e.punkte).toEqual([{ lat: 53.5, lng: 10.0 }])
  })

  it("kappt Namen und ersetzt Nicht-Hex-Farben (die Farbe landet im FE in einer Stil-Angabe)", () => {
    const [e] = normalizeMarkierungen([{
      name: "N".repeat(500),
      farbe: "red; background:url(x)",
      punkte: [{ lat: 53, lng: 10, name: "P".repeat(500) }],
    }])
    expect(e.name).toHaveLength(MARKIERUNG_GRENZEN.namensLaenge)
    expect(e.farbe).toBe("#0F766E")
    expect(e.punkte[0].name).toHaveLength(MARKIERUNG_GRENZEN.namensLaenge)
  })

  // BEWUSST OHNE TEST: der 413-Zweig für entity.too.large (app.js) braucht einen echten Body über
  // 20 MB. Der Test lief hier und war grün, blieb aber nicht stehen — die 21 MB kosten im
  // Gesamtlauf so viel, dass die uhrzeit-/lastempfindlichen Tests anderswo häufiger umkippen
  // (share.test.js Rate-Limit-Fenster, tenantAdmin, authExtern). Dieselbe Entscheidung wie
  // T-041 in share.test.js: Last aus der Suite nehmen, nicht dazutun.
})

describe("Markierungen: Liste ohne Punktlast, Share ohne abgewählte Ebenen", () => {
  it("GET /api/projects liefert nur Metadaten + anzahl, GET /:id die Punkte", async () => {
    const { app } = makeApp()
    const p = await createProject(app)
    await request(app).patch(`/api/projects/${p.id}`).send({
      markierungen: [
        { id: "m-1", name: "Voll", farbe: "#0F766E", punkte: punkte(120) },
        { id: "m-2", name: "Leer", farbe: "#6D28D9", punkte: [] },
      ],
    })

    const liste = await request(app).get("/api/projects")
    const [voll, leer] = liste.body.projects.find((x) => x.id === p.id).markierungen
    expect(voll).toMatchObject({ id: "m-1", name: "Voll", farbe: "#0F766E", punkte: [], anzahl: 120 })
    // Der Unterschied „nicht geladen" vs. „leer" bleibt erkennbar: `anzahl` existiert in der Liste
    // IMMER, im Detail NIE — auch die leere Ebene trägt es also.
    expect(leer).toMatchObject({ id: "m-2", punkte: [], anzahl: 0 })
    expect(leer.anzahl).toBeDefined()

    const detail = await request(app).get(`/api/projects/${p.id}`)
    expect(detail.body.markierungen[0].punkte).toHaveLength(120)
    expect(detail.body.markierungen[0].anzahl).toBeUndefined()
    expect(detail.body.markierungen[1].punkte).toEqual([])
    expect(detail.body.markierungen[1].anzahl).toBeUndefined()
  })

  it("oeffentlich:false erscheint im geteilten Link gar nicht — auch nicht als leere Ebene", async () => {
    const { app } = makeApp()
    const p = await createProject(app)
    await request(app).patch(`/api/projects/${p.id}`).send({
      markierungen: [
        { id: "m-1", name: "Sichtbar", farbe: "#0F766E", punkte: punkte(2) },
        { id: "m-2", name: "Intern", farbe: "#6D28D9", oeffentlich: false, punkte: punkte(2, 50) },
      ],
    })
    await request(app).post(`/api/projects/${p.id}/share`).send({})

    const res = await request(app).get(`/_share/api/setreo/${p.id}`)
    expect(res.status).toBe(200)
    const ebenen = res.body.data.markierungen
    expect(ebenen.map((e) => e.id)).toEqual(["m-1"]) // kein Platzhalter, kein leerer Rest
    expect(JSON.stringify(res.body.data)).not.toContain("Intern")
    // `oeffentlich` selbst wäre der Abdruck → darf nicht mitkommen.
    expect(Object.keys(ebenen[0]).sort()).toEqual(["farbe", "id", "name", "punkte"])
  })
})
