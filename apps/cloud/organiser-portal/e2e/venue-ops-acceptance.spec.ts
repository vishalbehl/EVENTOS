import { expect, test } from "@playwright/test";

const EVENT_ID = "00000000-0000-4000-8000-000000000005";
const ORGANIZATION_ID = "00000000-0000-4000-8000-000000000002";
const REQUEST_ID = "00000000-0000-4000-8000-000000000006";

test("organiser builds and submits a Venue Ops quotation brief", async ({ page }) => {
  let request: any = null;
  const recommendations = [
    { service_code: "REGISTRATION_DESK", service_name: "Registration desks", category: "Registration", priority: "REQUIRED", suggested_quantity: 3, reason: "300 registrations require staffed arrival points.", template_refs: ["registration-standard"], template_version: "v1", dependencies: [], requires_confirmation: true },
    { service_code: "SRR", service_name: "Speaker readiness room", category: "Speaker operations", priority: "RECOMMENDED", suggested_quantity: 2, reason: "50 speakers need speaker-ready support.", template_refs: ["srr-standard"], template_version: "v2", dependencies: [], requires_confirmation: true },
  ];
  const event = { id: EVENT_ID, organization_id: ORGANIZATION_ID, name: "Summit 2026", venue_name: "Main Hall", start_date: "2026-10-10", end_date: "2026-10-11", status: "draft", registration_settings: { enabled: true }, speaker_settings: { enabled: true } };
  const overview = () => ({ event, facts: { registrations: 300, speakers: 50, rooms: 4, sessions: 20, event_days: 2, hybrid: true }, recommendations, request });
  const user = { id: "00000000-0000-4000-8000-000000000001", email: "organiser@example.test", first_name: "Event", last_name: "Organiser", role: "organizer", organization_id: ORGANIZATION_ID, onboarding_completed: true, org_role: "owner" };

  await page.addInitScript(({ organizationId }) => {
    const authValue = JSON.stringify({ state: { user: { id: "00000000-0000-4000-8000-000000000001", email: "organiser@example.test", first_name: "Event", last_name: "Organiser", role: "organizer", organization_id: organizationId, onboarding_completed: true, org_role: "owner" }, accessToken: "e2e-organiser-token", refreshToken: "e2e-refresh-token", isAuthenticated: true, rememberMe: true, loginTime: Date.now(), lastActivity: Date.now() }, version: 0 });
    const setItem = localStorage.setItem.bind(localStorage);
    localStorage.setItem = ((key: string, value: string) => { if (key === "obsidian-auth-storage" && value.includes('"isAuthenticated":false')) return; setItem(key, value); }) as typeof localStorage.setItem;
    setItem("obsidian-auth-storage", authValue);
    sessionStorage.setItem("session_active", "true");
  }, { organizationId: ORGANIZATION_ID });
  await page.route("**/api/v1/**", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({}) }));
  await page.route("**/api/v1/auth/me", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(user) }));
  await page.route("**/api/v1/global-settings", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ timezone: "Asia/Kolkata" }) }));
  await page.route("**/api/v1/organiser/needs-attention", route => route.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await page.route("**/api/v1/organiser/events/" + EVENT_ID + "/needs-attention", route => route.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await page.route("**/api/v1/events/" + EVENT_ID, route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(event) }));
  await page.route("**/api/v1/events/" + EVENT_ID + "/capabilities", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ availability: { available: true }, features: {}, limits: {}, operational_state: {} }) }));
  await page.route("**/api/v1/organizations/current/capabilities", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ availability: { available: true }, features: {}, limits: {}, operational_state: {} }) }));
  await page.route("**/api/v1/service-requests/events/" + EVENT_ID + "/venue-ops/overview", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(overview()) }));
  await page.route("**/api/v1/service-requests/events/" + EVENT_ID + "/venue-ops/requests", async route => { request = { id: REQUEST_ID, request_number: "VOPS-E2E-001", title: "Summit 2026 Venue Ops", status: "DRAFT", version: 1, items: route.request().postDataJSON().items, planning_overrides: {} }; await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify(request) }); });
  await page.route("**/api/v1/service-requests/" + REQUEST_ID + "/submit", async route => { request.status = "SUBMITTED"; request.version = 2; await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(request) }); });

  await page.goto("/events/" + EVENT_ID + "/venue-ops/requirements", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Build the quotation brief" })).toBeVisible({ timeout: 90_000 });
  await expect(page.getByText("Registration desks")).toBeVisible();
  await expect(page.getByText("Speaker readiness room")).toBeVisible();
  const customInput = page.getByPlaceholder("Add a custom operational requirement");
  await customInput.fill("Onsite technical helpdesk");
  await customInput.locator("..").getByRole("button").click();
  await expect(page.getByText("Onsite technical helpdesk")).toBeVisible();
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("status")).toContainText("Requirements saved");
  await page.getByRole("button", { name: /Send to Command Center/ }).click();
  await expect(page.getByRole("status")).toContainText("Requirements sent to Command Center");
  await page.goto("/events/" + EVENT_ID + "/venue-ops/recommendations", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("button", { name: "Recalculate recommendations" })).toBeVisible({ timeout: 90_000 });
  await page.getByRole("button", { name: "Recalculate recommendations" }).click();
});

