"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams, usePathname } from "next/navigation";
import { useUIStore } from "@/store/useUIStore";
import { useAuthStore } from "@/store/use-auth-store";
import { useSocket } from "@/hooks/use-socket";
import { useEvent } from "@/hooks/useEvents";
import { Sidebar } from "@/components/organizer/layout/Sidebar";
import { Header } from "@/components/organizer/layout/Header";
import { cn } from "@/lib/utils";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AiFloatingAssistant } from "@/components/ui/AiFloatingAssistant";

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
  const [impersonatingOrg, setImpersonatingOrg] = useState<string | null>(null);

  // Initialize WebSockets
  useSocket();

  useEffect(() => {
    setHydrated(true);
    setImpersonatingOrg(localStorage.getItem("eventos_impersonating_org"));
    const fetchGlobalSettings = async () => {
      try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/global-settings`);
        if (response.ok) {
          const data = await response.json();
          if (data && data.timezone) {
            localStorage.setItem("system-timezone", data.timezone);
            window.dispatchEvent(new Event("system-timezone-changed"));
          }
        }
      } catch (error) {
        console.error("Failed to fetch global timezone settings:", error);
      }
    };
    fetchGlobalSettings();
  }, []);

  const exitImpersonation = () => {
    localStorage.removeItem("eventos_original_token");
    localStorage.removeItem("eventos_impersonating_org");
    localStorage.removeItem("impersonated_user_name");
    
    const store = useAuthStore.getState();
    const isSuperAdmin = store.originalUser?.role === 'super_admin' || store.originalUser?.is_platform_admin || !store.originalUser;

    store.stopImpersonation();

    if (isSuperAdmin) {
      window.location.href = "http://localhost:3000/super-admin/organizations";
    } else {
      window.location.reload();
    }
  };

  useEffect(() => {
    const fetchUser = async () => {
      if (isAuthenticated && accessToken && !user) {
        try {
          const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/auth/me`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
          });
          if (response.ok) {
            const userData = await response.json();
            setAuth(userData, accessToken, useAuthStore.getState().refreshToken || undefined, useAuthStore.getState().rememberMe);
          } else if (response.status === 401) {
            logout();
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

  // Track user activity
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
    }, 60000);

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

  // Session checks
  useEffect(() => {
    if (!hydrated || !hasHydrated) return;

    const sessionActive = sessionStorage.getItem("session_active");
    if (!sessionActive) {
      const { rememberMe } = useAuthStore.getState();
      if (isAuthenticated && !rememberMe) {
        logout();
        router.push("/");
        return;
      }
      sessionStorage.setItem("session_active", "true");
    }

    if (isAuthenticated) {
      const { loginTime, lastActivity, rememberMe } = useAuthStore.getState();
      const now = Date.now();
      const maxSessionDuration = rememberMe ? 15 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
      const maxInactivityDuration = 36 * 60 * 60 * 1000;
      const isSessionExpired  = loginTime     ? (now - loginTime     > maxSessionDuration)    : false;
      const isInactiveExpired = lastActivity  ? (now - lastActivity  > maxInactivityDuration) : false;

      if (isSessionExpired || isInactiveExpired) {
        logout();
        router.push("/");
        return;
      }
    } else if (!accessToken) {
      router.push("/");
    }
  }, [hydrated, hasHydrated, isAuthenticated, accessToken, logout, router]);

  const isSpeakerPath = pathname?.includes(`/events/${eventId}/speaker`);
  const isRegPath     = pathname?.includes(`/events/${eventId}/registration`);

  const speakerModeEnabled = event?.speaker_settings?.enabled ?? true;
  const regModeEnabled     = event?.registration_settings?.enabled ?? true;

  const isBlocked = (isSpeakerPath && !speakerModeEnabled) || (isRegPath && !regModeEnabled);

  let content = children;

  if (eventId && !isEventLoading && isBlocked) {
    content = (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-6 max-w-lg mx-auto my-auto animate-slide-up-fade">
        <div
          className="h-20 w-20 rounded-[2rem] flex items-center justify-center"
          style={{
            background: "var(--color-danger-muted)",
            border: "1px solid color-mix(in srgb, var(--color-danger) 30%, transparent)",
            boxShadow: "0 8px 24px rgba(239, 68, 68, 0.12)",
          }}
        >
          <Lock className="h-8 w-8" style={{ color: "var(--color-danger)" }} />
        </div>
        <div className="space-y-3">
          <h3
            className="text-[22px] font-bold tracking-tight"
            style={{ color: "var(--color-text-primary)" }}
          >
            Module Access Restricted
          </h3>
          <p
            className="text-[11px] font-semibold uppercase tracking-[0.2em] leading-relaxed"
            style={{ color: "var(--color-text-muted)" }}
          >
            The {isSpeakerPath ? "Speaker Presentation Desk" : "On-Site Registration"} module is not enabled for this event.
          </p>
          <p
            className="text-[12px] leading-relaxed"
            style={{ color: "var(--color-text-muted)" }}
          >
            Please enable it in Event Configuration settings or contact your administrator.
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
        >
          {isSpeakerPath && regModeEnabled
            ? "Switch to Registration"
            : isRegPath && speakerModeEnabled
            ? "Switch to Speaker Workspace"
            : "Back to Events"}
        </Button>
      </div>
    );
  }

  return (
    <div
      className="relative h-screen overflow-hidden"
      style={{ background: "var(--color-bg)" }}
    >
      {/* ── Ambient gradient overlay ── */}
      <div
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          background: `
            radial-gradient(ellipse at 75% 10%, rgba(124, 58, 237, 0.12), transparent 50%),
            radial-gradient(ellipse at 10% 80%, rgba(6, 182, 212, 0.06), transparent 50%)
          `,
        }}
      />

      {/* ── Sidebar ── */}
      <aside
        className={cn(
          "hidden h-full md:fixed md:inset-y-0 md:z-[80] md:flex md:flex-col transition-all duration-300 ease-in-out",
          isSidebarCollapsed ? "md:w-[72px]" : "md:w-64"
        )}
      >
        <Sidebar />
      </aside>

      {/* ── Main content ── */}
      <main
        className={cn(
          "relative h-screen overflow-hidden flex flex-col transition-all duration-300 ease-in-out",
          isSidebarCollapsed ? "md:pl-[72px]" : "md:pl-64"
        )}
      >
        <Header />

        {/* Impersonation banner */}
        {impersonatingOrg && (
          <div
            className="mx-4 mt-3 md:mx-6 rounded-xl px-4 py-2.5 text-sm font-semibold flex items-center justify-between"
            style={{
              background: "var(--color-warning-muted)",
              border: "1px solid color-mix(in srgb, var(--color-warning) 30%, transparent)",
              color: "var(--color-warning)",
            }}
          >
            <span>Viewing as {impersonatingOrg}</span>
            <button
              onClick={exitImpersonation}
              className="text-[10px] font-bold uppercase tracking-widest hover:opacity-80 transition-opacity"
            >
              Exit Impersonation
            </button>
          </div>
        )}

        {/* ── Page content wrapper — CANVAS layer (surface-1) ── */}
        <div className="flex-1 min-h-0 px-4 py-4 md:px-6 flex flex-col">
          <div
            className="flex-1 rounded-[var(--radius-lg)] flex flex-col min-h-0 overflow-y-auto custom-scrollbar p-5 md:p-6"
            style={{
              background: "var(--color-surface-1)",
              border: "1px solid var(--color-border-subtle)",
              boxShadow: "inset 0 1px 0 color-mix(in srgb, white 4%, transparent), 0 2px 16px color-mix(in srgb, var(--color-bg) 60%, transparent)",
            }}
          >
            {content}
          </div>
        </div>
      </main>

      <AiFloatingAssistant />
    </div>
  );
}
