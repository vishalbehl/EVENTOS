import { test as base, expect, type Page } from "@playwright/test";

const E2E_ORGANIZATION_ID = "00000000-0000-4000-8000-000000000002";

async function installAuthenticatedState(page: Page) {
  const user = {
    id: "00000000-0000-4000-8000-000000000001",
    email: "admin@example.test",
    first_name: "Platform",
    last_name: "Admin",
    role: "super_admin",
    organization_id: E2E_ORGANIZATION_ID,
    is_platform_admin: true,
    platform_role: "SUPER_ADMIN",
  };
  await page.route("**/auth/command-center/refresh", route => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      access_token: "e2e-access-token",
      token_type: "bearer",
      user,
      expires_in: 3600,
    }),
  }));
  await page.route("**/auth/me", route => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(user),
  }));
  await page.route("**/platform/dashboard", route => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({}),
  }));
  await page.addInitScript(({ organizationId }) => {
    localStorage.setItem("obsidian-auth-storage", JSON.stringify({
      state: {
        user: {
          id: "00000000-0000-4000-8000-000000000001",
          email: "admin@example.test",
          first_name: "Platform",
          last_name: "Admin",
          role: "super_admin",
          organization_id: organizationId,
          is_platform_admin: true,
          platform_role: "SUPER_ADMIN",
        },
        accessToken: "e2e-access-token",
        refreshToken: "e2e-refresh-token",
        isAuthenticated: true,
        rememberMe: true,
        loginTime: Date.now(),
        lastActivity: Date.now(),
      },
      version: 0,
    }));
  }, { organizationId: E2E_ORGANIZATION_ID });
}

export const test = base.extend<{ authenticatedPage: Page }>({
  authenticatedPage: async ({ page }, use) => {
    await installAuthenticatedState(page);
    await page.goto('/');
    await page.waitForURL('**/dashboard/overview', { timeout: 20_000 });
    await use(page);
  },
});

export { expect, E2E_ORGANIZATION_ID };
