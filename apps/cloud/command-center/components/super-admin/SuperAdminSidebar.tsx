"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/use-auth-store";
import {
  LayoutDashboard, Building2, CreditCard, ShieldCheck, Cpu,
  HeadphonesIcon, Settings2, Code2, ChevronDown, Bell, LogOut,
  Sliders, Receipt, TrendingUp, Users2, FileText, Shield, Activity,
  Server, Database, HardDrive, Mail, Ticket, Globe, FileCode2,
  Lock, Settings, Key, HelpCircle, AlertOctagon, RefreshCw, BarChart2,
  Layers, Wallet, Puzzle, Sparkles, Webhook
} from "lucide-react";

interface SidebarItem {
  label: string;
  icon: any;
  href: string;
}

interface SidebarGroup {
  title: string;
  items: {
    label: string;
    icon: any;
    href?: string;
    children?: SidebarItem[];
  }[];
}

const SIDEBAR_NAVIGATION: SidebarGroup[] = [
  {
    title: "Overview",
    items: [
      { label: "Dashboard", icon: LayoutDashboard, href: "/overview" },
    ],
  },
  {
    title: "Management",
    items: [
      { label: "Organizations", icon: Building2, href: "/organizations" },
      {
        label: "Commercial",
        icon: CreditCard,
        children: [
          { label: "Plans", icon: Sliders, href: "/commercial/plans" },
          { label: "Subscriptions", icon: CreditCard, href: "/commercial/subscriptions" },
          { label: "Invoices", icon: Receipt, href: "/commercial/invoices" },
          { label: "Revenue", icon: TrendingUp, href: "/commercial/revenue" },
          { label: "Add-ons", icon: Puzzle, href: "/commercial/plans" },
          { label: "Credits & Wallet", icon: Wallet, href: "/commercial/revenue" },
        ],
      },
    ],
  },
  {
    title: "Platform",
    items: [
      {
        label: "Security",
        icon: ShieldCheck,
        children: [
          { label: "Users", icon: Users2, href: "/security/users" },
          { label: "Audit Logs", icon: FileText, href: "/security/audit" },
          { label: "Security Events", icon: Shield, href: "/security/events" },
          { label: "Impersonation", icon: LogOut, href: "/security/impersonation" },
        ],
      },
      {
        label: "Operations",
        icon: Cpu,
        children: [
          { label: "Infrastructure", icon: Server, href: "/operations/health" },
          { label: "Background Jobs", icon: Activity, href: "/operations/jobs" },
          { label: "Queues", icon: Layers, href: "/operations/jobs" },
          { label: "Database", icon: Database, href: "/operations/database" },
          { label: "Storage", icon: HardDrive, href: "/operations/storage" },
          { label: "Email Delivery", icon: Mail, href: "/operations/health" },
        ],
      },
      {
        label: "Support",
        icon: HeadphonesIcon,
        children: [
          { label: "Tickets", icon: Ticket, href: "/support/tickets" },
          { label: "Customers", icon: Users2, href: "/support/tickets" },
          { label: "Knowledge Base", icon: HelpCircle, href: "/support/tickets" },
          { label: "SLA", icon: AlertOctagon, href: "/support/sla" },
        ],
      },
      {
        label: "Settings",
        icon: Settings2,
        children: [
          { label: "General", icon: Settings, href: "/settings/general" },
          { label: "Security Policies", icon: Lock, href: "/settings/security" },
          { label: "Notifications", icon: Bell, href: "/settings/general" },
          { label: "Feature Catalog", icon: Sliders, href: "/settings/feature-catalog" },
          { label: "Plans Config", icon: Sliders, href: "/settings/general" },
          { label: "Email Templates", icon: Mail, href: "/settings/email-templates" },
          { label: "API Management", icon: Key, href: "/settings/general" },
          { label: "System Config", icon: Settings, href: "/settings/general" },
          { label: "Maintenance", icon: AlertOctagon, href: "/settings/general" },
        ],
      },
    ],
  },
  {
    title: "Developer",
    items: [
      {
        label: "Developer Tools",
        icon: Code2,
        children: [
          { label: "API Analytics", icon: BarChart2, href: "/developer/analytics" },
          { label: "Webhooks", icon: Webhook, href: "/developer/webhooks" },
          { label: "Rate Limits", icon: Lock, href: "/developer/rate-limits" },
          { label: "Integrations", icon: Puzzle, href: "/developer/integrations" },
        ],
      },
    ],
  },
];

