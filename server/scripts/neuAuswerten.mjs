// Alle ausgewerteten Projekte STILL neu rechnen (T-664/T-684).
//
// AUFRUF:
//   docker exec <api-container> node scripts/neuAuswerten.mjs [--alle] [--projekt <id>]
//
// Ohne --alle wird nur EIN Projekt gerechnet (das mit den meisten Funden) und der Vergleich
// gezeigt. Das ist Absicht: erst sehen, was passiert, dann auf alle loslassen.
//
// WOZU: Funde entstehen bei der Analyse und werden gespeichert. Ein Fix an den Regeln ändert sie
// nicht rückwirkend — die Datenbank trägt weiter das Ergebnis von damals. Nach einer Runde
// Engine-Änderungen muss einmal durchgerechnet werden, sonst zeigt die Oberfläche den alten Stand.
//
// WARUM NICHT rerunAffectedProjects: das ist der Auto-Rerun nach einem Sync. Er baut aus dem
// Fund-Diff Benachrichtigungen und verschickt MAILS an die Mandanten-Mitglieder (rerunAll.js,
// sendProjectNotificationMail). Nach einer Regeländerung ändern sich hunderte Funde auf einmal,
// und die Nutzer bekämen einen Schwall Post über Änderungen, die keine echten Ereignisse sind,
// sondern eine korrigierte Bewertung. Dieses Skript rechnet dieselbe Analyse, schreibt aber keine
// Benachrichtigung und verschickt keine Mail.
//
// DER OSRM-SCHUTZ IST ÜBERNOMMEN, nicht weggelassen: die Analyse überschreibt die Funde jedes
// Projekts, und der Überführungs- wie der Kreuzungsfilter brauchen die Straßen-Refs aus OSRM. Ist
// OSRM konfiguriert, aber gerade nicht erreichbar, kämen die gefilterten Überführungen projektweit
// zurück — ein stilles Daten-Downgrade. Dann lieber gar nicht laufen.

import { createDefaultDb } from "../src/db.js"
import { rowToProject } from "../src/map.js"
import { runAnalysis, usableRoutes } from "../src/engine/index.js"
import { createOsrm } from "../src/external/osrm.js"

const ALLE = process.argv.includes("--alle")
const nurId = (() => {
  const i = process.argv.indexOf("--projekt")
  return i >= 0 ? process.argv[i + 1] : null
})()

const db = createDefaultDb()
const sage = (t) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${t}`)

const osrm = createOsrm({ fetchImpl: globalThis.fetch })
if (osrm && !(await osrm.ping())) {
  sage("ABBRUCH: OSRM ist nicht erreichbar. Ein Lauf ohne Router wuerde die gefilterten")
  sage("Ueberfuehrungen projektweit zurueckbringen. Spaeter erneut versuchen.")
  process.exit(2)
}
sage(osrm ? "OSRM erreichbar." : "Kein OSRM konfiguriert — Filter greifen nicht (Design-Wahl).")

const { rows } = await db.query(
  "SELECT * FROM projects WHERE archived_at IS NULL AND status = 'fertig' ORDER BY updated_at DESC",
)
let kandidaten = rows.filter((row) => usableRoutes(rowToProject(row, [], null).routes).length > 0)
if (nurId) kandidaten = kandidaten.filter((r) => String(r.id) === nurId)
sage(`${kandidaten.length} auswertbare Projekte.`)

// Fundstand vorher, je Projekt und je Schweregrad
const vorher = new Map()
for (const r of (await db.query(
  `SELECT project_id, severity, count(*)::int n FROM findings GROUP BY 1, 2`)).rows) {
  if (!vorher.has(r.project_id)) vorher.set(r.project_id, {})
  vorher.get(r.project_id)[r.severity] = r.n
}

if (!ALLE && !nurId) {
  // Probelauf: das Projekt mit den meisten Funden, damit der Vergleich etwas hergibt.
  kandidaten.sort((a, b) => {
    const s = (x) => Object.values(vorher.get(x.id) ?? {}).reduce((q, n) => q + n, 0)
    return s(b) - s(a)
  })
  kandidaten = kandidaten.slice(0, 1)
  sage(`PROBELAUF mit einem Projekt: "${kandidaten[0]?.name}". Mit --alle fuer den ganzen Bestand.`)
}

const summe = { kritisch: 0, warnung: 0, hinweis: 0 }
let fehler = 0
for (const [i, row] of kandidaten.entries()) {
  const project = rowToProject(row, [], null)
  const v = vorher.get(row.id) ?? {}
  try {
    await runAnalysis({ db, project, osrm })
  } catch (err) {
    fehler++
    sage(`FEHLER bei "${project.name}": ${err?.message ?? err}`)
    continue
  }
  const n = Object.fromEntries(
    (await db.query(
      `SELECT severity, count(*)::int n FROM findings WHERE project_id = $1 GROUP BY 1`, [row.id],
    )).rows.map((r) => [r.severity, r.n]),
  )
  for (const s of ["kritisch", "warnung", "hinweis"]) summe[s] += (n[s] ?? 0) - (v[s] ?? 0)
  const delta = ["kritisch", "warnung", "hinweis"]
    .map((s) => `${s} ${v[s] ?? 0}→${n[s] ?? 0}`)
    .join(", ")
  sage(`${String(i + 1).padStart(3)}/${kandidaten.length}  ${project.name}: ${delta}`)
}

sage(`\nFertig. Fehler: ${fehler}.`)
sage(`Bilanz ueber alle gerechneten Projekte: kritisch ${summe.kritisch >= 0 ? "+" : ""}${summe.kritisch}, ` +
     `warnung ${summe.warnung >= 0 ? "+" : ""}${summe.warnung}, hinweis ${summe.hinweis >= 0 ? "+" : ""}${summe.hinweis}`)
process.exit(fehler ? 1 : 0)
