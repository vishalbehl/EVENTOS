import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AbstractEvaluationView } from "@/components/organizer/abstracts/AbstractEvaluationView";

const fixture = vi.hoisted(() => ({ plans: [] as any[], save: vi.fn(), create: vi.fn() }));
vi.mock("next/navigation", () => ({ useParams: () => ({ eventId: "fixture-event" }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/components/organizer/events/ScopedEventEditor", () => ({ ScopedEventEditor: ({ children }: any) => children }));
vi.mock("@/components/organizer/abstracts/AbstractShell", () => ({
  AbstractShell: ({ actions, children }: any) => <main>{actions}{children}</main>, EmptyState: () => null,
}));
vi.mock("@/hooks/useAbstractWorkflow", () => ({
  useAbstractEvaluationPlans: () => ({ data: fixture.plans, refetch: async () => ({ data: fixture.plans }) }),
  useAbstractSubmissions: () => ({ data: { items: [] } }),
  useAbstractReviewers: () => ({ data: [] }), useAbstractSetup: () => ({ data: { topics: [] } }),
  useCreateAbstractEvaluationPlan: () => ({ mutateAsync: fixture.create, isPending: false }),
  useUpdateAbstractEvaluationPlan: () => ({ mutateAsync: fixture.save, isPending: false }),
  useApplyAbstractEvaluationPlan: () => ({ mutateAsync: vi.fn(), isPending: false, continuation: null }),
}));
afterEach(() => cleanup());

it("keeps an unsaved plan on its loaded version, and does not carry filters into another or a new plan", async () => {
  fixture.save.mockImplementation(async plan => ({ ...plan, version: plan.version + 1 }));
  fixture.create.mockImplementation(async plan => ({ ...plan, id: "created", version: 1 }));
  fixture.plans = [
    { id: "first", version: 1, name: "First saved plan", source_type: "ABSTRACT", status: "DRAFT", rubric: [],
      reviewer_ids: [], anonymous_review: true, due_at: null, scope_filter: {
        instructions: "First plan only", status_filter: [], category_filter: "Architecture",
        assignments_per_submission: 7, comment_requirement: "MANDATORY", evaluator_scope: "ALL" } },
    { id: "second", version: 3, name: "Second saved plan", source_type: "ABSTRACT", status: "DRAFT", rubric: [],
      reviewer_ids: [], anonymous_review: true, due_at: null, scope_filter: {} },
  ];
  const view = render(<AbstractEvaluationView />);
  fireEvent.change(screen.getByRole("combobox", { name: "Evaluation plan" }), { target: { value: "first" } });
  const name = await screen.findByDisplayValue("First saved plan");
  fireEvent.change(name, { target: { value: "Unsaved first draft" } });
  fixture.plans = [{ ...fixture.plans[0], version: 9, name: "Concurrent server update" }, fixture.plans[1]];
  view.rerender(<AbstractEvaluationView />);
  expect(screen.queryByDisplayValue("Unsaved first draft")).toBeTruthy();
  fireEvent.click(screen.getAllByRole("button", { name: "Save evaluation plan" })[0]);
  await waitFor(() => expect(fixture.save).toHaveBeenCalledTimes(1));
  expect(fixture.save.mock.calls[0][0]).toMatchObject({ version: 1, name: "Unsaved first draft",
    scope_filter: { status_filter: [], evaluator_scope: "ALL", assignments_per_submission: 7 } });
  fireEvent.change(screen.getByRole("combobox", { name: "Evaluation plan" }), { target: { value: "second" } });
  await screen.findByDisplayValue("Second saved plan");
  fireEvent.click(screen.getAllByRole("button", { name: "Save evaluation plan" })[0]);
  await waitFor(() => expect(fixture.save).toHaveBeenCalledTimes(2));
  expect(fixture.save.mock.calls[1][0]).toMatchObject({ version: 3, scope_filter: {
    status_filter: ["SUBMITTED", "UNDER_REVIEW", "NOMINATED"], category_filter: "ALL",
    assignments_per_submission: 2, comment_requirement: "OPTIONAL", evaluator_scope: "ASSIGNED" } });
  expect(fixture.save.mock.calls[1][0].scope_filter.instructions).not.toBe("First plan only");
  fireEvent.change(screen.getByRole("combobox", { name: "Evaluation plan" }), { target: { value: "first" } });
  await screen.findByDisplayValue("Concurrent server update");
  fireEvent.change(screen.getByRole("combobox", { name: "Evaluation plan" }), { target: { value: "new" } });
  fireEvent.click(screen.getAllByRole("button", { name: "Create evaluation plan" })[0]);
  await waitFor(() => expect(fixture.create).toHaveBeenCalledTimes(1));
  expect(fixture.create.mock.calls[0][0].scope_filter).toMatchObject({
    status_filter: ["SUBMITTED", "UNDER_REVIEW", "NOMINATED"], category_filter: "ALL",
    assignments_per_submission: 2, comment_requirement: "OPTIONAL" });
});
