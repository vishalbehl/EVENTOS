"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/use-auth-store";
import { Loader2 } from "lucide-react";

export default function TrafficDirectorPage() {
  const router = useRouter();
  const { isAuthenticated, accessToken, user } = useAuthStore();

  useEffect(() => {
    // We add a tiny delay to ensure Zustand store is hydrated
    const timer = setTimeout(() => {
      if (isAuthenticated && accessToken) {
        router.replace("/dashboard");
      } else {
        router.replace("/login");
      }
    }, 100);

    return () => clearTimeout(timer);
  }, [isAuthenticated, accessToken, user, router]);

  return (
    <div className="min-h-screen bg-[#07070a] flex flex-col items-center justify-center relative overflow-hidden">
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,color-mix(in_srgb,var(--pri)_10%,transparent)_0%,transparent_50%)] animate-pulse" />
      </div>
      <div className="relative z-10 flex flex-col items-center gap-4">
        <Loader2 className="h-10 w-10 text-[var(--pri)] animate-spin" />
        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-muted">
          Establishing Secure Handshake...
        </p>
      </div>
    </div>
  );
}
