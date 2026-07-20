"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  Bell,
  Box,
  ChevronRight,
  HelpCircle,
  LogOut,
  Settings,
  User,
  Wifi,
  WifiOff,
  Menu,
  Search,
} from "lucide-react";
import { cn, getTimezoneAbbrev } from "@/lib/utils";
import { useAuthStore } from "@/store/use-auth-store";
import { useUIStore } from "@/store/useUIStore";
import { useWebSocket } from "@/hooks/useWebSocket";

export function Header() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams();
  const eventId = params?.eventId as string | undefined;
  const isPlatformWorkspace = !eventId;
  const { user, logout } = useAuthStore();
  const toggleMobileSidebar = useUIStore((state) => state.toggleMobileSidebar);
  const { isConnected } = useWebSocket(eventId || "");
  const [time, setTime] = useState<Date | null>(null);
  const [timezone, setTimezone] = useState("Asia/Kolkata");
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setTime(new Date());
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const readTimezone = () => {
      setTimezone(localStorage.getItem("system-timezone") || "Asia/Kolkata");
    };
    readTimezone();
    window.addEventListener("system-timezone-changed", readTimezone);
    return () => window.removeEventListener("system-timezone-changed", readTimezone);
  }, []);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setIsUserMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const userInitials = user?.full_name
    ? user.full_name
        .split(" ")
        .map((part) => part[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : (user?.email?.[0] || "U").toUpperCase();

  const pageTitle = useMemo(() => {
    const lastSegment = pathname.split("/").filter(Boolean).pop() || "dashboard";
    return lastSegment
      .replace(/\[|\]/g, "")
      .replace(/-/g, " ")
      .replace(/\b\w/g, (value) => value.toUpperCase());
  }, [pathname]);

  const breadcrumbs = useMemo(() => {
    const parts = pathname.split("/").filter(Boolean);
    const crumbs: { label: string; href: string }[] = [];
    let currentPath = "";
    parts.forEach((part) => {
      currentPath += `/${part}`;
      if (part === eventId) return;
      crumbs.push({
        label: part.replace(/-/g, " "),
        href: currentPath,
      });
    });
    return crumbs;
  }, [pathname, eventId]);

  return (
    <header
      className={cn("sticky top-0 z-30 flex w-full items-center justify-between px-4 md:px-6", isPlatformWorkspace ? "h-[78px]" : "h-[72px]")}
      style={{
        background: "rgba(5,5,5,0.78)",
        borderBottom: "1px solid var(--color-border)",
        boxShadow: "0 1px 0 var(--color-border-subtle)",
        backdropFilter: "blur(14px)",
      }}
    >
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={toggleMobileSidebar}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white hover:bg-white/10 md:hidden"
          title="Toggle Navigation Menu"
        >
          <Menu className="h-5 w-5" />
        </button>

        {!isPlatformWorkspace ? (
          <div className="flex min-w-0 items-center gap-3">
            <div
              className="hidden sm:flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
              style={{ background: "var(--color-surface-3)", border: "1px solid var(--color-border)" }}
            >
              <Box className="h-4 w-4 text-[var(--color-primary-mid)]" />
            </div>
            <div className="flex items-center gap-1.5 overflow-hidden">
              {breadcrumbs.map((crumb, index) => (
                <div key={crumb.href} className="flex items-center gap-1.5 whitespace-nowrap">
                  {index > 0 && <ChevronRight className="h-3 w-3 shrink-0 text-[var(--color-text-muted)]" />}
                  <Link
                    href={crumb.href}
                    className={cn(
                      "text-[10px] font-black uppercase tracking-widest transition-colors truncate",
                      index === breadcrumbs.length - 1
                        ? "text-[var(--color-text-primary)]"
                        : "text-[var(--color-text-muted)] hover:text-[var(--color-primary-mid)]"
                    )}
                  >
                    {crumb.label}
                  </Link>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="min-w-0">
            <h1 className="truncate text-xl md:text-[28px] font-bold tracking-[-0.04em] text-[var(--color-text-primary)]">
              {pageTitle}
            </h1>
          </div>
        )}
      </div>

      {/* Centered Search Command Bar */}
      <div className="hidden max-w-sm flex-1 md:block relative mx-4">
        <div className="relative">
          <input
            type="text"
            placeholder="Search console..."
            className="h-9 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-3)] pl-9 pr-10 text-[12px] text-[var(--color-text-primary)] placeholder-[var(--color-text-placeholder)] focus:border-[var(--color-primary-mid)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary-mid)] transition-all"
          />
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]">
            <Search className="h-3.5 w-3.5" />
          </div>
          <div className="absolute right-3 top-1/2 -translate-y-1/2 rounded bg-white/5 px-1.5 py-0.5 text-[9px] font-bold text-[var(--color-text-muted)] select-none">
            ⌘K
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {!isPlatformWorkspace ? (
          <>
            <div className="hidden pr-4 xl:flex xl:flex-col xl:items-end">
              <p className="mb-0.5 text-[13px] font-bold leading-none text-[var(--color-text-primary)] tabular-nums">
                {time
                  ? time.toLocaleTimeString("en-IN", {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                      hour12: true,
                      timeZone: timezone,
                    })
                  : "--:--:-- --"}
              </p>
              <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--color-primary-mid)] leading-none mt-1">
                {time ? time.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: timezone }).toUpperCase() : ""}
              </p>
            </div>
            {eventId ? (
              <div
                className="flex h-8 items-center gap-2 rounded-lg px-3 border mr-2"
                style={{
                  background: "var(--color-surface-3)",
                  borderColor: isConnected ? "rgba(134,239,172,0.15)" : "rgba(253,224,71,0.15)",
                }}
              >
                {isConnected ? (
                  <Wifi className="h-3 w-3 text-[var(--color-success)]" />
                ) : (
                  <WifiOff className="h-3 w-3 text-[var(--color-warning)]" />
                )}
                <span
                  className={cn(
                    "text-[9px] font-bold uppercase tracking-widest",
                    isConnected ? "text-[var(--color-success)]" : "text-[var(--color-warning)]"
                  )}
                >
                  {isConnected ? "Live" : "Offline"}
                </span>
              </div>
            ) : null}
          </>
        ) : null}

        <HeaderIcon href={eventId ? `/events/${eventId}/speaker/notifications` : "/notifications"} icon={Bell} />
        <HeaderIcon href={isPlatformWorkspace ? "/help-support" : "/docs"} icon={HelpCircle} />

        <div className="relative pl-1" ref={userMenuRef}>
          <button
            onClick={() => setIsUserMenuOpen((value) => !value)}
            className="flex h-10 w-10 items-center justify-center rounded-full text-[12px] font-semibold text-[var(--color-text-inverse)]"
            style={{ background: "linear-gradient(135deg, var(--color-primary-start), var(--color-primary-end))" }}
          >
            {userInitials}
          </button>

          <AnimatePresence>
            {isUserMenuOpen ? (
              <motion.div
                initial={{ opacity: 0, y: 8, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.96 }}
                className="absolute right-0 top-full z-50 mt-3 w-60 rounded-2xl p-2"
                style={{
                  background: "var(--color-surface-2)",
                  border: "1px solid var(--color-border)",
                  boxShadow: "var(--shadow-dropdown)",
                }}
              >
                <div className="rounded-[16px] bg-[var(--color-surface-3)] px-3 py-3">
                  <p className="truncate text-[13px] font-semibold text-[var(--color-text-primary)]">
                    {user?.full_name || user?.email || "Account"}
                  </p>
                  <p className="mt-1 text-[11px] uppercase tracking-[0.14em] text-[var(--color-text-muted)]">
                    {user?.role?.replace(/_/g, " ") || "Member"}
                  </p>
                </div>
                <div className="mt-2 space-y-1">
                  <MenuLink href="/settings?tab=profile" icon={User} label="View profile" onClick={() => setIsUserMenuOpen(false)} />
                  <MenuLink href="/settings" icon={Settings} label="Settings" onClick={() => setIsUserMenuOpen(false)} />
                  <button
                    onClick={() => {
                      setIsUserMenuOpen(false);
                      logout();
                    }}
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-[13px] font-medium text-[var(--color-danger)] transition-colors hover:bg-white/5"
                  >
                    <LogOut className="h-4 w-4" />
                    Sign out
                  </button>
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </div>
    </header>
  );
}

function HeaderIcon({
  href,
  icon: Icon,
}: {
  href: string;
  icon: any;
}) {
  return (
    <Link href={href}>
      <div
        className="flex h-10 w-10 items-center justify-center rounded-full border transition-colors"
        style={{
          background: "var(--color-surface-3)",
          border: "1px solid var(--color-border)",
          color: "var(--color-text-muted)",
        }}
      >
        <Icon className="h-4 w-4" />
      </div>
    </Link>
  );
}

function MenuLink({
  href,
  icon: Icon,
  label,
  onClick,
}: {
  href: string;
  icon: any;
  label: string;
  onClick: () => void;
}) {
  return (
    <Link href={href}>
      <button
        onClick={onClick}
        className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-[13px] font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-white/5 hover:text-[var(--color-text-primary)]"
      >
        <Icon className="h-4 w-4" />
        {label}
      </button>
    </Link>
  );
}
