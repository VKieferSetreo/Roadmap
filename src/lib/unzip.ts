// Minimaler ZIP-Leser für den Browser (T-739). Gebraucht wird er allein für KMZ — das ist ein ZIP
// mit einer doc.kml darin. Shapefile-ZIPs entpackt shpjs selbst.
//
// Bewusst OHNE neue Abhängigkeit: but-unzip liegt zwar in node_modules, hängt dort aber nur
// transitiv unter shpjs. Sich darauf zu stützen wäre eine Wette darauf, dass shpjs seine eigene
// Abhängigkeit nie austauscht. Das Header-Parsing ist von server/src/connectors/_helpers.js
// (unzipEntry) abgeschaut, inklusive des dortigen Deckels gegen Zip-Bomben.
//
// Unterschied zur Server-Variante: gelesen wird über das Central Directory am Dateiende, nicht
// über die lokalen Header. Lokale Header tragen bei Streaming-Schreibern (Data Descriptor) keine
// Größe — genau die überspringt die Server-Variante, und genau so schreiben manche KMZ-Exporter.

export interface ZipEintrag {
  name: string
  /** Entpackte Bytes. */
  daten: Uint8Array
}

/** Deckel gegen Zip-Bomben: darüber liegt kein legitimes KMZ. Gilt je Eintrag. */
const MAX_ENTPACKT = 64 * 1024 * 1024

const EOCD_SIGNATUR = 0x06054b50
const CD_SIGNATUR = 0x02014b50

/** deflate-raw über die native DecompressionStream-API, mit Deckel auf die entpackte Größe. */
async function inflateRaw(daten: Uint8Array, maxEntpackt: number): Promise<Uint8Array> {
  const ds = new DecompressionStream("deflate-raw")
  const schreiben = (async () => {
    const writer = ds.writable.getWriter()
    // Kopie statt Sicht auf das Archiv: DecompressionStream nimmt keinen SharedArrayBuffer, und
    // genau den lässt der Typ eines beliebigen Uint8Array offen.
    await writer.write(daten.slice())
    await writer.close()
  })()
  // Der eigentliche Fehler kommt über den Reader an; ohne dieses catch bliebe er unbehandelt.
  schreiben.catch(() => {})

  const leser = (ds.readable as ReadableStream<Uint8Array>).getReader()
  const teile: Uint8Array[] = []
  let laenge = 0
  for (;;) {
    const { done, value } = await leser.read()
    if (done) break
    laenge += value.length
    if (laenge > maxEntpackt) {
      await leser.cancel().catch(() => {})
      throw new Error("Die Datei entpackt sich unverhältnismäßig groß und wurde abgewiesen.")
    }
    teile.push(value)
  }
  const out = new Uint8Array(laenge)
  let o = 0
  for (const t of teile) {
    out.set(t, o)
    o += t.length
  }
  return out
}

/** Entpackt ein ZIP-Archiv. Nur die Verfahren 0 (stored) und 8 (deflate); Ordner fallen raus. */
export async function unzip(buf: Uint8Array, maxEntpackt = MAX_ENTPACKT): Promise<ZipEintrag[]> {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  // End-of-Central-Directory von hinten suchen — dahinter darf ein Kommentar bis 64 KB stehen.
  let eocd = -1
  for (let i = buf.length - 22; i >= 0 && i >= buf.length - 22 - 0xffff; i--) {
    if (dv.getUint32(i, true) === EOCD_SIGNATUR) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw new Error("Die Datei ist kein lesbares ZIP-Archiv.")

  const anzahl = dv.getUint16(eocd + 10, true)
  const dekoder = new TextDecoder()
  const out: ZipEintrag[] = []
  let p = dv.getUint32(eocd + 16, true)
  for (let i = 0; i < anzahl; i++) {
    if (p < 0 || p + 46 > buf.length || dv.getUint32(p, true) !== CD_SIGNATUR) break
    const methode = dv.getUint16(p + 10, true)
    const komprimiert = dv.getUint32(p + 20, true)
    const entpackt = dv.getUint32(p + 24, true)
    const nameLaenge = dv.getUint16(p + 28, true)
    const name = dekoder.decode(buf.subarray(p + 46, p + 46 + nameLaenge))
    const lokal = dv.getUint32(p + 42, true)
    p += 46 + nameLaenge + dv.getUint16(p + 30, true) + dv.getUint16(p + 32, true)

    if (name.endsWith("/") || entpackt > maxEntpackt) continue
    if (lokal + 30 > buf.length) continue
    const start = lokal + 30 + dv.getUint16(lokal + 26, true) + dv.getUint16(lokal + 28, true)
    if (start + komprimiert > buf.length) continue
    const roh = buf.subarray(start, start + komprimiert)
    if (methode === 0) out.push({ name, daten: roh })
    else if (methode === 8) out.push({ name, daten: await inflateRaw(roh, maxEntpackt) })
  }
  return out
}
