"use client";

import { OperatorModeLayout } from "@/components/layout/OperatorModeLayout";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <OperatorModeLayout
      activeMode="admin"
      title="Admin Command Console"
      subtitle="Technician Fleet Controller"
    >
      <div className="p-6 max-w-[1600px] mx-auto space-y-6">{children}</div>
    </OperatorModeLayout>
  );
}
