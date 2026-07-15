import { describe, expect, it } from "vitest";

import { COMMAND_CENTER_DESTINATIONS, searchDestinations } from "./command-center-navigation";

describe("Command Center navigation catalogue", () => {
  it("contains unique destinations and the interface catalogue", () => {
    const hrefs = COMMAND_CENTER_DESTINATIONS.map((item) => item.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    expect(hrefs).toContain("/design-system");
  });

  it("searches labels, groups, and operational keywords", () => {
    expect(searchDestinations("snapshot").map((item) => item.href)).toContain("/business/subscription/entitlements");
    expect(searchDestinations("reconciliation").some((item) => item.group === "Finance")).toBe(true);
    expect(searchDestinations("rbac").map((item) => item.label)).toEqual(expect.arrayContaining(["Roles", "Permissions"]));
  });
});
