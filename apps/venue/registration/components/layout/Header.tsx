"use client";

import { usePathname, useParams } from "next/navigation";
import { motion } from "framer-motion";
import {
  Bell, User, ChevronRight,
  Settings, HelpCircle, LogOut, Clock,
  Zap, ShieldCheck, Box, PanelLeft, Wifi, WifiOff, Sun, Moon
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useState, useEffect, useRef } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useAuthStore } from "@/store/use-auth-store";
import { useUIStore } from "@/store/useUIStore";
import { useWebSocket } from "@/hooks/useWebSocket";
import Link from "next/link";
import { AnimatePresence } from "framer-motion";

export function Header() {
  const pathname = usePathname();
  const { eventId } = useParams();
  const [time, setTime] = useState(new Date());
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const { theme, setTheme } = useTheme();
  const { user, logout } = useAuthStore();
  const { isSidebarCollapsed, toggleSidebar } = useUIStore();
  const userMenuRef = useRef<HTMLDivElement>(null);

  // WebSocket hook
  const { isConnected } = useWebSocket(eventId as string);

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
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

  // Simple breadcrumb logic
  const paths = pathname.split("/").filter(Boolean);
  const breadcrumbs: { label: string; href: string }[] = [];
  paths.forEach((path, i) => {
    if (path === eventId) return;
    const href = "/" + paths.slice(0, i + 1).join("/");
    const label = path.replace(/-/g, " ");
    breadcrumbs.push({ label, href });
  });

  return (
    <header className="sticky top-0 z-30 w-full h-[100px] flex items-center px-10 gap-10 glass-3d border-t-0 border-x-0 rounded-none bg-[var(--base)]/40">
      {/* Breadcrumbs */}
      <div className="flex items-center gap-4 min-w-0 flex-1">
        <div className="h-10 w-10 glass-3d border-default rounded-xl flex items-center justify-center shrink-0">
          <Box className="h-5 w-5 text-[var(--pri)]" />
        </div>
        <div className="flex items-center gap-2 overflow-hidden">
          {breadcrumbs.map((crumb, i) => (
            <div key={i} className="flex items-center gap-2 whitespace-nowrap">
              <ChevronRight className="h-4 w-4 text-muted" />
              <Link
                href={crumb.href}
                className={cn(
                  "text-[12px] font-black uppercase tracking-widest transition-colors",
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
      <div className="flex items-center gap-6 justify-end flex-1">
        {/* System Clock */}
        <div className="hidden xl:flex flex-col items-end pr-6 border-r border-default">
          <p className="text-[14px] font-black text-[var(--text)] tracking-tighter tabular-nums leading-none mb-1">
            {time.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' })}
          </p>
          <p className="text-[9px] font-black text-[var(--pri)] uppercase tracking-[0.2em]">Indian Standard Time (IST)</p>
        </div>

        <div className="flex items-center gap-3">
          {eventId && (
            <div
              className={cn(
                "flex items-center gap-2 px-3 h-11 rounded-xl glass-3d border-default shrink-0 cursor-default select-none transition-all",
                isConnected ? "hover:border-emerald-500/30" : "hover:border-amber-500/30"
              )}
              title={isConnected ? "WebSocket Connected — Real-time synchronization active" : "WebSocket Offline — Attempting to reconnect..."}
            >
              <span className={cn(
                "h-2 w-2 rounded-full relative shrink-0",
                isConnected ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]" : "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.8)] animate-pulse"
              )}>
                {isConnected && (
                  <span className="absolute inset-0 rounded-full animate-ping bg-emerald-500 opacity-75" />
                )}
              </span>
              <span className={cn(
                "text-[10px] font-black uppercase tracking-widest hidden sm:inline",
                isConnected ? "text-emerald-500" : "text-amber-500"
              )}>
                {isConnected ? "Live Sync" : "Sync Off"}
              </span>
            </div>
          )}

          <Link href={eventId ? `/events/${eventId}/speaker/notifications` : "/notifications"}>
            <button className="h-11 w-11 rounded-xl glass-3d border-default flex items-center justify-center text-muted hover:text-[var(--sec)] hover:border-[var(--sec)]/30 transition-all relative group">
              <Bell className="h-5 w-5" />
              <span className="absolute top-2 right-2 h-2 w-2 bg-[var(--dan)] rounded-full border-2 border-[var(--surf)] pulse-glow-red" />
            </button>
          </Link>

          {/* Direct 1-Click Light/Dark Mode Toggle */}
          <button
            onClick={() => setTheme(theme === "light" ? "dark" : "light")}
            className="h-11 w-11 rounded-xl glass-3d border-default flex items-center justify-center text-muted hover:text-[var(--pri)] hover:border-[var(--pri)]/30 transition-all"
            title={theme === "light" ? "Switch to Dark Mode" : "Switch to Light Mode"}
          >
            {theme === "light" ? (
              <Moon className="h-5 w-5 text-[var(--pri)]" />
            ) : (
              <Sun className="h-5 w-5 text-amber-400" />
            )}
          </button>

          <Link href="/docs">
            <button className="h-11 w-11 rounded-xl glass-3d border-default flex items-center justify-center text-muted hover:text-[var(--text)] hover:border-default transition-all">
              <HelpCircle className="h-5 w-5" />
            </button>
          </Link>
        </div>

        <div className="flex items-center gap-4 pl-6 border-l border-default relative" ref={userMenuRef}>
          <div 
            onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
            className="flex items-center gap-3 cursor-pointer group"
          >
            <div className="text-right hidden sm:block">
              <p className="text-[12px] font-black text-[var(--text)] leading-none mb-1 uppercase tracking-tight">
                {user?.full_name || user?.first_name || 'Account'}
              </p>
              <p className="text-[9px] font-black text-[var(--pri)] uppercase tracking-[0.2em] opacity-70">
                {user?.role?.replace(/_/g, ' ') || 'Member'}
              </p>
            </div>
            <div
              className="h-11 w-11 rounded-xl bg-gradient-to-br from-[var(--pri)]/20 to-[var(--sec)]/20 border border-default flex items-center justify-center text-[13px] font-black text-[var(--text)] shadow-lg hover:scale-105 transition-transform overflow-hidden relative"
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
