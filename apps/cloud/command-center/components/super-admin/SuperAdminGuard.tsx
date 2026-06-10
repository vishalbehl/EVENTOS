"use client";

import { useAuthStore } from "@/store/use-auth-store";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { ShieldAlert } from "lucide-react";

export function SuperAdminGuard({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, hasHydrated } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    if (!hasHydrated) return;
    const isAdmin = user?.platform_role === "SUPER_ADMIN" || user?.is_platform_admin || user?.role === "super_admin";
    if (!isAuthenticated) {
      router.replace("/admin");
      return;
    }
    if (!isAdmin) {
      router.replace("/dashboard");
    }
  }, [hasHydrated, isAuthenticated, user, router]);

  if (!hasHydrated) return null;

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
