import AxeBuilder from "@axe-core/playwright";

import { E2E_ORGANIZATION_ID, expect, test } from "./fixtures/authenticated";

const QUOTE_ID = "10000000-0000-4000-8000-000000000001";
const WORKFLOW_ID = "10000000-0000-4000-8000-000000000002";
const STEP_ID = "10000000-0000-4000-8000-000000000003";
const PROPOSAL_ID = "10000000-0000-4000-8000-000000000004";

test("approves a version-bound quote and converts it to a persisted proposal", async ({ authenticatedPage: page }) => {
  let approved = false;
  let conversionRequest: Record<string, unknown> | undefined;

  const quote = () => ({
    id: QUOTE_ID,
    organization_id: E2E_ORGANIZATION_ID,
    event_id: "10000000-0000-4000-8000-000000000005",
    quote_number: "QT-E2E-001",
    title: "Enterprise Conference Delivery",
    status: approved ? "APPROVED" : "PENDING_APPROVAL",
    currency: "INR",
    subtotal: "100000.00",
    discount_amount: "0.00",
    taxable_amount: "100000.00",
    tax_amount: "18000.00",
    total_amount: "118000.00",
    version: 3,
    line_items: [],
  });
  const workflow = () => ({
    id: WORKFLOW_ID,
    quote_id: QUOTE_ID,
    organization_id: E2E_ORGANIZATION_ID,
    quote_version: 3,
    status: approved ? "APPROVED" : "PENDING",
    workflow_version: approved ? 2 : 1,
    submitted_at: "2026-07-16T08:00:00Z",
    steps: [{
      id: STEP_ID,
      step_order: 1,
      name: "Commercial approval",
      required_permission: "quotes.approve",
      status: approved ? "APPROVED" : "PENDING",
      decision_reason: approved ? "Pricing and delivery scope verified" : null,
      decided_at: approved ? "2026-07-16T08:05:00Z" : null,
    }],
  });

  await page.route(`**/service-requests/quotes/${QUOTE_ID}**`, async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname.endsWith(`/approval/steps/${STEP_ID}/action`) && request.method() === "POST") {
      const body = request.postDataJSON();
      expect(body).toMatchObject({ action: "APPROVE", expected_workflow_version: 1 });
      expect(request.headers()["idempotency-key"]).toBeTruthy();
      approved = true;
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(workflow()) });
      return;
    }
    if (url.pathname.endsWith("/proposal") && request.method() === "POST") {
      conversionRequest = request.postDataJSON();
      expect(request.headers()["idempotency-key"]).toBeTruthy();
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          id: PROPOSAL_ID,
          organization_id: E2E_ORGANIZATION_ID,
          quote_id: QUOTE_ID,
          proposal_number: "PR-E2E-001",
          status: "DRAFT",
          current_version: 1,
          versions: [],
        }),
      });
      return;
    }
    if (url.pathname.endsWith("/approval") && request.method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(workflow()) });
      return;
    }
    if (url.pathname.endsWith(QUOTE_ID) && request.method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(quote()) });
      return;
    }
    await route.continue();
  });

  await page.goto(`/business/sales/quotes/${QUOTE_ID}/approval?organization_id=${E2E_ORGANIZATION_ID}`);
  await expect(page.getByRole("heading", { name: "Quote approval" })).toBeVisible();
  await page.getByLabel("Decision reason").fill("Pricing and delivery scope verified");
  await page.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByRole("heading", { name: "Confirm Quote Approval?" })).toBeVisible();
  await page.getByLabel("Reason", { exact: true }).fill("Recent MFA assurance confirmed");
  await page.getByRole("button", { name: "Confirm Approval" }).click();

  await expect(page.getByRole("heading", { name: "Create client proposal" })).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
  await page.getByLabel("Conversion reason").fill("Create client proposal from approved terms");
  await page.getByRole("button", { name: "Create immutable proposal" }).click();

  await expect(page).toHaveURL(new RegExp(`/business/sales/proposals/${PROPOSAL_ID}/preview`));
  expect(conversionRequest).toMatchObject({
    expected_quote_version: 3,
    reason: "Create client proposal from approved terms",
  });
});
