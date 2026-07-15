import type { PropsWithChildren } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";

import { useAddSupportCommentAdmin, useSupportTicketsAdmin, useUpdateSupportTicketAdmin } from "@/services/support-admin-service";
import { server } from "@/test/msw/server";
import { useAuthStore } from "@/store/use-auth-store";

const API = "http://127.0.0.1:8000/api/v1";
const scope = {
  organizationId: "org-support",
  supportReason: "Investigating approved customer case SUP-2048",
  accessRequestId: "access-request",
};

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return function Wrapper({ children }: PropsWithChildren) { return <QueryClientProvider client={client}>{children}</QueryClientProvider>; };
}

describe("support administration contracts", () => {
  it("requires explicit tenant query scope and support reason", async () => {
    useAuthStore.setState({ hasHydrated: true, isAuthenticated: true, accessToken: "test-token" });
    let observed: { organizationId?: string; reason?: string } = {};
    server.use(http.get(`${API}/support/tickets/admin`, ({ request }) => {
      const url = new URL(request.url);
      observed = { organizationId: url.searchParams.get("organization_id") ?? undefined, reason: request.headers.get("x-support-reason") ?? undefined };
      return HttpResponse.json({ items: [], next_cursor: null, has_next: false });
    }));
    const { result } = renderHook(() => useSupportTicketsAdmin(scope), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(observed).toEqual({ organizationId: "org-support", reason: scope.supportReason });
  });

  it("sends optimistic versioned lifecycle changes and distinguishes internal notes", async () => {
    useAuthStore.setState({ hasHydrated: true, isAuthenticated: true, accessToken: "test-token" });
    const payloads: unknown[] = [];
    server.use(
      http.patch(`${API}/support/tickets/admin/ticket-1`, async ({ request }) => {
        payloads.push(await request.json());
        return HttpResponse.json({ id: "ticket-1", organization_id: "org-support", creator_id: "creator", subject: "Ticket", description: "Description", status: "IN_PROGRESS", priority: "HIGH", category: "GENERAL", version: 2, is_escalated: false, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
      }),
      http.post(`${API}/support/tickets/admin/ticket-1/comments`, async ({ request }) => {
        payloads.push(await request.json());
        return HttpResponse.json({ message: "Internal note added." }, { status: 201 });
      }),
    );
    const lifecycle = renderHook(() => useUpdateSupportTicketAdmin(scope), { wrapper: wrapper() });
    await act(async () => { await lifecycle.result.current.mutateAsync({ ticketId: "ticket-1", payload: { status: "IN_PROGRESS", priority: "HIGH", version: 1, reason: "Escalating verified production impact" } }); });
    const comment = renderHook(() => useAddSupportCommentAdmin(scope), { wrapper: wrapper() });
    await act(async () => { await comment.result.current.mutateAsync({ ticketId: "ticket-1", content: "Private evidence", isInternal: true }); });
    expect(payloads).toEqual([
      { status: "IN_PROGRESS", priority: "HIGH", version: 1, reason: "Escalating verified production impact" },
      { content: "Private evidence", is_internal: true },
    ]);
  });
});
