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
import { create } from "zustand"
import { TileLayer } from "react-leaflet"
import { TILE_LAYERS, useSettingsStore } from "@/store/settings"

/**
 * Ausweich-Straßenkarte: Esri World Street Map — bewusst derselbe Host wie der Satellit.
 * Der kommt bei Setreo nachweislich durch, steht schon in der CSP und braucht keinen
 * Schlüssel. (CARTO wäre der naheliegendere Kandidat gewesen, legt aber seit Neuestem
 * ein „API KEY REQUIRED" über jede Kachel — geprüft am 28.08.2026.)
 */
const AUSWEICH = {
  url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
  attribution: "&copy; Esri, HERE, Garmin, OpenStreetMap-Mitwirkende",
  overlays: undefined as string[] | undefined,
}

/** Ein paar Fehler sind normal (einzelne Kachel am Rand); erst eine Serie ist ein Ausfall. */
const SCHWELLE = 4

/** Nicht persistiert: schaltet die IT frei, ist beim nächsten Laden wieder alles normal. */
const useAusweich = create<{ aktiv: boolean; einschalten: () => void }>((set) => ({
  aktiv: false,
  einschalten: () => set({ aktiv: true }),
}))

/**
 * @param onTotalausfall wird gerufen, wenn auch der Ausweich-Anbieter nicht liefert —
 *        dann liegt es am Netz des Nutzers und die Karte sollte das sagen dürfen.
 */
export function Kacheln({ onTotalausfall }: { onTotalausfall?: () => void } = {}) {
  const stil = useSettingsStore((s) => s.tileStyle)
  const aktiv = useAusweich((s) => s.aktiv)
  const einschalten = useAusweich((s) => s.einschalten)
  const fehler = useRef(0)

  const ausweichend = aktiv && stil === "standard"
  const tiles = ausweichend ? AUSWEICH : TILE_LAYERS[stil]

  const beiFehler = () => {
    fehler.current += 1
    if (fehler.current < SCHWELLE) return
    fehler.current = 0
    if (ausweichend || stil !== "standard") onTotalausfall?.()
    else einschalten()
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
