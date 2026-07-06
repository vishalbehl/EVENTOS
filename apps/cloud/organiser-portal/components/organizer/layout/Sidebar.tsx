"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  Banknote,
  Bell,
  BookOpen,
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileText,
  Globe,
  Home,
  LayoutTemplate,
  LogOut,
  Mail,
  MapPin,
  Megaphone,
  Palette,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Users,
  ClipboardList,
  FileVideo,
  MonitorPlay,
  Activity,
  ClipboardPlus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/store/useUIStore";
import { useAuthStore } from "@/store/use-auth-store";
import { usePermissions } from "@/hooks/usePermissions";
import { useEvent } from "@/hooks/useEvents";
import { PERMISSIONS, type PermissionCode } from "@/lib/permissions";

type NavItem = {
  label: string;
  href?: string;
  icon: any;
  permission?: PermissionCode;
  subItems?: NavItem[];
};

export function Sidebar() {
  const pathname = usePathname();
  const params = useParams();
  const eventId = params?.eventId as string | undefined;
  const { isSidebarCollapsed: isCollapsed, toggleSidebar } = useUIStore();
  const { user, logout } = useAuthStore();
  const [openMenus, setOpenMenus] = useState<Record<string, boolean>>({});
  const { checkPermission } = usePermissions(eventId);
  const { data: event } = useEvent(eventId || "");

  const isEventWorkspace = Boolean(eventId);
  const isRegistrationWorkspace = Boolean(
    eventId && pathname?.includes(`/events/${eventId}/registration`)
  );
  const isPlatformWorkspace = !isEventWorkspace;

  const speakerEnabled = event?.speaker_settings?.enabled ?? true;
  const regEnabled = event?.registration_settings?.enabled ?? true;

  const toggleMenu = (label: string) => {
    if (isCollapsed) return;
    setOpenMenus((prev) => ({ ...prev, [label]: !prev[label] }));
  };

  const filterRoutesByPermissions = (routes: NavItem[]) =>
    routes
      .map((route) => {
        if (route.subItems) {
          const allowed = route.subItems.filter(
            (sub) => !sub.permission || checkPermission(sub.permission)
          );
          return allowed.length ? { ...route, subItems: allowed } : null;
        }
        if (route.permission && !checkPermission(route.permission)) return null;
        return route;
      })
      .filter(Boolean) as NavItem[];

  const platformRoutes: NavItem[] = [
    { label: "Dashboard", icon: Home, href: "/dashboard" },
    { label: "Events", icon: Calendar, href: "/events", permission: PERMISSIONS.EVENTS_VIEW },
    { label: "Subscriptions", icon: Globe, href: "/subscriptions" },
    { label: "Billing", icon: Banknote, href: "/billing" },
    { label: "Venue Operations", icon: ClipboardPlus, href: "/venue-operations" },
    { label: "Users", icon: Users, href: "/users", permission: PERMISSIONS.USERS_VIEW },
    { label: "Settings", icon: Settings, href: "/settings" },
    { label: "Templates", icon: LayoutTemplate, href: "/templates" },
    { label: "Integrations", icon: SlidersHorizontal, href: "/connections" },
    { label: "Help & Support", icon: BookOpen, href: "/help-support" },
  ];

  const eventRoutes: NavItem[] = [
    { label: "Overview", icon: Home, href: `/events/${eventId}/speaker/dashboard` },
    {
      label: "PROGRAM",
      icon: Calendar,
      subItems: [
        { label: "Sessions", icon: Calendar, href: `/events/${eventId}/speaker/sessions`, permission: PERMISSIONS.SESSIONS_VIEW },
        { label: "Rooms", icon: MapPin, href: `/events/${eventId}/speaker/rooms`, permission: PERMISSIONS.ROOMS_MANAGE },
      ],
    },
    {
      label: "SPEAKERS",
      icon: Users,
      subItems: [
        { label: "Speakers", icon: Users, href: `/events/${eventId}/speaker/speakers`, permission: PERMISSIONS.SPEAKERS_VIEW },
        { label: "File Monitoring", icon: FileVideo, href: `/events/${eventId}/speaker/files`, permission: PERMISSIONS.FILES_VIEW },
        { label: "Posters", icon: MonitorPlay, href: `/events/${eventId}/speaker/eposters`, permission: PERMISSIONS.POSTERS_VIEW },
      ],
    },
    {
      label: "COMMUNICATION",
      icon: Mail,
      subItems: [
        { label: "Campaigns", icon: Mail, href: `/events/${eventId}/speaker/emails`, permission: PERMISSIONS.SETTINGS_EDIT },
        { label: "Announcements", icon: Megaphone, href: `/events/${eventId}/speaker/announcements`, permission: PERMISSIONS.SETTINGS_EDIT },
        { label: "Notifications", icon: Bell, href: `/events/${eventId}/speaker/notifications`, permission: PERMISSIONS.EVENTS_VIEW },
      ],
    },
    {
      label: "DESIGN STUDIO",
      icon: Palette,
      subItems: [
        { label: "Theme Designer", icon: Palette, href: `/events/${eventId}/speaker/theme`, permission: PERMISSIONS.SETTINGS_EDIT },
        { label: "Email Designer", icon: Mail, href: `/events/${eventId}/speaker/email-designer`, permission: PERMISSIONS.SETTINGS_EDIT },
      ],
    },
    {
      label: "AUTOMATION",
      icon: ClipboardList,
      subItems: [{ label: "Workflows", icon: ClipboardList, href: `/events/${eventId}/speaker/workflows` }],
    },
  ];

  const registrationRoutes: NavItem[] = [
    { label: "Overview", icon: Home, href: `/events/${eventId}/registration/dashboard` },
    {
      label: "ATTENDEES",
      icon: Users,
      subItems: [
        { label: "Participants", icon: Users, href: `/events/${eventId}/registration/participants` },
        { label: "Review Queue", icon: ClipboardList, href: `/events/${eventId}/registration/review` },
      ],
    },
    {
      label: "DESIGN STUDIO",
      icon: Palette,
      subItems: [
        { label: "Form Builder", icon: SlidersHorizontal, href: `/events/${eventId}/registration/form-builder` },
        { label: "Theme Designer", icon: Palette, href: `/events/${eventId}/registration/theme` },
        { label: "Template Designer", icon: LayoutTemplate, href: `/events/${eventId}/registration/template-designer` },
        { label: "Email Designer", icon: Mail, href: `/events/${eventId}/registration/email-designer` },
      ],
    },
    {
      label: "COMMUNICATION",
      icon: Mail,
      subItems: [
        { label: "Campaigns", icon: Mail, href: `/events/${eventId}/registration/emails` },
        { label: "Announcements", icon: Megaphone, href: `/events/${eventId}/registration/announcements` },
      ],
    },
    {
      label: "FINANCE",
      icon: Banknote,
      subItems: [{ label: "Financials", icon: Banknote, href: `/events/${eventId}/registration/financials` }],
    },
  ];

  const currentRoutes = useMemo(() => {
    if (isPlatformWorkspace) return filterRoutesByPermissions(platformRoutes);
    if (isRegistrationWorkspace) return regEnabled ? filterRoutesByPermissions(registrationRoutes) : [];
    return speakerEnabled ? filterRoutesByPermissions(eventRoutes) : [];
  }, [
    isPlatformWorkspace,
    isRegistrationWorkspace,
    regEnabled,
    speakerEnabled,
    pathname,
  ]);

  const bottomRoutes = isPlatformWorkspace
    ? []
    : isRegistrationWorkspace
      ? [
          { label: "Settings", icon: Settings, href: `/events/${eventId}/registration/settings` },
          { label: "Documentation", icon: FileText, href: "/docs" },
        ]
      : [
          { label: "Settings", icon: Settings, href: isEventWorkspace ? `/events/${eventId}/speaker/settings` : "/settings" },
          { label: "Documentation", icon: FileText, href: "/docs" },
        ];

  useEffect(() => {
    if (!pathname) return;
    const openState: Record<string, boolean> = {};
    currentRoutes.forEach((route) => {
      if (route.subItems?.some((sub) => pathname === sub.href || pathname.startsWith(`${sub.href}/`))) {
        openState[route.label] = true;
      }
    });
    setOpenMenus((prev) => ({ ...prev, ...openState }));
  }, [pathname, currentRoutes]);

  const userInitials = user?.full_name
    ? user.full_name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase()
    : (user?.email?.[0] || "U").toUpperCase();

  return (
    <motion.aside
      initial={false}
      animate={{ width: isCollapsed ? 76 : 264 }}
      transition={{ type: "spring", stiffness: 320, damping: 32 }}
      className="relative flex h-full flex-col overflow-hidden"
      style={{
        background: "linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01)), var(--color-surface-2)",
        borderRight: "1px solid var(--color-border)",
        boxShadow: "10px 0 36px rgba(0,0,0,0.34)",
      }}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(224,255,0,0.14),transparent_26%),radial-gradient(circle_at_bottom,rgba(125,211,252,0.08),transparent_22%)]" />

      <div className="relative flex h-full flex-col px-3 py-5">
        <div className={cn("mb-6 flex items-center", isCollapsed ? "justify-center" : "justify-between px-1")}>
          {!isCollapsed ? (
            <div className="flex min-w-0 items-center gap-3">
              <div className="hex-icon-shell flex h-10 w-10 items-center justify-center">
                <img
                  src="/logo-icon.png"
                  alt="Logo"
                  className="h-5 w-5 object-contain"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = "none";
                  }}
                />
              </div>
              <div className="min-w-0">
                <p className="truncate text-[18px] font-bold tracking-[-0.04em] text-[var(--color-text-primary)]">
                  HexOS
                </p>
                <p className="text-[11px] text-[var(--color-text-muted)]">Organizer workspace</p>
              </div>
            </div>
          ) : (
            <div className="hex-icon-shell flex h-10 w-10 items-center justify-center">
              <img
                src="/logo-icon.png"
                alt="Logo"
                className="h-5 w-5 object-contain"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = "none";
                }}
              />
            </div>
          )}

          <button
            onClick={toggleSidebar}
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-full border transition-all",
              isPlatformWorkspace
                ? "border-[var(--color-border)] bg-[var(--color-surface-3)] text-[var(--color-text-muted)] hover:text-[var(--color-primary-mid)]"
                : "border-[var(--color-border)] bg-[var(--color-surface-3)] text-[var(--color-text-muted)]"
              )}
            title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>

        {!isCollapsed && isPlatformWorkspace ? (
          <div className="hex-panel mb-5 rounded-[18px] px-4 py-4">
            <div className="flex items-center gap-3">
              <div className="hex-icon-shell flex h-11 w-11 items-center justify-center text-[12px] font-semibold text-[var(--color-text-primary)]">
                {userInitials}
              </div>
              <div className="min-w-0">
                <p className="truncate text-[13px] font-semibold text-[var(--color-text-primary)]">
                  {user?.organization_id ? "Organizer workspace" : "Organization"}
                </p>
                <p className="truncate text-[11px] text-[var(--color-text-muted)]">
                  {user?.full_name || user?.email || "Event operations"}
                </p>
              </div>
            </div>
          </div>
        ) : null}

        <div className="flex-1 space-y-1 overflow-y-auto no-scrollbar">
          {currentRoutes.map((route) => (
            <SidebarItem
              key={route.label}
              route={route}
              pathname={pathname || ""}
              isCollapsed={isCollapsed}
              isPlatformWorkspace={isPlatformWorkspace}
              isOpen={Boolean(openMenus[route.label])}
              onToggle={() => toggleMenu(route.label)}
            />
          ))}
        </div>

        <div
          className={cn(
            "mt-4 space-y-1 pt-4",
            isPlatformWorkspace ? "border-t border-white/10" : ""
          )}
          style={isPlatformWorkspace ? undefined : { borderTop: "1px solid var(--color-border)" }}
        >
          {bottomRoutes.map((route) => (
            <SidebarLeaf
              key={route.href}
              route={route}
              pathname={pathname || ""}
              isCollapsed={isCollapsed}
              isPlatformWorkspace={isPlatformWorkspace}
            />
          ))}

          {!isCollapsed && isPlatformWorkspace ? (
            <div className="hex-panel mt-3 rounded-[20px] p-4">
              <p className="text-[12px] font-semibold text-[var(--color-text-primary)]">Workspace access</p>
              <p className="mt-2 text-[11px] leading-5 text-[var(--color-text-muted)]">
                Create your first event and unlock advanced modules when you're ready.
              </p>
              <Link href="/subscriptions" className="mt-4 block">
                <div className="rounded-xl hex-lime-gradient px-3 py-2 text-center text-[12px] font-semibold text-[var(--color-text-inverse)] shadow-[0_10px_22px_rgba(224,255,0,0.16)]">
                  Activate plan
                </div>
              </Link>
            </div>
          ) : null}

          {!isCollapsed ? (
            <div
              className={cn(
                "mt-3 flex items-center gap-3 rounded-[18px] p-3",
                isPlatformWorkspace ? "bg-white/5" : ""
              )}
              style={
                isPlatformWorkspace
                  ? undefined
                  : { background: "var(--color-surface-3)", border: "1px solid var(--color-border)" }
              }
            >
              <div className="hex-icon-shell flex h-9 w-9 items-center justify-center text-[11px] font-bold text-[var(--color-text-primary)]">
                {userInitials}
              </div>
              <div className="min-w-0 flex-1">
                <p className={cn("truncate text-[12px] font-semibold", isPlatformWorkspace ? "text-white" : "text-[var(--color-text-primary)]")}>
                  {user?.full_name || user?.first_name || "Account"}
                </p>
                <p className="truncate text-[10px] uppercase tracking-[0.14em] text-[var(--color-text-muted)]">
                  {user?.role?.replace(/_/g, " ") || "Member"}
                </p>
              </div>
              <button
                onClick={logout}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--color-text-muted)] transition-colors hover:bg-white/10 hover:text-[var(--color-text-primary)]"
                title="Sign Out"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={logout}
              className="mt-2 flex h-9 w-full items-center justify-center rounded-lg text-[var(--color-text-muted)] transition-all hover:bg-white/10 hover:text-[var(--color-text-primary)]"
              title="Sign Out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </motion.aside>
  );
}

