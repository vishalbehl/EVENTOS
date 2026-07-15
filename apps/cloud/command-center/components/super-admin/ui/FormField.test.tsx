import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ApiError } from "@/lib/api-client";
import { Input } from "@/components/ui/input";
import { FormField, ServerErrorSummary } from "./FormField";

describe("FormField", () => {
  it("connects the label, description, required state, and error to the control", () => {
    render(<FormField label="Organization name" description="Use the contracted name." error="Name is required." required><Input /></FormField>);
    const input = screen.getByRole("textbox", { name: /organization name/i });
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription(/use the contracted name.*name is required/i);
    expect(screen.getByRole("alert")).toHaveTextContent("Name is required.");
  });

  it("presents stable API request evidence without exposing payloads", () => {
    render(<ServerErrorSummary error={new ApiError({ message: "Update rejected", code: "VERSION_CONFLICT", requestId: "req-123" })} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Update rejected");
    expect(screen.getByText("Request req-123")).toBeVisible();
  });
});
