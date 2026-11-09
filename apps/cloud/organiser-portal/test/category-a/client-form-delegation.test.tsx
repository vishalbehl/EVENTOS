import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ClientRelationships } from "@/components/organizer/workspace/access/ClientRelationships";

const state = vi.hoisted(() => ({
  page: {} as Record<string, unknown>,
  post: vi.fn(),
  invalidate: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: { queryKey: string[] }) => options.queryKey[0] === "client-relationships"
    ? { data: state.page, isFetching: false, error: null, refetch: vi.fn() }
    : { data: null, isFetching: false, error: null },
  useQueryClient: () => ({ invalidateQueries: state.invalidate }),
}));
vi.mock("@/lib/api-client", () => ({ apiGet: vi.fn(), apiPost: state.post }));
vi.mock("@/store/use-auth-store", () => ({
  useAuthStore: (select: (value: { user: { id: string } }) => unknown) => select({ user: { id: "operator" } }),
}));
vi.mock("@/components/organizer/workspace/OrganiserPrimitives", () => ({
  Panel: ({ title, children }: { title: string; children: React.ReactNode }) => <section aria-label={title}>{children}</section>,
}));

beforeEach(() => {
  state.page = { organization_kind: "EMC", role: "owner", items: [], next_cursor: null,
    grantable_actions: ["REG_CONFIG:FORM"] };
  state.post.mockReset().mockResolvedValue({ id: "new-request" });
});
afterEach(cleanup);

it("requires an explicit checkbox selection and sends the canonical scoped action", async () => {
  render(<ClientRelationships organizationId="emc" />);
  fireEvent.click(screen.getByRole("button", { name: "Add staff scope" }));
  const checkbox = screen.getByRole("checkbox", { name: "Manage event forms (registration, survey and speaker intake)" }) as HTMLInputElement;
  expect(checkbox.checked).toBe(false);
  expect(state.post).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("Reason for request or change"), { target: { value: "Client requested scoped form support" } });
  fireEvent.change(screen.getByLabelText("Client organisation ID"), { target: { value: "client-id" } });
  fireEvent.change(screen.getByLabelText("EMC member ID"), { target: { value: "member-id" } });
  fireEvent.change(screen.getByLabelText("Client operational workspace ID"), { target: { value: "workspace-id" } });
  fireEvent.change(screen.getByLabelText("Client event ID (optional)"), { target: { value: "event-id" } });
  expect((screen.getByRole("button", { name: "Request client approval" }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(checkbox);
  fireEvent.click(screen.getByRole("button", { name: "Request client approval" }));
  await waitFor(() => expect(state.post).toHaveBeenCalledTimes(1));
  expect(state.post.mock.calls[0][1].scopes).toEqual([{ member_id: "member-id", workspace_id: "workspace-id",
    event_id: "event-id", actions: ["REG_CONFIG:FORM"] }]);
  expect(state.post.mock.calls[0][2].headers["Idempotency-Key"]).toBeTruthy();
  await screen.findByText("Request saved. Client-owner approval is required before access becomes active.");
});

it("shows the same understandable action to the approving client", () => {
  state.page = { organization_kind: "CLIENT", role: "owner", grantable_actions: [], next_cursor: null,
    items: [{ id: "request", status: "REQUESTED", version: 1, emc_organization_id: "emc",
      scopes: [{ workspace_id: "workspace", event_id: "event", actions: ["REG_CONFIG:FORM"] }],
      available_actions: ["accept", "reject"] }] };
  render(<ClientRelationships organizationId="client" />);
  expect(screen.getByText(/Manage event forms \(registration, survey and speaker intake\)/)).toBeTruthy();
  expect(state.post).not.toHaveBeenCalled();
});

it("does not offer form management when the server does not list it as grantable", () => {
  state.page.grantable_actions = ["EVENTS:VIEW"];
  render(<ClientRelationships organizationId="emc" />);
  fireEvent.click(screen.getByRole("button", { name: "Add staff scope" }));
  expect(screen.queryByRole("checkbox", { name: /Manage event forms/ })).toBeNull();
});
