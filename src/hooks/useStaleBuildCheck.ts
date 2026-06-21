// T-507: erkennt einen FE/Deploy-Skew (neuer Build ausgerollt, Nutzer läuft noch auf altem Bundle)
// und meldet `true`, sobald die ausgelieferte index.html ein anderes Entry-Bundle referenziert als
// das gerade geladene. Rein FE-seitig (kein API-/Header-Vertrag). Prüft alle 5 min + beim Tab-Fokus.

import { useEffect, useRef, useState } from "react"

const CHECK_MS = 5 * 60_000

/** Dateiname des aktuell geladenen Entry-Bundles aus dem DOM (Vite: <script type=module src=…/assets/index-HASH.js>). */
function currentEntry(): string | null {
  const s = document.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/index-"]')
  return s?.src.split("/assets/")[1] ?? null
}

export function useStaleBuildCheck(): boolean {
  const [stale, setStale] = useState(false)
  const loaded = useRef(currentEntry())

  useEffect(() => {
    if (!loaded.current) return // Dev/kein gehashtes Bundle → kein Check
    let cancelled = false
    const check = async () => {
      try {
        const res = await fetch(`${import.meta.env.BASE_URL}?_v=${Date.now()}`, { cache: "no-store" })
        if (!res.ok) return
        const html = await res.text()
        const m = html.match(/\/assets\/(index-[A-Za-z0-9_-]+\.js)/)
        if (!cancelled && m && m[1] !== loaded.current) setStale(true)
      } catch {
        /* offline / Fehler → kein Banner aufdrängen */
      }
    }
    const id = setInterval(check, CHECK_MS)
    const onVisible = () => {
      if (document.visibilityState === "visible") void check()
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      cancelled = true
      clearInterval(id)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [])

  return stale
}
