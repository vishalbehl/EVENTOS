"use client";

import { useEffect, useState } from "react";
import { useAuthStore, type AppMode } from "@/store/use-auth-store";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";

export function OperatorModeLayout({
  children,
  activeMode,
  title,
  subtitle,
}: {
  children: React.ReactNode;
  activeMode: AppMode;
  title: string;
  subtitle: string;
}) {
  const { setMode } = useAuthStore();
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
    setMode(activeMode);
  }, [activeMode, setMode]);

  if (!hydrated) return null;

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--base)] text-[var(--text)]">
      {/* Dynamic Sidebar */}
      <Sidebar activeMode={activeMode} title={title} />

      {/* Main Content Area */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Header title={title} subtitle={subtitle} />
        <main className="min-h-0 flex-1 overflow-y-auto bg-[var(--base)]">
          {children}
        </main>
      </div>
    </div>
  );
}
