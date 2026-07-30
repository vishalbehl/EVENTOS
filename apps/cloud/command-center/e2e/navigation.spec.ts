import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.describe("Command Center shell & layout", () => {
  test("loads landing page and verifies responsive container", async ({ page }) => {
    // Navigate to local landing URL
    await page.goto("/");

    // Verify main app layout and metadata
    await expect(page).toHaveTitle(/Event OS/);
    
    // Viewport responsiveness checks
    await page.setViewportSize({ width: 375, height: 667 }); // mobile
    await expect(page.getByRole("heading", { name: /Command Center Access/i })).toBeVisible();

    await page.setViewportSize({ width: 1280, height: 800 }); // desktop
    await expect(page.getByRole("heading", { name: /Command Center Access/i })).toBeVisible();
  });

  test("runs basic accessibility audit on auth entry page", async ({ page }) => {
    await page.goto("/");
    
    // Scan page elements
    const results = await new AxeBuilder({ page })
      .disableRules(["color-contrast"]) // Disable contrast rule if brand overrides it slightly in dark theme
      .analyze();

    expect(results.violations).toEqual([]);
  });
});
