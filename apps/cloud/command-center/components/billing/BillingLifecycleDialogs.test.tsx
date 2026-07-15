import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BillingStatusDialog, CreditNoteIssueDialog } from "./BillingLifecycleDialogs";

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


describe("BillingStatusDialog", () => {
  it("requires a valid status and audited reason", () => {
    render(
      <BillingStatusDialog
        open
        onOpenChange={vi.fn()}
        title="Change status"
        description="Controlled billing lifecycle transition"
        currentVersion={3}
        statusOptions={["SUSPENDED", "CANCELLED"]}
        onSubmit={vi.fn()}
      />,
    );

    const submit = screen.getByRole("button", { name: /apply status/i });
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/new status/i), { target: { value: "SUSPENDED" } });
    fireEvent.change(screen.getByLabelText(/decision reason/i), { target: { value: "short" } });
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/decision reason/i), { target: { value: "Approved billing suspension reason" } });
    expect(submit).toBeEnabled();
  });

  it("requires a target invoice before applying a credit note", () => {
    render(
      <BillingStatusDialog
        open
        onOpenChange={vi.fn()}
        title="Apply credit"
        description="Controlled credit application"
        currentVersion={2}
        statusOptions={["APPLIED"]}
        onSubmit={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText(/new status/i), { target: { value: "APPLIED" } });
    fireEvent.change(screen.getByLabelText(/decision reason/i), { target: { value: "Applying approved customer credit" } });
    expect(screen.getByRole("button", { name: /apply status/i })).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/target invoice id/i), { target: { value: "11111111-1111-1111-1111-111111111111" } });
    expect(screen.getByRole("button", { name: /apply status/i })).toBeEnabled();
  });

  it("uses tenant-authorized invoice choices instead of free-form IDs", () => {
    render(
      <CreditNoteIssueDialog
        open
        onOpenChange={vi.fn()}
        invoices={[invoice]}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByLabelText(/source invoice/i)).toHaveRole("combobox");
    expect(screen.getByRole("option", { name: /INV-1001 - UNPAID/i })).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: /source invoice/i })).not.toBeInTheDocument();
  });
});
