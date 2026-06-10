"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/store/useUIStore";
import {
  LayoutDashboard, Building2, Calendar, CreditCard,
  AppWindow, Code2, ShieldCheck, Cpu, HeadphonesIcon,
  Settings2, ChevronDown, ChevronLeft, ChevronRight,
  Users2, BarChart3, Receipt, TrendingUp, Flag,
  Key, Webhook, Shield, FileText, Search, Activity,
  Heart, Ticket, Sliders, Bell, LogOut, Home,
} from "lucide-react";
import { useAuthStore } from "@/store/use-auth-store";

// ── Navigation Tree ───────────────────────────────────────────

const NAV_GROUPS = [
  {
    id: "dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    href: "/super-admin",
  },
  {
    id: "organizations",
    label: "Organizations",
    icon: Building2,
    children: [
      { label: "All Organizations", icon: Building2, href: "/super-admin/organizations" },
    ],
  },
  {
    id: "events",
    label: "Events",
    icon: Calendar,
    children: [
      { label: "Event Explorer", icon: Calendar, href: "/super-admin/events" },
    ],
  },
  {
    id: "commercial",
    label: "Commercial",
    icon: CreditCard,
    children: [
      { label: "Subscription Plans", icon: Sliders, href: "/super-admin/commercial/plans" },
      { label: "Active Subscriptions", icon: CreditCard, href: "/super-admin/commercial/subscriptions" },
      { label: "Invoices", icon: Receipt, href: "/super-admin/commercial/invoices" },
      { label: "Revenue Analytics", icon: TrendingUp, href: "/super-admin/commercial/revenue" },
    ],
  },
  {
    id: "applications",
    label: "Applications",
    icon: AppWindow,
    children: [
      { label: "Application Registry", icon: AppWindow, href: "/super-admin/applications/registry" },
      { label: "Feature Flags", icon: Flag, href: "/super-admin/applications/feature-flags" },
    ],
  },
  {
    id: "developer",
    label: "Developer",
    icon: Code2,
    children: [
      { label: "API Keys", icon: Key, href: "/super-admin/developer" },
    ],
  },
  {
    id: "security",
    label: "Security",
    icon: ShieldCheck,
    children: [
      { label: "Global Users", icon: Users2, href: "/super-admin/security/users" },
      { label: "Audit Logs", icon: FileText, href: "/super-admin/security/audit" },
      { label: "Security Events", icon: Shield, href: "/super-admin/security/events" },
      { label: "Impersonation", icon: LogOut, href: "/super-admin/security/impersonation" },
    ],
  },
  {
    id: "operations",
    label: "Operations",
    icon: Cpu,
    children: [
      { label: "Jobs Monitor", icon: Activity, href: "/super-admin/operations/jobs" },
      { label: "Search Indexes", icon: Search, href: "/super-admin/operations/search" },
      { label: "System Health", icon: Heart, href: "/super-admin/operations/health" },
    ],
  },
  {
    id: "support",
    label: "Support",
    icon: HeadphonesIcon,
    children: [
      { label: "Support Tickets", icon: Ticket, href: "/super-admin/support" },
    ],
  },
  {
    id: "settings",
    label: "Settings",
    icon: Settings2,
    children: [
      { label: "Platform Settings", icon: Settings2, href: "/super-admin/settings" },
    ],
  },
];

// ── Component ─────────────────────────────────────────────────

