"use client";

import { Fragment, type ReactNode } from "react";
import { accessContextCacheKey, useAuthStore } from "@/store/use-auth-store";

/** Remount legacy local form state before another identity/context can see it. */
export function ScopedEventEditor({ eventId, children }: { eventId: string; children: ReactNode }) {
  const { user, activeContext, isContextSwitching, isAuthenticated } = useAuthStore();
  if (isContextSwitching || !isAuthenticated) return <p role="status">Loading access context…</p>;
  const key = `${user?.id}:${accessContextCacheKey(activeContext, user?.organization_id)}:${eventId}`;
  return <Fragment key={key}>{children}</Fragment>;
}
