"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown, ChevronLeft, ChevronRight, Grid2X2, Home, Palette, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { CONSOLE_KEYS, CONSOLE_REGISTRY, isNavigationItemActive } from "@/lib/console-registry";
import { useConsole } from "@/components/console/ConsoleProvider";
import { useUIStore } from "@/store/useUIStore";

const CONSOLE_SWITCHER_COLORS = {
  home: { foreground: "#a78bfa", background: "rgba(167,139,250,.12)", border: "rgba(167,139,250,.22)" },
  business: { foreground: "#38bdf8", background: "rgba(56,189,248,.12)", border: "rgba(56,189,248,.22)" },
  revenue: { foreground: "#34d399", background: "rgba(52,211,153,.12)", border: "rgba(52,211,153,.22)" },
  operations: { foreground: "#fbbf24", background: "rgba(251,191,36,.12)", border: "rgba(251,191,36,.22)" },
  security: { foreground: "#fb7185", background: "rgba(251,113,133,.12)", border: "rgba(251,113,133,.22)" },
  developer: { foreground: "#c084fc", background: "rgba(192,132,252,.12)", border: "rgba(192,132,252,.22)" },
  support: { foreground: "#fb923c", background: "rgba(251,146,60,.12)", border: "rgba(251,146,60,.22)" },
} as const;

