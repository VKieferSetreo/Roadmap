import { useEffect, type RefObject } from "react"

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])'

/** Modal-Fokusführung: beim Öffnen Fokus in den Container ziehen, Tab/Shift-Tab darin
 *  halten (wrap), beim Schließen auf das zuvor fokussierte Element zurückgeben.
 *  Container braucht tabIndex={-1} als Fallback, wenn er nichts Fokussierbares enthält. */
export function useFocusTrap(ref: RefObject<HTMLElement | null>, active: boolean) {
  useEffect(() => {
    if (!active) return
    const node = ref.current
    if (!node) return
    const prev = document.activeElement as HTMLElement | null
    const focusables = () =>
      Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null)
    ;(focusables()[0] ?? node).focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return
      const f = focusables()
      if (f.length === 0) return void e.preventDefault()
      const first = f[0]
      const last = f[f.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    node.addEventListener("keydown", onKey)
    return () => {
      node.removeEventListener("keydown", onKey)
      prev?.focus?.()
    }
  }, [ref, active])
}
