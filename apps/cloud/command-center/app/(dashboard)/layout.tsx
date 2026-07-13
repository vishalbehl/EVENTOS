"use client";

import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { SkipNavigation } from "@/components/layout/SkipNavigation";
import { useUIStore } from "@/store/useUIStore";
import { cn } from "@/lib/utils";
import { SuperAdminGuard } from "@/components/super-admin/SuperAdminGuard";
import { X } from "lucide-react";

export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const isSidebarCollapsed = useUIStore((state) => state.isSidebarCollapsed);
  const isMobileSidebarOpen = useUIStore((state) => state.isMobileSidebarOpen);
  const setMobileSidebarOpen = useUIStore((state) => state.setMobileSidebarOpen);

  return (
    <SuperAdminGuard>
      <div className="relative h-screen overflow-hidden bg-[var(--base)] text-foreground">
        <SkipNavigation />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_78%_-12%,rgba(59,158,255,0.16),transparent_32rem),radial-gradient(circle_at_12%_4%,rgba(34,255,153,0.08),transparent_28rem)]" />
        
        <aside
          className={cn(
            "hidden h-full md:fixed md:inset-y-0 md:z-[80] md:flex md:flex-col transition-all duration-300 ease-in-out",
            isSidebarCollapsed ? "md:w-20" : "md:w-72"
          )}
        >
          <Sidebar />
        </aside>

        {isMobileSidebarOpen && (
          <div className="fixed inset-0 z-[90] md:hidden">
            <button
              type="button"
              aria-label="Close navigation"
              className="absolute inset-0 bg-black/70 backdrop-blur-sm"
              onClick={() => setMobileSidebarOpen(false)}
            />
            <aside aria-label="Mobile navigation" className="relative h-full w-[min(88vw,20rem)] shadow-2xl">
              <Sidebar />
              <button
                type="button"
                aria-label="Close navigation"
                onClick={() => setMobileSidebarOpen(false)}
                className="absolute right-3 top-3 grid size-9 place-items-center rounded-lg border border-[var(--border)] bg-[var(--card)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                <X aria-hidden className="size-4" />
              </button>
            </aside>
          </div>
        )}

        <main
          className={cn(
            "relative h-screen overflow-hidden flex flex-col transition-all duration-300 ease-in-out",
            isSidebarCollapsed ? "md:pl-20" : "md:pl-72"
          )}
        >
          <Header />
          
          <div className="flex min-h-0 flex-1 flex-col p-2 sm:p-4 md:px-6">
            <div id="command-center-main" tabIndex={-1} className="custom-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden rounded-xl border border-[var(--border-subtle)] bg-[color-mix(in_srgb,var(--base)_78%,transparent)] backdrop-blur-md">
              {children}
            </div>
          </div>
        </main>
      </div>
    </SuperAdminGuard>
  );
}
