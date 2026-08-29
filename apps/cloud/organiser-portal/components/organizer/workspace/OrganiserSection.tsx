"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { NeedsAttentionPane, OrganiserPage, PageTabs } from "./OrganiserPrimitives";
import { useOrganiserNeedsAttention } from "@/hooks/useOrganiserDashboard";

export type SectionTab = { label: string; href: string };

export function OrganiserSection({
  title,
  description,
  tabs,
  actions,
  children,
}: {
  title: string;
  description: string;
  tabs: SectionTab[];
  actions?: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const attention = useOrganiserNeedsAttention();
  const active = tabs.find((tab) => pathname === tab.href)?.label || tabs[0]?.label || "";

  return (
    <OrganiserPage
      title={title}
      description={description}
      actions={actions}
      tabs={<PageTabs tabs={tabs} active={active} />}
      attention={<NeedsAttentionPane items={attention.data || []} />}
    >
      {children}
    </OrganiserPage>
  );
}

export function Unavailable({ children }: { children: ReactNode }) {
  return <div className="op-unavailable" role="status">{children}</div>;
}
