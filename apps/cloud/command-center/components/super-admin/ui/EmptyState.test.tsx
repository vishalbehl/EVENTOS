import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { EmptyState } from "./EmptyState";

describe("EmptyState", () => {
  it("renders standard empty state title and description", () => {
    render(<EmptyState title="No entries found" description="Create a new entry to get started." />);
    expect(screen.getByRole("heading", { name: /no entries found/i })).toBeInTheDocument();
    expect(screen.getByText(/create a new entry/i)).toBeInTheDocument();
  });

  it("renders empty state action trigger when provided", () => {
    const handleAction = vi.fn();
    render(
      <EmptyState
        title="No items"
        description="Add one now"
        action={{ label: "Add Item", onClick: handleAction }}
      />
    );
    const actionBtn = screen.getByRole("button", { name: /add item/i });
    expect(actionBtn).toBeInTheDocument();
    actionBtn.click();
    expect(handleAction).toHaveBeenCalledOnce();
  });
});
