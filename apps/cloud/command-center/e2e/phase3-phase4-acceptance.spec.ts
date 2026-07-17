import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";

import { E2E_ORGANIZATION_ID, expect, test } from "./fixtures/authenticated";

const ROLE_ID = "20000000-0000-4000-8000-000000000001";
const INVOICE_ID = "20000000-0000-4000-8000-000000000002";

const organization = {
  id: E2E_ORGANIZATION_ID,
  name: "Enterprise E2E",
  slug: "enterprise-e2e",
  status: "ACTIVE",
};

async function installOrganizationRoute(page: Page) {
  await page.route("**/platform/organizations**", route => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify([organization]),
  }));
}

async function applySupportScope(page: Page) {
  await page.getByRole("combobox", { name: "Support organization" }).click();
  await page.getByRole("option", { name: /Enterprise E2E/ }).click();
  await page.getByLabel("Access reason").fill("Executing governed acceptance case CC-3412");
  await page.getByRole("button", { name: "Apply scope" }).click();
  await expect(page.getByText("Tenant scope is active.", { exact: false })).toBeVisible();
}

async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
}

test("creates an audited tenant role through the real role contract", async ({ authenticatedPage: page }) => {
  await installOrganizationRoute(page);
  let roles: Record<string, unknown>[] = [];
  await page.route("**/superadmin/access/roles**", async route => {
    const request = route.request();
    if (request.method() === "POST") {
      expect(request.headers()["x-support-reason"]).toBeTruthy();
      const payload = request.postDataJSON();
      expect(payload.reason).toBe("Approved access role for conference operations");
      roles = [{
        id: ROLE_ID,
        organization_id: E2E_ORGANIZATION_ID,
        department_id: null,
        department_name: "Global",
        name: payload.name,
        code: payload.code,
        description: payload.description,
        access_level: payload.access_level,
        permissions_count: 0,
        users_count: 0,
        created_at: "2026-07-16T10:00:00Z",
        updated_at: "2026-07-16T10:00:00Z",
      }];
      await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify(roles[0]) });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(roles) });
  });

  await page.goto("/identity-security/roles");
  await page.locator("#role-organization").selectOption(E2E_ORGANIZATION_ID);
  await page.getByLabel("Name").fill("Conference Operations Lead");
  await page.getByLabel("Code").fill("CONFERENCE_OPERATIONS_LEAD");
  await page.getByLabel("Description").fill("Coordinates approved organizer-side operational access.");
  await page.getByLabel("Audit reason").fill("Approved access role for conference operations");
  await page.getByRole("button", { name: "Create Role" }).click();
  await expect(page.getByText("Conference Operations Lead")).toBeVisible();
  await expectAccessible(page);
});

test("publishes an audited announcement without a fake success path", async ({ authenticatedPage: page }) => {
  let announcements: Record<string, unknown>[] = [];
  await page.route("**/platform/communications/announcements**", async route => {
    if (route.request().method() === "POST") {
      const payload = route.request().postDataJSON();
      expect(payload.reason).toBe("Approved maintenance communication CC-3413");
      announcements = [{ id: crypto.randomUUID(), ...payload, created_at: "2026-07-16T10:00:00Z" }];
      await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify(announcements[0]) });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(announcements) });
  });
  await page.route("**/platform/communications/maintenance-windows**", route => route.fulfill({
    status: 200, contentType: "application/json", body: "[]",
  }));

  await page.goto("/support-center/announcements");
  await page.getByLabel("Change reason").fill("Approved maintenance communication CC-3413");
  await page.locator("#announcement-title").fill("Registration maintenance notice");
  await page.getByLabel("Content").fill("Registration administration will be read-only for ten minutes.");
  await page.getByRole("button", { name: "Publish Announcement" }).click();
  await expect(page.getByText("Registration maintenance notice")).toBeVisible();
  await expectAccessible(page);
});

