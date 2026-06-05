// Setreo-Corporate-Design-Footer (Chrome aus dem setreo-intern-hub).
// Rechtliche Links zentriert, dezent, uppercase.

const LINKS = [
  { href: "https://setreo.de/impressum/", label: "Impressum" },
  { href: "https://setreo.de/datenschutz/", label: "Datenschutz" },
  { href: "https://setreo.de/agb/", label: "AGB" },
]

export function SetreoFooter() {
  return (
    <footer className="flex h-[41px] shrink-0 items-center justify-center gap-8 border-t border-neutral-200 bg-white">
      {LINKS.map((l) => (
        <a
          key={l.href}
          href={l.href}
          target="_blank"
          rel="noopener"
          className="text-[11px] font-bold uppercase tracking-wide text-neutral-400 transition-colors hover:text-primary-600"
        >
          {l.label}
        </a>
      ))}
    </footer>
  )
}
