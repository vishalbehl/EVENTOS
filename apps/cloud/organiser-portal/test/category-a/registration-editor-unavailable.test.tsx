import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import Page from "@/app/(dashboard)/events/[eventId]/registration/form-builder/page";

const state = vi.hoisted(() => ({
  templateId: "", config: vi.fn(), template: vi.fn(), save: vi.fn(), current: () => true,
}));
vi.mock("next/navigation", () => ({
  useParams: () => ({ eventId: "event" }), useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(state.templateId ? { templateId: state.templateId } : {}),
}));
vi.mock("@/hooks/useEvents", () => ({ useEvent: () => ({ data: { name: "Server event" } }) }));
vi.mock("@/hooks/useFormConfigSave", () => ({ useFormConfigSave: () => ({ save: state.save, pending: false, isCurrent: state.current }) }));
vi.mock("@/services/form-template-service", () => ({
  organiserFormService: { getEventFormConfig: state.config, getTemplate: state.template },
}));
vi.mock("@/components/organizer/events/ScopedEventEditor", () => ({
  ScopedEventEditor: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));
vi.mock("@eventos/form-builder-studio", () => ({
  FormBuilderStudio: ({ initialFields, initialSettings, onSave, onResetToDefault }: {
    initialFields: unknown[]; initialSettings: unknown; onSave: (value: unknown) => Promise<void>;
    onResetToDefault?: () => void;
  }) => <section aria-label="Server form editor">
    <p>Server fields: {initialFields.length}</p>
    <button onClick={() => void onSave({ fields: initialFields, settings: initialSettings, is_live: false })}>Save server form</button>
    {onResetToDefault ? <button onClick={onResetToDefault}>Reset server blueprint</button> : null}
  </section>,
}));

beforeEach(() => {
  state.templateId = "";
  state.config.mockReset().mockResolvedValue({ id: "config", event_id: "event", version: 4,
    is_live: false, fields: [], settings: {} });
  state.template.mockReset();
  state.save.mockReset().mockResolvedValue({ version: 5, template_id: "copy", is_live: false });
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

it.each([403, 404, 503])("never opens a substitute editor after a required source fails (%s)", async status => {
  state.templateId = "tpl_standard_registration";
  state.template.mockRejectedValue({ status, message: "private-response-must-not-render" });
  render(<Page />);
  await screen.findByRole("alert");
  expect(screen.queryByRole("region", { name: "Server form editor" })).toBeNull();
  expect(screen.queryByText("private-response-must-not-render")).toBeNull();
  expect(state.save).not.toHaveBeenCalled();
  expect(state.template).toHaveBeenCalledTimes(1);
  const signal = state.template.mock.calls[0][2] as AbortSignal;
  expect(signal).toBeInstanceOf(AbortSignal);
  cleanup();
  expect(signal.aborted).toBe(true);
});

it("shows an intentionally empty server form without a fabricated default or reset", async () => {
  render(<Page />);
  await screen.findByText("Server fields: 0");
  expect(screen.queryByRole("button", { name: "Reset server blueprint" })).toBeNull();
  expect(screen.getByText(/No original server blueprint is linked/)).toBeTruthy();
  expect(state.template).not.toHaveBeenCalled();
});

it("keeps a valid copy editable when its historical root is unavailable, without resetting from a fixture", async () => {
  state.config.mockResolvedValue({ id: "config", event_id: "event", version: 4,
    template_id: "copy", is_live: false, fields: [], settings: {} });
  state.template.mockResolvedValueOnce({ id: "copy", name: "Saved event form", category_key: "registration",
    scope_type: "EVENT", is_active: true, event_id: "event", fields: [],
    settings: { _event_id: "event", _source_template_id: "retired-root" } }).mockRejectedValueOnce({ status: 404 });
  render(<Page />);
  await screen.findByText(/Your current form can be edited, but reset is disabled/);
  expect(screen.queryByRole("button", { name: "Reset server blueprint" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Save server form" }));
  await waitFor(() => expect(state.save).toHaveBeenCalledTimes(1));
  expect(state.save).toHaveBeenCalledWith(4, expect.objectContaining({ template_id: "copy", fields: [] }));
});

it("binds the selected server blueprint when reset is saved, preserving its disabled features", async () => {
  state.templateId = "source";
  state.template.mockResolvedValue({ id: "source", name: "Server blueprint", category_key: "registration",
    scope_type: "GLOBAL", is_active: true, fields: [], settings: { enable_terms: false, enable_payment: false } });
  render(<Page />);
  fireEvent.click(await screen.findByRole("button", { name: "Reset server blueprint" }));
  await waitFor(() => expect(state.save).toHaveBeenCalledTimes(1));
  expect(state.save).toHaveBeenCalledWith(4, expect.objectContaining({ template_id: "source",
    settings: { enable_terms: false, enable_payment: false } }));
});

it("honours retry-after without automatically reading or replaying a mutation", async () => {
  vi.useFakeTimers();
  state.templateId = "source";
  state.template.mockRejectedValue({ status: 429, retryAfter: 2 });
  await act(async () => { render(<Page />); });
  const retry = screen.getByRole("button", { name: /Retry loading/ }) as HTMLButtonElement;
  expect(retry.disabled).toBe(true);
  act(() => { vi.advanceTimersByTime(2000); });
  expect(retry.disabled).toBe(false);
  expect(state.config).toHaveBeenCalledTimes(1);
  expect(state.save).not.toHaveBeenCalled();
  await act(async () => { fireEvent.click(retry); });
  expect(state.config).toHaveBeenCalledTimes(2);
});
