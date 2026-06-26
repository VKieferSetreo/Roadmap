import { useContextStore } from "@/store/context"
import { Navigate } from "react-router-dom"
import { PageContainer } from "@/components/layout/PageContainer"
import { EmptyState } from "@/components/shared/EmptyState"
import { ShieldCheck } from "lucide-react"

export function QAReviewPage() {
  const isAdmin = useContextStore((s) => s.isAdmin)

  if (!isAdmin) {
    return <Navigate to="/datenbank" replace />
  }

  return (
    <div className="h-full overflow-y-auto">
      <PageContainer
        title="QA-Review starten"
        description="Admin-only QA-Review für Datenquellen. Hier startet die Review-Queue für geprüfte Quellen."
        width="wide"
      >
        <div className="space-y-6">
          <div className="rounded-3xl border border-neutral-200 bg-white p-8 shadow-sm">
            <h2 className="text-2xl font-semibold text-neutral-900">QA-Review (Admin)</h2>
            <p className="mt-3 text-sm leading-6 text-neutral-600">
              Diese Ansicht ist nur für Roadmap-Admins sichtbar. Hier können später QA-Review-Queues für Quellen gestartet und verwaltet werden.
            </p>
          </div>

          <EmptyState
            icon={ShieldCheck}
            title="QA-Review ist bereit"
            description="Der Admin-Button in Datenquellen führt hierher. In der nächsten Iteration bauen wir die konkrete Review-Queue und die Swipe-Oberfläche ein."
          />
        </div>
      </PageContainer>
    </div>
  )
}
