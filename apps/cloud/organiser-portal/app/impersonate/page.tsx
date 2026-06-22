"use client";

import { useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuthStore } from "@/store/use-auth-store";
import { Loader2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

function ImpersonateHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const token = searchParams.get("token");
    const originalToken = searchParams.get("originalToken");
    const orgName = searchParams.get("orgName") || "Enterprise Org";
    const userName = searchParams.get("userName") || "Enterprise User";

    if (!token) {
      toast.error("No impersonation token provided.");
      router.push("/login");
      return;
    }

    const initImpersonation = async () => {
      try {
        // Fetch user profile using the impersonation token to load exact roles and metadata
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"}/api/v1/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!response.ok) {
          throw new Error("Failed to fetch user profile for impersonated token.");
        }

        const userData = await response.json();
        if (!userData) {
          throw new Error("No user profile details returned.");
        }

        // Set impersonating details in localStorage (so that dashboard layout matches)
        localStorage.setItem("eventos_original_token", originalToken || token);
        localStorage.setItem("eventos_impersonating_org", orgName);
        localStorage.setItem("impersonated_user_name", userName);

        // Update Auth Store
        const store = useAuthStore.getState();
        store.startImpersonation(userData, token, orgName, userName);

        // Explicitly set original token fields in store state so stopImpersonation() works
        useAuthStore.setState({
          originalAccessToken: originalToken || null,
          impersonatedOrgName: orgName,
          impersonatedUserName: userName,
        });

        // Set session active to prevent auto-logout
        sessionStorage.setItem("session_active", "true");

        toast.success(`Active support impersonation started for ${userName}`);
        router.push("/dashboard");
      } catch (err: any) {
        console.error("Impersonation sync failed:", err);
        toast.error("Failed to establish support session.");
        router.push("/login");
      }
    };

    initImpersonation();
  }, [searchParams, router]);

  return (
    <div className="min-h-screen bg-[var(--base)] flex flex-col items-center justify-center space-y-6 text-center p-6 relative overflow-hidden">
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,color-mix(in_srgb,var(--pri)_13%,transparent)_0%,transparent_50%)] animate-pulse" />
        <div className="absolute top-1/4 left-1/4 w-[400px] h-[400px] bg-[var(--pri)] rounded-full blur-[120px] opacity-20" />
      </div>

      <div className="relative z-10 glass-3d rounded-[2rem] p-10 border-default shadow-2xl max-w-sm w-full flex flex-col items-center space-y-6">
        <div className="h-16 w-16 glass-3d rounded-2xl flex items-center justify-center border-orange-500/30 shadow-[0_10px_20px_color-mix(in_srgb,var(--pri)_10%,transparent)]">
          <ShieldAlert className="h-8 w-8 text-orange-500 animate-pulse" />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-black text-[var(--text)] tracking-tight">Support Tunnel</h2>
          <p className="text-[10px] font-black text-muted uppercase tracking-[0.2em] leading-relaxed">
            Securing impersonation workspace...
          </p>
        </div>
        <div className="flex items-center justify-center">
          <Loader2 className="h-6 w-6 text-[var(--pri)] animate-spin" />
        </div>
      </div>
    </div>
  );
}

export default function ImpersonatePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[var(--base)] flex items-center justify-center">
        <Loader2 className="h-10 w-10 text-[var(--pri)] animate-spin" />
      </div>
    }>
      <ImpersonateHandler />
    </Suspense>
  );
}
