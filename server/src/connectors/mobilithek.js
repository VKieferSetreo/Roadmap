// Mobilithek-Connectoren (Nationaler Zugangspunkt, DATEX II via mTLS-Pull).
// Mobilithek liefert KEINEN globalen Endpunkt — man bucht je Bundesland/Bund ein „Angebot"
// und zieht es per Client-Zertifikat (mTLS). Darum sind die Feeds env-getrieben: ein
// Connector pro gebuchtem Angebot. Bis Max' Konto + Zertifikat da sind, liefert das Modul
// nichts (leere Liste) — es ist VORBEREITET, nicht scharf.
//
// Aktivierung (sobald Account da):
//   1. Zertifikat hinterlegen:  MOBILITHEK_CERT, MOBILITHEK_KEY  (PEM-String ODER Dateipfad),
//      optional MOBILITHEK_PASSPHRASE.
//   2. Gebuchte Angebote als JSON in MOBILITHEK_FEEDS, z.B.:
//      MOBILITHEK_FEEDS='[{"quelleId":"0009","name":"Mobilithek NI Baustellen","url":"https://mobilithek.de/.../clientPullService?subscriptionID=..."},
//                         {"quelleId":"0110","name":"Mobilithek BB Baustellen","url":"..."}]'
//   3. quelleIds in env CONNECTORS aufnehmen → der Worker plant sie nach Schedule (8/12/18).

import { readFileSync } from "node:fs"
import { request as httpsRequest } from "node:https"
import { gunzip } from "node:zlib"
import { parseDatex2 } from "./datex2.js"
import { resolveTmc } from "./tmcResolver.js"

const DEFAULT_SCHEDULE = "0 8,12,18 * * *" // 3× täglich (Max-Vorgabe)

/** PEM aus env: entweder direkter PEM-String (enthält 'BEGIN') oder ein Dateipfad. */
function readPem(value) {
  if (!value) return null
  if (value.includes("BEGIN")) return value
  try {
    return readFileSync(value, "utf8")
  } catch {
    return null
  }
}

/** mTLS-GET (Client-Pull, TSSB §6.2.1) → { status, xml, lastModified }. node:https kann
 *  Client-Zertifikate nativ; gzip-Body wird entpackt, 204/304 sauber als „kein Inhalt". */
function mtlsGet(url, { cert, key, ca, passphrase, ifModifiedSince, timeoutMs = 30000 }) {
  return new Promise((resolve) => {
    const u = new URL(url)
    const req = httpsRequest(
      {
        hostname: u.hostname,
        port: u.port || 443,
        path: u.pathname + u.search,
        method: "GET",
        cert,
        key,
        ca: ca || undefined, // Ausstellerzertifikat aus der .p12 (MOBILITHEK_CA)
        passphrase: passphrase || undefined,
        headers: {
          accept: "application/xml, text/xml, */*",
          "accept-encoding": "gzip", // TSSB §6.2.1: Body ist gzip-komprimiert
          ...(ifModifiedSince ? { "if-modified-since": ifModifiedSince } : {}),
        },
        timeout: timeoutMs,
      },
      (res) => {
        const code = res.statusCode || 0
        // 204 = kein Paket im Puffer · 304 = nichts Neues (Delta-Polling) → kein Fehler, nur leer
        if (code === 204 || code === 304) {
          res.resume()
          return resolve({ status: code, xml: null, lastModified: res.headers["last-modified"] || null })
        }
        if (code >= 400) {
          res.resume()
          return resolve({ status: code, xml: null, lastModified: null })
        }
        const chunks = []
        res.on("data", (c) => chunks.push(c))
        res.on("end", () => {
          const buf = Buffer.concat(chunks)
          const gz = (res.headers["content-encoding"] || "").includes("gzip")
          const done = (xml) => resolve({ status: code, xml, lastModified: res.headers["last-modified"] || null })
          // T-302#9: Dekompressions-Cap gegen Gzip-Bomb — >256 MB entpackt → err → null (Feed wird
          // übersprungen statt den Worker-Heap zu fluten). Reale DATEX2-Feeds liegen weit darunter.
          if (gz) gunzip(buf, { maxOutputLength: 256 * 1024 * 1024 }, (err, out) => done(err ? null : out.toString("utf8")))
          else done(buf.toString("utf8"))
        })
      },
    )
    req.on("error", () => resolve({ status: 0, xml: null, lastModified: null }))
    req.on("timeout", () => {
      req.destroy()
      resolve({ status: 0, xml: null, lastModified: null })
    })
    req.end()
  })
}

