// Real gallery pages and read controller, API/component boundaries doubled.
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import Registration from "@/app/(dashboard)/events/[eventId]/registration/templates/page";
import Abstracts from "@/app/(dashboard)/events/[eventId]/abstracts/templates/page";
import Speakers from "@/app/(dashboard)/events/[eventId]/speakers/templates/page";
import Surveys from "@/app/(dashboard)/events/[eventId]/surveys/templates/page";
import Studio from "@/app/(dashboard)/events/[eventId]/design-studio/forms/page";

const fixture = vi.hoisted(() => ({ templates: vi.fn(), categories: vi.fn(), binding: vi.fn(), form: vi.fn(), valid: true }));
const scope = vi.hoisted(() => ({ isCurrent: () => fixture.valid, pending: false, failure: null, retryAt: null }));
vi.mock("next/navigation", () => ({ useParams: () => ({ eventId: "fixture-event" }), useRouter: () => ({ push: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/hooks/useEventTemplateCopy", () => ({ useEventTemplateCopy: () => scope }));
vi.mock("@/hooks/useFormConfigSave", () => ({ useFormConfigSave: () => scope }));
vi.mock("@/hooks/useScopedCommand", () => ({ useScopedCommand: () => scope }));
vi.mock("@/lib/api-client", () => ({ apiGet: (...args: any[]) => fixture.form(...args) }));
vi.mock("@/components/organizer/events/ScopedEventEditor", () => ({ ScopedEventEditor: ({ children }: any) => children }));
vi.mock("@/components/organizer/workspace/OrganiserPrimitives", () => ({
  OrganiserPage: ({ children, actions }: any) => <main>{actions}{children}</main>,
}));
vi.mock("@eventos/form-builder-studio", () => ({
  FormTemplateGallery: ({ templates, categories }: any) => <div>
    <output aria-label="Loaded templates">{templates.length}</output>
    <output aria-label="Loaded categories">{categories.length}</output>
  </div>, FormRenderer: () => null, abstractSchemaForSave: vi.fn(),
}));
vi.mock("@/services/form-template-service", () => ({ organiserFormService: {
  listTemplatePage: (...args: any[]) => fixture.templates(...args),
  listCategoryPage: (...args: any[]) => fixture.categories(...args),
  getOperationalBinding: (...args: any[]) => fixture.binding(...args),
  getEventFormConfig: (...args: any[]) => fixture.form(...args),
} }));

beforeEach(() => {
  for (const mock of [fixture.form, fixture.binding, fixture.templates, fixture.categories]) mock.mockReset();
  fixture.valid = true;
  fixture.form.mockResolvedValue({ version: 1, fields: [], schema: { fields: [] } });
  fixture.binding.mockResolvedValue({ version: 1, template_id: null });
  fixture.templates.mockImplementation(async (params: any) => ({
    items: Array.from({ length: 50 }, (_, index) => ({ id: `template-${index}`, name: `Template ${index}`,
      slug: `template-${index}`, fields: [], settings: {}, version: 1, scope_type: "GLOBAL" })),
    has_next: true, next_cursor: "template-page-2",
  }));
  fixture.categories.mockImplementation(async (params: any) => ({
    items: Array.from({ length: params.cursor ? 2 : 100 }, (_, index) => ({
      id: `category-${params.cursor ? index + 99 : index}`, name: `Category ${index}`, slug: `category-${index}`, version: 1 })),
    has_next: !params.cursor, next_cursor: params.cursor ? null : "category-page-2",
  }));
});
afterEach(() => cleanup());

it.each([["registration", Registration], ["abstract", Abstracts], ["speaker", Speakers],
  ["survey", Surveys], ["studio", Studio]] as const)(
  "%s loads only requested pages, retains rows on failure, and retries the unchanged cursor", async (_name, Page) => {
    render(<Page />);
    await waitFor(() => expect(fixture.templates).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getAllByRole("button", { name: "Show Form Templates" })[0].getAttribute("disabled")).toBeNull());
    fireEvent.click(screen.getAllByRole("button", { name: "Show Form Templates" })[0]);
    await waitFor(() => expect(screen.getByLabelText("Loaded templates").textContent).toBe("50"));
    expect(fixture.templates).toHaveBeenCalledTimes(1);
    expect(fixture.categories).toHaveBeenCalledTimes(1);
    expect(fixture.templates.mock.calls[0][0]).toMatchObject({ event_id: "fixture-event", page_size: "50" });
    expect(fixture.templates.mock.calls[0][1]).toBeInstanceOf(AbortSignal);
    fixture.templates.mockRejectedValueOnce({ status: 503, message: "Unavailable", correlationId: "fixture-reference" });
    fireEvent.click(screen.getByRole("button", { name: "Load more templates" }));
    await screen.findByRole("alert");
    expect(screen.getByLabelText("Loaded templates").textContent).toBe("50");
    expect(fixture.templates).toHaveBeenCalledTimes(2);
    expect(screen.getByText("Reference: fixture-reference")).toBeTruthy();
    fixture.templates.mockResolvedValueOnce({ items: [
      { id: "template-49", name: "Existing", fields: [], settings: {} },
      { id: "template-50", name: "New", fields: [], settings: {} },
      { id: "template-50", name: "Duplicate", fields: [], settings: {} }], has_next: false });
    fireEvent.click(screen.getByRole("button", { name: "Load more templates" }));
    await waitFor(() => expect(screen.getByLabelText("Loaded templates").textContent).toBe("51"));
    expect(fixture.templates).toHaveBeenCalledTimes(3);
    expect(fixture.templates.mock.calls[2][0]).toEqual(fixture.templates.mock.calls[1][0]);
    expect(fixture.templates.mock.calls[2][0].cursor).toBe("template-page-2");
    expect(screen.queryByRole("button", { name: "Load more templates" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Load more categories" }));
    await waitFor(() => expect(screen.getByLabelText("Loaded categories").textContent).toBe("101"));
    expect(fixture.categories).toHaveBeenCalledTimes(2);
    expect(fixture.categories.mock.calls[1][0]).toMatchObject({ cursor: "category-page-2", page_size: "100" });
    expect(screen.queryByRole("button", { name: "Load more categories" })).toBeNull();
  });

it.each([["registration", Registration], ["abstract", Abstracts], ["speaker", Speakers],
  ["survey", Surveys], ["studio", Studio]] as const)(
  "%s reports an unavailable first page instead of an empty catalogue", async (_name, Page) => {
    fixture.categories.mockRejectedValueOnce({ status: 503, message: "Service unavailable", correlationId: "initial-reference" });
    render(<Page />);
    expect(await screen.findByText("The catalogue is unavailable. Reload it before choosing a template.")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("service is temporarily unavailable");
    expect(screen.getByRole("alert").textContent).toContain("initial-reference");
    expect(fixture.categories).toHaveBeenCalledTimes(1);
    expect(fixture.templates).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => expect(screen.queryByText("The catalogue is unavailable. Reload it before choosing a template.")).toBeNull());
    expect(fixture.categories).toHaveBeenCalledTimes(2);
    expect(fixture.templates).toHaveBeenCalledTimes(2);
  });
