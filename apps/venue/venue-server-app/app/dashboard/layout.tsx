"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Activity, AlertTriangle, ArchiveRestore, Box, Boxes, Clock, DatabaseZap, DoorOpen,
  FileClock, HardDrive, KeyRound, LogOut, MonitorSmartphone, Network, Settings,
  Sun, Moon, ChevronLeft, ChevronRight, Wifi, WifiOff,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/use-auth-store";
import { useTheme } from "@/hooks/useTheme";
import { apiClient } from "@/lib/api-client";

type NavItem = { name: string; href: string; icon: LucideIcon };

const navGroups: Array<{ label: string; items: NavItem[] }> = [
  {
    label: "MAIN OPERATIONS",
    items: [
      { name: "Command Center", href: "/dashboard", icon: Activity },
      { name: "Event & Sync", href: "/dashboard/event-sync", icon: DatabaseZap },
      { name: "Services", href: "/dashboard/services", icon: Boxes },
      { name: "Devices", href: "/dashboard/devices", icon: MonitorSmartphone },
      { name: "Content Delivery", href: "/dashboard/content", icon: HardDrive },
      { name: "Rooms", href: "/dashboard/rooms", icon: DoorOpen },
    ],
  },
  {
    label: "VENUE & SYSTEM",
    items: [
      { name: "Registration API", href: "/dashboard/registration-access", icon: KeyRound },
      { name: "Network", href: "/dashboard/network", icon: Network },
      { name: "Alerts", href: "/dashboard/alerts", icon: AlertTriangle },
      { name: "Audit Logs", href: "/dashboard/logs", icon: FileClock },
      { name: "Backups", href: "/dashboard/backups", icon: ArchiveRestore },
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
          <div className={cn("flex min-w-0 items-center", collapsed ? "justify-center" : "gap-2.5")} aria-label="Eventos Venue Server">
            <span className={cn("grid shrink-0 place-items-center overflow-visible", collapsed ? "size-7" : "size-8")}><img src="/brand/eventos-emblem-metal.png" alt="Eventos Logo" width={40} height={40} className="size-full scale-[2.05] object-contain" /></span>
            {!collapsed && <div className="whitespace-nowrap"><span className="block truncate text-sm font-black uppercase leading-none tracking-[0.25em] text-[var(--text)]">EVENT<span className="text-[var(--acc)]">OS</span></span><span className="mt-1 block truncate text-[9px] font-bold tracking-widest text-[var(--pri)]">Venue Server</span></div>}
          </div>
          <button type="button" onClick={onToggle} className={cn("grid size-7 place-items-center rounded-lg border border-[var(--border)] bg-[var(--card)] text-[var(--muted)] transition-all duration-150 hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]", collapsed && "absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 opacity-0 shadow-sm group-hover/logo:opacity-100 group-focus-within/logo:opacity-100")} aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}>{collapsed ? <ChevronRight className="size-4" /> : <ChevronLeft className="size-4" />}</button>
        </div>

        {!collapsed && <div className="relative mb-4"><div className="flex w-full items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-2.5 text-left shadow-sm"><span className="grid size-8 shrink-0 place-items-center rounded-lg border border-[var(--border)] bg-[var(--surf)] text-[var(--pri)]"><Box className="size-4" /></span><span className="min-w-0 flex-1"><span className="block truncate text-xs font-bold text-[var(--text)]">Venue Server</span><span className="block truncate text-[10px] font-medium text-[var(--muted)]">Focused workspace</span></span></div></div>}

        <nav aria-label="Venue Server Navigation" className={cn("no-scrollbar min-h-0 flex-1", collapsed ? "overflow-visible" : "overflow-y-auto overflow-x-hidden")}>
          {navGroups.map((group) => <section key={group.label} className="mb-4">{!collapsed && <h2 className="mb-1.5 px-3 text-[10px] font-extrabold uppercase tracking-[0.14em] text-[var(--muted)]">{group.label}</h2>}<div className="space-y-1">{group.items.map((item) => { const Icon = item.icon; const active = item.href === "/dashboard" ? pathname === item.href : pathname.startsWith(item.href); return <Link key={item.href} href={item.href} className={cn("group relative flex h-9 items-center rounded-lg px-3 text-xs font-bold uppercase tracking-wider transition-colors", active ? "bg-[var(--pri)] text-[var(--primary-contrast)] shadow-[inset_0_0_0_1px_var(--border)]" : "text-[var(--muted)] hover:bg-[var(--raised)] hover:text-[var(--text)]", collapsed && "justify-center px-0")}><Icon className={cn("size-4 shrink-0", !collapsed && "mr-3")} />{!collapsed && <span className="truncate">{item.name}</span>}{collapsed && <CollapsedTooltip label={item.name} />}</Link>; })}</div></section>)}
        </nav>

        <div className="shrink-0 border-t border-[var(--border)] pt-2"><div className="space-y-1 pb-2"><Link href="/dashboard/settings" className={cn("group relative flex h-9 items-center rounded-lg px-3 text-xs font-bold uppercase tracking-wider transition-colors", pathname.startsWith("/dashboard/settings") ? "bg-[var(--pri)] text-[var(--primary-contrast)]" : "text-[var(--muted)] hover:bg-[var(--raised)] hover:text-[var(--text)]", collapsed && "justify-center px-0")}><Settings className={cn("size-4 shrink-0", !collapsed && "mr-3")} />{!collapsed && <span>Settings</span>}{collapsed && <CollapsedTooltip label="Settings" />}</Link></div><div className="border-t border-[var(--border)] pt-2 text-center font-mono text-[10px] text-[var(--muted)]">{!collapsed && <span>EventOS v1.0 · Venue Mode</span>}</div></div>
      </div>
    </motion.aside>
  );
}

