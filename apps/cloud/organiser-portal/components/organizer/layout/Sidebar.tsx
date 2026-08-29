"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  Award,
  Banknote,
  BarChart3,
  Bell,
  Box,
  Building2,
  Calendar,
  CheckCircle2,
  CheckSquare,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Code2,
  CreditCard,
  Download,
  FileSpreadsheet,
  FileText,
  FolderOpen,
  Globe,
  Grid2X2,
  Home,
  Inbox,
  Image as ImageIcon,
  Layers,
  Layout,
  LayoutDashboard,
  LayoutTemplate,
  Link2,
  ListOrdered,
  Lock,
  Mail,
  MapPin,
  Megaphone,
  Mic,
  Palette,
  QrCode,
  Receipt,
  Send,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Tag,
  TrendingUp,
  Tv,
  UploadCloud,
  User,
  UserCheck,
  Users,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/store/useUIStore";
import { useAuthStore } from "@/store/use-auth-store";
import { usePermissions } from "@/hooks/usePermissions";
import { useEvent } from "@/hooks/useEvents";
import { PERMISSIONS, type PermissionCode } from "@/lib/permissions";
import {
  capabilityForPath,
  useEventCapabilities,
  useFeatureAccess,
} from "@/lib/capabilities";
import { EventSelector } from "./EventSelector";

export type NavItem = {
  label: string;
  href?: string;
  icon: any;
  permission?: PermissionCode;
  featureKey?: string;
  subItems?: NavItem[];
};

export type NavSection = {
  title: string;
  items: NavItem[];
};

export type PrimaryServiceKey =
  | "home"
  | "registration"
  | "speakers"
  | "abstracts"
  | "program"
  | "communications"
  | "design"
  | "venue-ops"
  | "payments"
  | "reports"
  | "integrations"
  | "settings";

export interface PrimaryServiceConfig {
  key: PrimaryServiceKey;
  label: string;
  icon: any;
  defaultHref: (eventId: string) => string;
  permission?: PermissionCode;
  sections: (eventId: string) => NavSection[];
}

