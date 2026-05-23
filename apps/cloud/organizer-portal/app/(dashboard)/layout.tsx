"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams, usePathname } from "next/navigation";
import { useUIStore } from "@/store/useUIStore";
import { useAuthStore } from "@/store/use-auth-store";
import { useSocket } from "@/hooks/use-socket";
import { useEvent } from "@/hooks/useEvents";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { cn } from "@/lib/utils";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const params = useParams();
  const pathname = usePathname();
  const eventId = params?.eventId as string;
  const { data: event, isLoading: isEventLoading } = useEvent(eventId);

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
          const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/auth/me`, {
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

  const isSpeakerPath = pathname?.includes(`/events/${eventId}/speaker`);
  const isRegPath = pathname?.includes(`/events/${eventId}/registration`);

  const speakerModeEnabled = event?.speaker_mode_enabled ?? true;
  const regModeEnabled = event?.registration_mode_enabled ?? true;

  const isBlocked = (isSpeakerPath && !speakerModeEnabled) || (isRegPath && !regModeEnabled);

  let content = children;

  if (eventId && !isEventLoading && isBlocked) {
    content = (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-6 max-w-lg mx-auto my-auto animate-in fade-in zoom-in duration-500">
        <div className="h-20 w-20 rounded-[2rem] bg-[var(--dan)]/10 flex items-center justify-center border border-[var(--dan)]/30 shadow-lg shadow-[var(--dan)]/5">
          <Lock className="h-8 w-8 text-[var(--dan)]" />
        </div>
        <div className="space-y-3">
          <h3 className="text-2xl font-black text-[var(--text)] tracking-tighter">Module Access Restricted</h3>
          <p className="text-muted text-[11px] font-bold uppercase tracking-[0.2em] leading-relaxed">
            The {isSpeakerPath ? "Speaker Presentation Desk" : "On-Site Registration"} module is not enabled for this event. 
          </p>
          <p className="text-muted text-[10px] font-medium leading-relaxed">
            Please enable it in the Event Configuration settings or contact your administrator.
          </p>
        </div>
        <Button 
          onClick={() => {
            if (isSpeakerPath && regModeEnabled) {
              router.push(`/events/${eventId}/registration`);
            } else if (isRegPath && speakerModeEnabled) {
              router.push(`/events/${eventId}/speaker/dashboard`);
            } else {
              router.push("/events");
            }
          }}
          className="rounded-xl px-8 font-black uppercase text-[10px] tracking-widest bg-[var(--pri)] hover:bg-[var(--sec)] border-0 text-[var(--text)]"
        >
          {isSpeakerPath && regModeEnabled ? "Switch to Registration Workspace" : (isRegPath && speakerModeEnabled ? "Switch to Speaker Workspace" : "Go Back to Events")}
        </Button>
      </div>
    );
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
            {content}
          </div>
        </div>
      </main>
    </div>
  );
}
