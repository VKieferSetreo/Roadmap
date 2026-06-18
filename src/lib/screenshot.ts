// Automatischer Seiten-Screenshot fürs Bug-Melden — html2canvas (lazy geladen),
// auf den sichtbaren Bereich begrenzt und als JPEG komprimiert. Best-effort: wirft NIE
// (null bei Fehler/Timeout), damit der Bug-Report auch ohne Bild abgeschickt werden kann.
// Hinweis: Karten-Kacheln (cross-origin, kein CORS) können leer bleiben — UI, Panels,
// Dialoge und Marker werden aber erfasst.

const TIMEOUT_MS = 5000
const MAX_W = 1280

export async function captureScreenshot(): Promise<string | null> {
  try {
    const { default: html2canvas } = await import("html2canvas")
    const vw = document.documentElement.clientWidth
    const vh = document.documentElement.clientHeight
    const run = html2canvas(document.body, {
      logging: false,
      useCORS: true,
      backgroundColor: "#ffffff",
      scale: Math.min(window.devicePixelRatio || 1, 1.5),
      // Elemente mit data-no-screenshot ausnehmen (z.B. die Melde-Maske selbst).
      ignoreElements: (el) => el.getAttribute?.("data-no-screenshot") === "true",
      // Nur der sichtbare Ausschnitt — „was der Nutzer sieht".
      x: window.scrollX,
      y: window.scrollY,
      width: vw,
      height: vh,
      windowWidth: vw,
      windowHeight: vh,
    })
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), TIMEOUT_MS))
    const canvas = await Promise.race([run, timeout])
    if (!canvas) return null

    const scale = canvas.width > MAX_W ? MAX_W / canvas.width : 1
    let out: HTMLCanvasElement = canvas
    if (scale < 1) {
      const c2 = document.createElement("canvas")
      c2.width = Math.round(canvas.width * scale)
      c2.height = Math.round(canvas.height * scale)
      c2.getContext("2d")?.drawImage(canvas, 0, 0, c2.width, c2.height)
      out = c2
    }
    return out.toDataURL("image/jpeg", 0.6)
  } catch {
    return null
  }
}
