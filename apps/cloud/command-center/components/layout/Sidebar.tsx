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
  PanelLeft, ChevronLeft, ChevronRight, Box, LogOut, User,
  Bell, FileText, Info, Layout, ClipboardList, Banknote, Megaphone, Palette, ChevronDown
} from "lucide-react";

import { useUIStore } from "@/store/useUIStore";
import { useAuthStore } from "@/store/use-auth-store";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { usePermissions } from "@/hooks/usePermissions";
import { useEvent } from "@/hooks/useEvents";
import { PERMISSIONS } from "@/lib/permissions";

export function Sidebar() {
  const pathname = usePathname();
  const { eventId } = useParams();
  const { isSidebarCollapsed: isCollapsed, toggleSidebar } = useUIStore();
  const { user } = useAuthStore();

  const [openMenus, setOpenMenus] = useState<Record<string, boolean>>({});

  const toggleMenu = (label: string) => {
    setOpenMenus(prev => ({ ...prev, [label]: !prev[label] }));
  };

  const isEventWorkspace = !!eventId;

  const platformRoutes = [
    { label: "Home", icon: Home, href: "/dashboard" },
    { label: "Events", icon: Calendar, href: "/events", permission: PERMISSIONS.EVENTS_VIEW },
    { label: "Analytics", icon: BarChart3, href: "/analytics", permission: PERMISSIONS.ANALYTICS_VIEW },
    { label: "User Management", icon: Users, href: "/users", permission: PERMISSIONS.USERS_VIEW },
  ];

  const { checkPermission } = usePermissions(eventId as string);
  const { data: event } = useEvent(eventId as string);
  const speakerEnabled = event?.speaker_settings?.enabled ?? true;
  const regEnabled = event?.registration_settings?.enabled ?? true;

  const filterRoutesByPermissions = (routes: any[]) => {
    return routes
      .map(route => {
        if (route.subItems) {
          const allowedSubItems = route.subItems.filter((sub: any) => !sub.permission || checkPermission(sub.permission));
          if (allowedSubItems.length === 0) return null;
          return { ...route, subItems: allowedSubItems };
        }
        if (route.permission && !checkPermission(route.permission)) return null;
        return route;
      })
      .filter(Boolean);
  };

  const eventRoutes = [
    { label: "Overview", icon: Home, href: `/events/${eventId}/speaker/dashboard` },
    {
      label: "PROGRAM",
      icon: Calendar,
      subItems: [
        { label: "Sessions", icon: Calendar, href: `/events/${eventId}/speaker/sessions`, permission: PERMISSIONS.SESSIONS_VIEW },
        { label: "Rooms", icon: MapPin, href: `/events/${eventId}/speaker/rooms`, permission: PERMISSIONS.ROOMS_MANAGE },
      ]
    },
    {
      label: "SPEAKERS",
      icon: Users,
      subItems: [
        { label: "Speakers", icon: Users, href: `/events/${eventId}/speaker/speakers`, permission: PERMISSIONS.SPEAKERS_VIEW },
        { label: "File Monitoring", icon: FileVideo, href: `/events/${eventId}/speaker/files`, permission: PERMISSIONS.FILES_VIEW },
        { label: "Posters", icon: MonitorPlay, href: `/events/${eventId}/speaker/eposters`, permission: PERMISSIONS.POSTERS_VIEW },
      ]
    },
    {
      label: "COMMUNICATION",
      icon: Mail,
      subItems: [
        { label: "Campaigns", icon: Mail, href: `/events/${eventId}/speaker/emails`, permission: PERMISSIONS.SETTINGS_EDIT },
        { label: "Announcements", icon: Megaphone, href: `/events/${eventId}/speaker/announcements`, permission: PERMISSIONS.SETTINGS_EDIT },
        { label: "Notifications", icon: Bell, href: `/events/${eventId}/speaker/notifications`, permission: PERMISSIONS.EVENTS_VIEW },
      ]
    },
    {
      label: "DESIGN STUDIO",
      icon: Palette,
      subItems: [
        { label: "Theme Designer", icon: Palette, href: `/events/${eventId}/speaker/theme`, permission: PERMISSIONS.SETTINGS_EDIT },
        { label: "Email Designer", icon: Mail, href: `/events/${eventId}/speaker/email-designer`, permission: PERMISSIONS.SETTINGS_EDIT },
      ]
    }
  ];

  const isRegistrationWorkspace = !!(eventId && pathname?.includes(`/events/${eventId}/registration`));

  const registrationRoutes = [
    { label: "Overview", icon: Home, href: `/events/${eventId}/registration/dashboard` },
    {
      label: "ATTENDEES",
      icon: Users,
      subItems: [
        { label: "Participants", icon: Users, href: `/events/${eventId}/registration/participants` },
        { label: "Review Queue", icon: ClipboardList, href: `/events/${eventId}/registration/review` },
      ]
    },
    {
      label: "DESIGN STUDIO",
      icon: Palette,
      subItems: [
        { label: "Form Builder", icon: SlidersHorizontal, href: `/events/${eventId}/registration/form-builder` },
        { label: "Theme Designer", icon: Palette, href: `/events/${eventId}/registration/theme` },
        { label: "Template Designer", icon: Layout, href: `/events/${eventId}/registration/template-designer` },
        { label: "Email Designer", icon: Mail, href: `/events/${eventId}/registration/email-designer` },
      ]
    },
    {
      label: "COMMUNICATION",
      icon: Mail,
      subItems: [
        { label: "Campaigns", icon: Mail, href: `/events/${eventId}/registration/emails` },
        { label: "Announcements", icon: Megaphone, href: `/events/${eventId}/registration/announcements` },
      ]
    },
    {
      label: "FINANCE",
      icon: Banknote,
      subItems: [
        { label: "Financials", icon: Banknote, href: `/events/${eventId}/registration/financials` },
      ]
    }
  ];

  const filteredPlatformRoutes = platformRoutes.filter(r => !r.permission || checkPermission(r.permission));

  const filteredEventRoutes = filterRoutesByPermissions(eventRoutes);
  const filteredRegistrationRoutes = filterRoutesByPermissions(registrationRoutes);

  const bottomRoutes = isRegistrationWorkspace
    ? [
      { label: "Settings", icon: Settings, href: `/events/${eventId}/registration/settings` },
      { label: "Documentation", icon: FileText, href: "/docs" },
    ]
    : [
      { label: "Settings", icon: Settings, href: isEventWorkspace ? `/events/${eventId}/speaker/settings` : "/settings" },
      { label: "Documentation", icon: FileText, href: "/docs" },
    ];

  const currentRoutes = isRegistrationWorkspace
    ? (regEnabled ? filteredRegistrationRoutes : [])
    : (isEventWorkspace ? (speakerEnabled ? filteredEventRoutes : []) : filteredPlatformRoutes);

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
      if (needsUpdate) {
        return { ...prev, ...newOpen };
      }
      return prev;
    });
  }, [pathname]);


  return (
    <motion.aside
      initial={false}
      animate={{ width: isCollapsed ? 80 : 288 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className="relative flex h-full flex-col border-r border-[var(--border)] rounded-none z-40 bg-[var(--surf)] overflow-hidden"
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
            whileHover={{ scale: 1.05, backgroundColor: "rgba(255,255,255,0.05)" }}
            whileTap={{ scale: 0.95 }}
            onClick={toggleSidebar}
            className={cn(
              "h-7 w-7 flex items-center justify-center rounded-full border border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] transition-all bg-[var(--card)]/40 shadow-inner",
              isCollapsed ? "mt-2" : ""
            )}
            title={isCollapsed ? "Open sidebar" : "Close sidebar"}
          >
            {isCollapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </motion.button>
        </div>

        {/* Navigation Items */}
        <div className="flex-1 space-y-1.5 overflow-y-auto no-scrollbar py-2">
          {currentRoutes.map((route: any) => {
            const hasSubItems = !!route.subItems;
            
            // If it has sub-items, render collapsible folder
            if (hasSubItems && route.subItems) {
              const isAnySubActive = route.subItems.some((sub: any) => pathname === sub.href);
              const isOpen = !!openMenus[route.label];
              
              return (
                <div key={route.label} className="space-y-1 w-full">
                  {/* Parent Toggle Button */}
                  <div className="group relative">
                    <motion.button
                      whileHover={{ x: isCollapsed ? 0 : 2 }}
                      onClick={() => !isCollapsed && toggleMenu(route.label)}
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
                        <div className="absolute left-20 z-[70] invisible opacity-0 group-hover:visible group-hover:opacity-100 transition-all duration-300 p-2 rounded-xl text-[11px] font-bold shadow-2xl border border-[var(--border)] bg-[var(--surf)] min-w-[165px] space-y-1 text-left flex flex-col pointer-events-auto">
                          <span className="text-[9px] font-extrabold uppercase tracking-wider text-[var(--pri)] px-2 py-1 border-b border-[var(--border)] mb-1 block">
                            {route.label}
                          </span>
                          {route.subItems.map((sub: any) => (
                            <Link key={sub.href} href={sub.href} className={cn(
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
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden pl-3 space-y-1"
                      >
                        {route.subItems.map((sub: any) => {
                          const isSubActive = pathname === sub.href;
                          return (
                            <Link key={sub.href} href={sub.href} className="block group/sub">
                              <div className={cn(
                                "flex items-center h-10 px-3 rounded-xl text-[12px] font-bold tracking-wide transition-all duration-250",
                                isSubActive
                                  ? "bg-gradient-to-r from-[var(--pri)] to-[var(--sec)] text-white shadow-[0_4px_12px_color-mix(in_srgb,var(--pri)_20%,transparent)]"
                                  : "text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--card)]/30"
                              )}>
                                <sub.icon className={cn(
                                  "h-4 w-4 shrink-0 mr-3 transition-colors duration-200",
                                  isSubActive ? "text-white" : "text-[var(--muted)] group-hover/sub:text-[var(--text)]"
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
                      ? "bg-gradient-to-r from-[var(--pri)] to-[var(--sec)] text-white shadow-[0_4px_15px_color-mix(in_srgb,var(--pri)_25%,transparent)] font-semibold"
                      : "text-[var(--muted)] hover:bg-[var(--card)]/30 hover:text-[var(--text)]"
                  )}
                >
                  <route.icon className={cn(
                    "h-4 w-4 shrink-0 transition-colors duration-300",
                    isCollapsed ? "mx-auto" : "mr-4",
                    isActive ? "text-white" : "text-[var(--muted)] group-hover:text-[var(--text)]"
                  )} />

                  {!isCollapsed && (
                    <div className="flex items-center justify-between flex-1">
                      <span className="text-[12.5px] font-bold tracking-wide">
                        {route.label}
                      </span>
                      {(route as any).isNew && (
                        <span className="bg-[var(--pri)] text-white text-[8px] font-black px-1.5 py-0.5 rounded-full uppercase tracking-tighter">New</span>
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
        </div>

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
