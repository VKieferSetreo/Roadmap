// Roadmap-AI: der Setreo-AI-Chatbot (setreo-intern.com/ai) als Iframe, per scope=roadmap auf
// Roadmap-/Baustellen-Daten beschränkt. Same-Origin, daher reicht der absolute Pfad; die
// Chatbot-App bringt ihren eigenen Chrome (Sidebar mit Chats, Composer) mit.

export function RoadmapAiPage() {
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
