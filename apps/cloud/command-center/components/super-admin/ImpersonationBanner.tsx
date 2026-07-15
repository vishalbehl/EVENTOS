"use client";

import { LogOut, ShieldAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { useAuthStore } from "@/store/use-auth-store";

export function ImpersonationBanner() {
  const { originalAccessToken, impersonatedOrgName, impersonatedUserName, stopImpersonation } = useAuthStore();
  const router = useRouter();
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => setHydrated(true), []);

  if (!hydrated || !originalAccessToken) return null;

  const handleStop = () => {
    stopImpersonation();
    router.push("/organizations");
  };

  return (
    <section
      role="status"
      aria-label="Active impersonation session"
      className="relative z-[9999] flex w-full flex-col items-start justify-between gap-2 border-b border-[var(--status-danger)] bg-[var(--status-danger-muted)] px-3 py-2 text-[var(--text-primary)] shadow-lg sm:flex-row sm:items-center sm:px-4"
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <ShieldAlert aria-hidden className="size-4 shrink-0 text-[var(--status-danger)]" />
        <span className="shrink-0 text-[11px] font-black uppercase tracking-wide">Impersonation active</span>
        <span className="hidden truncate text-xs text-[var(--text-secondary)] md:inline">
          Viewing as <strong>{impersonatedUserName || "Unknown user"}</strong> for{" "}
          <strong>{impersonatedOrgName || "Unknown organization"}</strong>
        </span>
      </div>
      <button
        type="button"
        onClick={handleStop}
        className="flex min-h-9 shrink-0 items-center gap-1.5 rounded-md border border-[var(--status-danger)] bg-[var(--bg-surface)] px-3 py-1 text-[11px] font-black uppercase tracking-wider text-[var(--status-danger)] shadow-sm hover:bg-[var(--status-danger-muted)]"
      >
        <LogOut aria-hidden className="size-3" />
        Stop impersonating
      </button>
    </section>
  );
}
