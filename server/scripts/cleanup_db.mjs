// Einmalige Bestands-Bereinigung: räumt Dreck auf, der vor dem makeNormalized-Sanitizing entstand.
//   - 0-Sentinel bei Maß-Attributen entfernen (zeigt sonst "0 m"/"0 t")
//   - falschen Key laengeM → sperrlaengeM umbenennen (FE-Label sonst Roh-Key)
//   - HTML/Entities/Mehrfach-Spaces aus beschreibung strippen
//   - leere/whitespace-strassen_ref → null, name trimmen
// Idempotent (re-runbar), keyset-paginiert. Läuft im api-Container.
import { createDefaultDb } from "/app/src/db.js"
import { stripHtml } from "/app/src/connectors/_helpers.js"

const DROP0 = new Set(["restbreiteM", "maxBreiteM", "maxHoeheM", "maxGewichtT", "maxAchslastT", "maxLaengeM", "sperrlaengeM", "radiusM"])
const BATCH = 2000
const db = createDefaultDb()
const SELECT = `SELECT id, name, beschreibung, attrs, strassen_ref
  FROM obstacles WHERE tenant_id IS NULL AND id > $1 ORDER BY id LIMIT ${BATCH}`
const UPDATE = `UPDATE obstacles SET attrs=$2::jsonb, beschreibung=$3, strassen_ref=$4, name=$5, updated_at=now() WHERE id=$1`

console.log("CLEANUP-DB START", new Date().toISOString())
let lastId = "00000000-0000-0000-0000-000000000000"
let scanned = 0, changed = 0
const c = { sentinel0: 0, laengeRename: 0, html: 0, ref: 0, name: 0 }

for (;;) {
  const { rows } = await db.query(SELECT, [lastId])
  if (!rows.length) break
  await db.tx(async (q) => {
    for (const r of rows) {
      lastId = r.id
      scanned++
      let dirty = false
      const attrs = r.attrs && typeof r.attrs === "object" ? { ...r.attrs } : {}
      if (attrs.laengeM != null) {
        if (attrs.sperrlaengeM == null) attrs.sperrlaengeM = attrs.laengeM
        delete attrs.laengeM; dirty = true; c.laengeRename++
      }
      for (const k of DROP0) if (attrs[k] === 0) { delete attrs[k]; dirty = true; c.sentinel0++ }

      const beschNeu = stripHtml(r.beschreibung)
      const beschDirty = beschNeu !== r.beschreibung
      if (beschDirty) c.html++

      let ref = r.strassen_ref
      if (ref != null) { const t = ref.trim(); ref = t === "" ? null : t }
      const refDirty = ref !== r.strassen_ref
      if (refDirty) c.ref++

      let name = r.name
      if (name != null) { const t = name.trim().slice(0, 240); name = t || null }
      const nameDirty = name !== r.name
      if (nameDirty) c.name++

      if (dirty || beschDirty || refDirty || nameDirty) {
        changed++
        await q.query(UPDATE, [r.id, JSON.stringify(attrs), beschNeu, ref, name])
      }
    }
  })
  console.log(`… ${scanned} geprüft · ${changed} bereinigt (0-sentinel:${c.sentinel0} laengeM→:${c.laengeRename} html:${c.html} ref:${c.ref} name:${c.name})`)
}
console.log("CLEANUP-DB FERTIG", new Date().toISOString(),
  `· ${scanned} geprüft · ${changed} bereinigt · 0-sentinel:${c.sentinel0} laengeM→sperrlaengeM:${c.laengeRename} html:${c.html} ref:${c.ref} name:${c.name}`)
process.exit(0)