export function SuperAdminSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  const toggleGroup = (label: string) => {
    setOpenGroups((prev) => ({ ...prev, [label]: !prev[label] }));
  };

  // Expand group if sub-item is active
  useEffect(() => {
    const activeGroups: Record<string, boolean> = {};
    SIDEBAR_NAVIGATION.forEach((g) => {
      g.items.forEach((item) => {
        if (item.children) {
          const hasActiveChild = item.children.some((child) => pathname === child.href || pathname.startsWith(child.href + "/"));
          if (hasActiveChild) {
            activeGroups[item.label] = true;
          }
        }
      });
    });
    setOpenGroups((prev) => ({ ...prev, ...activeGroups }));
  }, [pathname]);

  const handleLogout = async () => {
    await logout();
    router.push("/login");
  };

  return (
    <div className="w-[240px] h-full bg-[var(--sidebar-bg)] border-r border-[var(--sidebar-border)] flex flex-col justify-between flex-shrink-0 z-40 select-none">
      {/* Top Section */}
      <div className="flex flex-col min-h-0 flex-1">
        <div className="h-16 px-4 border-b border-[var(--sidebar-border)] flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[var(--brand-primary)] flex items-center justify-center shadow-lg shadow-purple-500/10 flex-shrink-0">
            <span className="text-white font-extrabold text-sm">E</span>
          </div>
          <div className="min-w-0">
            <h1 className="text-sm font-bold text-[var(--text-primary)] leading-tight">EventX</h1>
            <p className="text-[10px] text-[var(--text-tertiary)] font-medium">Super Admin</p>
          </div>
        </div>

        {/* Navigation Section */}
        <div className="flex-1 overflow-y-auto py-3 space-y-4 px-2 custom-scrollbar">
          {SIDEBAR_NAVIGATION.map((group) => (
            <div key={group.title} className="space-y-0.5">
              <span className="block text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-tertiary)] px-3 py-1 mt-3 mb-1">
                {group.title}
              </span>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  if (item.href) {
                    const isActive = pathname === item.href;
                    return (
                      <Link
                        key={item.label}
                        href={item.href}
                        className={cn(
                          "flex items-center gap-2.5 h-9 px-3 text-sm font-medium transition-all duration-150 relative",
                          isActive
                            ? "bg-[var(--sidebar-item-active-bg)] border-l-2 border-[var(--sidebar-item-active-border)] rounded-r-lg rounded-l-none text-[var(--text-primary)]"
                            : "text-[var(--text-secondary)] hover:bg-[var(--sidebar-item-hover-bg)] rounded-lg hover:text-[var(--text-primary)]"
                        )}
                      >
                        <Icon className={cn("w-4 h-4", isActive ? "text-[var(--brand-primary)]" : "text-[var(--text-tertiary)]")} />
                        <span className="truncate">{item.label}</span>
                      </Link>
                    );
                  }

                  const isExpanded = !!openGroups[item.label];
                  const hasActiveChild = item.children?.some(
                    (child) => pathname === child.href || pathname.startsWith(child.href + "/")
                  );

                  return (
                    <div key={item.label} className="space-y-0.5">
                      <button
                        onClick={() => toggleGroup(item.label)}
                        className={cn(
                          "w-full flex items-center justify-between h-9 px-3 text-sm font-medium transition-all duration-150 rounded-lg text-[var(--text-secondary)] hover:bg-[var(--sidebar-item-hover-bg)] hover:text-[var(--text-primary)]"
                        )}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Icon className={cn("w-4 h-4", hasActiveChild ? "text-[var(--brand-primary)]" : "text-[var(--text-tertiary)]")} />
                          <span className="truncate">{item.label}</span>
                        </div>
                        <motion.div
                          animate={{ rotate: isExpanded ? 185 : 0 }}
                          transition={{ duration: 0.15, ease: "easeOut" }}
                          className="flex-shrink-0"
                        >
                          <ChevronDown className="w-3.5 h-3.5 opacity-60" />
                        </motion.div>
                      </button>

                      <AnimatePresence initial={false}>
                        {isExpanded && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2, ease: "easeInOut" }}
                            className="overflow-hidden space-y-0.5 pl-6"
                          >
                            {item.children?.map((child) => {
                              const ChildIcon = child.icon;
                              const isChildActive = pathname === child.href || pathname.startsWith(child.href + "/");
                              return (
                                <Link
                                  key={child.label}
                                  href={child.href}
                                  className={cn(
                                    "flex items-center gap-2 h-8 px-3 text-xs font-medium transition-all duration-150 relative",
                                    isChildActive
                                      ? "bg-[var(--sidebar-item-active-bg)] border-l-2 border-[var(--sidebar-item-active-border)] rounded-r-lg rounded-l-none text-[var(--text-primary)] font-semibold"
                                      : "text-[var(--text-secondary)] hover:bg-[var(--sidebar-item-hover-bg)] rounded-lg hover:text-[var(--text-primary)]"
                                  )}
                                >
                                  <ChildIcon className={cn("w-3.5 h-3.5", isChildActive ? "text-[var(--brand-primary)]" : "text-[var(--text-tertiary)]")} />
                                  <span className="truncate">{child.label}</span>
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
            </div>
          ))}
        </div>
      </div>

      {/* Bottom section */}
      <div className="p-3 border-t border-[var(--sidebar-border)] space-y-2 bg-[var(--sidebar-bg)]">
        {/* What's New */}
        <button className="w-full flex items-center justify-between h-9 px-3 rounded-lg hover:bg-[var(--sidebar-item-hover-bg)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-xs font-medium transition-all duration-150">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[var(--brand-primary)]" />
            <span>What's New</span>
          </div>
          <span className="w-2 h-2 rounded-full bg-[var(--brand-primary)] animate-pulse"></span>
        </button>

        {/* User avatar row */}
        <div className="flex items-center justify-between gap-2.5 p-2 rounded-lg bg-surface-2/40 border border-border/20">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-full bg-[var(--brand-primary-muted)] text-[var(--brand-primary)] font-bold text-xs flex items-center justify-center flex-shrink-0 border border-[var(--brand-primary)]/20">
              {user?.email ? user.email.slice(0, 2).toUpperCase() : "SA"}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-[var(--text-primary)] truncate">
                {user?.email?.split("@")[0] || "Super Admin"}
              </p>
              <p className="text-[10px] text-[var(--text-tertiary)] truncate font-medium uppercase tracking-wider">
                {user?.platform_role || "SUPER_ADMIN"}
              </p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="p-1 rounded hover:bg-surface-2 text-[var(--text-secondary)] hover:text-[var(--danger)] transition-all flex-shrink-0"
            title="Log Out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
