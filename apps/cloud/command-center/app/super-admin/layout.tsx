"use client";

import type { ReactNode } from "react";
import { Header } from "@/components/layout/Header";
import { RouteAnnouncer } from "@/components/layout/RouteAnnouncer";
import { Sidebar } from "@/components/layout/Sidebar";
import { SkipNavigation } from "@/components/layout/SkipNavigation";
import { SuperAdminGuard } from "@/components/super-admin/SuperAdminGuard";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/store/useUIStore";

export default function LegacySuperAdminLayout({ children }: { children: ReactNode }) {
  const collapsed = useUIStore((state) => state.isSidebarCollapsed);
  const mobileOpen = useUIStore((state) => state.isMobileSidebarOpen);
  const setMobileOpen = useUIStore((state) => state.setMobileSidebarOpen);

  return (
    <SuperAdminGuard>
      <div className="relative h-screen overflow-hidden bg-[var(--base)] text-foreground">
        <SkipNavigation />
        <aside className={cn("hidden h-full transition-[width] duration-200 md:fixed md:inset-y-0 md:z-[80] md:flex md:flex-col", collapsed ? "md:w-[72px]" : "md:w-[248px]")}>
          <Sidebar />
        </aside>
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent side="left" aria-describedby={undefined} className="w-[min(88vw,20rem)] p-0 md:hidden">
            <SheetTitle className="sr-only">Command Center navigation</SheetTitle>
            <Sidebar />
          </SheetContent>
        </Sheet>
        <main className={cn("relative flex h-screen flex-col overflow-hidden transition-[padding] duration-200", collapsed ? "md:pl-[72px]" : "md:pl-[248px]")}>
          <Header />
          <RouteAnnouncer />
          <div className="flex min-h-0 flex-1 flex-col p-2 sm:p-3 md:p-4">
            <div id="command-center-main" tabIndex={-1} className="cc-route-enter cc-scroll-region flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden rounded-[16px] border border-[var(--border-default)] bg-[var(--bg-surface-2)] shadow-[var(--shadow-panel)]">
              {children}
            </div>
          </div>
        </main>
      </div>
    </SuperAdminGuard>
  );
}
