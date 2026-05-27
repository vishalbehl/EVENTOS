"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, Settings, Home, FileSpreadsheet,
  Users, Calendar, MapPin, FileVideo, Mail,
  MonitorPlay, BarChart3, SlidersHorizontal,
  PanelLeft, ChevronLeft, ChevronRight, Box, LogOut, User,
  Bell, FileText, Info, Layout, ClipboardList, Banknote
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

  const isEventWorkspace = !!eventId;

  const platformRoutes = [
    { label: "Home", icon: Home, href: "/dashboard" },
    { label: "Events", icon: Calendar, href: "/events", permission: PERMISSIONS.EVENTS_VIEW },
    { label: "Analytics", icon: BarChart3, href: "/analytics", permission: PERMISSIONS.ANALYTICS_VIEW },
    { label: "User Management", icon: Users, href: "/users", permission: PERMISSIONS.USERS_VIEW },
  ];

  const { checkPermission } = usePermissions(eventId as string);
  const { data: event } = useEvent(eventId as string);
  const speakerEnabled = event?.speaker_mode_enabled ?? true;
  const regEnabled = event?.registration_mode_enabled ?? true;

  const eventRoutes = [
    { label: "Overview", icon: LayoutDashboard, href: `/events/${eventId}/speaker/dashboard` },
    { label: "Rooms", icon: MapPin, href: `/events/${eventId}/speaker/rooms`, permission: PERMISSIONS.ROOMS_MANAGE },
    { label: "Sessions", icon: Calendar, href: `/events/${eventId}/speaker/sessions`, permission: PERMISSIONS.SESSIONS_VIEW },
    { label: "Speakers", icon: Users, href: `/events/${eventId}/speaker/speakers`, permission: PERMISSIONS.SPEAKERS_VIEW },
    { label: "File Monitoring", icon: FileVideo, href: `/events/${eventId}/speaker/files`, permission: PERMISSIONS.FILES_VIEW },
    { 
      label: "Posters", 
      icon: MonitorPlay, 
      href: `/events/${eventId}/speaker/eposters`,
      permission: PERMISSIONS.POSTERS_VIEW
    },
    { 
      label: "Campaigns", 
      icon: Mail, 
      href: `/events/${eventId}/speaker/emails`,
      permission: PERMISSIONS.SETTINGS_EDIT // Or CAMPAIGNS:MANAGE if we add it
    },
    { label: "Notifications", icon: Bell, href: `/events/${eventId}/speaker/notifications`, permission: PERMISSIONS.EVENTS_VIEW },
  ].filter(r => !r.permission || checkPermission(r.permission));

  const isRegistrationWorkspace = !!(eventId && (pathname?.includes(`/events/${eventId}/registration`) || !speakerEnabled));

  const registrationRoutes = [
    { label: "Dashboard", icon: LayoutDashboard, href: `/events/${eventId}/registration/dashboard` },
    { label: "Form Builder", icon: SlidersHorizontal, href: `/events/${eventId}/registration/form-builder` },
    { label: "Review Queue", icon: ClipboardList, href: `/events/${eventId}/registration/review` },
    { label: "Participants", icon: Users, href: `/events/${eventId}/registration/participants` },
    { label: "Financials", icon: Banknote, href: `/events/${eventId}/registration/financials` },
    { label: "Campaigns", icon: Mail, href: `/events/${eventId}/registration/emails` },
    { label: "Template Designer", icon: Layout, href: `/events/${eventId}/registration/template-designer` },
    { label: "Certificate Printer", icon: FileText, href: `/events/${eventId}/registration/certificates` },
  ];

  const filteredPlatformRoutes = platformRoutes.filter(r => !r.permission || checkPermission(r.permission));

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
    ? (regEnabled ? registrationRoutes : []) 
    : (isEventWorkspace ? (speakerEnabled ? eventRoutes : []) : filteredPlatformRoutes);

  return (
    <motion.aside
      initial={false}
      animate={{ width: isCollapsed ? 80 : 288 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className="relative flex h-full flex-col glass-3d border-r-0 rounded-none z-40 bg-[var(--surf)]/60 overflow-hidden"
    >
      {/* 3D Extrusion Effect */}
      <div className="absolute inset-y-0 right-0 w-[4px] bg-[var(--base)]/40 shadow-[-2px_0_10px_color-mix(in_srgb,var(--base)_50%,transparent)] z-[-1]" />

      <div className="flex flex-col h-full px-4 py-8 overflow-hidden">
        {/* Logo Section */}
        <div className={cn(
          "mb-12 flex items-center gap-4 px-2",
          isCollapsed ? "justify-center" : "justify-between"
        )}>
          <div className="flex items-center gap-4">
            <div className="relative h-10 w-10 shrink-0">
              <div className="absolute inset-0 bg-[var(--pri)]/20 blur-md rounded-xl" />
              <div className="relative h-10 w-10 glass-3d border-[var(--pri)]/30 rounded-xl flex items-center justify-center shadow-lg transform rotate-3">
                <Box className="h-5 w-5 text-[var(--pri)]" />
              </div>
            </div>
            {!isCollapsed && (
              <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="whitespace-nowrap"
              >
                <h1 className="text-[18px] font-black tracking-tight text-[var(--text)] leading-none">
                  Event<span className="text-[var(--sec)]">OS</span>
                </h1>
                <p className="text-[8px] font-black uppercase tracking-[0.3em] text-[var(--pri)]/60 mt-1">Management</p>
              </motion.div>
            )}
          </div>
        </div>

        {/* Dedicated Sidebar Toggle (ChatGPT Style) */}
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={toggleSidebar}
          className={cn(
            "absolute top-9 z-50 h-8 w-8 flex items-center justify-center rounded-lg border border-default glass-3d text-muted hover:text-[var(--pri)] hover:bg-[color-mix(in_srgb,var(--pri)_15%,transparent)] transition-all",
            isCollapsed ? "left-1/2 -translate-x-1/2" : "right-6"
          )}
          title={isCollapsed ? "Open sidebar" : "Close sidebar"}
        >
          <PanelLeft className={cn("h-5 w-5 transition-transform duration-300", isCollapsed && "rotate-180")} />
        </motion.button>

        {/* Navigation Items */}
        <div className="flex-1 space-y-1.5 overflow-y-auto no-scrollbar py-2">
          {currentRoutes.map((route) => {
            const isActive = pathname === route.href;
            return (
              <Link key={route.href} href={route.href} className="block group">
                <motion.div
                  whileHover={{ x: isCollapsed ? 0 : 4 }}
                  animate={{
                    z: isActive ? 10 : 0,
                    scale: isActive ? 1.02 : 1
                  }}
                  className={cn(
                    "relative flex items-center h-11 rounded-xl px-3 transition-all duration-300 preserve-3d",
                    isActive
                      ? "bg-[var(--pri)]/10 text-[var(--text)] shadow-[0_10px_20px_color-mix(in_srgb,var(--pri)_10%,transparent)]"
                      : "text-muted hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:text-muted"
                  )}
                >
                  {/* Active Indicator */}
                  {isActive && (
                    <motion.div
                      layoutId="active-nav"
                      className="absolute left-0 h-6 w-[3px] rounded-r-full bg-[var(--pri)] shadow-[0_0_15px_var(--pri)]"
                    />
                  )}

                  <route.icon className={cn(
                    "h-4 w-4 shrink-0 transition-all duration-300 metallic-icon",
                    isCollapsed ? "mx-auto" : "mr-4",
                    isActive ? "text-[var(--pri)] drop-shadow-[0_0_8px_color-mix(in_srgb,var(--pri)_40%,transparent)]" : "text-current"
                  )} />

                  {!isCollapsed && (
                    <div className="flex items-center justify-between flex-1">
                      <span className="text-[12px] font-bold tracking-wide">
                        {route.label}
                      </span>
                      {(route as any).isNew && (
                        <span className="bg-[var(--pri)] text-[var(--text)] text-[8px] font-black px-1.5 py-0.5 rounded-full uppercase tracking-tighter">New</span>
                      )}
                    </div>
                  )}

                  {/* Tooltip for collapsed mode */}
                  {isCollapsed && (
                    <div className="absolute left-20 z-50 invisible opacity-0 group-hover:visible group-hover:opacity-100 transition-all duration-300 px-3 py-2 glass-3d rounded-lg text-[11px] font-bold whitespace-nowrap shadow-2xl border-default">
                      {route.label}
                    </div>
                  )}
                </motion.div>
              </Link>
            );
          })}
        </div>

        {/* Bottom Navigation (Settings & Docs) */}
        <div className="mt-auto space-y-1.5 border-t border-default pt-4 pb-4">
          {bottomRoutes.map((route) => {
            const isActive = pathname === route.href;
            return (
              <Link key={route.href} href={route.href} className="block group">
                <motion.div
                  whileHover={{ x: isCollapsed ? 0 : 4 }}
                  className={cn(
                    "relative flex items-center h-11 rounded-xl px-3 transition-all duration-300",
                    isActive
                      ? "bg-[var(--pri)]/10 text-[var(--text)]"
                      : "text-muted hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]"
                  )}
                >
                  <route.icon className={cn(
                    "h-4 w-4 shrink-0",
                    isCollapsed ? "mx-auto" : "mr-4",
                    isActive ? "text-[var(--pri)]" : "text-current"
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
        .metallic-icon {
          filter: drop-shadow(0 2px 2px color-mix(in srgb, var(--base) 50%, transparent));
        }
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
