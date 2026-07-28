"use client";

import { OrgConsoleProvider } from "@/features/organizations/context/OrgConsoleContext";
import { OrgConsoleSidebar } from "@/features/organizations/components/OrgConsoleSidebar";
import { OrgGlobalSearch } from "@/features/organizations/components/OrgGlobalSearch";

interface OrgConsoleLayoutProps {
  children: React.ReactNode;
  orgId: string;
}

export function OrgConsoleLayout({ children, orgId }: OrgConsoleLayoutProps) {
  return (
    <OrgConsoleProvider orgId={orgId}>
      <div className="flex h-full min-h-0 overflow-hidden">
        <OrgConsoleSidebar />
        <div className="flex min-w-0 flex-1 flex-col"><header className="flex shrink-0 items-center border-b border-[var(--border-default)] bg-[var(--bg-surface-2)] px-6 py-2.5"><OrgGlobalSearch orgId={orgId} /></header><main className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar">{children}</main></div>
      </div>
    </OrgConsoleProvider>
  );
}
