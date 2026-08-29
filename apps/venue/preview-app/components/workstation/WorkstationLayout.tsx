"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  LogOut,
  Monitor,
  Moon,
  Sun,
  Wifi,
  WifiOff,
  Settings,
  ChevronDown,
} from "lucide-react";
import { useAuthStore } from "@/store/use-auth-store";
import { useTheme } from "@/hooks/useTheme";
import { useWebSocket } from "@/hooks/useWebSocket";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";

export function WorkstationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { stationNumber, logout } = useAuthStore();
  const { theme, setTheme } = useTheme();
  const { isConnected } = useWebSocket();
  const [mounted, setMounted] = useState(false);
  const [time, setTime] = useState<Date | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setMounted(true);
    setTime(new Date());
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const handleExit = () => {
    logout();
    router.push("/");
  };

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-[var(--base)] text-[var(--text)] select-none font-sans transition-colors flex flex-col">
      {/* Background Ambient Radial Glows */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_18%,rgba(6,182,212,0.08),transparent_38%),radial-gradient(circle_at_12%_15%,rgba(255,255,255,0.03),transparent_30%)]" />

      {/* Top Kiosk Header Bar (Fixed 80px) */}
      <header className="relative z-20 flex h-20 items-center justify-between border-b border-[var(--border)] bg-[var(--card)]/90 px-6 lg:px-10 shadow-sm backdrop-blur-md shrink-0">
        {/* Left: Brand Logo & Title */}
        <div className="flex items-center gap-3.5">
          <span className="grid size-11 shrink-0 place-items-center overflow-visible">
            <img
              src="/brand/eventos-emblem-metal.png"
              alt="Eventos Logo"
              width={44}
              height={44}
              className="size-full scale-[2.05] object-contain"
              onError={(e) => {
                (e.target as HTMLElement).style.display = "none";
              }}
            />
          </span>
          <div>
            <p className="text-base font-black uppercase tracking-[0.32em] text-[var(--text)] leading-tight">
              EVENT<span className="text-[var(--acc)]">OS</span>
            </p>
            <p className="text-[10px] font-bold uppercase tracking-[0.26em] text-[var(--muted)] mt-0.5">
              Speaker Ready Room
            </p>
          </div>
        </div>

        {/* Center: Live Workstation Identification */}
        <div className="hidden md:flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surf)] px-4 py-2 text-xs font-black uppercase tracking-wider text-[var(--text)] shadow-xs">
            <Monitor className="size-4 text-[var(--pri)]" />
            <span>Workstation #{stationNumber || 1}</span>
          </div>
        </div>

        {/* Right Controls: IST Clock, Theme Toggler & Kiosk Menu */}
        <div className="flex items-center gap-3">
          {/* Live Date & Time Clock */}
          <div className="hidden sm:flex items-center gap-2.5 rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 py-2 text-xs font-semibold text-[var(--text)] shadow-xs">
            <CalendarDays className="size-4 text-[var(--pri)]" />
            <span suppressHydrationWarning>
              {mounted && time
                ? time.toLocaleDateString("en-IN", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })
                : "Today"}
            </span>
            <span className="h-3.5 w-px bg-[var(--border)]" />
            <span className="font-mono font-bold" suppressHydrationWarning>
              {mounted && time
                ? time.toLocaleTimeString("en-IN", {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                    hour12: true,
                  })
                : "--:--:--"}
            </span>
          </div>

          {/* WebSocket / Network Status */}
          <div
            className={cn(
              "flex h-9 items-center gap-2 rounded-xl border px-3 text-xs font-bold transition-all",
              isConnected
                ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                : "border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400"
            )}
          >
            {isConnected ? (
              <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
            ) : (
              <WifiOff className="size-3.5" />
            )}
            <span className="hidden lg:inline">{isConnected ? "Venue Live" : "Offline"}</span>
          </div>

          {/* Theme Toggler */}
          <button
            type="button"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="flex size-9 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--card)] text-[var(--text)] hover:bg-[var(--raised)] transition-colors shadow-xs cursor-pointer"
          >
            {theme === "dark" ? (
              <Sun className="size-4 text-amber-400" />
            ) : (
              <Moon className="size-4 text-indigo-500" />
            )}
          </button>

          {/* Workstation Operator Menu */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen(!menuOpen)}
              className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-xs font-black uppercase tracking-wider text-[var(--text)] hover:bg-[var(--raised)] shadow-xs cursor-pointer"
            >
              <span>WS #{stationNumber || 1}</span>
              <ChevronDown className="size-3.5 text-[var(--muted)]" />
            </button>

            <AnimatePresence>
              {menuOpen && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: 4 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 4 }}
                  className="absolute right-0 mt-2 w-48 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-2 shadow-2xl z-50 space-y-1"
                >
                  <Link
                    href="/"
                    onClick={() => setMenuOpen(false)}
                    className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-bold text-[var(--text)] hover:bg-[var(--raised)]"
                  >
                    <Settings className="size-4 text-[var(--muted)]" /> Switch Mode
                  </Link>
                  <button
                    type="button"
                    onClick={handleExit}
                    className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-bold text-red-500 hover:bg-red-500/10 cursor-pointer"
                  >
                    <LogOut className="size-4" /> Exit Station
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </header>

      {/* Main Workstation Screen Content: Fixed Height with Overflow Hidden */}
      <div className="flex-1 overflow-hidden">
        {children}
      </div>
    </main>
  );
}
