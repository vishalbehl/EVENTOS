import { beforeEach, describe, expect, it } from "vitest";
import { HttpResponse, http } from "msw";

import { authService } from "@/services/auth-service";
import { useAuthStore } from "@/store/use-auth-store";
import { server } from "@/test/msw/server";

const baseUser = {
  id: "user_1",
  email: "admin@example.com",
  first_name: "Ada",
  last_name: "Admin",
  role: "super_admin",
  organization_id: "org_1",
  is_platform_admin: true,
};

describe("authService privileged login", () => {
  beforeEach(() => {
    useAuthStore.getState().logout();
    localStorage.clear();
  });

  it("submits the MFA code and stores a verified administrator session", async () => {
    let submittedBody: unknown;
    server.use(
      http.post("http://127.0.0.1:8000/api/v1/auth/login", async ({ request }) => {
        submittedBody = await request.json();
        return HttpResponse.json({
          access_token: "admin-access",
          refresh_token: "admin-refresh",
          token_type: "bearer",
          user: baseUser,
        });
      }),
    );

    await authService.login(
      { email: "admin@example.com", password: "secret", mfa_code: "123456" },
      true,
    );

    expect(submittedBody).toEqual({
      email: "admin@example.com",
      password: "secret",
      mfa_code: "123456",
    });
    expect(useAuthStore.getState()).toMatchObject({
      isAuthenticated: true,
      accessToken: "admin-access",
      refreshToken: "admin-refresh",
      rememberMe: true,
    });
  });

  it("revokes and refuses a valid non-administrator identity", async () => {
    let logoutAuthorization: string | null = null;
    server.use(
      http.post("http://127.0.0.1:8000/api/v1/auth/login", () =>
        HttpResponse.json({
          access_token: "organizer-access",
          refresh_token: "organizer-refresh",
          token_type: "bearer",
          user: { ...baseUser, role: "organizer", is_platform_admin: false },
        }),
      ),
      http.post("http://127.0.0.1:8000/api/v1/auth/logout", ({ request }) => {
        logoutAuthorization = request.headers.get("authorization");
        return HttpResponse.json({ message: "Logged out successfully." });
      }),
    );

    await expect(
      authService.login(
        { email: "organizer@example.com", password: "secret", mfa_code: "123456" },
        true,
      ),
    ).rejects.toThrow("Administrator privileges are required");

    expect(logoutAuthorization).toBe("Bearer organizer-access");
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(useAuthStore.getState().accessToken).toBeNull();
  });
});
