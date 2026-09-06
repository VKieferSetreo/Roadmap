// Connector Quelle 0218: Bonn — Baustellen (Baustellenmanagement der Bundesstadt Bonn, GDI Bonn).
//
// ERSATZ fuer den bisherigen Abrufweg dieser Quelle (06.09.2026). Der alte Connector zog
// https://stadtplan.bonn.de/geojson?Thema=14403. Die Stadt hat ihre Geodateninfrastruktur zum
// 17.07.2025 auf die Urban Data Platform umgestellt; stadtplan.bonn.de ist seither ein toter
// Proxy und antwortet auf JEDE Anfrage mit HTTP 502 (heute erneut gemessen: /geojson?Thema=14403,
// ?Thema=19584 und /csv?Thema=17790 → 3× 502). Der Nachfolger geoportal.udp.bonn.de war beim
// Bauen dieses Connectors selbst nicht erreichbar (502) und taugt nicht als Bezugsquelle.
//
// Die Daten selbst sind NICHT weg: stadtplan.bonn.de war nur die Ausleitung des GeoServers
// gdi.bonn.de, und der liefert weiter. Die Themennummer aus der alten URL ist dort der
// Layername — `open_data:thema_14403` heisst `od_baustellen_heute` und traegt exakt die
// Feldnamen, die der alte Connector erwartet hat (baustelle_id/bezeichnung/adresse/von/bis/
// massnahme/sperrung). Nur ist genau dieser Layer nicht publiziert (Feature type unknown,
// reproduzierbar ueber acht Versuche). Publiziert ist stattdessen `open_data:thema_14698`
// (`od_baustellen_diesesjahr_public`) mit demselben Feldschema und mehr Bestand: 64 statt der
// 8 heute verkehrswirksamen Baustellen, und ein echter Obermenge des 30-Tage-Layers
// (58/58 baustelle_id enthalten, gemessen 06.09.2026).
//
// Lizenz: Creative Commons Zero 1.0 (CC0) — kommerzielle Nutzung erlaubt. Der Datensatz-Eintrag
// „Baustellen tagesaktuell mit Ortsangabe in Bonn" auf opendata.bonn.de wies cc-zero aus
// (Archivstand 11.10.2025) und ist waehrend der Portal-Umstellung derzeit nicht gelistet; die
// Nutzungsbedingungen des Portals setzen CC0 als Regel, wenn die Datensatzbeschreibung nichts
// anderes sagt. Der hier genutzte GeoServer-Workspace heisst `open_data` und ist die
// Publikationsschicht genau dieses Angebots.
//
// ABRUF-FALLE (gemessen, nicht vermutet): gdi.bonn.de laeuft hinter einem Loadbalancer, dessen
// Knoten unterschiedliche Katalogstaende haben. Derselbe Aufruf liefert mal HTTP 200 mit den 64
// Features, mal HTTP 400 mit `Feature type … unknown` — 6 von 12 bzw. 5 von 10 Treffern je
// Endpunkt, ueber mehrere Messreihen stabil bei rund der Haelfte. Ein einzelner Versuch je Lauf
// wuerde also jeden zweiten Import in einen Fehler kippen. Deshalb wiederholt `wfsFeatures`
// gezielt auf HTTP-Status (das tut `getJson` NICHT, es retryt nur geworfene Netzfehler).

import { makeNormalized, getJson, ersterPunkt, dateOnly, stabilHash } from "./_helpers.js"

const QUELLE = "0218"
const QUELLE_NAME = "Bonn — Baustellen (Baustellenmanagement, GDI Bonn)"
const QUELLE_URL = "https://www.bonn.de/themen-entdecken/planen-bauen/geoinformation-liegenschaftskataster.php"
const WFS = "https://gdi.bonn.de/geoserver/ows"

