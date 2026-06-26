import { Suspense, lazy, type ReactNode } from "react"
import { createBrowserRouter, Navigate } from "react-router-dom"
import { AppLayout } from "@/components/layout/AppLayout"
import { AdminLayout } from "@/components/layout/AdminLayout"
import { routerBasename } from "@/lib/tenantUrl"

// T-360: Seiten route-basiert code-splitten (React.lazy) — der Entry zog vorher ALLE 8 Seiten
// statisch (inkl. leaflet/recharts/admin-only). Externe Kunden laden so nicht mehr den
// Admin-/Karten-Code, den sie nie sehen; leaflet wandert in die Karten-Route-Chunks (T-361).
const DashboardHome = lazy(() => import("@/pages/DashboardHome").then((m) => ({ default: m.DashboardHome })))
const ProjectDetail = lazy(() => import("@/pages/ProjectDetail").then((m) => ({ default: m.ProjectDetail })))
const DatenbankPage = lazy(() => import("@/pages/DatenbankPage").then((m) => ({ default: m.DatenbankPage })))
const SettingsPage = lazy(() => import("@/pages/SettingsPage").then((m) => ({ default: m.SettingsPage })))
const QAReviewPage = lazy(() => import("@/pages/QAReviewPage").then((m) => ({ default: m.QAReviewPage })))
const AdminTenantsPage = lazy(() => import("@/pages/AdminTenantsPage").then((m) => ({ default: m.AdminTenantsPage })))
const TenantUsersPage = lazy(() => import("@/pages/TenantUsersPage").then((m) => ({ default: m.TenantUsersPage })))
const DebugPage = lazy(() => import("@/pages/DebugPage").then((m) => ({ default: m.DebugPage })))
const NewsPage = lazy(() => import("@/pages/NewsPage").then((m) => ({ default: m.NewsPage })))
const NotFound = lazy(() => import("@/pages/NotFound").then((m) => ({ default: m.NotFound })))

// Router-Basename inkl. optionalem Mandanten-Slug (/roadmap/<slug>). Dev (Base /) → "/".
const basename = routerBasename()

// Dezenter Skeleton während ein Seiten-Chunk lädt (eine Suspense-Grenze je Route).
// Fallback inline (keine benannte Komponente neben dem router-Export → react-refresh bleibt still).
const page = (el: ReactNode) => (
  <Suspense
    fallback={
      <div className="flex h-full flex-col gap-4 px-4 py-6 lg:px-6">
        <div className="skeleton h-7 w-72 rounded" />
        <div className="skeleton h-9 w-96 rounded" />
        <div className="skeleton h-64 w-full rounded-xl" />
      </div>
    }
  >
    {el}
  </Suspense>
)

export const router = createBrowserRouter(
  [
    {
      element: <AppLayout />,
      children: [
        { path: "/", element: page(<DashboardHome />) },
        { path: "/projekte/:id", element: page(<ProjectDetail />) },
        { path: "/projekte/:id/:tab", element: page(<ProjectDetail />) },
        { path: "/datenbank", element: page(<DatenbankPage />) },
        { path: "/datenbank/qa-review", element: page(<QAReviewPage />) },
        { path: "/nutzer", element: page(<TenantUsersPage />) },
        { path: "/news", element: page(<NewsPage />) },
        { path: "/einstellungen", element: page(<SettingsPage />) },
        { path: "*", element: page(<NotFound />) }, // T-489: 404 statt stummem Redirect
      ],
    },
    // GLOBALE Admin-Screens — eigenes, losgelöstes Layout (kein Projekt-Sidebar). Nur intern + admin.
    {
      element: <AdminLayout />,
      children: [
        { path: "/mandanten", element: page(<AdminTenantsPage />) },
        { path: "/debugging", element: page(<DebugPage />) },
        // Alt-Link /debug → /debugging (Bookmarks / alte Verweise nicht brechen).
        { path: "/debug", element: <Navigate to="/debugging" replace /> },
      ],
    },
  ],
  { basename },
)
