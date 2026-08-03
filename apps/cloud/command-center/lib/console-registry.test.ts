import { describe, expect, it } from "vitest";
import { CONSOLE_KEYS, CONSOLE_REGISTRY, resolveConsoleKey } from "./console-registry";

describe("console registry", () => {
  it.each([
    ["/dashboard/overview", "home"], ["/dashboard/consoles", "home"], ["/organizations/abc", "home"],
    ["/business/dashboard", "business"], ["/business/sales/quotes/a/edit", "business"],
    ["/business/revenue", "revenue"], ["/finance/invoices/abc", "revenue"],
    ["/operations-center/jobs", "operations"], ["/identity-security/users/a", "security"],
    ["/developer-platform/api-keys", "developer"], ["/applications/feature-flags", "developer"], ["/applications/templates/email", "developer"],
    ["/support-center/tickets/a", "support"], ["/platform-settings/authentication", "home"],
  ] as const)("resolves %s to %s", (pathname, expected) => expect(resolveConsoleKey(pathname)).toBe(expected));

  it("gives every console a dashboard and at least one owned route", () => {
    for (const key of CONSOLE_KEYS) {
      expect(CONSOLE_REGISTRY[key].dashboardRoute).toMatch(/^\//);
      expect(CONSOLE_REGISTRY[key].navigation.flatMap((group) => group.items).length).toBeGreaterThan(0);
    }
  });
});
