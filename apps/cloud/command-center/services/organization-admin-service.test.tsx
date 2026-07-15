import type { PropsWithChildren } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";

import {
  useOrganizationMembers,
  useProvisionOrganization,
  useSetOrganizationMemberEvent,
} from "@/services/super-admin-service";
import { server } from "@/test/msw/server";

const API = "http://127.0.0.1:8000/api/v1";

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe("organization administration contracts", () => {
  it("sends the caller-owned idempotency key when provisioning", async () => {
    let receivedKey: string | null = null;
    server.use(http.post(`${API}/platform/organisations`, ({ request }) => {
      receivedKey = request.headers.get("idempotency-key");
      return HttpResponse.json({
        organization: { id: "org-new", name: "New Tenant", slug: "new-tenant" },
        owner_invitation: { membership_id: "member-new", email: "owner@example.com", token: "invite-token" },
        replayed: false,
      }, { status: 201 });
    }));

    const { result } = renderHook(() => useProvisionOrganization(), { wrapper: createWrapper() });
    await act(async () => {
      await result.current.mutateAsync({
        idempotencyKey: "provision-request-123",
        payload: {
          name: "New Tenant",
          slug: "new-tenant",
          owner_email: "owner@example.com",
          owner_first_name: "Tenant",
          owner_last_name: "Owner",
          country: "IN",
          timezone: "Asia/Kolkata",
          reason: "Approved customer tenant provisioning",
        },
      });
    });
    expect(receivedKey).toBe("provision-request-123");
  });

  it("loads and mutates event assignments through the selected organization", async () => {
    const paths: string[] = [];
    server.use(
      http.get(`${API}/platform/organisations/org-123/members`, () => HttpResponse.json([])),
      http.put(`${API}/platform/organisations/org-123/members/member-1/events/event-1`, ({ request }) => {
        paths.push(new URL(request.url).pathname);
        return HttpResponse.json({ assignment_id: "assignment-1", event_id: "event-1", permissions: {} });
      }),
    );
    const wrapper = createWrapper();
    const members = renderHook(() => useOrganizationMembers("org-123"), { wrapper });
    await waitFor(() => expect(members.result.current.isSuccess).toBe(true));

    const assignment = renderHook(() => useSetOrganizationMemberEvent("org-123"), { wrapper });
    await act(async () => {
      await assignment.result.current.mutateAsync({
        memberId: "member-1",
        eventId: "event-1",
        assigned: true,
        reason: "Approved event workspace assignment",
      });
    });
    expect(paths).toEqual(["/api/v1/platform/organisations/org-123/members/member-1/events/event-1"]);
  });
});
