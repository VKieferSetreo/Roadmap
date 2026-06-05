import { useState } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { RouteInputPanel } from "@/components/route/RouteInputPanel"
import { BlockadeList } from "@/components/route/BlockadeList"
import { RouteMap } from "@/components/route/RouteMap"
import { BlockadeDetailDrawer } from "@/components/route/BlockadeDetailDrawer"
import { SidebarRail } from "@/components/route/SidebarRail"
import { findBlockade } from "@/data/mockRoute"
import { cn } from "@/lib/cn"

export function RouteCheckPage() {
  const [selectedBlockadeId, setSelectedBlockadeId] = useState<string | null>(null)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(true)

  // Map-Marker-Click: nur Highlight in der Liste, KEIN Drawer öffnen.
  const onMapSelect = (id: string) => {
    setSelectedBlockadeId((cur) => (cur === id ? null : id))
  }

  // Listen-Card-Click: Highlight + Drawer öffnen.
  const onListSelect = (id: string) => {
    setSelectedBlockadeId(id)
    setDetailId(id)
  }

  return (
    <div className="flex-1 min-h-0 flex relative">
      {/* Linke Sidebar — Vollansicht oder schmale Rail */}
      <aside
        className={cn(
          "flex-shrink-0 border-r border-neutral-200 bg-white flex flex-col min-h-0 overflow-hidden transition-[width] duration-200 ease-out",
          sidebarOpen ? "w-96" : "w-14",
        )}
      >
        {sidebarOpen ? (
          <div className="w-96 flex-shrink-0 flex flex-col min-h-0">
            <RouteInputPanel />
            <BlockadeList selectedId={selectedBlockadeId} onSelect={onListSelect} />
          </div>
        ) : (
          <SidebarRail selectedId={selectedBlockadeId} onSelect={onListSelect} />
        )}
      </aside>

      {/* Toggle-Button am Sidebar-Rand */}
      <button
        type="button"
        onClick={() => setSidebarOpen((v) => !v)}
        aria-label={sidebarOpen ? "Seitenspalte einklappen" : "Seitenspalte ausklappen"}
        title={sidebarOpen ? "Einklappen" : "Ausklappen"}
        className={cn(
          "absolute top-1/2 -translate-y-1/2 z-[1500]",
          "h-10 w-6 rounded-r-md border border-l-0 border-neutral-200 bg-white shadow-md",
          "flex items-center justify-center text-neutral-500 hover:text-neutral-800 hover:bg-neutral-50",
          "transition-[left] duration-200 ease-out",
        )}
        style={{ left: sidebarOpen ? "24rem" : "3.5rem" }}
      >
        {sidebarOpen ? (
          <ChevronLeft className="h-4 w-4" />
        ) : (
          <ChevronRight className="h-4 w-4" />
        )}
      </button>

      {/* Kartenfläche rechts */}
      <section className="flex-1 min-w-0 relative">
        <RouteMap
          selectedBlockadeId={selectedBlockadeId}
          onSelectBlockade={onMapSelect}
        />
      </section>

      {/* Detail-Drawer rechts — nicht-modal, kein Backdrop-Blur */}
      <BlockadeDetailDrawer
        blockade={findBlockade(detailId)}
        onClose={() => setDetailId(null)}
      />
    </div>
  )
}
