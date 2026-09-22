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

// Wie die echte freigabe.html: mit </head>, denn genau dort wird der Stand eingehaengt.
const SEITE = "<!doctype html><html><head><title>Seite</title></head><body><div id=\"root\"></div></body></html>"

/** Attrappe, die nur die drei Abfragen der Route kennt und jede gesehene SQL mitschreibt. */
function fakeDb({ freigabe = null, payload = { tage: 30, gesamt: { neu: 1 } }, fenster = null } = {}) {
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
        // `fenster` = die Tage-Werte, die wirklich im Cache liegen. null bedeutet: alle drei da.
        const vorhanden = fenster ?? [7, 30, 90]
        const rows = vorhanden.map((t) => ({
          tage: t, payload: { ...payload, tage: t }, berechnet_am: new Date("2026-09-21T04:00:00Z"),
        }))
        return { rows, rowCount: rows.length }
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

  it("unsinnige tage-Werte liefern trotzdem einen Stand, keinen Fehler", async () => {
    const token = neuerToken()
    const db = fakeDb({ freigabe: { id: "f1", token_hash: hashToken(token), name: null, tage: 30 } })
    const app = makeApp(db)
    for (const t of ["99999", "-5", "abc", ""]) {
      const res = await request(app).get(`/_share/v/${token}/daten?tage=${t}`)
      expect(res.status).toBe(200)
      expect([7, 30, 90]).toContain(res.body.tage)
    }
  })

  // Der Grund fuer diese drei Tests: ein Empfaenger meldete "Daten nicht ladbar". Der oeffentliche
  // Weg darf NIE selbst rechnen — die Auswertung braucht fuer 90 Tage rund 160 s gegen ein
  // statement_timeout von 120 s, das endet zwangslaeufig im Fehler, nach zwei Minuten Warten.
  it("rechnet NIE selbst, auch wenn das gewuenschte Fenster fehlt", async () => {
    const token = neuerToken()
    const db = fakeDb({
      freigabe: { id: "f1", token_hash: hashToken(token), name: null, tage: 30 },
      fenster: [7, 90], // 30 fehlt
    })
    const res = await request(makeApp(db)).get(`/_share/v/${token}/daten?tage=30`)
    expect(res.status).toBe(200)
    // naechstliegendes vorhandenes Fenster, und ehrlich als solches ausgewiesen
    expect(res.body.tage).toBe(7)
    // keine einzige Abfrage gegen den Bestand — nur Freigabe, Cache und der Zugriffszaehler
    expect(db.gesehen.some((q) => q.sql.includes("FROM obstacles"))).toBe(false)
  })

  it("ohne jeden vorgerechneten Stand: 503 mit Retry-After statt Haenger", async () => {
    const token = neuerToken()
    const db = fakeDb({
      freigabe: { id: "f1", token_hash: hashToken(token), name: null, tage: 30 },
      fenster: [],
    })
    const res = await request(makeApp(db)).get(`/_share/v/${token}/daten?tage=30`)
    expect(res.status).toBe(503)
    expect(res.headers["retry-after"]).toBe("60")
  })

  // Der Grund: der Empfaenger sah "(403)", waehrend unser Server 199 Abrufe derselben Route
  // allesamt mit 200 beantwortete — der 403 kam von Cloudflare davor. Gegen fremde Bot-Regeln
  // hilft nur, den zweiten Abruf ganz abzuschaffen.
  it("legt die Zahlen MIT in die Seite, damit kein zweiter Abruf noetig ist", async () => {
    const token = neuerToken()
    const db = fakeDb({ freigabe: { id: "f1", token_hash: hashToken(token), name: null, tage: 30 } })
    const res = await request(makeApp(db)).get(`/_share/v/${token}`)
    expect(res.status).toBe(200)
    expect(res.text).toContain('id="veraenderungen-staende"')
    const json = res.text.match(/id="veraenderungen-staende">(.*?)<\/script>/s)[1]
    const staende = JSON.parse(json)
    expect(staende.map((d) => d.tage).sort((a, b) => a - b)).toEqual([7, 30, 90])
  })

  it("maskiert '<' in den eingebetteten Daten — sonst beendet ein </script> das Tag", async () => {
    const token = neuerToken()
    const db = fakeDb({
      freigabe: { id: "f1", token_hash: hashToken(token), name: null, tage: 30 },
      payload: { tage: 30, gesamt: { neu: 1 }, boeser: "</script><script>alert(1)</script>" },
    })
    const res = await request(makeApp(db)).get(`/_share/v/${token}`)
    expect(res.text).not.toContain("</script><script>alert(1)")
    expect(res.text).toContain("\\u003c/script")
  })

  it("ohne vorgerechneten Stand geht die Seite trotzdem raus (Frontend holt dann nach)", async () => {
    const token = neuerToken()
    const db = fakeDb({ freigabe: { id: "f1", token_hash: hashToken(token), name: null, tage: 30 }, fenster: [] })
    const res = await request(makeApp(db)).get(`/_share/v/${token}`)
    expect(res.status).toBe(200)
    expect(res.text).toContain("<title>Seite</title>")
    expect(res.text).not.toContain('id="veraenderungen-staende"')
  })

  it("neuerToken liefert jedes Mal einen anderen, ausreichend langen Wert", () => {
    const werte = new Set(Array.from({ length: 200 }, () => neuerToken()))
    expect(werte.size).toBe(200)
    for (const t of werte) expect(t.length).toBeGreaterThanOrEqual(40)
  })

  it("Token enthaelt NUR 0-9a-f — '_' und '-' zerbrechen Links beim Weitergeben", () => {
    // Chat- und Mailprogramme beenden die automatische Verlinkung vor '_' oder lesen
    // '_text_' als Kursivauszeichnung. Der Empfaenger bekommt dann einen abgeschnittenen
    // Link. Deshalb ein Zeichenvorrat, der jeden Transportweg ueberlebt.
    for (let i = 0; i < 50; i++) expect(neuerToken()).toMatch(/^[0-9a-f]{40}$/)
  })

  it("ungueltiger Token liefert eine lesbare Seite, kein rohes JSON", async () => {
    const db = fakeDb({ freigabe: { id: "f1", token_hash: hashToken(neuerToken()), name: null, tage: 30 } })
    const res = await request(makeApp(db)).get("/_share/v/" + neuerToken())
    expect(res.status).toBe(404)
    expect(res.headers["content-type"]).toMatch(/text\/html/)
    expect(res.text).toContain("Dieser Link ist nicht mehr gültig")
    // Der Datenpfad bleibt JSON: den ruft das Bundle auf, nicht ein Mensch.
    const daten = await request(makeApp(db)).get("/_share/v/" + neuerToken() + "/daten")
    expect(daten.status).toBe(404)
    expect(daten.headers["content-type"]).toMatch(/application\/json/)
  })
})
