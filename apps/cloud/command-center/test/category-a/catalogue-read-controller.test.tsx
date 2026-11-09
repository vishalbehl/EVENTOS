import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useCatalogueReadController } from "@/hooks/useCatalogueReadController";
import { appendCataloguePage, nextCatalogueCursor } from "@/lib/catalogue-pages";
import { ApiError } from "@/lib/api-client";

afterEach(() => vi.useRealTimers());

it("merges large pages in stable identity order and rejects unsafe continuations", () => {
  const current = Array.from({ length: 2_100 }, (_, index) => ({ id: `row-${index}` }));
  const merged = appendCataloguePage(current, [{ id: "row-2099" }, { id: "row-2100" }, { id: "row-2100" }]);
  expect(merged).toHaveLength(2_101);
  expect(merged[2_099]).toBe(current[2_099]);
  expect(() => nextCatalogueCursor({ has_next: true, next_cursor: "same" }, "same")).toThrow();
  expect(() => nextCatalogueCursor({ has_next: true })).toThrow();
  expect(nextCatalogueCursor({ has_next: false, next_cursor: "ignored" })).toBeNull();
});

it("suppresses duplicate reads and prevents an invalidated late page from publishing", async () => {
  const valid = vi.fn(() => true);
  const view = renderHook(() => useCatalogueReadController(valid));
  let finish!: (value: string) => void;
  const load = vi.fn((_signal: AbortSignal) => new Promise<string>(resolve => { finish = resolve; }));
  const apply = vi.fn();
  let first!: Promise<void>;
  await act(async () => {
    first = view.result.current.run("templates", load, apply);
    void view.result.current.run("templates", load, apply);
  });
  expect(load).toHaveBeenCalledTimes(1);
  expect(view.result.current.pending.has("templates")).toBe(true);
  act(() => view.result.current.invalidate());
  await act(async () => { finish("obsolete"); await first; });
  expect(apply).not.toHaveBeenCalled();
  expect(view.result.current.pending.has("templates")).toBe(false);

  await act(async () => {
    await view.result.current.run("templates", async () => "current", apply);
  });
  expect(apply).toHaveBeenCalledWith("current");
});

it("a refresh aborts every older slot before publishing its own result", async () => {
  const view = renderHook(() => useCatalogueReadController(() => true));
  let oldSignal!: AbortSignal;
  const oldApply = vi.fn();
  await act(async () => {
    void view.result.current.run("blockedCategory", async signal => {
      oldSignal = signal;
      return await new Promise<string>(() => undefined);
    }, oldApply);
  });
  await act(async () => {
    await view.result.current.run("initial", async () => "fresh", vi.fn(), undefined, { refresh: true });
  });
  expect(oldSignal.aborted).toBe(true);
  expect(oldApply).not.toHaveBeenCalled();
});

it("enforces Retry-After without replaying and exposes safe correlation details", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-26T12:00:00Z"));
  const view = renderHook(() => useCatalogueReadController(() => true));
  const load = vi.fn().mockRejectedValue(new ApiError({ message: "Please wait.", status: 429,
    retryAfter: 2, correlationId: "catalogue-reference" }));
  await act(async () => { await view.result.current.run("categories", load, vi.fn()); });
  expect(load).toHaveBeenCalledTimes(1);
  expect(view.result.current.blocked.has("categories")).toBe(true);
  expect(view.result.current.failure.categories).toMatchObject({
    message: "Please wait.", status: 429, correlationId: "catalogue-reference",
  });
  await act(async () => { await view.result.current.run("categories", load, vi.fn()); });
  expect(load).toHaveBeenCalledTimes(1);
  const refresh = vi.fn().mockResolvedValue("refresh");
  await act(async () => {
    await view.result.current.run("initial", refresh, vi.fn(), undefined, { refresh: true });
  });
  expect(refresh).not.toHaveBeenCalled();
  expect(view.result.current.coolingDown).toBe(true);
  await act(async () => { await vi.advanceTimersByTimeAsync(1_020); });
  await act(async () => { await vi.advanceTimersByTimeAsync(1_020); });
  expect(view.result.current.blocked.has("categories")).toBe(false);
  expect(view.result.current.coolingDown).toBe(false);
});
