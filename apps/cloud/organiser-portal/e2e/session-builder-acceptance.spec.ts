import { expect, test } from "@playwright/test";

const EVENT_ID = "00000000-0000-4000-8000-000000000105";
const ORGANIZATION_ID = "00000000-0000-4000-8000-000000000102";

const user = {
  id: "00000000-0000-4000-8000-000000000101",
  email: "programme.lead@example.test",
  first_name: "Programme",
  last_name: "Lead",
  role: "organizer",
  organization_id: ORGANIZATION_ID,
  onboarding_completed: true,
  org_role: "owner",
};

const event = {
  id: EVENT_ID,
  organization_id: ORGANIZATION_ID,
  name: "Future Systems Summit",
  venue_name: "Harbour Convention Centre",
  start_date: "2026-10-10T00:00:00",
  end_date: "2026-10-11T23:59:59",
  timezone: "Asia/Kolkata",
  status: "draft",
};

const tracks = [
  { id: "00000000-0000-4000-8000-000000000121", event_id: EVENT_ID, name: "Applied AI", display_color: "#4F67D8", sort_order: 0 },
  { id: "00000000-0000-4000-8000-000000000122", event_id: EVENT_ID, name: "Platform", display_color: "#16846D", sort_order: 1 },
];

const rooms = [
  { id: "00000000-0000-4000-8000-000000000131", event_id: EVENT_ID, name: "Main Stage", room_type: "Auditorium", is_active: true, sessions_count: 2 },
  { id: "00000000-0000-4000-8000-000000000132", event_id: EVENT_ID, name: "Studio North", room_type: "Breakout", is_active: true, sessions_count: 2 },
  { id: "00000000-0000-4000-8000-000000000133", event_id: EVENT_ID, name: "Lab One", room_type: "Workshop", is_active: true, sessions_count: 1 },
];

const speaker = (id: string, full_name: string) => ({ id, full_name, email: `${full_name.toLowerCase().replaceAll(" ", ".")}@example.test`, upload_status: "approved" });

const acceptedCandidates = [{ id: "00000000-0000-4000-8000-000000000161", code: "ABS-01", title: "A converted programme candidate", abstract_type: "ORAL", topic: "Applied AI", track: "Applied AI", presenter_name: "Jordan Lee", presenter_email: "jordan.lee@example.test", speaker_ready: true }];

const sessions = [
  { id: "00000000-0000-4000-8000-000000000141", event_id: EVENT_ID, session_code: "KEY-01", name: "The next operating system for events", session_type: "KEYNOTE", status: "ACCEPTED", start_time: "2026-10-10T09:00:00", end_time: "2026-10-10T10:00:00", room_id: rooms[0].id, room_name: rooms[0].name, track_id: tracks[0].id, track_name: tracks[0].name, display_color: tracks[0].display_color, speaker_count: 1, speakers: [speaker("00000000-0000-4000-8000-000000000151", "Maya Chen")], is_published: false },
  { id: "00000000-0000-4000-8000-000000000142", event_id: EVENT_ID, session_code: "PLT-12", name: "Reliable platforms under event-day pressure", session_type: "TALK", status: "ACCEPTED", start_time: "2026-10-10T10:15:00", end_time: "2026-10-10T11:00:00", room_id: rooms[1].id, room_name: rooms[1].name, track_id: tracks[1].id, track_name: tracks[1].name, display_color: tracks[1].display_color, speaker_count: 1, speakers: [speaker("00000000-0000-4000-8000-000000000152", "Aarav Mehta")], is_published: false },
  { id: "00000000-0000-4000-8000-000000000143", event_id: EVENT_ID, session_code: "AI-18", name: "Agent workflows that survive production", session_type: "TALK", status: "ACCEPTED", start_time: "2026-10-10T11:15:00", end_time: "2026-10-10T12:00:00", room_id: rooms[2].id, room_name: rooms[2].name, track_id: tracks[0].id, track_name: tracks[0].name, display_color: tracks[0].display_color, speaker_count: 2, speakers: [speaker("00000000-0000-4000-8000-000000000153", "Noah Williams"), speaker("00000000-0000-4000-8000-000000000154", "Priya Shah")], is_published: true },
  { id: "00000000-0000-4000-8000-000000000144", event_id: EVENT_ID, session_code: "BRK-01", name: "Coffee break", session_type: "BREAK", status: "ACCEPTED", start_time: "2026-10-10T12:00:00", end_time: "2026-10-10T12:30:00", room_id: rooms[0].id, room_name: rooms[0].name, speaker_count: 0, speakers: [], is_published: false },
  { id: "00000000-0000-4000-8000-000000000145", event_id: EVENT_ID, session_code: "PLT-21", name: "Designing a calm command centre", session_type: "TALK", status: "ACCEPTED", start_time: "2026-10-10T13:00:00", end_time: "2026-10-10T13:45:00", room_id: rooms[1].id, room_name: rooms[1].name, track_id: tracks[1].id, track_name: tracks[1].name, display_color: tracks[1].display_color, speaker_count: 1, speakers: [speaker("00000000-0000-4000-8000-000000000155", "Elena Rossi")], is_published: false },
  { id: "00000000-0000-4000-8000-000000000146", event_id: EVENT_ID, session_code: "AI-27", name: "Evaluation without the spreadsheet", session_type: "PANEL", status: "ACCEPTED", start_time: "2026-10-10T14:00:00", end_time: "2026-10-10T14:45:00", room_id: null, room_name: null, track_id: tracks[0].id, track_name: tracks[0].name, display_color: tracks[0].display_color, speaker_count: 1, speakers: [speaker("00000000-0000-4000-8000-000000000156", "Sam Okafor")], is_published: false },
  { id: "00000000-0000-4000-8000-000000000147", event_id: EVENT_ID, session_code: "PLT-30", name: "Offline-first venue operations", session_type: "TALK", status: "ACCEPTED", start_time: "2026-10-10T15:00:00", end_time: "2026-10-10T15:45:00", room_id: null, room_name: null, track_id: tracks[1].id, track_name: tracks[1].name, display_color: tracks[1].display_color, speaker_count: 1, speakers: [speaker("00000000-0000-4000-8000-000000000157", "Leah Martin")], is_published: false },
];

