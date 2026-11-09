// Component contracts only; capability/API doubles are not backend acceptance.
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CreateSessionDialog } from "@/components/organizer/sessions/CreateSessionDialog";
import { SessionQuickEditPanel } from "@/components/organizer/sessions/builder/SessionQuickEditPanel";
import { useSessionBuilderStore } from "@/store/useSessionBuilderStore";

const fixture = vi.hoisted(() => ({
  access: { enabled: false, loading: false, reason: "PERMISSION_DENIED" },
  limit: { enabled: true, loading: false, reason: null as string | null },
  rooms: [{ id: "room-a", name: "Main room" }],
  event: { timezone: "UTC", start_date: "2027-01-01" },
  post: vi.fn(), patch: vi.fn(), remove: vi.fn(), duplicate: vi.fn(), speaker: vi.fn(),
  invalidate: vi.fn(), error: vi.fn(),
}));

vi.mock("@/lib/capabilities", () => ({
  useOperationAccess: () => fixture.access,
  useLimitAccess: () => fixture.limit,
}));
vi.mock("@/hooks/useRooms", () => ({ useRooms: () => ({ data: fixture.rooms }) }));
vi.mock("@/hooks/useEvents", () => ({ useEvent: () => ({ data: fixture.event }) }));
vi.mock("@/hooks/useSessionBuilder", () => ({
  useDuplicateSession: () => ({ mutate: fixture.duplicate, isPending: false }),
  useRemoveSpeakerFromSession: () => ({ mutate: fixture.speaker }),
}));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ invalidateQueries: fixture.invalidate }) }));
vi.mock("@/lib/api-client", () => ({ apiPost: fixture.post, apiPatch: fixture.patch, apiDelete: fixture.remove }));
vi.mock("sonner", () => ({ toast: { error: fixture.error, success: vi.fn() } }));

beforeEach(() => {
  fixture.access = { enabled: false, loading: false, reason: "PERMISSION_DENIED" };
  fixture.limit = { enabled: true, loading: false, reason: null };
  fixture.post.mockResolvedValue({ id: "created" });
  useSessionBuilderStore.setState({
    isQuickEditOpen: true, selectedSessionId: "session-a", rooms: [],
    sessions: [{ id: "session-a", event_id: "event-a", name: "Existing session", session_code: "S1",
      session_type: "CONTENT", status: "draft", start_time: "2027-01-01T09:00:00Z",
      end_time: "2027-01-01T10:00:00Z", room_id: null, version: 4 }],
  });
});
afterEach(cleanup);

describe("Session action boundaries", () => {
  it.each(["loading", "denied", "quota"])("blocks creation for %s access, including direct form submit", async state => {
    fixture.access.enabled = state !== "denied";
    fixture.access.loading = state === "loading";
    fixture.limit.enabled = state !== "quota";
    fixture.limit.reason = state === "quota" ? "QUOTA_EXHAUSTED" : null;
    render(<CreateSessionDialog isOpen onClose={vi.fn()} eventId="event-a" />);
    const submit = await screen.findByRole("button", { name: "Create Session" });
    expect(submit).toBeDisabled();
    await waitFor(() => expect(screen.getByRole("status")).toBeVisible());
    fireEvent.submit(submit.closest("form")!);
    expect(fixture.post).not.toHaveBeenCalled();
  });

  it("preserves entered values when access is revoked and rechecks the submit handler", async () => {
    fixture.access.enabled = true;
    const props = { isOpen: true, onClose: vi.fn(), eventId: "event-a" };
    const view = render(<CreateSessionDialog {...props} />);
    const name = await screen.findByPlaceholderText("e.g. Opening Keynote & Welcome");
    fireEvent.change(name, { target: { value: "Keep this draft" } });
    fixture.access = { enabled: false, loading: false, reason: "SUSPENDED" };
    view.rerender(<CreateSessionDialog {...props} />);
    expect(name).toHaveValue("Keep this draft");
    const submit = screen.getByRole("button", { name: "Create Session" });
    expect(submit).toBeDisabled();
    fireEvent.submit(submit.closest("form")!);
    expect(fixture.post).not.toHaveBeenCalled();
  });

  it("allows an admitted create request", async () => {
    fixture.access.enabled = true;
    render(<CreateSessionDialog isOpen onClose={vi.fn()} eventId="event-a" />);
    fireEvent.change(await screen.findByPlaceholderText("e.g. Opening Keynote & Welcome"), { target: { value: "Admitted session" } });
    const submit = screen.getByRole("button", { name: "Create Session" });
    expect(submit).toBeEnabled();
    fireEvent.submit(submit.closest("form")!);
    await waitFor(() => expect(fixture.post).toHaveBeenCalledWith("/events/event-a/sessions",
      expect.objectContaining({ name: "Admitted session", room_id: "room-a" })));
  });

  it("disables quick-edit writes for a read-only user", () => {
    render(<SessionQuickEditPanel eventId="event-a" />);
    for (const name of ["Delete", "Duplicate", "Save Changes"]) {
      const action = screen.getByRole("button", { name });
      expect(action).toBeDisabled();
      fireEvent.click(action);
    }
    expect(fixture.patch).not.toHaveBeenCalled();
    expect(fixture.remove).not.toHaveBeenCalled();
    expect(fixture.duplicate).not.toHaveBeenCalled();
  });
});
