import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { InvoicePaymentDialog, PaymentReconcileDialog } from "./FinancialReconciliation";

const invoice = {
  id: "11111111-1111-1111-1111-111111111111",
  organization_id: "22222222-2222-2222-2222-222222222222",
  invoice_number: "INV-1001",
  amount: 1000,
  gst_amount: 180,
  total_amount_inr: 1180,
  currency: "INR",
  status: "UNPAID",
  issued_at: "2026-07-14T10:00:00Z",
  version: 1,
  created_at: "2026-07-14T10:00:00Z",
  updated_at: "2026-07-14T10:00:00Z",
};

const payment = {
  id: "33333333-3333-3333-3333-333333333333",
  organization_id: invoice.organization_id,
  invoice_id: invoice.id,
  plan_name: "Enterprise",
  amount: 1180,
  currency: "INR",
  provider: "OFFLINE",
  status: "SUCCEEDED",
  reconciliation_status: "PENDING",
  version: 1,
  created_at: "2026-07-14T10:00:00Z",
  updated_at: "2026-07-14T10:00:00Z",
};

describe("financial reconciliation dialogs", () => {
  it("requires audit evidence before recording payment", () => {
    render(<InvoicePaymentDialog invoice={invoice} open onOpenChange={vi.fn()} onSubmit={vi.fn()} />);
    const submit = screen.getByRole("button", { name: /record payment/i });
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/evidence and reason/i), { target: { value: "Verified against bank settlement statement" } });
    expect(submit).toBeEnabled();
  });

  it("requires evidence for a versioned reconciliation decision", () => {
    render(<PaymentReconcileDialog payment={payment} open onOpenChange={vi.fn()} onSubmit={vi.fn()} />);
    const submit = screen.getByRole("button", { name: /apply decision/i });
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/decision evidence/i), { target: { value: "Matched provider settlement to invoice amount" } });
    expect(submit).toBeEnabled();
  });
});
