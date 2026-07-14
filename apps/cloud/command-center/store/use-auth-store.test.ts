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

  it("persists the administrator session but never the active impersonation token", () => {
    useAuthStore.getState().setAuth(administrator, "admin-access", "admin-refresh", true);
    useAuthStore.getState().startImpersonation(
      { ...administrator, id: "user_2", email: "member@example.com", is_platform_admin: false },
      "impersonation-access",
      "Tenant A",
      "Member User",
    );

    expect(persistedState()).toMatchObject({
      user: { id: "admin_1" },
      accessToken: "admin-access",
      refreshToken: "admin-refresh",
      originalUser: null,
      originalAccessToken: null,
      originalRefreshToken: null,
      impersonatedOrgName: null,
      impersonatedUserName: null,
    });
  });
});
