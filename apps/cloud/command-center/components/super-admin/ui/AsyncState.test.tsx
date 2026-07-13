import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { PermissionDenied, RetryState } from "./AsyncState";

describe("AsyncState", () => {
  it("renders a restricted state for permission problems", () => {
    render(<PermissionDenied title="Access denied" description="You do not have permission to view this resource." />);

    expect(screen.getByRole("heading", { name: /access denied/i })).toBeInTheDocument();
    expect(screen.getByText(/do not have permission/i)).toBeInTheDocument();
  });

  it("renders a retry affordance for recoverable states", () => {
    render(
      <RetryState
        title="Service unavailable"
        description="Try again after the provider recovers."
        action={{ label: "Retry now", onClick: () => void 0 }}
      />,
    );

    expect(screen.getByRole("button", { name: /retry now/i })).toBeInTheDocument();
  });
});
