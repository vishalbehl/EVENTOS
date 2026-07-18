import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.describe("Command Center entry", () => {
  test("loads the super-admin login entry without automated accessibility violations", async ({ page }) => {
    await page.goto("/");

    await expect(page).toHaveTitle(/EventX OS/);
    await expect(page.getByRole("heading", { name: /Platform Control Panel/i })).toBeVisible();
    await expect(page.getByLabel(/admin identity/i)).toBeVisible();
    await expect(page.getByLabel(/^password$/i)).toBeVisible();
    await expect(page.getByLabel(/authenticator code/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /verify and continue/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /fast login/i })).toHaveCount(0);

    const results = await new AxeBuilder({ page })
      .disableRules(["color-contrast"])
      .analyze();

    expect(results.violations).toEqual([]);
  });
});
