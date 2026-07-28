import AxeBuilder from "@axe-core/playwright";

import { E2E_ORGANIZATION_ID, expect, test } from "./fixtures/authenticated";

const EVENT_ID = "00000000-0000-4000-8000-000000000010";

test.beforeEach(async ({ authenticatedPage: page }) => {
  await page.route(`**/platform/organizations/${E2E_ORGANIZATION_ID}/console/**`, async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.endsWith("/summary")) return route.fulfill({ json: { generated_at: "2026-07-22T08:00:00Z", organization: { id: E2E_ORGANIZATION_ID, name: "Acceptance Org", slug: "acceptance-org", is_active: true, created_at: "2026-01-01T00:00:00Z", country: "IN", timezone: "Asia/Kolkata", currency: "INR", is_sandbox: true }, metrics: [], health_score: 96, health_status: "HEALTHY", health_factors: [], attention: [], availability: {}, executive_summary: "Healthy" } });
    if (path.endsWith("/advanced/jobs")) return route.fulfill({ json: [] });
    if (path.endsWith("/members")) return route.fulfill({ json: { domain: "members", generated_at: "2026-07-22T08:00:00Z", availability: { available: true }, data: { items: [{ id: "member-1", user_id: "00000000-0000-4000-8000-000000000011", email: "owner@example.test", org_role: "owner", is_active: true }] } } });
    if (path.endsWith("/rollout") && request.method() === "GET") return route.fulfill({ json: { shadow_enabled: false, enforcement_enabled: false, comparisons: { sample_size: 1, matched: 1, diverged: 0, latest_at: "2026-07-22T08:00:00Z" }, items: [{ id: "comparison-1", event_id: EVENT_ID, status: "MATCHED", differences: {}, resolution_version: "abc", compared_at: "2026-07-22T08:00:00Z" }] } });
    if (path.endsWith("/rollout") && request.method() === "PATCH") {
      expect(request.postDataJSON()).toMatchObject({ shadow_enabled: true, enforcement_enabled: false });
      expect(String(request.postDataJSON().reason).length).toBeGreaterThanOrEqual(12);
      return route.fulfill({ json: { shadow_enabled: true, enforcement_enabled: false } });
    }
    return route.fulfill({ status: 404, json: { detail: "Unhandled acceptance route" } });
  });
});

test("rollout gate is keyboard operable, governed, responsive, and accessible", async ({ authenticatedPage: page }) => {
  await page.goto(`/organizations/${E2E_ORGANIZATION_ID}/internal-admin`);
  await expect(page.getByRole("heading", { name: "Internal Admin Workspace" })).toBeVisible();
  await page.getByRole("button", { name: "Start shadow mode" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByLabel("Decision reason").fill("Begin the approved acceptance shadow rollout");
  await page.getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();

  const accessibility = await new AxeBuilder({ page }).exclude("[data-sonner-toast]").analyze();
  expect(accessibility.violations.filter(item => item.impact === "critical" || item.impact === "serious")).toEqual([]);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByText("Production rollout gate")).toBeVisible();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.getByRole("button", { name: "Enable enforcement" })).toBeVisible();
});

test("API failure is rendered as unavailable rather than zero data", async ({ authenticatedPage: page }) => {
  await page.route(`**/platform/organizations/${E2E_ORGANIZATION_ID}/console/audit**`, route => route.fulfill({ status: 503, json: { detail: "Audit store unavailable" } }));
  await page.goto(`/organizations/${E2E_ORGANIZATION_ID}/audit`);
  await expect(page.getByText("Data not available", { exact: true })).toBeVisible();
  await expect(page.getByText("Audit store unavailable", { exact: true })).toBeVisible();
  await expect(page.getByText("No audit records")).toHaveCount(0);
});
