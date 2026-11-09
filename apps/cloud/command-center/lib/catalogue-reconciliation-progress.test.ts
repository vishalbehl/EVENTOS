import { expect, it } from "vitest";
import { catalogueCompletion } from "./catalogue-reconciliation-progress";

it("does not equate broker dispatch with page completion", () => {
  expect(catalogueCompletion({ status: "DISPATCHED", completion_status: "PENDING", streams_total: 5, streams_completed: 1 })).toBe("PENDING");
});
it("requires enumeration and all nonempty durable streams before success", () => {
  expect(catalogueCompletion({ status: "RUNNING", completion_status: "COMPLETED", streams_total: 2, streams_completed: 2 })).toBe("PENDING");
  expect(catalogueCompletion({ status: "DISPATCHED", completion_status: "COMPLETED", streams_total: 0, streams_completed: 0 })).toBe("PENDING");
  expect(catalogueCompletion({ status: "DISPATCHED", completion_status: "COMPLETED", streams_total: 2, streams_completed: 2 })).toBe("COMPLETED");
});
it("keeps legacy and failed runs explicit instead of synthesising completion", () => {
  expect(catalogueCompletion({ status: "DISPATCHED" })).toBe("LEGACY_UNTRACKED");
  expect(catalogueCompletion({ status: "DISPATCHED", completion_status: "LEGACY_UNTRACKED" })).toBe("LEGACY_UNTRACKED");
  expect(catalogueCompletion({ status: "DISPATCHED", completion_status: "FAILED" })).toBe("FAILED");
});
