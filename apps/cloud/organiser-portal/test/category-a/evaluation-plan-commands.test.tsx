import "@testing-library/jest-dom/vitest";
import React, { type ReactNode } from "react";
import { randomUUID, webcrypto } from "node:crypto";
import { TextEncoder } from "node:util";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
  get: vi.fn(), post: vi.fn(), put: vi.fn(), revision: "1",
  state: { user: { id: "owner", organization_id: "tenant" }, activeContext: null,
    isAuthenticated: true, isContextSwitching: false },
}));
vi.mock("@/lib/api-client", () => ({
  apiClient: { get: fixture.get, post: fixture.post, put: fixture.put },
  apiGet: fixture.get, apiPost: fixture.post, apiPut: fixture.put, apiDelete: vi.fn(),
}));
vi.mock("@/store/use-auth-store", () => ({
  useAuthStore: Object.assign(() => fixture.state, { getState: () => fixture.state }),
  accessContextCacheKey: () => `tenant:workspace:direct:${fixture.revision}`,
}));
import { useAbstractEvaluationPlans, useApplyAbstractEvaluationPlan, useCreateAbstractEvaluationPlan,
  useUpdateAbstractEvaluationPlan, type AbstractEvaluationPlan } from "@/hooks/useAbstractWorkflow";

const clients: QueryClient[] = [];
function provider() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
  clients.push(client);
  return { client, wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> };
}
const payload = { name: "Saved plan", source_type: "ABSTRACT" as const, scope_filter: {},
  rubric: [{ key: "quality", label: "Quality", max: 10, weight: 100 }], reviewer_ids: [], anonymous_review: false };
const plan: AbstractEvaluationPlan = { ...payload, id: "owned-plan", version: 7, status: "DRAFT" };
beforeEach(() => {
  fixture.get.mockReset(); fixture.post.mockReset(); fixture.put.mockReset(); fixture.revision = "1";
  fixture.state.isAuthenticated = true; fixture.state.isContextSwitching = false;
  vi.stubGlobal("TextEncoder", TextEncoder);
  vi.stubGlobal("crypto", { subtle: webcrypto.subtle, randomUUID });
});
afterEach(() => { cleanup(); clients.splice(0).forEach(client => client.clear()); vi.unstubAllGlobals(); });

it("creates with a stable explicit retry key and updates with the loaded header/body version", async () => {
  fixture.post.mockRejectedValueOnce(Object.assign(new Error("Unavailable"), { status: 503 })).mockResolvedValueOnce(plan);
  fixture.put.mockResolvedValue({ ...plan, version: 8 });
  const { wrapper } = provider();
  const created = renderHook(() => useCreateAbstractEvaluationPlan("event"), { wrapper });
  await act(async () => { await expect(created.result.current.mutateAsync(payload)).rejects.toThrow("Unavailable"); });
  expect(fixture.post).toHaveBeenCalledTimes(1);
  const firstKey = fixture.post.mock.calls[0][2].headers["Idempotency-Key"];
  await act(async () => { await created.result.current.mutateAsync(payload); });
  expect(fixture.post.mock.calls[1][2].headers["Idempotency-Key"]).toBe(firstKey);
  const updated = renderHook(() => useUpdateAbstractEvaluationPlan("event"), { wrapper });
  await act(async () => { await updated.result.current.mutateAsync(plan); });
  expect(fixture.put.mock.calls[0][2].headers["If-Match"]).toBe("7");
  expect(fixture.put.mock.calls[0][1].expected_version).toBe(7);
  expect(fixture.put.mock.calls[0][1]).not.toHaveProperty("status");
});

it("preserves a continuation and its receipt after failed application without automatically retrying", async () => {
  const first = { plan_id: plan.id, version: 8, assignments_created: 100, submissions_considered: 100,
    submissions_unfilled: 0, has_next: true, next_cursor: "next-submission" };
  fixture.post.mockResolvedValueOnce(first).mockRejectedValueOnce(Object.assign(new Error("Limited"), { status: 429, retryAfter: 3 }))
    .mockResolvedValueOnce({ ...first, version: 9, has_next: false, next_cursor: null });
  const { wrapper } = provider();
  const { result } = renderHook(() => useApplyAbstractEvaluationPlan("event"), { wrapper });
  await act(async () => { await result.current.mutateAsync({ planId: plan.id, version: 7, assignmentsPerSubmission: 2 }); });
  await waitFor(() => expect(result.current.continuation?.cursor).toBe("next-submission"));
  await act(async () => { await expect(result.current.mutateAsync({ planId: plan.id, version: 8, assignmentsPerSubmission: 2 })).rejects.toThrow("Limited"); });
  expect(fixture.post).toHaveBeenCalledTimes(2);
  expect(result.current.continuation?.cursor).toBe("next-submission");
  expect(fixture.post.mock.calls[1][1].cursor).toBe("next-submission");
  const retryKey = fixture.post.mock.calls[1][2].headers["Idempotency-Key"];
  await act(async () => { await result.current.mutateAsync({ planId: plan.id, version: 8, assignmentsPerSubmission: 2 }); });
  expect(fixture.post.mock.calls[2][2].headers["Idempotency-Key"]).toBe(retryKey);
  expect(result.current.continuation?.hasNext).toBe(false);
});

it("cancels the old scoped read and never renders its late response in a new policy context", async () => {
  let release!: (value: AbstractEvaluationPlan[]) => void;
  let oldSignal!: AbortSignal;
  fixture.get.mockImplementationOnce((_path: string, config: { signal: AbortSignal }) => {
    oldSignal = config.signal;
    return new Promise(resolve => { release = resolve; });
  }).mockResolvedValueOnce([{ ...plan, id: "new-context-plan" }]);
  const { wrapper } = provider();
  const { result, rerender } = renderHook(() => useAbstractEvaluationPlans("event"), { wrapper });
  await waitFor(() => expect(fixture.get).toHaveBeenCalledTimes(1));
  fixture.revision = "2";
  rerender();
  await waitFor(() => expect(result.current.data?.[0].id).toBe("new-context-plan"));
  expect(oldSignal.aborted).toBe(true);
  await act(async () => { release([plan]); });
  expect(result.current.data?.[0].id).toBe("new-context-plan");
});
