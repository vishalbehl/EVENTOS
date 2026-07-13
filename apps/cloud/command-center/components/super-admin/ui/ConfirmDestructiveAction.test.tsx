import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { ConfirmDestructiveAction } from "./ConfirmDestructiveAction";

describe("ConfirmDestructiveAction", () => {
  it("requires a valid reason before confirming when configured", () => {
    const onConfirm = vi.fn();
    const onOpenChange = vi.fn();

    render(
      <ConfirmDestructiveAction
        open
        onOpenChange={onOpenChange}
        title="Deactivate license"
        description="This removes the active event binding."
        confirmLabel="Deactivate"
        requireReason
        onConfirm={onConfirm}
        resourceName="Event Alpha"
      />,
    );

    expect(screen.getByRole("button", { name: /deactivate/i })).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/reason/i), { target: { value: "Needs review" } });
    expect(screen.getByRole("button", { name: /deactivate/i })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: /deactivate/i }));
    expect(onConfirm).toHaveBeenCalledWith("Needs review");
  });
});
