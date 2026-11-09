import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useCataloguePageRequests } from "@/hooks/useCataloguePageRequests";
import { appendCataloguePage, nextCatalogueCursor } from "@/lib/catalogue-pages";

afterEach(() => { cleanup(); vi.useRealTimers(); });
const current = () => true;
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

it("appends a page without duplicates, preserving loaded records even above the old 2000-row cap", () => {
  const loaded = Array.from({ length: 2100 }, (_, index) => ({ id: String(index), name: "loaded" }));
  const page = [{ id: "2099", name: "stale" }, { id: "2100", name: "first" }, { id: "2100", name: "duplicate" }];
  const merged = appendCataloguePage(loaded, page);
  expect(merged).toHaveLength(2101);
  expect(merged[2099]).toBe(loaded[2099]);
  expect(merged[2100].name).toBe("first");
  expect(appendCataloguePage(merged, page)).toBe(merged);
});

it.each([null, "", "same-cursor", "x".repeat(4097)])("rejects missing or nonadvancing continuation %s", cursor => {
  expect(() => nextCatalogueCursor({ has_next: true, next_cursor: cursor }, "same-cursor")).toThrow();
});

it("does not turn an invalid page contract into a fake final page", () => {
  expect(() => nextCatalogueCursor({} as any)).toThrow();
  expect(nextCatalogueCursor({ has_next: false })).toBeNull();
  expect(nextCatalogueCursor({ has_next: true, next_cursor: "next" })).toBe("next");
});

it("performs no eager reads and admits only one concurrent request for the same list", async () => {
  const pending = deferred<string>();
  const load = vi.fn(() => pending.promise), apply = vi.fn();
  const view = renderHook(() => useCataloguePageRequests(current));
  expect(load).not.toHaveBeenCalled();
  let first!: Promise<void>;
  act(() => {
    first = view.result.current.run("templates", load, apply);
    void view.result.current.run("templates", load, apply);
  });
  expect(load).toHaveBeenCalledTimes(1);
  expect(view.result.current.pending.templates).toBe(true);
  pending.resolve("one page");
  await act(async () => { await first; });
  expect(apply).toHaveBeenCalledExactlyOnceWith("one page");
  expect(view.result.current.pending.templates).toBe(false);
  expect(load).toHaveBeenCalledTimes(1);
});

it("retains throttling feedback and allows only an explicit retry after Retry-After", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-26T12:00:00Z"));
  const failure = { message: "Rate limited", status: 429, retryAfter: 2, correlationId: "fixture-reference" };
  const load = vi.fn().mockRejectedValueOnce(failure).mockResolvedValue("retried page"), apply = vi.fn();
  const view = renderHook(() => useCataloguePageRequests(current));
  await act(async () => { await view.result.current.run("categories", load, apply); });
  expect(view.result.current.failure.categories).toEqual(failure);
  expect(view.result.current.retryAt.categories).toBe(Date.now() + 2000);
  expect(view.result.current.blocked.categories).toBe(true);
  await act(async () => { await view.result.current.run("categories", load, apply); });
  expect(load).toHaveBeenCalledTimes(1);
  await act(async () => { vi.advanceTimersByTime(2001); });
  expect(load).toHaveBeenCalledTimes(1);
  expect(view.result.current.blocked.categories).toBe(false);
  await act(async () => { await view.result.current.run("categories", load, apply); });
  expect(load).toHaveBeenCalledTimes(2);
  expect(apply).toHaveBeenCalledExactlyOnceWith("retried page");
  expect(view.result.current.failure.categories).toBeNull();
});

it("a refresh aborts pending pages and prevents a late ignored-abort response from publishing", async () => {
  const pending = deferred<string>(), stale = vi.fn(), fresh = vi.fn();
  let signal!: AbortSignal;
  const view = renderHook(() => useCataloguePageRequests(current));
  let obsolete!: Promise<void>;
  act(() => { obsolete = view.result.current.run("templates", value => { signal = value; return pending.promise; }, stale); });
  await act(async () => { await view.result.current.run("initial", async () => "fresh first page", fresh); });
  expect(signal.aborted).toBe(true);
  pending.resolve("obsolete next page");
  await act(async () => { await obsolete; });
  expect(stale).not.toHaveBeenCalled();
  expect(fresh).toHaveBeenCalledExactlyOnceWith("fresh first page");
  expect(view.result.current.failure.templates).toBeNull();
});

it("unmount cancels a request and does not publish its later rejection", async () => {
  const pending = deferred<string>(), apply = vi.fn(), report = vi.fn();
  let signal!: AbortSignal, request!: Promise<void>;
  const view = renderHook(() => useCataloguePageRequests(current));
  act(() => { request = view.result.current.run("initial", value => { signal = value; return pending.promise; }, apply, report); });
  view.unmount();
  expect(signal.aborted).toBe(true);
  pending.reject(new Error("Old context unavailable"));
  await request;
  expect(apply).not.toHaveBeenCalled();
  expect(report).not.toHaveBeenCalled();
});

it("does not publish data after the existing scoped authority selector becomes invalid", async () => {
  let valid = true;
  const scoped = () => valid;
  const pending = deferred<string>(), apply = vi.fn();
  const view = renderHook(() => useCataloguePageRequests(scoped));
  let request!: Promise<void>;
  act(() => { request = view.result.current.run("categories", () => pending.promise, apply); });
  valid = false;
  pending.resolve("foreign stale page");
  await act(async () => { await request; });
  expect(apply).not.toHaveBeenCalled();
});
