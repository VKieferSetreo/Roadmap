// Connector Quelle 0126: Hessen Mobil — Lastbeschränkte Brücken (B/L/K), GST-gesperrt.
// Port aus API/Länder/Hessen/hessen-mobil-lastbeschraenkte-bruecken/*.cron.mjs.
// Quelle ist eine Behörden-PDF (kein WFS/API), bereits geparst nach JSON (136 Brücken).
// Die geparste Liste liegt als 0126_hessen_bruecken.data.json neben diesem Modul und wird
// pfadunabhängig über import.meta.url gelesen. Ohne Geokoordinaten (lat/lng=null) — Anker ist
// der ASB-Netzbezug (VNK/NNK). PDF-Stand-Snapshot, kein Live-Vollbestand → vollbestand=false.
//
// SCHNAPPSCHUSS, UND DAS MUSS MAN SEHEN (T-716). Diese Quelle liest eine Datei von der Platte:
// sie kann nicht ausfallen, nicht warnen und ist nach jedem Lauf „erfolgreich". Bis zum 05.09.2026
// verkaufte sie deshalb einen Auszug vom 27.02.2026 als tagesfrisch — 133 aktive Punkte, ältester
// Datensatz 83,9 Tage alt, im Register „zuletzt aktualisiert vor 30 Minuten", auf der Fundkarte
// „Stand: heute". Beide Zahlen kamen aus der Laufzeit, keine aus den Daten.
// Deshalb trägt jeder Punkt jetzt den PDF-Stand als Quellen-Stand, und der Lauf meldet ihn als
// `standAm` an den Importer (der datiert damit quellen.letzter_abruf, siehe importer.js).

import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
import { makeNormalized } from "./_helpers.js"

const QUELLE = "0126"
const QUELLE_NAME = "Hessen Mobil — Lastbeschränkte Brücken (GST-gesperrt)"
const QUELLE_URL = "https://mobil.hessen.de/verkehr/wirtschaftsverkehr/grossraum-und-schwertransporte/lastbeschraenkte-bruecken-im-zuge-von-bundes-landes-und-kreisstrassen"
const DATA_FILE = join(dirname(fileURLToPath(import.meta.url)), "0126_hessen_bruecken.data.json")

function normRef(r) {
  if (!r) return null
  const m = String(r).toUpperCase().match(/\b(A|B|L|K)\s?\d{1,4}\b/)
  return m ? m[0].replace(/\s/, "") : null
}

export const hessenBrueckenConnector = {
  quelleId: QUELLE,
  name: QUELLE_NAME,
  schedule: "0 8,12,18 * * *",
  vollbestand: false, // PDF-Stand-Snapshot ohne Geokoordinaten — kein Reconcile

  async fetch({ env = {}, timeoutMs = 30000, log = () => {} } = {}) {
    let daten
    try {
      daten = JSON.parse(readFileSync(DATA_FILE, "utf-8"))
    } catch (e) {
      log(`${QUELLE}: Datendatei nicht lesbar (${DATA_FILE}) — 0 obstacles`)
      return { obstacles: [] }
    }
    const bruecken = daten.bruecken ?? []
    const stand = daten.stand ?? null
    log(`${QUELLE}: ${bruecken.length} Brücken (PDF-Stand ${stand})`)

    const obstacles = bruecken.map((b) => {
      // strasse_oben_uef = Straße, die ÜBER das Bauwerk führt (= die Straße mit der Lastrestriktion).
      const ref = normRef(b.strasse_oben_uef) ?? normRef(b.strasse_unten_uf)
      const teil = String(b.teilbauwerk ?? "0")
      // Bauwerksnummer ist nicht eindeutig (mehrere ASB-Segmente je BW, alle teil=0) → VNK (Netzknoten-
      // Anfang) anhängen; er ist pro Segment eindeutig, sonst gingen Segmente beim Upsert verloren.
      const externeId = [b.bauwerksnummer, teil !== "0" ? teil : null, b.von_nk]
        .filter(Boolean).join("-")
      const punkt = makeNormalized({
        externeId,
        kategorie: "bruecke",
        name: b.bauwerksname || `Brücke ${b.bauwerksnummer}`,
        beschreibung: ([b.ort, b.strasse_oben_uef && `UeF ${b.strasse_oben_uef}`, b.strasse_unten_uf && `UF ${b.strasse_unten_uf}`]
          .filter(Boolean).join(", ") || "") + (b.lat ? " · Lage ortsgenau (geokodiert)" : "") || null,
        // Koordinaten einmalig ort-genau über Nominatim gebacken (siehe scripts/geocode_hessen_bruecken.mjs);
        // VNK/NNK bleibt der präzise ASB-Anker, lat/lng ist die Karten-Lage.
        lat: b.lat ?? null, lng: b.lng ?? null,
        strassenRef: ref,
        attrs: { grundsaetzlicheGstSperre: true },
        quelleName: QUELLE_NAME, quelleUrl: QUELLE_URL,
      })
      // makeNormalized stempelt quelle.aktualisiertAm auf JETZT — für einen Live-Feed richtig, für
      // eine Datei von der Platte falsch. Genau dieses Feld zeigen Fundkarte („Stand: …") und
      // Bericht („Daten-Stand", ReportView T-492) an. Ohne diese Zeile behauptet ein Bericht über
      // eine Hessen-Brücke Tagesaktualität für einen Auszug, der ein halbes Jahr alt ist.
      if (stand) punkt.quelle.aktualisiertAm = stand
      return punkt
    })
    // standAm: der Importer datiert quellen.letzter_abruf danach, statt nach der Laufzeit —
    // sonst steht im Quellenregister der Zeitpunkt des Dateilesens statt der Stand der Daten.
    return { obstacles, standAm: stand }
  },
}
