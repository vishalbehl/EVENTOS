"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, Home } from "lucide-react";

const LABELS: Record<string, string> = {
  "ai-workspace": "AI workspace",
  "cost-breakdown": "Cost breakdown",
  "developer-platform": "Developer platform",
  "identity-security": "Identity and security",
  "operations-center": "Operations center",
  "platform-settings": "Platform settings",
  "resource-planning": "Resource planning",
  "service-requests": "Service requests",
  "support-center": "Support center",
  "super-admin": "Super Admin",
  "version-history": "Version history",
};

function labelFor(segment: string) {
  if (LABELS[segment]) return LABELS[segment];
  if (/^[0-9a-f-]{20,}$/i.test(segment)) return "Details";
  return segment.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function Breadcrumbs() {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);

  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex min-w-0 items-center gap-1.5 overflow-hidden text-xs text-[var(--text-secondary)]">
        <li className="shrink-0">
          <Link
            href="/dashboard/overview"
            aria-label="Command Center home"
            className="inline-flex rounded-md p-1 transition-colors hover:bg-[var(--bg-surface-2)] hover:text-[var(--text-primary)]"
          >
            <Home aria-hidden className="size-3.5" />
          </Link>
        </li>
        {segments.map((segment, index) => {
          const href = `/${segments.slice(0, index + 1).join("/")}`;
          const current = index === segments.length - 1;
          return (
            <li key={href} className="flex min-w-0 items-center gap-1.5">
              <ChevronRight aria-hidden className="size-3 shrink-0 text-[var(--text-tertiary)]" />
              {current ? (
                <span aria-current="page" className="truncate font-medium text-[var(--text-primary)]">
                  {labelFor(segment)}
                </span>
              ) : (
                <Link href={href} className="truncate rounded-sm hover:text-[var(--text-primary)] hover:underline hover:underline-offset-4">
                  {labelFor(segment)}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
