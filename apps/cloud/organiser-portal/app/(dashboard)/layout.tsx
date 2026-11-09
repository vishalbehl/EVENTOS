"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useParams, usePathname } from "next/navigation";
import { Lock, Loader2 } from "lucide-react";
import { Sidebar } from "@/components/organizer/layout/Sidebar";
import { OrganisationTopbar } from "@/components/organizer/layout/OrganisationTopbar";
import { FloatingNeedsAttentionBoard } from "@/components/organizer/layout/FloatingNeedsAttentionBoard";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useSocket } from "@/hooks/use-socket";
import { useEvent } from "@/hooks/useEvents";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/store/useUIStore";
import { accessContextCacheKey, useAuthStore } from "@/store/use-auth-store";
import {
  capabilityForPath,
  CapabilityBoundary,
  EventCapabilitiesProvider,
  OrganizationCapabilitiesProvider,
  useEventCapabilities,
} from "@/lib/capabilities";

function EventPageBoundary({
  eventId,
  pathname,
  children,
}: {
  eventId?: string;
  pathname: string;
  children: React.ReactNode;
}) {
  const { data } = useEventCapabilities();
  const featureKey = eventId
    ? capabilityForPath(data?.features, pathname, eventId)
    : undefined;
  return featureKey ? (
    <CapabilityBoundary featureKey={featureKey}>{children}</CapabilityBoundary>
  ) : (
    <>{children}</>
  );
}

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

  const { isAuthenticated, accessToken, user, logout, hasHydrated, isContextSwitching, activeContext } =
    useAuthStore();
  const screenContextKey = `${user?.id ?? "anonymous"}:${accessContextCacheKey(activeContext, user?.organization_id)}`;
  const { isSidebarCollapsed, isMobileOpen, setMobileOpen, isSecondarySidebarOpen } = useUIStore();
  const [hydrated, setHydrated] = useState(false);
  const [impersonatingOrg, setImpersonatingOrg] = useState<string | null>(null);
  const profileFetchTokenRef = useRef<string | null>(null);

  useSocket();

  useEffect(() => {
    // Client mount is the final fallback for persisted-store hydration. In some
    // browser reload paths Zustand has already restored state before its
    // rehydration callback subscriber is attached.
    useAuthStore.getState().setHasHydrated(true);
    setHydrated(true);
    setImpersonatingOrg(localStorage.getItem("eventos_impersonating_org"));
    const controller = new AbortController();
    const fetchGlobalSettings = async () => {
      try {
        const token = useAuthStore.getState().accessToken;
        const baseUrl =
          process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
        const response = await fetch(`${baseUrl}/api/v1/global-settings/public`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          signal: controller.signal,
        });
        if (!response.ok) return;
        const data = await response.json();
        if (data?.timezone) {
          localStorage.setItem("system-timezone", data.timezone);
          window.dispatchEvent(new Event("system-timezone-changed"));
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          // Graceful fallback to default browser timezone when offline or during backend startup
        }
      }
    };
    fetchGlobalSettings();
    return () => controller.abort();
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
      // Fetch once for each token. The previous user-dependent effect updated
      // the same user object it watched, creating an auth/me request loop for
      // accounts whose onboarding flag was false or absent.
      if (profileFetchTokenRef.current === accessToken) return;
      profileFetchTokenRef.current = accessToken;
      try {
        const baseUrl =
          process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
        const response = await fetch(
          `${baseUrl}/api/v1/auth/me`,
          {
            headers: { Authorization: `Bearer ${accessToken}` },
          },
        );
        if (response.ok) {
          const userData = await response.json();
          // Do not reset login/activity timestamps while refreshing profile
          // data; this is a read, not a new login.
          useAuthStore.getState().updateUser(userData);
        } else if (response.status === 401) {
          profileFetchTokenRef.current = null;
          logout();
        }
      } catch (error) {
        profileFetchTokenRef.current = null;
        console.error("[Auth] Profile fetch network error:", error);
      }
    };

    if (!accessToken) {
      profileFetchTokenRef.current = null;
    } else if (hydrated && hasHydrated) {
      fetchUser();
    }
  }, [
    isAuthenticated,
    accessToken,
    logout,
    hydrated,
    hasHydrated,
  ]);

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
      const maxSessionDuration = rememberMe
        ? 15 * 24 * 60 * 60 * 1000
        : 24 * 60 * 60 * 1000;
      const maxInactivityDuration = 36 * 60 * 60 * 1000;
      const isSessionExpired = loginTime
        ? now - loginTime > maxSessionDuration
        : false;
      const isInactiveExpired = lastActivity
        ? now - lastActivity > maxInactivityDuration
        : false;

      if (isSessionExpired || isInactiveExpired) {
        logout();
        router.push("/");
        return;
      }

      if (user && !user.onboarding_completed) {
        const isDefaultOrg =
          user.is_platform_admin ||
          (user as any).organization_slug?.toLowerCase() === "eventos" ||
          (user as any).organization_slug?.toLowerCase() === "default-org";

        if (isDefaultOrg) {
          return;
        }

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
  const isBlocked =
    (isSpeakerPath && !speakerModeEnabled) || (isRegPath && !regModeEnabled);

  let content = children;

  if (eventId && !isEventLoading && isBlocked) {
    content = (
      <div className="animate-slide-up-fade flex flex-1 flex-col items-center justify-center space-y-6 p-8 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-lg border border-[var(--op-border)] bg-[var(--op-panel-soft)]">
          <Lock className="h-8 w-8 text-[var(--op-text)]" />
        </div>
        <div className="space-y-3">
          <h3 className="text-[22px] font-bold tracking-tight text-[var(--op-text)]">
            Module access restricted
          </h3>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--op-muted)]">
            The{" "}
            {isSpeakerPath
              ? "speaker presentation desk"
              : "on-site registration"}{" "}
            module is not enabled for this event.
          </p>
          <p className="text-[12px] leading-relaxed text-[var(--op-muted)]">
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

  if (!hydrated || !hasHydrated || !isAuthenticated || !accessToken) {
    return (
      <div className="z-50 flex h-screen w-screen flex-col items-center justify-center space-y-3 bg-[var(--op-page-bg)]">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--op-primary)]" />
        <span className="text-[10px] font-black uppercase tracking-widest text-[var(--op-muted)]">
          Verifying Session...
        </span>
      </div>
    );
  }

  return (
    <OrganizationCapabilitiesProvider>
      <EventCapabilitiesProvider eventId={eventId}>
        {isContextSwitching ? <div className="fixed inset-0 z-[200] grid place-items-center bg-[var(--op-page-bg)]" role="status" aria-live="polite">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-[var(--op-primary)]" />
            <span className="text-[10px] font-black uppercase tracking-widest text-[var(--op-muted)]">Switching workspace…</span>
          </div>
        </div> : null}
        <div
          key={screenContextKey}
          className={cn(
            "organisation-portal-shell relative h-screen overflow-hidden",
            eventId && "event-workspace-shell",
            isContextSwitching && "pointer-events-none opacity-0",
          )}
        >
          <div className="organisation-portal-backdrop" aria-hidden />
          {/* Mobile Sidebar Navigation Drawer Overlay */}
          <Sheet open={isMobileOpen} onOpenChange={setMobileOpen}>
            <SheetContent side="left" aria-describedby={undefined} className={cn("p-0 overflow-hidden lg:hidden", eventId ? (isSecondarySidebarOpen ? "w-[min(92vw,308px)]" : "w-[72px]") : "w-[min(88vw,20rem)]")}>
              <SheetTitle className="sr-only">Organiser Portal navigation</SheetTitle>
              <Sidebar />
            </SheetContent>
          </Sheet>

          <aside
            className={cn(
              "hidden h-full flex-col transition-all duration-200 ease-in-out",
              "lg:fixed lg:inset-y-0 lg:z-[80] lg:flex",
              isPlatformWorkspace ? "organisation-portal-sidebar" : "event-workspace-sidebar",
              eventId
                ? (isSecondarySidebarOpen ? "lg:w-[308px]" : "lg:w-[68px]")
                : (isSidebarCollapsed ? "lg:w-[82px]" : "lg:w-[228px]")
            )}
          >
            <Sidebar />
          </aside>

          <main
            className={cn(
              "relative flex h-screen flex-col overflow-hidden transition-all duration-200 ease-in-out",
              "organisation-portal-main",
            )}
          >
            <OrganisationTopbar />

            {impersonatingOrg && (
              <div
                className="mx-4 mt-3 flex items-center justify-between rounded-lg px-4 py-2.5 text-sm font-semibold md:mx-6"
                style={{
                  background:
                    "color-mix(in srgb, var(--status-warning) 10%, var(--bg-surface))",
                  border:
                    "1px solid color-mix(in srgb, var(--status-warning) 35%, var(--border-default))",
                  color: "var(--status-warning)",
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

            {!impersonatingOrg && (user?.role === "super_admin" || user?.is_platform_admin) && (
              <div className="mx-4 mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-xs text-amber-600 dark:text-amber-400 md:mx-6">
                <span>
                  <strong>Platform Super Admin Session:</strong> Eventos is the host platform organization, so tenant workspace APIs return 404 for this direct session. To manage organizations or impersonate a tenant, visit{" "}
                  <a href="http://localhost:3000" className="underline font-bold hover:text-amber-500">Command Center (Port 3000)</a>, or sign in as an organiser (e.g. <code>category-a-admin@example.com</code> / <code>admin123</code>).
                </span>
                <a
                  href="http://localhost:3000"
                  className="rounded bg-amber-500/20 px-2.5 py-1 text-[11px] font-bold text-amber-700 dark:text-amber-300 transition-colors hover:bg-amber-500/30"
                >
                  Open Command Center &rarr;
                </a>
              </div>
            )}

            <div className="organisation-portal-content-wrap flex min-h-0 flex-1 flex-col">
              <div id="organiser-main" tabIndex={-1} className="organisation-portal-content relative cc-route-enter cc-scroll-region custom-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden">
                <EventPageBoundary eventId={eventId} pathname={pathname || ""}>
                  {content}
                </EventPageBoundary>
              </div>
            </div>
            {!isPlatformWorkspace ? <FloatingNeedsAttentionBoard /> : null}
          </main>
        </div>
      </EventCapabilitiesProvider>
    </OrganizationCapabilitiesProvider>
  );
}
