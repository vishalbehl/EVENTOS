import type { PropsWithChildren } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { beforeEach, describe, expect, it } from "vitest";

import {
  useCreatePlatformRole,
  usePlatformRoles,
  useToggleRolePermission,
} from "@/services/platform-access-service";
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

describe("platform access tenant boundary", () => {
  beforeEach(() => localStorage.clear());

  it("loads roles only with explicit organization scope and support purpose", async () => {
    let receivedScope: string | null = null;
    let receivedReason: string | null = null;
    server.use(
      http.get(`${API}/superadmin/access/roles`, ({ request }) => {
        const url = new URL(request.url);
        receivedScope = url.searchParams.get("organization_id");
        receivedReason = request.headers.get("x-support-reason");
        return HttpResponse.json([]);
      }),
    );

    const { result } = renderHook(() => usePlatformRoles("org-123", { limit: 100 }), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(receivedScope).toBe("org-123");
    expect(receivedReason).toMatch(/tenant role and permission/i);
  });

  it("keeps role and permission mutations in the selected tenant", async () => {
    const requests: Array<{ path: string; scope: string | null; body: unknown }> = [];
    server.use(
      http.post(`${API}/superadmin/access/roles`, async ({ request }) => {
        requests.push({
          path: new URL(request.url).pathname,
          scope: new URL(request.url).searchParams.get("organization_id"),
          body: await request.json(),
        });
        return HttpResponse.json({
          id: "role-1",
          organization_id: "org-123",
          name: "Operations",
          code: "OPERATIONS",
          access_level: "GLOBAL",
          permissions_count: 0,
          users_count: 0,
          created_at: "2026-07-15T00:00:00Z",
          updated_at: "2026-07-15T00:00:00Z",
        }, { status: 201 });
      }),
      http.post(`${API}/superadmin/access/roles/role-1/permissions/permission-1/toggle`, async ({ request }) => {
        requests.push({
          path: new URL(request.url).pathname,
          scope: new URL(request.url).searchParams.get("organization_id"),
          body: await request.json(),
        });
        return HttpResponse.json({ message: "Permission added to role" });
      }),
    );

    const wrapper = createWrapper();
    const create = renderHook(() => useCreatePlatformRole(), { wrapper });
    await act(async () => {
      await create.result.current.mutateAsync({
        organizationId: "org-123",
        payload: {
          name: "Operations",
          code: "OPERATIONS",
          access_level: "GLOBAL",
          reason: "Approved operations access configuration",
        },
      });
    });

    const toggle = renderHook(() => useToggleRolePermission(), { wrapper });
    await act(async () => {
      await toggle.result.current.mutateAsync({
        organizationId: "org-123",
        roleId: "role-1",
        permissionId: "permission-1",
        reason: "Approved permission assignment change",
      });
    });

    expect(requests).toHaveLength(2);
    expect(requests.every((request) => request.scope === "org-123")).toBe(true);
    expect(requests[0].body).toMatchObject({ reason: "Approved operations access configuration" });
    expect(requests[1].body).toEqual({ reason: "Approved permission assignment change" });
  });
});
