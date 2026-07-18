"use client";

import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { SkipNavigation } from "@/components/layout/SkipNavigation";
import { useUIStore } from "@/store/useUIStore";
import { cn } from "@/lib/utils";
import { SuperAdminGuard } from "@/components/super-admin/SuperAdminGuard";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { RouteAnnouncer } from "@/components/layout/RouteAnnouncer";
import { ConsoleProvider } from "@/components/console/ConsoleProvider";

export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const isSidebarCollapsed = useUIStore((state) => state.isSidebarCollapsed);
  const isMobileSidebarOpen = useUIStore((state) => state.isMobileSidebarOpen);
  const setMobileSidebarOpen = useUIStore((state) => state.setMobileSidebarOpen);

  return (
    <SuperAdminGuard>
      <ConsoleProvider>
      <div className="relative h-screen overflow-hidden bg-[var(--base)] text-foreground">
        <SkipNavigation />
        
        <aside
          className={cn(
            "hidden h-full md:fixed md:inset-y-0 md:z-[80] md:flex md:flex-col transition-all duration-300 ease-in-out",
            isSidebarCollapsed ? "md:w-[72px]" : "md:w-[248px]"
          )}
        >
          <Sidebar />
        </aside>

        <Sheet open={isMobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
          <SheetContent side="left" aria-describedby={undefined} className="w-[min(88vw,20rem)] p-0 md:hidden">
            <SheetTitle className="sr-only">Command Center navigation</SheetTitle>
            <Sidebar />
          </SheetContent>
        </Sheet>

        <main
          className={cn(
            "relative h-screen overflow-hidden flex flex-col transition-all duration-300 ease-in-out",
            isSidebarCollapsed ? "md:pl-[72px]" : "md:pl-[248px]"
          )}
        >
          <Header />
          <RouteAnnouncer />
          
          <div className="flex min-h-0 flex-1 flex-col p-2 sm:p-3 md:p-4">
            <div id="command-center-main" tabIndex={-1} className="cc-route-enter cc-scroll-region custom-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden rounded-[16px] border border-[var(--border-default)] bg-[var(--bg-surface-2)] shadow-[var(--shadow-panel)]">
              {children}
            </div>
          </div>
        </main>
      </div>
      </ConsoleProvider>
    </SuperAdminGuard>
  );
}
