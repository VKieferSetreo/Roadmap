// Connector-Registry: eine Liste { quelleId, name, schedule, fetch(ctx) }.
//
// Neuen Connector ergänzen (5 Zeilen):
//   1. src/connectors/<quelle>.js anlegen — Objekt mit quelleId (aus dem
//      Quellen-Register, migrations/003), name, schedule (Cron) und
//      async fetch({fetchImpl, env, timeoutMs, log}) → { obstacles: NormalizedObstacle[] }
//   2. Hier importieren und in CONNECTORS eintragen.
//   3. Aktivieren: quelleId in env CONNECTORS aufnehmen (CSV) — oder manuell
//      über POST /api/admin/import/<quelleId> triggern (geht auch ohne Aktivierung).
//
// NormalizedObstacle: { externeId, kategorie, name, beschreibung?, lat, lng,
//   strassenRef?, zustaendig?, attrs, gueltigVon?, gueltigBis?, realerStart?,
//   quelle: { name, url, aktualisiertAm } }

import { autobahnConnector } from "./autobahn.js"

export const CONNECTORS = [
  autobahnConnector,
]

export const getConnector = (quelleId) =>
  CONNECTORS.find((c) => c.quelleId === quelleId) ?? null

/** Aktive Connectoren laut env CONNECTORS (CSV der quelleIds, Default leer). */
export function enabledConnectors(env = process.env) {
  const ids = String(env.CONNECTORS ?? "")
    .split(",").map((s) => s.trim()).filter(Boolean)
  return ids.map((id) => getConnector(id)).filter(Boolean)
}
