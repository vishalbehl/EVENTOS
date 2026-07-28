"use client";

import { createContext, useContext, ReactNode } from "react";
import { useOrganizationConsoleSummary, OrganizationConsoleSummary } from "@/features/organizations/api/organization-console-api";

interface OrgConsoleContextValue {
  orgId: string;
  summary?: OrganizationConsoleSummary;
  summaryLoading: boolean;
  summaryError: Error | null;
}

const OrgConsoleContext = createContext<OrgConsoleContextValue | null>(null);

export function OrgConsoleProvider({
  orgId,
  children,
}: {
  orgId: string;
  children: ReactNode;
}) {
  const { data: summary, isLoading: summaryLoading, error: summaryError } = useOrganizationConsoleSummary(orgId);

  return (
    <OrgConsoleContext.Provider
      value={{
        orgId,
        summary,
        summaryLoading,
        summaryError: summaryError as Error | null,
      }}
    >
      {children}
    </OrgConsoleContext.Provider>
  );
}

export function useOrgConsole() {
  const ctx = useContext(OrgConsoleContext);
  if (!ctx) throw new Error("useOrgConsole must be used inside OrgConsoleProvider");
  return ctx;
}
