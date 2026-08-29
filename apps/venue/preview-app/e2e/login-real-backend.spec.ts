import { expect, test } from "@playwright/test";

test("login surface does not advertise fake credentials", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: /authenticate terminal access/i })).toBeVisible();
  await expect(page.getByText(/ChangeMe12345|speaker@example\.local|Sarah Chen/i)).toHaveCount(0);
  await expect(page.getByPlaceholder(/username or email/i)).toBeVisible();
  await expect(page.getByPlaceholder("••••••••")).toBeVisible();
});

test("invalid login reports the real backend failure", async ({ page }) => {
  await page.goto("/");
  await page.getByPlaceholder(/username or email/i).fill("not-a-real-user");
  await page.getByPlaceholder("••••••••").fill("wrong-password");
  await page.getByPlaceholder(/paste enrolled srr station key/i).fill("invalid-station-key");
  await page.getByRole("button", { name: /login to workstation mode/i }).click();

  await expect(page.locator("[data-sonner-toast]").first()).toContainText(/failed|unavailable|invalid|unauthorized|network error/i, { timeout: 10_000 });
});
