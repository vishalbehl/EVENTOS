import { describe, expect, it } from "vitest";

import { assertFeatureControl, featureControlEndpoint } from "./feature-controls";

describe("feature control boundaries", () => {
  it("uses separate endpoints for release, experiment and operational controls", () => {
    expect(featureControlEndpoint("RELEASE")).toBe("/platform/release-flags");
    expect(featureControlEndpoint("EXPERIMENT")).toBe("/platform/experiments");
    expect(featureControlEndpoint("KILL_SWITCH")).toBe("/platform/kill-switches");
  });

  it("rejects entitlement records at the release-control boundary", () => {
    expect(() => assertFeatureControl({ feature_key: "WHITE_LABEL", activation_id: "a", snapshot_set_id: "s", enabled: true })).toThrow(/activation snapshots/i);
  });
});
