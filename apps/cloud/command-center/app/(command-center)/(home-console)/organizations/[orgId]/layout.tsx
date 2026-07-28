"use client";

import { use } from "react";
import { OrgConsoleLayout } from "@/features/organizations/components/OrgConsoleLayout";

interface Props {
  children: React.ReactNode;
  params: Promise<{ orgId: string }>;
}

export default function OrgConsolePageLayout({ children, params }: Props) {
  const unwrappedParams = use(params);
  return <OrgConsoleLayout orgId={unwrappedParams.orgId}>{children}</OrgConsoleLayout>;
}
