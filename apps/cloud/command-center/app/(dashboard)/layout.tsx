"use client";

import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { useUIStore } from "@/store/useUIStore";
import { cn } from "@/lib/utils";
import { SuperAdminGuard } from "@/components/super-admin/SuperAdminGuard";
import { useState, useEffect } from "react";

export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const [hydrated, setHydrated] = useState(false);
  const isSidebarCollapsed = useUIStore((state) => state.isSidebarCollapsed);

  useEffect(() => {
    setHydrated(true);
    // document.documentElement.classList.add("dark");
  }, []);

  return (
    <SuperAdminGuard>
      <div className="relative h-screen overflow-hidden bg-[var(--base)] text-foreground">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_78%_-12%,rgba(59,158,255,0.16),transparent_32rem),radial-gradient(circle_at_12%_4%,rgba(34,255,153,0.08),transparent_28rem)]" />
        
        <aside
          className={cn(
            "hidden h-full md:fixed md:inset-y-0 md:z-[80] md:flex md:flex-col transition-all duration-300 ease-in-out",
            isSidebarCollapsed ? "md:w-20" : "md:w-72"
          )}
        >
          <Sidebar />
        </aside>

        <main
          className={cn(
            "relative h-screen overflow-hidden flex flex-col transition-all duration-300 ease-in-out",
            isSidebarCollapsed ? "md:pl-20" : "md:pl-72"
          )}
        >
          <Header />
          
          <div className="flex min-h-0 flex-1 flex-col px-4 py-4 md:px-6">
            <div className="custom-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden rounded-xl border border-[var(--border-subtle)] bg-[color-mix(in_srgb,var(--base)_78%,transparent)] p-5 backdrop-blur-md md:p-6">
              {children}
            </div>
          </div>
        </main>
      </div>
    </SuperAdminGuard>
  );
}
