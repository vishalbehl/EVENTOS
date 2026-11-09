"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ApiError } from "@/lib/api-client";

type Slot = "initial" | "templates" | "categories";
type Slots<T> = Record<Slot, T>;
const empty = <T,>(value: T): Slots<T> => ({ initial: value, templates: value, categories: value });

/** Explicit page reads only: no prefetch, stale publication or duplicate clicks. */
export function useCataloguePageRequests(isCurrent: () => boolean) {
  const requests = useRef(new Map<Slot, AbortController>());
  const generation = useRef(0);
  const mounted = useRef(true);
  const cooldowns = useRef(empty<number | null>(null));
  const [pending, setPending] = useState<Slots<boolean>>({ initial: true, templates: false, categories: false });
  const [failure, setFailure] = useState<Slots<ApiError | null>>(empty(null));
  const [retryAt, setRetryAt] = useState<Slots<number | null>>(empty(null));
  const [clock, setClock] = useState(Date.now);
  useEffect(() => {
    const now = Date.now();
    const future = Object.values(retryAt).filter((value): value is number => value !== null && value > now);
    if (!future.length) return;
    const timer = window.setTimeout(() => setClock(Date.now()), Math.min(...future) - now + 1);
    return () => window.clearTimeout(timer);
  }, [retryAt, clock]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      generation.current += 1;
      for (const controller of requests.current.values()) controller.abort();
      requests.current.clear();
    };
  }, [isCurrent]);

  const run = useCallback(async <T,>(slot: Slot, load: (signal: AbortSignal) => Promise<T>,
    apply: (value: T) => void, onError?: (error: ApiError) => void) => {
    if (!mounted.current || !isCurrent() || (cooldowns.current[slot] ?? 0) > Date.now()) return;
    if (slot === "initial") {
      generation.current += 1;
      for (const controller of requests.current.values()) controller.abort();
      requests.current.clear();
      setPending({ initial: true, templates: false, categories: false });
    } else {
      if (requests.current.has(slot) || requests.current.has("initial")) return;
      setPending(current => ({ ...current, [slot]: true }));
    }
    const epoch = generation.current;
    const controller = new AbortController();
    requests.current.set(slot, controller);
    setFailure(current => ({ ...current, [slot]: null }));
    setRetryAt(current => ({ ...current, [slot]: null }));
    const current = () => mounted.current && generation.current === epoch
      && requests.current.get(slot) === controller && isCurrent();
    try {
      const value = await load(controller.signal);
      if (current() && !controller.signal.aborted) apply(value);
    } catch (error: unknown) {
      if (!current() || controller.signal.aborted) return;
      const problem = error && typeof error === "object" && "message" in error && typeof error.message === "string"
        ? error as ApiError : { message: "The catalogue page could not be loaded. Explicitly retry." };
      const seconds = Number(problem.retryAfter);
      const until = Number.isFinite(seconds) && seconds > 0
        ? Date.now() + Math.min(86400, seconds) * 1000 : null;
      cooldowns.current[slot] = until;
      setFailure(previous => ({ ...previous, [slot]: problem }));
      setRetryAt(previous => ({ ...previous, [slot]: until }));
      onError?.(problem);
    } finally {
      if (requests.current.get(slot) === controller) {
        requests.current.delete(slot);
        if (mounted.current && generation.current === epoch) {
          setPending(previous => ({ ...previous, [slot]: false }));
        }
      }
      controller.abort(); // Cancel siblings after a rejected Promise.all too.
    }
  }, [isCurrent]);

  const blocked: Slots<boolean> = {
    initial: pending.initial || (retryAt.initial ?? 0) > Date.now(),
    templates: pending.templates || (retryAt.templates ?? 0) > Date.now(),
    categories: pending.categories || (retryAt.categories ?? 0) > Date.now(),
  };
  return { run, pending, blocked, failure, retryAt };
}
