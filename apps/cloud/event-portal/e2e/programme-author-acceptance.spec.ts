import { expect, test } from "@playwright/test";

const token = "author-grant-token";
const submission = {
  id: "00000000-0000-4000-8000-000000000401",
  code: "ABS-401",
  title: "A reliable programme workflow",
  body: "A sufficiently long abstract body used by the author acceptance scenario.",
  keywords: ["reliability"],
  abstract_type: "ORAL",
  topic: "Platform",
  track: "Engineering",
  form_payload: { disclosure: "None" },
  authors: [{ full_name: "Alex Author", email: "alex@example.test", affiliation: "Example Labs", is_presenter: true }],
  attachments: [],
  status: "ACCEPTED",
  version: 7,
  notes_to_author: "Please confirm your participation.",
  author_confirmation: null,
};

test("author submits and confirms an accepted programme place", async ({ page }) => {
  let submitPayload: any = null;
  let confirmationRequest = false;
  let currentSubmission: any = { ...submission };
  const grant = { audience: "AUTHOR", event_id: "00000000-0000-4000-8000-000000000402", expires_at: "2026-10-20T00:00:00Z" };

  await page.route("**/api/v1/programme/access/" + token + "*", async route => {
    if (route.request().method() === "GET") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(grant) });
    return route.fallback();
  });
  await page.route("**/api/v1/programme/events/**/call-for-abstracts", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ form_schema: { fields: [{ key: "disclosure", label: "Disclosure", type: "select", required: true, options: ["None", "Conflict"] }] } }) }));
  await page.route("**/api/v1/programme/access/" + token + "/author/submissions", async route => {
    if (route.request().method() === "GET") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([currentSubmission]) });
    submitPayload = route.request().postDataJSON();
    return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ ...submission, status: "SUBMITTED", version: 1 }) });
  });
  await page.route("**/api/v1/programme/access/" + token + "/author/submissions/*/confirm", async route => {
    confirmationRequest = true;
    currentSubmission = { ...currentSubmission, author_confirmation: "CONFIRMED", version: 8 };
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(currentSubmission) });
  });
  await page.goto(`http://localhost:3003/programme/${token}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Your abstract submissions" })).toBeVisible();
  await expect(page.getByText("A reliable programme workflow", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Confirm participation" }).click();
  await expect.poll(() => confirmationRequest).toBe(true);
  await expect(page.getByText("PARTICIPATION CONFIRMED", { exact: true })).toBeVisible();

  await page.getByRole("textbox", { name: "Your full name" }).fill("Alex Author");
  await page.getByRole("textbox", { name: "Your email" }).fill("alex@example.test");
  await page.getByPlaceholder("Abstract title").fill("A new abstract");
  await page.getByPlaceholder("Abstract body").fill("This is a sufficiently long abstract body for the author submission browser workflow.");
  await page.locator("select").last().selectOption({ label: "None" });
  await page.getByRole("button", { name: "Submit abstract" }).click();
  await expect.poll(() => submitPayload).not.toBeNull();
  expect(submitPayload.form_payload).toBeDefined();
});
