// Einmaliger Initial-Aufbereitungslauf: geht über JEDEN importierten Bestands-Datenpunkt (aktiv,
// nicht-Tenant, nicht manuell korrigiert) und füllt fehlende strukturierte Felder aus dem Freitext.
// Idempotent (nur Lücken) → beliebig oft re-runbar, übersteht Container-Kills. Läuft im api-Container:
//   docker exec -d <api> sh -c "node /tmp/enrich_db.mjs > /tmp/enrich_db.log 2>&1"
import { createDefaultDb } from "/app/src/db.js"
import { enrichFromText } from "/app/src/enrich.js"

const db = createDefaultDb()
const BATCH = 2000
const UPDATE = `UPDATE obstacles SET
    attrs = $2::jsonb,
    gueltig_von = COALESCE(gueltig_von, $3::date),
    gueltig_bis = COALESCE(gueltig_bis, $4::date),
    strassen_ref = COALESCE(strassen_ref, $5),
    richtung = COALESCE(richtung, $6),
    confidence = COALESCE(confidence, $7),
    updated_at = now()
  WHERE id = $1`

const SELECT = `SELECT id, name, beschreibung, attrs, gueltig_von, gueltig_bis, strassen_ref, richtung
  FROM obstacles
  WHERE aktiv AND tenant_id IS NULL AND COALESCE(manuell_korrigiert, false) = false
    AND id > $1
  ORDER BY id
  LIMIT ${BATCH}`

console.log("ENRICH-DB START", new Date().toISOString())
let lastId = "00000000-0000-0000-0000-000000000000"
let scanned = 0, changed = 0
const c = { von: 0, bis: 0, ref: 0, richtung: 0, attrs: 0 }

for (;;) {
  const { rows } = await db.query(SELECT, [lastId])
  if (!rows.length) break
  await db.tx(async (q) => {
    for (const r of rows) {
      lastId = r.id
      scanned++
      const patch = enrichFromText({
        name: r.name, beschreibung: r.beschreibung, attrs: r.attrs,
        gueltigVon: r.gueltig_von, gueltigBis: r.gueltig_bis,
        strassenRef: r.strassen_ref, richtung: r.richtung,
      })
      if (!patch.changed) continue
      changed++
      if (patch.gueltigVon) c.von++
      if (patch.gueltigBis) c.bis++
      if (patch.strassenRef) c.ref++
      if (patch.richtung) c.richtung++
      // attrs neu = mehr Schlüssel als vorher?
      const vorher = r.attrs && typeof r.attrs === "object" ? Object.keys(r.attrs).length : 0
      if (Object.keys(patch.attrs).length > vorher) c.attrs++
      await q.query(UPDATE, [
        r.id, JSON.stringify(patch.attrs),
        patch.gueltigVon ?? null, patch.gueltigBis ?? null,
        patch.strassenRef ?? null, patch.richtung ?? null, patch.confidence ?? null,
      ])
    }
  })
  console.log(`… ${scanned} geprüft · ${changed} angereichert (von:${c.von} bis:${c.bis} ref:${c.ref} ri:${c.richtung} attrs:${c.attrs})`)
}

console.log("ENRICH-DB FERTIG", new Date().toISOString(),
  `· ${scanned} geprüft · ${changed} angereichert · von:${c.von} bis:${c.bis} ref:${c.ref} richtung:${c.richtung} attrs:${c.attrs}`)
process.exit(0)
