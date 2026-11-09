// Real local browser acceptance. No route interception, synthetic auth state,
// saved browser credentials, traces or video containing credential inputs.
import { chromium, expect } from "@playwright/test";
import { createHmac } from "node:crypto";
import path from "node:path";

const base = process.env.CATEGORY_A_BROWSER_ORIGIN;
const email = process.env.CATEGORY_A_BROWSER_EMAIL;
const password = process.env.CATEGORY_A_BROWSER_PASSWORD;
const secret = process.env.CATEGORY_A_BROWSER_TOTP;
const eventId = process.env.CATEGORY_A_BROWSER_EVENT;
const ownerId = process.env.CATEGORY_A_BROWSER_OWNER;
const output = process.env.CATEGORY_A_BROWSER_OUTPUT;
const sourceIds = (process.env.CATEGORY_A_BROWSER_SOURCE_TEMPLATES || "").split(",").filter(Boolean);
const replacementCategory = process.env.CATEGORY_A_BROWSER_REPLACEMENT_CATEGORY;
const detachSource = process.env.CATEGORY_A_BROWSER_DETACH_SOURCE;
const sensitive = new Set([password, secret]);
if (!base?.startsWith("http://127.0.0.1:") || !email || !password || !secret || !eventId || !ownerId || !output) {
  throw new Error("The isolated Category A browser harness must supply its complete configuration.");
}

