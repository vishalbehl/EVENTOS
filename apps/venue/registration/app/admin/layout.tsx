"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuthStore } from "@/store/use-auth-store";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useTheme } from "@/hooks/useTheme";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, Users, Printer, Scan,
  Settings, LogOut, HardDrive, Bell, User, ShieldCheck, Package,
  Sun, Moon, ChevronLeft, ChevronRight, ChevronDown, Clock,
  Wifi, WifiOff, Box, UserPlus, CheckSquare, History, FileText, BookOpen
} from "lucide-react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { FetchEventModal } from "@/components/fetch-event-modal";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, user, mode, setMode, logout } = useAuthStore();
  const [hydrated, setHydrated] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isFetchModalOpen, setIsFetchModalOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [time, setTime] = useState<Date | null>(null);

  const { theme, setTheme } = useTheme();
  const { isConnected } = useWebSocket();
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOpenModal = () => setIsFetchModalOpen(true);
    const handleAuthExpired = () => {
      logout();
      router.push("/");
    };
    document.addEventListener("open-fetch-event-modal", handleOpenModal);
    window.addEventListener("eventos-auth-expired", handleAuthExpired);
    return () => {
      document.removeEventListener("open-fetch-event-modal", handleOpenModal);
      window.removeEventListener("eventos-auth-expired", handleAuthExpired);
    };
  }, [logout, router]);

  useEffect(() => {
    setHydrated(true);
    if (!isAuthenticated) router.push("/");
    else if (
      mode !== "admin" ||
      !["admin", "super_admin"].includes(user?.role || "") ||
      (user?.allowed_modes && !user.allowed_modes.includes("admin"))
    ) router.push("/");

    setTime(new Date());
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, [isAuthenticated, mode, router, user?.allowed_modes, user?.role]);

  // Close user profile dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setIsUserMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLogout = () => {
    logout();
    router.push("/");
  };

  if (!hydrated || !isAuthenticated) return null;

  const navGroups = [
    {
      label: "MAIN ADMIN",
      items: [
        { name: "Dashboard", href: "/admin", icon: LayoutDashboard },
        { name: "Sync & Local Data", href: "/admin/sync", icon: HardDrive },
        { name: "Reports", href: "/admin/reports", icon: FileText },
      ],
    },
    {
      label: "STATION & CAPACITY",
      items: [
        { name: "Check-in Gates", href: "/admin/capacity", icon: ShieldCheck },
        { name: "Event Kits", href: "/admin/kits", icon: Package },
        { name: "Badge Designer", href: "/admin/template-designer", icon: Printer },
      ],
    },
    {
      label: "HARDWARE & SYSTEM",
      items: [
        { name: "Devices & Hardware", href: "/admin/devices", icon: Printer },
        { name: "Audit Logs", href: "/admin/logs", icon: History },
      ],
    },
  ];

  return (
    <div className="flex h-screen bg-[var(--base)] text-[var(--text)] font-sans overflow-hidden transition-colors">
      {/* COMMAND CENTER DESIGNED SIDEBAR */}
      <motion.aside
        initial={false}
        animate={{ width: isCollapsed ? 72 : 248 }}
        transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
        className="relative z-40 flex h-full flex-col overflow-visible border-r border-[var(--border)] bg-[var(--surf)] text-[var(--text)] shrink-0"
      >
        <div className="flex h-full flex-col overflow-visible px-3 py-4">
          {/* Logo Header Container */}
          <div className={cn("group/logo relative mb-3 flex h-11 items-center px-2", isCollapsed ? "justify-center" : "justify-between")}>
            <div className={cn("flex min-w-0 items-center", isCollapsed ? "justify-center" : "gap-2.5")} aria-label="Eventos Admin">
              <span
                className={cn(
                  "grid shrink-0 place-items-center overflow-visible",
                  isCollapsed ? "size-7" : "size-8"
                )}
              >
                <img
                  src="/brand/eventos-emblem-metal.png"
                  alt="Eventos Logo"
                  width={40}
                  height={40}
                  className="size-full scale-[2.05] object-contain"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = "none";
                  }}
                />
              </span>
              {!isCollapsed && (
                <div className="whitespace-nowrap">
                  <span className="truncate text-sm font-black uppercase tracking-[0.25em] text-[var(--text)] block leading-none">
                    EVENT<span className="text-[var(--acc)]">OS</span>
                  </span>
                  <span className="block truncate text-[9px] font-bold tracking-widest text-[var(--pri)] mt-1">
                    Admin Console
                  </span>
                </div>
              )}
            </div>

            {/* Hover-Only Collapse Toggle Button */}
            <button
              onClick={() => setIsCollapsed(!isCollapsed)}
              className={cn(
                "grid size-7 place-items-center rounded-lg border border-[var(--border)] bg-[var(--card)] text-[var(--muted)] transition-all duration-150 hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]",
                isCollapsed && "absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 opacity-0 shadow-sm group-hover/logo:opacity-100 group-focus-within/logo:opacity-100"
              )}
              aria-label={isCollapsed ? "Expand navigation" : "Collapse navigation"}
            >
              {isCollapsed ? <ChevronRight className="size-4" /> : <ChevronLeft className="size-4" />}
            </button>
          </div>

          {/* Focused Workspace Switcher Box */}
          {!isCollapsed && (
            <div className="relative mb-4">
              <button
                type="button"
                onClick={() => setSwitcherOpen((open) => !open)}
                className="group flex w-full items-center gap-3 p-2.5 rounded-xl border border-[var(--border)] bg-[var(--card)] text-left shadow-sm transition-colors hover:bg-[var(--raised)]"
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-[var(--border)] bg-[var(--surf)] text-[var(--pri)]">
                  <Box className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-bold text-[var(--text)]">Admin Console</span>
                  <span className="block truncate text-[10px] text-[var(--muted)] font-medium">Focused workspace</span>
                </span>
                <ChevronDown className="size-3.5 text-[var(--muted)]" />
              </button>

              <AnimatePresence>
                {switcherOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    className="absolute z-[90] left-0 right-0 mt-2 rounded-xl border border-[var(--border)] bg-[var(--card)] p-1.5 shadow-xl space-y-1"
                  >
                    <Link
                      href="/registry"
                      onClick={() => { setMode("registration"); setSwitcherOpen(false); }}
                      className={cn(
                        "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-bold transition-colors",
                        pathname.startsWith("/registry") ? "bg-[var(--pri)] text-[var(--primary-contrast)]" : "text-[var(--text)] hover:bg-[var(--raised)]"
                      )}
                    >
                      <UserPlus className="size-4 shrink-0" />
                      <span>Registration Terminal</span>
                    </Link>
                    <Link
                      href="/scanning"
                      onClick={() => { setMode("scanning"); setSwitcherOpen(false); }}
                      className={cn(
                        "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-bold transition-colors",
                        pathname.startsWith("/scanning") ? "bg-[var(--pri)] text-[var(--primary-contrast)]" : "text-[var(--text)] hover:bg-[var(--raised)]"
                      )}
                    >
                      <CheckSquare className="size-4 shrink-0" />
                      <span>Scanning Terminal</span>
                    </Link>
                    <Link
                      href="/self-checkin"
                      onClick={() => { setMode("self_checkin"); setSwitcherOpen(false); }}
                      className={cn(
                        "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-bold transition-colors",
                        pathname.startsWith("/self-checkin") ? "bg-[var(--pri)] text-[var(--primary-contrast)]" : "text-[var(--text)] hover:bg-[var(--raised)]"
                      )}
                    >
                      <Users className="size-4 shrink-0" />
                      <span>Self Check-in + Printing</span>
                    </Link>
                    <Link
                      href="/admin"
                      onClick={() => { setMode("admin"); setSwitcherOpen(false); }}
                      className={cn(
                        "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-bold transition-colors",
                        pathname.startsWith("/admin") ? "bg-[var(--pri)] text-[var(--primary-contrast)]" : "text-[var(--text)] hover:bg-[var(--raised)]"
                      )}
                    >
                      <Settings className="size-4 shrink-0" />
                      <span>Admin Console</span>
                    </Link>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* Navigation Items Organized by Groups */}
          <nav
            aria-label="Admin Navigation"
            className={cn("no-scrollbar min-h-0 flex-1", isCollapsed ? "overflow-visible" : "overflow-y-auto overflow-x-hidden")}
          >
            {navGroups.map((group) => (
              <section key={group.label} className="mb-4">
                {!isCollapsed && (
                  <h2 className="mb-1.5 px-3 text-[10px] font-extrabold uppercase tracking-[0.14em] text-[var(--muted)]">
                    {group.label}
                  </h2>
                )}
                <div className="space-y-1">
                  {group.items.map((navItem) => {
                    const Icon = navItem.icon;
                    const active = pathname === navItem.href;
                    return (
                      <Link
                        key={navItem.href}
                        href={navItem.href}
                        className={cn(
                          "group relative flex h-9 items-center rounded-lg px-3 text-xs font-bold transition-colors uppercase tracking-wider",
                          active
                            ? "bg-[var(--pri)] text-[var(--primary-contrast)] shadow-[inset_0_0_0_1px_var(--border)]"
                            : "text-[var(--muted)] hover:bg-[var(--raised)] hover:text-[var(--text)]",
                          isCollapsed && "justify-center px-0"
                        )}
                      >
                        <Icon className={cn("size-4 shrink-0", !isCollapsed && "mr-3")} />
                        {!isCollapsed && <span className="truncate">{navItem.name}</span>}
                        {isCollapsed && <CollapsedTooltip label={navItem.name} />}
                      </Link>
                    );
                  })}
                </div>
              </section>
            ))}
          </nav>

          <div className="shrink-0 border-t border-[var(--border)] pt-2">
            <div className="space-y-1 pb-2">
              {[
                { name: "Documentation", href: "/admin/documentation", icon: BookOpen },
                { name: "Settings", href: "/admin/settings", icon: Settings },
              ].map((item) => {
                const Icon = item.icon;
                const active = pathname === item.href;
                return (
                  <Link key={item.href} href={item.href} className={cn(
                    "group relative flex h-9 items-center rounded-lg px-3 text-xs font-bold uppercase tracking-wider transition-colors",
                    active ? "bg-[var(--pri)] text-[var(--primary-contrast)]" : "text-[var(--muted)] hover:bg-[var(--raised)] hover:text-[var(--text)]",
                    isCollapsed && "justify-center px-0"
                  )}>
                    <Icon className={cn("size-4 shrink-0", !isCollapsed && "mr-3")} />
                    {!isCollapsed && <span>{item.name}</span>}
                    {isCollapsed && <CollapsedTooltip label={item.name} />}
                  </Link>
                );
              })}
            </div>
            <div className="border-t border-[var(--border)] pt-2 text-center text-[10px] text-[var(--muted)] font-mono">
              {!isCollapsed && <span>EventOS v1.0 · Admin Mode</span>}
            </div>
          </div>
        </div>
      </motion.aside>

      {/* Main Container */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Sticky Header Bar */}
        <header className="h-16 bg-[var(--surf)] border-b border-[var(--border)] flex items-center justify-between px-6 shrink-0 gap-4 z-20">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-black uppercase tracking-wider text-[var(--text)]">Admin Console</h2>
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-black uppercase tracking-wide text-emerald-500">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>Server Online</span>
            </div>
          </div>

          {/* Right Header Actions */}
          <div className="flex items-center gap-3 shrink-0">
            {time && (
              <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-xl border border-[var(--border)] bg-[var(--card)] text-xs font-bold text-[var(--text)] font-mono">
                <Clock className="w-3.5 h-3.5 text-[var(--pri)]" />
                <span>
                  {time.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true, timeZone: "Asia/Kolkata" })} IST
                </span>
              </div>
            )}

            <div
              className={cn(
                "hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full border text-[10px] font-black uppercase tracking-wider",
                isConnected
                  ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/30"
                  : "bg-amber-500/10 text-amber-500 border-amber-500/30"
              )}
            >
              {isConnected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
              <span>{isConnected ? "Live Sync" : "Offline"}</span>
            </div>

            {/* Direct 1-Click Light/Dark Mode Toggle */}
            <button
              onClick={() => setTheme(theme === "light" ? "dark" : "light")}
              className="h-10 w-10 rounded-xl border border-[var(--border)] bg-[var(--card)] flex items-center justify-center text-[var(--muted)] hover:text-[var(--text)] hover:border-[var(--pri)] transition-all cursor-pointer"
              title={theme === "light" ? "Switch to Dark Mode" : "Switch to Light Mode"}
            >
              {theme === "light" ? (
                <Moon className="h-4 w-4 text-[var(--pri)]" />
              ) : (
                <Sun className="h-4 w-4 text-amber-400" />
              )}
            </button>

            {/* Profile Menu Dropdown */}
            <div className="relative" ref={userMenuRef}>
              <button
                onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                className="flex items-center gap-2 p-1.5 rounded-xl border border-[var(--border)] bg-[var(--card)] hover:bg-[var(--raised)] transition-all cursor-pointer"
              >
                <div className="h-8 w-8 rounded-lg bg-[var(--pri)] text-[var(--primary-contrast)] flex items-center justify-center font-black text-xs">
                  {((user as any)?.full_name || (user?.first_name ? `${user.first_name} ${user.last_name || ""}`.trim() : "Admin")).slice(0, 2).toUpperCase()}
                </div>
                <div className="hidden lg:block text-left pr-1">
                  <div className="text-xs font-black text-[var(--text)] leading-none">
                    {(user as any)?.full_name || (user?.first_name ? `${user.first_name} ${user.last_name || ""}`.trim() : "Super Admin")}
                  </div>
                  <div className="text-[10px] text-[var(--muted)] font-semibold uppercase mt-0.5">{user?.role || "Administrator"}</div>
                </div>
              </button>

              {/* Profile Dropdown Box */}
              {isUserMenuOpen && (
                <div className="venue-profile-menu absolute right-0 mt-2 w-56 rounded-2xl p-2 z-50 space-y-1">
                  <div className="px-3 py-2 border-b border-[var(--border)]">
                    <p className="text-xs font-black text-[var(--text)]">
                      {(user as any)?.full_name || (user?.first_name ? `${user.first_name} ${user.last_name || ""}`.trim() : "Admin")}
                    </p>
                    <p className="text-[10px] text-[var(--muted)] font-medium truncate">{user?.email || "admin@eventos.com"}</p>
                  </div>

                  <Link href="/admin/settings" onClick={() => setIsUserMenuOpen(false)} className="venue-profile-menu-item text-xs font-bold">
                      <Settings className="w-4 h-4 text-[var(--pri)]" />
                      <span>Admin Settings</span>
                  </Link>

                  <button
                    onClick={handleLogout}
                    className="venue-profile-menu-item danger text-xs font-bold cursor-pointer"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Logout</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Page Content Viewport-Locked */}
        <div className="flex-1 min-h-0 overflow-y-auto bg-[var(--base)] p-4 sm:p-5 w-full custom-scrollbar">
          {children}
        </div>
      </div>

      <FetchEventModal isOpen={isFetchModalOpen} onClose={() => setIsFetchModalOpen(false)} />
    </div>
  );
}

function CollapsedTooltip({ label }: { label: string }) {
  return (
    <span role="tooltip" aria-hidden="true" className="venue-sidebar-tooltip border border-[var(--border)] bg-[var(--card)] text-[var(--text)] shadow-xl">
      {label}
    </span>
  );
}