function VenueHeader() {
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const { theme, setTheme } = useTheme();
  const [time, setTime] = useState<Date | null>(null);
  const [apiConnected, setApiConnected] = useState<boolean | null>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  useEffect(() => { setTime(new Date()); const timer = window.setInterval(() => setTime(new Date()), 1000); return () => window.clearInterval(timer); }, []);
  useEffect(() => { let mounted = true; const probe = () => apiClient.get("/auth/status").then(() => mounted && setApiConnected(true)).catch(() => mounted && setApiConnected(false)); probe(); const timer = window.setInterval(probe, 15000); return () => { mounted = false; window.clearInterval(timer); }; }, []);

  const initials = (user?.full_name || user?.first_name || "Admin").slice(0, 2).toUpperCase();
  return <header className="z-20 flex h-16 shrink-0 items-center justify-between gap-4 border-b border-[var(--border)] bg-[var(--surf)] px-6"><div className="flex min-w-0 items-center gap-3"><h2 className="truncate text-sm font-black uppercase tracking-wider text-[var(--text)]">Venue Server</h2><div className={cn("hidden items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wide sm:flex", apiConnected === true ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-500" : apiConnected === false ? "border-amber-500/30 bg-amber-500/10 text-amber-500" : "border-[var(--border)] bg-[var(--card)] text-[var(--muted)]")}><div className={cn("h-1.5 w-1.5 rounded-full", apiConnected === true ? "animate-pulse bg-emerald-500" : apiConnected === false ? "animate-pulse bg-amber-500" : "bg-[var(--muted)]")} /><span>{apiConnected === true ? "Server Online" : apiConnected === false ? "Server Offline" : "Checking"}</span></div></div><div className="flex shrink-0 items-center gap-3"><div className="hidden items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 font-mono text-xs font-bold text-[var(--text)] md:flex"><Clock className="size-3.5 text-[var(--pri)]" /><span>{time ? `${time.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true, timeZone: "Asia/Kolkata" })} IST` : "--:--:-- IST"}</span></div><div className={cn("hidden items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-wider sm:flex", apiConnected === true ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-500" : "border-amber-500/30 bg-amber-500/10 text-amber-500")} >{apiConnected === true ? <Wifi className="size-3" /> : <WifiOff className="size-3" />}<span>{apiConnected === true ? "Live API" : "Offline"}</span></div><button type="button" onClick={() => setTheme(theme === "light" ? "dark" : "light")} className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--card)] text-[var(--muted)] transition-all hover:border-[var(--pri)] hover:text-[var(--text)]" title={theme === "light" ? "Switch to Dark Mode" : "Switch to Light Mode"}>{theme === "light" ? <Moon className="size-4 text-[var(--pri)]" /> : <Sun className="size-4 text-amber-400" />}</button><div className="relative"><button type="button" onClick={() => setUserMenuOpen((open) => !open)} className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--card)] p-1.5 transition-all hover:bg-[var(--raised)]"><div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--pri)] text-xs font-black text-[var(--primary-contrast)]">{initials}</div><div className="hidden pr-1 text-left lg:block"><div className="text-xs font-black leading-none text-[var(--text)]">{user?.full_name || user?.first_name || "Administrator"}</div><div className="mt-0.5 text-[10px] font-semibold uppercase text-[var(--muted)]">{user?.role || "Administrator"}</div></div></button>{userMenuOpen && <div className="venue-profile-menu absolute right-0 z-50 mt-2 w-56 space-y-1 rounded-2xl p-2"><div className="border-b border-[var(--border)] px-3 py-2"><p className="text-xs font-black text-[var(--text)]">{user?.full_name || user?.first_name || "Administrator"}</p><p className="truncate text-[10px] font-medium text-[var(--muted)]">{user?.email || "Local Venue Account"}</p></div><Link href="/dashboard/settings" onClick={() => setUserMenuOpen(false)} className="venue-profile-menu-item text-xs font-bold"><Settings className="size-4 text-[var(--pri)]" /><span>Venue Settings</span></Link><button type="button" onClick={async () => { setUserMenuOpen(false); try { await apiClient.post("/auth/logout"); } finally { logout(); router.replace("/login"); } }} className="venue-profile-menu-item danger cursor-pointer text-xs font-bold"><LogOut className="size-4" /><span>Logout</span></button></div>}</div></div></header>;
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [hydrated, setHydrated] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const { initializeFromStorage } = useAuthStore();
  useEffect(() => { initializeFromStorage(); setHydrated(true); if (!localStorage.getItem("venue_session_active")) router.replace("/login"); }, [initializeFromStorage, router]);
  if (!hydrated) return null;
  return <div className="flex h-screen overflow-hidden bg-[var(--base)] font-sans text-[var(--text)]"><VenueSidebar collapsed={collapsed} onToggle={() => setCollapsed((value) => !value)} /><div className="flex min-w-0 flex-1 flex-col overflow-hidden"><VenueHeader /><div className="custom-scrollbar w-full flex-1 overflow-y-auto bg-[var(--base)] p-4 sm:p-5">{children}</div></div></div>;
}
