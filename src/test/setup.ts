// Gemeinsame Vorbereitung für alle Frontend-Tests (T-733).

import "@testing-library/jest-dom/vitest"
import { cleanup } from "@testing-library/react"
import { afterEach, vi } from "vitest"

// Nach jedem Test das gerenderte DOM abräumen. Ohne das stapeln sich die Bäume, und
// getByText findet plötzlich mehrere Treffer aus vorherigen Tests — ein Fehlerbild, das
// aussieht wie ein Bug in der Komponente und keiner ist.
afterEach(() => cleanup())

// jsdom kennt matchMedia nicht, mehrere Komponenten fragen es aber ab (u. a. für
// prefers-reduced-motion). Ohne diesen Stummel wirft schon das Rendern.
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
})

// Ebenfalls nicht in jsdom, wird von Recharts und den Karten-Overlays erwartet.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver

// scrollIntoView fehlt in jsdom; die Fund-Liste ruft es beim Aufklappen.
Element.prototype.scrollIntoView ??= vi.fn()
