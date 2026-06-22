// Connector-Registry: eine Liste { quelleId, name, schedule, vollbestand?, fetch(ctx) }.
// Statische Connectoren (ein Modul je Quelle, server/src/connectors/<quelleId>_<slug>.js) +
// env-getriebene Mobilithek-Angebote (MOBILITHEK_FEEDS). Aktivieren: quelleId in env CONNECTORS.
//
// NormalizedObstacle: { externeId, kategorie, name, beschreibung?, lat, lng, strassenRef?,
//   zustaendig?, attrs, gueltigVon?, gueltigBis?, realerStart?, quelle: { name, url, aktualisiertAm } }

import { mobilithekConnectors } from "./mobilithek.js"
import { autobahnConnector } from "./autobahn.js"
import { gstRoutenHamburgConnector } from "./0110_gst_routen_hamburg.js"
import { brueckenbauwerkeHamburgConnector } from "./0111_brueckenbauwerke_hamburg.js"
import { baustellenHamburgConnector } from "./0112_baustellen_hamburg.js"
// 0113 (Bedarfsumleitungen Hamburg, BWVI) ENTFERNT (Max 2026-06-18): nicht benötigt.
// import { bedarfsumleitungenHamburgConnector } from "./0113_bedarfsumleitungen_hamburg.js"
import { vizBerlinBaustellenConnector } from "./0114_viz_berlin_baustellen.js"
import { vizBerlinGeojsonFeedsConnector } from "./0115_viz_berlin_geojson_feeds.js"
import { detailnetzBerlinBauwerkeConnector } from "./0116_detailnetz_berlin_bauwerke.js"
import { baustellenShConnector } from "./0117_baustellen_sh.js"
import { umleitungsstreckenShConnector } from "./0118_umleitungsstrecken_sh.js"
import { baustellenMvConnector } from "./0119_baustellen_mv.js"
import { lsbbSperrinfoConnector } from "./0120_lsbb_sperrinfo.js"
import { gstNegativkarteSachsenConnector } from "./0121_gst_negativkarte_sachsen.js"
// 0122 (MobiData BW — LMS BW Verkehrsmeldungen) ENTFERNT (Max 2026-06-14): reine Live-/Ad-hoc-
// Verkehrslage (Pannen/Gefahren/aktuelle Sperrungen), für die Transport-PLANUNG wertlos.
// import { mobidataBwLmsConnector } from "./0122_mobidata_bw_lms.js"
import { baysisBauwerkeConnector } from "./0123_baysis_bauwerke.js"
import { gstSchwertransportkarteNrwConnector } from "./0124_gst_schwertransportkarte_nrw.js"
import { opengeodataNrwBauwerkeConnector } from "./0125_opengeodata_nrw_bauwerke.js"
import { hessenBrueckenConnector } from "./0126_hessen_bruecken.js"
import { baustellenSaarlandConnector } from "./0127_baustellen_saarland.js"
import { mobidataBwBaustellenConnector } from "./0128_mobidata_bw_baustellen.js"
import { muenchenBaustellenConnector } from "./0210_muenchen_baustellen.js"
import { aachenBaustellenConnector } from "./0211_aachen_baustellen.js"
import { koelnVerkehrsbeeintraechtigungenConnector } from "./0212_koeln_verkehrsbeeintraechtigungen.js"
import { dresdenVerkehrseinschraenkungenConnector } from "./0213_dresden_verkehrseinschraenkungen.js"
import { stuttgartBaustellenConnector } from "./0214_stuttgart_baustellen.js"
import { muensterBaustellenConnector } from "./0215_muenster_baustellen.js"
import { dortmundBaustellenConnector } from "./0216_dortmund_baustellen.js"
// 0217 (Düsseldorf — Verkehrsmeldungen, DATEX-II) ENTFERNT (Max 2026-06-14): reine Live-/Ad-hoc-
// Verkehrsmeldungen ("Gefahrenstelle …", ohne Enddatum), für die Transport-PLANUNG wertlos.
// import { duesseldorfVerkehrsmeldungenConnector } from "./0217_duesseldorf_verkehrsmeldungen.js"
import { bonnBaustellenConnector } from "./0218_bonn_baustellen.js"
import { karlsruheTrkBaustellenConnector } from "./0219_karlsruhe_trk_baustellen.js"
import { leipzigVerkehrsraumeinschraenkungenConnector } from "./0220_leipzig_verkehrsraumeinschraenkungen.js"
import { leipzigVerkehrszeichenConnector } from "./0221_leipzig_verkehrszeichen.js"
import { rostockBaustellenConnector } from "./0222_rostock_baustellen.js"
import { rostockGstRoutenConnector } from "./0223_rostock_gst_routen.js"
// Overpass/OSM (0301) bewusst ENTFERNT: crowdsourced, unzuverlässig, ~120k Bloat — keine gewünschte Quelle.
import { rvrGeonetzwerkRuhrBaustellenConnector } from "./0302_rvr_geonetzwerk_ruhr_baustellen.js"
import { gstWsvKreuzungsbauwerkeConnector } from "./0303_gst_wsv_kreuzungsbauwerke.js"
import { rlpBaustellenConnector } from "./0129_rlp_baustellen.js"
import { sachsenBaustellenConnector } from "./0130_sachsen_baustellen.js"
import { ingolstadtBaustellenConnector } from "./0224_ingolstadt_baustellen.js"
import { osnabrueckBaustellenConnector } from "./0225_osnabrueck_baustellen.js"
import { freiburgBaustellenConnector } from "./0226_freiburg_baustellen.js"
import { heidelbergBaustellenConnector } from "./0227_heidelberg_baustellen.js"
import { duisburgBaustellenConnector } from "./0228_duisburg_baustellen.js"
import { thueringenBaustellenConnector } from "./0131_thueringen_baustellen.js"
import { brandenburgBaustellenConnector } from "./0132_brandenburg_baustellen.js"
import { dortmundGeplantConnector } from "./0229_dortmund_geplant.js"
import { autobahnLastbeschraenkteBrueckenConnector } from "./0150_autobahn_lastbeschraenkte_bruecken.js"
import { berlinDurchfahrtshoehenConnector } from "./0133_berlin_durchfahrtshoehe.js"
import { hamburgVerkehrszeichenConnector } from "./0134_hamburg_verkehrszeichen.js"
import { babAldVorschauConnector } from "./0152_bab_ald_vorschau.js"

