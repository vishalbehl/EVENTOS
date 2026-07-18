"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Boxes, History, Percent, Receipt, Users } from "lucide-react";
import { cn } from "@/lib/utils";

export const CATALOGUE_ROUTES = [
  { label: "Hardware", href: "/business/pricing/hardware-catalog", icon: Boxes },
  { label: "Staff", href: "/business/pricing/staff-catalog", icon: Users },
  { label: "Vendor pricing", href: "/business/pricing/vendor-pricing", icon: Receipt },
  { label: "Price history", href: "/business/pricing/price-history", icon: History },
  { label: "Margin rules", href: "/business/pricing/margin-rules", icon: Percent },
] as const;

export function CatalogueTabs({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isCatalogueRoute = CATALOGUE_ROUTES.some((route) => pathname === route.href || pathname.startsWith(`${route.href}/`));
  if (!isCatalogueRoute) return children;

  return <div className="flex min-h-full flex-col">
    <div className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 pt-4 sm:px-6">
      <nav aria-label="Catalogue sections" className="no-scrollbar flex gap-1 overflow-x-auto">
        {CATALOGUE_ROUTES.map((route) => {
          const active = pathname === route.href || pathname.startsWith(`${route.href}/`);
          const Icon = route.icon;
          return <Link key={route.href} href={route.href} aria-current={active ? "page" : undefined} className={cn("relative flex h-10 shrink-0 items-center gap-2 rounded-t-lg px-3 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-surface-3)] hover:text-[var(--text-primary)]", active && "bg-[var(--bg-surface-2)] text-[var(--text-primary)] after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:bg-[var(--text-primary)]")}><Icon className="size-3.5" />{route.label}</Link>;
        })}
      </nav>
    </div>
    {children}
  </div>;
}
