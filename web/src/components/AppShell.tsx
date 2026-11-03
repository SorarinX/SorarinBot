import { Outlet } from "react-router-dom";
import { PageTransition } from "./PageTransition";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

export function AppShell() {
  return (
    <div className="relative min-h-screen bg-bg text-text">
      <Sidebar />
      <div className="app-content flex min-h-screen flex-col">
        <Topbar />
        <main className="app-gutter relative z-10 flex-1 py-6">
          <div className="mx-auto w-full max-w-[1280px]">
            <PageTransition>
              <Outlet />
            </PageTransition>
          </div>
        </main>
      </div>
      <div className="app-ambient" aria-hidden="true" />
    </div>
  );
}
