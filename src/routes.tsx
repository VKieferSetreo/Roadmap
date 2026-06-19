import { createBrowserRouter, Navigate } from "react-router-dom"
import { AppLayout } from "@/components/layout/AppLayout"
import { AdminLayout } from "@/components/layout/AdminLayout"
import { DashboardHome } from "@/pages/DashboardHome"
import { ProjectDetail } from "@/pages/ProjectDetail"
import { DatenbankPage } from "@/pages/DatenbankPage"
import { SettingsPage } from "@/pages/SettingsPage"
import { AdminTenantsPage } from "@/pages/AdminTenantsPage"
import { TenantUsersPage } from "@/pages/TenantUsersPage"
import { DebugPage } from "@/pages/DebugPage"
import { NewsPage } from "@/pages/NewsPage"
import { routerBasename } from "@/lib/tenantUrl"

// Router-Basename inkl. optionalem Mandanten-Slug (/roadmap/<slug>). Dev (Base /) → "/".
// Detaillogik (Slug vs. Top-Route) in lib/tenantUrl.
const basename = routerBasename()

export const router = createBrowserRouter(
  [
    {
      element: <AppLayout />,
      children: [
        { path: "/", element: <DashboardHome /> },
        { path: "/projekte/:id", element: <ProjectDetail /> },
        { path: "/projekte/:id/:tab", element: <ProjectDetail /> },
        { path: "/datenbank", element: <DatenbankPage /> },
        { path: "/nutzer", element: <TenantUsersPage /> },
        { path: "/news", element: <NewsPage /> },
        { path: "/einstellungen", element: <SettingsPage /> },
        { path: "*", element: <Navigate to="/" replace /> },
      ],
    },
    // GLOBALE Admin-Screens — eigenes, losgelöstes Layout (kein Projekt-Sidebar). Nur intern + admin.
    {
      element: <AdminLayout />,
      children: [
        { path: "/mandanten", element: <AdminTenantsPage /> },
        { path: "/debugging", element: <DebugPage /> },
        // Alt-Link /debug → /debugging (Bookmarks / alte Verweise nicht brechen).
        { path: "/debug", element: <Navigate to="/debugging" replace /> },
      ],
    },
  ],
  { basename },
)
