// Findings-Signatur-Harness (B) — verifiziert, dass eine Engine-/Dedup-Änderung die
// produzierten Funde NICHT verändert (Max-Vorgabe: keine Kalibrierungs-Änderung ohne
// Signatur-Gleichheitsprüfung über alle Projekte).
//
// NICHT-DESTRUKTIV: ruft `analyze()` (reine Berechnung, kein DELETE/INSERT findings,
// kein analysis_runs-Record) — die Prod-Findings bleiben unangetastet.
//
//   node scripts/findings-signature.js capture  baseline.json   # vor der Änderung
//   <Engine ändern + deployen>
//   node scripts/findings-signature.js compare  baseline.json   # nach der Änderung → Diff, exit 1 bei Drift
//   node scripts/findings-signature.js selftest                 # Diff-Logik-Selbsttest (keine DB)
//
// Läuft als Coolify Scheduled Task im api-Container (Prod-DB nicht laptop-erreichbar,
// OSRM nicht nötig — analyze nutzt die GESPEICHERTE Routen-Geometrie, kein Re-Routing).

import { writeFileSync, readFileSync } from "node:fs"
import { createHash } from "node:crypto"
import { createDb, createPool } from "../src/db.js"
import { loadEnv } from "../src/env.js"
import { rowToProject } from "../src/map.js"
import { analyze, ENGINE_VERSION } from "../src/engine/index.js"

// Inhalts-Identität EINES Funds — spiegelt findingIdentity (rerunAll.js) + severity,
// damit auch ein Schweregrad-Flip (T-266) als Drift auffällt. Stabil über Re-Imports.
const normName = (s) => String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ")
function sig(f) {
  return [
    f.kategorie,
    normName(f.routeName),
    normName(f.titel),
    normName(f.strassenRef),
    Math.round(Number(f.km ?? 0)),
    f.severity,
  ].join("|")
}

// Sortierte Signaturliste + Hash je Projekt — der Hash ist der schnelle Gleichheits-Check,
// die Liste erlaubt den genauen Added/Removed-Diff.
function projectSignature(findings) {
  const sigs = findings.map(sig).sort()
  const hash = createHash("sha256").update(sigs.join("\n")).digest("hex").slice(0, 16)
  return { count: sigs.length, hash, sigs }
}

async function captureAll(db) {
  const { rows } = await db.query(
    "SELECT * FROM projects WHERE archived_at IS NULL AND status = 'fertig' ORDER BY id",
  )
  const projects = {}
  // Sequenziell (analyze zieht den vollen Bbox-Bestand in den Heap — wie rerunOne, Concurrency 1).
  for (const row of rows) {
    const project = rowToProject(row, [], null)
    try {
      const { findings } = await analyze({ db, project, corridorM: 20 })
      projects[row.id] = { name: project.name, ...projectSignature(findings) }
      process.stderr.write(`  ${project.name}: ${findings.length} Funde\n`)
    } catch (err) {
      projects[row.id] = { name: project.name, error: String(err?.message ?? err) }
      process.stderr.write(`  ${project.name}: FEHLER ${err?.message ?? err}\n`)
    }
  }
  return { engineVersion: ENGINE_VERSION, projectCount: rows.length, projects }
}

// Diff zweier Signatur-Snapshots → Liste der Projekte mit Abweichung (kein Drift = []).
function diffSnapshots(baseline, current) {
  const drift = []
  const ids = new Set([...Object.keys(baseline.projects), ...Object.keys(current.projects)])
  for (const id of ids) {
    const b = baseline.projects[id]
    const c = current.projects[id]
    if (!b) { drift.push({ id, name: c?.name, reason: "neu (nicht im Baseline)" }); continue }
    if (!c) { drift.push({ id, name: b.name, reason: "weggefallen (im Baseline, jetzt fehlt)" }); continue }
    if (b.error || c.error) {
      if (b.error !== c.error) drift.push({ id, name: c.name, reason: `Fehler-Wechsel: ${b.error ?? "—"} → ${c.error ?? "—"}` })
      continue
    }
    if (b.hash === c.hash) continue
    const bs = new Set(b.sigs), cs = new Set(c.sigs)
    drift.push({
      id, name: c.name,
      added: c.sigs.filter((s) => !bs.has(s)),
      removed: b.sigs.filter((s) => !cs.has(s)),
    })
  }
  return drift
}

function selftest() {
  const base = { projects: { p1: projectSignature([{ kategorie: "bruecke", routeName: "A1", titel: "X", strassenRef: "A1", km: 5, severity: "warnung" }]) } }
  // (a) identisch → kein Drift
  const same = { projects: { p1: projectSignature([{ kategorie: "bruecke", routeName: "A1", titel: "X", strassenRef: "A1", km: 5, severity: "warnung" }]) } }
  console.assert(diffSnapshots(base, same).length === 0, "identische Funde dürfen keinen Drift melden")
  // (b) severity-Flip → Drift mit added+removed
  const flip = { projects: { p1: projectSignature([{ kategorie: "bruecke", routeName: "A1", titel: "X", strassenRef: "A1", km: 5, severity: "kritisch" }]) } }
  const d = diffSnapshots(base, flip)
  console.assert(d.length === 1 && d[0].added.length === 1 && d[0].removed.length === 1, "severity-Flip muss als Drift erscheinen")
  // (c) zusätzlicher Fund → added
  const extra = { projects: { p1: projectSignature([
    { kategorie: "bruecke", routeName: "A1", titel: "X", strassenRef: "A1", km: 5, severity: "warnung" },
    { kategorie: "baustelle", routeName: "A1", titel: "Y", strassenRef: "A1", km: 9, severity: "kritisch" },
  ]) } }
  console.assert(diffSnapshots(base, extra)[0].added.length === 1, "neuer Fund muss als added erscheinen")
  console.log("selftest OK")
}

async function main() {
  const [mode, file] = process.argv.slice(2)
  if (mode === "selftest") return selftest()
  if (mode !== "capture" && mode !== "compare") {
    console.error("usage: findings-signature.js capture|compare <file> | selftest")
    process.exit(2)
  }
  loadEnv()
  const pool = createPool()
  const db = createDb(pool)
  try {
    const snap = await captureAll(db)
    if (mode === "capture") {
      writeFileSync(file, JSON.stringify(snap, null, 2))
      console.log(`baseline geschrieben: ${file} (${snap.projectCount} Projekte, engine ${snap.engineVersion})`)
      return
    }
    // compare
    const baseline = JSON.parse(readFileSync(file, "utf8"))
    const drift = diffSnapshots(baseline, snap)
    if (drift.length === 0) {
      console.log(`✓ KEIN DRIFT — ${snap.projectCount} Projekte signaturgleich (baseline engine ${baseline.engineVersion} → jetzt ${snap.engineVersion})`)
      return
    }
    console.error(`✗ DRIFT in ${drift.length} Projekt(en):`)
    for (const d of drift) {
      console.error(`  ${d.name} (${d.id}): ${d.reason ?? `+${d.added?.length ?? 0} / -${d.removed?.length ?? 0}`}`)
      for (const a of d.added ?? []) console.error(`    + ${a}`)
      for (const r of d.removed ?? []) console.error(`    - ${r}`)
    }
    process.exit(1)
  } finally {
    await pool.end()
  }
}

main().catch((err) => { console.error(err); process.exit(1) })
