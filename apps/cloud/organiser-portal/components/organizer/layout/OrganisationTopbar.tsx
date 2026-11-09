"use client";

import Link from "next/link";
import { CalendarDays, ChevronDown, LogOut, Moon, Settings, Sparkles, Sun, User } from "lucide-react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CommandPalette } from "@/components/organizer/layout/CommandPalette";
import { NotificationCenter } from "@/components/organizer/layout/NotificationCenter";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useOrganiserDashboard } from "@/hooks/useOrganiserDashboard";
import { useInternalEnterpriseSummary } from "@/hooks/useCloudCommercial";
import { useTheme } from "@/hooks/useTheme";
import { isPlatformSelfSession, useAuthStore } from "@/store/use-auth-store";

function initials(value: string) {
  return value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "OR";
}

function getPlanTier(name?: string | null): "enterprise" | "scale" | "growth" | "starter" | "free" | "default" {
  if (!name) return "default";
  const lower = name.toLowerCase();
  if (lower.includes("enterprise") || lower.includes("unrestricted")) return "enterprise";
  if (lower.includes("scale")) return "scale";
  if (lower.includes("growth")) return "growth";
  if (lower.includes("starter")) return "starter";
  if (lower.includes("free") || lower.includes("trial")) return "free";
  return "default";
}

export function OrganisationTopbar() {
  const router = useRouter();
  const dashboard = useOrganiserDashboard();
  const platformSelf = useAuthStore(isPlatformSelfSession);
  const enterprise = useInternalEnterpriseSummary(platformSelf);
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const { theme, toggleTheme } = useTheme();
  const [localDate, setLocalDate] = useState("");
  const [signingOut, setSigningOut] = useState(false);
  const name = user?.full_name || [user?.first_name, user?.last_name].filter(Boolean).join(" ") || user?.email || "Organiser";
  const commercial = dashboard.data?.commercial;
  const planLoading = platformSelf ? enterprise.isLoading : dashboard.isLoading;
  const rawPlanName = platformSelf ? enterprise.data?.plan.name : commercial?.offer_name;
  const planName = rawPlanName && rawPlanName !== "Not configured" && rawPlanName !== "Unavailable" ? rawPlanName : null;
  const planStatus = platformSelf ? (enterprise.data?.plan.status || "ACTIVE") : (commercial?.status || (planName ? "ACTIVE" : "UNAVAILABLE"));
  const isActive = !planLoading && Boolean(planName) && planStatus === "ACTIVE";
  const planTier = getPlanTier(planName);

  useEffect(() => {
    setLocalDate(new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(new Date()));
  }, []);

  const signOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try { await logout(); } finally { router.replace("/"); router.refresh(); }
  };

  return (
    <header className="organisation-topbar" aria-label="Organiser utilities">
      <div className="organisation-topbar-start">
        <div className="organisation-topbar-pill">
          <CalendarDays className="size-4" aria-hidden />
          <time>{localDate || "Today"}</time>
        </div>
        <button
          type="button"
          onClick={toggleTheme}
          className="organisation-theme-switch"
          role="switch"
          aria-checked={theme === "dark"}
          aria-label={theme === "dark" ? "Use light component mode" : "Use dark component mode"}
          title={theme === "dark" ? "Use light component mode" : "Use dark component mode"}
        >
          <span className="organisation-theme-switch-track" aria-hidden>
            <span className="organisation-theme-switch-thumb">{theme === "dark" ? <Moon className="size-3.5" /> : <Sun className="size-3.5" />}</span>
          </span>
          <span className="organisation-theme-switch-label">{theme === "dark" ? "Dark" : "Light"}</span>
        </button>
      </div>

      <div className="organisation-topbar-search">
        <CommandPalette />
      </div>

      <div className="organisation-topbar-end">
        <Link
          href="/commercial/workspace"
          className={`organisation-topbar-pill organisation-plan-pill tier-${planTier}`}
          title="View and manage workspace plan"
        >
          <Sparkles className="size-3.5 shrink-0 opacity-80" aria-hidden />
          <span className="truncate max-w-[140px] font-semibold">
            {planLoading ? "Loading…" : planName || "Select Plan"}
          </span>
          {isActive ? (
            <span className="organisation-plan-active-badge">
              <span className="organisation-plan-active-dot" aria-hidden />
              Active
            </span>
          ) : null}
        </Link>
        <NotificationCenter />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="organisation-profile-button flex items-center gap-1" aria-label="Open account menu">
              <span className="grid size-10 place-items-center rounded-full border border-white/70 bg-gradient-to-br from-[#a445ff] to-[#f0445c] text-xs font-bold text-white shadow-md">{initials(name)}</span>
              <ChevronDown className="hidden size-3 text-[var(--org-muted)] sm:block" aria-hidden />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel><span className="block truncate">{name}</span><span className="block truncate text-xs font-normal text-muted-foreground">{user?.email}</span></DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild><Link href="/settings/general"><User className="mr-2 size-4" />Account profile</Link></DropdownMenuItem>
            <DropdownMenuItem asChild><Link href="/settings/appearance"><Settings className="mr-2 size-4" />Appearance settings</Link></DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={signingOut} onSelect={() => void signOut()} className="text-destructive"><LogOut className="mr-2 size-4" />{signingOut ? "Signing out…" : "Sign out"}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
