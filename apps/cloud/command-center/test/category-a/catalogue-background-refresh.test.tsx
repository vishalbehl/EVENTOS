import React from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useAuthStore, type User } from "@/store/use-auth-store";
import CataloguePage from "@/app/(command-center)/(developer-console)/applications/templates/form/page";

const doubles = vi.hoisted(() => ({
  service: {
    listCategoryPage: vi.fn(), listTemplatePage: vi.fn(), listBlockedReconciliations: vi.fn(),
    listBlockedAggregateReconciliations: vi.fn(), listBlockedCategoryReconciliations: vi.fn(),
  },
  command: { isCurrent: () => true, pending: false, failure: null, execute: vi.fn() },
}));
vi.mock("@/services/form-template-service", () => ({ platformFormService: doubles.service }));
vi.mock("@/hooks/useCatalogueCommand", () => ({ useCatalogueCommand: () => doubles.command }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@eventos/form-builder-studio", () => ({ FormTemplateGallery: ({ templates, categories }: any) => <div>
  <span>Gallery</span><output aria-label="Loaded templates">{templates.length}</output>
  <output aria-label="Loaded categories">{categories.length}</output>
</div> }));
vi.mock("@/components/super-admin/ui/PageContainer", () => ({ PageContainer: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));

const empty = { items: [], has_next: false, next_cursor: null };
beforeEach(() => {
  useAuthStore.getState().setAuth({ id: "reviewer", organization_id: "test-platform", role: "super_admin",
    email: "reviewer@example.test", first_name: "Test", last_name: "Reviewer" } as User, "fixture-access");
  doubles.service.listCategoryPage.mockResolvedValue(empty);
  doubles.service.listTemplatePage.mockRejectedValue(new Error("Historical documents require review"));
  doubles.service.listBlockedAggregateReconciliations.mockResolvedValue(empty);
  doubles.service.listBlockedCategoryReconciliations.mockResolvedValue(empty);
  doubles.service.listBlockedReconciliations.mockResolvedValue({ ...empty, items: ["first", "second"].map(id => ({
    template_id: id, reconciliation_id: `issue-${id}`, template_name: `${id} blueprint`, template_version: 1,
    reason: "Review required", status: "BLOCKED",
  })) });
});

it("keeps other blocked blueprints visible during a slow background refresh after repair", async () => {
  vi.spyOn(window, "confirm").mockReturnValue(true);
  doubles.command.execute.mockResolvedValue({ template_id: "first", previous_version: 1, version: 2, status: "REPAIRED" });
  render(<CataloguePage />);
  await screen.findByText("second blueprint");
  let finish!: (page: typeof empty) => void;
  doubles.service.listCategoryPage.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  fireEvent.click(screen.getAllByRole("button", { name: "Replace with safe empty blueprint" })[0]);
  await waitFor(() => expect(doubles.service.listCategoryPage).toHaveBeenCalledTimes(2));
  expect(screen.getByText("second blueprint")).toBeVisible();
  expect(screen.queryByText("first blueprint")).not.toBeInTheDocument();
  await act(async () => { finish(empty); });
  expect(await screen.findByText("second blueprint")).toBeVisible();
});

it("requires an explicit rubric proposal and preserves it when recorded scores prevent correction", async () => {
  const issue = { reconciliation_id: "rubric-issue", organization_id: "client-org", event_id: "client-event",
    resource_type: "PROGRAMME_RUBRIC", resource_id: "evaluation-plan", resource_version: 7,
    reason: "Reviewed scoring correction required", created_at: "2026-10-22T00:00:00Z", current_document: null };
  doubles.service.listBlockedAggregateReconciliations.mockImplementation(async (type: string) =>
    type === "PROGRAMME_RUBRIC" ? { ...empty, items: [issue] } : empty);
  doubles.command.execute.mockRejectedValueOnce(new Error("Submitted scores exist. Their scoring definitions cannot be rewritten."));
  render(<CataloguePage />);
  fireEvent.click(await screen.findByRole("button", { name: "Review rubric correction" }));
  expect(screen.getByLabelText("Corrected rubric JSON")).toHaveValue("");
  expect(screen.queryByRole("button", { name: "Replace with safe empty document" })).not.toBeInTheDocument();
  const document = JSON.stringify({ rubric: [{ key: "quality", label: "Quality", max: 10, weight: 100 }] });
  fireEvent.change(screen.getByLabelText("Corrected rubric JSON"), { target: { value: document } });
  fireEvent.change(screen.getByLabelText("Review reason"), { target: { value: "Reviewed scoring proposal" } });
  fireEvent.submit(screen.getByRole("form", { name: "Reviewed rubric correction" }));
  expect(await within(screen.getByRole("form", { name: "Reviewed rubric correction" })).findByRole("alert"))
    .toHaveTextContent("Submitted scores exist");
  expect(screen.getByLabelText("Corrected rubric JSON")).toHaveValue(document);
  expect(screen.getByLabelText("Review reason")).toHaveValue("Reviewed scoring proposal");
  expect(doubles.command.execute).toHaveBeenLastCalledWith("post",
    "/platform/forms/templates/reconciliations/aggregates/PROGRAMME_RUBRIC/evaluation-plan/repair",
    { document: JSON.parse(document), reason: "Reviewed scoring proposal" }, 7);
});

it("loads more blocked rubrics only when requested", async () => {
  const issue = { reconciliation_id: "rubric-page-one", organization_id: "client-org", event_id: "client-event",
    resource_type: "PROGRAMME_RUBRIC", resource_id: "plan-one", resource_version: 1,
    reason: "First rubric review", created_at: "2026-10-22T00:00:00Z" };
  doubles.service.listBlockedAggregateReconciliations.mockImplementation(async (type: string, options: { cursor?: string }) =>
    type === "PROGRAMME_RUBRIC" ? options.cursor
      ? { ...empty, items: [issue, ...[0, 1].map(() => ({ ...issue,
          reconciliation_id: "rubric-page-two", resource_id: "plan-two", reason: "Second rubric review" }))] }
      : { items: [issue], has_next: true, next_cursor: "rubric-next" } : empty);
  render(<CataloguePage />);
  await screen.findByText(/First rubric review/);
  expect(doubles.service.listBlockedAggregateReconciliations).not.toHaveBeenCalledWith("PROGRAMME_RUBRIC", { page_size: 100, cursor: "rubric-next" });
  fireEvent.click(screen.getByRole("button", { name: "Load more blocked evaluation rubrics" }));
  await screen.findByText(/Second rubric review/);
  expect(screen.getAllByText(/First rubric review/)).toHaveLength(1);
  expect(screen.getAllByText(/Second rubric review/)).toHaveLength(1);
  expect(doubles.service.listBlockedAggregateReconciliations).toHaveBeenCalledWith(
    "PROGRAMME_RUBRIC", { page_size: 100, cursor: "rubric-next" }, expect.any(AbortSignal));
  expect(screen.queryByRole("button", { name: "Load more blocked evaluation rubrics" })).not.toBeInTheDocument();
});

it("loads category 101 only after an explicit request and collapses duplicate rows", async () => {
  const first = Array.from({ length: 100 }, (_, index) => ({ id: `category-${index}`, name: `Category ${index}` }));
  doubles.service.listTemplatePage.mockResolvedValue(empty);
  doubles.service.listCategoryPage
    .mockResolvedValueOnce({ items: first, has_next: true, next_cursor: "category-next" })
    .mockResolvedValueOnce({ items: [first[99], { id: "category-100", name: "Category 100" },
      { id: "category-100", name: "Duplicate" }], has_next: false, next_cursor: null });
  render(<CataloguePage />);
  await waitFor(() => expect(screen.getByLabelText("Loaded categories")).toHaveTextContent("100"));
  expect(doubles.service.listCategoryPage).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Load more categories" }));
  await waitFor(() => expect(screen.getByLabelText("Loaded categories")).toHaveTextContent("101"));
  expect(doubles.service.listCategoryPage).toHaveBeenCalledTimes(2);
  expect(doubles.service.listCategoryPage).toHaveBeenLastCalledWith(
    { page_size: 100, cursor: "category-next" }, expect.any(AbortSignal));
});
