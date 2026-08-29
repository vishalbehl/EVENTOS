"use client";

import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";

export function TitleBar() {
  const [portStatus, setPortStatus] = useState<{
    venue8001: boolean;
  }>({
    venue8001: true,
  });

  useEffect(() => {
    // Ping check for venue server
    const checkPorts = async () => {
      try {
        await apiClient.get("/auth/status");
        setPortStatus({ venue8001: true });
      } catch {
        setPortStatus({ venue8001: false });
      }
    };

    checkPorts();
    const timer = setInterval(checkPorts, 15000);
    return () => clearInterval(timer);
  }, []);

  return (
    <header className="sticky top-0 z-50 flex h-9 w-full select-none items-center justify-between border-b border-[var(--border)] bg-[var(--surf)] px-3 text-xs text-[var(--text)]">
      {/* Left: App Brand & Icon */}
      <div className="flex items-center gap-2">
        <span className="grid size-5 shrink-0 place-items-center">
          <img
            src="/brand/eventos-emblem-metal.png"
            alt="Eventos Logo"
            width={20}
            height={20}
            className="size-full scale-[1.6] object-contain"
            onError={(e) => {
              (e.target as HTMLElement).style.display = "none";
            }}
          />
        </span>
        <span className="font-black tracking-[0.15em] text-[var(--text)] uppercase text-[11px]">
          EVENT<span className="text-[var(--acc)]">OS</span>{" "}
          <span className="font-mono text-[9px] text-[var(--muted)] font-normal uppercase">VENUE CONSOLE</span>
        </span>

        {/* Server status pill */}
        <div className="ml-2 hidden sm:flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--card)] px-2 py-0.5 text-[9px] font-mono">
          <span className={`flex h-1.5 w-1.5 rounded-full ${portStatus.venue8001 ? "bg-emerald-500 animate-pulse" : "bg-red-500"}`} />
          <span className="text-[var(--muted)]">PORT:8001 (EDGE MASTER)</span>
        </div>
      </div>

      {/* Center: Title / Role */}
      <div className="hidden md:flex items-center gap-1.5 text-[var(--muted)] text-[10px] font-mono uppercase">
        <span>Authoritative Local Venue Node</span>
      </div>

      {/* Right placeholder */}
      <div className="flex items-center gap-2 text-[9px] font-mono text-[var(--muted)]">
        <span className="hidden sm:inline">LOCAL OPERATIONS</span>
      </div>
    </header>
  );
}

