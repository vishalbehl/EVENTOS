import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.describe("Command Center entry", () => {
  test("loads the super-admin login entry without automated accessibility violations", async ({ page }) => {
    await page.goto("/");

    await expect(page).toHaveTitle(/EventX OS/);
    await expect(page.getByRole("heading", { name: /platform control plane/i })).toBeVisible();
    await expect(page.getByLabel(/admin identity/i)).toBeVisible();
    await expect(page.getByLabel(/access key/i)).toBeVisible();

    const results = await new AxeBuilder({ page })
      .disableRules(["color-contrast"])
      .analyze();

    expect(results.violations).toEqual([]);
  });
});
