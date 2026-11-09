import { beforeEach, describe, expect, it, vi } from "vitest";
import { HttpResponse, http } from "msw";

import { authService } from "@/services/auth-service";
import { useAuthStore, type User } from "@/store/use-auth-store";
import { server } from "@/test/msw/server";
import { apiClient } from "@/lib/api-client";

const endpoint = "http://127.0.0.1:8000/api/v1";
const administrator: User = { id: "current-admin", email: "current@example.test", first_name: "Current",
  last_name: "Administrator", role: "super_admin" as User["role"], organization_id: "platform-test",
  is_platform_admin: true };

function gate() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => { release = resolve; });
  return { promise, release };
}

describe("session response ordering", () => {
  beforeEach(() => { useAuthStore.getState().logout(); });

  it("does not let an old failed restoration log out a newly installed session", async () => {
    const entered = gate(), resume = gate();
    server.use(http.post(`${endpoint}/auth/command-center/refresh`, async () => {
      entered.release();
      await resume.promise;
      return HttpResponse.json({ detail: "Old cookie expired" }, { status: 401 });
    }));
    const pending = authService.restore();
    await entered.promise;
    useAuthStore.getState().setAuth(administrator, "new-login-token");
    resume.release();
    await pending;
    expect(useAuthStore.getState().accessToken).toBe("new-login-token");
  });

  it("does not resurrect a session when an old successful restoration finishes after logout", async () => {
    const entered = gate(), resume = gate();
    server.use(http.post(`${endpoint}/auth/command-center/refresh`, async () => {
      entered.release();
      await resume.promise;
      return HttpResponse.json({ user: administrator, access_token: "obsolete-token", token_type: "bearer", expires_in: 900 });
    }));
    const pending = authService.restore();
    await entered.promise;
    useAuthStore.getState().logout();
    resume.release();
    await pending;
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(useAuthStore.getState().accessToken).toBeNull();
  });

  it("does not merge an obsolete profile into a different logged-in identity", async () => {
    const entered = gate(), resume = gate();
    useAuthStore.getState().setAuth(administrator, "first-token");
    server.use(http.get(`${endpoint}/auth/me`, async () => {
      entered.release();
      await resume.promise;
      return HttpResponse.json(administrator);
    }));
    const pending = authService.getMe();
    await entered.promise;
    useAuthStore.getState().setAuth({ ...administrator, id: "second-admin", email: "second@example.test" }, "second-token");
    resume.release();
    await pending.catch(() => undefined);
    expect(useAuthStore.getState().user?.id).toBe("second-admin");
    expect(useAuthStore.getState().user?.email).toBe("second@example.test");
  });

  it("orders login after an in-flight refresh cookie response", async () => {
    const entered = gate(), resume = gate();
    const order: string[] = [];
    server.use(
      http.post(`${endpoint}/auth/command-center/refresh`, async () => {
        entered.release();
        await resume.promise;
        order.push("refresh-response");
        return HttpResponse.json({ user: administrator, access_token: "old-refresh", token_type: "bearer", expires_in: 900 });
      }),
      http.post(`${endpoint}/auth/command-center/login`, () => {
        order.push("login-request");
        return HttpResponse.json({ user: administrator, access_token: "fresh-login", token_type: "bearer", expires_in: 900 });
      }),
    );
    const restoration = authService.restore();
    await entered.promise;
    const login = authService.login({ email: administrator.email, password: "fixture", mfa_code: "123456" });
    expect(order).toEqual([]);
    resume.release();
    await Promise.all([restoration, login]);
    expect(order).toEqual(["refresh-response", "login-request"]);
    expect(useAuthStore.getState().accessToken).toBe("fresh-login");
  });

  it("shares one refresh between restore and an automatic API recovery", async () => {
    const entered = gate(), requestSeen = gate(), resume = gate();
    let refreshes = 0, reads = 0;
    const refreshCalls = vi.spyOn(apiClient, "refreshSession");
    server.use(
      http.post(`${endpoint}/auth/command-center/refresh`, async () => {
        refreshes += 1;
        entered.release();
        await resume.promise;
        return HttpResponse.json({ user: administrator, access_token: "rotated", token_type: "bearer", expires_in: 900 });
      }),
      http.get(`${endpoint}/protected-session-race`, ({ request }) => {
        reads += 1;
        requestSeen.release();
        return request.headers.get("authorization") === "Bearer rotated"
          ? HttpResponse.json({ ok: true })
          : HttpResponse.json({ detail: "Expired" }, { status: 401 });
      }),
    );
    const restoration = authService.restore();
    await entered.promise;
    const read = apiClient.get("/protected-session-race");
    await requestSeen.promise;
    await vi.waitFor(() => expect(refreshCalls).toHaveBeenCalledTimes(2));
    resume.release();
    await Promise.all([restoration, read]);
    expect(refreshes).toBe(1);
    expect(reads).toBe(2);
  });

  it("does not refresh or replay an old identity's 401 under a new identity", async () => {
    const entered = gate(), resume = gate();
    let reads = 0, refreshes = 0;
    useAuthStore.getState().setAuth(administrator, "old-access");
    server.use(
      http.get(`${endpoint}/protected-session-race`, async () => {
        reads += 1;
        entered.release();
        await resume.promise;
        return HttpResponse.json({ detail: "Expired" }, { status: 401 });
      }),
      http.post(`${endpoint}/auth/command-center/refresh`, () => {
        refreshes += 1;
        return HttpResponse.json({}, { status: 401 });
      }),
    );
    const read = apiClient.get("/protected-session-race");
    const rejection = expect(read).rejects.toMatchObject({ code: "AUTH_SESSION_CHANGED" });
    await entered.promise;
    useAuthStore.getState().setAuth({ ...administrator, id: "new-admin" }, "new-access");
    resume.release();
    await rejection;
    expect(reads).toBe(1);
    expect(refreshes).toBe(0);
    expect(useAuthStore.getState().accessToken).toBe("new-access");
  });

  it("does not publish a successful old-session response to new-session callers", async () => {
    const entered = gate(), resume = gate();
    useAuthStore.getState().setAuth(administrator, "old-access");
    server.use(http.get(`${endpoint}/protected-session-race`, async () => {
      entered.release();
      await resume.promise;
      return HttpResponse.json({ private_result: "old identity result" });
    }));
    const read = apiClient.get("/protected-session-race");
    const rejection = expect(read).rejects.toMatchObject({ code: "AUTH_SESSION_CHANGED" });
    await entered.promise;
    useAuthStore.getState().setAuth({ ...administrator, id: "new-admin" }, "new-access");
    resume.release();
    await rejection;
  });

  it("clears local access immediately and orders a newer login after logout", async () => {
    const entered = gate(), resume = gate();
    const order: string[] = [];
    useAuthStore.getState().setAuth(administrator, "logout-access");
    server.use(
      http.post(`${endpoint}/auth/command-center/logout`, async ({ request }) => {
        expect(request.headers.get("authorization")).toBe("Bearer logout-access");
        entered.release();
        await resume.promise;
        order.push("logout-response");
        return HttpResponse.json({ ok: true });
      }),
      http.post(`${endpoint}/auth/command-center/login`, () => {
        order.push("login-request");
        return HttpResponse.json({ user: administrator, access_token: "newer-login", token_type: "bearer", expires_in: 900 });
      }),
    );
    const logout = authService.logout();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    await entered.promise;
    const login = authService.login({ email: administrator.email, password: "fixture", mfa_code: "123456" });
    resume.release();
    await Promise.all([logout, login]);
    expect(order).toEqual(["logout-response", "login-request"]);
    expect(useAuthStore.getState().accessToken).toBe("newer-login");
  });

  it("never upgrades an expired impersonation request to the administrator cookie identity", async () => {
    let refreshes = 0, reads = 0;
    useAuthStore.getState().setAuth(administrator, "original-platform-access");
    useAuthStore.getState().startImpersonation({ ...administrator, id: "scoped-member", is_platform_admin: false },
      "scoped-member-access", "Tenant", "Member");
    server.use(
      http.get(`${endpoint}/protected-session-race`, () => {
        reads += 1;
        return HttpResponse.json({ detail: "Expired" }, { status: 401 });
      }),
      http.post(`${endpoint}/auth/command-center/refresh`, () => {
        refreshes += 1;
        return HttpResponse.json({ user: administrator, access_token: "platform-access" });
      }),
    );
    await expect(apiClient.get("/protected-session-race")).rejects.toMatchObject({ code: "IMPERSONATION_REFRESH_DENIED" });
    await expect(authService.refresh()).rejects.toMatchObject({ code: "IMPERSONATION_REFRESH_DENIED" });
    expect(refreshes).toBe(0);
    expect(reads).toBe(1);
    expect(useAuthStore.getState().accessToken).toBe("scoped-member-access");
  });

  it("restores authentication without automatically replaying a rejected mutation", async () => {
    let writes = 0, refreshes = 0;
    useAuthStore.getState().setAuth(administrator, "expired-access");
    server.use(
      http.post(`${endpoint}/protected-session-write`, () => {
        writes += 1;
        return HttpResponse.json({ detail: "Expired" }, { status: 401 });
      }),
      http.post(`${endpoint}/auth/command-center/refresh`, () => {
        refreshes += 1;
        return HttpResponse.json({ user: administrator, access_token: "rotated-write-session", token_type: "bearer", expires_in: 900 });
      }),
    );
    await expect(apiClient.post("/protected-session-write", { reason: "fixture" })).rejects.toMatchObject({ status: 401 });
    expect(writes).toBe(1);
    expect(refreshes).toBe(1);
    expect(useAuthStore.getState().accessToken).toBe("rotated-write-session");
  });

  it("does not expire a newer login when automatic refresh fails late", async () => {
    const entered = gate(), resume = gate();
    useAuthStore.getState().setAuth(administrator, "old-access");
    const expired = vi.fn();
    window.addEventListener("auth:session-expired", expired);
    server.use(
      http.get(`${endpoint}/protected-session-race`, () => HttpResponse.json({ detail: "Expired" }, { status: 401 })),
      http.post(`${endpoint}/auth/command-center/refresh`, async () => {
        entered.release();
        await resume.promise;
        return HttpResponse.json({ detail: "Old session rejected" }, { status: 401 });
      }),
    );
    try {
      const read = apiClient.get("/protected-session-race");
      const rejection = expect(read).rejects.toMatchObject({ status: 401 });
      await entered.promise;
      useAuthStore.getState().setAuth(administrator, "fresh-access");
      resume.release();
      await rejection;
      expect(expired).not.toHaveBeenCalled();
      expect(useAuthStore.getState().accessToken).toBe("fresh-access");
    } finally {
      window.removeEventListener("auth:session-expired", expired);
    }
  });
});
