"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams, usePathname } from "next/navigation";
import { Lock } from "lucide-react";
import { Sidebar } from "@/components/organizer/layout/Sidebar";
import { Header } from "@/components/organizer/layout/Header";
import { Button } from "@/components/ui/button";
import { useSocket } from "@/hooks/use-socket";
import { useEvent } from "@/hooks/useEvents";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/store/useUIStore";
import { useAuthStore } from "@/store/use-auth-store";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const params = useParams();
  const pathname = usePathname();
  const eventId = params?.eventId as string;
  const isPlatformWorkspace = !eventId;
  const { data: event, isLoading: isEventLoading } = useEvent(eventId);

  const { isAuthenticated, accessToken, user, setAuth, logout, hasHydrated } = useAuthStore();
  const isSidebarCollapsed = useUIStore((state) => state.isSidebarCollapsed);
  const [hydrated, setHydrated] = useState(false);
  const [impersonatingOrg, setImpersonatingOrg] = useState<string | null>(null);

  useSocket();

  useEffect(() => {
    setHydrated(true);
    setImpersonatingOrg(localStorage.getItem("eventos_impersonating_org"));
    const fetchGlobalSettings = async () => {
      try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/global-settings`);
        if (!response.ok) return;
        const data = await response.json();
        if (data?.timezone) {
          localStorage.setItem("system-timezone", data.timezone);
          window.dispatchEvent(new Event("system-timezone-changed"));
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
    const isSuperAdmin =
      store.originalUser?.role === "super_admin" ||
      store.originalUser?.is_platform_admin ||
      !store.originalUser;

    store.stopImpersonation();

    if (isSuperAdmin) {
      window.location.href = "http://localhost:3000/super-admin/organizations";
      return;
    }

    window.location.reload();
  };

  useEffect(() => {
    const fetchUser = async () => {
      if (!isAuthenticated || !accessToken) return;
      if (user && user.onboarding_completed) return;
      try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/auth/me`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (response.ok) {
          const userData = await response.json();
          setAuth(
            userData,
            accessToken,
            useAuthStore.getState().refreshToken || undefined,
            useAuthStore.getState().rememberMe
          );
        } else if (response.status === 401) {
          logout();
        }
      } catch (error) {
        console.error("[Auth] Profile fetch network error:", error);
      }
    };

    if (hydrated && hasHydrated) {
      fetchUser();
    }
  }, [isAuthenticated, accessToken, user, setAuth, logout, hydrated, hasHydrated]);

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
      const isSessionExpired = loginTime ? now - loginTime > maxSessionDuration : false;
      const isInactiveExpired = lastActivity ? now - lastActivity > maxInactivityDuration : false;

      if (isSessionExpired || isInactiveExpired) {
        logout();
        router.push("/");
        return;
      }

      if (user && !user.onboarding_completed) {
        router.push("/onboarding");
        return;
      }
    } else if (!accessToken) {
      router.push("/");
    }
  }, [hydrated, hasHydrated, isAuthenticated, accessToken, logout, router]);

  const isSpeakerPath = pathname?.includes(`/events/${eventId}/speaker`);
  const isRegPath = pathname?.includes(`/events/${eventId}/registration`);
  const speakerModeEnabled = event?.speaker_settings?.enabled ?? true;
  const regModeEnabled = event?.registration_settings?.enabled ?? true;
  const isBlocked = (isSpeakerPath && !speakerModeEnabled) || (isRegPath && !regModeEnabled);

  let content = children;

  if (eventId && !isEventLoading && isBlocked) {
    content = (
      <div className="animate-slide-up-fade flex flex-1 flex-col items-center justify-center space-y-6 p-8 text-center">
        <div className="hex-icon-shell flex h-20 w-20 items-center justify-center">
          <Lock className="h-8 w-8 text-[var(--color-text-primary)]" />
        </div>
        <div className="space-y-3">
          <h3 className="text-[22px] font-bold tracking-tight text-[var(--color-text-primary)]">
            Module access restricted
          </h3>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--color-text-muted)]">
            The {isSpeakerPath ? "speaker presentation desk" : "on-site registration"} module is not enabled for this event.
          </p>
          <p className="text-[12px] leading-relaxed text-[var(--color-text-muted)]">
            Enable it in event configuration or contact your administrator.
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
    <div className="relative h-screen overflow-hidden" style={{ background: "var(--color-bg)" }}>
      <div
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          backgroundImage: `
            radial-gradient(circle at 78% 0%, rgba(224,255,0,0.10), transparent 24%),
            radial-gradient(circle at 0% 100%, rgba(125,211,252,0.08), transparent 18%),
            linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)
          `,
          backgroundSize: "auto, auto, 36px 36px, 36px 36px",
        }}
      />

      <aside
        className={cn(
          "hidden h-full md:fixed md:inset-y-0 md:z-[80] md:flex md:flex-col transition-all duration-300 ease-in-out",
          isSidebarCollapsed ? "md:w-[72px]" : "md:w-64"
        )}
      >
        <Sidebar />
      </aside>

      <main
        className={cn(
          "relative flex h-screen flex-col overflow-hidden transition-all duration-300 ease-in-out",
          isSidebarCollapsed ? "md:pl-[72px]" : "md:pl-64"
        )}
      >
        <Header />

        {impersonatingOrg && (
          <div
            className="mx-4 mt-3 flex items-center justify-between rounded-xl px-4 py-2.5 text-sm font-semibold md:mx-6"
            style={{
              background: "var(--color-warning-muted)",
              border: "1px solid color-mix(in srgb, var(--color-warning) 30%, transparent)",
              color: "var(--color-warning)",
            }}
          >
            <span>Viewing as {impersonatingOrg}</span>
            <button
              onClick={exitImpersonation}
              className="text-[10px] font-bold uppercase tracking-widest transition-opacity hover:opacity-80"
            >
              Exit Impersonation
            </button>
          </div>
        )}

        <div className="flex min-h-0 flex-1 flex-col px-4 py-4 md:px-6">
          <div
            className="hex-panel flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden rounded-[30px] p-5 md:p-6"
            style={{
              background:
                "linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01)), var(--color-surface-1)",
              border: "1px solid var(--color-border-subtle)",
            }}
          >
            {content}
          </div>
        </div>
      </main>
    </div>
  );
}
