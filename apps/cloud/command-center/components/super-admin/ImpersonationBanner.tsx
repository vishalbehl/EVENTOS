"use client";

import { useAuthStore } from "@/store/use-auth-store";
import { useRouter } from "next/navigation";
import { ShieldAlert, LogOut } from "lucide-react";
import { useEffect, useState } from "react";

export function ImpersonationBanner() {
  const { originalAccessToken, impersonatedOrgName, impersonatedUserName, stopImpersonation } = useAuthStore();
  const router = useRouter();
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  if (!hydrated || !originalAccessToken) return null;

  const handleStop = () => {
    stopImpersonation();
    router.push("/super-admin/organizations");
  };

  return (
    <div className="w-full bg-red-600 text-white py-2 px-4 flex items-center justify-between shadow-lg z-[9999] relative border-b border-red-700 animate-in slide-in-from-top duration-300">
      <div className="flex items-center gap-2.5">
        <ShieldAlert className="w-4 h-4 text-white animate-pulse" />
        <span className="text-[12px] font-black tracking-wide uppercase">Active Impersonation Session</span>
        <span className="text-[12px] opacity-90 hidden sm:inline">
          · You are viewing the workspace as owner{" "}
          <strong className="font-bold underline">
            {impersonatedUserName || "Unknown User"}
          </strong>{" "}
          of tenant{" "}
          <strong className="font-bold underline">
            {impersonatedOrgName || "Unknown Org"}
          </strong>
        </span>
      </div>
      <button
        onClick={handleStop}
        className="flex items-center gap-1.5 px-3 py-1 rounded bg-white text-red-700 hover:bg-red-50 text-[11px] font-black uppercase tracking-wider transition-all duration-200 border border-transparent shadow-sm"
      >
        <LogOut className="w-3 h-3" />
        Stop Impersonating
      </button>
    </div>
  );
}
