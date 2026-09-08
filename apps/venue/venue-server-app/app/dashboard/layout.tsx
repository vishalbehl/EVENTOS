"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import {
  Activity, Radio, DoorOpen, HardDrive, Monitor,
  Boxes, Network, MessageSquare, ShieldAlert, Settings,
  Sun, Moon, ChevronLeft, ChevronRight, Wifi, WifiOff,
  Search, Bell, Layers, CheckCircle2, AlertTriangle, LogOut,
  Users, SlidersHorizontal
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/use-auth-store";
import { useTheme } from "@/hooks/useTheme";
import { apiClient } from "@/lib/api-client";
import { useSessionTimeout } from "@/hooks/useSessionTimeout";
import { GlobalSearchModal } from "@/components/operations/global-search-modal";
import { AttentionQueueDrawer } from "@/components/operations/attention-queue-drawer";
import { FloatingChatOverlay } from "@/components/operations/floating-chat-overlay";

type NavItem = { name: string; href: string; icon: LucideIcon; badge?: string };

const navGroups: Array<{ label: string; items: NavItem[] }> = [
  {
    label: "COMMAND",
    items: [
      { name: "Command Center", href: "/dashboard", icon: Activity },
    ],
  },
  {
    label: "LIVE OPERATIONS",
    items: [
      { name: "Live Operations", href: "/dashboard/live", icon: Radio },
      { name: "Rooms & Sessions", href: "/dashboard/rooms", icon: DoorOpen },
      { name: "Device Wall", href: "/dashboard/devices/wall", icon: Layers },
    ],
  },
  {
    label: "SERVICES",
    items: [
      { name: "SRR Control", href: "/dashboard/srr", icon: HardDrive },
      { name: "Registration", href: "/dashboard/registration", icon: Users },
      { name: "Signage Hub", href: "/dashboard/signage", icon: Monitor },
      { name: "ePoster Displays", href: "/dashboard/eposter", icon: Boxes },
    ],
  },
  {
    label: "CONTENT & ASSETS",
    items: [
      { name: "Files & Assets", href: "/dashboard/content", icon: HardDrive },
      { name: "Distribution Center", href: "/dashboard/distribution", icon: Radio },
    ],
  },
  {
    label: "CONNECTIVITY",
    items: [
      { name: "Cloud & Sync", href: "/dashboard/connectivity", icon: Wifi },
      { name: "Network & VLANs", href: "/dashboard/network", icon: Network },
    ],
  },
  {
    label: "COMMUNICATION",
    items: [
      { name: "Chat", href: "/dashboard/communication/chat", icon: MessageSquare },
      { name: "Attention Alerts", href: "/dashboard/alerts", icon: ShieldAlert },
    ],
  },
  {
    label: "ADMINISTRATION",
    items: [
      { name: "Fleet & Devices", href: "/dashboard/devices", icon: Monitor },
      { name: "Users & Roles", href: "/dashboard/admin/users", icon: Users },
      { name: "Audit Log", href: "/dashboard/logs", icon: Layers },
      { name: "Settings", href: "/dashboard/settings", icon: Settings },
    ],
  },
];

function CollapsedTooltip({ label }: { label: string }) {
  return <span role="tooltip" aria-hidden="true" className="venue-sidebar-tooltip">{label}</span>;
}

function VenueSidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const pathname = usePathname();
  return (
    <motion.aside
      initial={false}
      animate={{ width: collapsed ? 72 : 248 }}
      transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
      className="relative z-40 flex h-full shrink-0 flex-col overflow-visible border-r border-[var(--border)] bg-[var(--surf)] text-[var(--text)]"
    >
      <div className="flex h-full flex-col overflow-visible px-3 py-4">
        <div className={cn("group/logo relative mb-3 flex h-11 items-center px-2", collapsed ? "justify-center" : "justify-between")}>
          <div className={cn("flex min-w-0 items-center", collapsed ? "justify-center" : "gap-2.5")} aria-label="Eventos Venue Control Center">
            <span className={cn("grid shrink-0 place-items-center overflow-visible", collapsed ? "size-7" : "size-8")}>
              <img src="/brand/eventos-emblem-metal.png" alt="Eventos Logo" width={40} height={40} className="size-full scale-[2.05] object-contain" />
            </span>
            {!collapsed && (
              <div className="whitespace-nowrap">
                <span className="block truncate text-sm font-black uppercase leading-none tracking-[0.25em] text-[var(--text)]">
                  EVENT<span className="text-[var(--acc)]">OS</span>
                </span>
                <span className="mt-1 block truncate text-[9px] font-bold tracking-widest text-[var(--pri)]">
                  Venue Control Center
                </span>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onToggle}
            className={cn(
              "grid size-7 place-items-center rounded-lg border border-[var(--border)] bg-[var(--card)] text-[var(--muted)] transition-all duration-150 hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]",
              collapsed && "absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 opacity-0 shadow-sm group-hover/logo:opacity-100 group-focus-within/logo:opacity-100"
            )}
            aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
          >
            {collapsed ? <ChevronRight className="size-4" /> : <ChevronLeft className="size-4" />}
          </button>
        </div>

        <nav aria-label="Venue Control Navigation" className={cn("no-scrollbar min-h-0 flex-1", collapsed ? "overflow-visible" : "overflow-y-auto overflow-x-hidden")}>
          {navGroups.map((group) => (
            <section key={group.label} className="mb-3">
              {!collapsed && (
                <h2 className="mb-1 px-3 text-[9px] font-black uppercase tracking-[0.16em] text-[var(--muted)] opacity-80">
                  {group.label}
                </h2>
              )}
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const active = item.href === "/dashboard" ? pathname === item.href : pathname.startsWith(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        "group relative flex h-8 items-center rounded-lg px-3 text-xs font-bold uppercase tracking-wider transition-colors",
                        active
                          ? "sidebar-link-active"
                          : "text-[var(--muted)] hover:bg-[var(--raised)] hover:text-[var(--text)]",
                        collapsed && "justify-center px-0 h-9"
                      )}
                    >
                      <Icon className={cn("size-4 shrink-0", !collapsed && "mr-2.5")} />
                      {!collapsed && <span className="truncate">{item.name}</span>}
                      {collapsed && <CollapsedTooltip label={item.name} />}
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}
        </nav>

        <div className="shrink-0 border-t border-[var(--border)] pt-2">
          <div className="border-t border-[var(--border)] pt-2 text-center font-mono text-[9px] font-bold text-[var(--muted)]">
            {!collapsed && <span>EventOS Venue Control Center</span>}
          </div>
        </div>
      </div>
    </motion.aside>
  );
}

function VenueHeader({
  onOpenSearch,
  onOpenAttention,
}: {
  onOpenSearch: () => void;
  onOpenAttention: () => void;
}) {
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const { theme, setTheme } = useTheme();
  const [time, setTime] = useState<Date | null>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  useEffect(() => {
    setTime(new Date());
    const timer = window.setInterval(() => setTime(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const overviewQuery = useQuery({
    queryKey: ["venue-control-overview"],
    queryFn: () => apiClient.get<any>("/venue/admin/control/overview"),
    refetchInterval: 10000,
  });

  const alertsQuery = useQuery({
    queryKey: ["attention-alerts"],
    queryFn: () => apiClient.get<{ items: any[] }>("/venue/admin/control/alerts?state=active"),
    refetchInterval: 10000,
  });

  const overview = overviewQuery.data;
  const activeAlertsCount = alertsQuery.data?.items?.length || 0;
  const hasCritical = alertsQuery.data?.items?.some((a) => a.severity === "critical");
  const venueState = overview?.status?.toUpperCase() || "UNKNOWN";

  const initials = (user?.full_name || user?.first_name || "Admin").slice(0, 2).toUpperCase();

  return (
    <header className="z-20 flex h-16 shrink-0 items-center justify-between gap-4 border-b border-[var(--border)] bg-[var(--surf)] px-6">
      {/* Left: Event & Venue Context */}
      <div className="flex min-w-0 items-center gap-4">
        <div>
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-[9px] font-black uppercase tracking-widest text-[var(--acc)]">EVENT</span>
          </div>
          <span className="block truncate text-xs font-black uppercase tracking-wider text-[var(--text)]">
            {overview?.event?.name || "No active event"}
          </span>
        </div>

        <div className="hidden h-6 w-px bg-[var(--border)] md:block" />

        {/* Status indicators are derived from the authoritative overview. */}
        <div className="hidden items-center gap-3 lg:flex">
          <div className={cn(
            "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wide",
            venueState === "HEALTHY" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" : "border-amber-500/30 bg-amber-500/10 text-amber-400"
          )}>
            <span className={cn("size-1.5 rounded-full", venueState === "HEALTHY" ? "bg-emerald-400" : "bg-amber-400")} />
            <span>Venue {venueState}</span>
          </div>
          <div className="flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 text-[10px] font-black uppercase tracking-wide text-amber-400 px-2.5 py-1">
            <Wifi className="size-3" />
            <span>Cloud UNKNOWN</span>
          </div>
        </div>
      </div>

      {/* Right: Actions, Clock, Triage, Profile */}
      <div className="flex shrink-0 items-center gap-2.5">
        {/* Omnibox Search trigger */}
        <button
          type="button"
          onClick={onOpenSearch}
          className="flex h-9 items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-xs font-medium text-[var(--muted)] hover:border-[var(--pri)] hover:text-[var(--text)]"
        >
          <Search className="size-3.5 text-[var(--pri)]" />
          <span className="hidden md:inline">Search venue...</span>
          <kbd className="hidden rounded bg-[var(--surf)] px-1.5 py-0.5 font-mono text-[9px] font-bold md:inline border border-[var(--border)]">
            Ctrl+K
          </kbd>
        </button>

        {/* Attention Alerts Button */}
        <button
          type="button"
          onClick={onOpenAttention}
          className={cn(
            "relative flex h-9 items-center gap-2 rounded-xl border px-3 text-xs font-bold transition-all",
            hasCritical
              ? "border-rose-500/50 bg-rose-500/15 text-rose-400 animate-pulse"
              : activeAlertsCount > 0
                ? "border-amber-500/40 bg-amber-500/10 text-amber-400"
                : "border-[var(--border)] bg-[var(--card)] text-[var(--muted)] hover:text-[var(--text)]"
          )}
        >
          <Bell className="size-3.5" />
          <span>Alerts</span>
          {activeAlertsCount > 0 && (
            <span className="flex size-4 items-center justify-center rounded-full bg-rose-500 font-mono text-[9px] font-black text-white">
              {activeAlertsCount}
            </span>
          )}
        </button>

        {/* Live IST Clock */}
        <div className="hidden items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 font-mono text-xs font-bold text-[var(--text)] xl:flex">
          <span className="text-[var(--pri)]">●</span>
          <span>
            {time
              ? `${time.toLocaleTimeString("en-IN", {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
                hour12: true,
                timeZone: "Asia/Kolkata",
              })} IST`
              : "--:--:-- IST"}
          </span>
        </div>

        {/* Theme Toggle */}
        <button
          type="button"
          onClick={() => setTheme(theme === "light" ? "dark" : "light")}
          className="flex size-9 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--card)] text-[var(--muted)] transition-all hover:border-[var(--pri)] hover:text-[var(--text)]"
          title={theme === "light" ? "Switch to Dark Mode" : "Switch to Light Mode"}
        >
          {theme === "light" ? <Moon className="size-4 text-[var(--pri)]" /> : <Sun className="size-4 text-amber-400" />}
        </button>

        {/* Profile Menu */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setUserMenuOpen((open) => !open)}
            className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--card)] p-1 transition-all hover:bg-[var(--raised)]"
          >
            <div className="flex size-7 items-center justify-center rounded-lg bg-[var(--pri)] text-xs font-black text-white">
              {initials}
            </div>
            <div className="hidden pr-1 text-left lg:block">
              <div className="text-[11px] font-black leading-none text-[var(--text)]">
                {user?.full_name || user?.first_name || "NOC Lead"}
              </div>
            </div>
          </button>

          {userMenuOpen && (
            <div className="venue-profile-menu absolute right-0 z-50 mt-2 w-56 space-y-1 rounded-2xl p-2 border border-[var(--border)] bg-[var(--card)] shadow-2xl">
              <div className="border-b border-[var(--border)] px-3 py-2">
                <p className="text-xs font-black text-[var(--text)]">{user?.full_name || "NOC Operator"}</p>
                <p className="truncate text-[10px] font-medium text-[var(--muted)]">{user?.email || "venue-lead@eventos.io"}</p>
              </div>
              <Link
                href="/dashboard/settings"
                onClick={() => setUserMenuOpen(false)}
                className="venue-profile-menu-item flex items-center gap-2 rounded-lg p-2 text-xs font-bold hover:bg-[var(--raised)]"
              >
                <Settings className="size-4 text-[var(--pri)]" />
                <span>Venue Settings</span>
              </Link>
              <button
                type="button"
                onClick={async () => {
                  setUserMenuOpen(false);
                  try {
                    await apiClient.post("/auth/logout");
                  } catch {
                    // Suppress error if session already expired/unauthenticated
                  } finally {
                    logout();
                    router.replace("/login");
                  }
                }}
                className="venue-profile-menu-item danger flex w-full items-center gap-2 rounded-lg p-2 text-xs font-bold text-rose-500 hover:bg-rose-500/10 cursor-pointer"
              >
                <LogOut className="size-4" />
                <span>Logout</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [hydrated, setHydrated] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [attentionOpen, setAttentionOpen] = useState(false);
  const { initializeFromStorage } = useAuthStore();

  // Workstation-bound time-based inactivity session watcher
  useSessionTimeout();

  useEffect(() => {
    initializeFromStorage();
    setHydrated(true);
    if (!localStorage.getItem("venue_session_active") && !sessionStorage.getItem("session_active")) {
      router.replace("/login");
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [initializeFromStorage, router]);

  if (!hydrated) return null;

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--base)] font-sans text-[var(--text)]">
      <VenueSidebar collapsed={collapsed} onToggle={() => setCollapsed((v) => !v)} />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <VenueHeader
          onOpenSearch={() => setSearchOpen(true)}
          onOpenAttention={() => setAttentionOpen(true)}
        />
        <div className="custom-scrollbar w-full flex-1 overflow-y-auto bg-[var(--base)] p-4 sm:p-6">
          {children}
        </div>
      </div>

      <GlobalSearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />
      <AttentionQueueDrawer open={attentionOpen} onClose={() => setAttentionOpen(false)} />
      <FloatingChatOverlay />
    </div>
  );
}
