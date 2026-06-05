import { Outlet } from "react-router-dom"
import { TopBar } from "./TopBar"

export function AppLayout() {
  return (
    <div className="min-h-screen flex flex-col bg-neutral-50">
      <TopBar />
      <main className="flex-1 flex flex-col">
        <Outlet />
      </main>
    </div>
  )
}
