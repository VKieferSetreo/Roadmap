// App-weiter Heartbeat: pingt im Live-Modus alle 60 s, solange der Tab sichtbar ist
// und ein Nutzer eingeloggt ist. Speist die Plattform-Analytics (Online-Zeit/Sessions).
// Fehler werden geschluckt — der Heartbeat darf nie die App stören.

import { useEffect } from "react"
import { api } from "@/api/roadmap"
import { useDataSourceStore } from "@/store/datasource"
import { useContextStore } from "@/store/context"

// T-483/T-394: 60s statt 30s — halbiert die analytics_sessions-Schreiblast (UPDATE je Ping über alle
// Nutzer). Bleibt unter SESSION_LUECKE (5 min) und ONLINE_FENSTER (3 min) → Online-Status unverändert.
const INTERVALL_MS = 60_000

export function useHeartbeat() {
  const live = useDataSourceStore((s) => s.mode) === "live"
  const loaded = useContextStore((s) => s.loaded)
  const email = useContextStore((s) => s.email)

  useEffect(() => {
    if (!live || !loaded || !email) return
    const ping = () => {
      if (document.visibilityState === "visible") void api.analytics.heartbeat().catch(() => {})
    }
    ping() // sofort beim Mount/Login
    const t = setInterval(ping, INTERVALL_MS)
    // Beim Zurückkehren auf den Tab sofort ein Lebenszeichen (nicht erst nach 30 s).
    const onVisible = () => {
      if (document.visibilityState === "visible") ping()
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      clearInterval(t)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [live, loaded, email])
}
