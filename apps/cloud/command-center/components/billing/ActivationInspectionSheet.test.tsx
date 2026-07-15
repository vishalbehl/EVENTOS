import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ActivationInspectionSheet } from "./ActivationInspectionSheet";


vi.mock("@/hooks/useBilling", () => ({
  useActivationInspection: () => ({
    isLoading: false,
    isError: false,
    data: {
      activation: {
        id: "11111111-1111-1111-1111-111111111111",
        organization_id: "22222222-2222-2222-2222-222222222222",
        event_id: "33333333-3333-3333-3333-333333333333",
        subscription_id: "44444444-4444-4444-4444-444444444444",
        grant_id: "55555555-5555-5555-5555-555555555555",
        grant_consumption_id: "66666666-6666-6666-6666-666666666666",
        status: "ACTIVE",
        activation_policy: "SNAPSHOT_REFRESHABLE",
        current_snapshot_set_id: "77777777-7777-7777-7777-777777777777",
        activated_at: "2026-07-14T10:00:00Z",
        created_at: "2026-07-14T10:00:00Z",
        updated_at: "2026-07-14T10:00:00Z",
      },
      event_name: "Enterprise Conference",
      plan_name: "Enterprise Annual",
      current_snapshot: {
        id: "77777777-7777-7777-7777-777777777777",
        version: 2,
        resolution_reason: "CONTRACT_AMENDMENT",
        resolver_version: "v4",
        policy_type: "SNAPSHOT_REFRESHABLE",
        checksum: "abc123checksum",
        created_at: "2026-07-14T11:00:00Z",
        is_current: true,
      },
      snapshot_history: [{
        id: "77777777-7777-7777-7777-777777777777",
        version: 2,
        resolution_reason: "CONTRACT_AMENDMENT",
        resolver_version: "v4",
        policy_type: "SNAPSHOT_REFRESHABLE",
        checksum: "abc123checksum",
        created_at: "2026-07-14T11:00:00Z",
        is_current: true,
      }],
      features: [{
        feature_key: "abstract_review",
        enabled: false,
        scope_type: "EVENT_SCOPED",
        source_type: "PLAN",
        denial_reason: "Disabled by plan",
      }],
      limits: [{
        limit_key: "max_registrations",
        limit_value: 150,
        usage_value: 42,
        remaining_value: 108,
        usage_strategy: "LIVE_COUNT",
        scope_type: "EVENT_SCOPED",
        source_type: "PLAN",
      }],
      usage: { max_registrations: 42 },
      transfer_eligibility: { action: "LOCK_TRANSFER", decisions: [] },
    },
  }),
  useSnapshotRefreshMutation: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useDeactivateActivationMutation: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useTransferActivationMutation: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useGrantConsumptions: () => ({ data: undefined, isLoading: false, hasNextPage: false }),
}));

vi.mock("@/services/super-admin-service", () => ({
  useOrgEvents: () => ({ data: [] }),
}));


describe("ActivationInspectionSheet", () => {
  it("shows the authoritative snapshot, usage headroom, denial, and ledger binding", () => {
    render(
      <ActivationInspectionSheet
        activationId="11111111-1111-1111-1111-111111111111"
        onOpenChange={vi.fn()}
        scope={{
          organizationId: "22222222-2222-2222-2222-222222222222",
          supportReason: "Approved support entitlement inspection",
          accessRequestId: "SUP-100",
        }}
      />,
    );

    expect(screen.getByText("Enterprise Conference")).toBeInTheDocument();
    expect(screen.getAllByText("v2").length).toBeGreaterThan(0);
    expect(screen.getByText("max_registrations")).toBeInTheDocument();
    expect(screen.getByText("42 / 150")).toBeInTheDocument();
    expect(screen.getByText("108 remaining")).toBeInTheDocument();
    expect(screen.getByText("abstract_review")).toBeInTheDocument();
    expect(screen.getByText("Disabled by plan")).toBeInTheDocument();
    expect(screen.getByText("LOCK_TRANSFER")).toBeInTheDocument();
  });
});
