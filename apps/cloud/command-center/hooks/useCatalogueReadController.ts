"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError } from "@/lib/api-client";

export interface CatalogueReadFailure {
  message: string;
  status?: number;
  correlationId?: string;
}

export function useCatalogueReadController(isCurrent: () => boolean) {
  const mounted = useRef(true);
  const generation = useRef(0);
  const controllers = useRef(new Map<string, AbortController>());
  const [pending, setPending] = useState<ReadonlySet<string>>(() => new Set());
  const retryAtRef = useRef<Record<string, number>>({});
  const globalRetryAtRef = useRef(0);
  const [retryAt, setRetryAt] = useState<Record<string, number>>({});
  const [globalRetryAt, setGlobalRetryAt] = useState(0);
  const [failure, setFailure] = useState<Record<string, CatalogueReadFailure | undefined>>({});
  const [clock, setClock] = useState(() => Date.now());

  const invalidate = useCallback(() => {
    generation.current += 1;
    for (const controller of controllers.current.values()) controller.abort();
    controllers.current.clear();
    if (mounted.current) {
      setPending(new Set());
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      generation.current += 1;
      for (const controller of controllers.current.values()) controller.abort();
      controllers.current.clear();
    };
  }, [isCurrent]);

  useEffect(() => {
    const next = Math.min(...[globalRetryAt, ...Object.values(retryAt)].filter(value => value > clock));
    if (!Number.isFinite(next)) return;
    const timeout = window.setTimeout(() => setClock(Date.now()), Math.min(1_000, Math.max(0, next - Date.now())) + 20);
    return () => window.clearTimeout(timeout);
  }, [clock, globalRetryAt, retryAt]);

  const run = useCallback(async <T,>(
    slot: string,
    load: (signal: AbortSignal) => Promise<T>,
    apply: (value: T) => void,
    onError?: (error: unknown) => void,
    options?: { refresh?: boolean },
  ) => {
    if (!mounted.current || !isCurrent()) return;
    if (options?.refresh) invalidate();
    else if (controllers.current.has(slot)) return;
    if (globalRetryAtRef.current > Date.now()) return;
    if ((retryAtRef.current[slot] || 0) > Date.now()) return;

    const requestGeneration = generation.current;
    const controller = new AbortController();
    controllers.current.set(slot, controller);
    setPending(current => new Set(current).add(slot));
    setFailure(current => current[slot] ? { ...current, [slot]: undefined } : current);
    const active = () => mounted.current && !controller.signal.aborted && isCurrent()
      && requestGeneration === generation.current && controllers.current.get(slot) === controller;
    try {
      const value = await load(controller.signal);
      if (active()) apply(value);
    } catch (error: unknown) {
      if (active()) {
        const problem = error instanceof ApiError ? error : null;
        const seconds = Math.min(86_400, Math.max(0, problem?.retryAfter || 0));
        if (seconds) {
          const deadline = Date.now() + seconds * 1_000;
          retryAtRef.current = { ...retryAtRef.current, [slot]: deadline };
          globalRetryAtRef.current = Math.max(globalRetryAtRef.current, deadline);
          setRetryAt(current => ({ ...current, [slot]: deadline }));
          setGlobalRetryAt(current => Math.max(current, deadline));
        }
        setFailure(current => ({ ...current, [slot]: {
          message: error instanceof Error ? error.message : "The catalogue page could not be loaded.",
          status: problem?.status,
          correlationId: problem?.correlationId,
        } }));
        onError?.(error);
      }
    } finally {
      if (controllers.current.get(slot) === controller) controllers.current.delete(slot);
      if (mounted.current && requestGeneration === generation.current) {
        setPending(current => {
          if (!current.has(slot)) return current;
          const next = new Set(current);
          next.delete(slot);
          return next;
        });
      }
    }
  }, [invalidate, isCurrent]);

  const blocked = useMemo(() => new Set([
    ...pending,
    ...Object.entries(retryAt).filter(([, value]) => value > clock).map(([slot]) => slot),
  ]), [clock, pending, retryAt]);
  const coolingDown = globalRetryAt > clock;

  return { run, invalidate, pending, blocked, coolingDown, failure, retryAt };
}
