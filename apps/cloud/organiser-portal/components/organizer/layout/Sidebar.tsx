"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, Settings, Home, FileSpreadsheet,
  Users, Calendar, MapPin, FileVideo, Mail,
  MonitorPlay, BarChart3, SlidersHorizontal,
  ChevronLeft, ChevronRight, LogOut,
  Bell, FileText, Layout, ClipboardList, Banknote, Megaphone, Palette, ChevronDown,
  ShieldCheck
} from "lucide-react";

import { useUIStore } from "@/store/useUIStore";
import { useAuthStore } from "@/store/use-auth-store";
import { usePermissions } from "@/hooks/usePermissions";
import { useEvent } from "@/hooks/useEvents";
import { PERMISSIONS } from "@/lib/permissions";

export function Sidebar() {
  const pathname = usePathname();
  const { eventId } = useParams();
  const { isSidebarCollapsed: isCollapsed, toggleSidebar } = useUIStore();
  const { user, logout } = useAuthStore();

  const [openMenus, setOpenMenus] = useState<Record<string, boolean>>({});

  const toggleMenu = (label: string) => {
    setOpenMenus(prev => ({ ...prev, [label]: !prev[label] }));
  };

  const isEventWorkspace = !!eventId;

  const platformRoutes = [
    { label: "Dashboard",        icon: Home,       href: "/dashboard" },
    { label: "Events",           icon: Calendar,   href: "/events",    permission: PERMISSIONS.EVENTS_VIEW },
    { label: "Plans & Add-ons",  icon: Banknote,   href: "/billing" },
    { label: "Analytics",        icon: BarChart3,  href: "/analytics", permission: PERMISSIONS.ANALYTICS_VIEW },
    { label: "User Management",  icon: Users,      href: "/users",     permission: PERMISSIONS.USERS_VIEW },
    {
      label: "TECH SERVICES",
      icon: Settings,
      subItems: [
        { label: "Overview Dashboard", icon: Home,          href: "/technology-services/dashboard" },
        { label: "Requests Catalog",   icon: ClipboardList, href: "/technology-services/requests",  permission: PERMISSIONS.TECHNOLOGY_REQUEST_VIEW },
        { label: "Pricing Quotes",     icon: Banknote,      href: "/technology-services/quotes",    permission: PERMISSIONS.TECHNOLOGY_QUOTE_VIEW },
        { label: "Delivery Status",    icon: ShieldCheck,   href: "/technology-services/status",    permission: PERMISSIONS.TECHNOLOGY_STATUS_VIEW },
      ],
    },
  ];

  const { checkPermission } = usePermissions(eventId as string);
  const { data: event } = useEvent(eventId as string);
  const speakerEnabled = event?.speaker_settings?.enabled ?? true;
  const regEnabled     = event?.registration_settings?.enabled ?? true;

  const filterRoutesByPermissions = (routes: any[]) =>
    routes
      .map(route => {
        if (route.subItems) {
          const allowed = route.subItems.filter((s: any) => !s.permission || checkPermission(s.permission));
          if (allowed.length === 0) return null;
          return { ...route, subItems: allowed };
        }
        if (route.permission && !checkPermission(route.permission)) return null;
        return route;
      })
      .filter(Boolean);

  const eventRoutes = [
    { label: "Overview", icon: Home, href: `/events/${eventId}/speaker/dashboard` },
    {
      label: "PROGRAM",
      icon: Calendar,
      subItems: [
        { label: "Sessions",  icon: Calendar, href: `/events/${eventId}/speaker/sessions`, permission: PERMISSIONS.SESSIONS_VIEW },
        { label: "Rooms",     icon: MapPin,   href: `/events/${eventId}/speaker/rooms`,    permission: PERMISSIONS.ROOMS_MANAGE },
      ],
    },
    {
      label: "SPEAKERS",
      icon: Users,
      subItems: [
        { label: "Speakers",         icon: Users,       href: `/events/${eventId}/speaker/speakers`,  permission: PERMISSIONS.SPEAKERS_VIEW },
        { label: "File Monitoring",  icon: FileVideo,   href: `/events/${eventId}/speaker/files`,     permission: PERMISSIONS.FILES_VIEW },
        { label: "Posters",          icon: MonitorPlay, href: `/events/${eventId}/speaker/eposters`,  permission: PERMISSIONS.POSTERS_VIEW },
      ],
    },
    {
      label: "COMMUNICATION",
      icon: Mail,
      subItems: [
        { label: "Campaigns",      icon: Mail,     href: `/events/${eventId}/speaker/emails`,        permission: PERMISSIONS.SETTINGS_EDIT },
        { label: "Announcements",  icon: Megaphone, href: `/events/${eventId}/speaker/announcements`, permission: PERMISSIONS.SETTINGS_EDIT },
        { label: "Notifications",  icon: Bell,     href: `/events/${eventId}/speaker/notifications`, permission: PERMISSIONS.EVENTS_VIEW },
      ],
    },
    {
      label: "DESIGN STUDIO",
      icon: Palette,
      subItems: [
        { label: "Theme Designer", icon: Palette, href: `/events/${eventId}/speaker/theme`,          permission: PERMISSIONS.SETTINGS_EDIT },
        { label: "Email Designer", icon: Mail,    href: `/events/${eventId}/speaker/email-designer`, permission: PERMISSIONS.SETTINGS_EDIT },
      ],
    },
    {
      label: "AUTOMATION",
      icon: ClipboardList,
      subItems: [
        { label: "Workflows", icon: ClipboardList, href: `/events/${eventId}/speaker/workflows` },
      ],
    },
  ];

  const isRegistrationWorkspace = !!(eventId && pathname?.includes(`/events/${eventId}/registration`));

  const registrationRoutes = [
    { label: "Overview", icon: Home, href: `/events/${eventId}/registration/dashboard` },
    {
      label: "ATTENDEES",
      icon: Users,
      subItems: [
        { label: "Participants",  icon: Users,      href: `/events/${eventId}/registration/participants` },
        { label: "Review Queue",  icon: ClipboardList, href: `/events/${eventId}/registration/review` },
      ],
    },
    {
      label: "DESIGN STUDIO",
      icon: Palette,
      subItems: [
        { label: "Form Builder",        icon: SlidersHorizontal, href: `/events/${eventId}/registration/form-builder` },
        { label: "Theme Designer",      icon: Palette,           href: `/events/${eventId}/registration/theme` },
        { label: "Template Designer",   icon: Layout,            href: `/events/${eventId}/registration/template-designer` },
        { label: "Email Designer",      icon: Mail,              href: `/events/${eventId}/registration/email-designer` },
      ],
    },
    {
      label: "COMMUNICATION",
      icon: Mail,
      subItems: [
        { label: "Campaigns",     icon: Mail,     href: `/events/${eventId}/registration/emails` },
        { label: "Announcements", icon: Megaphone, href: `/events/${eventId}/registration/announcements` },
      ],
    },
    {
      label: "FINANCE",
      icon: Banknote,
      subItems: [
        { label: "Financials", icon: Banknote, href: `/events/${eventId}/registration/financials` },
      ],
    },
  ];

  const filteredPlatformRoutes     = filterRoutesByPermissions(platformRoutes);
  const filteredEventRoutes        = filterRoutesByPermissions(eventRoutes);
  const filteredRegistrationRoutes = filterRoutesByPermissions(registrationRoutes);

  const bottomRoutes = isRegistrationWorkspace
    ? [
        { label: "Settings",      icon: Settings, href: `/events/${eventId}/registration/settings` },
        { label: "Documentation", icon: FileText, href: "/docs" },
      ]
    : [
        { label: "Settings",      icon: Settings, href: isEventWorkspace ? `/events/${eventId}/speaker/settings` : "/settings" },
        { label: "Documentation", icon: FileText, href: "/docs" },
      ];

  const currentRoutes = isRegistrationWorkspace
    ? (regEnabled ? filteredRegistrationRoutes : [])
    : (isEventWorkspace ? (speakerEnabled ? filteredEventRoutes : []) : filteredPlatformRoutes);

  // Auto-open the parent menu that contains the active child
  useEffect(() => {
    if (!pathname) return;
    const newOpen: Record<string, boolean> = {};
    currentRoutes.forEach((route: any) => {
      if (route.subItems && route.subItems.some((sub: any) => pathname === sub.href)) {
        newOpen[route.label] = true;
      }
    });
    setOpenMenus(prev => {
      const needsUpdate = Object.keys(newOpen).some(key => !prev[key]);
      return needsUpdate ? { ...prev, ...newOpen } : prev;
    });
  }, [pathname]);

  // ── User initials for avatar ──
  const userInitials = user?.full_name
    ? user.full_name.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2)
    : (user?.email?.[0] || "U").toUpperCase();

  return (
    <motion.aside
      initial={false}
      animate={{ width: isCollapsed ? 72 : 256 }}
      transition={{ type: "spring", stiffness: 340, damping: 32 }}
      className="relative flex h-full flex-col z-40 overflow-hidden"
      style={{
        background: "var(--color-surface-2)",
        borderRight: "1px solid var(--color-border)",
        boxShadow: "1px 0 0 var(--color-border-subtle), 4px 0 16px color-mix(in srgb, var(--color-bg) 60%, transparent)",
      }}
    >
      {/* ── Top gradient accent ── */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[180px] opacity-30"
        style={{
          background: "radial-gradient(ellipse at 50% -20%, rgba(124, 58, 237, 0.35), transparent 70%)",
        }}
      />

      <div className="relative flex flex-col h-full px-3 py-5 overflow-hidden">

        {/* ── Logo / Collapse toggle ── */}
        <div className={cn(
          "mb-8 flex items-center",
          isCollapsed ? "justify-center" : "justify-between px-1"
        )}>
          {!isCollapsed && (
            <div className="flex items-center gap-2.5 min-w-0">
              <div
                className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0"
                style={{
                  background: "linear-gradient(135deg, var(--color-primary-start), var(--color-primary-end))",
                  boxShadow: "var(--shadow-glow-primary)",
                }}
              >
                <img
                  src="/logo-icon.png"
                  alt="Logo"
                  className="h-5 w-5 object-contain"
                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                />
              </div>
              <img
                src="/logo.png"
                alt="Eventos"
                className="h-6 w-auto max-w-[120px] object-contain"
                onError={(e) => {
                  const el = e.currentTarget as HTMLImageElement;
                  el.style.display = "none";
                  el.insertAdjacentHTML("afterend", `<span style="font-size:15px;font-weight:800;color:var(--color-text-primary);letter-spacing:-0.03em">Eventos</span>`);
                }}
              />
            </div>
          )}

          {isCollapsed && (
            <div
              className="h-9 w-9 rounded-lg flex items-center justify-center"
              style={{
                background: "linear-gradient(135deg, var(--color-primary-start), var(--color-primary-end))",
                boxShadow: "var(--shadow-glow-primary)",
              }}
            >
              <img
                src="/logo-icon.png"
                alt="E"
                className="h-5 w-5 object-contain"
                onError={(e) => {
                  const el = e.currentTarget as HTMLImageElement;
                  el.style.display = "none";
                }}
              />
            </div>
          )}

          {/* Collapse toggle button */}
          <motion.button
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.92 }}
            onClick={toggleSidebar}
            className={cn(
              "h-7 w-7 flex items-center justify-center rounded-full transition-all",
              isCollapsed ? "mt-0" : ""
            )}
            style={{
              background: "var(--color-surface-3)",
              border: "1px solid var(--color-border)",
              color: "var(--color-text-muted)",
            }}
            title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {isCollapsed
              ? <ChevronRight className="h-3.5 w-3.5" />
              : <ChevronLeft className="h-3.5 w-3.5" />
            }
          </motion.button>
        </div>

        {/* ── Navigation Items ── */}
        <div className="flex-1 space-y-0.5 overflow-y-auto no-scrollbar">
          {(currentRoutes as any[]).map((route: any, index: number) => {
            const hasSubItems = !!route.subItems;

            if (hasSubItems) {
              const isAnySubActive = route.subItems.some((sub: any) => pathname === sub.href || pathname?.startsWith(sub.href + "/"));
              const isOpen = !!openMenus[route.label];

              return (
                <div key={route.label} className="space-y-0.5">
                  {/* Section header / toggle */}
                  <div className="group relative">
                    <motion.button
                      whileHover={{ x: isCollapsed ? 0 : 1 }}
                      onClick={() => !isCollapsed && toggleMenu(route.label)}
                      className={cn(
                        "relative flex items-center h-8 w-full rounded-lg px-2.5 transition-all duration-150 text-left",
                        isCollapsed ? "justify-center hover:bg-white/5" : "mt-5 mb-1"
                      )}
                    >
                      {isCollapsed ? (
                        <route.icon className={cn(
                          "h-4 w-4 shrink-0 mx-auto transition-colors",
                          isAnySubActive
                            ? "text-[var(--color-primary-end)]"
                            : "text-[var(--color-text-muted)] group-hover:text-[var(--color-text-secondary)]"
                        )} />
                      ) : (
                        <div className="flex items-center justify-between flex-1">
                          <span
                            className="text-[10px] font-bold uppercase tracking-[0.15em]"
                            style={{ color: isAnySubActive ? "var(--color-primary-mid)" : "var(--color-text-muted)" }}
                          >
                            {route.label}
                          </span>
                          <motion.div
                            animate={{ rotate: isOpen ? 180 : 0 }}
                            transition={{ duration: 0.2 }}
                          >
                            <ChevronDown
                              className="h-3 w-3"
                              style={{ color: "var(--color-text-muted)" }}
                            />
                          </motion.div>
                        </div>
                      )}

                      {/* Collapsed tooltip + submenu */}
                      {isCollapsed && (
                        <div
                          className="absolute left-[72px] z-[70] invisible opacity-0 group-hover:visible group-hover:opacity-100 transition-all duration-200 p-2.5 rounded-xl min-w-[175px] space-y-1 pointer-events-auto"
                          style={{
                            background: "var(--color-surface-1)",
                            border: "1px solid var(--color-border)",
                            boxShadow: "var(--shadow-dropdown)",
                            backdropFilter: "blur(16px)",
                          }}
                        >
                          <span
                            className="text-[9px] font-bold uppercase tracking-wider px-2 py-1 border-b block mb-1"
                            style={{
                              color: "var(--color-primary-mid)",
                              borderColor: "var(--color-border)",
                            }}
                          >
                            {route.label}
                          </span>
                          {route.subItems.map((sub: any) => (
                            <Link
                              key={sub.href}
                              href={sub.href}
                              className={cn(
                                "block px-2.5 py-1.5 rounded-lg transition-all text-[11px] font-semibold",
                                pathname === sub.href
                                  ? "text-[var(--color-primary-end)]"
                                  : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
                              )}
                              style={
                                pathname === sub.href
                                  ? { background: "var(--color-surface-4)" }
                                  : {}
                              }
                            >
                              {sub.label}
                            </Link>
                          ))}
                        </div>
                      )}
                    </motion.button>
                  </div>

                  {/* Sub-items */}
                  <AnimatePresence initial={false}>
                    {!isCollapsed && isOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
                        className="overflow-hidden space-y-0.5 pl-2"
                      >
                        {route.subItems.map((sub: any) => {
                          const isSubActive = pathname === sub.href || pathname?.startsWith(sub.href + "/");
                          return (
                            <Link key={sub.href} href={sub.href} className="block">
                              <div
                                className={cn(
                                  "flex items-center h-9 px-3 rounded-lg text-[12px] font-medium transition-all duration-150 relative",
                                  isSubActive
                                    ? "font-semibold"
                                    : "hover:bg-[var(--color-surface-3)]"
                                )}
                                style={
                                  isSubActive
                                    ? {
                                        background: "var(--color-surface-4)",
                                        color: "var(--color-text-primary)",
                                        borderLeft: "2px solid var(--color-primary-end)",
                                        paddingLeft: "10px",
                                      }
                                    : { color: "var(--color-text-muted)" }
                                }
                              >
                                <sub.icon
                                  className="h-3.5 w-3.5 shrink-0 mr-2.5 transition-colors"
                                  style={isSubActive ? { color: "var(--color-primary-end)" } : {}}
                                />
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

            // Normal route
            const isActive = pathname === route.href || pathname?.startsWith(route.href + "/");
            return (
              <Link key={route.href} href={route.href || "#"} className="block group">
                <motion.div
                  whileHover={{ x: isCollapsed ? 0 : 2 }}
                  transition={{ duration: 0.12 }}
                  className={cn(
                    "relative flex items-center h-10 rounded-lg px-2.5 transition-all duration-150",
                    isCollapsed ? "justify-center" : "",
                    isActive ? "font-semibold" : ""
                  )}
                  style={
                    isActive
                      ? {
                          background: "var(--color-surface-4)",
                          color: "var(--color-text-primary)",
                          borderLeft: "3px solid var(--color-primary-end)",
                          paddingLeft: isCollapsed ? undefined : "9px",
                        }
                      : {
                          color: "var(--color-text-muted)",
                        }
                  }
                  onMouseEnter={e => {
                    if (!isActive) {
                      (e.currentTarget as HTMLElement).style.background = "var(--color-surface-3)";
                      (e.currentTarget as HTMLElement).style.color = "var(--color-text-primary)";
                    }
                  }}
                  onMouseLeave={e => {
                    if (!isActive) {
                      (e.currentTarget as HTMLElement).style.background = "";
                      (e.currentTarget as HTMLElement).style.color = "var(--color-text-muted)";
                    }
                  }}
                >
                  <route.icon
                    className={cn(
                      "h-4 w-4 shrink-0 transition-colors",
                      isCollapsed ? "mx-auto" : "mr-3",
                    )}
                    style={isActive ? { color: "var(--color-primary-end)" } : {}}
                  />

                  {!isCollapsed && (
                    <span className="text-[13px] tracking-wide">{route.label}</span>
                  )}

                  {/* Collapsed tooltip */}
                  {isCollapsed && (
                    <div
                      className="absolute left-[72px] z-50 invisible opacity-0 group-hover:visible group-hover:opacity-100 transition-all duration-200 px-3 py-2 rounded-lg text-[11px] font-semibold whitespace-nowrap"
                      style={{
                        background: "var(--color-surface-1)",
                        border: "1px solid var(--color-border)",
                        color: "var(--color-text-primary)",
                        boxShadow: "var(--shadow-dropdown)",
                      }}
                    >
                      {route.label}
                    </div>
                  )}
                </motion.div>
              </Link>
            );
          })}
        </div>

        {/* ── Bottom Section ── */}
        <div
          className="mt-auto pt-4 space-y-0.5"
          style={{ borderTop: "1px solid var(--color-border)" }}
        >
          {/* Bottom routes */}
          {bottomRoutes.map((route) => {
            const isActive = pathname === route.href;
            return (
              <Link key={route.href} href={route.href} className="block group">
                <div
                  className={cn(
                    "flex items-center h-9 rounded-lg px-2.5 transition-all duration-150",
                    isCollapsed ? "justify-center" : "",
                    isActive ? "font-semibold" : ""
                  )}
                  style={
                    isActive
                      ? { background: "var(--color-surface-4)", color: "var(--color-text-primary)", borderLeft: "3px solid var(--color-primary-end)", paddingLeft: isCollapsed ? undefined : "9px" }
                      : { color: "var(--color-text-muted)" }
                  }
                  onMouseEnter={e => {
                    if (!isActive) {
                      (e.currentTarget as HTMLElement).style.background = "var(--color-surface-3)";
                      (e.currentTarget as HTMLElement).style.color = "var(--color-text-primary)";
                    }
                  }}
                  onMouseLeave={e => {
                    if (!isActive) {
                      (e.currentTarget as HTMLElement).style.background = "";
                      (e.currentTarget as HTMLElement).style.color = "var(--color-text-muted)";
                    }
                  }}
                >
                  <route.icon className={cn("h-4 w-4 shrink-0 transition-colors", isCollapsed ? "mx-auto" : "mr-3")} />
                  {!isCollapsed && <span className="text-[12px] tracking-wide">{route.label}</span>}
                  {isCollapsed && (
                    <div
                      className="absolute left-[72px] z-50 invisible opacity-0 group-hover:visible group-hover:opacity-100 transition-all duration-200 px-3 py-2 rounded-lg text-[11px] font-semibold whitespace-nowrap"
                      style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)", boxShadow: "var(--shadow-dropdown)" }}
                    >
                      {route.label}
                    </div>
                  )}
                </div>
              </Link>
            );
          })}


          {/* User profile strip */}
          {!isCollapsed && (
            <div
              className="mt-3 p-3 rounded-xl flex items-center gap-3"
              style={{ background: "var(--color-surface-3)", border: "1px solid var(--color-border)" }}
            >
              <div
                className="h-8 w-8 rounded-lg flex items-center justify-center text-[11px] font-bold text-white shrink-0 overflow-hidden"
                style={{ background: "linear-gradient(135deg, var(--color-primary-start), var(--color-primary-end))" }}
              >
                {user?.avatar_url ? (
                  <img src={user.avatar_url} alt="User" className="h-full w-full object-cover" />
                ) : (
                  <img
                    src={`https://api.dicebear.com/7.x/lorelei/svg?seed=${user?.email || 'default'}`}
                    alt="Avatar"
                    className="h-full w-full object-cover"
                    onError={(e) => {
                      const el = e.currentTarget as HTMLImageElement;
                      el.style.display = "none";
                      (el.parentElement as HTMLElement).textContent = userInitials;
                    }}
                  />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-bold truncate" style={{ color: "var(--color-text-primary)" }}>
                  {user?.full_name || user?.first_name || 'Account'}
                </p>
                <p className="text-[10px] font-medium uppercase tracking-widest truncate" style={{ color: "var(--color-text-muted)" }}>
                  {user?.role?.replace(/_/g, ' ') || 'Member'}
                </p>
              </div>
              <button
                onClick={logout}
                className="h-6 w-6 rounded-md flex items-center justify-center transition-all hover:text-[var(--color-danger)]"
                style={{ color: "var(--color-text-muted)" }}
                title="Sign Out"
              >
                <LogOut className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {isCollapsed && (
            <button
              onClick={logout}
              className="w-full flex items-center justify-center h-9 rounded-lg transition-all mt-1 group"
              style={{ color: "var(--color-text-muted)" }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "var(--color-danger)"; (e.currentTarget as HTMLElement).style.background = "var(--color-surface-3)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "var(--color-text-muted)"; (e.currentTarget as HTMLElement).style.background = ""; }}
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