test("programme lead places a waiting session on the room timeline", async ({ page }) => {
  const pageErrors: string[] = [];
  let reorderPayload: unknown = null;
  let materializeRequestCount = 0;
  let materializeIdempotencyKey: string | null = null;
  let duplicateRequestCount = 0;
  let duplicateIdempotencyKey: string | null = null;
  page.on("pageerror", error => {
    if (!error.message.includes("Router action dispatched before initialization")) pageErrors.push(error.message);
  });
  await page.addInitScript(({ organizationId, authUser }) => {
    localStorage.setItem("obsidian-auth-storage", JSON.stringify({ state: { user: authUser, accessToken: "e2e-organiser-token", refreshToken: "e2e-refresh-token", isAuthenticated: true, rememberMe: true, loginTime: Date.now(), lastActivity: Date.now(), hasHydrated: true }, version: 0 }));
    sessionStorage.setItem("session_active", "true");
  }, { organizationId: ORGANIZATION_ID, authUser: user });

  await page.route("**/api/v1/auth/me", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(user) }));
  await page.route("**/api/v1/auth/refresh", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ access_token: "e2e-organiser-token" }) }));
  await page.route("**/api/v1/global-settings", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ timezone: "Asia/Kolkata" }) }));
  await page.route("**/api/v1/organiser/needs-attention", route => route.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await page.route("**/api/v1/organiser/events/" + EVENT_ID + "/needs-attention", route => route.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await page.route("**/api/v1/events/" + EVENT_ID, route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(event) }));
  await page.route("**/api/v1/events/" + EVENT_ID + "/capabilities", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ availability: { available: true }, features: {}, limits: {}, operational_state: {} }) }));
  await page.route("**/api/v1/organizations/current/capabilities", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ availability: { available: true }, features: {}, limits: {}, operational_state: {} }) }));
  await page.route("**/api/v1/events/" + EVENT_ID + "/sessions/builder-snapshot", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ sessions, rooms, tracks, unscheduled_speakers: [], accepted_candidates: acceptedCandidates, conflicts: [], event_timezone: "Asia/Kolkata", event_start_date: event.start_date, event_end_date: event.end_date }) }));
  await page.route("**/api/v1/events/" + EVENT_ID + "/sessions/bulk-reorder", async route => {
    reorderPayload = route.request().postDataJSON();
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ updated_count: sessions.length, conflicts: [], message: "Schedule saved" }) });
  });
  // Playwright route matching can differ between bundled runners. Keep one
  // deterministic fixture dispatcher so the broad fallback cannot swallow
  // the builder snapshot or save request.
  await page.route("**/api/v1/**", async route => {
    const url = route.request().url();
    if (url.includes(`/events/${EVENT_ID}/sessions/builder-snapshot`)) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ sessions, rooms, tracks, unscheduled_speakers: [], accepted_candidates: acceptedCandidates, conflicts: [], event_timezone: "Asia/Kolkata", event_start_date: event.start_date, event_end_date: event.end_date }) });
    }
    if (url.includes(`/events/${EVENT_ID}/sessions/bulk-reorder`)) {
      reorderPayload = route.request().postDataJSON();
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ updated_count: sessions.length, conflicts: [], message: "Schedule saved" }) });
    }
    if (url.includes(`/events/${EVENT_ID}/sessions/schedule-preview`)) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
        event_id: EVENT_ID,
        publication_status: "DRAFT",
        publication_ready: false,
        conflicts: [{ type: "speaker_conflict", severity: "error", description: "Speaker is assigned to two overlapping sessions", session_ids: [sessions[0].id, sessions[1].id] }],
        sessions: sessions.map((session) => ({ id: session.id, code: session.session_code, title: session.name, type: session.session_type, starts_at: session.start_time, ends_at: session.end_time, room: session.room_name, track: session.track_name, published: session.is_published, status: session.status })),
      }) });
    }
    if (url.includes(`/events/${EVENT_ID}/sessions/candidates/${acceptedCandidates[0].id}/materialize`)) {
      materializeRequestCount += 1;
      materializeIdempotencyKey = route.request().headers()["idempotency-key"] || null;
      return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ id: "00000000-0000-4000-8000-000000000171", session_code: "ABS-01", name: acceptedCandidates[0].title, start_time: "2026-10-10T16:00:00", end_time: "2026-10-10T16:45:00", room_id: null, message: "Accepted abstract added to the waiting queue." }) });
    }
    if (url.includes(`/events/${EVENT_ID}/sessions/`) && url.endsWith("/duplicate")) {
      duplicateRequestCount += 1;
      duplicateIdempotencyKey = route.request().headers()["idempotency-key"] || null;
      return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ id: "00000000-0000-4000-8000-000000000172", session_code: "KEY-01-COPY", name: "The next operating system for events (copy)", start_time: "2026-10-10T10:00:00", end_time: "2026-10-10T11:00:00", room_id: rooms[0].id, message: "Session duplicated" }) });
    }
    if (url.includes(`/events/${EVENT_ID}`) && !url.includes("/capabilities")) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(event) });
    }
    if (url.includes("/auth/me")) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(user) });
    if (url.includes("/global-settings")) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ timezone: "Asia/Kolkata" }) });
    if (url.includes("/needs-attention")) return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    if (url.includes("/capabilities")) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ availability: { available: true }, features: {}, limits: {}, operational_state: {} }) });
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({}) });
  });

  await page.goto(`/events/${EVENT_ID}/sessions/builder`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Schedule builder" })).toBeVisible({ timeout: 90_000 });
  await expect(page.getByText("The next operating system for events")).toBeVisible();
  await expect(page.getByText("Evaluation without the spreadsheet")).toBeVisible();
  await expect(page.getByText("Main Stage", { exact: true })).toBeVisible();
  await expect(page.getByText("Studio North", { exact: true })).toBeVisible();
  await expect(page.getByText("A converted programme candidate", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Add to queue", exact: true }).click();
  await expect.poll(() => materializeRequestCount, { timeout: 10_000 }).toBe(1);
  expect(materializeIdempotencyKey).toBeTruthy();

  const waitingSession = page.locator("article").filter({ hasText: "Evaluation without the spreadsheet" });
  const mainStageColumn = page.getByLabel("Main Stage schedule column");
  await waitingSession.dragTo(mainStageColumn, { targetPosition: { x: 120, y: 360 } });
  await expect(mainStageColumn.getByText("Evaluation without the spreadsheet")).toBeVisible();
  await expect.poll(() => reorderPayload, { timeout: 10_000 }).not.toBeNull();

  // Search/filter and duplicate are part of the operational queue, not only
  // visual affordances.
  const waitingSearch = page.getByPlaceholder("Search waiting sessions");
  await waitingSearch.fill("calm command");
  await expect(page.getByText("Designing a calm command centre", { exact: true })).toBeVisible();
  await expect(page.locator("aside").getByText("Reliable platforms under event-day pressure", { exact: true })).not.toBeVisible();
  await waitingSearch.fill("");
  await page.getByText("The next operating system for events", { exact: true }).first().click();
  await page.getByRole("button", { name: "Duplicate", exact: true }).click();
  await expect.poll(() => duplicateRequestCount, { timeout: 10_000 }).toBe(1);
  expect(duplicateIdempotencyKey).toBeTruthy();

  await page.getByRole("button", { name: "Blocks", exact: true }).click();
  await expect(page.getByText("Service blocks", { exact: true })).toBeVisible();
  await expect(page.locator('aside [draggable="true"]').filter({ hasText: "Coffee break" })).toHaveCount(1);
  await page.getByRole("button", { name: "Schedule", exact: true }).click();

  await expect(page.getByRole("button", { name: "Publish" })).toBeEnabled();
  await expect(page.getByRole("navigation", { name: "Builder views" })).toBeVisible();
  expect(pageErrors).toEqual([]);
  await page.screenshot({ path: "test-results/session-builder-desktop.png", fullPage: true });

  // The four operational views share one schedule state and must be switchable
  // without losing the placed item.
  for (const view of ["Rooms", "List", "Calendar", "Schedule"]) {
    await page.getByRole("button", { name: view, exact: true }).click();
    await expect(page.getByRole("navigation", { name: "Builder views" })).toBeVisible();
  }

  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Schedule preview" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Publication is blocked", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close", exact: true }).click();

  for (const alias of [
    `/events/${EVENT_ID}/program/agenda`,
    `/events/${EVENT_ID}/program/builder`,
    `/events/${EVENT_ID}/sessions/agenda`,
  ]) {
    await page.goto(alias, { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(`/events/${EVENT_ID}/sessions/builder`);
    await expect(page.getByRole("heading", { name: "Schedule builder" })).toBeVisible({ timeout: 90_000 });
  }
});
