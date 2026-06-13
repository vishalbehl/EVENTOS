"use client";

import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { useUIStore } from "@/store/useUIStore";
import { cn } from "@/lib/utils";
import { AiFloatingAssistant } from "@/components/ui/AiFloatingAssistant";
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
        <div className="pointer-events-none absolute inset-0 bg-app-wallpaper opacity-85" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_74%_14%,color-mix(in_srgb,var(--pri)_12%,transparent),transparent_24%),linear-gradient(color-mix(in_srgb,var(--base)_72%,transparent),color-mix(in_srgb,var(--base)_92%,transparent))]" />
        
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
          
          <div className="flex-1 min-h-0 px-4 py-5 md:px-6 flex flex-col">
            <div className="flex-1 rounded-[14px] border border-default bg-[color-mix(in_srgb,var(--base)_80%,transparent)] p-5 shadow-[0_24px_80px_color-mix(in_srgb,var(--base)_28%,transparent)] backdrop-blur-md md:p-6 flex flex-col min-h-0 overflow-y-auto custom-scrollbar">
              {children}
            </div>
          </div>
        </main>
        <AiFloatingAssistant />
      </div>
    </SuperAdminGuard>
  );
}
