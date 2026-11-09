import { expect, test } from "@playwright/test";

const token = "speaker-grant-token";
const speaker = {
  speaker_id: "00000000-0000-4000-8000-000000000201",
  event_id: "00000000-0000-4000-8000-000000000202",
  event_name: "Future Systems Summit",
  first_name: "Maya",
  last_name: "Chen",
  email: "maya.chen@example.test",
  designation: "VP Engineering",
  affiliation: "Example Labs",
  country: "India",
  bio: "A programme speaker.",
  photo_url: null,
  programme_availability: {},
  programme_custom_fields: {},
  programme_travel_details: {},
  version: 3,
  participation: "PENDING",
  sessions: [{ id: "00000000-0000-4000-8000-000000000301", code: "AI-01", title: "Reliable event systems", start_time: "2026-10-10T09:00:00Z", end_time: "2026-10-10T10:00:00Z", room: "Main Stage", role: "Speaker", presentation_title: "Reliable event systems", is_confirmed: false }],
};

test("speaker completes invitation, profile, upload, and participation workflow", async ({ page }) => {
  let profilePatch: any = null;
  let participationRequest: string | null = null;
  let headshotUpload = false;

  await page.route("**/api/v1/programme/access/" + token, async route => {
    if (route.request().method() === "GET") {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ audience: "SPEAKER", event_id: speaker.event_id, expires_at: "2026-10-20T00:00:00Z" }) });
    }
    return route.fallback();
  });
  await page.route("**/api/v1/programme/access/" + token + "/speaker**", async route => {
    if (route.request().method() === "GET") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(speaker) });
    if (route.request().method() === "PATCH") {
      profilePatch = route.request().postDataJSON();
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...speaker, ...profilePatch, version: 4 }) });
    }
    if (route.request().method() === "POST" && route.request().url().endsWith("/headshot")) {
      headshotUpload = true;
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...speaker, photo_url: "https://assets.example.test/headshot.jpg", version: 4 }) });
    }
    if (route.request().method() === "POST" && route.request().url().includes("/participation")) {
      participationRequest = new URL(route.request().url()).searchParams.get("accepted");
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...speaker, participation: "ACCEPTED", sessions: speaker.sessions.map((item) => ({ ...item, is_confirmed: true })) }) });
    }
    return route.fallback();
  });

  await page.goto(`http://localhost:3003/programme/${token}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Welcome, Maya" })).toBeVisible();
  await expect(page.getByText("Reliable event systems", { exact: true })).toBeVisible();

  await page.getByRole("textbox", { name: "Short biography" }).fill("Updated programme biography.");
  await page.locator('textarea[name="programme_availability"]').fill('{"2026-10-10":[{"start":"08:00","end":"18:00"}]}');
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect.poll(() => profilePatch).not.toBeNull();
  expect(profilePatch.programme_availability["2026-10-10"][0].start).toBe("08:00");

  const headshot = page.locator('input[type="file"]').first();
  await headshot.setInputFiles({ name: "maya.jpg", mimeType: "image/jpeg", buffer: Buffer.from("fake-image") });
  await expect.poll(() => headshotUpload).toBe(true);
  await page.getByRole("button", { name: "Accept programme" }).click();
  await expect.poll(() => participationRequest).toBe("true");
  await expect(page.getByText("ACCEPTED", { exact: true })).toBeVisible();
});
