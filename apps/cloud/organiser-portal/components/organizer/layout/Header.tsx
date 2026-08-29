"use client";

import { Check, ChevronDown, HelpCircle, LogOut, Menu, Moon, Settings, Sun, User } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, usePathname, useRouter } from "next/navigation";

import { CommandPalette } from "@/components/organizer/layout/CommandPalette";
import { NotificationCenter } from "@/components/organizer/layout/NotificationCenter";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getTimezoneAbbrev } from "@/lib/utils";
import { useAuthStore } from "@/store/use-auth-store";
import { useUIStore } from "@/store/useUIStore";

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "OR";
}

export function Header() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams();
  const eventId = params?.eventId as string | undefined;
  const isPlatformWorkspace = !eventId;
  const [signingOut, setSigningOut] = useState(false);
  const [time, setTime] = useState<Date | null>(null);
  const [timezone, setTimezone] = useState("Asia/Kolkata");
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [mounted, setMounted] = useState(false);
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const toggleMobileSidebar = useUIStore((state) => state.toggleMobileSidebar);
  const displayName = user?.full_name || [user?.first_name, user?.last_name].filter(Boolean).join(" ") || user?.email || "Organiser";

  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem("eventos-theme") === "dark" ? "dark" : "light";
    setTheme(saved);
    document.documentElement.classList.toggle("dark", saved === "dark");
    document.documentElement.setAttribute("data-theme", saved);
  }, []);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("eventos-theme", next);
    document.documentElement.classList.toggle("dark", next === "dark");
    document.documentElement.setAttribute("data-theme", next);
  };

  useEffect(() => {
    setTime(new Date());
    const timer = window.setInterval(() => setTime(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await logout();
    } finally {
      router.replace("/");
      router.refresh();
    }
  };

  useEffect(() => {
    const handleTimezone = () => setTimezone(localStorage.getItem("system-timezone") || "Asia/Kolkata");
    handleTimezone();
    window.addEventListener("system-timezone-changed", handleTimezone);
    return () => window.removeEventListener("system-timezone-changed", handleTimezone);
  }, []);

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
    <header className="sticky top-0 z-30 flex min-h-16 w-full items-center gap-2 border-b border-[var(--border-default)] bg-[var(--bg-surface)] px-3 sm:px-4 md:gap-4 md:px-5">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <button
          type="button"
          aria-label="Open navigation"
          onClick={toggleMobileSidebar}
          className="grid size-9 shrink-0 place-items-center rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)] text-[var(--text-secondary)] md:hidden"
        >
          <Menu aria-hidden className="size-4" />
        </button>

        <nav aria-label="Breadcrumbs" className="flex min-w-0 items-center gap-1.5 overflow-hidden">
          {breadcrumbs.map((crumb, index) => {
            const isLast = index === breadcrumbs.length - 1;
            return (
              <div key={crumb.href} className="flex items-center gap-1.5 whitespace-nowrap">
                {index > 0 && <span className="text-[var(--text-tertiary)]">/</span>}
                <Link
                  href={crumb.href}
                  className={`truncate text-xs font-semibold uppercase tracking-wider transition-colors ${
                    isLast ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  {crumb.label}
                </Link>
              </div>
            );
          })}
        </nav>
      </div>

      <div className="flex shrink-0 items-center justify-end gap-2">
        <CommandPalette />

        <div className="hidden border-r border-[var(--border-subtle)] pr-3 text-right 2xl:block" aria-label="Platform clock">
          <time className="block font-mono text-[11px] font-semibold tabular-nums text-[var(--text-primary)]">
            {time ? time.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true, timeZone: timezone }) : "--:--:--"}
          </time>
          <span className="block text-[9px] uppercase tracking-[0.14em] text-[var(--text-tertiary)]">{getTimezoneAbbrev(timezone)}</span>
        </div>

        <NotificationCenter />

        <button
          type="button"
          role="switch"
          aria-checked={theme === "dark"}
          aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
          title={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
          disabled={!mounted}
          onClick={toggleTheme}
          className="group relative flex h-9 w-[4.25rem] items-center rounded-full border border-[var(--border-default)] bg-[var(--bg-surface-2)] p-1 text-[var(--text-secondary)] shadow-sm transition-colors hover:border-[var(--border-strong)] disabled:opacity-60"
        >
          <Sun aria-hidden className="absolute left-2 size-3.5" />
          <Moon aria-hidden className="absolute right-2 size-3.5" />
          <span
            aria-hidden
            className={`relative z-10 grid size-7 place-items-center rounded-full bg-[var(--surface-inverse)] text-[var(--text-inverse)] shadow-sm transition-transform duration-200 ${theme === "dark" ? "translate-x-7" : "translate-x-0"}`}
          >
            {theme === "dark" ? <Moon className="size-3.5" /> : <Sun className="size-3.5" />}
          </span>
        </button>

        <Link aria-label="Open documentation" href={isPlatformWorkspace ? "/help-support" : "/docs"} className="hidden size-9 place-items-center rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] sm:grid">
          <HelpCircle aria-hidden className="size-4" />
        </Link>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" aria-label="Open account menu" className="ml-1 flex min-h-10 items-center gap-2 border-l border-[var(--border-subtle)] pl-3 text-left">
              <span className="hidden max-w-40 text-right sm:block">
                <span className="block truncate text-[11px] font-bold text-[var(--text-primary)]">{displayName}</span>
                <span className="block text-[9px] uppercase tracking-[0.14em] text-[var(--text-tertiary)]">{user?.role?.replace(/_/g, " ") || "Organiser"}</span>
              </span>
              <span aria-hidden className="grid size-9 place-items-center overflow-hidden rounded-md border border-[var(--border-default)] bg-[var(--bg-surface-2)] text-[11px] font-black">{initials(displayName)}</span>
              <ChevronDown aria-hidden className="hidden size-3 text-[var(--text-tertiary)] sm:block" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64 border-[var(--border-default)] bg-[var(--bg-surface)] text-[var(--text-primary)]">
            <DropdownMenuLabel>
              <span className="block truncate text-sm">{displayName}</span>
              <span className="block truncate text-[10px] font-normal text-[var(--text-secondary)]">{user?.email}</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-[var(--border-subtle)]" />
            <DropdownMenuItem asChild><Link href="/settings/general"><User aria-hidden className="mr-2 size-4" />Account profile</Link></DropdownMenuItem>
            <DropdownMenuItem asChild><Link href="/settings/general"><Settings aria-hidden className="mr-2 size-4" />Platform settings</Link></DropdownMenuItem>
            <DropdownMenuSeparator className="bg-[var(--border-subtle)]" />
            <DropdownMenuItem disabled={signingOut} onSelect={() => void handleSignOut()} className="text-[var(--status-danger)] focus:text-[var(--status-danger)]">
              <LogOut aria-hidden className="mr-2 size-4" />{signingOut ? "Signing out…" : "Sign out"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
