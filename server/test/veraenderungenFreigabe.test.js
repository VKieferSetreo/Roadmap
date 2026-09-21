// Oeffentlicher Freigabelink der Aenderungsauswertung. Geprueft wird das, was bei einer
// UNGEGATETEN Route schiefgehen kann: falscher/widerrufener Token, und dass der Klartext-Token
// die Anwendung nie Richtung Datenbank verlaesst.
//
// Bewusst mit einer eigenen, winzigen Datenbank-Attrappe statt ueber makeApp: die dortige
// Attrappe kennt das SQL der Auswertung nicht, und fuer diese Fragen braucht es sie auch nicht.

import express from "express"
import request from "supertest"
import { describe, expect, it } from "vitest"
import { hashToken, neuerToken, veraenderungenFreigabeRouter } from "../src/routes/veraenderungenFreigabe.js"

const SEITE = "<!doctype html><title>Seite</title>"

/** Attrappe, die nur die drei Abfragen der Route kennt und jede gesehene SQL mitschreibt. */
function fakeDb({ freigabe = null, payload = { tage: 30, gesamt: { neu: 1 } } } = {}) {
  const gesehen = []
  return {
    gesehen,
    async query(sql, params = []) {
      gesehen.push({ sql, params })
      if (sql.includes("FROM veraenderungen_freigaben")) {
        const treffer = freigabe && params[0] === freigabe.token_hash ? [freigabe] : []
        return { rows: treffer, rowCount: treffer.length }
      }
      if (sql.includes("FROM veraenderungen_cache")) {
        return { rows: [{ payload, berechnet_am: new Date("2026-09-21T04:00:00Z") }], rowCount: 1 }
      }
      return { rows: [], rowCount: 1 }
    },
  }
}

function makeApp(db) {
  const app = express()
  app.use("/_share", veraenderungenFreigabeRouter({ db, seiteHtml: SEITE }))
  // Fehlerbehandlung wie in der Anwendung: ApiError traegt status.
  app.use((err, _req, res, _next) => res.status(err.status ?? 500).json({ error: err.message }))
  return app
}

describe("Freigabelink Aenderungsauswertung", () => {
  it("gueltiger Token liefert die Seite, ohne Indexierung", async () => {
    const token = neuerToken()
    const db = fakeDb({ freigabe: { id: "f1", token_hash: hashToken(token), name: "Kunde A", tage: 30 } })
    const res = await request(makeApp(db)).get(`/_share/v/${token}`)
    expect(res.status).toBe(200)
    expect(res.text).toContain("<title>Seite</title>")
    expect(res.headers["x-robots-tag"]).toBe("noindex, nofollow")
    expect(res.headers["referrer-policy"]).toBe("no-referrer")
    expect(res.headers["cache-control"]).toBe("private, no-store")
  })

  it("gueltiger Token liefert die Zahlen inklusive Name der Freigabe", async () => {
    const token = neuerToken()
    const db = fakeDb({ freigabe: { id: "f1", token_hash: hashToken(token), name: "Kunde A", tage: 30 } })
    const res = await request(makeApp(db)).get(`/_share/v/${token}/daten`)
    expect(res.status).toBe(200)
    expect(res.body.gesamt).toEqual({ neu: 1 })
    expect(res.body.freigabe).toEqual({ name: "Kunde A" })
  })

  it("unbekannter und widerrufener Token enden beide in 404", async () => {
    // Widerrufen heisst: die Abfrage filtert die Zeile weg, die Attrappe liefert nichts.
    const db = fakeDb({ freigabe: { id: "f1", token_hash: hashToken(neuerToken()), name: null, tage: 30 } })
    const app = makeApp(db)
    for (const pfad of ["/_share/v/" + neuerToken(), "/_share/v/" + neuerToken() + "/daten"]) {
      const res = await request(app).get(pfad)
      expect(res.status).toBe(404)
    }
  })

  it("zu kurzer Token wird abgewiesen, ohne die Datenbank zu fragen", async () => {
    const db = fakeDb()
    const res = await request(makeApp(db)).get("/_share/v/kurz")
    expect(res.status).toBe(404)
    expect(db.gesehen).toHaveLength(0)
  })

  it("der Klartext-Token erreicht die Datenbank nie, nur sein Hash", async () => {
    const token = neuerToken()
    const db = fakeDb({ freigabe: { id: "f1", token_hash: hashToken(token), name: null, tage: 30 } })
    await request(makeApp(db)).get(`/_share/v/${token}/daten`)
    expect(db.gesehen.length).toBeGreaterThan(0)
    const alles = JSON.stringify(db.gesehen)
    expect(alles).not.toContain(token)
    expect(alles).toContain(hashToken(token))
  })

  it("tage aus der Abfrage wird auf 1..365 begrenzt", async () => {
    const token = neuerToken()
    const db = fakeDb({ freigabe: { id: "f1", token_hash: hashToken(token), name: null, tage: 30 } })
    const app = makeApp(db)
    await request(app).get(`/_share/v/${token}/daten?tage=99999`)
    await request(app).get(`/_share/v/${token}/daten?tage=-5`)
    const cacheAbfragen = db.gesehen.filter((q) => q.sql.includes("FROM veraenderungen_cache"))
    expect(cacheAbfragen.map((q) => q.params[0])).toEqual([365, 1])
  })

  it("neuerToken liefert jedes Mal einen anderen, ausreichend langen Wert", () => {
    const werte = new Set(Array.from({ length: 200 }, () => neuerToken()))
    expect(werte.size).toBe(200)
    for (const t of werte) expect(t.length).toBeGreaterThanOrEqual(43)
  })
})
