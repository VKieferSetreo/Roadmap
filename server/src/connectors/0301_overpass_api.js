// Connector Quelle 0301: Overpass API (OpenStreetMap) — GST-Restriktionen + Bauwerke.
// Port aus API/Sonstige/overpass-api/overpass-api.cron.mjs (1:1-Logik).
// Zieht OSM-Elemente (Way + Node + Relation via nwr) mit maxheight/maxweight/maxwidth/maxaxleload
// (+ bridge/tunnel) je Bundesland-Area. Restriktionen stehen oft auch auf Nodes (barrier=height_restrictor,
// bollard, lift_gate) oder Relationen — diese würden bei reinem way-Selektor still verloren gehen.
//
// vollbestand=FALSE: Overpass kennt keinen Offset; Voll-DE in einem Query ist zu groß/last-intensiv
// (Timeout). Wir chunken über Bundesland-Areas (admin_level=4) und mergen — das deckt DE faktisch ab,
// aber falls einzelne Area-Queries timeouten fehlen Teile, daher KEIN destruktiver Reconcile.

import { makeNormalized, stabilHash } from "./_helpers.js"

const QUELLE_NAME = "Overpass API (OpenStreetMap)"
// Mehrere Instanzen — bei Rate-Limit (429) wird die nächste probiert.
const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
]
const UA = "Roadmap-Setreo-Cron/1.0 (klattigmaximilian@gmail.com)"

// Tags, die ein Strecken-Hindernis markieren.
const RESTRIKTIONS_TAGS = ["maxheight", "maxweight", "maxweight:rating:hgv", "maxwidth", "maxaxleload"]

// DE-weit über Bundesland-Areas chunken (Overpass hat keinen Offset → geografisches Chunking).
// WICHTIG: Bundesländer (admin_level=4) tragen ISO3166-2 (z.B. DE-HB) — NICHT ISO3166-1=DE
// (das steht nur am Land). Area-Selektor daher über ISO3166-2 (stabiler als der Name).
const BUNDESLAENDER = [
  { name: "Baden-Württemberg", iso: "DE-BW" }, { name: "Bayern", iso: "DE-BY" },
  { name: "Berlin", iso: "DE-BE" }, { name: "Brandenburg", iso: "DE-BB" },
  { name: "Bremen", iso: "DE-HB" }, { name: "Hamburg", iso: "DE-HH" },
  { name: "Hessen", iso: "DE-HE" }, { name: "Mecklenburg-Vorpommern", iso: "DE-MV" },
  { name: "Niedersachsen", iso: "DE-NI" }, { name: "Nordrhein-Westfalen", iso: "DE-NW" },
  { name: "Rheinland-Pfalz", iso: "DE-RP" }, { name: "Saarland", iso: "DE-SL" },
  { name: "Sachsen", iso: "DE-SN" }, { name: "Sachsen-Anhalt", iso: "DE-ST" },
  { name: "Schleswig-Holstein", iso: "DE-SH" }, { name: "Thüringen", iso: "DE-TH" },
]

