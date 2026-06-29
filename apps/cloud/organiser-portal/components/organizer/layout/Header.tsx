"use client";

import { usePathname, useParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bell, User, ChevronRight,
  Settings, LogOut, Sun, Moon,
  HelpCircle, Box, Wifi, WifiOff
} from "lucide-react";
import { cn, getTimezoneAbbrev } from "@/lib/utils";
import { useState, useEffect, useRef } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useAuthStore } from "@/store/use-auth-store";
import { useUIStore } from "@/store/useUIStore";
import { useWebSocket } from "@/hooks/useWebSocket";
import Link from "next/link";

export function Header() {
  const pathname = usePathname();
  const { eventId } = useParams();
  const [time, setTime] = useState<Date | null>(null);
  const [timezone, setTimezone] = useState("Asia/Kolkata");
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const { toggleTheme, isDark } = useTheme();
  const { user, logout } = useAuthStore();
  const { isSidebarCollapsed } = useUIStore();
  const userMenuRef = useRef<HTMLDivElement>(null);

  const { isConnected } = useWebSocket(eventId as string);

  useEffect(() => {
    setTime(new Date());
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const handleTzChange = () => {
        setTimezone(localStorage.getItem("system-timezone") || "Asia/Kolkata");
      };
      handleTzChange();
      window.addEventListener("system-timezone-changed", handleTzChange);
      return () => window.removeEventListener("system-timezone-changed", handleTzChange);
    }
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setIsUserMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Build breadcrumbs
  const paths = pathname.split("/").filter(Boolean);
  const breadcrumbs: { label: string; href: string }[] = [];
  paths.forEach((path, i) => {
    if (path === eventId) return;
    const href = "/" + paths.slice(0, i + 1).join("/");
    const label = path.replace(/-/g, " ");
    breadcrumbs.push({ label, href });
  });

  return (
    <header
      className="sticky top-0 z-30 w-full flex items-center px-6 gap-6"
      style={{
        height: "64px",
        background: "var(--color-surface-2)",
        backdropFilter: "blur(20px) saturate(180%)",
        WebkitBackdropFilter: "blur(20px) saturate(180%)",
        borderBottom: "1px solid var(--color-border)",
        boxShadow: "0 1px 0 var(--color-border-subtle), 0 4px 16px color-mix(in srgb, var(--color-bg) 50%, transparent)",
      }}
    >
      {/* ── Breadcrumbs ── */}
      <div className="flex items-center gap-3 min-w-0 flex-1">
        {/* Page icon */}
        <div
          className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0"
          style={{
            background: "var(--color-surface-3)",
            border: "1px solid var(--color-border)",
          }}
        >
          <Box className="h-4 w-4" style={{ color: "var(--color-primary-end)" }} />
        </div>

        {/* Breadcrumb trail */}
        <div className="flex items-center gap-1.5 overflow-hidden">
          {breadcrumbs.map((crumb, i) => (
            <div key={i} className="flex items-center gap-1.5 whitespace-nowrap">
              <ChevronRight className="h-3 w-3 shrink-0" style={{ color: "var(--color-text-muted)" }} />
              <Link
                href={crumb.href}
                className={cn(
                  "text-[11px] font-semibold uppercase tracking-widest transition-colors duration-150",
                  i === breadcrumbs.length - 1
                    ? "text-[var(--color-text-primary)]"
                    : "text-[var(--color-text-muted)] hover:text-[var(--color-primary-end)]"
                )}
              >
                {crumb.label}
              </Link>
            </div>
          ))}
        </div>
      </div>

      {/* ── Right Controls ── */}
      <div className="flex items-center gap-3">

        {/* System Clock */}
        <div
          className="hidden xl:flex flex-col items-end pr-4"
          style={{ borderRight: "1px solid var(--color-border)" }}
        >
          <p
            className="text-[13px] font-bold tracking-tight font-tabular leading-none mb-0.5"
            style={{ color: "var(--color-text-primary)", fontVariantNumeric: "tabular-nums" }}
          >
            {time
              ? time.toLocaleTimeString("en-IN", {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                  hour12: true,
                  timeZone: timezone,
                })
              : "--:--:-- --"}
          </p>
          <p
            className="text-[9px] font-bold uppercase tracking-[0.18em]"
            style={{ color: "var(--color-primary-mid)" }}
          >
            {timezone.split("/").pop()?.replace(/_/g, " ") || timezone} ({getTimezoneAbbrev(timezone, time || new Date())})
          </p>
        </div>

        {/* Live Sync badge */}
        {eventId && (
          <div
            className={cn(
              "flex items-center gap-2 px-3 h-8 rounded-lg transition-all cursor-default select-none"
            )}
            style={{
              background: "var(--color-surface-3)",
              border: `1px solid ${isConnected ? "rgba(16, 185, 129, 0.25)" : "rgba(245, 158, 11, 0.25)"}`,
            }}
            title={isConnected ? "Real-time sync active" : "Attempting to reconnect..."}
          >
            <span
              className="h-2 w-2 rounded-full relative shrink-0"
              style={{
                background: isConnected ? "var(--color-accent-green)" : "var(--color-accent-amber)",
                boxShadow: isConnected
                  ? "0 0 8px rgba(16, 185, 129, 0.7)"
                  : "0 0 8px rgba(245, 158, 11, 0.7)",
              }}
            >
              {isConnected && (
                <span
                  className="absolute inset-0 rounded-full animate-ping"
                  style={{ background: "var(--color-accent-green)", opacity: 0.6 }}
                />
              )}
            </span>
            <span
              className="text-[10px] font-bold uppercase tracking-widest hidden sm:inline"
              style={{ color: isConnected ? "var(--color-accent-green)" : "var(--color-accent-amber)" }}
            >
              {isConnected ? "Live" : "Offline"}
            </span>
          </div>
        )}

        {/* Notifications */}
        <Link href={eventId ? `/events/${eventId}/speaker/notifications` : "/notifications"}>
          <button
            className="h-9 w-9 rounded-lg flex items-center justify-center relative transition-all"
            style={{
              background: "var(--color-surface-3)",
              border: "1px solid var(--color-border)",
              color: "var(--color-text-muted)",
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.color = "var(--color-text-primary)";
              (e.currentTarget as HTMLElement).style.borderColor = "var(--color-primary-end)";
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.color = "var(--color-text-muted)";
              (e.currentTarget as HTMLElement).style.borderColor = "var(--color-border)";
            }}
          >
            <Bell className="h-4 w-4" />
            {/* Notification dot */}
            <span
              className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full pulse-glow-red"
              style={{ background: "var(--color-danger)", border: "2px solid var(--color-surface-1)" }}
            />
          </button>
        </Link>

        {/* Docs */}
        <Link href="/docs">
          <button
            className="h-9 w-9 rounded-lg flex items-center justify-center transition-all"
            style={{
              background: "var(--color-surface-3)",
              border: "1px solid var(--color-border)",
              color: "var(--color-text-muted)",
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.color = "var(--color-text-primary)";
              (e.currentTarget as HTMLElement).style.borderColor = "var(--color-border)";
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.color = "var(--color-text-muted)";
              (e.currentTarget as HTMLElement).style.borderColor = "var(--color-border)";
            }}
          >
            <HelpCircle className="h-4 w-4" />
          </button>
        </Link>

        {/* Dark / Light toggle */}
        <motion.button
          whileHover={{ scale: 1.06 }}
          whileTap={{ scale: 0.92 }}
          onClick={toggleTheme}
          className="h-9 w-9 rounded-lg flex items-center justify-center transition-all"
          style={{
            background: "var(--color-surface-3)",
            border: "1px solid var(--color-border)",
          }}
          title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
        >
          {isDark
            ? <Sun className="h-4 w-4" style={{ color: "var(--color-accent-amber)" }} />
            : <Moon className="h-4 w-4" style={{ color: "var(--color-primary-mid)" }} />
          }
        </motion.button>

        {/* ── User Avatar + Menu ── */}
        <div
          className="flex items-center gap-3 pl-3 relative"
          style={{ borderLeft: "1px solid var(--color-border)" }}
          ref={userMenuRef}
        >
          <div
            onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
            className="flex items-center gap-2.5 cursor-pointer group"
          >
            {/* Name & role */}
            <div className="text-right hidden sm:block">
              <p
                className="text-[12px] font-bold leading-none mb-0.5 tracking-tight"
                style={{ color: "var(--color-text-primary)" }}
              >
                {user?.full_name || user?.first_name || "Account"}
              </p>
              <p
                className="text-[9px] font-bold uppercase tracking-[0.2em]"
                style={{ color: "var(--color-primary-mid)", opacity: 0.8 }}
              >
                {user?.role?.replace(/_/g, " ") || "Member"}
              </p>
            </div>

            {/* Avatar */}
            <div
              className="h-9 w-9 rounded-lg flex items-center justify-center text-[12px] font-bold text-white overflow-hidden relative transition-all group-hover:scale-105"
              style={{ background: "linear-gradient(135deg, var(--color-primary-start), var(--color-primary-end))" }}
            >
              {user?.avatar_url ? (
                <img src={user.avatar_url} alt="User" className="h-full w-full object-cover" />
              ) : (
                <img
                  src={`https://api.dicebear.com/7.x/lorelei/svg?seed=${user?.email || "default"}`}
                  alt="Avatar"
                  className="h-full w-full object-cover"
                  onError={(e) => {
                    const el = e.currentTarget as HTMLImageElement;
                    el.style.display = "none";
                    (el.parentElement as HTMLElement).textContent =
                      (user?.full_name?.split(" ").map((n: string) => n[0]).join("") || user?.email?.[0] || "U").toUpperCase().slice(0, 2);
                  }}
                />
              )}
              {/* Online indicator */}
              <span
                className="absolute bottom-0.5 right-0.5 h-2 w-2 rounded-full"
                style={{
                  background: "var(--color-accent-green)",
                  border: "1.5px solid var(--color-surface-1)",
                  boxShadow: "0 0 6px rgba(16, 185, 129, 0.7)",
                }}
              />
            </div>
          </div>

          {/* ── User Dropdown Menu ── */}
          <AnimatePresence>
            {isUserMenuOpen && (
              <motion.div
                initial={{ opacity: 0, y: 8, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.96 }}
                transition={{ duration: 0.18, ease: [0.34, 1.56, 0.64, 1] }}
                className="absolute right-0 top-full mt-3 w-64 rounded-xl p-1 z-50"
                style={{
                  background: "var(--color-surface-1)",
                  border: "1px solid var(--color-border)",
                  boxShadow: "var(--shadow-dropdown)",
                  backdropFilter: "blur(16px)",
                }}
              >
                {/* User info header */}
                <div
                  className="px-3 py-3 mb-1 rounded-lg"
                  style={{ background: "var(--color-surface-3)" }}
                >
                  <div className="flex items-center gap-2.5">
                    <div
                      className="h-9 w-9 rounded-lg flex items-center justify-center text-[12px] font-bold text-white overflow-hidden shrink-0"
                      style={{ background: "linear-gradient(135deg, var(--color-primary-start), var(--color-primary-end))" }}
                    >
                      {user?.avatar_url ? (
                        <img src={user.avatar_url} alt="User" className="h-full w-full object-cover" />
                      ) : (
                        <img
                          src={`https://api.dicebear.com/7.x/lorelei/svg?seed=${user?.email || "default"}`}
                          alt="Avatar"
                          className="h-full w-full object-cover"
                        />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-[13px] font-bold truncate" style={{ color: "var(--color-text-primary)" }}>
                        {user?.full_name || `${user?.first_name || ""} ${user?.last_name || ""}`.trim() || user?.email}
                      </p>
                      <p className="text-[10px] font-semibold uppercase tracking-widest mt-0.5" style={{ color: "var(--color-text-muted)" }}>
                        {user?.role?.replace(/_/g, " ") || "Member"}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Menu items */}
                <div className="space-y-0.5 px-1 pb-1">
                  <Link href="/settings?tab=profile">
                    <button
                      onClick={() => setIsUserMenuOpen(false)}
                      className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg transition-all text-[12px] font-medium"
                      style={{ color: "var(--color-text-muted)" }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "var(--color-surface-3)"; (e.currentTarget as HTMLElement).style.color = "var(--color-text-primary)"; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = ""; (e.currentTarget as HTMLElement).style.color = "var(--color-text-muted)"; }}
                    >
                      <User className="h-4 w-4 shrink-0" />
                      View Profile
                    </button>
                  </Link>
                  <Link href="/settings">
                    <button
                      onClick={() => setIsUserMenuOpen(false)}
                      className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg transition-all text-[12px] font-medium"
                      style={{ color: "var(--color-text-muted)" }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "var(--color-surface-3)"; (e.currentTarget as HTMLElement).style.color = "var(--color-text-primary)"; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = ""; (e.currentTarget as HTMLElement).style.color = "var(--color-text-muted)"; }}
                    >
                      <Settings className="h-4 w-4 shrink-0" />
                      Global Settings
                    </button>
                  </Link>

                  <div className="h-px my-1" style={{ background: "var(--color-border)" }} />

                  <button
                    onClick={() => { setIsUserMenuOpen(false); logout(); }}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg transition-all text-[12px] font-semibold"
                    style={{ color: "var(--color-danger)" }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "var(--color-danger-muted)"; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = ""; }}
                  >
                    <LogOut className="h-4 w-4 shrink-0" />
                    Sign Out
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
