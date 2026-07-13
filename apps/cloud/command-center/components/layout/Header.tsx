"use client";

import { motion } from "framer-motion";
import {
  Bell, User, Settings, HelpCircle, LogOut,
  Palette, Menu
} from "lucide-react";
import { cn, getTimezoneAbbrev } from "@/lib/utils";
import { useState, useEffect, useRef } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useAuthStore } from "@/store/use-auth-store";
import { useUIStore } from "@/store/useUIStore";
import { useWebSocket } from "@/hooks/useWebSocket";
import Link from "next/link";
import { AnimatePresence } from "framer-motion";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";

export function Header() {
  const [time, setTime] = useState<Date | null>(null);
  const [timezone, setTimezone] = useState("Asia/Kolkata");
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isThemeMenuOpen, setIsThemeMenuOpen] = useState(false);
  const { theme, setTheme, themes } = useTheme();
  const { user, logout } = useAuthStore();
  const setMobileSidebarOpen = useUIStore((state) => state.setMobileSidebarOpen);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const themeMenuRef = useRef<HTMLDivElement>(null);

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
      if (themeMenuRef.current && !themeMenuRef.current.contains(event.target as Node)) {
        setIsThemeMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <header className="sticky top-0 z-30 flex h-16 w-full items-center gap-3 border-b border-[var(--border-subtle)] bg-[color-mix(in_srgb,var(--base)_88%,transparent)] px-3 backdrop-blur-xl sm:px-4 md:gap-6 md:px-6">
      {/* Breadcrumbs */}
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <button
          type="button"
          aria-label="Open navigation"
          onClick={() => setMobileSidebarOpen(true)}
          className="grid size-9 shrink-0 place-items-center rounded-md border border-[var(--border)] bg-[var(--card)] text-[var(--text-secondary)] md:hidden"
        >
          <Menu aria-hidden className="size-4" />
        </button>
        <Breadcrumbs />
      </div>

      {/* Control Station */}
      <div className="flex items-center gap-4 justify-end flex-1">
        {/* System Clock */}
        <div className="hidden xl:flex flex-col items-end pr-4 border-r border-default">
          <p className="text-[12px] font-black text-[var(--text)] tracking-tighter tabular-nums leading-none mb-0.5">
            {time ? time.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true, timeZone: timezone }) : "--:--:-- --"}
          </p>
          <p className="text-[8px] font-black text-[var(--muted)] uppercase tracking-[0.2em]">{time ? time.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: timezone }).toUpperCase() : ""}</p>
        </div>

        <div className="flex items-center gap-2">
          <Link aria-label="Notifications" href="/notifications" className="relative flex h-9 w-9 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--card)] text-muted transition-all hover:border-[var(--text)] hover:text-[var(--text)]">
              <Bell aria-hidden className="h-4.5 w-4.5" />
              <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full border border-[var(--surf)] bg-[var(--dan)]" />
          </Link>

          <div className="relative" ref={themeMenuRef}>
            <button
              type="button"
              aria-label="Choose theme"
              aria-expanded={isThemeMenuOpen}
              onClick={() => setIsThemeMenuOpen(!isThemeMenuOpen)}
              className="flex h-9 w-9 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--card)] text-muted transition-all hover:border-[var(--text)] hover:text-[var(--text)]"
            >
              <Palette className="h-4.5 w-4.5" />
            </button>
            <AnimatePresence>
              {isThemeMenuOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 8, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.95 }}
                  className="absolute right-0 z-50 mt-2.5 w-48 rounded-xl border border-[var(--border)] bg-[var(--card)] p-2.5"
                >
                  <p className="text-[9px] font-black text-muted uppercase tracking-widest mb-2 px-1">Select Theme</p>
                  <div className="grid grid-cols-2 gap-2">
                    {themes.map(t => (
                      <button
                        key={t.name}
                        onClick={() => { setTheme(t.name); setIsThemeMenuOpen(false); }}
                        className={cn(
                          "h-8 flex items-center justify-center gap-1.5 px-2.5 rounded-lg border text-[11px] font-bold transition-all",
                          theme === t.name 
                            ? "bg-[var(--pri)] text-[var(--primary-foreground)] border-[var(--pri)]" 
                            : "border-default text-muted hover:text-[var(--text)] hover:border-muted"
                        )}
                        title={t.label}
                      >
                        <div 
                          className="h-3 w-3 rounded-full border border-black/10 shrink-0"
                          style={{
                            background: t.name === 'plasma-violet' ? '#000000' : '#FFFFFF'
                          }}
                        />
                        <span>{t.label}</span>
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <Link aria-label="Documentation" href="/docs" className="hidden h-9 w-9 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--card)] text-muted transition-all hover:border-[var(--text)] hover:text-[var(--text)] sm:flex">
            <HelpCircle aria-hidden className="h-4.5 w-4.5" />
          </Link>
        </div>

        <div className="flex items-center gap-3 pl-4 border-l border-default relative" ref={userMenuRef}>
          <button
            type="button"
            aria-label="Open account menu"
            aria-expanded={isUserMenuOpen}
            onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
            className="flex items-center gap-2.5 cursor-pointer group"
          >
            <div className="text-right hidden sm:block">
              <p className="text-[11px] font-black text-[var(--text)] leading-none mb-0.5 uppercase tracking-tight">
                {user?.full_name || user?.first_name || 'Account'}
              </p>
              <p className="text-[8px] font-black text-[var(--muted)] uppercase tracking-[0.2em] opacity-70">
                Super Admin
              </p>
            </div>
            <div
              className="relative flex h-9 w-9 items-center justify-center overflow-hidden rounded-md border border-[var(--border)] bg-[var(--card)] text-[11px] font-black text-[var(--text)] transition-transform hover:scale-105"
            >
              {user?.avatar_url ? (
                <img src={user.avatar_url} alt="User" className="h-full w-full object-cover" />
              ) : (
                <img 
                  src={`https://api.dicebear.com/7.x/lorelei/svg?seed=${user?.email || 'default'}`} 
                  alt="Avatar" 
                  className="h-full w-full object-cover" 
                />
              )}
            </div>
          </button>

          <AnimatePresence>
            {isUserMenuOpen && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                className="absolute right-0 top-full z-50 mt-3 w-64 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4"
              >
                <div className="px-2 py-3 border-b border-default mb-2">
                  <p className="text-[14px] font-black text-[var(--text)] truncate">
                    {user?.full_name || (user?.first_name ? `${user.first_name} ${user.last_name || ''}` : user?.email)}
                  </p>
                  <p className="text-[10px] font-black text-muted uppercase tracking-widest mt-1">ID: {user?.id?.slice(0, 8)}</p>
                </div>
                <div className="space-y-1">
                  <Link href="/settings?tab=profile">
                    <button className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-[12px] font-bold text-muted transition-all hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text)]">
                      <User className="h-4 w-4" /> View Profile
                    </button>
                  </Link>
                  <Link href="/settings">
                    <button className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-[12px] font-bold text-muted transition-all hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text)]">
                      <Settings className="h-4 w-4" /> Global Settings
                    </button>
                  </Link>
                  <div className="h-px bg-default my-2" />
                  <button 
                    onClick={() => {
                      setIsUserMenuOpen(false);
                      logout();
                    }}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-[12px] font-bold text-[var(--dan)] transition-all hover:bg-[var(--dan)]/10"
                  >
                    <LogOut className="h-4 w-4" /> Sign Out
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
