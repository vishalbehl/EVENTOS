"use client";

import { useEffect, useRef, useState } from "react";
import { useEvent } from "@/hooks/useEvents";
import { accessContextCacheKey, useAuthStore } from "@/store/use-auth-store";
import type { EventResponse } from "@/types/backend";

/** Freeze the observed event/version while editing; never fetch a new version to force a save. */
export function useEventEditSession(eventId: string) {
  const query = useEvent(eventId);
  const { user, activeContext, isContextSwitching } = useAuthStore();
  const scope = `${user?.id}:${accessContextCacheKey(activeContext, user?.organization_id)}:${eventId}`;
  const currentScope = useRef(scope);
  currentScope.current = scope;
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const [draft, setDraft] = useState<{ scope: string; event: EventResponse; dirty: boolean } | null>(null);
  const [reloading, setReloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    setReloading(false);
  }, [scope]);

  useEffect(() => {
    if (isContextSwitching || !query.data || query.data.id !== eventId) return;
    setDraft(previous => previous?.scope === scope && (previous.dirty
      || previous.event.version > query.data!.version)
      ? previous : { scope, event: query.data!, dirty: false });
  }, [scope, eventId, isContextSwitching, query.data]);

  const event = !isContextSwitching && draft?.scope === scope ? draft.event : undefined;
  const ready = !!event && Number.isInteger(event.version) && event.version > 0;
  const markDirty = () => setDraft(previous => previous?.scope === scope
    ? { ...previous, dirty: true } : previous);
  const complete = (saved: EventResponse, preserveDirty = false) => {
    if (!mounted.current || currentScope.current !== scope || saved.id !== eventId) return false;
    setDraft({ scope, event: saved, dirty: preserveDirty });
    setError(null);
    return true;
  };
  const reload = async () => {
    setReloading(true);
    try {
      const result = await query.refetch({ throwOnError: true });
      if (!mounted.current || currentScope.current !== scope) return;
      if (!result.data || result.data.id !== eventId) throw new Error("Current event settings are unavailable.");
      complete(result.data);
    } catch (failure) {
      if (mounted.current && currentScope.current === scope) setError(
        failure && typeof failure === "object" && "message" in failure
          ? String(failure.message) : "Reload failed. Your edits are preserved.");
    } finally {
      if (mounted.current && currentScope.current === scope) setReloading(false);
    }
  };
  const loadError = query.error && typeof query.error === "object" && "message" in query.error
    ? String(query.error.message) : query.isError ? "Event settings are unavailable." : null;
  return { scope, event, dirty: draft?.scope === scope && draft.dirty,
    version: ready ? event!.version : null, ready, markDirty, complete,
    reload, reloading, error: error ?? loadError, isCurrent: () => mounted.current && currentScope.current === scope };
}