function currentTotp() {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const character of secret) bits += alphabet.indexOf(character).toString(2).padStart(5, "0");
  const key = Buffer.from(bits.match(/.{8}/g).map(value => Number.parseInt(value, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const digest = createHmac("sha1", key).update(counter).digest();
  const offset = digest[digest.length - 1] & 15;
  const code = ((digest.readUInt32BE(offset) & 0x7fffffff) % 1000000).toString().padStart(6, "0");
  sensitive.add(code);
  return code;
}

function redact(error) {
  let message = String(error?.message || error);
  for (const value of sensitive) if (value) message = message.replaceAll(value, "[redacted]");
  return message;
}

let browser;
let activePage;
let stage = "browser startup";
const pageErrors = [];
const apiDiagnostics = [];
let loginContract = null;
try {
  try { browser = await chromium.launch({ headless: true }); }
  catch { browser = await chromium.launch({ channel: "msedge", headless: true }); }
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  activePage = page;
  page.setDefaultTimeout(30000);
  page.setDefaultNavigationTimeout(180000);
  page.on("pageerror", error => pageErrors.push(redact(error)));
  page.on("response", async response => {
    try {
      const url = new URL(response.url());
      if (!url.pathname.startsWith("/api/v1/")) return;
      const item = { m: response.request().method(),
        p: url.pathname.replace(/\/[A-Za-z0-9_-]{32,}/g, "/[id]"), s: response.status() };
      if (!response.ok()) {
        const body = await response.json().catch(() => null);
        const code = body?.detail?.code || body?.code;
        if (typeof code === "string" && /^[A-Z0-9_]{3,80}$/.test(code)) item.c = code;
      } else if (url.pathname.endsWith("/auth/command-center/login")) {
        const body = await response.json();
        for (const value of [body.access_token, body.refresh_token]) if (typeof value === "string") sensitive.add(value);
        loginContract = { token_present: typeof body.access_token === "string" && body.access_token.length > 0,
          user_present: Boolean(body.user), role_is_super_admin: body.user?.role === "super_admin",
          platform_role_is_super_admin: body.user?.platform_role === "SUPER_ADMIN" };
      }
      apiDiagnostics.push(item);
      if (apiDiagnostics.length > 60) apiDiagnostics.shift();
    } catch { /* Observability must not change browser execution or auth state. */ }
  });
  const categoryPages = [];
  page.on("request", request => {
    const url = new URL(request.url());
    if (request.method() === "GET" && url.pathname.endsWith("/platform/forms/categories")) {
      categoryPages.push({ cursor: url.searchParams.get("cursor"), size: url.searchParams.get("page_size") });
    }
  });
  stage = "login readiness";
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("button", { name: "Continue securely" })).toBeEnabled({ timeout: 60000 });
  await expect(page.getByLabel("Work email", { exact: true })).toBeVisible();
  await page.getByLabel("Work email", { exact: true }).fill(email);
  await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Continue securely" }).click();
  stage = "MFA step";
  await expect(page.getByLabel("Six-digit authenticator code")).toBeAttached({ timeout: 30000 });
  await page.getByLabel("Six-digit authenticator code").fill(currentTotp());
  const login = page.waitForResponse(response => response.url().endsWith("/auth/command-center/login"));
  await page.getByRole("button", { name: "Verify and continue" }).click();
  if ((await login).status() !== 200) throw new Error("Browser password/MFA login did not succeed.");
  stage = "dashboard navigation";
  await page.waitForURL(/dashboard\/overview/, { timeout: 180000, waitUntil: "domcontentloaded" });
  stage = "catalogue navigation";
  await page.goto(`${base}/applications/templates/form`, { waitUntil: "domcontentloaded" });
  const issues = page.locator('[aria-label="Blocked event form documents"]');
  stage = "blocked document rendering";
  const registration = issues.locator(":scope > div").filter({ has: page.getByText("Registration form", { exact: true }) }).filter({ hasText: eventId });
  const abstract = issues.locator(":scope > div").filter({ has: page.getByText("Abstract form", { exact: true }) }).filter({ hasText: eventId });
  const category = issues.locator(":scope > div").filter({ has: page.getByText("Organisation category", { exact: true }) }).filter({ hasText: ownerId });
  await expect(registration).toBeVisible({ timeout: 180000 });
  await expect(abstract).toBeVisible();
  await expect(category).toBeVisible();
  await page.screenshot({ path: path.join(output, "category-a-review-before.png"), fullPage: true });
  stage = "reviewed document corrections";
  const mutations = [];
  page.on("request", request => {
    if (request.method() === "POST" && ((request.url().includes("/reconciliations/aggregates/") && request.url().endsWith("/repair"))
      || (request.url().includes("/platform/forms/templates/") && request.url().endsWith("/reconcile")))) {
      const headers = request.headers();
      mutations.push({ version: headers["if-match"], key: headers["idempotency-key"] });
    }
  });
  for (const row of [registration, abstract]) {
    page.once("dialog", dialog => dialog.accept());
    const saved = page.waitForResponse(response => response.request().method() === "POST"
      && response.url().includes("/reconciliations/aggregates/") && response.url().endsWith("/repair"));
    await row.getByRole("button", { name: row === registration
      ? "Detach invalid links and reset form" : "Replace with safe empty document" }).click();
    if ((await saved).status() !== 200) throw new Error("Browser form repair was not committed.");
    await expect(row).toHaveCount(0);
  }
  await category.getByRole("button", { name: "Review category correction" }).click();
  const correction = page.locator('[aria-label="Reviewed category correction"]');
  await correction.getByLabel("Name", { exact: true }).fill("Browser-reviewed customer category");
  await correction.getByLabel("Slug", { exact: true }).fill(`browser-reviewed-${eventId.replaceAll("-", "")}`);
  await correction.getByLabel("Review reason", { exact: true }).fill("Reviewed isolated browser correction of historical customer taxonomy.");
  const categorySaved = page.waitForResponse(response => response.request().method() === "POST"
    && response.url().includes("/reconciliations/aggregates/FORM_CATEGORY/") && response.url().endsWith("/repair"));
  await correction.getByRole("button", { name: "Approve correction" }).click();
  if ((await categorySaved).status() !== 200) throw new Error("Browser category correction was not committed.");
  await expect(category).toHaveCount(0);
  stage = "source blueprint corrections";
  let categoryLoadClicks = 0;
  for (const sourceId of sourceIds) {
    const source = page.locator('[aria-label="Blocked historical documents"] > div').filter({ hasText: `Category A source proof ${sourceId}` });
    await expect(source).toBeVisible();
    if (!replacementCategory) throw new Error("A reviewed replacement category is required for this fixture.");
    await source.getByRole("button", { name: "Review blueprint correction" }).click();
    const reviewed = page.getByRole("form", { name: "Reviewed blueprint correction" });
    const selector = reviewed.getByLabel("Reviewed replacement category");
    while (await selector.locator(`option[value="${replacementCategory}"]`).count() === 0) {
      if (categoryLoadClicks >= 8) throw new Error("Bounded replacement-category paging did not reach the fixture.");
      if (categoryLoadClicks === 0 && categoryPages.some(item => item.cursor)) {
        throw new Error("Category pages were fetched before an explicit load-more action.");
      }
      const loaded = page.waitForResponse(response => response.request().method() === "GET"
        && new URL(response.url()).pathname.endsWith("/platform/forms/categories")
        && new URL(response.url()).searchParams.has("cursor"));
      await reviewed.getByRole("button", { name: "Load more replacement categories" }).click();
      const response = await loaded;
      const body = await response.json();
      if (response.status() !== 200 || !Array.isArray(body.items) || body.items.length > 100) {
        throw new Error("Replacement category page violated its response contract.");
      }
      categoryLoadClicks += 1;
      await expect(reviewed).toBeVisible();
    }
    await selector.selectOption(replacementCategory);
    await reviewed.getByLabel("Review reason", { exact: true }).fill("Reviewed isolated browser correction of document and foreign category reference.");
    if (sourceId === detachSource) {
      const checkbox = reviewed.getByRole("checkbox", { name: /Detach invalid historical source link/ });
      await expect(checkbox).not.toBeChecked();
      const denied = page.waitForResponse(response => response.request().method() === "POST"
        && response.url().endsWith(`/platform/forms/templates/${sourceId}/reconcile`));
      await reviewed.getByRole("button", { name: "Commit reviewed blueprint correction" }).click();
      if ((await denied).status() !== 409) throw new Error("Invalid historical source was approved without explicit confirmation.");
      await expect(reviewed).toBeVisible();
      await expect(selector).toHaveValue(replacementCategory);
      await expect(reviewed.getByLabel("Review reason", { exact: true })).toHaveValue("Reviewed isolated browser correction of document and foreign category reference.");
      await checkbox.check();
    }
    const saved = page.waitForResponse(response => response.request().method() === "POST"
      && response.url().endsWith(`/platform/forms/templates/${sourceId}/reconcile`));
    await reviewed.getByRole("button", { name: "Commit reviewed blueprint correction" }).click();
    if ((await saved).status() !== 200) throw new Error("Browser source blueprint correction was not committed.");
    await expect(source).toHaveCount(0);
  }
  if (sourceIds.length && categoryLoadClicks < 2) throw new Error("Browser did not exercise a catalogue beyond two hundred entries.");
  if (categoryPages.filter(item => item.cursor).length !== categoryLoadClicks
      || categoryPages.some(item => item.size !== "100")) {
    throw new Error("Unexpected automatic category fan-out or unbounded page request.");
  }
  stage = "large-catalogue layout";
  const filters = page.getByRole("group", { name: "Blueprint category filters" });
  await expect(filters).toBeVisible();
  const layout = await filters.evaluate(element => {
    const region = document.getElementById("command-center-main");
    const bounds = element.getBoundingClientRect();
    const main = region.getBoundingClientRect();
    return { contained: bounds.left >= main.left && bounds.right <= main.right + 1,
      scrollable: element.scrollWidth > element.clientWidth,
      routeContained: region.scrollWidth <= region.clientWidth + 1 };
  });
  if (!layout.contained || !layout.scrollable || !layout.routeContained) {
    throw new Error("Large category list expanded or clipped the main route instead of scrolling within its strip.");
  }
  const expectedWrites = 3 + sourceIds.length;
  const expectedAttempts = expectedWrites + (detachSource ? 1 : 0);
  if (mutations.length !== expectedAttempts || mutations.some(item => item.version !== "1" || !item.key)
      || new Set(mutations.map(item => item.key)).size !== expectedAttempts) throw new Error("Browser version/retry contracts were missing or duplicated.");
  await page.screenshot({ path: path.join(output, "category-a-review-after.png"), fullPage: true });
  if (pageErrors.length) throw new Error(`Browser page errors: ${pageErrors.join("; ")}`);
  await context.close();
  process.stdout.write(JSON.stringify({ status: "PASSED", real_browser: true, real_mfa_login: true,
    resource_types: ["REGISTRATION_FORM", "ABSTRACT_FORM", "FORM_CATEGORY"], versioned_mutations: expectedWrites,
    source_template_scopes: sourceIds.length ? ["GLOBAL", "ORGANIZATION", "EVENT"] : [],
    combined_category_document_repairs: sourceIds.length, explicit_category_load_more_clicks: categoryLoadClicks,
    reviewed_invalid_lineage_detachments: detachSource ? 1 : 0, mutation_attempts: expectedAttempts,
    unconfirmed_lineage_detachment_denied: Boolean(detachSource),
    registration_invalid_references_detached: true, abstract_invalid_binding_replaced: true,
    large_category_strip_contained: layout.contained && layout.scrollable && layout.routeContained,
    api_routes_mocked: false, credential_artifacts_saved: false }) + "\n");
} catch (error) {
  const currentPath = activePage ? new URL(activePage.url()).pathname : "unavailable";
  process.stderr.write(redact(error) + `\nStage: ${stage}; path: ${currentPath}\n`
    + pageErrors.slice(0, 3).map(redact).join("\n")
    + "\nSanitised API statuses: " + JSON.stringify(apiDiagnostics.slice(-12))
    + "\nLogin contract flags: " + JSON.stringify(loginContract) + "\n");
  process.exitCode = 1;
} finally {
  await browser?.close();
}
