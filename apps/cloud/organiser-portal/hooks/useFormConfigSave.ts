"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { organiserFormService } from "@/services/form-template-service";
import { accessContextCacheKey, useAuthStore } from "@/store/use-auth-store";

/** Use the version observed with the draft, not a fresh version fetched to force a save. */
export function useFormConfigSave(eventId: string) {
  const queries = useQueryClient();
  const { user, activeContext } = useAuthStore();
  const scope = `${user?.id}:${accessContextCacheKey(activeContext, user?.organization_id)}:${eventId}`;
  const latest = useRef(scope);
  latest.current = scope;
  const mounted = useRef(true);
  const busy = useRef(false);
  const receipt = useRef<{ fingerprint: string; key: string } | null>(null);
  const [pending, setPending] = useState(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const isCurrent = useCallback(() => {
    const current = useAuthStore.getState();
    const liveScope = `${current.user?.id}:${accessContextCacheKey(current.activeContext, current.user?.organization_id)}:${eventId}`;
    return mounted.current && latest.current === scope && liveScope === scope
      && !current.isContextSwitching;
  }, [scope, eventId]);
  const save = async (version: number | null,
    payload: Parameters<typeof organiserFormService.saveEventFormConfig>[1]) => {
    if (!isCurrent() || !user || !version || !Number.isInteger(version) || busy.current) {
      throw new Error("Reload the current form before saving, or wait for the pending save.");
    }
    const fingerprint = JSON.stringify([scope, version, payload]);
    if (receipt.current?.fingerprint !== fingerprint) {
      receipt.current = { fingerprint, key: crypto.randomUUID() };
    }
    busy.current = true;
    setPending(true);
    try {
      const result = await organiserFormService.saveEventFormConfig(eventId, payload,
        { version, key: receipt.current.key });
      if (!isCurrent()) return null;
      receipt.current = null;
      void queries.invalidateQueries({ queryKey: ["event", accessContextCacheKey(activeContext, user?.organization_id), eventId] });
      return result;
    } finally {
      busy.current = false;
      if (isCurrent()) setPending(false);
    }
  };
  return { save, pending, isCurrent };
}
