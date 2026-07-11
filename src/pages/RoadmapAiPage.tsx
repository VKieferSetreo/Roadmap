// Roadmap-AI: der Setreo-AI-Chatbot (setreo-intern.com/ai) als Iframe, per scope=roadmap auf
// Roadmap-/Baustellen-Daten beschränkt. Same-Origin, daher reicht der absolute Pfad; die
// Chatbot-App bringt ihren eigenen Chrome (Composer) mit.
//
// Der eingebettete Chat kann "Öffnen" auf einem Projekt anbieten: er postet dann eine Message
// ans Parent-Fenster (hier), das per Router IN-PAGE zum Projekt navigiert (kein neuer Tab).

import { useEffect } from "react"
import { useNavigate } from "react-router-dom"

export function RoadmapAiPage() {
  const navigate = useNavigate()

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      // Nur Nachrichten der eigenen Origin akzeptieren (der Chat läuft same-origin unter /ai).
      if (e.origin !== window.location.origin) return
      const data = e.data as { type?: string; projectId?: unknown }
      if (data?.type !== "setreo-ai:open-project") return
      const id = data.projectId
      // Defensive: nur plausible IDs (uuid-artig) durchlassen, bevor navigiert wird.
      if (typeof id === "string" && /^[a-zA-Z0-9-]{6,64}$/.test(id)) {
        navigate(`/projekte/${id}/karte`)
      }
    }
    window.addEventListener("message", onMessage)
    return () => window.removeEventListener("message", onMessage)
  }, [navigate])

  return (
    <iframe
      src="/ai?scope=roadmap"
      title="Roadmap-AI"
      className="block h-full w-full border-0"
      // clipboard-write: der Chatbot bietet "Kopieren" für Antworten/Code.
      allow="clipboard-write"
    />
  )
}