// Sachdaten aus der Open-Data-Publikation (Punkt = amtlicher Infopunkt der Baustelle).
const SACHDATEN = "open_data:thema_14698"
// Dieselben 64 Baustellen als Baustellen-FLAECHE (64/64 baustelle_id deckungsgleich, gemessen).
// Der Strassenabschnitt ist fuer die Routenpruefung deutlich mehr wert als der blosse Punkt.
const FLAECHEN = "baustellen:v_baustellen_diesesjahr_public_p_25323"

// Rund 50 % Ausfallquote je Einzelaufruf (s. o.). Acht Versuche druecken das auf rund 0,4 %.
const VERSUCHE = 8
const BACKOFF_MS = process.env.VITEST ? 0 : 1000

/** Ein WFS-Layer als GeoJSON-Features. Wiederholt bei Fehlschlag (getJson liefert dann null),
 *  weil der Fehlschlag hier ein Knoten-Artefakt ist und kein echtes Nein. null = alle Versuche
 *  verbraucht. */
async function wfsFeatures(typeName, { timeoutMs, log }) {
  const url =
    `${WFS}?service=WFS&version=2.0.0&request=GetFeature` +
    `&typeNames=${encodeURIComponent(typeName)}` +
    `&outputFormat=${encodeURIComponent("application/json")}&srsName=EPSG:4326`
  for (let versuch = 1; versuch <= VERSUCHE; versuch++) {
    const data = await getJson(url, { timeoutMs })
    if (Array.isArray(data?.features)) {
      // Abgeschnittene Antwort ist kein Bestand: bei vollbestand:true wuerde der Reconcile den
      // fehlenden Rest deaktivieren („Strecke frei"). Lieber als Fehlversuch behandeln.
      const matched = Number(data.numberMatched)
      if (Number.isFinite(matched) && data.features.length < matched) {
        log(`${QUELLE}: ${typeName} unvollstaendig (${data.features.length}/${matched}) — Versuch ${versuch}/${VERSUCHE}`)
      } else {
        if (versuch > 1) log(`${QUELLE}: ${typeName} erst im Versuch ${versuch}/${VERSUCHE} geliefert`)
        return data.features
      }
    }
    if (versuch < VERSUCHE) await new Promise((r) => setTimeout(r, BACKOFF_MS))
  }
  return null
}

/** "Hermann-Wandersleb-Ring (B56)" → "B56". */
function refAusBezeichnung(b) {
  const m = String(b ?? "").match(/\b([ABLK]\s?\d{1,4})\b/)
  return m ? m[1].replace(/\s/, "") : null
}

// T-611: Erste erkennbare Strasse aus einem Adress-Freitext, z. B. "Adenauerallee 50" →
// "Adenauerallee". Dient nur dem Abgleich, ob die 'bezeichnung' dieselbe Strasse meint wie die
// 'adresse'. Findet sich keine eindeutige Strasse → null (konservativ).
function strasseAusAdresse(s) {
  const m = String(s ?? "").match(
    /\b([A-Za-zÄÖÜäöüß.-]+(?:stra(?:ß|ss)e|str\.?|weg|ring|allee|platz|gasse|ufer|damm|wall|chaussee|br(?:ü|ue)cke))\b/i,
  )
  return m ? m[1] : null
}

