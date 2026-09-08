"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import {
  Bell,
  ChevronRight,
  Clock,
  LogOut,
  Moon,
  Monitor,
  ScanLine,
  Settings,
  ShieldCheck,
  Sun,
  User,
  Wifi,
  WifiOff,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/hooks/useTheme";
import { useAuthStore } from "@/store/use-auth-store";
import { useWebSocket } from "@/hooks/useWebSocket";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";

export function Header({
  title = "PREVIEW ROOM",
  subtitle = "Presentation Check",
}: {
  title?: string;
  subtitle?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [time, setTime] = useState(new Date());
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const { theme, setTheme } = useTheme();
  const { user, mode, stationNumber, logout } = useAuthStore();
  const { isConnected } = useWebSocket();
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        userMenuRef.current &&
        !userMenuRef.current.contains(event.target as Node)
      ) {
        setIsUserMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <header className="sticky top-0 z-30 flex h-[72px] w-full items-center justify-between border-b border-[var(--border)] bg-[var(--card)] px-6 shadow-sm">
      {/* Left: Brand / Title */}
      <div className="flex items-center gap-4">
        <div className="flex size-10 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surf)] shadow-sm">
          <Monitor className="size-5 text-[var(--pri)]" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-black uppercase tracking-[0.2em] text-[var(--pri)]">
              {title}
            </span>
            <span className="text-xs text-[var(--muted)]">•</span>
            <span className="text-xs font-bold text-[var(--muted)]">
              {subtitle}
            </span>
          </div>
          <p className="text-[10px] font-semibold text-[var(--muted)]">
            {mode === "workstation"
              ? `Workstation #${stationNumber ?? "Not configured"} (Local Edge Station)`
              : mode === "scanning"
              ? "Entrance Intake & Allocation Kiosk"
              : "Technician Fleet Command Console"}
          </p>
        </div>
      </div>

      {/* Right: Telemetry & Controls */}
      <div className="flex items-center gap-4">
        {/* System Clock */}
        <div className="hidden flex-col items-end border-r border-[var(--border)] pr-4 sm:flex">
          <p className="font-mono text-xs font-black tracking-tight text-[var(--text)] tabular-nums">
            {time.toLocaleTimeString("en-IN", {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
              hour12: true,
              timeZone: "Asia/Kolkata",
            })}
          </p>
          <p className="text-[8px] font-black uppercase tracking-widest text-[var(--muted)]">
            IST
          </p>
        </div>

        {/* Live WebSocket Status */}
        <div
          className={cn(
            "flex h-9 items-center gap-2 rounded-xl border px-3 text-xs font-bold transition-all",
            isConnected
              ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
              : "border-amber-500/20 bg-amber-500/10 text-amber-400"
          )}
          title={isConnected ? "Connected to Venue Server" : "Reconnecting..."}
        >
          {isConnected ? (
            <>
              <span className="relative flex size-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex size-2 rounded-full bg-emerald-500"></span>
              </span>
              <span className="hidden md:inline">Venue Online</span>
            </>
          ) : (
            <>
              <WifiOff className="size-3.5" />
              <span className="hidden md:inline">Offline Sync</span>
            </>
          )}
        </div>

        {/* Theme Toggle */}
        <button
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="flex size-9 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surf)] text-[var(--text)] hover:bg-[var(--raised)]"
          title="Toggle Theme"
        >
          {theme === "dark" ? (
            <Sun className="size-4 text-amber-400" />
          ) : (
            <Moon className="size-4 text-[var(--pri)]" />
          )}
        </button>

        {/* User Profile Menu */}
        <div className="relative" ref={userMenuRef}>
          <button
            onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
            className="flex items-center gap-2.5 rounded-xl border border-[var(--border)] bg-[var(--surf)] p-1.5 pr-3 text-left hover:bg-[var(--raised)]"
          >
            <div className="flex size-7 items-center justify-center rounded-lg bg-[var(--pri)] text-xs font-black text-[var(--primary-contrast)]">
              {user?.name?.[0] || "O"}
            </div>
            <div className="hidden text-left sm:block">
              <p className="text-xs font-black leading-none text-[var(--text)]">
                {user?.name || "Operator"}
              </p>
              <p className="text-[9px] font-bold uppercase tracking-wider text-[var(--muted)]">
                {user?.role || "Staff"}
              </p>
            </div>
          </button>

          <AnimatePresence>
            {isUserMenuOpen && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 5 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 5 }}
                className="absolute right-0 mt-2 w-52 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-2 shadow-2xl z-50"
              >
                <div className="border-b border-[var(--border)] px-3 py-2">
                  <p className="text-xs font-black">{user?.name}</p>
                  <p className="text-[10px] text-[var(--muted)] truncate">
                    {user?.username}
                  </p>
                </div>
                <div className="space-y-1 py-1">
                  <Link
                    href="/"
                    onClick={() => setIsUserMenuOpen(false)}
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-bold text-[var(--text)] hover:bg-[var(--raised)]"
                  >
                    <Settings className="size-4 text-[var(--muted)]" /> Switch Mode
                  </Link>
                  <button
                    onClick={() => {
                      logout();
                      router.push("/");
                    }}
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-bold text-red-400 hover:bg-red-500/10"
                  >
                    <LogOut className="size-4" /> Sign Out
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  );
}
