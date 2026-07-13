import { describe, expect, it } from "vitest";

import { queryKeys } from "./query-keys";

describe("queryKeys", () => {
  it("normalizes empty params and sorts keys deterministically", () => {
    expect(queryKeys.events.speakers("evt_1", { page: 2, filter: "", sort: "name" })).toEqual([
      "events",
      "evt_1",
      "speakers",
      { page: 2, sort: "name" },
    ]);
  });

  it("keeps event scoping explicit for permission and admin keys", () => {
    expect(queryKeys.permissions.effective("evt_42")).toEqual(["permissions", "effective", { eventId: "evt_42" }]);
    expect(queryKeys.organizations.detail("org_1")).toEqual(["organizations", "org_1"]);
  });
});
