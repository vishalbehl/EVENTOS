import { describe, expect, it } from "vitest";

import { withExpectedVersion } from "./optimistic-concurrency";

describe("withExpectedVersion", () => {
  it("adds the authoritative version without mutating the payload", () => {
    const payload = { name: "Updated" };
    expect(withExpectedVersion({ version: 4 }, payload)).toEqual({ name: "Updated", expected_version: 4 });
    expect(payload).toEqual({ name: "Updated" });
  });

  it("fails closed when no valid version exists", () => {
    expect(() => withExpectedVersion({ version: -1 }, {})).toThrow(/valid resource version/i);
  });
});