export function SuperAdminSidebar() {
  const pathname = usePathname();
  const { isSidebarCollapsed: isCollapsed, toggleSidebar } = useUIStore();
  const { user } = useAuthStore();
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  const toggle = (id: string) =>
    setOpenGroups((prev) => ({ ...prev, [id]: !prev[id] }));

  // Auto-open group if a child is active
  useEffect(() => {
    if (!pathname) return;
    const updates: Record<string, boolean> = {};
    NAV_GROUPS.forEach((g) => {
      if (g.children?.some((c) => pathname.startsWith(c.href))) {
        updates[g.id] = true;
      }
    });
    setOpenGroups((prev) => ({ ...prev, ...updates }));
  }, [pathname]);

  return (
    <motion.aside
      initial={false}
      animate={{ width: isCollapsed ? 80 : 288 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className="relative flex h-full flex-col border-r border-[var(--border)] z-40 bg-[var(--surf)] overflow-hidden"
    >
      <div className="flex flex-col h-full px-3 py-6 overflow-hidden">

        {/* Header */}
        <div className={cn(
          "mb-8 flex items-center px-2",
          isCollapsed ? "flex-col gap-4 justify-center" : "justify-between"
        )}>
          <div className="flex items-center gap-2">
            {isCollapsed ? (
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-purple-500 to-violet-600 flex items-center justify-center shadow-lg shadow-purple-500/20">
                <ShieldCheck className="w-4 h-4 text-white" />
              </div>
            ) : (
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-purple-500 to-violet-600 flex items-center justify-center shadow-lg shadow-purple-500/20">
                  <ShieldCheck className="w-4 h-4 text-white" />
                </div>
                <div>
                  <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[var(--pri)]">Super Admin</p>
                  <p className="text-[9px] text-white/30 font-mono">Control Plane</p>
                </div>
              </div>
            )}
          </div>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={toggleSidebar}
            className={cn(
              "h-7 w-7 flex items-center justify-center rounded-full border border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] transition-all bg-[var(--card)]/40",
              isCollapsed ? "mt-2" : ""
            )}
          >
            {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </motion.button>
        </div>

        {/* Back to Main */}
        {!isCollapsed && (
          <Link href="/dashboard" className="block mb-4 group">
            <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-white/30 hover:text-white/60 hover:bg-white/5 transition-all text-[11px] font-bold">
              <Home className="w-3.5 h-3.5" />
              <span>Back to Platform</span>
            </div>
          </Link>
        )}

        {/* Divider */}
        <div className="h-px bg-white/5 mb-4" />

        {/* Navigation */}
        <div className="flex-1 overflow-y-auto no-scrollbar space-y-0.5">
          {NAV_GROUPS.map((group) => {
            const Icon = group.icon;
            const isDirectLink = !group.children;

            if (isDirectLink) {
              const isActive = pathname === group.href;
              return (
                <Link key={group.id} href={group.href!} className="block group">
                  <motion.div
                    whileHover={{ x: isCollapsed ? 0 : 3 }}
                    className={cn(
                      "flex items-center h-11 rounded-xl px-3 transition-all duration-200",
                      isActive
                        ? "bg-gradient-to-r from-purple-600 to-violet-600 text-white shadow-[0_4px_15px_rgba(139,92,246,0.3)]"
                        : "text-white/40 hover:bg-white/5 hover:text-white"
                    )}
                  >
                    <Icon className={cn("h-4 w-4 shrink-0", isCollapsed ? "mx-auto" : "mr-3")} />
                    {!isCollapsed && (
                      <span className="text-[12.5px] font-bold">{group.label}</span>
                    )}
                    {isCollapsed && (
                      <div className="absolute left-20 z-50 invisible opacity-0 group-hover:visible group-hover:opacity-100 transition-all duration-200 px-3 py-2 bg-[var(--surf)] border border-[var(--border)] rounded-lg text-[11px] font-bold text-white whitespace-nowrap shadow-2xl">
                        {group.label}
                      </div>
                    )}
                  </motion.div>
                </Link>
              );
            }

            // Group with children
            const isAnyChildActive = group.children!.some((c) => pathname.startsWith(c.href));
            const isOpen = !!openGroups[group.id];

            return (
              <div key={group.id} className="space-y-0.5">
                <div className="group relative">
                  <motion.button
                    onClick={() => !isCollapsed && toggle(group.id)}
                    className={cn(
                      "relative flex items-center h-10 w-full rounded-xl px-3 transition-all duration-200 text-left",
                      isCollapsed ? "hover:bg-white/5" : "mt-3 mb-1"
                    )}
                  >
                    {isCollapsed ? (
                      <Icon className={cn(
                        "h-4 w-4 shrink-0 mx-auto transition-all",
                        isAnyChildActive ? "text-purple-400" : "text-white/30 group-hover:text-white/60"
                      )} />
                    ) : (
                      <div className="flex items-center justify-between flex-1">
                        <span className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-white/30">
                          {group.label}
                        </span>
                        <motion.div animate={{ rotate: isOpen ? 180 : 0 }} transition={{ duration: 0.15 }}>
                          <ChevronDown className="h-3 w-3 text-white/20" />
                        </motion.div>
                      </div>
                    )}

                    {/* Collapsed tooltip */}
                    {isCollapsed && (
                      <div className="absolute left-20 z-[70] invisible opacity-0 group-hover:visible group-hover:opacity-100 transition-all duration-200 p-2 rounded-xl text-[11px] font-bold shadow-2xl border border-[var(--border)] bg-[var(--surf)] min-w-[180px] space-y-1 text-left flex flex-col pointer-events-auto">
                        <span className="text-[9px] font-extrabold uppercase tracking-wider text-purple-400 px-2 py-1 border-b border-white/5 mb-1 block">
                          {group.label}
                        </span>
                        {group.children!.map((child) => (
                          <Link
                            key={child.href}
                            href={child.href}
                            className={cn(
                              "block px-2.5 py-2 rounded-lg transition-all text-xs font-bold",
                              pathname.startsWith(child.href)
                                ? "bg-purple-500/10 text-purple-300"
                                : "text-white/40 hover:bg-white/5 hover:text-white"
                            )}
                          >
                            {child.label}
                          </Link>
                        ))}
                      </div>
                    )}
                  </motion.button>
                </div>

                <AnimatePresence initial={false}>
                  {!isCollapsed && isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.15 }}
                      className="overflow-hidden pl-3 space-y-0.5"
                    >
                      {group.children!.map((child) => {
                        const ChildIcon = child.icon;
                        const isChildActive = pathname.startsWith(child.href);
                        return (
                          <Link key={child.href} href={child.href} className="block group/sub">
                            <div className={cn(
                              "flex items-center h-9 px-3 rounded-xl text-[12px] font-semibold tracking-wide transition-all duration-150",
                              isChildActive
                                ? "bg-gradient-to-r from-purple-600/80 to-violet-600/80 text-white shadow-[0_2px_8px_rgba(139,92,246,0.2)]"
                                : "text-white/35 hover:text-white hover:bg-white/5"
                            )}>
                              <ChildIcon className={cn(
                                "h-3.5 w-3.5 shrink-0 mr-2.5",
                                isChildActive ? "text-white" : "text-white/30 group-hover/sub:text-white"
                              )} />
                              <span>{child.label}</span>
                            </div>
                          </Link>
                        );
                      })}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        {!isCollapsed && (
          <div className="mt-4 pt-4 border-t border-white/5">
            <div className="px-3 py-2 rounded-xl bg-purple-500/5 border border-purple-500/10">
              <p className="text-[9px] font-black uppercase tracking-widest text-purple-400/60 mb-1">Logged in as</p>
              <p className="text-[11px] font-bold text-white/60 truncate">{user?.email}</p>
              <p className="text-[9px] text-purple-400/50 font-mono uppercase tracking-wider mt-0.5">
                {user?.platform_role || "SUPER_ADMIN"}
              </p>
            </div>
          </div>
        )}
      </div>

      <style jsx global>{`
        .no-scrollbar { scrollbar-width: none; -ms-overflow-style: none; }
        .no-scrollbar::-webkit-scrollbar { display: none; }
      `}</style>
    </motion.aside>
  );
}
