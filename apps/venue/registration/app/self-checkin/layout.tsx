"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/use-auth-store";
import { assignmentAllowsMode, fetchVenueNodeBootstrap, type VenueNodeAssignment } from "@/lib/node-workstation";

const routeForAssignmentMode = (mode?: string | null) => {
  if (mode === "scanning") return "/scanning";
  if (mode === "self_checkin") return "/self-checkin";
  return "/registry";
};

export default function SelfCheckInLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { isAuthenticated, setMode, logout } = useAuthStore();
  const [hydrated, setHydrated] = useState(false);
  const [assignment, setAssignment] = useState<VenueNodeAssignment | null>(null);
  const [blockedReason, setBlockedReason] = useState("");

  useEffect(() => {
    let mounted = true;
    const guard = async () => {
      if (!isAuthenticated) {
        router.push("/");
        if (mounted) setHydrated(true);
        return;
      }

      try {
        const bootstrap = await fetchVenueNodeBootstrap();
        const assignedMode = bootstrap?.assignment?.mode;
        if (!bootstrap?.assignment) {
          if (mounted) {
            setBlockedReason("This workstation is not assigned as a self check-in kiosk. Ask an admin to bind this PC as SELF-KIOSK-1 or another kiosk name.");
            setHydrated(true);
          }
          return;
        }
        if (!assignmentAllowsMode(bootstrap.assignment, "self_checkin")) {
          if (mounted) {
            setBlockedReason("This workstation is not authorized for Self Check-in mode. Please select an allowed mode from the login screen.");
            setHydrated(true);
          }
          return;
        }
        setMode("self_checkin");
        if (mounted) {
          setAssignment(bootstrap.assignment);
          setHydrated(true);
        }
      } catch {
        if (mounted) {
          setBlockedReason("Self check-in mode needs an active or locally replicated kiosk assignment for this PC.");
          setHydrated(true);
        }
      }
    };
    void guard();
    return () => {
      mounted = false;
    };
  }, [isAuthenticated, router, setMode]);

  if (!hydrated || !isAuthenticated) return null;
  if (blockedReason) {
    return (
      <main className="grid min-h-screen place-items-center bg-[var(--base)] p-6 text-[var(--text)]">
        <section className="max-w-lg rounded-3xl border border-[var(--border)] bg-[var(--card)] p-8 text-center shadow-2xl">
          <p className="text-[10px] font-black uppercase tracking-[0.28em] text-[var(--pri)]">Self check-in unavailable</p>
          <h1 className="mt-3 text-2xl font-black">Kiosk assignment required</h1>
          <p className="mt-3 text-sm font-semibold leading-6 text-[var(--muted)]">{blockedReason}</p>
          <button
            type="button"
            onClick={() => {
              logout();
              window.sessionStorage.removeItem("session_active");
              router.replace("/");
            }}
            className="mt-6 rounded-2xl bg-[var(--pri)] px-5 py-3 text-xs font-black uppercase tracking-wider text-[var(--primary-contrast)]"
          >
            Back to login
          </button>
        </section>
      </main>
    );
  }

  return <div data-kiosk-name={assignment?.station_id || "SELF-KIOSK"}>{children}</div>;
}
