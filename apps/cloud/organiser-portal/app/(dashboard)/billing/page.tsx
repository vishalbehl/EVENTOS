import { redirect } from "next/navigation";
import { nestedTabRedirect } from "@/lib/organiser-route-redirects";

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ tab?: string | string[] }> }) {
  const { tab } = await searchParams;
  redirect(nestedTabRedirect("billing", tab, "overview", { overview: "overview", subscription: "subscription", invoices: "invoices", payments: "payments", transactions: "payments", "transaction-history": "payments", receipts: "receipts", tax: "tax", "tax-gst": "tax" }));
}
