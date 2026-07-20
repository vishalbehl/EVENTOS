"use client";

import { useAuthStore } from "@/store/use-auth-store";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ShieldAlert } from "lucide-react";
import { authService } from "@/services/auth-service";

export function SuperAdminGuard({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, hasHydrated } = useAuthStore();
  const router = useRouter();
  const [restoreState, setRestoreState] = useState<"idle" | "restoring" | "restored" | "failed">("idle");

  useEffect(() => {
    if (!hasHydrated) return;
    const isAdmin = user?.platform_role === "SUPER_ADMIN" || user?.is_platform_admin || user?.role === "super_admin";
    if (!isAuthenticated) {
      if (restoreState === "restoring") return;
      if (restoreState === "failed") {
        router.replace("/");
        return;
      }
      setRestoreState("restoring");
      void authService.restore().then((restored) => {
        setRestoreState(restored ? "restored" : "failed");
      });
      return;
    }
    if (restoreState !== "restored") setRestoreState("restored");
    const onExpired = () => router.replace("/");
    window.addEventListener("auth:session-expired", onExpired);
    if (!isAdmin) {
      router.replace("/dashboard");
    }
    return () => window.removeEventListener("auth:session-expired", onExpired);
  }, [hasHydrated, isAuthenticated, user, router, restoreState]);

  if (!hasHydrated || restoreState === "idle" || restoreState === "restoring" || !isAuthenticated) return null;

  const isAdmin = user?.platform_role === "SUPER_ADMIN" || user?.is_platform_admin || user?.role === "super_admin";
  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20">
          <ShieldAlert className="w-12 h-12 text-red-400" />
        </div>
        <h2 className="text-xl font-black text-white">Access Denied</h2>
        <p className="text-white/40 text-sm">Super Admin access required.</p>
      </div>
    );
  }

  return <>{children}</>;
}