test("loads tenant-scoped support and access-review registers", async ({ authenticatedPage: page }) => {
  await installOrganizationRoute(page);
  const emptyPage = JSON.stringify({ items: [], next_cursor: null, has_next: false });
  await page.route("**/support/tickets/admin**", route => route.fulfill({ status: 200, contentType: "application/json", body: emptyPage }));
  await page.goto("/support-center/tickets");
  await applySupportScope(page);
  await expect(page.getByText("No support tickets")).toBeVisible();
  await expectAccessible(page);

  await page.route("**/superadmin/security-governance/access-reviews**", route => route.fulfill({ status: 200, contentType: "application/json", body: emptyPage }));
  await page.route("**/platform/global-users**", route => route.fulfill({ status: 200, contentType: "application/json", body: emptyPage }));
  await page.goto("/identity-security/access-reviews");
  await applySupportScope(page);
  await expect(page.getByText("No access reviews")).toBeVisible();
  await expectAccessible(page);
});

test("reads activation-driven entitlements only inside an audited tenant scope", async ({ authenticatedPage: page }) => {
  await installOrganizationRoute(page);
  const cursorPage = (items: unknown[]) => JSON.stringify({ items, next_cursor: null, has_next: false });
  const grant = {
    id: "20000000-0000-4000-8000-000000000003",
    organization_id: E2E_ORGANIZATION_ID,
    subscription_id: "20000000-0000-4000-8000-000000000004",
    grant_type: "EVENT_PACK",
    scope_type: "EVENT",
    consumption_model: "QUANTITY",
    unit_type: "EVENT",
    status: "ACTIVE",
    source_type: "PLAN",
    source_ref: "enterprise-pack",
    quantity_total: 5,
    quantity_consumed: 1,
    quantity_reserved: 0,
    version: 1,
    valid_from: "2026-01-01T00:00:00Z",
    valid_until: "2027-01-01T00:00:00Z",
  };
  await page.route("**/superadmin/billing-admin/entitlements**", route => route.fulfill({ status: 200, contentType: "application/json", body: cursorPage([grant]) }));
  await page.route("**/superadmin/billing-admin/subscriptions**", route => route.fulfill({ status: 200, contentType: "application/json", body: cursorPage([]) }));
  await page.route("**/superadmin/billing-admin/activations**", route => route.fulfill({ status: 200, contentType: "application/json", body: cursorPage([]) }));

  await page.goto("/business/subscription/entitlements");
  await applySupportScope(page);
  await expect(page.getByText("EVENT_PACK")).toBeVisible();
  await expect(page.getByText("1/5")).toBeVisible();
  await expectAccessible(page);
});

test("queues a version-bound invoice artifact through the finance contract", async ({ authenticatedPage: page }) => {
  await installOrganizationRoute(page);
  const invoice = {
    id: INVOICE_ID,
    organization_id: E2E_ORGANIZATION_ID,
    subscription_id: null,
    invoice_number: "INV-E2E-3414",
    amount: 100000,
    gst_amount: 18000,
    total_amount_inr: 118000,
    currency: "INR",
    status: "UNPAID",
    version: 2,
    issued_at: "2026-07-16T10:00:00Z",
    due_date: "2026-07-31T10:00:00Z",
  };
  await page.route("**/superadmin/billing-admin/invoices**", async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname.endsWith(`/invoices/${INVOICE_ID}/artifacts`) && request.method() === "POST") {
      expect(request.headers()["idempotency-key"]).toBeTruthy();
      expect(request.postDataJSON()).toMatchObject({ version: 2, reason: "Approved invoice evidence package CC-3414" });
      await route.fulfill({
        status: 202,
        contentType: "application/json",
        body: JSON.stringify({ export_id: crypto.randomUUID(), invoice_id: INVOICE_ID, status: "QUEUED", file_format: "pdf", source_version: 2, created_at: "2026-07-16T10:00:00Z" }),
      });
      return;
    }
    if (url.pathname.includes(`/invoices/${INVOICE_ID}/artifacts/`) && request.method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ export_id: url.pathname.split("/").at(-1), invoice_id: INVOICE_ID, status: "QUEUED", file_format: "pdf", source_version: 2, created_at: "2026-07-16T10:00:00Z" }),
      });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: [invoice], next_cursor: null, has_next: false }) });
  });

  await page.goto("/finance/invoices");
  await applySupportScope(page);
  await page.getByRole("button", { name: "PDF" }).click();
  await page.getByLabel("Generation reason").fill("Approved invoice evidence package CC-3414");
  await page.getByRole("button", { name: "Generate PDF" }).click();
  await expect(page.getByText("Artifact queued")).toBeVisible();
  await expectAccessible(page);
});
