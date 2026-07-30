import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.describe("Command Center entry", () => {
  test("loads the super-admin login entry without automated accessibility violations", async ({ page }) => {
    await page.goto("/");

    await expect(page).toHaveTitle(/Event OS/);
    await expect(page.getByRole("heading", { name: /Command Center Access/i })).toBeVisible();
    await expect(page.getByLabel(/work email/i)).toBeVisible();
    await expect(page.getByLabel(/^password$/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /continue securely/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /fast login/i })).toHaveCount(0);

    const results = await new AxeBuilder({ page })
      .disableRules(["color-contrast"])
      .analyze();

    expect(results.violations).toEqual([]);
  });
});
