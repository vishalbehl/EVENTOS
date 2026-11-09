import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import SpeakerWorkspace from "@/app/[eventId]/speaker/[token]/page";

const state = vi.hoisted(() => ({
  params: { eventId: "first-event", token: "first-test-capability" },
  portal: {} as Record<string, unknown>, error: null as unknown,
  refetch: vi.fn(), post: vi.fn(), patch: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useParams: () => state.params, useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/hooks/usePortal", () => ({ usePortalAuth: () => ({ data: state.portal,
  isLoading: false, isFetching: false, error: state.error, refetch: state.refetch }) }));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
vi.mock("@/lib/api-client", () => ({ apiClient: { post: state.post, patch: state.patch } }));
vi.mock("@/components/DeadlineBanner", () => ({ DeadlineBanner: () => null }));
vi.mock("@/components/ImageCropper", () => ({ ImageCropper: () => null }));
vi.mock("@/components/AbstractEditor", () => ({ AbstractEditor: () => null }));
vi.mock("@/components/TermsModal", () => ({ TermsModal: () => null }));

afterEach(() => cleanup());
function profile() {
  fireEvent.mouseDown(screen.getByRole("tab", { name: "Speaker Bio & Photo" }), { button: 0, ctrlKey: false });
  return screen.findByPlaceholderText(/Share a brief overview/);
}

it("retains unsaved biography through an unavailable response and explicit read retry, but not an identity switch", async () => {
  state.portal = { speaker_id: "first-speaker", event_id: "first-event", event_name: "Fixture event",
    first_name: "First", last_name: "Speaker", email: "first@example.test", bio: "server biography",
    talks: [], posters: [], announcements: [], upload_deadline: null, allow_override: false,
    allowed_formats: [], max_file_size_mb: 10, profile_completeness: 0, branding_settings: {},
    abstract_submission_enabled: false };
  state.error = null;
  const view = render(<SpeakerWorkspace />);
  const biography = await profile();
  await waitFor(() => expect((biography as HTMLTextAreaElement).value).toBe("server biography"));
  fireEvent.change(biography, { target: { value: "unsaved speaker draft" } });
  state.error = { response: { status: 503 } };
  view.rerender(<SpeakerWorkspace />);
  expect(screen.getByText("Speaker workspace temporarily unavailable")).toBeTruthy();
  expect(screen.queryByText("Invalid or expired speaker link")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(state.refetch).toHaveBeenCalledTimes(1);
  expect(state.post).not.toHaveBeenCalled();
  expect(state.patch).not.toHaveBeenCalled();
  state.error = null;
  state.portal = { ...state.portal, bio: "new server value must not erase the draft" };
  view.rerender(<SpeakerWorkspace />);
  await waitFor(() => expect((screen.getByPlaceholderText(/Share a brief overview/) as HTMLTextAreaElement).value)
    .toBe("unsaved speaker draft"));
  state.params = { eventId: "second-event", token: "second-test-capability" };
  state.portal = { ...state.portal, speaker_id: "second-speaker", event_id: "second-event", bio: "second identity biography" };
  view.rerender(<SpeakerWorkspace />);
  const secondBiography = await profile();
  await waitFor(() => expect((secondBiography as HTMLTextAreaElement).value).toBe("second identity biography"));
  expect(screen.queryByDisplayValue("unsaved speaker draft")).toBeNull();
});
