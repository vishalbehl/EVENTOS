import { beforeEach, describe, expect, it } from "vitest";

import { User, useAuthStore } from "@/store/use-auth-store";

const administrator: User = {
  id: "admin_1",
  email: "admin@example.com",
  first_name: "Ada",
  last_name: "Admin",
  role: "super_admin" as User["role"],
  organization_id: "org_1",
  is_platform_admin: true,
};

function persistedState() {
  const value = localStorage.getItem("obsidian-auth-storage");
  expect(value).not.toBeNull();
  return JSON.parse(value as string).state as Record<string, unknown>;
}

describe("privileged auth persistence", () => {
  beforeEach(() => {
    useAuthStore.getState().logout();
    localStorage.clear();
  });

  it("does not persist credentials when remember me is disabled", () => {
    useAuthStore.getState().setAuth(administrator, "access", "refresh", false);

    expect(persistedState()).toMatchObject({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
    });
    expect(useAuthStore.getState().accessToken).toBe("access");
  });

  it("persists only non-secret administrator metadata and never impersonation tokens", () => {
    useAuthStore.getState().setAuth(administrator, "admin-access", "admin-refresh", true);
    useAuthStore.getState().startImpersonation(
      { ...administrator, id: "user_2", email: "member@example.com", is_platform_admin: false },
      "impersonation-access",
      "Tenant A",
      "Member User",
    );

    expect(persistedState()).toMatchObject({
      user: null,
      accessToken: null,
      refreshToken: null,
      originalUser: null,
      originalAccessToken: null,
      originalRefreshToken: null,
      impersonatedOrgName: null,
      impersonatedUserName: null,
    });
  });

  it("keeps session ordering memory-only and ignores credentials in legacy persisted state", async () => {
    useAuthStore.getState().setAuth(administrator, "current-access", undefined, true);
    const revision = useAuthStore.getState().sessionRevision;
    expect(persistedState().sessionRevision).toBeUndefined();
    localStorage.setItem("obsidian-auth-storage", JSON.stringify({ state: {
      user: { ...administrator, id: "legacy-user" }, accessToken: "legacy-access", refreshToken: "legacy-refresh",
      isAuthenticated: true, originalAccessToken: "legacy-impersonation", sessionRevision: -100, rememberMe: true,
    }, version: 0 }));
    await useAuthStore.persist.rehydrate();
    expect(useAuthStore.getState().user?.id).toBe(administrator.id);
    expect(useAuthStore.getState().accessToken).toBe("current-access");
    expect(useAuthStore.getState().sessionRevision).toBe(revision);
    expect(useAuthStore.getState().originalAccessToken).toBeNull();
  });

  it("advances ordering on every identity transition but not activity updates", () => {
    const initial = useAuthStore.getState().sessionRevision;
    useAuthStore.getState().setAuth(administrator, "current-access");
    useAuthStore.getState().updateActivity();
    expect(useAuthStore.getState().sessionRevision).toBe(initial + 1);
    useAuthStore.getState().startImpersonation({ ...administrator, id: "member" }, "scoped-access", "Tenant", "Member");
    useAuthStore.getState().stopImpersonation();
    useAuthStore.getState().logout();
    expect(useAuthStore.getState().sessionRevision).toBe(initial + 4);
  });

  it("does not retain another identity's impersonation return tokens after new authentication", () => {
    useAuthStore.getState().setAuth(administrator, "old-admin-access");
    useAuthStore.getState().startImpersonation({ ...administrator, id: "member" }, "scoped-access", "Tenant", "Member");
    useAuthStore.getState().setAuth({ ...administrator, id: "new-admin" }, "new-admin-access");
    expect(useAuthStore.getState().originalAccessToken).toBeNull();
    expect(useAuthStore.getState().originalUser).toBeNull();
    expect(useAuthStore.getState().impersonatedOrgName).toBeNull();
  });
});