export function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const previousPathname = useRef(pathname);
  const params = useParams();
  const eventId = params?.eventId as string | undefined;

  const {
    isSidebarCollapsed,
    isMobileOpen,
    setMobileOpen,
    toggleSidebar,
    isSecondarySidebarOpen,
    setSecondarySidebarOpen,
    selectedEventService,
    setSelectedEventService,
  } = useUIStore();

  const isCollapsed = isSidebarCollapsed && !isMobileOpen;
  const isEventWorkspace = Boolean(eventId);
  const isPlatformWorkspace = !isEventWorkspace;

  useEffect(() => {
    if (previousPathname.current !== pathname) {
      setMobileOpen(false);
      previousPathname.current = pathname;
    }
  }, [pathname, setMobileOpen]);

  // Platform workspace canonical routes (Required by organiser audit gate)
  const platformRoutes: NavItem[] = [
    { label: "Home", icon: Home, href: "/dashboard" },
    { label: "Organisation", icon: Globe, href: "/organisation/profile" },
    {
      label: "People & Teams",
      icon: Users,
      href: "/people-teams/users",
      permission: PERMISSIONS.USERS_VIEW,
    },
    {
      label: "Access & Roles",
      icon: ShieldCheck,
      href: "/access-roles/roles",
      permission: PERMISSIONS.USERS_VIEW,
    },
    {
      label: "Plans & Entitlements",
      icon: LayoutTemplate,
      href: "/plans-entitlements/overview",
    },
    {
      label: "Events",
      icon: Calendar,
      href: "/events",
      permission: PERMISSIONS.EVENTS_VIEW,
    },
    { label: "Billing", icon: Banknote, href: "/billing/overview" },
    { label: "Settings", icon: Settings, href: "/settings/general" },
  ];

  // Event workspace primary services definition (eventRoutes)
  const eventRoutes: PrimaryServiceConfig[] = useMemo(() => [
    {
      key: "home",
      label: "Event Home",
      icon: Home,
      defaultHref: (id) => `/events/${id}/dashboard`,
      sections: (id) => [
        {
          title: "WORKSPACE",
          items: [
            { label: "Overview", href: `/events/${id}/dashboard`, icon: Home },
            { label: "Setup Checklist", href: `/events/${id}/setup`, icon: CheckCircle2, permission: PERMISSIONS.SETTINGS_EDIT },
            { label: "Planning & Details", href: `/events/${id}/planning/details`, icon: FileSpreadsheet, permission: PERMISSIONS.SETTINGS_EDIT },
            { label: "Timeline & Milestones", href: `/events/${id}/planning/timeline`, icon: Clock, permission: PERMISSIONS.SETTINGS_EDIT },
          ],
        },
      ],
    },
    {
      key: "program",
      label: "Program",
      icon: Calendar,
      defaultHref: (id) => `/events/${id}/program`,
      permission: PERMISSIONS.SESSIONS_VIEW,
      sections: (id) => [
        {
          title: "WORKSPACE",
          items: [
            { label: "Program Overview", href: `/events/${id}/program/dashboard`, icon: Home },
            { label: "Master Agenda", href: `/events/${id}/program/agenda`, icon: Calendar },
            { label: "Session Builder", href: `/events/${id}/program/builder`, icon: Layers },
          ],
        },
        {
          title: "VENUES & TRACKS",
          items: [
            { label: "Room Allocations", href: `/events/${id}/program/rooms`, icon: Building2 },
            { label: "Conference Tracks", href: `/events/${id}/program/tracks`, icon: ListOrdered },
          ],
        },
        {
          title: "SETTINGS",
          items: [
            { label: "Program Settings", href: `/events/${id}/settings`, icon: SlidersHorizontal },
          ],
        },
      ],
    },
    {
      key: "registration",
      label: "Registration",
      icon: Users,
      defaultHref: (id) => `/events/${id}/registration/dashboard`,
      sections: (id) => [
        {
          title: "WORKSPACE",
          items: [
            { label: "Dashboard", href: `/events/${id}/registration/dashboard`, icon: LayoutDashboard },
            { label: "Attendee Roster", href: `/events/${id}/registration/participants`, icon: Users },
            { label: "Capacity & Approval", href: `/events/${id}/registration/review`, icon: UserCheck },
          ],
        },
        {
          title: "REGISTRATION MANAGEMENT",
          items: [
            { label: "Role Categories", href: `/events/${id}/registration/roles`, icon: ShieldCheck },
            { label: "Pass Categories", href: `/events/${id}/registration/categories`, icon: Tag },
            { label: "Custom Forms", href: `/events/${id}/registration/form-builder`, icon: FileText },
            { label: "Template Designer", href: `/events/${id}/registration/template-designer`, icon: LayoutTemplate },
            { label: "Certificates", href: `/events/${id}/registration/certificates`, icon: Award },
          ],
        },
        {
          title: "BADGES",
          items: [
            { label: "Badge Design", href: `/events/${id}/design-studio/badges`, icon: CreditCard },
          ],
        },
        {
          title: "PAYMENTS",
          items: [
            { label: "Ticket Financials", href: `/events/${id}/registration/financials`, icon: Banknote },
            { label: "Invoices & Billing", href: `/events/${id}/payments`, icon: Receipt },
          ],
        },
        /*{
          title: "COMMUNICATION",
          items: [
            { label: "Direct Emails", href: `/events/${id}/communication/emails`, icon: Mail },
            { label: "Announcements", href: `/events/${id}/communication/announcements`, icon: Megaphone },
            { label: "Notifications", href: `/events/${id}/communication/notifications`, icon: Bell },
          ],
        },*/
        {
          title: "SETTINGS",
          items: [
            { label: "Registration Settings", href: `/events/${id}/registration/settings`, icon: SlidersHorizontal },
          ],
        },
      ],
    },
    {
      key: "speakers",
      label: "Speakers",
      icon: Mic,
      defaultHref: (id) => `/events/${id}/speakers/dashboard`,
      permission: PERMISSIONS.SPEAKERS_VIEW,
      sections: (id) => [
        {
          title: "WORKSPACE",
          items: [
            { label: "Overview", href: `/events/${id}/speakers/dashboard`, icon: LayoutDashboard },
            { label: "All Speakers", href: `/events/${id}/speakers/list`, icon: Users },
          ],
        },
        {
          title: "MANAGEMENT",
          items: [
            { label: "Speaker Categories", href: `/events/${id}/speakers/categories`, icon: Tag },
            { label: "Invitations", href: `/events/${id}/speakers/invitations`, icon: Send },
          ],
        },
        {
          title: "PRESENTATIONS",
          items: [
            { label: "Presentations & Files", href: `/events/${id}/speakers/files`, icon: FolderOpen },
            { label: "ePosters Showcase", href: `/events/${id}/speakers/eposters`, icon: ImageIcon },
            { label: "Review Submissions", href: `/events/${id}/speakers/abstracts`, icon: CheckSquare },
          ],
        },
        {
          title: "ANALYTICS & EXPORT",
          items: [
            { label: "Speaker Analytics", href: `/events/${id}/speakers/analytics`, icon: BarChart3 },
            { label: "Export Center", href: `/events/${id}/speakers/export`, icon: Download },
          ],
        },
        {
          title: "SETTINGS",
          items: [
            { label: "Speaker Settings", href: `/events/${id}/settings`, icon: SlidersHorizontal },
          ],
        },
      ],
    },
    {
      key: "abstracts",
      label: "Abstracts",
      icon: FileText,
      defaultHref: (id) => `/events/${id}/abstracts`,
      permission: PERMISSIONS.SPEAKERS_VIEW,
      sections: (id) => [
        {
          title: "WORKSPACE",
          items: [
            { label: "Abstract Directory", href: `/events/${id}/abstracts`, icon: FileText },
            { label: "Speaker Submissions", href: `/events/${id}/speakers/abstracts`, icon: Inbox },
            { label: "ePosters & Media", href: `/events/${id}/speakers/eposters`, icon: ImageIcon },
            { label: "Abstract Analytics", href: `/events/${id}/speakers/analytics`, icon: BarChart3 },
          ],
        },
        {
          title: "SETTINGS",
          items: [
            { label: "Submission Settings", href: `/events/${id}/settings`, icon: SlidersHorizontal },
          ],
        },
      ],
    },
    {
      key: "communications",
      label: "Communications",
      icon: Mail,
      defaultHref: (id) => `/events/${id}/communications/dashboard`,
      sections: (id) => [
        {
          title: "WORKSPACE",
          items: [
            { label: "Communications Hub", href: `/events/${id}/communications/dashboard`, icon: LayoutDashboard },
            { label: "Announcements", href: `/events/${id}/communications/announcements`, icon: Megaphone },
            { label: "Direct Emails", href: `/events/${id}/communications/emails`, icon: Mail },
          ],
        },
        {
          title: "STUDIO",
          items: [
            { label: "Email Designer", href: `/events/${id}/communications/email-designer`, icon: LayoutTemplate },
            { label: "In-App Notifications", href: `/events/${id}/communications/notifications`, icon: Bell },
          ],
        },
        {
          title: "SETTINGS",
          items: [
            { label: "Sender & SMTP Config", href: `/events/${id}/settings`, icon: SlidersHorizontal },
          ],
        },
      ],
    },
    {
      key: "design",
      label: "Design",
      icon: Palette,
      defaultHref: (id) => `/events/${id}/design-studio/portals`,
      sections: (id) => [
        {
          title: "WORKSPACE",
          items: [
            { label: "Portal Studio", href: `/events/${id}/design-studio/portals`, icon: Layout },

            { label: "Design Asset Library", href: `/events/${id}/design-studio/library`, icon: FolderOpen },
            { label: "Website Builder", href: `/events/${id}/website/builder`, icon: Globe },
          ],
        },
        {
          title: "BADGES & CERTIFICATES",
          items: [
            { label: "Badge Designer", href: `/events/${id}/design-studio/badges`, icon: CreditCard },
            { label: "Certificate Designer", href: `/events/${id}/design-studio/certificates`, icon: Award },
          ],
        },
        {
          title: "EMAIL & BRANDING",
          items: [
            { label: "Email Template Studio", href: `/events/${id}/design-studio/emails`, icon: Mail },
            { label: "Theme, Colors & Fonts", href: `/events/${id}/design-studio/theme`, icon: Palette },
            { label: "ePoster Displays", href: `/events/${id}/speakers/eposters`, icon: ImageIcon },
          ],
        },
      ],
    },
    {
      key: "venue-ops",
      label: "Venue Ops",
      icon: Building2,
      defaultHref: (id) => `/events/${id}/venue-ops`,
      permission: PERMISSIONS.ROOMS_MANAGE,
      sections: (id) => [
        {
          title: "WORKSPACE",
          items: [
            { label: "Operations Hub", href: `/events/${id}/venue-ops`, icon: LayoutDashboard },
            { label: "Room Management", href: `/events/${id}/sessions/rooms`, icon: Building2 },
            { label: "Schedule Grid", href: `/events/${id}/sessions/agenda`, icon: Calendar },
            { label: "Ready Room Desks", href: `/events/${id}/speakers/files`, icon: FolderOpen },
          ],
        },
        {
          title: "SETTINGS",
          items: [
            { label: "Venue Settings", href: `/events/${id}/settings`, icon: SlidersHorizontal },
          ],
        },
      ],
    },
    {
      key: "payments",
      label: "Payments",
      icon: CreditCard,
      defaultHref: (id) => `/events/${id}/payments`,
      sections: (id) => [
        {
          title: "WORKSPACE",
          items: [
            { label: "Financial Overview", href: `/events/${id}/payments`, icon: LayoutDashboard },
            { label: "Transactions & Revenue", href: `/events/${id}/registration/financials`, icon: Banknote },
            { label: "Attendee Invoices", href: `/events/${id}/registration/participants`, icon: Receipt },
          ],
        },
        {
          title: "SETTINGS",
          items: [
            { label: "Payment Gateways & Tax", href: `/events/${id}/registration/settings`, icon: SlidersHorizontal },
          ],
        },
      ],
    },
    {
      key: "reports",
      label: "Reports & Analytics",
      icon: BarChart3,
      defaultHref: (id) => `/events/${id}/reports`,
      sections: (id) => [
        {
          title: "WORKSPACE",
          items: [
            { label: "Reports Hub", href: `/events/${id}/reports`, icon: BarChart3 },
            { label: "Registration Metrics", href: `/events/${id}/registration/dashboard`, icon: Users },
            { label: "Speaker Analytics", href: `/events/${id}/speakers/analytics`, icon: Mic },
            { label: "Data Export Center", href: `/events/${id}/speakers/export`, icon: Download },
          ],
        },
      ],
    },
    {
      key: "integrations",
      label: "Integrations",
      icon: Code2,
      defaultHref: (id) => `/events/${id}/developer`,
      sections: (id) => [
        {
          title: "WORKSPACE",
          items: [
            { label: "API & Webhooks", href: `/events/${id}/developer`, icon: Code2 },
            { label: "Platform Connectors", href: "/settings/integrations", icon: Link2 },
          ],
        },
      ],
    },
    {
      key: "settings",
      label: "Event Settings",
      icon: SlidersHorizontal,
      defaultHref: (id) => `/events/${id}/settings`,
      permission: PERMISSIONS.SETTINGS_EDIT,
      sections: (id) => [
        {
          title: "WORKSPACE",
          items: [
            { label: "General Settings", href: `/events/${id}/settings`, icon: SlidersHorizontal },
            { label: "Setup Checklist", href: `/events/${id}/setup`, icon: CheckCircle2 },
            { label: "Planning & Details", href: `/events/${id}/planning/details`, icon: FileSpreadsheet },
            { label: "Timeline & Dates", href: `/events/${id}/planning/timeline`, icon: Clock },
            { label: "Registration Config", href: `/events/${id}/registration/settings`, icon: Users },
          ],
        },
      ],
    },
  ], []);

  // Determine pathname-derived service key
  const activeServiceKeyFromPath = useMemo<PrimaryServiceKey>(() => {
    if (!eventId) return "home";
    const prefix = `/events/${eventId}`;
    if (
      pathname === prefix ||
      pathname === `${prefix}/dashboard` ||
      pathname.startsWith(`${prefix}/dashboard/`) ||
      pathname.startsWith(`${prefix}/planning/`) ||
      pathname === `${prefix}/setup`
    ) {
      return "home";
    }
    if (pathname.startsWith(`${prefix}/registration`)) return "registration";
    if (pathname.startsWith(`${prefix}/speakers`)) return "speakers";
    if (pathname.startsWith(`${prefix}/abstracts`)) return "abstracts";
    if (pathname.startsWith(`${prefix}/program`) || pathname.startsWith(`${prefix}/sessions`)) return "program";
    if (pathname.startsWith(`${prefix}/communication`) || pathname.startsWith(`${prefix}/communications`)) return "communications";
    if (pathname.startsWith(`${prefix}/design-studio`) || pathname.startsWith(`${prefix}/website`)) return "design";
    if (pathname.startsWith(`${prefix}/venue-ops`)) return "venue-ops";
    if (pathname.startsWith(`${prefix}/payments`)) return "payments";
    if (pathname.startsWith(`${prefix}/reports`) || pathname.startsWith("/analytics")) return "reports";
    if (pathname.startsWith(`${prefix}/developer`) || pathname.startsWith(`${prefix}/integrations`)) return "integrations";
    if (pathname.startsWith(`${prefix}/settings`)) return "settings";
    return "home";
  }, [pathname, eventId]);

  // Current active service
  const currentServiceKey = (selectedEventService as PrimaryServiceKey) || activeServiceKeyFromPath;

  const activeServiceConfig = useMemo(() => {
    return eventRoutes.find((s) => s.key === currentServiceKey) || eventRoutes[0];
  }, [eventRoutes, currentServiceKey]);

  // Handle clicking a primary service icon
  const handleServiceClick = (serviceKey: PrimaryServiceKey) => {
    if (isSecondarySidebarOpen && selectedEventService === serviceKey) {
      // Toggle / close if already open and clicked again
      setSecondarySidebarOpen(false);
      setSelectedEventService(null);
    } else {
      // Open slider and switch to selected service
      setSelectedEventService(serviceKey);
      setSecondarySidebarOpen(true);
    }
  };

  if (isPlatformWorkspace) {
    return (
      <motion.aside
        initial={false}
        animate={{ width: isCollapsed ? 72 : 248 }}
        transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
        className="relative z-40 flex h-full flex-col overflow-visible border-r border-[var(--sidebar-border)] bg-[var(--sidebar-bg)]"
      >
        <div className="flex h-full flex-col overflow-visible px-3 py-4">
          {/* Logo and Collapse Toggle */}
          <div className={cn("relative mb-3 flex h-11 items-center px-2", isCollapsed ? "justify-center" : "justify-between")}>
            <div className={cn("flex min-w-0 items-center", isCollapsed ? "justify-center" : "gap-2.5")} aria-label="Eventos">
              <span className={cn("grid shrink-0 place-items-center overflow-visible", isCollapsed ? "size-7" : "size-8")}>
                <Image src="/brand/eventos-emblem-metal.png" alt="" width={40} height={40} priority className="size-full scale-[2.05] object-contain" />
              </span>
              {!isCollapsed && <span className="truncate text-sm font-semibold uppercase tracking-[0.25em] text-[var(--text-primary)]">Eventos</span>}
            </div>
            {!isCollapsed && (
              <button
                onClick={toggleSidebar}
                className="grid size-7 place-items-center rounded-lg border border-[var(--border)] bg-[var(--card)] text-[var(--muted)] transition-all duration-150 hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                aria-label="Collapse navigation"
              >
                <ChevronLeft className="size-4" />
              </button>
            )}
          </div>

          {/* Navigation Section */}
          <nav
            aria-label="Platform navigation"
            className={cn("no-scrollbar min-h-0 flex-1 space-y-1", isCollapsed ? "overflow-visible" : "overflow-y-auto overflow-x-hidden")}
          >
            {!isCollapsed && (
              <h2 className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">
                Platform Management
              </h2>
            )}
            {platformRoutes.map((route) => (
              <SidebarLeaf key={route.label} route={route} pathname={pathname || ""} isCollapsed={isCollapsed} />
            ))}
          </nav>

          {/* Bottom Pinned Links */}
          <div className="space-y-1 border-t border-[var(--border)] pt-3">
            <Link
              href="/settings/general"
              aria-current={pathname?.startsWith("/settings") ? "page" : undefined}
              className={cn(
                "group relative flex h-9 items-center rounded-lg px-3 text-xs hover:bg-[var(--sidebar-item-hover-bg)]",
                pathname?.startsWith("/settings")
                  ? "bg-[var(--sidebar-item-active-bg)] font-semibold text-[var(--text-primary)] border border-[var(--border-subtle)]"
                  : "text-[var(--text-secondary)]",
                isCollapsed && "justify-center px-0"
              )}
            >
              <Settings className={cn("size-4", !isCollapsed && "mr-3")} />
              {!isCollapsed && "Platform settings"}
              {isCollapsed && <CollapsedTooltip label="Platform settings" />}
            </Link>
            <Link
              href="/events"
              className={cn(
                "group relative flex h-9 items-center rounded-lg px-3 text-xs text-[var(--text-secondary)] hover:bg-[var(--sidebar-item-hover-bg)]",
                isCollapsed && "justify-center px-0"
              )}
            >
              <Grid2X2 className={cn("size-4", !isCollapsed && "mr-3")} />
              {!isCollapsed && "Event catalog"}
              {isCollapsed && <CollapsedTooltip label="Event catalog" />}
            </Link>
          </div>
        </div>
      </motion.aside>
    );
  }

  // Event workspace: Primary Service Rail + On-Demand Sliding Secondary Navigation
  return (
    <div className="relative z-40 flex h-full overflow-visible">
      {/* TIER 1: Primary Service Switcher Rail (68px) - Always visible, no scroller */}
      <nav
        aria-label="Primary Service Navigation"
        className="flex w-[68px] shrink-0 flex-col items-center justify-between border-r border-[var(--sidebar-border)] bg-[var(--sidebar-bg)] py-3 px-2 z-50 select-none shadow-xs overflow-visible"
      >
        {/* Top: Brand Emblem with clean Organiser Workspace Return link */}
        <div className="flex flex-col items-center gap-2 w-full shrink-0 overflow-visible">
          <Link
            href="/dashboard"
            title="Return to Organiser Workspace"
            className="group relative flex size-10 items-center justify-center rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface-2)] transition-all hover:border-[var(--pri)] hover:bg-[var(--bg-surface-hover)] shadow-xs"
          >
            <Image
              src="/brand/eventos-emblem-metal.png"
              alt="Eventos"
              width={28}
              height={28}
              priority
              className="size-7 scale-[1.8] object-contain transition-transform group-hover:scale-[1.9]"
            />
            <CollapsedTooltip label="Return to Organiser Workspace" />
          </Link>

          <div className="h-px w-8 bg-[var(--border-subtle)] my-1 shrink-0" />
        </div>

        {/* Middle: 12 Core Primary Workspaces / Services */}
        <div className="flex flex-col items-center gap-1 w-full my-auto py-1 overflow-visible">
          {eventRoutes.map((service) => {
            const isActive = isSecondarySidebarOpen
              ? currentServiceKey === service.key
              : activeServiceKeyFromPath === service.key;

            return (
              <button
                key={service.key}
                type="button"
                onClick={() => handleServiceClick(service.key)}
                aria-label={`Open ${service.label} menu`}
                aria-pressed={isActive}
                className={cn(
                  "group relative flex size-9 items-center justify-center rounded-lg border transition-all duration-150 cursor-pointer overflow-visible",
                  isActive
                    ? "border-[var(--pri)] bg-[var(--pri)] text-[var(--primary-contrast)] shadow-xs font-bold"
                    : "border-transparent text-[var(--text-secondary)] hover:border-[var(--border-default)] hover:bg-[var(--sidebar-item-hover-bg)] hover:text-[var(--text-primary)]"
                )}
              >
                <service.icon className="size-4 shrink-0 transition-transform group-hover:scale-110" />
                <CollapsedTooltip label={service.label} />
              </button>
            );
          })}
        </div>

        {/* Bottom: Catalog, Settings & Slider Toggle */}
        <div className="flex flex-col items-center gap-1.5 w-full pt-2 border-t border-[var(--border-subtle)] shrink-0 overflow-visible">
          <Link
            href="/events"
            className="group relative flex size-8.5 items-center justify-center rounded-lg text-[var(--text-secondary)] hover:bg-[var(--sidebar-item-hover-bg)] hover:text-[var(--text-primary)] overflow-visible"
          >
            <Grid2X2 className="size-4" />
            <CollapsedTooltip label="Event catalog" />
          </Link>

          <Link
            href="/settings/general"
            className="group relative flex size-8.5 items-center justify-center rounded-lg text-[var(--text-secondary)] hover:bg-[var(--sidebar-item-hover-bg)] hover:text-[var(--text-primary)] overflow-visible"
          >
            <Settings className="size-4" />
            <CollapsedTooltip label="Platform settings" />
          </Link>

          <button
            type="button"
            onClick={() => {
              if (isSecondarySidebarOpen) {
                setSecondarySidebarOpen(false);
              } else {
                setSelectedEventService(activeServiceKeyFromPath);
                setSecondarySidebarOpen(true);
              }
            }}
            className="group relative flex size-8.5 items-center justify-center rounded-lg border border-[var(--border-default)] bg-[var(--card)] text-[var(--muted)] hover:text-[var(--text)] transition-colors overflow-visible"
            aria-label={isSecondarySidebarOpen ? "Slide close sub-navigation" : "Slide open sub-navigation"}
          >
            {isSecondarySidebarOpen ? <ChevronLeft className="size-3.5" /> : <ChevronRight className="size-3.5" />}
            <CollapsedTooltip label={isSecondarySidebarOpen ? "Close menu" : "Open menu"} />
          </button>
        </div>
      </nav>

      {/* TIER 2: On-Demand Sliding Secondary Navigation Sidebar (240px) */}
      <AnimatePresence initial={false}>
        {isSecondarySidebarOpen && (
          <motion.div
            initial={{ width: 0, opacity: 0, x: -10 }}
            animate={{ width: 240, opacity: 1, x: 0 }}
            exit={{ width: 0, opacity: 0, x: -10 }}
            transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
            className="relative flex h-full flex-col overflow-hidden border-r border-[var(--sidebar-border)] bg-[var(--bg-surface-2)] z-40 shadow-sm"
          >
            <div className="flex h-full flex-col px-3 py-3 overflow-hidden">
              {/* Secondary Header: Active Service Title with Close Button */}
              <div className="mb-3 space-y-2 border-b border-[var(--border-subtle)] pb-3">
                <div className="flex items-center justify-between gap-2 px-1">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-[var(--pri)]/10 text-[var(--pri)] border border-[var(--pri)]/20">
                      <activeServiceConfig.icon className="size-3.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-xs font-black uppercase tracking-wider text-[var(--text-primary)]">
                        {activeServiceConfig.label}
                      </h3>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setSecondarySidebarOpen(false)}
                    className="grid size-6 place-items-center rounded-md text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-primary)] transition-colors"
                    aria-label="Close menu"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>

                <EventSelector />
              </div>

              {/* Navigation Sections */}
              <nav
                aria-label={`${activeServiceConfig.label} sub-navigation`}
                className="no-scrollbar flex-1 space-y-4 overflow-y-auto pr-1"
              >
                {activeServiceConfig.sections(eventId || "").map((section) => (
                  <div key={section.title} className="space-y-1">
                    <h4 className="px-2 text-[9px] font-black uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                      {section.title}
                    </h4>
                    <div className="space-y-0.5">
                      {section.items.map((item) => (
                        <SecondarySidebarLeaf key={item.label} route={item} pathname={pathname || ""} />
                      ))}
                    </div>
                  </div>
                ))}
              </nav>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SecondarySidebarLeaf({
  route,
  pathname,
}: {
  route: NavItem;
  pathname: string;
}) {
  const setMobileOpen = useUIStore((state) => state.setMobileOpen);
  const { data: capabilities } = useEventCapabilities();
  const eventId = route.href?.match(/\/events\/([^/]+)/)?.[1];
  const access = useFeatureAccess(
    route.featureKey ?? capabilityForPath(capabilities?.features, route.href ?? "", eventId),
  );

  const isActive = pathname === route.href || (
    route.href !== undefined &&
    route.href.split("/").length > 4 &&
    pathname.startsWith(`${route.href}/`)
  );

  return (
    <Link
      href={route.href || "#"}
      onClick={() => setMobileOpen(false)}
      aria-current={isActive ? "page" : undefined}
      aria-label={access.enabled ? route.label : `${route.label}, locked`}
      className={cn(
        "group relative flex h-8 items-center rounded-lg px-2.5 text-[11px] font-semibold transition-colors",
        isActive
          ? "bg-[var(--pri)]/10 text-[var(--pri)] font-bold border border-[var(--pri)]/20 shadow-xs"
          : "text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-primary)]"
      )}
    >
      <route.icon className={cn("size-3.5 shrink-0 mr-2.5", isActive ? "text-[var(--pri)]" : "text-[var(--text-tertiary)] group-hover:text-[var(--text-primary)]")} />
      <span className="truncate flex-1">{route.label}</span>
      {!access.enabled && !access.loading && (
        <Lock className="size-3 text-[var(--warn)] ml-auto" aria-hidden="true" />
      )}
    </Link>
  );
}

function SidebarLeaf({
  route,
  pathname,
  isCollapsed,
}: {
  route: NavItem;
  pathname: string;
  isCollapsed: boolean;
}) {
  const setMobileOpen = useUIStore((state) => state.setMobileOpen);
  const { data: capabilities } = useEventCapabilities();
  const eventId = route.href?.match(/\/events\/([^/]+)/)?.[1];
  const access = useFeatureAccess(
    route.featureKey ?? capabilityForPath(capabilities?.features, route.href ?? "", eventId),
  );
  const isActive = pathname === route.href || Boolean(route.href && pathname.startsWith(`${route.href}/`));

  return (
    <Link
      href={route.href || "#"}
      onClick={() => setMobileOpen(false)}
      aria-current={isActive ? "page" : undefined}
      aria-label={access.enabled ? route.label : `${route.label}, locked`}
      className={cn(
        "group relative flex h-9 items-center rounded-lg px-3 text-xs font-medium transition-colors",
        isActive
          ? "bg-[var(--sidebar-item-active-bg)] text-[var(--text-primary)] border border-[var(--border-subtle)]"
          : "text-[var(--text-secondary)] hover:bg-[var(--sidebar-item-hover-bg)] hover:text-[var(--text-primary)]",
        isCollapsed && "justify-center px-0"
      )}
    >
      <route.icon className={cn("size-4 shrink-0", !isCollapsed && "mr-3")} />
      {!isCollapsed && <span className="truncate">{route.label}</span>}
      {!access.enabled && !access.loading && (
        <Lock className={cn("size-3 text-[var(--warn)]", isCollapsed ? "absolute right-1 top-1" : "ml-auto")} aria-hidden="true" />
      )}
      {isCollapsed && <CollapsedTooltip label={route.label} />}
    </Link>
  );
}

function CollapsedTooltip({ label }: { label: string }) {
  return (
    <span
      role="tooltip"
      className="pointer-events-none absolute left-[calc(100%+12px)] top-1/2 z-[999] -translate-y-1/2 translate-x-1 whitespace-nowrap rounded-md border border-[var(--border-default)] bg-[var(--sidebar-bg)] px-2.5 py-1.5 text-[11px] font-bold text-[var(--text-primary)] opacity-0 shadow-md transition-[opacity,transform] duration-150 group-hover:translate-x-0 group-hover:opacity-100"
      style={{
        backgroundColor: "var(--sidebar-bg)",
        color: "var(--text-primary)",
        borderColor: "var(--border-default)",
      }}
      aria-hidden="true"
    >
      {label}
    </span>
  );
}