export function Sidebar() {
  const pathname = usePathname();
  const previousPathname = useRef(pathname);
  const { console: activeConsole } = useConsole();
  const { isSidebarCollapsed, isMobileSidebarOpen, setMobileSidebarOpen, toggleSidebar } = useUIStore();
  const isCollapsed = isSidebarCollapsed && !isMobileSidebarOpen;
  const [switcherOpen, setSwitcherOpen] = useState(false);

  useEffect(() => {
    if (previousPathname.current !== pathname) {
      setMobileSidebarOpen(false);
      setSwitcherOpen(false);
      previousPathname.current = pathname;
    }
  }, [pathname, setMobileSidebarOpen]);

  return (
    <motion.aside initial={false} animate={{ width: isCollapsed ? 72 : 248 }} transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }} className="relative z-40 flex h-full flex-col overflow-visible border-r border-[var(--sidebar-border)] bg-[var(--sidebar-bg)]">
      <div className="flex h-full flex-col overflow-visible px-3 py-4">
        <div className={cn("group/logo relative mb-3 flex h-11 items-center px-2", isCollapsed ? "justify-center" : "justify-between")}>
          <div className={cn("flex min-w-0 items-center", isCollapsed ? "justify-center" : "gap-2.5")} aria-label="Eventos">
            <span className={cn("grid shrink-0 place-items-center overflow-visible", isCollapsed ? "size-7" : "size-8", "transition-opacity duration-150", isCollapsed && "group-hover/logo:opacity-20 group-focus-within/logo:opacity-20")}>
              <Image src="/brand/eventos-emblem-metal.png" alt="" width={40} height={40} priority className="size-full scale-[2.05] object-contain" />
            </span>
            {!isCollapsed && <span className="truncate text-sm font-semibold uppercase tracking-[0.25em] text-[var(--text-primary)]">Eventos</span>}
          </div>
          <button onClick={toggleSidebar} className={cn("grid size-7 place-items-center rounded-lg border border-[var(--border)] bg-[var(--card)] text-[var(--muted)] transition-all duration-150 hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]", isCollapsed && "absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 opacity-0 shadow-sm group-hover/logo:opacity-100 group-focus-within/logo:opacity-100")} aria-label={isCollapsed ? "Expand navigation" : "Collapse navigation"}>
            {isCollapsed ? <ChevronRight className="size-4" /> : <ChevronLeft className="size-4" />}
          </button>
        </div>

        {!isCollapsed && <div className="relative mb-4">
          <button type="button" onClick={() => setSwitcherOpen((open) => !open)} aria-expanded={switcherOpen} className={cn("group flex w-full items-center rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] text-left shadow-sm transition-colors hover:bg-[var(--bg-surface-3)]", isCollapsed ? "h-11 justify-center" : "gap-3 p-2.5")}>
            <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface-3)]" style={{ color: activeConsole.accent }}><activeConsole.icon className="size-4" /></span>
            {!isCollapsed && <><span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold text-[var(--text-primary)]">{activeConsole.name}</span><span className="block truncate text-[10px] text-[var(--text-tertiary)]">Focused workspace</span></span><ChevronDown className="size-3.5 text-[var(--text-tertiary)]" /></>}
          </button>
          <AnimatePresence>
            {switcherOpen && <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} className={cn("absolute z-[90] mt-2 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-1.5 shadow-[var(--shadow-popover)]", isCollapsed ? "left-14 w-56" : "inset-x-0")}>
              {CONSOLE_KEYS.map((key) => { const definition = CONSOLE_REGISTRY[key]; const Icon = definition.icon; const color = CONSOLE_SWITCHER_COLORS[key]; return <Link key={key} href={definition.dashboardRoute} className="group flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-xs text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-surface-3)] hover:text-[var(--text-primary)]"><span className="grid size-8 shrink-0 place-items-center rounded-lg border transition-transform group-hover:scale-105" style={{ color: color.foreground, backgroundColor: color.background, borderColor: color.border }}><Icon className="size-4" /></span><span className="flex-1">{definition.shortName}</span>{definition.key === activeConsole.key && <Check className="size-3.5" style={{ color: color.foreground }} />}</Link>; })}
            </motion.div>}
          </AnimatePresence>
        </div>}

        <nav aria-label={`${activeConsole.name} navigation`} className={cn("no-scrollbar min-h-0 flex-1", isCollapsed ? "overflow-visible" : "overflow-y-auto overflow-x-hidden")}>
          {activeConsole.key !== "home" && <Link href="/dashboard/consoles" className={cn("group relative mb-3 flex h-9 items-center rounded-lg px-3 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--sidebar-item-hover-bg)] hover:text-[var(--text-primary)]", isCollapsed && "justify-center px-0")}><Home className={cn("size-4", !isCollapsed && "mr-3")} />{!isCollapsed && "All consoles"}{isCollapsed && <CollapsedTooltip label="All consoles" />}</Link>}
          {activeConsole.navigation.map((group) => <section key={group.label} className="mb-5">
            {!isCollapsed && <h2 className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">{group.label}</h2>}
            <div className="space-y-1">{group.items.map((navItem) => { const Icon = navItem.icon; const active = isNavigationItemActive(pathname, navItem.href, navItem.matchers); return <Link key={navItem.href} href={navItem.href} aria-current={active ? "page" : undefined} className={cn("group relative flex h-9 items-center rounded-lg px-3 text-xs font-medium transition-colors", active ? "bg-[var(--sidebar-item-active-bg)] text-[var(--text-primary)] shadow-[inset_0_0_0_1px_var(--border-subtle)]" : "text-[var(--text-secondary)] hover:bg-[var(--sidebar-item-hover-bg)] hover:text-[var(--text-primary)]", isCollapsed && "justify-center px-0")}><Icon className={cn("size-4 shrink-0", !isCollapsed && "mr-3")} />{!isCollapsed && <span className="truncate">{navItem.label}</span>}{isCollapsed && <CollapsedTooltip label={navItem.label} />}</Link>; })}</div>
          </section>)}
        </nav>

        <div className="space-y-1 border-t border-[var(--border)] pt-3">
          <Link href="/platform-settings/general" aria-current={pathname.startsWith("/platform-settings") ? "page" : undefined} className={cn("group relative flex h-9 items-center rounded-lg px-3 text-xs hover:bg-[var(--sidebar-item-hover-bg)]", pathname.startsWith("/platform-settings") ? "bg-[var(--sidebar-item-active-bg)] font-semibold text-[var(--text-primary)]" : "text-[var(--text-secondary)]", isCollapsed && "justify-center px-0")}><Settings className={cn("size-4", !isCollapsed && "mr-3")} />{!isCollapsed && "Platform settings"}{isCollapsed && <CollapsedTooltip label="Platform settings" />}</Link>
          <Link href="/dashboard/consoles" className={cn("group relative flex h-9 items-center rounded-lg px-3 text-xs text-[var(--text-secondary)] hover:bg-[var(--sidebar-item-hover-bg)]", isCollapsed && "justify-center px-0")}><Grid2X2 className={cn("size-4", !isCollapsed && "mr-3")} />{!isCollapsed && "Console directory"}{isCollapsed && <CollapsedTooltip label="Console directory" />}</Link>
          <Link href="/design-system" className={cn("group relative flex h-9 items-center rounded-lg px-3 text-xs text-[var(--text-secondary)] hover:bg-[var(--sidebar-item-hover-bg)]", isCollapsed && "justify-center px-0")}><Palette className={cn("size-4", !isCollapsed && "mr-3")} />{!isCollapsed && "UI catalogue"}{isCollapsed && <CollapsedTooltip label="UI catalogue" />}</Link>
        </div>
      </div>
    </motion.aside>
  );
}

function CollapsedTooltip({ label }: { label: string }) {
  return <span role="tooltip" className="pointer-events-none absolute left-[calc(100%+10px)] top-1/2 z-[100] -translate-y-1/2 translate-x-1 whitespace-nowrap rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--text-primary)] opacity-0 shadow-[var(--shadow-popover)] transition-[opacity,transform] duration-150 group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100" aria-hidden="true">{label}</span>;
}
