// T-489: echte 404-Seite statt stummem Redirect nach Home — der Nutzer sieht, dass der Link ins
// Leere ging, und kommt mit einem Klick zurück zur Übersicht.
import { Link } from "react-router-dom"
import { Compass } from "lucide-react"

export function NotFound() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-4 py-16 text-center">
      <Compass className="h-10 w-10 text-neutral-300" />
      <div>
        <h1 className="text-lg font-semibold text-neutral-800">Seite nicht gefunden</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Diese Adresse gibt es nicht (mehr). Der Link ist eventuell veraltet.
        </p>
      </div>
      <Link
        to="/"
        className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700"
      >
        Zurück zur Übersicht
      </Link>
    </div>
  )
}
