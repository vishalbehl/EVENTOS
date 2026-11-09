import React from "react";
import { fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  execute: vi.fn(), isCurrent: () => true, user: { id: "reviewer", organization_id: "platform" },
  repaired: { template_id: "source-proof", previous_version: 7, version: 8, status: "REPAIRED" },
  categoryAvailable: true, extraIssue: false,
  issue: { reconciliation_id: "blocked-proof", template_id: "source-proof", template_name: "Blocked proof",
    template_version: 7, reason: "Stored blueprint requires a reviewed correction.", created_at: "2026-10-17" },
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));
vi.mock("@eventos/form-builder-studio", () => ({ FormTemplateGallery: () => null }));
vi.mock("@/components/super-admin/ui/PageContainer", () => ({ PageContainer: ({ children }: React.PropsWithChildren) => <div>{children}</div> }));
vi.mock("@/store/use-auth-store", () => ({ useAuthStore: () => ({ isAuthenticated: true, user: mocks.user }) }));
vi.mock("@/hooks/useCatalogueCommand", () => ({ useCatalogueCommand: () => ({
  execute: mocks.execute, isCurrent: mocks.isCurrent, pending: false, failure: null,
}) }));
vi.mock("@/services/form-template-service", () => ({ platformFormService: {
  listCategoryPage: async () => ({ items: mocks.categoryAvailable ? [{ id: "replacement-proof", name: "Reviewed category", is_active: true }] : [], has_next: false }),
  listTemplatePage: async () => ({ items: [], has_next: false }),
  listBlockedReconciliations: async () => ({ items: [{ ...mocks.issue }, ...(mocks.extraIssue
    ? [{ ...mocks.issue, reconciliation_id: "other-issue", template_id: "other-source", template_name: "Other proof" }] : [])], has_next: false }),
  listBlockedAggregateReconciliations: async () => ({ items: [], has_next: false }),
  listBlockedCategoryReconciliations: async () => ({ items: [], has_next: false }),
} }));
import Page from "../app/(command-center)/(developer-console)/applications/templates/form/page";

afterEach(cleanup);
beforeEach(() => { mocks.user = { id: "reviewer", organization_id: "platform" }; mocks.issue.template_version = 7;
  mocks.categoryAvailable = true; mocks.extraIssue = false; });

async function openCorrection() {
  render(<Page />);
  fireEvent.click(await screen.findByRole("button", { name: "Review blueprint correction" }));
  return screen.getByRole("form", { name: "Reviewed blueprint correction" });
}

