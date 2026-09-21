// Oeffentlicher Freigabelink fuer die Aenderungsauswertung — UNGATED.
//
// Haengt bewusst unter /_share: diesen Pfad routet der setreo-proxy bereits ohne forward_auth
// (siehe app.js). Ein eigener Pfad haette eine Proxy-Aenderung gebraucht, und eine Regel, die
// Authentifizierung aushebelt, will man genau an EINER Stelle haben, nicht an zweien.
//
// Der Token ist das ganze Geheimnis. Deshalb:
//   - 32 Byte aus randomBytes, nicht erratbar
//   - in der Datenbank steht nur sha256(token)
//   - Vergleich ueber den Hash, nicht ueber den Klartext
//   - noindex/nofollow, damit ein weitergereichter Link nicht in Suchmaschinen landet
//   - eigener Ratenbegrenzer je IP: ungated heisst, jeder darf klopfen

import { createHash, randomBytes, timingSafeEqual } from "node:crypto"
import { Router } from "express"
import { createRateLimiter } from "../shares.js"
import { ApiError, asyncHandler } from "../util.js"
import { berechneUebersicht } from "./veraenderungen.js"

const TAGE_MIN = 1
const TAGE_MAX = 365

export const hashToken = (token) => createHash("sha256").update(String(token)).digest("hex")

/** Neuer Token: 20 Byte als Kleinbuchstaben-Hex (40 Zeichen, 160 Bit).
 *
 *  BEWUSST kein base64url. Dessen "_" und "-" zerbrechen beim Weitergeben: Chat- und
 *  Mailprogramme beenden die automatische Verlinkung davor oder lesen "_text_" als
 *  Kursivauszeichnung, der Empfaenger bekommt einen abgeschnittenen Link und sieht
 *  "Freigabe nicht gefunden" (Max 2026-09-21: "lokal geht der, extern kommt diese
 *  Freigabe-Sache"). Hex hat nur 0-9a-f, ueberlebt jeden Transportweg und ist obendrein
 *  unempfindlich gegen Gross-/Kleinschreibung unterwegs.
 *
 *  Der Klartext wird EINMAL zurueckgegeben und nie gespeichert. */
export function neuerToken() {
  return randomBytes(20).toString("hex")
}

/** Hash-Vergleich in konstanter Zeit. Beide Seiten sind Hex gleicher Laenge. */
function hashGleich(a, b) {
  const x = Buffer.from(String(a), "hex")
  const y = Buffer.from(String(b), "hex")
  return x.length === y.length && timingSafeEqual(x, y)
}

// Der Token steht in der URL. URLs landen in Zugriffsprotokollen, im Verlauf und in der
// Zwischenablage — der Token selbst darf deshalb nirgends aus diesem Modul herausgeschrieben
// werden, auch nicht in eine Fehlermeldung.
async function ladeFreigabe(db, token) {
  if (typeof token !== "string" || token.length < 20 || token.length > 200) return null
  const { rows } = await db.query(
    `SELECT id, token_hash, name, tage FROM veraenderungen_freigaben
      WHERE token_hash = $1 AND widerrufen_am IS NULL`,
    [hashToken(token)],
  )
  const f = rows[0]
  if (!f || !hashGleich(f.token_hash, hashToken(token))) return null
  return f
}

/** Dieselbe Cache-first-Logik wie die angemeldete Route: die Berechnung dauert ~55 s. */
async function holeUebersicht(db, tage) {
  const { rows: [cached] } = await db.query(
    "SELECT payload, berechnet_am FROM veraenderungen_cache WHERE tage = $1",
    [tage],
  )
  if (cached) return { ...cached.payload, berechnetAm: cached.berechnet_am }
  const payload = await berechneUebersicht(db, tage)
  const berechnetAm = new Date()
  await db.query(
    `INSERT INTO veraenderungen_cache (tage, payload, berechnet_am) VALUES ($1, $2, $3)
       ON CONFLICT (tage) DO UPDATE SET payload = excluded.payload, berechnet_am = excluded.berechnet_am`,
    [tage, JSON.stringify(payload), berechnetAm],
  )
  return { ...payload, berechnetAm }
}

