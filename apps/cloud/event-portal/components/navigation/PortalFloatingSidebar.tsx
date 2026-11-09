"use client";

import { useEffect, useState } from "react";
import { useParams, usePathname, useRouter } from "next/navigation";
import {
  Home,
  LayoutDashboard,
  Ticket,
  FileText,
  Presentation,
  Award,
  ShieldCheck,
  User,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Sparkles,
} from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

interface EventUserProfile {
  id: string;
  event_id: string;
  email: string;
  phone?: string | null;
  full_name?: string | null;
  title?: string | null;
  affiliation?: string | null;
  designation?: string | null;
  country?: string | null;
  avatar_url?: string | null;
  roles: string[];
  is_registered: boolean;
  is_speaker: boolean;
  is_reviewer: boolean;
  reviewer_status: string;
}

interface PortalFloatingSidebarProps {
  eventData?: any;
  collapsed?: boolean;
  onToggle?: () => void;
}

export function PortalFloatingSidebar({
  eventData: propEventData,
  collapsed: propCollapsed,
  onToggle,
}: PortalFloatingSidebarProps) {
  const params = useParams();
  const pathname = usePathname() || "";
  const router = useRouter();
  const eventId = (params?.eventId as string) || "";

  const [user, setUser] = useState<EventUserProfile | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [eventData, setEventData] = useState<any>(propEventData || null);
  const [internalCollapsed, setInternalCollapsed] = useState(false);
  const [logoHovered, setLogoHovered] = useState(false);

  const collapsed = propCollapsed !== undefined ? propCollapsed : internalCollapsed;

  // Sync collapse state from localStorage on mount if uncontrolled
  useEffect(() => {
    if (propCollapsed === undefined) {
      const saved = localStorage.getItem("portal_sidebar_collapsed") === "true";
      setInternalCollapsed(saved);
    }
  }, [propCollapsed]);

  // Fetch or cache event data
  useEffect(() => {
    if (propEventData) {
      setEventData(propEventData);
      return;
    }
    if (!eventId) return;

    const cached = localStorage.getItem(`portal_event_data_${eventId}`);
    if (cached) {
      try {
        setEventData(JSON.parse(cached));
      } catch {}
    }

    fetch(`${API_BASE}/api/v1/portal/registration/${eventId}/form`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) {
          setEventData(data);
          try {
            localStorage.setItem(`portal_event_data_${eventId}`, JSON.stringify(data));
          } catch {}
        }
      })
      .catch(() => {});
  }, [eventId, propEventData]);

  // Sync user state on load and on route/storage change
  useEffect(() => {
    if (!eventId) return;

    const syncUser = () => {
      const storedToken =
        localStorage.getItem(`portal_token_${eventId}`) ||
        localStorage.getItem(`portal_jwt_${eventId}`);
      setToken(storedToken);

      const cachedUser = localStorage.getItem(`events_user_${eventId}`);
      if (cachedUser) {
        try {
          setUser(JSON.parse(cachedUser));
        } catch (e) {
          // invalid cache
        }
      }

      if (storedToken) {
        fetch(`${API_BASE}/api/v1/portal/users/${eventId}/me`, {
          headers: { Authorization: `Bearer ${storedToken}` },
        })
          .then((r) => (r.ok ? r.json() : null))
          .then((profile: EventUserProfile | null) => {
            if (profile) {
              setUser(profile);
              localStorage.setItem(`events_user_${eventId}`, JSON.stringify(profile));
            }
          })
          .catch(() => {});
      } else {
        setUser(null);
      }
    };

    syncUser();

    window.addEventListener("storage", syncUser);
    window.addEventListener("portal-auth-change", syncUser);

    return () => {
      window.removeEventListener("storage", syncUser);
      window.removeEventListener("portal-auth-change", syncUser);
    };
  }, [eventId, pathname]);

  const toggleCollapsed = () => {
    if (onToggle) {
      onToggle();
    } else {
      setInternalCollapsed((prev) => {
        const next = !prev;
        try {
          localStorage.setItem("portal_sidebar_collapsed", String(next));
        } catch {}
        return next;
      });
    }
  };

  // Never show sidebar on the login page — even if token just got saved moments ago,
  // we must wait for Next.js navigation to complete before showing the sidebar.
  if (pathname.includes("/login")) {
    return null;
  }

  // Strictly conditioned: Reviewer workspace is ONLY visible if linked and accepted
  const isAcceptedReviewer =
    user?.is_reviewer === true &&
    (user?.reviewer_status === "ACCEPTED" || user?.reviewer_status === "ACTIVE");

  const navItems = [
    {
      id: "home",
      label: token ? "Dashboard" : "Home",
      icon: token ? LayoutDashboard : Home,
      href: `/${eventId}${token ? "/dashboard" : ""}`,
      active: pathname === `/${eventId}` || pathname === `/${eventId}/dashboard`,
      badge: null,
    },
    {
      id: "register",
      label: "Registration",
      icon: Ticket,
      href: `/${eventId}/register`,
      active: pathname.startsWith(`/${eventId}/register`),
      badge: user?.is_registered ? "Registered" : null,
    },
    {
      id: "abstracts",
      label: "Abstract Submissions",
      icon: FileText,
      href: `/${eventId}/call-for-abstracts`,
      active: pathname.startsWith(`/${eventId}/call-for-abstracts`),
      badge: "Call Open",
    },
    {
      id: "speaker",
      label: "Speaker Center",
      icon: Presentation,
      href: `/${eventId}/speaker`,
      active: pathname.startsWith(`/${eventId}/speaker`),
      badge: user?.is_speaker ? "Faculty" : null,
    },
    {
      id: "certificates",
      label: "Certificates",
      icon: Award,
      href: `/${eventId}/certificates`,
      active: pathname.startsWith(`/${eventId}/certificates`),
      badge: null,
    },
  ];

  // Add Reviewer link ONLY if accepted reviewer
  if (isAcceptedReviewer) {
    navItems.push({
      id: "reviewer",
      label: "Reviewer Center",
      icon: ShieldCheck,
      href: `/${eventId}/review`,
      active: pathname.startsWith(`/${eventId}/review`),
      badge: "Assigned",
    });
  }

  // Profile Settings for logged in user
  if (token) {
    navItems.push({
      id: "profile",
      label: "Profile Settings",
      icon: User,
      href: `/${eventId}/profile`,
      active: pathname.startsWith(`/${eventId}/profile`),
      badge: null,
    });
  }

  const eventName = eventData?.event_name || "Conference";
  const logoUrl = eventData?.logo_url;
  const shortCode = eventData?.short_code || eventName.slice(0, 2).toUpperCase();

  return (
    <>
      {/* ── DESKTOP FULL-HEIGHT TOP-TO-BOTTOM SIDEBAR (LEFT) ──────────────── */}
      <aside
        aria-label="Event Portal Workspaces"
        className={`hidden md:flex fixed left-0 top-0 bottom-0 h-screen z-50 flex-col justify-between border-r-2 border-[var(--border-default)] bg-[var(--card)] select-none transition-all duration-300 ${
          collapsed ? "w-16" : "w-64"
        }`}
      >
        {/* ── Top Header Section: Event Logo + Event Name + Hover Collapse Button ── */}
        <div
          className="relative border-b-2 border-[var(--border-default)] p-3 flex items-center gap-3 transition-colors group cursor-pointer"
          onMouseEnter={() => setLogoHovered(true)}
          onMouseLeave={() => setLogoHovered(false)}
          onClick={toggleCollapsed}
          title={collapsed ? "Click to expand sidebar" : "Click to collapse sidebar"}
        >
          {/* Event Logo Container with Hover Collapse/Expand Icon */}
          <div className="relative w-10 h-10 rounded-xl bg-[var(--bg-surface-2)] border-2 border-[var(--border-default)] flex items-center justify-center shrink-0 overflow-hidden group-hover:border-[var(--pri)]/60 transition-colors">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt={eventName}
                className="w-full h-full object-contain p-1"
              />
            ) : (
              <div
                className="w-full h-full flex items-center justify-center font-black text-xs text-white bg-[var(--pri)]"
              >
                {shortCode}
              </div>
            )}

            {/* Collapse/Expand Icon appearing on hover over the logo */}
            <div
              className={`absolute inset-0 bg-[var(--card)]/90 backdrop-blur-sm flex items-center justify-center transition-opacity duration-200 ${
                logoHovered ? "opacity-100" : "opacity-0 pointer-events-none"
              }`}
            >
              {collapsed ? (
                <PanelLeftOpen className="w-5 h-5 text-[var(--pri)]" />
              ) : (
                <PanelLeftClose className="w-5 h-5 text-[var(--pri)]" />
              )}
            </div>
          </div>

          {/* Event Title & Subtitle (Only in Expanded Mode) */}
          {!collapsed && (
            <div className="min-w-0 flex-1 text-left">
              <div className="text-xs font-black text-[var(--text)] truncate leading-tight">
                {eventName}
              </div>
              <span className="text-[9px] font-extrabold uppercase tracking-wider text-[var(--muted)] block -mt-0.5">
                Official Portal
              </span>
            </div>
          )}

          {/* Explicit toggle chevron on hover (Expanded Mode) */}
          {!collapsed && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                toggleCollapsed();
              }}
              className="p-1 rounded-lg text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--bg-surface-2)] transition-colors opacity-0 group-hover:opacity-100 shrink-0"
              title="Collapse sidebar"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* ── Navigation Workspace Items (Middle Scrollable) ──────────────────── */}
        <nav className="flex-1 py-3 px-2 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => router.push(item.href)}
                title={collapsed ? item.label : undefined}
                className={`w-full flex items-center rounded-xl font-bold text-xs transition-all cursor-pointer relative group ${
                  collapsed
                    ? "h-10 justify-center px-0"
                    : "h-11 px-3 gap-3 justify-between text-left"
                } ${
                  item.active
                    ? "text-[var(--primary-contrast,#ffffff)] shadow-sm font-black"
                    : "text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--bg-surface-2)]"
                }`}
                style={
                  item.active
                    ? { backgroundColor: "var(--pri)" }
                    : {}
                }
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Icon
                    className={`shrink-0 transition-transform ${
                      collapsed ? "w-5 h-5" : "w-4 h-4"
                    } ${item.active ? "text-white" : "group-hover:scale-105"}`}
                  />
                  {!collapsed && (
                    <span className="truncate leading-none">{item.label}</span>
                  )}
                </div>

                {/* Badge indicator */}
                {item.badge && !collapsed && (
                  <span
                    className="px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider shrink-0"
                    style={
                      item.active
                        ? {
                            backgroundColor: "rgba(255, 255, 255, 0.25)",
                            color: "#ffffff",
                          }
                        : {
                            backgroundColor: "color-mix(in srgb, var(--sec) 15%, transparent)",
                            color: "var(--sec)",
                          }
                    }
                  >
                    {item.badge}
                  </span>
                )}

                {/* Small indicator dot in collapsed mode when badge exists */}
                {item.badge && collapsed && (
                  <span
                    className="absolute top-2 right-2 w-2 h-2 rounded-full ring-2 ring-[var(--card)]"
                    style={{ backgroundColor: "var(--sec)" }}
                  />
                )}
              </button>
            );
          })}
        </nav>

        {/* ── Bottom User Profile Card ────────────────────────────────────────── */}
        <div className="p-2 border-t-2 border-[var(--border-default)]">
          {token ? (
            <div
              className={`rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface-2)]/60 flex items-center transition-all ${
                collapsed ? "p-2 justify-center" : "p-2.5 gap-2.5"
              }`}
            >
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 font-black text-xs text-white bg-[var(--pri)]"
              >
                {user?.full_name ? user.full_name[0].toUpperCase() : "U"}
              </div>

              {!collapsed && (
                <div className="min-w-0 flex-1 text-left">
                  <div className="text-xs font-black text-[var(--text)] truncate leading-tight">
                    {user?.full_name || user?.email || "Delegate"}
                  </div>
                  <div
                    className="text-[9px] font-extrabold uppercase tracking-wider truncate"
                    style={{ color: "var(--sec)" }}
                  >
                    {isAcceptedReviewer
                      ? "Reviewer"
                      : user?.is_speaker
                      ? "Speaker"
                      : user?.is_registered
                      ? "Registered"
                      : "Delegate"}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => router.push(`/${eventId}/login`)}
              className={`w-full rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center bg-[var(--pri)] hover:opacity-90 ${
                collapsed ? "h-10" : "h-10 px-3 gap-2"
              } text-white`}
              title="Sign In"
            >
              <User className="w-4 h-4" />
              {!collapsed && <span>Sign In</span>}
            </button>
          )}
        </div>
      </aside>

      {/* ── MOBILE BOTTOM BAR (SCREEN < MD) ─────────────────────────────────── */}
      <nav
        aria-label="Mobile Navigation"
        className="md:hidden fixed bottom-3 left-1/2 -translate-x-1/2 z-40 w-[94%] max-w-sm rounded-full border-2 border-[var(--border-default)] bg-[var(--card)] shadow-lg p-1.5 flex items-center justify-around gap-1 select-none"
      >
        {navItems.slice(0, 5).map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => router.push(item.href)}
              className={`flex flex-col items-center justify-center p-2 rounded-full transition-all cursor-pointer relative ${
                item.active
                  ? "text-white"
                  : "text-[var(--muted)] hover:text-[var(--text)]"
              }`}
              style={
                item.active
                  ? { backgroundColor: "var(--pri)" }
                  : {}
              }
            >
              <Icon className="w-4 h-4" />
              {item.badge && !item.active && (
                <span
                  className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: "var(--sec)" }}
                />
              )}
            </button>
          );
        })}
      </nav>
    </>
  );
}
