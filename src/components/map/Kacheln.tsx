// Der Kartenhintergrund für ALLE Karten — mit Ausweich-Anbieter.
//
// T-648 / T-172: Bei Setreo blieb die Straßenkarte grau, während der Satellit lief.
// Gemessen am 01.09.2026 war die eigentliche Ursache nicht der Hostingweg, sondern die
// Art, wie OSM sperrt: Anfragen ohne Referer werden nicht mit einem Fehlercode
// abgewiesen, sondern mit einer Ersatzkachel bei Status 200 (6987 statt ~39000 Bytes,
// erkennbar nur am Header `x-blocked`). Deshalb sah niemand einen Fehler, weder im
// Browser noch im Log, sondern nur eine graue Fläche.
//
// Konsequenz: Wir liefern die Kacheln selbst aus, über setreo-cloud.com/tiles
// (tileserver-gl auf einem PMTiles-Extrakt Europa). Damit hängen weder Referer-Politik
// noch fremde IT dazwischen. Esri bleibt als Rückfallebene, falls der eigene Dienst
// einmal nicht antwortet: Kommen die Kacheln mehrfach nicht an, schaltet die App für
// die Sitzung um. Nur die Straßenkarte ist betroffen, der Satellit nicht.

import { useRef } from "react"
import { TileLayer } from "react-leaflet"
import { TILE_LAYERS, useSettingsStore } from "@/store/settings"

/** Ein paar Fehler sind normal (einzelne Kachel am Rand); erst eine Serie ist ein Ausfall. */
const SCHWELLE = 4

/**
 * Kein Ausweich-Anbieter mehr (Max, 01.09.2026): die Straßenkarte kommt ausschließlich
 * aus dem eigenen Dienst. Ein stiller Wechsel auf Esri hat zwei Nachteile, die den
 * Nutzen überwiegen: die Karte sieht plötzlich anders aus, und ein Ausfall des eigenen
 * Dienstes bleibt unbemerkt, statt aufzufallen und behoben zu werden.
 *
 * @param onTotalausfall wird gerufen, wenn die Kacheln nicht ankommen — die Karte darf
 *        das dann sagen, statt einfach grau zu bleiben.
 */
export function Kacheln({ onTotalausfall }: { onTotalausfall?: () => void } = {}) {
  const stil = useSettingsStore((s) => s.tileStyle)
  const fehler = useRef(0)

  const tiles = TILE_LAYERS[stil]

  const beiFehler = () => {
    fehler.current += 1
    if (fehler.current < SCHWELLE) return
    fehler.current = 0
    onTotalausfall?.()
  }

  return (
    <>
      <TileLayer
        key={tiles.url}
        url={tiles.url}
        attribution={tiles.attribution}
        eventHandlers={{ tileerror: beiFehler }}
      />
      {tiles.overlays?.map((u) => (
        <TileLayer key={u} url={u} zIndex={2} />
      ))}
    </>
  )
}
