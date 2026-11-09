import { expect, test } from "@playwright/test";

const token = "reviewer-grant-token";
const assignment = { id: "00000000-0000-4000-8000-000000000501", code: "ABS-501", title: "A submission to review", status: "ASSIGNED", due_at: "2026-10-15T00:00:00Z", conflict_declared: false, anonymous: true };

test("reviewer uses an expiring assignment link and submits a review", async ({ page }) => {
  let reviewPayload: any = null;
  let conflictRequest = false;
  let completed = false;
  const grant = { audience: "REVIEWER", event_id: "00000000-0000-4000-8000-000000000502", expires_at: "2026-10-20T00:00:00Z" };

  await page.route("**/api/v1/programme/access/" + token + "*", async route => {
    if (route.request().method() === "GET") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(grant) });
    return route.fallback();
  });
  await page.route("**/api/v1/programme/access/" + token + "/reviewer/assignments**", async route => {
    if (route.request().method() === "GET") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(completed ? [] : [assignment]) });
    if (route.request().method() === "POST" && route.request().url().endsWith("/review")) {
      reviewPayload = route.request().postDataJSON();
      completed = true;
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...assignment, status: "COMPLETED" }) });
    }
    return route.fallback();
  });
  await page.route("**/api/v1/programme/access/" + token + "/reviewer/assignments/*/conflict", async route => {
    conflictRequest = true;
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
  });

  await page.goto(`http://localhost:3003/programme/${token}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Your review assignments" })).toBeVisible();
  await expect(page.getByText("A submission to review", { exact: true })).toBeVisible();
  await page.getByRole("combobox").selectOption("ACCEPT");
  await page.getByPlaceholder("Committee-only comment").fill("Strong submission with a clear operational contribution.");
  await page.getByRole("button", { name: "Submit review" }).click();
  await expect.poll(() => reviewPayload).not.toBeNull();
  expect(reviewPayload.recommendation).toBe("ACCEPT");
  await expect(page.getByText("No assignments are waiting for you.", { exact: true })).toBeVisible();
  expect(conflictRequest).toBe(false);
});