// Das Feld 'sperrung' ist gefuellt und kontrolliert: "keine Sperrung" (57), "Vollsperrung der
// Fahrbahn" (4), "Teilsperrung von Fahrbahn und Gehweg" (2), "Sperrung einer Fahrtrichtung" (1)
// — gemessen ueber den ganzen Bestand am 06.09.2026. Fuer den Schwertransport zaehlt allein die
// FAHRBAHN. Weil die Quelle den Grad fuer jeden Eintrag selbst ausweist, wird vollsperrung hier
// hart gesetzt (true ODER false) statt der Freitext-Heuristik in makeNormalized ueberlassen: die
// wuerde aus "Vollsperrung des Geh- und Radwegs" ein Fahrbahn-Kritisch machen (T-611).
// Nur wenn das Feld leer ist, bleibt vollsperrung undefined und die Heuristik darf ran.
function sperrgradAus(sperrung) {
  const t = String(sperrung ?? "").trim()
  if (!t) return { kategorie: "baustelle", vollsperrung: undefined }
  if (/keine sperrung/i.test(t)) return { kategorie: "baustelle", vollsperrung: false }
  // Betrifft ausdruecklich nur Geh-/Radweg, ohne die Fahrbahn zu nennen → KFZ kommt durch.
  if (/geh|rad/i.test(t) && !/fahrbahn|fahrtrichtung|fahrstreifen|stra(?:ß|ss)e/i.test(t)) {
    return { kategorie: "baustelle", vollsperrung: false }
  }
  if (/vollsperr/i.test(t)) return { kategorie: "sperrung", vollsperrung: true }
  // Teilsperrung laesst die Fahrbahn befahrbar → Baustelle, keine Sperrung.
  if (/teilsperr|halbseitig/i.test(t)) return { kategorie: "baustelle", vollsperrung: false }
  // Alles andere mit "Sperr" (heute: "Sperrung einer Fahrtrichtung") ist eine echte, aber eben
  // NICHT vollstaendige Sperrung der Fahrbahn → sichtbare Warnung, kein Kritisch.
  if (/sperr/i.test(t)) return { kategorie: "sperrung", vollsperrung: false }
  return { kategorie: "baustelle", vollsperrung: undefined }
}

/** Sachdaten-Features (+ optional die Flaechen desselben Bestands) → NormalizedObstacles.
 *  Getrennt vom Abruf, damit die Klassifikation ohne Netz pruefbar ist. */
export function baueBonnObstacles(sachFeatures, flaechenFeatures = []) {
  const flaeche = new Map()
  for (const f of flaechenFeatures ?? []) {
    const id = f?.properties?.baustelle_id
    const typ = f?.geometry?.type
    if (id == null || (typ !== "Polygon" && typ !== "MultiPolygon")) continue
    flaeche.set(String(id), f)
  }

  const obstacles = []
  for (const f of sachFeatures ?? []) {
    const p = f?.properties ?? {}
    const [lng, lat] = ersterPunkt(f?.geometry)
    const { kategorie, vollsperrung } = sperrgradAus(p.sperrung)
    const zusatz = flaeche.get(String(p.baustelle_id))

    // T-611: 'bezeichnung' ist teils ein Bereichs-/Projektname, der eine ANDERE Strasse nennt als
    // die tatsaechliche Arbeitsadresse. Nennt 'adresse' eine konkrete Strasse, die in
    // 'bezeichnung' NICHT vorkommt, ist 'bezeichnung' ein Projektname → Titel um die echte
    // Adresse bauen, 'bezeichnung' bleibt als Kontext in Klammern (es verschwindet nichts).
    const bez = String(p.bezeichnung ?? "").trim()
    const adrStrasse = strasseAusAdresse(p.adresse)
    const bezIstProjektname = !!bez && !!adrStrasse && !bez.toLowerCase().includes(adrStrasse.toLowerCase())
    const titel = bezIstProjektname ? `${p.adresse} (${bez})` : (bez || p.adresse || "Baustelle Bonn")

    const massnahme = String(p.massnahme ?? "")
    obstacles.push(makeNormalized({
      // baustelle_id ist heute 64/64 eindeutig, war es im alten Feed aber nicht: mehrere Meldungen
      // derselben Baustelle (je Fahrtrichtung/Bauphase) teilten sich eine id und haetten sich beim
      // Upsert auf (quellen_id, externe_id) gegenseitig ueberschrieben. Deterministischer
      // Diskriminator aus den unterscheidenden Quellfeldern — gleiche Daten, gleicher Hash.
      externeId: `${p.baustelle_id ?? f?.id ?? "x"}#${stabilHash(lat, lng, p.sperrung, p.massnahme, p.bezeichnung, p.adresse, p.von, p.bis)}`,
      kategorie,
      name: titel,
      beschreibung: [p.massnahme, p.sperrung, p.adresse].filter(Boolean).join(" — ").trim() || null,
      lat, lng,
      // Flaeche der Baumassnahme statt blossem Punkt — die Engine prueft damit den echten
      // Strassenabschnitt statt eines 1-Punkt-Umkreises.
      geom: zusatz?.geometry ?? null,
      strassenRef: refAusBezeichnung(p.bezeichnung),
      // T-618: reine Stadt-Quelle — die Strassen-Ref darf nur aus dem Namen kommen. Im
      // Adress-Freitext der Beschreibung waere ein "B 56" die Querstrasse, nicht der Fundort.
      refAusBeschreibung: false,
      attrs: {
        vollsperrung,
        // Massnahmenart strukturiert kennzeichnen (T-454). Kanal-/Leitungsbau erkennt
        // extractStammdaten.medium bereits ueber die Beschreibung.
        // Der Negativ-Lookbehind ist gemessen und nicht vorsichtshalber da: "Fahrbahnsanierung"
        // (4 Eintraege) enthaelt "bahn" und wurde von der alten Fassung als Bahnbaustelle geflaggt.
        bahnbaustelle: /(?<!fahr)bahn|gleis|tram|schiene/i.test(massnahme) || undefined,
        brueckenbau: /br(?:ü|ue)cke/i.test(massnahme) || undefined,
        // Nur der Flaechen-Layer fuehrt dieses Feld; ohne ihn bleibt es undefined (kein false,
        // sonst wuerde ein fehlender Zusatz-Layer eine Aussage behaupten, die die Quelle nicht macht).
        umleitung: zusatz?.properties?.umleitung_vorhanden === true ? true : undefined,
      },
      realerStart: dateOnly(p.von),
      gueltigVon: dateOnly(p.von),
      gueltigBis: dateOnly(p.bis),
      roh: p,
      quelleName: QUELLE_NAME,
      quelleUrl: QUELLE_URL,
    }))
  }
  return obstacles
}

