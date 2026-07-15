import { describe, expect, it } from "vitest";

import { queryKeys } from "./query-keys";

describe("queryKeys", () => {
  it("normalizes empty params and sorts keys deterministically", () => {
    expect(queryKeys.events.speakers("org_1", "evt_1", { page: 2, filter: "", sort: "name" })).toEqual([
      "tenant",
      "org_1",
      "event",
      "evt_1",
      "speakers",
      { page: 2, sort: "name" },
    ]);
  });

  it("keeps event scoping explicit for permission and admin keys", () => {
    expect(queryKeys.permissions.effective("org_1", "evt_42")).toEqual([
      "tenant",
      "org_1",
      "permissions",
      "effective",
      { eventId: "evt_42" },
    ]);
    expect(queryKeys.organizations.detail("org_1")).toEqual(["platform-admin", "organization", "org_1"]);
  });

  it("never aliases platform and tenant scope", () => {
    expect(queryKeys.events.all("org_1")).not.toEqual(queryKeys.events.all("org_2"));
    expect(queryKeys.events.all(null)).toEqual(["tenant", "platform", "events"]);
  });
});
