// Der Kartenhintergrund für ALLE Karten — mit Ausweich-Anbieter.
//
// T-648: Bei Setreo blieb die Straßenkarte grau, während der Satellit lief. Der Grund
// liegt nicht in der App: `tile.openstreetmap.de` läuft auf zwei einzelnen
// Hetzner-Servern (168.119.11.226 / 65.108.14.58), und Firmen-Webfilter sortieren so
// etwas als „unkategorisiert" aus. Satellit (CloudFront) und die Projekt-Vorschau
// (Fastly) laufen über große CDNs und kommen durch — vom Setreo-Server aus antworten
// übrigens alle drei mit 200, der Filter sitzt also vor den Arbeitsplätzen.
//
// Statt darauf zu warten, dass eine fremde IT eine Adresse freischaltet: Kommen die
// Kacheln mehrfach nicht an, schaltet die App auf den Anbieter um, der nachweislich
// durchkommt. Das gilt für die Sitzung und nur für die Straßenkarte — der Satellit ist
// nicht betroffen.

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
