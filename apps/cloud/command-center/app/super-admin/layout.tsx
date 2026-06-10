"use client";

import { SuperAdminGuard } from "@/components/super-admin/SuperAdminGuard";
import { SuperAdminSidebar } from "@/components/super-admin/SuperAdminSidebar";
import { Header } from "@/components/layout/Header";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/store/useUIStore";
import { useAuthStore } from "@/store/use-auth-store";
import { useState, useEffect } from "react";

export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const isSidebarCollapsed = useUIStore((state) => state.isSidebarCollapsed);
  const { isAuthenticated, accessToken, user, setAuth, logout, hasHydrated } = useAuthStore();
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => { setHydrated(true); }, []);

  return (
    <SuperAdminGuard>
      <div className="relative h-screen overflow-hidden bg-[var(--base)] text-foreground">
        {/* Background */}
        <div className="pointer-events-none absolute inset-0 bg-app-wallpaper opacity-85" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_74%_14%,color-mix(in_srgb,var(--pri)_8%,transparent),transparent_24%),linear-gradient(color-mix(in_srgb,var(--base)_72%,transparent),color-mix(in_srgb,var(--base)_92%,transparent))]" />

        {/* Sidebar */}
        <aside
          className={cn(
            "hidden h-full md:fixed md:inset-y-0 md:z-[80] md:flex md:flex-col transition-all duration-300 ease-in-out",
            isSidebarCollapsed ? "md:w-20" : "md:w-72"
          )}
        >
          <SuperAdminSidebar />
        </aside>

        {/* Main */}
        <main
          className={cn(
            "relative h-screen overflow-hidden flex flex-col transition-all duration-300 ease-in-out",
            isSidebarCollapsed ? "md:pl-20" : "md:pl-72"
          )}
        >
          <Header />
          {/* Super Admin Badge Banner */}
          {hydrated && (
            <div className="mx-4 mt-3 md:mx-6">
              <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 px-4 py-2 flex items-center gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-purple-400">
                  Super Admin Console
                </span>
                <span className="text-[10px] text-purple-400/40 font-mono ml-auto">
                  Platform Control Plane · EventX OS
                </span>
              </div>
            </div>
          )}
          <div className="flex-1 min-h-0 px-4 py-4 md:px-6 flex flex-col">
            <div className="flex-1 rounded-[14px] border border-default bg-[color-mix(in_srgb,var(--base)_80%,transparent)] p-5 shadow-[0_24px_80px_color-mix(in_srgb,var(--base)_28%,transparent)] backdrop-blur-md md:p-6 flex flex-col min-h-0 overflow-y-auto custom-scrollbar">
              {children}
            </div>
          </div>
        </main>
      </div>
    </SuperAdminGuard>
  );
}
