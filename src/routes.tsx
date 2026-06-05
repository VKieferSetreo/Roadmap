import { createBrowserRouter, Navigate } from "react-router-dom"
import { AppLayout } from "@/components/layout/AppLayout"
import { RouteCheckPage } from "@/pages/RouteCheckPage"

export const router = createBrowserRouter([
  {
    element: <AppLayout />,
    children: [
      { path: "/", element: <RouteCheckPage /> },
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
])
