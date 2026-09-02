"use client";

import { useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useAuthStore } from "@/store/use-auth-store";
import { apiClient } from "@/lib/api-client";

const INACTIVITY_TIMEOUT_MS = 45 * 60 * 1000; // 45 minutes
const HEARTBEAT_INTERVAL_MS = 30 * 1000; // 30 seconds

export function useSessionTimeout() {
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const lastActivityRef = useRef<number>(Date.now());
  const logoutTimerRef = useRef<NodeJS.Timeout | null>(null);
  const heartbeatTimerRef = useRef<NodeJS.Timeout | null>(null);

  const handleLogout = useCallback(
    async (reason = "Session expired due to inactivity.") => {
      try {
        await apiClient.post("/auth/logout").catch(() => {});
      } finally {
        logout();
        localStorage.removeItem("venue_session_active");
        sessionStorage.removeItem("session_active");
        toast.warning(reason);
        router.replace("/login");
      }
    },
    [logout, router]
  );

  const recordActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
    localStorage.setItem("venue_workstation_last_active", String(Date.now()));
  }, []);

  useEffect(() => {
    // 1. Initial check: User must be logged in
    const sessionActive = localStorage.getItem("venue_session_active") || sessionStorage.getItem("session_active");
    if (!sessionActive) {
      router.replace("/login");
      return;
    }

    // 2. Register user interaction listeners
    const events = ["mousemove", "keydown", "pointerdown", "scroll", "touchstart", "click"];
    const handleEvent = () => recordActivity();

    events.forEach((evt) => {
      window.addEventListener(evt, handleEvent, { passive: true });
    });

    // 3. Periodic inactivity check timer
    logoutTimerRef.current = setInterval(() => {
      const elapsed = Date.now() - lastActivityRef.current;
      if (elapsed >= INACTIVITY_TIMEOUT_MS) {
        handleLogout("Workstation session timed out after 45 minutes of inactivity.");
      }
    }, 10000);

    // 4. Background workstation session health check
    heartbeatTimerRef.current = setInterval(async () => {
      try {
        await apiClient.get("/auth/status");
      } catch (err: any) {
        if (err?.status === 401 || err?.status === 403) {
          handleLogout("Workstation session invalidated or expired.");
        }
      }
    }, HEARTBEAT_INTERVAL_MS);

    return () => {
      events.forEach((evt) => {
        window.removeEventListener(evt, handleEvent);
      });
      if (logoutTimerRef.current) clearInterval(logoutTimerRef.current);
      if (heartbeatTimerRef.current) clearInterval(heartbeatTimerRef.current);
    };
  }, [handleLogout, recordActivity, router]);

  return {
    lastActive: lastActivityRef.current,
    recordActivity,
  };
}
