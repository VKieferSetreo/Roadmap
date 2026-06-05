import { Link } from "react-router-dom"
import { SetreoLogo } from "@/components/shared/SetreoLogo"

export function TopBar() {
  return (
    <header className="sticky top-0 z-30 h-14 bg-white border-b border-neutral-200 flex items-center px-4 lg:px-6 gap-6">
      <Link to="/" className="flex items-center gap-3 font-semibold">
        <SetreoLogo height={26} />
        <span className="hidden sm:inline-flex items-center pl-3 border-l border-neutral-200 h-7 text-sm font-bold tracking-wide text-primary-700">
          Roadmap
        </span>
      </Link>
      <div className="flex-1" />
    </header>
  )
}
