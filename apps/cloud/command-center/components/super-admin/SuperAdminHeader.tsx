"use client";

import React, { useState, useEffect, useRef } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/store/use-auth-store";
import { useRouter } from "next/navigation";
import {
  Search, Bell, RefreshCw, Settings, Sun, Moon, LogOut, Shield,
  Laptop, X, Sparkles, Building2, User, LayoutDashboard, CreditCard, Cpu, FileText
} from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

interface Notification {
  id: string;
  type: "success" | "warning" | "danger" | "info";
  message: string;
  time: string;
}

const MOCK_NOTIFICATIONS: Notification[] = [
  { id: "1", type: "success", message: "Backup successfully generated and uploaded to bucket", time: "5 min ago" },
  { id: "2", type: "danger", message: "CPU utilization spike on DB cluster (94%)", time: "12 min ago" },
  { id: "3", type: "warning", message: "Trial expiring in 3 days: TechConf Inc.", time: "1 hour ago" },
  { id: "4", type: "info", message: "Impersonation session started by Vishal Behl", time: "2 hours ago" },
  { id: "5", type: "success", message: "Plan upgraded to Enterprise for EventX Org", time: "5 hours ago" },
];

export function SuperAdminHeader() {
  const { theme, setTheme } = useTheme();
  const queryClient = useQueryClient();
  const { user, logout } = useAuthStore();
  const router = useRouter();
  
  const [mounted, setMounted] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);

  const notificationRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const searchPaletteRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Keyboard shortcut Command+K or Ctrl+K for search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setIsSearchOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Click outside listeners
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) {
        setIsNotificationsOpen(false);
      }
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setIsProfileOpen(false);
      }
      if (searchPaletteRef.current && !searchPaletteRef.current.contains(event.target as Node)) {
        setIsSearchOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await queryClient.invalidateQueries();
      // Simulate visual spin time
      await new Promise((resolve) => setTimeout(resolve, 800));
    } catch (err) {
      console.error(err);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleSignOut = async () => {
    await logout();
    router.push("/login");
  };

  if (!mounted) return null;

  return (
    <header className="h-[56px] w-full bg-surface border-b border-border flex items-center justify-between px-6 sticky top-0 z-40 select-none">
      {/* Left: Global search trigger */}
      <div className="flex items-center flex-1 max-w-md relative">
        <button
          onClick={() => setIsSearchOpen(true)}
          className="w-full flex items-center justify-between gap-3 h-9 px-3 rounded-lg border border-border bg-surface-2/40 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-border/85 transition-all text-xs font-medium cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <Search className="w-3.5 h-3.5 text-[var(--text-tertiary)]" />
            <span>Search anything...</span>
          </div>
          <kbd className="h-5 px-1.5 flex items-center rounded border border-border bg-surface text-[10px] font-semibold text-[var(--text-tertiary)]">
            ⌘K
          </kbd>
        </button>
      </div>

      {/* Right: Actions and User avatar */}
      <div className="flex items-center gap-2">
        {/* Refresh Icon */}
        <button
          onClick={handleRefresh}
          className="p-2 rounded-lg border border-border bg-surface text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-surface-2 transition-all flex items-center justify-center relative cursor-pointer"
          title="Refresh Current Page Data"
        >
          <RefreshCw className={cn("w-4 h-4", isRefreshing && "animate-spin text-[var(--brand-primary)]")} />
        </button>

        {/* Theme Toggle */}
        <button
          onClick={() => setTheme(theme === "light" ? "plasma-violet" : "light")}
          className="p-2 rounded-lg border border-border bg-surface text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-surface-2 transition-all flex items-center justify-center cursor-pointer"
          title="Switch Dark/Light Theme"
        >
          {theme === "light" ? <Moon className="w-4 h-4 text-violet-500" /> : <Sun className="w-4 h-4 text-amber-400" />}
        </button>

        {/* Notifications Bell */}
        <div className="relative" ref={notificationRef}>
          <button
            onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
            className="p-2 rounded-lg border border-border bg-surface text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-surface-2 transition-all flex items-center justify-center relative cursor-pointer"
          >
            <Bell className="w-4 h-4" />
            <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full bg-[var(--danger)] border-2 border-surface"></span>
          </button>

          <AnimatePresence>
            {isNotificationsOpen && (
              <motion.div
                initial={{ opacity: 0, y: 8, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.95 }}
                transition={{ duration: 0.15, ease: "easeOut" }}
                className="absolute right-0 mt-2 w-80 rounded-xl border border-border bg-surface shadow-2xl p-4 overflow-hidden z-50"
              >
                <div className="flex items-center justify-between border-b border-border/60 pb-2.5 mb-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)]">
                    Ecosystem Alerts
                  </h4>
                  <span className="text-[10px] text-[var(--brand-primary)] font-semibold hover:underline cursor-pointer">
                    Mark all read
                  </span>
                </div>
                <div className="space-y-2.5 max-h-64 overflow-y-auto pr-0.5 custom-scrollbar">
                  {MOCK_NOTIFICATIONS.map((notif) => (
                    <div
                      key={notif.id}
                      className="flex items-start gap-2.5 p-2 rounded-lg hover:bg-surface-2/60 transition-colors cursor-pointer"
                    >
                      <span
                        className={cn(
                          "w-2 h-2 rounded-full mt-1.5 flex-shrink-0",
                          notif.type === "success" && "bg-[var(--success)]",
                          notif.type === "warning" && "bg-[var(--warning)]",
                          notif.type === "danger" && "bg-[var(--danger)]",
                          notif.type === "info" && "bg-[var(--info)]"
                        )}
                      ></span>
                      <div className="space-y-0.5 min-w-0">
                        <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed truncate">
                          {notif.message}
                        </p>
                        <span className="text-[9px] text-[var(--text-tertiary)] font-medium">
                          {notif.time}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="border-t border-border/60 pt-2.5 mt-3 text-center">
                  <span className="text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--brand-primary)] cursor-pointer transition-colors">
                    View all notifications
                  </span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Settings Gear Shortcut */}
        <button
          onClick={() => router.push("/super-admin/settings/general")}
          className="p-2 rounded-lg border border-border bg-surface text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-surface-2 transition-all flex items-center justify-center cursor-pointer"
          title="Console Settings"
        >
          <Settings className="w-4 h-4" />
        </button>

        {/* Vertical divider */}
        <div className="h-5 w-px bg-border/60 mx-1"></div>

        {/* Admin Avatar Dropdown */}
        <div className="relative" ref={profileRef}>
          <button
            onClick={() => setIsProfileOpen(!isProfileOpen)}
            className="flex items-center gap-2 p-1 rounded-full hover:bg-surface-2 transition-all cursor-pointer"
          >
            <div className="w-8 h-8 rounded-full bg-[var(--brand-primary-muted)] text-[var(--brand-primary)] font-bold text-xs flex items-center justify-center border border-[var(--brand-primary)]/20">
              {user?.email ? user.email.slice(0, 2).toUpperCase() : "SA"}
            </div>
          </button>

          <AnimatePresence>
            {isProfileOpen && (
              <motion.div
                initial={{ opacity: 0, y: 8, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.95 }}
                transition={{ duration: 0.15, ease: "easeOut" }}
                className="absolute right-0 mt-2 w-56 rounded-xl border border-border bg-surface shadow-2xl p-2 z-50"
              >
                <div className="p-3 border-b border-border/60 mb-1">
                  <p className="text-xs font-bold text-[var(--text-primary)] truncate">
                    {user?.email?.split("@")[0] || "Super Admin"}
                  </p>
                  <p className="text-[10px] text-[var(--text-tertiary)] truncate mt-0.5">
                    {user?.email || "admin@eventos.com"}
                  </p>
                  <span className="inline-flex items-center gap-1 mt-2 px-1.5 py-0.5 rounded bg-[var(--brand-primary-muted)] text-[var(--brand-primary)] text-[9px] font-black uppercase tracking-wider">
                    <Shield className="w-2.5 h-2.5" />
                    {user?.platform_role || "SUPER_ADMIN"}
                  </span>
                </div>

                <button
                  onClick={() => {
                    setIsProfileOpen(false);
                    router.push("/super-admin/settings/general");
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-surface-2 transition-all text-left cursor-pointer"
                >
                  <Settings className="w-3.5 h-3.5" />
                  <span>Platform Settings</span>
                </button>

                <button
                  onClick={handleSignOut}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold text-[var(--danger)] hover:bg-[var(--danger-muted)] transition-all text-left mt-1 cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign Out</span>
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Global Command Palette dialog */}
      <AnimatePresence>
        {isSearchOpen && (
          <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 px-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: -20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: -20 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="bg-surface border border-border w-full max-w-xl rounded-2xl shadow-2xl overflow-hidden"
              ref={searchPaletteRef}
            >
              {/* Search input bar */}
              <div className="flex items-center h-12 border-b border-border/80 px-4 gap-3 bg-surface-2/20">
                <Search className="w-4 h-4 text-[var(--text-secondary)]" />
                <input
                  type="text"
                  placeholder="Search pages, organizations, actions..."
                  className="w-full bg-transparent border-0 outline-none text-sm text-[var(--text-primary)] placeholder-[var(--text-tertiary)]"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  autoFocus
                />
                <button
                  onClick={() => setIsSearchOpen(false)}
                  className="p-1 rounded hover:bg-surface-2 text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Palette items */}
              <div className="max-h-80 overflow-y-auto p-2 space-y-1.5 custom-scrollbar">
                {/* Recent Pages */}
                <div>
                  <span className="block text-[9px] font-black uppercase tracking-wider text-[var(--text-tertiary)] px-2.5 py-1.5">
                    Navigate to
                  </span>
                  <div className="space-y-0.5">
                    {[
                      { title: "Dashboard Overview", url: "/super-admin", icon: LayoutDashboard },
                      { title: "Organizations Registry", url: "/super-admin/organizations", icon: Building2 },
                      { title: "Commercial Subscriptions", url: "/super-admin/commercial/subscriptions", icon: CreditCard },
                      { title: "Security Users", url: "/super-admin/security/users", icon: User },
                      { title: "Operations Jobs Monitor", url: "/super-admin/operations/jobs", icon: Cpu },
                      { title: "General Settings", url: "/super-admin/settings/general", icon: Settings },
                    ]
                      .filter((p) => p.title.toLowerCase().includes(searchQuery.toLowerCase()))
                      .map((p, idx) => (
                        <button
                          key={idx}
                          onClick={() => {
                            setIsSearchOpen(false);
                            router.push(p.url);
                          }}
                          className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-surface-hover transition-all text-left"
                        >
                          <p.icon className="w-4 h-4 text-[var(--text-tertiary)]" />
                          <span>{p.title}</span>
                        </button>
                      ))}
                  </div>
                </div>

                {/* Quick actions */}
                <div className="border-t border-border/40 pt-2 mt-2">
                  <span className="block text-[9px] font-black uppercase tracking-wider text-[var(--text-tertiary)] px-2.5 py-1.5">
                    Quick Actions
                  </span>
                  <div className="space-y-0.5">
                    {[
                      { title: "Trigger Telemetry Refresh", action: handleRefresh, icon: RefreshCw },
                      { title: "Impersonate Active Tenant", url: "/super-admin/security/impersonation", icon: Shield },
                      { title: "Audit Active System Logs", url: "/super-admin/security/audit", icon: FileText },
                    ]
                      .filter((a) => a.title.toLowerCase().includes(searchQuery.toLowerCase()))
                      .map((a, idx) => (
                        <button
                          key={idx}
                          onClick={() => {
                            setIsSearchOpen(false);
                            if (a.url) router.push(a.url);
                            if (a.action) a.action();
                          }}
                          className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-surface-hover transition-all text-left"
                        >
                          <a.icon className="w-4 h-4 text-[var(--brand-primary)]" />
                          <span>{a.title}</span>
                        </button>
                      ))}
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="bg-surface-2/30 border-t border-border px-4 py-2.5 flex items-center justify-between text-[10px] text-[var(--text-tertiary)]">
                <span>Select with arrows, enter to navigate</span>
                <span>ESC to close</span>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </header>
  );
}