function SidebarItem({
  route,
  pathname,
  isCollapsed,
  isPlatformWorkspace,
  isOpen,
  onToggle,
}: {
  route: NavItem;
  pathname: string;
  isCollapsed: boolean;
  isPlatformWorkspace: boolean;
  isOpen: boolean;
  onToggle: () => void;
}) {
  if (!route.subItems?.length) {
    return (
      <SidebarLeaf
        route={route}
        pathname={pathname}
        isCollapsed={isCollapsed}
        isPlatformWorkspace={isPlatformWorkspace}
      />
    );
  }

  const isActive = route.subItems.some(
    (sub) => pathname === sub.href || pathname.startsWith(`${sub.href}/`)
  );

  return (
    <div className="space-y-1">
      <button
        onClick={onToggle}
        className={cn(
          "flex h-9 w-full items-center rounded-xl px-3 text-left transition-all",
          isCollapsed ? "justify-center" : "justify-between"
        )}
      >
        {isCollapsed ? (
          <route.icon
            className={cn(
              "h-4 w-4",
              isActive ? "text-[var(--color-primary-mid)]" : "text-[var(--color-text-muted)]"
            )}
          />
        ) : (
          <>
            <span
              className={cn(
                "text-[10px] font-bold uppercase tracking-[0.18em]",
                isActive ? "text-[var(--color-primary-mid)]" : "text-[var(--color-text-muted)]"
              )}
            >
              {route.label}
            </span>
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 transition-transform",
                isOpen ? "rotate-180" : "",
                "text-[var(--color-text-muted)]"
              )}
            />
          </>
        )}
      </button>

      <AnimatePresence initial={false}>
        {!isCollapsed && isOpen ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="space-y-1 overflow-hidden pl-2"
          >
            {route.subItems.map((sub) => (
              <SidebarLeaf
                key={sub.href}
                route={sub}
                pathname={pathname}
                isCollapsed={false}
                isPlatformWorkspace={isPlatformWorkspace}
                isSubItem
              />
            ))}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function SidebarLeaf({
  route,
  pathname,
  isCollapsed,
  isPlatformWorkspace,
  isSubItem = false,
}: {
  route: NavItem;
  pathname: string;
  isCollapsed: boolean;
  isPlatformWorkspace: boolean;
  isSubItem?: boolean;
}) {
  const isActive = pathname === route.href || Boolean(route.href && pathname.startsWith(`${route.href}/`));

  return (
    <Link href={route.href || "#"} className="block">
      <div
        className={cn(
          "group relative flex items-center rounded-xl transition-all",
          isCollapsed ? "h-10 justify-center px-0" : isSubItem ? "h-9 px-3" : "h-10 px-3",
          isActive ? "" : ""
        )}
        style={
          isActive
            ? {
                background: "linear-gradient(135deg, rgba(224,255,0,0.16), rgba(224,255,0,0.06))",
                color: "var(--color-text-primary)",
                borderLeft: "3px solid var(--color-primary-mid)",
              }
            : { color: "var(--color-text-muted)" }
        }
      >
        <route.icon className={cn("h-4 w-4 shrink-0", isCollapsed ? "" : "mr-3")} />
        {!isCollapsed ? (
          <span className={cn(isSubItem ? "text-[12px] font-medium" : "text-[13px] font-medium")}>
            {route.label}
          </span>
        ) : null}
      </div>
    </Link>
  );
}