test("organiser reviews a Venue Ops proposal and records a decision", async ({ page }) => {
  const quoteId = "00000000-0000-4000-8000-000000000007";
  const proposalId = "00000000-0000-4000-8000-000000000008";
  const exportId = "00000000-0000-4000-8000-000000000009";
  const event = { id: EVENT_ID, organization_id: ORGANIZATION_ID, name: "Summit 2026", venue_name: "Main Hall", start_date: "2026-10-10", end_date: "2026-10-11" };
  const user = { id: "00000000-0000-4000-8000-000000000001", email: "organiser@example.test", first_name: "Event", last_name: "Organiser", role: "organizer", organization_id: ORGANIZATION_ID, onboarding_completed: true, org_role: "owner" };
  const quote = { id: quoteId, quote_number: "VQ-2026-001", title: "Summit 2026 Venue Ops", status: "SENT", currency: "INR", total_amount: "125000.00", version: 1, proposal: { id: proposalId, proposal_number: "VP-2026-001", status: "SENT", current_version: 1 }, documents: [{ export_id: exportId, proposal_version: 1, status: "COMPLETED", file_format: "PDF", created_at: "2026-09-03T10:00:00Z" }] };
  const overview = { event, facts: { registrations: 300, speakers: 50, rooms: 4, sessions: 20, event_days: 2, hybrid: true }, recommendations: [], request: { id: REQUEST_ID, request_number: "VOPS-E2E-001", title: "Summit 2026 Venue Ops", status: "SUBMITTED", version: 2, items: [], planning_overrides: {} } };

  await page.addInitScript(({ organizationId }) => {
    const authValue = JSON.stringify({ state: { user: { id: "00000000-0000-4000-8000-000000000001", email: "organiser@example.test", first_name: "Event", last_name: "Organiser", role: "organizer", organization_id: organizationId, onboarding_completed: true, org_role: "owner" }, accessToken: "e2e-organiser-token", refreshToken: "e2e-refresh-token", isAuthenticated: true, rememberMe: true, loginTime: Date.now(), lastActivity: Date.now() }, version: 0 });
    localStorage.setItem("obsidian-auth-storage", authValue);
    sessionStorage.setItem("session_active", "true");
  }, { organizationId: ORGANIZATION_ID });
  await page.route("**/api/v1/**", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({}) }));
  await page.route("**/api/v1/auth/me", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(user) }));
  await page.route("**/api/v1/global-settings", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ timezone: "Asia/Kolkata" }) }));
  await page.route("**/api/v1/organiser/needs-attention", route => route.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await page.route("**/api/v1/organiser/events/" + EVENT_ID + "/needs-attention", route => route.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await page.route("**/api/v1/events/" + EVENT_ID, route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(event) }));
  await page.route("**/api/v1/events/" + EVENT_ID + "/capabilities", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ availability: { available: true }, features: {}, limits: {}, operational_state: {} }) }));
  await page.route("**/api/v1/organizations/current/capabilities", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ availability: { available: true }, features: {}, limits: {}, operational_state: {} }) }));
  await page.route("**/api/v1/service-requests/events/" + EVENT_ID + "/venue-ops/overview", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(overview) }));
  await page.route("**/api/v1/service-requests/events/" + EVENT_ID + "/venue-ops/quotes", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([quote]) }));
  await page.route("**/api/v1/service-requests/proposals/" + proposalId + "/documents", route => route.fulfill({ status: 202, contentType: "application/json", body: JSON.stringify({ export_id: exportId, status: "QUEUED" }) }));
  await page.route("**/api/v1/service-requests/proposals/" + proposalId + "/documents/" + exportId + "/download", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ download_url: "https://downloads.example.test/venue-ops.pdf" }) }));
  await page.route("**/api/v1/service-requests/quotes/" + quoteId + "/request-revision", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...quote, status: "REVISION_REQUESTED", version: 2 }) }));
  await page.route("**/api/v1/service-requests/quotes/" + quoteId + "/organiser-decision", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...quote, status: "ORGANISER_APPROVED", version: 2 }) }));

  await page.goto("/events/" + EVENT_ID + "/venue-ops/quotes", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Quotes & proposals" })).toBeVisible({ timeout: 90_000 });
  await expect(page.getByText("Summit 2026 Venue Ops")).toBeVisible();
  await expect(page.getByText("PDF completed")).toBeVisible();
  await page.getByRole("button", { name: "Download PDF" }).click();
  await page.getByRole("button", { name: "Generate PDF" }).click();
  page.on("dialog", dialog => dialog.accept(dialog.message().toLowerCase().includes("approve") ? "Approved after organiser review." : "Please adjust staffing scope."));
  await page.getByRole("button", { name: "Request revision" }).click();
  await page.getByRole("button", { name: "Approve quote" }).click();
});
