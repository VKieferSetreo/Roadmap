// App-weiter Heartbeat für die Plattform-Analytics (Online-Zeit/Sessions). Zählt NUR AKTIVE Zeit:
// gepingt wird höchstens alle 60 s und nur, wenn der Tab sichtbar ist UND seit dem letzten Ping
// echte Nutzer-Aktivität (Maus/Tastatur/Scroll/Touch) stattfand. Ein offener, aber ungenutzter Tab
// hört nach einem Intervall auf zu pingen → server-seitig friert last_seen ein → die Session zählt
// keine Leerlaufzeit weiter (aktive Zeit = sum(last_seen − started_at)). Fehler werden geschluckt.

import { useEffect } from "react"
import { api } from "@/api/roadmap"
import { useDataSourceStore } from "@/store/datasource"
import { useContextStore } from "@/store/context"

// T-483/T-394: 60 s (halbiert die Schreiblast ggü. 30 s; bleibt unter SESSION_LUECKE 5 min).
const INTERVALL_MS = 60_000

export function useHeartbeat() {
  const live = useDataSourceStore((s) => s.mode) === "live"
  const loaded = useContextStore((s) => s.loaded)
  const email = useContextStore((s) => s.email)

  useEffect(() => {
    if (!live || !loaded || !email) return
    let lastActivity = Date.now() // Login zählt als Aktivität → erster Ping läuft
    let lastPing = 0
    const markActive = () => {
      lastActivity = Date.now()
    }
    const ping = () => {
      // Nur zählen, wenn sichtbar UND seit dem letzten Ping wirklich etwas passiert ist.
      if (document.visibilityState !== "visible") return
      if (lastActivity <= lastPing) return // kein Input seit letztem Ping → Leerlauf, nicht zählen
      lastPing = Date.now()
      void api.analytics.heartbeat().catch(() => {})
    }
    ping() // sofort beim Mount/Login
    const t = setInterval(ping, INTERVALL_MS)
    // Passive Aktivitäts-Listener — setzen nur einen Zeitstempel (kein Re-Render, kein State).
    const events = ["pointerdown", "keydown", "scroll", "wheel", "mousemove", "touchstart"]
    for (const e of events) window.addEventListener(e, markActive, { passive: true })
    // Rückkehr auf den Tab = Aktivität → sofort ein Lebenszeichen.
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        markActive()
        ping()
      }
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      clearInterval(t)
      for (const e of events) window.removeEventListener(e, markActive)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [live, loaded, email])
}
