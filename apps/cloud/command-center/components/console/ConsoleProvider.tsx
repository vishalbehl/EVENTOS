"use client";

import { createContext, useContext, useMemo } from "react";
import { usePathname } from "next/navigation";
import { CONSOLE_REGISTRY, resolveConsoleKey, type ConsoleDefinition, type ConsoleKey } from "@/lib/console-registry";

interface ConsoleContextValue { consoleKey: ConsoleKey; console: ConsoleDefinition }
const ConsoleContext = createContext<ConsoleContextValue | null>(null);

export function ConsoleProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const value = useMemo(() => {
    const consoleKey = resolveConsoleKey(pathname);
    return { consoleKey, console: CONSOLE_REGISTRY[consoleKey] };
  }, [pathname]);
  return <ConsoleContext.Provider value={value}>{children}</ConsoleContext.Provider>;
}

export function useConsole() {
  const value = useContext(ConsoleContext);
  if (!value) throw new Error("useConsole must be used inside ConsoleProvider");
  return value;
}
