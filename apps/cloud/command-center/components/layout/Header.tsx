"use client";

import { usePathname, useParams } from "next/navigation";
import { motion } from "framer-motion";
import {
  Bell, User, ChevronRight,
  Settings, HelpCircle, LogOut, Clock,
  Zap, Palette, ShieldCheck, Box, PanelLeft, Wifi, WifiOff
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn, getTimezoneAbbrev } from "@/lib/utils";
import { useState, useEffect, useRef } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useAuthStore } from "@/store/use-auth-store";
import { useUIStore } from "@/store/useUIStore";
import { useWebSocket } from "@/hooks/useWebSocket";
import Link from "next/link";
import { AnimatePresence } from "framer-motion";

export function Header() {
  const pathname = usePathname();
  const [time, setTime] = useState<Date | null>(null);
  const [timezone, setTimezone] = useState("Asia/Kolkata");
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isThemeMenuOpen, setIsThemeMenuOpen] = useState(false);
  const { theme, setTheme, themes } = useTheme();
  const { user, logout } = useAuthStore();
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

  // Simple breadcrumb logic
  const paths = pathname.split("/").filter(Boolean);
  const breadcrumbs: { label: string; href: string }[] = [];
  paths.forEach((path, i) => {
    const href = "/" + paths.slice(0, i + 1).join("/");
    const label = path.replace(/-/g, " ");
    breadcrumbs.push({ label, href });
  });

  return (
    <header className="sticky top-0 z-30 w-full h-16 flex items-center px-6 gap-6 glass-3d border-t-0 border-x-0 rounded-none bg-[var(--base)]/40">
      {/* Breadcrumbs */}
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className="h-8 w-8 glass-3d border-default rounded-lg flex items-center justify-center shrink-0">
          <ShieldCheck className="h-4 w-4 text-[var(--pri)]" />
        </div>
        <div className="flex items-center gap-1.5 overflow-hidden">
          {breadcrumbs.map((crumb, i) => (
            <div key={i} className="flex items-center gap-1.5 whitespace-nowrap">
              <ChevronRight className="h-3.5 w-3.5 text-muted" />
              <Link
                href={crumb.href}
                className={cn(
                  "text-[10px] font-black uppercase tracking-widest transition-colors",
                  i === breadcrumbs.length - 1 ? "text-[var(--text)]" : "text-muted hover:text-[var(--pri)] cursor-pointer"
                )}
              >
                {crumb.label}
              </Link>
            </div>
          ))}
        </div>
      </div>

      {/* Control Station */}
      <div className="flex items-center gap-4 justify-end flex-1">
        {/* System Clock */}
        <div className="hidden xl:flex flex-col items-end pr-4 border-r border-default">
          <p className="text-[12px] font-black text-[var(--text)] tracking-tighter tabular-nums leading-none mb-0.5">
            {time ? time.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true, timeZone: timezone }) : "--:--:-- --"}
          </p>
          <p className="text-[8px] font-black text-[var(--pri)] uppercase tracking-[0.2em]">{time ? time.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: timezone }).toUpperCase() : ""}</p>
        </div>

        <div className="flex items-center gap-2">
          <Link href="/notifications">
            <button className="h-9 w-9 rounded-lg glass-3d border-default flex items-center justify-center text-muted hover:text-[var(--sec)] hover:border-[var(--sec)]/30 transition-all relative group">
              <Bell className="h-4.5 w-4.5" />
              <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 bg-[var(--dan)] rounded-full border border-[var(--surf)] pulse-glow-red" />
            </button>
          </Link>

          <div className="relative" ref={themeMenuRef}>
            <button
              onClick={() => setIsThemeMenuOpen(!isThemeMenuOpen)}
              className="h-9 w-9 rounded-lg glass-3d border-default flex items-center justify-center text-muted hover:text-[var(--pri)] hover:border-[var(--pri)]/30 transition-all"
            >
              <Palette className="h-4.5 w-4.5" />
            </button>
            <AnimatePresence>
              {isThemeMenuOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 8, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.95 }}
                  className="absolute right-0 mt-2.5 w-48 glass-3d border-default rounded-2xl p-2.5 z-50 shadow-2xl"
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
                            ? "bg-[var(--pri)]/10 text-[var(--pri)] border-[var(--pri)]/30 scale-105" 
                            : "border-default text-muted hover:text-[var(--text)] hover:border-muted"
                        )}
                        title={t.label}
                      >
                        <div 
                          className="h-3 w-3 rounded-full border border-black/10 shrink-0"
                          style={{
                            background: t.name === 'plasma-violet' ? '#8B5CF6' : '#FFFFFF'
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

          <Link href="/docs">
            <button className="h-9 w-9 rounded-lg glass-3d border-default flex items-center justify-center text-muted hover:text-[var(--text)] hover:border-default transition-all">
              <HelpCircle className="h-4.5 w-4.5" />
            </button>
          </Link>
        </div>

        <div className="flex items-center gap-3 pl-4 border-l border-default relative" ref={userMenuRef}>
          <div 
            onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
            className="flex items-center gap-2.5 cursor-pointer group"
          >
            <div className="text-right hidden sm:block">
              <p className="text-[11px] font-black text-[var(--text)] leading-none mb-0.5 uppercase tracking-tight">
                {user?.full_name || user?.first_name || 'Account'}
              </p>
              <p className="text-[8px] font-black text-[var(--pri)] uppercase tracking-[0.2em] opacity-70">
                Super Admin
              </p>
            </div>
            <div
              className="h-9 w-9 rounded-lg bg-gradient-to-br from-[var(--pri)]/20 to-[var(--sec)]/20 border border-default flex items-center justify-center text-[11px] font-black text-[var(--text)] shadow-lg hover:scale-105 transition-transform overflow-hidden relative"
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
          </div>

          <AnimatePresence>
            {isUserMenuOpen && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                className="absolute right-0 top-full mt-3 w-64 glass-3d border-default rounded-[1.5rem] p-4 z-50 shadow-2xl"
              >
                <div className="px-2 py-3 border-b border-default mb-2">
                  <p className="text-[14px] font-black text-[var(--text)] truncate">
                    {user?.full_name || (user?.first_name ? `${user.first_name} ${user.last_name || ''}` : user?.email)}
                  </p>
                  <p className="text-[10px] font-black text-muted uppercase tracking-widest mt-1">ID: {user?.id?.slice(0, 8)}</p>
                </div>
                <div className="space-y-1">
                  <Link href="/settings?tab=profile">
                    <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] transition-all text-[12px] font-bold text-muted hover:text-[var(--text)]">
                      <User className="h-4 w-4" /> View Profile
                    </button>
                  </Link>
                  <Link href="/settings">
                    <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] transition-all text-[12px] font-bold text-muted hover:text-[var(--text)]">
                      <Settings className="h-4 w-4" /> Global Settings
                    </button>
                  </Link>
                  <div className="h-px bg-default my-2" />
                  <button 
                    onClick={() => {
                      setIsUserMenuOpen(false);
                      logout();
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-[var(--dan)]/10 transition-all text-[12px] font-bold text-[var(--dan)]"
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
