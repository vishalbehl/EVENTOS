import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { OperationalStatusRail } from "./OperationalStatusRail";

describe("OperationalStatusRail", () => {
  it("renders a labeled status panel with supporting metadata", () => {
    render(
      <OperationalStatusRail
        tone="warning"
        label="Billing"
        title="Grant consumption is nearing capacity"
        description="This event is within 5 seats of the configured subscription limit."
        meta="Updated 2m ago"
      />,
    );

    expect(screen.getByRole("region", { name: /billing: grant consumption is nearing capacity/i })).toBeInTheDocument();
    expect(screen.getByText("Updated 2m ago")).toBeInTheDocument();
    expect(screen.getByText(/within 5 seats of the configured subscription limit/i)).toBeInTheDocument();
  });
});
