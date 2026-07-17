"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname, useParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, Settings, Home, FileSpreadsheet,
  Users, Calendar, MapPin, FileVideo, Mail,
  MonitorPlay, BarChart3, SlidersHorizontal,
  PanelLeft, ChevronLeft, ChevronRight, Box, LogOut, User,
  Bell, FileText, Info, Layout, ClipboardList, Banknote, Megaphone, Palette, ChevronDown,
  Code, ShieldCheck, Building2, CreditCard, Shield, Activity, Database, Search, Terminal, Share2,
  Landmark, DollarSign, Percent, Sparkles, History, Calculator, Network, Grid, Library, KeyRound
} from "lucide-react";

import { useUIStore } from "@/store/useUIStore";
import { useAuthStore } from "@/store/use-auth-store";

export function Sidebar() {
  const pathname = usePathname();
  const previousPathname = useRef(pathname);
  const {
    isSidebarCollapsed,
    isMobileSidebarOpen,
    setMobileSidebarOpen,
    toggleSidebar,
  } = useUIStore();
  const isCollapsed = isSidebarCollapsed && !isMobileSidebarOpen;

  const [openMenus, setOpenMenus] = useState<Record<string, boolean>>({});

  const toggleMenu = (label: string) => {
    setOpenMenus(prev => ({ ...prev, [label]: !prev[label] }));
  };

  const platformRoutes = [
    {
      label: "Dashboard",
      icon: LayoutDashboard,
      subItems: [
        { label: "Overview", icon: LayoutDashboard, href: "/dashboard/overview" },
        { label: "Platform Health", icon: Activity, href: "/dashboard/platform-health" },
        { label: "Live Activity", icon: Bell, href: "/dashboard/live-activity" },
      ]
    },
    {
      label: "Organizations",
      icon: Building2,
      href: "/organizations"
    },
    {
      label: "Business",
      icon: Banknote,
      subItems: [
        { label: "Dashboard", icon: LayoutDashboard, href: "/business/dashboard" },
        { label: "Sales", type: "subheader" },
        { label: "Service Requests", icon: ClipboardList, href: "/business/sales/service-requests" },
        { label: "Quotes", icon: Calculator, href: "/business/sales/quotes/create" },
        { label: "Proposals", icon: FileText, href: "/business/sales/proposals/create" },
        { label: "Pricing", type: "subheader" },
        { label: "Hardware Catalog", icon: Box, href: "/business/pricing/hardware-catalog" },
        { label: "Staff Catalog", icon: Users, href: "/business/pricing/staff-catalog" },
        { label: "Templates", icon: Library, href: "/business/pricing/templates" },
        { label: "Pricing Simulator", icon: Calculator, href: "/business/pricing/pricing-simulator" },
        { label: "Saved Simulations", icon: History, href: "/business/pricing/saved-simulations" },
        { label: "Subscription", type: "subheader" },
        { label: "Plans", icon: SlidersHorizontal, href: "/business/subscription/plans" },
        { label: "Add-ons", icon: CreditCard, href: "/business/subscription/add-ons" },
        { type: "divider" },
        { label: "Revenue", icon: BarChart3, href: "/business/revenue" }
      ]
    },
    {
      label: "Finance",
      icon: Landmark,
      subItems: [
        { label: "Invoices", icon: FileSpreadsheet, href: "/finance/invoices" },
        { label: "Transactions", icon: DollarSign, href: "/finance/transactions" },
        { label: "Payments", icon: CreditCard, href: "/finance/payments" },
        { label: "Refunds", icon: DollarSign, href: "/finance/transactions" },
        { label: "Taxes", icon: Percent, href: "/finance/taxes" },
      ]
    },
    {
      label: "Operations Center",
      icon: Settings,
      subItems: [
        { label: "Overview", icon: LayoutDashboard, href: "/operations-center" },
        { label: "Requests", icon: FileText, href: "/operations-center/requests" },
        { label: "Venue Readiness", icon: Activity, href: "/operations-center/venue-readiness" },
        { label: "Risk Analysis", icon: Shield, href: "/operations-center/risk-analysis" },
        { label: "Jobs", icon: ClipboardList, href: "/operations-center/jobs" },
        { label: "Database", icon: Database, href: "/operations-center/database" },
        { label: "Storage & Queues", icon: Box, href: "/operations-center/storage" },
        { label: "Search Jobs", icon: Search, href: "/operations-center/search" },
      ]
    },
    {
      label: "Identity & Security",
      icon: ShieldCheck,
      subItems: [
        { label: "Users", icon: Users, href: "/identity-security/users" },
        { label: "Roles", icon: ShieldCheck, href: "/identity-security/roles" },
        { label: "Permissions", icon: Shield, href: "/identity-security/permissions" },
        { label: "Audit Logs", icon: FileText, href: "/identity-security/audit-logs" },
        { label: "Security Events", icon: Bell, href: "/identity-security/security-events" },
        { label: "Impersonation", icon: User, href: "/identity-security/impersonation" },
        { label: "Access Reviews", icon: KeyRound, href: "/identity-security/access-reviews" },
      ]
    },
    {
      label: "Developer Platform",
      icon: Terminal,
      subItems: [
        { label: "API Catalog", icon: FileText, href: "/developer-platform/apis" },
        { label: "API Keys", icon: SlidersHorizontal, href: "/developer-platform/api-keys" },
        { label: "Webhooks", icon: Megaphone, href: "/developer-platform/webhooks" },
        { label: "Integrations", icon: Share2, href: "/developer-platform/integrations" },
        { label: "Logs", icon: FileText, href: "/developer-platform/logs" },
      ]
    },
    {
      label: "Support Center",
      icon: Info,
      subItems: [
        { label: "Tickets", icon: ClipboardList, href: "/support-center/tickets" },
        { label: "Knowledge Base", icon: Shield, href: "/support-center/knowledge-base" },
        { label: "Announcements", icon: Bell, href: "/support-center/announcements" },
      ]
    },
    {
      label: "Platform Settings",
      icon: Palette,
      subItems: [
        { label: "General", icon: Settings, href: "/platform-settings/general" },
        { label: "Branding", icon: Palette, href: "/platform-settings/branding" },
        { label: "Localization", icon: Info, href: "/platform-settings/localization" },
        { label: "Notifications", icon: Mail, href: "/platform-settings/notifications" },
        { label: "Authentication", icon: ShieldCheck, href: "/platform-settings/authentication" },
      ]
    },
  ];

  const currentRoutes = platformRoutes;

  const bottomRoutes = [
    { label: "UI Catalogue", icon: Palette, href: "/design-system" },
  ];

  useEffect(() => {
    if (!pathname) return;
    const newOpen: Record<string, boolean> = {};
    currentRoutes.forEach((route: any) => {
      if (route.subItems && route.subItems.some((sub: any) => sub.href && pathname.startsWith(sub.href))) {
        newOpen[route.label] = true;
      }
    });

    setOpenMenus(prev => {
      const needsUpdate = Object.keys(newOpen).some(key => !prev[key]);
      if (needsUpdate) {
        return { ...prev, ...newOpen };
      }
      return prev;
    });
  }, [pathname]);

  useEffect(() => {
    if (previousPathname.current !== pathname) {
      setMobileSidebarOpen(false);
      previousPathname.current = pathname;
    }
  }, [pathname, setMobileSidebarOpen]);


  return (
    <motion.aside
      initial={false}
      animate={{ width: isCollapsed ? 80 : 288 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className="relative flex h-full flex-col border-r border-[var(--sidebar-border)] rounded-none z-40 bg-[var(--sidebar-bg)] overflow-hidden"
    >
      <div className="flex flex-col h-full px-4 py-8 overflow-hidden">
        {/* Logo Section */}
        <div className={cn(
          "mb-10 flex items-center px-2",
          isCollapsed ? "flex-col gap-4 justify-center" : "flex-row justify-between"
        )}>
          <div className="flex items-center gap-3">
            {/* Custom Logo Image */}
            <div className="relative shrink-0 flex items-center">
              {isCollapsed ? (
                <img
                  src="/logo-icon.png"
                  alt="Logo"
                  className="h-8 w-8 object-contain"
                  onError={(e) => {
                    e.currentTarget.src = "/logo/1.png";
                  }}
                />
              ) : (
                <img
                  src="/logo.png"
                  alt="Logo"
                  className="h-8 w-auto max-w-[160px] object-contain"
                  onError={(e) => {
                    e.currentTarget.src = "/logo/1.png";
                  }}
                />
              )}
            </div>
          </div>

          <motion.button
            whileHover={{ scale: 1.05, backgroundColor: "rgba(255,255,255,0.06)" }}
            whileTap={{ scale: 0.95 }}
            onClick={toggleSidebar}
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--card)]/70 text-[var(--muted)] transition-all hover:text-[var(--text)]",
              isCollapsed ? "mt-2" : ""
            )}
            aria-label={isCollapsed ? "Expand navigation" : "Collapse navigation"}
            title={isCollapsed ? "Expand navigation" : "Collapse navigation"}
          >
            {isCollapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </motion.button>
        </div>

        {/* Navigation Items */}
        <nav aria-label="Command Center" className="flex-1 space-y-1.5 overflow-y-auto no-scrollbar py-2">
          {currentRoutes.map((route: any) => {
            const hasSubItems = !!route.subItems;

            // If it has sub-items, render collapsible folder
            if (hasSubItems && route.subItems) {
              const isAnySubActive = route.subItems.some((sub: any) => sub.href && pathname === sub.href);
              const isOpen = !!openMenus[route.label];

              return (
                <div key={route.label} className="space-y-1 w-full">
                  {/* Parent Toggle Button */}
                  <div className="group relative">
                    <motion.button
                      type="button"
                      whileHover={{ x: isCollapsed ? 0 : 2 }}
                      onClick={() => !isCollapsed && toggleMenu(route.label)}
                      aria-expanded={isCollapsed ? undefined : isOpen}
                      aria-controls={isCollapsed ? undefined : `nav-${route.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                      aria-label={isCollapsed ? route.label : undefined}
                      className={cn(
                        "relative flex items-center h-10 w-full rounded-xl px-3 transition-all duration-300 preserve-3d text-left",
                        isCollapsed
                          ? "hover:bg-white/5"
                          : "mt-4 mb-2"
                      )}
                    >
                      {isCollapsed ? (
                        /* Collapsed Mode Folder Icon */
                        <route.icon className={cn(
                          "h-5 w-5 shrink-0 mx-auto transition-all duration-300",
                          isAnySubActive ? "text-[var(--pri)] drop-shadow-[0_0_8px_color-mix(in_srgb,var(--pri)_40%,transparent)]" : "text-[var(--muted)] group-hover:text-[var(--text)]"
                        )} />
                      ) : (
                        /* Expanded Mode: Section Header Label with Chevron */
                        <div className="flex items-center justify-between flex-1">
                          <span className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-[var(--muted)]/60 hover:text-[var(--text)] transition-colors">
                            {route.label}
                          </span>
                          <motion.div
                            animate={{ rotate: isOpen ? 180 : 0 }}
                            transition={{ duration: 0.2 }}
                          >
                            <ChevronDown className="h-3 w-3 text-[var(--muted)]/80" />
                          </motion.div>
                        </div>
                      )}

                      {/* Tooltip + Dropdown for collapsed mode */}
                      {isCollapsed && (
                        <div className="absolute left-20 z-[70] invisible min-w-[165px] space-y-1 rounded-xl border border-[var(--border)] bg-[var(--surf)] p-2 text-left text-[11px] font-bold opacity-0 shadow-2xl transition-all duration-300 group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
                          <span className="text-[9px] font-extrabold uppercase tracking-wider text-[var(--pri)] px-2 py-1 border-b border-[var(--border)] mb-1 block">
                            {route.label}
                          </span>
                          {route.subItems.filter((sub: any) => !sub.type).map((sub: any) => (
                            <Link key={`${sub.label}-${sub.href}`} href={sub.href} className={cn(
                              "block px-2.5 py-2 rounded-lg transition-all text-xs font-bold",
                              pathname === sub.href ? "bg-[var(--pri)]/10 text-[var(--pri)]" : "text-[var(--muted)] hover:bg-[var(--card)] hover:text-[var(--text)]"
                            )}>
                              {sub.label}
                            </Link>
                          ))}
                        </div>
                      )}
                    </motion.button>
                  </div>

                  {/* Subitems container */}
                  <AnimatePresence initial={false}>
                    {!isCollapsed && isOpen && (
                      <motion.div
                        id={`nav-${route.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden pl-3 space-y-1"
                      >
                        {route.subItems.map((sub: any, idx: number) => {
                          if (sub.type === "subheader") {
                            return (
                              <div key={sub.label} className="text-[9px] font-black uppercase tracking-[0.2em] text-[var(--muted)]/50 pl-3 pt-3 pb-1">
                                {sub.label}
                              </div>
                            );
                          }
                          if (sub.type === "divider") {
                            return (
                              <div key={`div-${idx}`} className="h-[1px] bg-border/20 my-2" />
                            );
                          }
                          const isSubActive = pathname === sub.href;
                          return (
                            <Link key={`${sub.label}-${sub.href}`} href={sub.href} className="block group/sub">
                              <div className={cn(
                                "flex items-center h-10 px-3 rounded-xl text-[12px] font-bold tracking-wide transition-all duration-250",
                                isSubActive
                                  ? "bg-[var(--sidebar-item-active-bg)] border border-[var(--sidebar-item-active-border)]/20 text-[var(--text)]"
                                  : "text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--sidebar-item-hover-bg)]/50"
                              )}>
                                <sub.icon className={cn(
                                  "h-4 w-4 shrink-0 mr-3 transition-colors duration-200",
                                  isSubActive ? "text-[var(--text)]" : "text-[var(--muted)] group-hover/sub:text-[var(--text)]"
                                )} />
                                <span>{sub.label}</span>
                              </div>
                            </Link>
                          );
                        })}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            }

            // Normal Route rendering
            const isActive = pathname === route.href;
            return (
              <Link key={route.href} href={route.href || "#"} className="block group">
                <motion.div
                  whileHover={{ x: isCollapsed ? 0 : 4 }}
                  className={cn(
                    "relative flex items-center h-11 rounded-xl px-3 transition-all duration-300 preserve-3d",
                    isActive
                      ? "bg-[var(--sidebar-item-active-bg)] border border-[var(--sidebar-item-active-border)]/20 text-[var(--text)] font-semibold"
                      : "text-[var(--muted)] hover:bg-[var(--sidebar-item-hover-bg)]/50 hover:text-[var(--text)]"
                  )}
                >
                  <route.icon className={cn(
                    "h-4 w-4 shrink-0 transition-colors duration-300",
                    isCollapsed ? "mx-auto" : "mr-4",
                    isActive ? "text-[var(--text)]" : "text-[var(--muted)] group-hover:text-[var(--text)]"
                  )} />

                  {!isCollapsed && (
                    <div className="flex items-center justify-between flex-1">
                      <span className="text-[12.5px] font-bold tracking-wide">
                        {route.label}
                      </span>
                      {(route as any).isNew && (
                        <span className="bg-[var(--pri)] text-[var(--primary-foreground)] text-[8px] font-black px-1.5 py-0.5 rounded-full uppercase tracking-tighter">New</span>
                      )}
                    </div>
                  )}

                  {/* Tooltip for collapsed mode */}
                  {isCollapsed && (
                    <div className="absolute left-20 z-50 invisible opacity-0 group-hover:visible group-hover:opacity-100 transition-all duration-300 px-3 py-2 bg-[var(--surf)] border border-[var(--border)] rounded-lg text-[11px] font-bold text-[var(--text)] whitespace-nowrap shadow-2xl">
                      {route.label}
                    </div>
                  )}
                </motion.div>
              </Link>
            );
          })}
        </nav>

        {/* Bottom Navigation (Settings & Docs) */}
        <div className="mt-auto space-y-1.5 border-t border-[var(--border)] pt-4 pb-4">
          {bottomRoutes.map((route) => {
            const isActive = pathname === route.href;
            return (
              <Link key={route.href} href={route.href} className="block group">
                <motion.div
                  whileHover={{ x: isCollapsed ? 0 : 4 }}
                  className={cn(
                    "relative flex items-center h-11 rounded-xl px-3 transition-all duration-300",
                    isActive
                      ? "bg-gradient-to-r from-[var(--pri)] to-[var(--sec)] text-white shadow-[0_4px_12px_color-mix(in_srgb,var(--pri)_20%,transparent)]"
                      : "text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--card)]/30"
                  )}
                >
                  <route.icon className={cn(
                    "h-4 w-4 shrink-0 transition-colors duration-200",
                    isCollapsed ? "mx-auto" : "mr-4",
                    isActive ? "text-white" : "text-[var(--muted)] group-hover:text-[var(--text)]"
                  )} />
                  {!isCollapsed && (
                    <span className="text-[12px] font-bold tracking-wide">{route.label}</span>
                  )}
                </motion.div>
              </Link>
            );
          })}
        </div>
      </div>

      <style jsx global>{`
        aside, .no-scrollbar {
          scrollbar-width: none;
          -ms-overflow-style: none;
        }
        aside::-webkit-scrollbar, .no-scrollbar::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </motion.aside>
  );
}
