import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CrmAccountWorkspaceSheet } from "./CrmAccountWorkspaceSheet";

vi.mock("@/hooks/useCRM", async () => {
  const actual = await vi.importActual<typeof import("@/hooks/useCRM")>("@/hooks/useCRM");
  return {
    ...actual,
    useAccountWorkspace: () => ({
      data: {
        account: { id: "account-1", organization_id: "org-1", name: "Acme Events", created_at: "2026-07-15T10:00:00Z", updated_at: "2026-07-15T10:00:00Z", version: 1 },
        contacts: [{ id: "contact-1", account_id: "account-1", organization_id: "org-1", first_name: "Asha", last_name: "Patel", email: "asha@example.test", created_at: "2026-07-15T10:00:00Z", updated_at: "2026-07-15T10:00:00Z", version: 1 }],
        opportunities: [{ id: "opportunity-1", organization_id: "org-1", account_id: "account-1", name: "Annual conference", amount: 250000, created_at: "2026-07-15T10:00:00Z", updated_at: "2026-07-15T10:00:00Z", version: 1 }],
        activities: [{ id: "activity-1", organization_id: "org-1", entity_type: "account", entity_id: "account-1", activity_type: "MEETING", description: "Commercial review", occurred_at: "2026-07-15T10:00:00Z", created_at: "2026-07-15T10:00:00Z", updated_at: "2026-07-15T10:00:00Z", version: 1 }],
        tasks: [],
        notes: [],
        metrics: { contact_count: 1, active_opportunity_count: 1, pipeline_value: 250000, open_task_count: 0 },
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    }),
  };
});

describe("CrmAccountWorkspaceSheet", () => {
  it("renders authoritative account workspace data and bounded-read guidance", () => {
    render(
      <CrmAccountWorkspaceSheet
        account={{ id: "account-1", organization_id: "org-1", name: "Acme Events", created_at: "2026-07-15T10:00:00Z", updated_at: "2026-07-15T10:00:00Z", version: 1 }}
        scope={{ organizationId: "org-1", supportReason: "Investigating customer request", accessRequestId: "request-1" }}
        open
        onOpenChange={() => void 0}
      />,
    );

    expect(screen.getByRole("heading", { name: "Acme Events" })).toBeInTheDocument();
    expect(screen.getByText("Asha Patel")).toBeInTheDocument();
    expect(screen.getByText("Annual conference")).toBeInTheDocument();
    expect(screen.getByText("Commercial review")).toBeInTheDocument();
    expect(screen.getByText(/bounded to 100 records/i)).toBeInTheDocument();
  });
});
