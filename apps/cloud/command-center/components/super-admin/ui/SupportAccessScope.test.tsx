import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SupportAccessScope } from "./SupportAccessScope";

vi.mock("@/services/super-admin-service", () => ({
  useAdminOrgs: () => ({
    data: [{ id: "org-a", name: "Organization A", slug: "org-a" }],
    isLoading: false,
  }),
}));

describe("SupportAccessScope", () => {
  it("requires an organization and meaningful reason before access can be applied", () => {
    render(<SupportAccessScope value={null} onApply={vi.fn()} />);

    expect(screen.getByRole("heading", { name: /audited tenant support access/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/support organization/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/access reason/i)).toHaveAttribute("minLength", "12");
    expect(screen.getByRole("button", { name: /apply scope/i })).toBeDisabled();
  });
});
