"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  LogOut,
  Monitor,
  ScanLine,
  Settings,
  ShieldCheck,
  FileText,
  Activity,
  HardDrive,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useAuthStore, type AppMode } from "@/store/use-auth-store";

const MODES: Array<{
  mode: AppMode;
  href: string;
  label: string;
  sublabel: string;
  icon: any;
}> = [
  {
    mode: "workstation",
    href: "/workstation",
    label: "Workstation Mode",
    sublabel: "Speaker slide check & preview",
    icon: Monitor,
  },
  {
    mode: "scanning",
    href: "/scanning",
    label: "Scanning Mode",
    sublabel: "Intake & station allocation",
    icon: ScanLine,
  },
  {
    mode: "admin",
    href: "/admin",
    label: "Admin Console",
    sublabel: "Technician fleet & file manager",
    icon: ShieldCheck,
  },
];

function CollapsedTooltip({ label }: { label: string }) {
  return (
    <span className="pointer-events-none absolute left-full ml-2.5 hidden -translate-y-1/2 whitespace-nowrap rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-xs font-bold text-[var(--text)] shadow-xl group-hover/nav:block z-50">
      {label}
    </span>
  );
}

export function Sidebar({
  activeMode,
  title,
}: {
  activeMode: AppMode;
  title: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { setMode, logout, stationNumber } = useAuthStore();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);

  const adminNavItems = [
    { href: "/admin", label: "Workstation Fleet", icon: LayoutDashboard },
    { href: "/admin/files", label: "Presentations Hub", icon: FileText },
    { href: "/admin/devices", label: "Device Manager", icon: HardDrive },
    { href: "/admin/logs", label: "Audit Logs", icon: Activity },
  ];

  return (
    <motion.aside
      initial={false}
      animate={{ width: isCollapsed ? 72 : 260 }}
      transition={{ duration: 0.22, ease: "easeInOut" }}
      className="flex shrink-0 flex-col border-r border-[var(--border)] bg-[var(--surf)] p-3 relative h-full select-none"
    >
      {/* Brand Header with Logo & Hover Collapse Toggle (Matching Registration Layout) */}
      <div
        className={cn(
          "group/logo relative mb-3 flex h-11 items-center px-1.5",
          isCollapsed ? "justify-center" : "justify-between"
        )}
      >
        <div
          className={cn(
            "flex min-w-0 items-center",
            isCollapsed ? "justify-center" : "gap-2.5"
          )}
          aria-label="Eventos SRR"
        >
          {/* Metal Emblem Logo */}
          <span
            className={cn(
              "grid shrink-0 place-items-center overflow-visible transition-all",
              isCollapsed
                ? "size-7 group-hover/logo:opacity-20 group-focus-within/logo:opacity-20"
                : "size-8"
            )}
          >
            <img
              src="/brand/eventos-emblem-metal.png"
              alt="Eventos Logo"
              width={40}
              height={40}
              className="size-full scale-[2.05] object-contain"
              onError={(e) => {
                (e.target as HTMLElement).style.display = "none";
              }}
            />
          </span>

          {!isCollapsed && (
            <div className="whitespace-nowrap truncate min-w-0">
              <span className="truncate text-sm font-black uppercase tracking-[0.25em] text-[var(--text)] block leading-none">
                EVENT<span className="text-[var(--acc)]">OS</span>
              </span>
              <span className="block truncate text-[9px] font-bold tracking-widest text-[var(--pri)] mt-1 uppercase">
                {activeMode === "admin" ? "Admin Console" : "Scanner Gateway"}
              </span>
            </div>
          )}
        </div>

        {/* Hover-Triggered Collapse / Expand Toggle Button */}
        <button
          type="button"
          onClick={() => setIsCollapsed(!isCollapsed)}
          className={cn(
            "grid size-7 place-items-center rounded-lg border border-[var(--border)] bg-[var(--card)] text-[var(--muted)] transition-all duration-150 hover:text-[var(--text)] hover:bg-[var(--raised)] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] shadow-xs",
            isCollapsed &&
              "absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 opacity-0 group-hover/logo:opacity-100 group-focus-within/logo:opacity-100 z-50 bg-[var(--card)]"
          )}
          aria-label={isCollapsed ? "Expand navigation" : "Collapse navigation"}
          title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {isCollapsed ? (
            <ChevronRight className="size-4" />
          ) : (
            <ChevronLeft className="size-4" />
          )}
        </button>
      </div>

      {/* Mode Switcher */}
      <div className="relative mb-4">
        {!isCollapsed ? (
          <button
            type="button"
            onClick={() => setSwitcherOpen((v) => !v)}
            className="flex w-full items-center gap-2.5 rounded-xl border border-[var(--border)] bg-[var(--card)] p-2 text-left transition-all hover:border-[var(--pri)]/50 shadow-xs cursor-pointer"
          >
            <span className="grid size-7 place-items-center rounded-lg bg-[var(--surf)] text-[var(--pri)] shrink-0">
              <ChevronDown className="size-3.5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-black text-[var(--text)]">{title}</span>
              <span className="block truncate text-[9px] font-semibold text-[var(--muted)]">
                {activeMode === "workstation" ? `Station #${stationNumber ?? "Not configured"}` : "Active Mode"}
              </span>
            </span>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setSwitcherOpen((v) => !v)}
            className="group/nav relative flex size-11 mx-auto items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--card)] hover:border-[var(--pri)]/50 text-[var(--pri)] cursor-pointer shadow-xs"
          >
            <ShieldCheck className="size-5" />
            <CollapsedTooltip label={`Mode: ${title}`} />
          </button>
        )}

        <AnimatePresence>
          {switcherOpen && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className={cn(
                "absolute z-50 mt-2 space-y-1 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-2 shadow-2xl",
                isCollapsed ? "left-14 top-0 w-52" : "left-0 right-0"
              )}
            >
              {MODES.map((m) => {
                const Icon = m.icon;
                const isSelected = activeMode === m.mode;
                return (
                  <Link
                    key={m.mode}
                    href={m.href}
                    onClick={() => {
                      setMode(m.mode);
                      setSwitcherOpen(false);
                    }}
                    className={cn(
                      "flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-xs font-bold transition-colors",
                      isSelected
                        ? "bg-[var(--pri)] text-[var(--primary-contrast)]"
                        : "hover:bg-[var(--raised)] text-[var(--text)]"
                    )}
                  >
                    <Icon className="size-4 shrink-0" />
                    <div className="truncate">
                      <p className="leading-tight truncate">{m.label}</p>
                      <p
                        className={cn(
                          "text-[9px] font-normal truncate",
                          isSelected
                            ? "text-[var(--primary-contrast)]/80"
                            : "text-[var(--muted)]"
                        )}
                      >
                        {m.sublabel}
                      </p>
                    </div>
                  </Link>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Navigation Links based on active mode */}
      <nav className="flex-1 space-y-1">
        {activeMode === "workstation" && (
          <Link
            href="/workstation"
            className={cn(
              "group/nav relative flex items-center rounded-xl text-xs font-black transition-colors",
              isCollapsed ? "size-11 mx-auto justify-center px-0" : "gap-3 px-3 py-2.5",
              pathname === "/workstation"
                ? "bg-[var(--pri)] text-[var(--primary-contrast)] shadow-xs"
                : "hover:bg-[var(--raised)] text-[var(--text)]"
            )}
          >
            <Monitor className="size-4 shrink-0" />
            {!isCollapsed && <span>Presentation Check</span>}
            {isCollapsed && <CollapsedTooltip label="Presentation Check" />}
          </Link>
        )}

        {activeMode === "scanning" && (
          <Link
            href="/scanning"
            className={cn(
              "group/nav relative flex items-center rounded-xl text-xs font-black transition-colors",
              isCollapsed ? "size-11 mx-auto justify-center px-0" : "gap-3 px-3 py-2.5",
              pathname === "/scanning"
                ? "bg-[var(--pri)] text-[var(--primary-contrast)] shadow-xs"
                : "hover:bg-[var(--raised)] text-[var(--text)]"
            )}
          >
            <ScanLine className="size-4 shrink-0" />
            {!isCollapsed && <span>QR Intake & Allocation</span>}
            {isCollapsed && <CollapsedTooltip label="QR Intake & Allocation" />}
          </Link>
        )}

        {activeMode === "admin" &&
          adminNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "group/nav relative flex items-center rounded-xl text-xs font-black transition-colors",
                  isCollapsed ? "size-11 mx-auto justify-center px-0" : "gap-3 px-3 py-2.5",
                  isActive
                    ? "bg-[var(--pri)] text-[var(--primary-contrast)] shadow-xs"
                    : "hover:bg-[var(--raised)] text-[var(--text)]"
                )}
              >
                <Icon className="size-4 shrink-0" />
                {!isCollapsed && <span className="truncate">{item.label}</span>}
                {isCollapsed && <CollapsedTooltip label={item.label} />}
              </Link>
            );
          })}
      </nav>

      {/* Footer Navigation */}
      <div className="mt-auto space-y-1 border-t border-[var(--border)] pt-2.5">
        <Link
          href="/"
          className={cn(
            "group/nav relative flex items-center rounded-xl text-xs font-bold text-[var(--text)] hover:bg-[var(--raised)] transition-colors",
            isCollapsed ? "size-11 mx-auto justify-center px-0" : "gap-3 px-3 py-2"
          )}
        >
          <Settings className="size-4 text-[var(--muted)] shrink-0" />
          {!isCollapsed && <span className="truncate">Change Mode</span>}
          {isCollapsed && <CollapsedTooltip label="Change Mode / Setup" />}
        </Link>

        <button
          type="button"
          onClick={() => {
            logout();
            router.push("/");
          }}
          className={cn(
            "group/nav relative flex w-full items-center rounded-xl text-xs font-bold text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer",
            isCollapsed ? "size-11 mx-auto justify-center px-0" : "gap-3 px-3 py-2"
          )}
        >
          <LogOut className="size-4 shrink-0" />
          {!isCollapsed && <span>Exit</span>}
          {isCollapsed && <CollapsedTooltip label="Exit Station" />}
        </button>
      </div>
    </motion.aside>
  );
}
