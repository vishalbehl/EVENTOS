import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "./fixtures/authenticated";

test.describe("Phase 1 design system and shell", () => {
  test("supports command search, theme, and accessible catalogue", async ({ authenticatedPage: page }) => {
    await page.goto("/design-system");
    await expect(page.getByRole("heading", { name: "Command Center interface standards" })).toBeVisible();
    await page.getByRole("button", { name: "Open command search" }).first().click();
    await page.getByLabel("Search Command Center destinations").fill("entitlements");
    await expect(page.getByRole("option", { name: /Entitlements/ })).toBeVisible();
    await page.keyboard.press("Escape");

    const themeSwitch = page.getByRole("switch", { name: /Switch to (dark|light) theme/ });
    await themeSwitch.click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.getByRole("switch", { name: /Switch to light theme/ }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });

  test("keeps navigation usable at mobile reflow", async ({ authenticatedPage: page }) => {
    await page.goto("/design-system");
    await expect(page.getByRole("heading", { name: "Command Center interface standards" })).toBeVisible();
    await page.setViewportSize({ width: 320, height: 720 });
    await page.getByRole("button", { name: "Open navigation" }).click();
    await expect(page.getByRole("heading", { name: "Command Center navigation" })).toBeAttached();
    await expect(page.getByRole("navigation", { name: "Command Center" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("navigation", { name: "Command Center" })).not.toBeVisible();
  });
});
