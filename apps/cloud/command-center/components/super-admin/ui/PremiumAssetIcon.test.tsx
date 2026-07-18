import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PremiumAssetIcon } from "./PremiumAssetIcon";

describe("PremiumAssetIcon", () => {
  it("provides an accessible label when the icon conveys content", () => {
    render(<PremiumAssetIcon assetKey="invoice" label="Invoice file" tone="green" />);
    expect(screen.getByRole("img", { name: "Invoice file" })).toBeInTheDocument();
  });

  it("is hidden from assistive technology when it is decorative", () => {
    const { container } = render(<PremiumAssetIcon assetKey="organization" />);
    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
  });
});
