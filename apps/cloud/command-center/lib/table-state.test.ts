import { describe, expect, it } from "vitest";

import { parseTableUrlState, resetCursor, serializeTableUrlState } from "./table-state";

describe("table URL state", () => {
  it("round-trips cursor, sorting and filters deterministically", () => {
    const state = parseTableUrlState(new URLSearchParams("status=active&page_size=50&direction=desc&sort=created_at&cursor=abc"));
    expect(state).toEqual({
      cursor: "abc",
      search: undefined,
      sort: "created_at",
      direction: "desc",
      pageSize: 50,
      filters: { status: "active" },
    });
    expect(serializeTableUrlState(state).toString()).toBe("cursor=abc&sort=created_at&direction=desc&page_size=50&status=active");
  });

  it("drops the cursor whenever filters change", () => {
    expect(resetCursor({ cursor: "old", pageSize: 25, filters: {} }, { filters: { status: "failed" } }).cursor).toBeUndefined();
  });
});
