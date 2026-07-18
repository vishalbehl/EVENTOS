"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { ConsoleTabDefinition } from "@/lib/console-registry";

export function ConsoleTabs({ tabs, label }: { tabs: ConsoleTabDefinition[]; label: string }) {
  const pathname = usePathname();
  return <div className="sticky top-0 z-20 border-b border-[var(--border-subtle)] bg-[color-mix(in_srgb,var(--bg-surface-2)_94%,transparent)] px-4 pt-3 backdrop-blur-xl sm:px-6">
    <nav aria-label={label} className="no-scrollbar flex gap-1 overflow-x-auto" role="tablist">
      {tabs.map((tab) => { const active = pathname === tab.href; const Icon = tab.icon; return <Link key={tab.href} href={tab.href} role="tab" aria-selected={active} aria-current={active ? "page" : undefined} className={cn("relative flex h-10 shrink-0 items-center gap-2 rounded-t-lg px-3 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-surface-3)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)]", active && "bg-[var(--bg-surface)] text-[var(--text-primary)] after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-[var(--text-primary)]")}>{Icon ? <Icon className="size-3.5" /> : null}{tab.label}</Link>; })}
    </nav>
  </div>;
}