export const CONNECTORS = [
  autobahnConnector,
  gstRoutenHamburgConnector,
  brueckenbauwerkeHamburgConnector,
  baustellenHamburgConnector,
  vizBerlinBaustellenConnector,
  vizBerlinGeojsonFeedsConnector,
  detailnetzBerlinBauwerkeConnector,
  baustellenShConnector,
  umleitungsstreckenShConnector,
  baustellenMvConnector,
  lsbbSperrinfoConnector,
  gstNegativkarteSachsenConnector,
  baysisBauwerkeConnector,
  gstSchwertransportkarteNrwConnector,
  opengeodataNrwBauwerkeConnector,
  hessenBrueckenConnector,
  baustellenSaarlandConnector,
  mobidataBwBaustellenConnector,
  muenchenBaustellenConnector,
  aachenBaustellenConnector,
  koelnVerkehrsbeeintraechtigungenConnector,
  dresdenVerkehrseinschraenkungenConnector,
  stuttgartBaustellenConnector,
  muensterBaustellenConnector,
  dortmundBaustellenConnector,
  bonnBaustellenConnector,
  karlsruheTrkBaustellenConnector,
  leipzigVerkehrsraumeinschraenkungenConnector,
  leipzigVerkehrszeichenConnector,
  rostockBaustellenConnector,
  rostockGstRoutenConnector,
  rvrGeonetzwerkRuhrBaustellenConnector,
  gstWsvKreuzungsbauwerkeConnector,
  rlpBaustellenConnector,
  sachsenBaustellenConnector,
  ingolstadtBaustellenConnector,
  osnabrueckBaustellenConnector,
  freiburgBaustellenConnector,
  heidelbergBaustellenConnector,
  duisburgBaustellenConnector,
  thueringenBaustellenConnector,
  brandenburgBaustellenConnector,
  dortmundGeplantConnector,
  autobahnLastbeschraenkteBrueckenConnector,
  berlinDurchfahrtshoehenConnector,
  hamburgVerkehrszeichenConnector,
  babAldVorschauConnector,
]

// Vollständiger Pool = statische + env-getriebene (Mobilithek aus MOBILITHEK_FEEDS, leer bis Account).
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