export function veraenderungenFreigabeRouter({ db, seiteHtml }) {
  const r = Router()
  // Grosszuegig genug fuer normales Lesen (die Seite holt einmal), eng genug gegen Durchprobieren.
  const limiter = createRateLimiter({ max: 60, windowMs: 60_000 })

  const drossel = (req, res, next) => {
    if (!limiter(req.ip || "anon")) throw new ApiError(429, "Zu viele Anfragen — bitte kurz warten")
    next()
  }
  const nichtIndexieren = (res) => {
    res.setHeader("X-Robots-Tag", "noindex, nofollow")
    res.setHeader("Referrer-Policy", "no-referrer")
    res.setHeader("Cache-Control", "private, no-store")
  }

  // Ein ungueltiger Link ist der Normalfall, nicht der Ausnahmefall: widerrufen, abgelaufen
  // oder beim Weiterleiten zerbrochen. Wer ihn oeffnet, ist ein Mensch im Browser und bekam
  // bisher rohes JSON zu sehen ("Freigabe nicht gefunden oder widerrufen") — das liest sich
  // wie ein kaputter Server, nicht wie eine abgelaufene Einladung.
  const UNGUELTIG = `<!doctype html><html lang="de"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>Link nicht mehr gültig</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
background:#f7f8f7;color:#161c16;font:15px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,
Helvetica,Arial,sans-serif;padding:24px}main{max-width:30rem;text-align:center}
.m{font-size:12px;letter-spacing:.09em;text-transform:uppercase;color:#6aa511;font-weight:700}
h1{font-size:21px;margin:10px 0 12px;font-weight:650}p{color:#5d675d;margin:0 0 10px}</style>
</head><body><main><div class="m">Setreo</div>
<h1>Dieser Link ist nicht mehr gültig</h1>
<p>Er wurde zurückgezogen, oder er ist beim Weiterleiten unvollständig angekommen.</p>
<p>Bitte prüfen Sie, ob die Adresse vollständig kopiert wurde, und fragen Sie sonst
bei Ihrem Ansprechpartner nach einem neuen Link.</p></main></body></html>`

  // Die Seite selbst. Der Build aus server/public/freigabe holt die Zahlen per fetch von der
  // Route darunter.
  r.get("/v/:token", drossel, asyncHandler(async (req, res) => {
    nichtIndexieren(res)
    const f = await ladeFreigabe(db, req.params.token)
    if (!f) {
      // Laenge und Zeichenvorrat protokollieren, NIE den Token selbst: ein abgeschnittener
      // Link faellt damit sofort auf, ohne das Geheimnis in die Protokolle zu schreiben.
      const t = String(req.params.token ?? "")
      console.warn(`[freigabe] unbekannter Token: ${t.length} Zeichen, `
        + `${/^[0-9a-f]+$/.test(t) ? "hex" : /^[A-Za-z0-9_-]+$/.test(t) ? "base64url" : "anderes"}`)
      return res.status(404).type("html").send(UNGUELTIG)
    }
    res.type("html").send(seiteHtml)
  }))

  r.get("/v/:token/daten", drossel, asyncHandler(async (req, res) => {
    nichtIndexieren(res)
    const f = await ladeFreigabe(db, req.params.token)
    if (!f) throw new ApiError(404, "Freigabe nicht gefunden oder widerrufen")

    const gewuenscht = Number.parseInt(req.query.tage, 10)
    const tage = Number.isFinite(gewuenscht)
      ? Math.min(TAGE_MAX, Math.max(TAGE_MIN, gewuenscht))
      : f.tage
    const daten = await holeUebersicht(db, tage)

    // Zaehler nachfuehren, aber den Abruf nicht daran haengen.
    db.query(
      "UPDATE veraenderungen_freigaben SET zugriffe = zugriffe + 1, letzter_zugriff = now() WHERE id = $1",
      [f.id],
    ).catch(() => { /* Statistik ist entbehrlich */ })

    res.json({ ...daten, freigabe: { name: f.name ?? null } })
  }))

  return r
}

/** Verwaltung der Freigaben — GEGATET, nur Admin. Liegt bewusst in derselben Datei wie der
 *  oeffentliche Teil: wer hier etwas aendert, sieht beide Seiten auf einen Blick. Die
 *  umgekehrte Richtung (veraenderungen.js importiert von hier) waere ein Importzirkel. */
export function veraenderungenFreigabeAdminRouter({ db, basisUrl }) {
  const r = Router()

  const link = (token) => `${String(basisUrl).replace(/\/$/, "")}/_share/v/${token}`

  r.get("/", asyncHandler(async (req, res) => {
    const { rows } = await db.query(
      `SELECT id, name, tage, erstellt_von, erstellt_am, widerrufen_am, letzter_zugriff, zugriffe
         FROM veraenderungen_freigaben ORDER BY erstellt_am DESC`,
    )
    // Ohne token_hash: der bringt dem Frontend nichts und gehoert nicht ins Netz.
    res.json({ freigaben: rows.map((f) => ({ ...f, zugriffe: Number(f.zugriffe) })) })
  }))

  r.post("/", asyncHandler(async (req, res) => {
    const name = typeof req.body?.name === "string" ? req.body.name.trim().slice(0, 120) : null
    const gewuenscht = Number.parseInt(req.body?.tage, 10)
    const tage = Number.isFinite(gewuenscht) ? Math.min(TAGE_MAX, Math.max(TAGE_MIN, gewuenscht)) : 30
    const token = neuerToken()
    const { rows: [f] } = await db.query(
      `INSERT INTO veraenderungen_freigaben (token_hash, name, tage, erstellt_von)
       VALUES ($1, $2, $3, $4) RETURNING id, name, tage, erstellt_am`,
      [hashToken(token), name || null, tage, req.user?.email ?? null],
    )
    // EINZIGE Gelegenheit, den Token zu sehen. Danach steht nur noch sein Hash in der Datenbank,
    // ein verlorener Link laesst sich nicht wiederherstellen, nur ersetzen.
    res.status(201).json({ ...f, url: link(token) })
  }))

  r.delete("/:id", asyncHandler(async (req, res) => {
    const { rowCount } = await db.query(
      "UPDATE veraenderungen_freigaben SET widerrufen_am = now() WHERE id = $1 AND widerrufen_am IS NULL",
      [req.params.id],
    )
    if (!rowCount) throw new ApiError(404, "Freigabe nicht gefunden oder bereits widerrufen")
    res.json({ ok: true })
  }))

  return r
}
