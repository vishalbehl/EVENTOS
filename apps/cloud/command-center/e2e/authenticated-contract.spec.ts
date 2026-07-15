import AxeBuilder from "@axe-core/playwright";

import { expect, test } from "./fixtures/authenticated";

test.describe("authenticated Command Center contract", () => {
  test("keeps the authenticated shell accessible", async ({ authenticatedPage: page }) => {
    await page.goto("/design-system");
    await expect(page.getByRole("main")).toBeVisible();
    await expect(page.getByRole("button", { name: "Open account menu" })).toContainText("Platform Admin");
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });

  test("keeps sensitive tenant operations fail-closed before support scope", async ({ authenticatedPage: page }) => {
    await page.goto("/identity-security/audit-logs");
    await expect(page.getByRole("heading", { name: "Audit Log Explorer" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Queue export" })).toBeDisabled();

    await page.goto("/business/crm");
    await expect(page.getByRole("heading", { name: "CRM Overview" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Create account/i })).toBeDisabled();

    await page.goto("/finance/payments");
    await expect(page.getByText("Select a support scope")).toBeVisible();
  });

  test("keeps audited communications controls inaccessible without a reason", async ({ authenticatedPage: page }) => {
    await page.goto("/support-center/announcements");
    await expect(page.getByRole("heading", { name: "Announcements and Maintenance" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Publish Announcement/i })).toBeDisabled();
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });

  test("does not present fabricated knowledge or SLA telemetry", async ({ authenticatedPage: page }) => {
    await page.goto("/support-center/knowledge-base");
    await expect(page.getByRole("heading", { name: "Knowledge Base" })).toBeVisible();
    await expect(page.getByText("Production disabled")).toBeVisible();
    await expect(page.getByText(/Static SLA charts, fabricated agent performance/i)).toBeVisible();
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });
});