export const bonnBaustellenGdiConnector = {
  quelleId: QUELLE,
  name: QUELLE_NAME,
  schedule: "0 8,12,18 * * *",
  // Der Layer ist der komplette Bestand des laufenden Jahres in einem Abruf.
  vollbestand: true,

  async fetch({ timeoutMs = 45000, log = () => {} } = {}) {
    const sach = await wfsFeatures(SACHDATEN, { timeoutMs, log })
    // vollbestand: true — ein fehlgeschlagener Abruf darf NICHT als leerer Bestand durchgehen,
    // sonst deaktiviert der Reconcile alle Bonner Baustellen. Genau daran ist diese Quelle nach
    // der Abschaltung von stadtplan.bonn.de still auf null gelaufen.
    if (sach == null) {
      throw new Error(`${QUELLE}: ${SACHDATEN} nach ${VERSUCHE} Versuchen nicht ladbar — Bestand unveraendert gelassen`)
    }
    const flaechen = await wfsFeatures(FLAECHEN, { timeoutMs, log })
    if (flaechen == null) {
      // Die Flaeche ist eine Anreicherung, kein Bestand — aber ohne sie waere die Geometrie beim
      // naechsten geglueckten Lauf wieder da und beim uebernaechsten wieder weg. Dieses Flackern
      // ist schlimmer als ein ausgelassener Lauf, also lieber sauber scheitern.
      throw new Error(`${QUELLE}: ${FLAECHEN} nach ${VERSUCHE} Versuchen nicht ladbar — Bestand unveraendert gelassen`)
    }

    const obstacles = baueBonnObstacles(sach, flaechen)
    log(`${QUELLE}: ${sach.length} Baustellen, ${flaechen.length} Flaechen → ${obstacles.length} obstacles`)
    return { obstacles }
  },
}