describe("reviewed blueprint category correction", () => {
  it("preserves a selected category when a background refresh replaces its loaded page", async () => {
    mocks.extraIssue = true;
    render(<Page />);
    const buttons = await screen.findAllByRole("button", { name: "Review blueprint correction" });
    fireEvent.click(buttons[0]);
    fireEvent.change(screen.getByLabelText("Reviewed replacement category"), { target: { value: "replacement-proof" } });
    fireEvent.change(screen.getByLabelText("Review reason"), { target: { value: "Retain this reviewed draft during refresh" } });
    mocks.categoryAvailable = false;
    mocks.execute.mockResolvedValueOnce({ template_id: "other-source", previous_version: 7, version: 8, status: "REPAIRED" });
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(true);
    try {
      fireEvent.click(screen.getAllByRole("button", { name: "Replace with safe empty blueprint" })[1]);
      await screen.findByRole("option", { name: /previously selected; rechecked on save/ });
      expect(screen.getByLabelText("Reviewed replacement category")).toHaveValue("replacement-proof");
      expect(screen.getByLabelText("Review reason")).toHaveValue("Retain this reviewed draft during refresh");
    } finally { confirm.mockRestore(); }
  });

  it("sends the loaded version, selected category and reviewed document; keeps a failed draft", async () => {
    mocks.execute.mockRejectedValueOnce(new Error("Temporarily unavailable")).mockResolvedValueOnce(mocks.repaired);
    await openCorrection();
    fireEvent.change(screen.getByLabelText("Reviewed replacement category"), { target: { value: "replacement-proof" } });
    const document = '{"fields":[],"settings":{"submit_button_text":"Apply"}}';
    fireEvent.change(screen.getByLabelText("Reviewed document JSON"), { target: { value: document } });
    fireEvent.change(screen.getByLabelText("Review reason"), { target: { value: "Approved taxonomy correction" } });
    fireEvent.click(screen.getByRole("button", { name: "Commit reviewed blueprint correction" }));
    await waitFor(() => expect(mocks.execute).toHaveBeenCalledTimes(1));
    expect(screen.getByLabelText("Reviewed document JSON")).toHaveValue(document);
    expect(screen.getByLabelText("Review reason")).toHaveValue("Approved taxonomy correction");
    fireEvent.click(screen.getByRole("button", { name: "Commit reviewed blueprint correction" }));
    await waitFor(() => expect(screen.queryByRole("form", { name: "Reviewed blueprint correction" })).not.toBeInTheDocument());
    expect(mocks.execute).toHaveBeenLastCalledWith("post", "/platform/forms/templates/source-proof/reconcile", {
      document: JSON.parse(document), reason: "Approved taxonomy correction", replacement_category_id: "replacement-proof",
    }, 7);
  });

  it("refuses malformed reviewed JSON without issuing a mutation", async () => {
    await openCorrection();
    fireEvent.change(screen.getByLabelText("Reviewed document JSON"), { target: { value: "not json" } });
    fireEvent.change(screen.getByLabelText("Review reason"), { target: { value: "Approved review reason" } });
    fireEvent.click(screen.getByRole("button", { name: "Commit reviewed blueprint correction" }));
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Reviewed document JSON")).toHaveValue("not json");
  });

  it("requires explicit invalid-lineage confirmation and retains it after an error", async () => {
    mocks.execute.mockRejectedValueOnce(new Error("Temporarily unavailable")).mockResolvedValueOnce(mocks.repaired);
    await openCorrection();
    const checkbox = screen.getByRole("checkbox", { name: /Detach invalid historical source link/ });
    expect(checkbox).not.toBeChecked();
    fireEvent.click(checkbox);
    fireEvent.change(screen.getByLabelText("Review reason"), { target: { value: "Reviewed invalid historical source link" } });
    fireEvent.click(screen.getByRole("button", { name: "Commit reviewed blueprint correction" }));
    await waitFor(() => expect(mocks.execute).toHaveBeenCalledTimes(1));
    expect(checkbox).toBeChecked();
    expect(mocks.execute).toHaveBeenLastCalledWith("post", "/platform/forms/templates/source-proof/reconcile", {
      document: { fields: [], settings: {} }, reason: "Reviewed invalid historical source link", detach_invalid_source_lineage: true,
    }, 7);
    fireEvent.click(screen.getByRole("button", { name: "Commit reviewed blueprint correction" }));
    await waitFor(() => expect(screen.queryByRole("form", { name: "Reviewed blueprint correction" })).not.toBeInTheDocument());
  });

  it("drops the correction draft when identity context changes", async () => {
    const view = render(<Page />);
    fireEvent.click(await screen.findByRole("button", { name: "Review blueprint correction" }));
    fireEvent.change(screen.getByLabelText("Review reason"), { target: { value: "Private reviewer draft" } });
    mocks.user = { id: "another-reviewer", organization_id: "another-platform" };
    view.rerender(<Page />);
    await screen.findByRole("button", { name: "Review blueprint correction" });
    expect(screen.queryByRole("form", { name: "Reviewed blueprint correction" })).not.toBeInTheDocument();
  });

  it("does not restore an old blocked version from a refresh after confirmed repair", async () => {
    mocks.execute.mockResolvedValueOnce(mocks.repaired);
    await openCorrection();
    fireEvent.change(screen.getByLabelText("Review reason"), { target: { value: "Reviewed authoritative correction" } });
    fireEvent.click(screen.getByRole("button", { name: "Commit reviewed blueprint correction" }));
    await waitFor(() => expect(screen.queryByRole("form", { name: "Reviewed blueprint correction" })).not.toBeInTheDocument());
    // The explicit service double returns the same old v7 issue on refresh.
    // A matching committed v8 response must prevent it from reappearing.
    await waitFor(() => expect(screen.queryByRole("button", { name: "Review blueprint correction" })).not.toBeInTheDocument());
  });

  it("keeps the draft when a successful HTTP result identifies a different record", async () => {
    mocks.execute.mockResolvedValueOnce({ ...mocks.repaired, template_id: "another-record" });
    await openCorrection();
    fireEvent.change(screen.getByLabelText("Review reason"), { target: { value: "Reviewed response identity validation" } });
    fireEvent.click(screen.getByRole("button", { name: "Commit reviewed blueprint correction" }));
    await waitFor(() => expect(mocks.execute).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("form", { name: "Reviewed blueprint correction" })).toBeInTheDocument();
    expect(screen.getByLabelText("Review reason")).toHaveValue("Reviewed response identity validation");
  });

  it("does not hide a newer blocker after a confirmed older repair", async () => {
    mocks.execute.mockImplementationOnce(async () => { mocks.issue.template_version = 9; return mocks.repaired; });
    await openCorrection();
    fireEvent.change(screen.getByLabelText("Review reason"), { target: { value: "Reviewed correction before later revalidation" } });
    fireEvent.click(screen.getByRole("button", { name: "Commit reviewed blueprint correction" }));
    await waitFor(() => expect(screen.queryByRole("form", { name: "Reviewed blueprint correction" })).not.toBeInTheDocument());
    await screen.findByRole("button", { name: "Review blueprint correction" });
    fireEvent.click(screen.getByRole("button", { name: "Review blueprint correction" }));
    fireEvent.change(screen.getByLabelText("Review reason"), { target: { value: "Review newer blocked revision separately" } });
    mocks.execute.mockResolvedValueOnce({ template_id: "source-proof", previous_version: 9, version: 10, status: "REPAIRED" });
    fireEvent.click(screen.getByRole("button", { name: "Commit reviewed blueprint correction" }));
    await waitFor(() => expect(mocks.execute).toHaveBeenCalledTimes(2));
    expect(mocks.execute.mock.calls[1][3]).toBe(9);
  });
});
