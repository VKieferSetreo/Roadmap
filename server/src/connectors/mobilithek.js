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
import { parseDatex2 } from "./datex2.js"

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

/** mTLS-GET → XML-Text (oder null bei Fehler/Timeout). node:https kann Client-Zertifikate nativ. */
function mtlsGet(url, { cert, key, passphrase, timeoutMs = 30000 }) {
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
        passphrase: passphrase || undefined,
        headers: { accept: "application/xml, text/xml, */*" },
        timeout: timeoutMs,
      },
      (res) => {
        if (res.statusCode && res.statusCode >= 400) {
          res.resume()
          return resolve(null)
        }
        let body = ""
        res.setEncoding("utf8")
        res.on("data", (c) => (body += c))
        res.on("end", () => resolve(body))
      },
    )
    req.on("error", () => resolve(null))
    req.on("timeout", () => {
      req.destroy()
      resolve(null)
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

/** Baut einen Connector für EIN gebuchtes Mobilithek-Angebot. */
export function makeMobilithekConnector({ quelleId, name, url, schedule = DEFAULT_SCHEDULE }) {
  return {
    quelleId,
    name: name || `Mobilithek ${quelleId}`,
    schedule,
    // DATEX-II-Container = voller aktueller Lagebestand des Angebots → Reconcile erlaubt.
    vollbestand: true,
    async fetch({ env = process.env, timeoutMs = 30000, log = () => {} } = {}) {
      const cert = readPem(env.MOBILITHEK_CERT)
      const key = readPem(env.MOBILITHEK_KEY)
      if (!cert || !key) {
        log(`${quelleId}: kein Mobilithek-Zertifikat hinterlegt — übersprungen (Account ausstehend)`)
        return { obstacles: [] }
      }
      const xml = await mtlsGet(url, { cert, key, passphrase: env.MOBILITHEK_PASSPHRASE, timeoutMs })
      if (!xml) {
        log(`${quelleId}: kein/leerer DATEX-II-Response (Endpunkt/Zertifikat prüfen)`)
        return { obstacles: [] }
      }
      const obstacles = parseDatex2(xml, { quelleName: name, quelleUrl: url })
      log(`${quelleId}: ${obstacles.length} DATEX-II-Records normalisiert`)
      return { obstacles }
    },
  }
}

/** Alle aktuell konfigurierten Mobilithek-Connectoren (leer bis Account+Feeds gesetzt). */
export function mobilithekConnectors(env = process.env) {
  return mobilithekFeeds(env).map((f) =>
    makeMobilithekConnector({ quelleId: f.quelleId, name: f.name, url: f.url, schedule: f.schedule }),
  )
}
