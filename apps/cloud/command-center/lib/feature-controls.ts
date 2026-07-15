export const FEATURE_CONTROL_KINDS = ["RELEASE", "EXPERIMENT", "KILL_SWITCH"] as const;
export type FeatureControlKind = (typeof FEATURE_CONTROL_KINDS)[number];

export interface FeatureControl {
  key: string;
  kind: FeatureControlKind;
  enabled: boolean;
  environment: string;
  rollout_percentage?: number;
  expires_at?: string | null;
}

export interface TenantEntitlementReference {
  feature_key: string;
  activation_id: string;
  snapshot_set_id: string;
  enabled: boolean;
}

export function featureControlEndpoint(kind: FeatureControlKind) {
  return kind === "RELEASE"
    ? "/platform/release-flags"
    : kind === "EXPERIMENT"
      ? "/platform/experiments"
      : "/platform/kill-switches";
}

export function assertFeatureControl(value: FeatureControl | TenantEntitlementReference): asserts value is FeatureControl {
  if (!("kind" in value) || !FEATURE_CONTROL_KINDS.includes(value.kind)) {
    throw new Error("Tenant entitlements must be resolved through billing activation snapshots, not feature controls.");
  }
}
