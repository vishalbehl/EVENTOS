import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";

import { E2E_ORGANIZATION_ID, expect, test } from "./fixtures/authenticated";

const EVENT_ID = "30000000-0000-4000-8000-000000000001";

async function accessible(page: Page) {
  const result = await new AxeBuilder({ page }).analyze();
  expect(result.violations).toEqual([]);
}

test("Operations overview uses authoritative source health", async ({ authenticatedPage: page }) => {
  await page.route("**/platform/operations/overview", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ overall_status: "HEALTHY", checked_at: "2026-07-16T10:00:00Z", sources: [{ key: "jobs", status: "HEALTHY", freshness_at: "2026-07-16T10:00:00Z", detail: "Authoritative source available." }] }) }));
  await page.goto("/operations-center");
  await expect(page.getByText("Authoritative source available.")).toBeVisible();
  await accessible(page);
});

test("Jobs renders an authoritative empty state", async ({ authenticatedPage: page }) => {
  await page.route("**/platform/operations/jobs**", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: [], summary: { running: 0, pending: 0, queued: 0, completed_24h: 0, failed_24h: 0, success_rate: 0, avg_duration_ms: 0, total_jobs: 0, active_jobs: 0, total_executions: 0, succeeded: 0, failed: 0, retrying: 0, unavailable_sources: [] }, total: 0, skip: 0, limit: 20, unavailable_sources: [] }) }));
  await page.goto("/operations-center/jobs");
  await expect(page.getByText("No executions found matching filters.")).toBeVisible();
  await accessible(page);
});

test("Database exposes migration and RLS evidence", async ({ authenticatedPage: page }) => {
  await page.route("**/platform/operations/database", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ connections: { total: 5, active: 1, idle: 4, waiting: 0 }, slow_queries: [], slow_query_stats_available: false, table_sizes: [], cache_hit_ratio: 99, database_size_bytes: 1024, dead_tuples: 0, migration: { current_revision: "operations_center_control_0780", expected_revision: null, status: "OBSERVED" }, rls: { enabled_tables: 20, forced_tables: 20, status: "OBSERVED" }, backup: { status: "UNVERIFIED" }, freshness_at: "2026-07-16T10:00:00Z" }) }));
  await page.goto("/operations-center/database");
  await expect(page.getByText("operations_center_control_0780")).toBeVisible();
  await accessible(page);
});

test("Storage does not fabricate provider capacity", async ({ authenticatedPage: page }) => {
  await page.route("**/platform/operations/queues", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ name: "default", depth: 0, status: "HEALTHY", worker_status: "UNVERIFIED" }]) }));
  await page.route("**/platform/operations/storage", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ provider_status: "UNVERIFIED", provider_detail: "Provider quota is not configured.", total_objects: 1, total_bytes: 1024, capacity_bytes: null, by_status: [{ status: "READY", count: 1, bytes: 1024 }], freshness_at: "2026-07-16T10:00:00Z" }) }));
  await page.goto("/operations-center/storage");
  await expect(page.getByText("Provider quota is not configured.")).toBeVisible();
  await accessible(page);
});

test("Request triage uses the service-request contract", async ({ authenticatedPage: page }) => {
  await page.route("**/platform/operations/requests**", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: [], next_cursor: null, has_next: false }) }));
  await page.goto("/operations-center/requests");
  await expect(page.getByText("No requests match this filter.")).toBeVisible();
  await accessible(page);
});

test("Risk register uses deployment risk records", async ({ authenticatedPage: page }) => {
  await page.route("**/platform/operations/risks**", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: [] }) }));
  await page.route("**/platform/operations/projects**", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: [] }) }));
  await page.goto("/operations-center/risk-analysis");
  await expect(page.getByText("No operational risks recorded.")).toBeVisible();
  await accessible(page);
});

test("Search uses durable reindex jobs", async ({ authenticatedPage: page }) => {
  await page.route("**/search/jobs**", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: [], total: 0 }) }));
  await page.route("**/platform/organizations**", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ id: E2E_ORGANIZATION_ID, name: "Enterprise E2E" }]) }));
  await page.goto("/operations-center/search");
  await expect(page.getByText("No reindex jobs found.")).toBeVisible();
  await accessible(page);
});

test("Venue readiness is event and supplier scoped", async ({ authenticatedPage: page }) => {
  await page.route("**/platform/operations/venue/readiness**", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: [], freshness_at: "2026-07-16T10:00:00Z" }) }));
  await page.route("**/platform/organizations?**", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ id: E2E_ORGANIZATION_ID, name: "Enterprise E2E" }]) }));
  await page.route("**/platform/organizations/*/events**", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ id: EVENT_ID, name: "Conference A" }]) }));
  await page.route("**/vendors**", route => route.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await page.goto("/operations-center/venue-readiness");
  await expect(page.getByText(/No event supplier assignments exist/)).toBeVisible();
  await accessible(page);
});

test("does not report failed Operations dependencies as healthy", async ({ authenticatedPage: page }) => {
  await page.route("**/platform/operations/overview", route => route.fulfill({ status: 503, contentType: "application/problem+json", body: JSON.stringify({ code: "OPERATIONS_UNAVAILABLE", detail: "Operations source collection failed." }) }));
  await page.goto("/operations-center");
  await expect(page.getByText("Operations overview unavailable")).toBeVisible();
  await expect(page.getByText("HEALTHY", { exact: true })).not.toBeVisible();
  await accessible(page);
});