function queryFuerLand(iso) {
  // nwr = node+way+relation: Restriktions-Tags stehen häufig auch auf Nodes (Schranken, Höhen-
  // begrenzer, Poller) und Relationen — reiner way-Selektor verlöre einen kompletten Element-Typ.
  const tagFilter = RESTRIKTIONS_TAGS.map((t) => `nwr["${t}"](area.a);`).join("")
  // out center geom: liefert für Nodes lat/lon, für Way/Relation einen center-Punkt + Geometrie.
  return `[out:json][timeout:180];area["ISO3166-2"="${iso}"][admin_level=4]->.a;(${tagFilter});out tags center geom;`
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** Overpass-Query mit Mirror-Rotation + Backoff bei 429 (Rate-Limit) / Fehlern. */
async function overpass(query, timeoutMs) {
  let lastErr
  // bis zu 3 Versuche, je Versuch eine andere Instanz; bei 429 vor dem nächsten warten.
  for (let attempt = 0; attempt < 3; attempt++) {
    const endpoint = ENDPOINTS[attempt % ENDPOINTS.length]
    try {
      const r = await fetch(endpoint, {
        method: "POST",
        headers: { "user-agent": UA, "content-type": "application/x-www-form-urlencoded" },
        body: "data=" + encodeURIComponent(query),
        signal: AbortSignal.timeout(timeoutMs),
      })
      if (r.status === 429) {
        lastErr = new Error("Overpass HTTP 429 (Rate-Limit)")
        await sleep(8000 * (attempt + 1)) // 8s, 16s, 24s
        continue
      }
      if (!r.ok) throw new Error(`Overpass HTTP ${r.status}`)
      return r.json()
    } catch (e) {
      lastErr = e
      await sleep(3000)
    }
  }
  throw lastErr ?? new Error("Overpass: alle Instanzen fehlgeschlagen")
}

/** OSM-Maßangabe → Zahl. Sentinels ("none"/"default"/"no_sign"/"unsigned") = keine echte Grenze. */
function osmMass(v) {
  if (v == null) return null
  const s = String(v).trim().toLowerCase()
  if (!s || ["none", "default", "no_sign", "unsigned", "no", "yes"].includes(s)) return null
  const m = s.replace(",", ".").match(/(\d+(?:\.\d+)?)/)
  return m ? Number(m[1]) : null
}

/** Kategorie aus den Tags: Bauwerk (tunnel/bridge) hat Vorrang, sonst nach restriktivem Maß. */
function kategorieAus(tags, maxHoeheM, maxBreiteM, maxGewichtT) {
  if (tags.tunnel && tags.tunnel !== "no") return "tunnel"
  if (tags.bridge && tags.bridge !== "no") return "bruecke"
  if (maxHoeheM != null || maxBreiteM != null) return "engstelle"
  if (maxGewichtT != null) return "gewicht"
  return "engstelle"
}

/** Koordinate aus einem OSM-Element retten — alle Element-/Geometrie-Typen, KEINE Verluste:
 *  Node trägt lat/lon direkt; Way/Relation liefern via "out center" einen center-Punkt; sonst
 *  Mittelpunkt über alle Geometrie-Vertices (toleranter als nur geometry[0]). */
function koordVonElement(el) {
  // 1) Node: lat/lon direkt am Element.
  if (el.lat != null && el.lon != null) return { lat: el.lat, lng: el.lon }
  // 2) Way/Relation mit "out center": center.{lat,lon}.
  if (el.center && el.center.lat != null && el.center.lon != null) {
    return { lat: el.center.lat, lng: el.center.lon }
  }
  // 3) Geometrie vorhanden → Mittelpunkt über alle gültigen Vertices.
  if (Array.isArray(el.geometry) && el.geometry.length > 0) {
    let sumLat = 0, sumLng = 0, n = 0
    for (const p of el.geometry) {
      if (p && p.lat != null && p.lon != null) { sumLat += p.lat; sumLng += p.lon; n++ }
    }
    if (n > 0) return { lat: sumLat / n, lng: sumLng / n }
  }
  return { lat: null, lng: null }
}

export const overpassApiConnector = {
  quelleId: "0301",
  name: QUELLE_NAME,
  schedule: "0 8,12,18 * * *",
  // Geografisches Area-Chunking ohne Offset; einzelne Land-Queries können timeouten →
  // KEIN vollständig garantierter Bestand → vollbestand=false (kein destruktiver Reconcile).
  vollbestand: false,

  async fetch({ env = {}, log = () => {} } = {}) {
    // EIGENER langer Timeout: Overpass braucht je großem Bundesland bis ~180 s. Der globale
    // EXTERNAL_TIMEOUT_MS (40 s, für REST-Feeds) würde die großen Länder killen → wir ignorieren
    // ihn hier bewusst. vollbestand=false: ein in einem Run getimeoutetes Land bleibt aus dem
    // letzten Run erhalten (kein destruktiver Reconcile), der Bestand heilt über mehrere Läufe.
    const timeoutMs = 200000
    // OVERPASS_ONLY_ISO (z.B. "DE-BY"): nur dieses eine Bundesland ziehen. Ermöglicht das
    // einmalige Backfill als 16 Einzel-Runs (je eigene DB-Transaktion) — übersteht Deploys/
    // Container-Restarts, idempotent re-runbar (Upsert auf ${type}/<id>#hash). Leer = alle 16 (Default).
    const nurIso = String(env.OVERPASS_ONLY_ISO ?? "").trim()
    const laender = nurIso ? BUNDESLAENDER.filter((b) => b.iso === nurIso) : BUNDESLAENDER
    const obstacles = []
    let verfuegbar = 0

    for (const [i, { name: land, iso }] of laender.entries()) {
      if (i > 0) await sleep(4000) // Rate-Limit-Höflichkeit zwischen den Bundesländern
      let data
      try {
        data = await overpass(queryFuerLand(iso), timeoutMs)
      } catch (e) {
        log(`${land}: Overpass-Fehler (${e.message}) — übersprungen`)
        continue
      }
      // node + way + relation behalten (nur Elemente mit Tags) — kein Element-Typ wird gedroppt.
      const elements = (data.elements ?? []).filter((e) => e.tags && (e.type === "node" || e.type === "way" || e.type === "relation"))
      verfuegbar += elements.length
      log(`${land}: ${elements.length} Elemente (node/way/relation) mit Restriktions-Tag`)

      for (const el of elements) {
        const t = el.tags
        const maxHoeheM = osmMass(t.maxheight)
        const maxBreiteM = osmMass(t.maxwidth)
        // maxweight:rating:hgv = LKW-spezifische Tragfähigkeit → vor generischem maxweight
        const maxGewichtT = osmMass(t["maxweight:rating:hgv"]) ?? osmMass(t.maxweight)
        const maxAchslastT = osmMass(t.maxaxleload)

        // Nur Datensätze mit mind. einem echten Grenzwert (Sentinels rausgefiltert)
        if (maxHoeheM == null && maxBreiteM == null && maxGewichtT == null && maxAchslastT == null) continue

        const { lat, lng } = koordVonElement(el)
        const kategorie = kategorieAus(t, maxHoeheM, maxBreiteM, maxGewichtT)
        const name = t.name ?? t.ref
          ?? (t.bridge && t.bridge !== "no" ? "Brücke (OSM)"
            : t.tunnel && t.tunnel !== "no" ? "Tunnel (OSM)" : "Restriktion (OSM)")

        // externeId: STABIL & EINDEUTIG. Basis = OSM-Identität `${type}/${id}` (global eindeutig &
        // run-stabil; node/123 ≠ way/123 ≠ relation/123 — sonst Kollision). Zusätzlich ein
        // stabilHash-Diskriminator über unterscheidende Quellfelder (Ort, Ref/Richtung, Grenzwerte,
        // Bauwerk-Art, erste Beschreibung): schützt selbst dann gegen Kollabieren, falls ein Quell-id
        // mehrfach/ohne id käme. Kein Index/Zufall → reconcile-stabil über Läufe.
        const quellId = `${el.type}/${el.id}`
        const externeId = `${quellId}#${stabilHash(
          lat, lng,
          el.type,
          t.ref ?? null,
          t.direction ?? t.oneway ?? null,
          maxHoeheM, maxBreiteM, maxGewichtT, maxAchslastT,
          t.bridge ?? null, t.tunnel ?? null,
          (t.highway ?? name ?? ""),
        )}`

        obstacles.push(makeNormalized({
          externeId,
          kategorie,
          name,
          beschreibung: t.highway ? `OSM highway=${t.highway}` : null,
          lat, lng,
          strassenRef: t.ref ?? null,
          attrs: { maxHoeheM, maxBreiteM, maxGewichtT, maxAchslastT },
          quelleName: QUELLE_NAME,
          quelleUrl: `https://www.openstreetmap.org/${el.type}/${el.id}`,
        }))
      }
    }

    log(`verfügbar (Ways m. Tag): ${verfuegbar} · normalisiert: ${obstacles.length}`)
    return { obstacles }
  },
}
