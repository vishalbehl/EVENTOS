"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useUIStore } from "@/store/useUIStore";
import { useAuthStore } from "@/store/use-auth-store";
import { useSocket } from "@/hooks/use-socket";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { cn } from "@/lib/utils";
import { resolveApiBaseUrl } from "@/lib/api-client";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { isAuthenticated, accessToken, user, setAuth, logout, hasHydrated } = useAuthStore();
  const isSidebarCollapsed = useUIStore((state) => state.isSidebarCollapsed);
  const [hydrated, setHydrated] = useState(false);

  // Initialize WebSockets
  useSocket();

  useEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => {
    const fetchUser = async () => {
      if (isAuthenticated && accessToken && !user) {
        console.log("[Auth] Fetching user profile...");
        try {
          const response = await fetch(`${resolveApiBaseUrl()}/auth/me`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
          });
          if (response.ok) {
            const userData = await response.json();
            console.log("[Auth] Profile sync successful:", userData.email);
            setAuth(userData, accessToken, useAuthStore.getState().refreshToken || undefined, useAuthStore.getState().rememberMe);
          } else if (response.status === 401) {
            console.warn("[Auth] 401 Unauthorized during profile sync. Logging out.");
            logout();
          } else {
            console.error("[Auth] Unexpected profile sync error:", response.status);
          }
        } catch (error) {
          console.error("[Auth] Profile fetch network error:", error);
        }
      }
    };
    if (hydrated && hasHydrated) {
      fetchUser();
    }
  }, [isAuthenticated, accessToken, user, setAuth, logout, hydrated, hasHydrated]);

  // Track user activity to update lastActivity in Zustand
  useEffect(() => {
    if (!hydrated || !hasHydrated || !isAuthenticated) return;

    const throttle = (fn: Function, delay: number) => {
      let lastCall = 0;
      return (...args: any[]) => {
        const now = Date.now();
        if (now - lastCall >= delay) {
          lastCall = now;
          fn(...args);
        }
      };
    };

    const handleActivity = throttle(() => {
      useAuthStore.getState().updateActivity();
    }, 60000); // 1 minute throttle

    window.addEventListener("mousedown", handleActivity);
    window.addEventListener("keydown", handleActivity);
    window.addEventListener("scroll", handleActivity);
    window.addEventListener("click", handleActivity);

    return () => {
      window.removeEventListener("mousedown", handleActivity);
      window.removeEventListener("keydown", handleActivity);
      window.removeEventListener("scroll", handleActivity);
      window.removeEventListener("click", handleActivity);
    };
  }, [hydrated, hasHydrated, isAuthenticated]);

  // Session limit and inactivity checks
  useEffect(() => {
    if (!hydrated || !hasHydrated) return;

    // Check tab session status
    const sessionActive = sessionStorage.getItem("session_active");
    if (!sessionActive) {
      const { rememberMe } = useAuthStore.getState();
      if (isAuthenticated && !rememberMe) {
        console.warn("[Auth] Session ended because Remember Me was disabled. Logging out.");
        logout();
        router.push("/");
        return;
      }
      sessionStorage.setItem("session_active", "true");
    }

    if (isAuthenticated) {
      const { loginTime, lastActivity, rememberMe } = useAuthStore.getState();
      const now = Date.now();

      const maxSessionDuration = rememberMe ? 15 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000; // 15 days vs 1 day
      const maxInactivityDuration = 36 * 60 * 60 * 1000; // 36 hours (1.5 days)

      const isSessionExpired = loginTime ? (now - loginTime > maxSessionDuration) : false;
      const isInactiveExpired = lastActivity ? (now - lastActivity > maxInactivityDuration) : false;

      if (isSessionExpired || isInactiveExpired) {
        console.warn("[Auth] Session expired. Logging out.");
        logout();
        router.push("/");
        return;
      }
    } else if (!accessToken) {
      router.push("/");
    }
  }, [hydrated, hasHydrated, isAuthenticated, accessToken, logout, router]);

  if (!hydrated || !hasHydrated || (!isAuthenticated && !accessToken)) {
    return null; // Prevent flash of content or premature redirect
  }

  return (
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
    </div>
  );
}
