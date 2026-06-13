// Connector-Registry: eine Liste { quelleId, name, schedule, vollbestand?, fetch(ctx) }.
//
// Neuen Connector ergänzen (5 Zeilen):
//   1. src/connectors/<quelle>.js anlegen — Objekt mit quelleId (aus dem
//      Quellen-Register, migrations/003), name, schedule (Cron) und
//      async fetch({fetchImpl, env, timeoutMs, log}) → { obstacles: NormalizedObstacle[] }
//   2. Hier importieren und in CONNECTORS eintragen.
//   3. Aktivieren: quelleId in env CONNECTORS aufnehmen (CSV) — oder manuell
//      über POST /api/admin/import/<quelleId> triggern (geht auch ohne Aktivierung).
//
// vollbestand: true  ⇒ der Connector liefert bei jedem Lauf den VOLLEN aktuellen
//   Datenbestand der Quelle (kein Zeitfenster-Ausschnitt). Nur dann darf der
//   Importer im Feed fehlende Einträge dieser Quelle deaktivieren (Reconcile —
//   abgebaute/abgesagte Baustellen verschwinden). Fenster-/Teil-Feeds: false lassen.
//
// NormalizedObstacle: { externeId, kategorie, name, beschreibung?, lat, lng,
//   strassenRef?, zustaendig?, attrs, gueltigVon?, gueltigBis?, realerStart?,
//   quelle: { name, url, aktualisiertAm } }

import { autobahnConnector } from "./autobahn.js"
import { mobilithekConnectors } from "./mobilithek.js"

// Statisch registrierte Connectoren (ein Modul je Quelle).
export const CONNECTORS = [
  autobahnConnector,
]

// Vollständiger Pool = statische + env-getriebene (Mobilithek-Angebote aus MOBILITHEK_FEEDS).
// Mobilithek liefert je gebuchtem Angebot einen Connector — leer bis Account/Feeds gesetzt.
const pool = (env = process.env) => [...CONNECTORS, ...mobilithekConnectors(env)]

/** Alle registrierten Connectoren (für den Sync-Button "alle Quellen ziehen"). */
export const allConnectors = (env = process.env) => pool(env)

export const getConnector = (quelleId, env = process.env) =>
  pool(env).find((c) => c.quelleId === quelleId) ?? null

/** Aktive Connectoren laut env CONNECTORS (CSV der quelleIds, Default leer). */
export function enabledConnectors(env = process.env) {
  const ids = String(env.CONNECTORS ?? "")
    .split(",").map((s) => s.trim()).filter(Boolean)
  return ids.map((id) => getConnector(id, env)).filter(Boolean)
}