/** Feed-Konfiguration aus env lesen ([] wenn nicht/kaputt konfiguriert). */
export function mobilithekFeeds(env = process.env) {
  try {
    const arr = JSON.parse(env.MOBILITHEK_FEEDS || "[]")
    return Array.isArray(arr) ? arr.filter((f) => f && f.quelleId && f.url) : []
  } catch {
    return []
  }
}

// Last-Modified je Subskription (In-Memory) → If-Modified-Since-Delta-Polling (spart Bandbreite).
const lastModifiedBySub = new Map()

/** Baut einen Connector für EIN gebuchtes Mobilithek-Angebot.
 *  `url` = der Client-Pull-Endpunkt mit subscriptionID, z.B.
 *  https://mobilithek.info:8443/mobilithek/api/V1.0/subscription?subscriptionID=<ID> */
export function makeMobilithekConnector({ quelleId, name, url, schedule = DEFAULT_SCHEDULE, tmc = false }) {
  return {
    quelleId,
    name: name || `Mobilithek ${quelleId}`,
    schedule,
    // DATEX-II-Container = voller aktueller Lagebestand des Angebots → Reconcile erlaubt.
    vollbestand: true,
    async fetch({ env = process.env, timeoutMs = 30000, log = () => {} } = {}) {
      const cert = readPem(env.MOBILITHEK_CERT)
      const key = readPem(env.MOBILITHEK_KEY)
      const ca = readPem(env.MOBILITHEK_CA)
      if (!cert || !key) {
        log(`${quelleId}: kein Mobilithek-Zertifikat hinterlegt — übersprungen (Account ausstehend)`)
        return { obstacles: [] }
      }
      const res = await mtlsGet(url, {
        cert, key, ca, passphrase: env.MOBILITHEK_PASSPHRASE,
        ifModifiedSince: lastModifiedBySub.get(url) || undefined, timeoutMs,
      })
      if (res.status === 304 || res.status === 204) {
        log(`${quelleId}: ${res.status === 304 ? "nichts Neues (304)" : "kein Paket im Puffer (204)"} — Bestand unverändert`)
        return { obstacles: [], unveraendert: true } // Importer macht ohne Items keinen destruktiven Reconcile
      }
      if (res.status >= 400 || !res.xml) {
        log(`${quelleId}: Fehler/leer (HTTP ${res.status}) — Endpunkt/Zertifikat/Subskription prüfen`)
        return { obstacles: [] }
      }
      if (res.lastModified) lastModifiedBySub.set(url, res.lastModified)
      // tmc=true (ALERT-C-only-Quellen wie NI): Location-Codes über die BASt-LCL geocodieren.
      const obstacles = parseDatex2(res.xml, {
        quelleName: name, quelleUrl: url, resolveTmc: tmc ? resolveTmc : undefined,
      })
      log(`${quelleId}: ${obstacles.length} DATEX-II-Records normalisiert`)
      return { obstacles }
    },
  }
}

/** Alle aktuell konfigurierten Mobilithek-Connectoren (leer bis Account+Feeds gesetzt). */
export function mobilithekConnectors(env = process.env) {
  return mobilithekFeeds(env).map((f) =>
    makeMobilithekConnector({
      quelleId: f.quelleId, name: f.name, url: f.url, schedule: f.schedule, tmc: f.tmc === true,
    }),
  )
}
