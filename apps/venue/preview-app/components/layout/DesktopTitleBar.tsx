"use client";

import { useEffect, useState } from "react";
import { Minus, Square, X } from "lucide-react";
import { useAuthStore } from "@/store/use-auth-store";

export function DesktopTitleBar() {
  const [isDesktop, setIsDesktop] = useState(false);
  const { stationNumber } = useAuthStore();

  useEffect(() => {
    if (typeof window !== "undefined" && (window as any).srrDesktop?.isDesktop) {
      setIsDesktop(true);
    }
  }, []);

  if (!isDesktop) return null;

  const handleMinimize = () => {
    (window as any).srrDesktop?.minimizeWindow?.();
  };

  const handleMaximize = () => {
    (window as any).srrDesktop?.maximizeWindow?.();
  };

  const handleClose = () => {
    (window as any).srrDesktop?.closeWindow?.();
  };

  return (
    <div
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
      className="flex h-8 w-full select-none items-center justify-between border-b border-[var(--border)] bg-[#040506] px-3 text-[11px] text-[var(--muted)] shrink-0 z-50"
    >
      {/* Left Branding */}
      <div
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
        className="flex items-center gap-2"
      >
        <div className="flex size-4 items-center justify-center rounded bg-[var(--pri)] text-[var(--primary-contrast)] font-black text-[9px]">
          S
        </div>
        <span className="font-bold uppercase tracking-wider text-[var(--text)]">
          EVENTOS • Speaker Ready Room
        </span>
        <span className="text-[10px] text-[var(--muted)] font-mono">
          (Workstation #{stationNumber ?? "Not configured"})
        </span>
      </div>

      {/* Right Desktop Window Controls */}
      <div
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
        className="flex items-center"
      >
        <button
          type="button"
          onClick={handleMinimize}
          className="flex h-8 w-10 items-center justify-center text-[var(--muted)] hover:bg-[var(--surf)] hover:text-[var(--text)] transition-colors cursor-pointer"
          title="Minimize"
        >
          <Minus className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={handleMaximize}
          className="flex h-8 w-10 items-center justify-center text-[var(--muted)] hover:bg-[var(--surf)] hover:text-[var(--text)] transition-colors cursor-pointer"
          title="Maximize / Restore"
        >
          <Square className="size-3" />
        </button>
        <button
          type="button"
          onClick={handleClose}
          className="flex h-8 w-10 items-center justify-center text-[var(--muted)] hover:bg-red-600 hover:text-white transition-colors cursor-pointer"
          title="Close Window"
        >
          <X className="size-3.5" />
        </button>
      </div>
    </div>
  );
}
