"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { apiClient, apiGet } from "@/lib/api-client";
import { DataTable, Panel, StatusBadge } from "../OrganiserPrimitives";
import { asList, BillingPage, money } from "./shared";
export function InvoiceTable({ overview = false }: { overview?: boolean }) {
  const [page, setPage] = useState(1); const [pageSize, setPageSize] = useState(10);
  const section = overview ? "overview" : "invoices";
  const query = useQuery({ queryKey: ["organiser", "billing", section, page, pageSize], queryFn: () => apiGet<any>(`/organiser/billing/${section}?page=${page}&page_size=${pageSize}`) });
  const download = async (row: any) => { try { const blob = await apiClient.get<Blob>(`/organiser/billing/invoices/${row.id}/download`, { responseType: "blob" }); const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `invoice-${row.reference || row.id}.csv`; anchor.click(); URL.revokeObjectURL(url); toast.success("Invoice downloaded."); } catch (error: any) { toast.error(error?.message || "Invoice download failed."); } };
  return <BillingPage><Panel title={overview ? "Recent invoices" : "Invoices"} className="p-0"><DataTable total={query.data?.total || 0} page={page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={setPageSize} columns={["Reference", "Issued", "Due", "Status", "Amount", "Download"]} rows={asList(query.data).map((row, index) => [row.reference || `Invoice ${index + 1}`, row.issued_at ? new Date(row.issued_at).toLocaleDateString() : "-", row.due_date ? new Date(row.due_date).toLocaleDateString() : "-", <StatusBadge key={`${row.id}-status`} status={row.status || "Unpaid"} />, money(Number(row.amount), row.currency || "INR"), <Button key={`${row.id}-download`} size="icon" variant="outline" title="Download invoice" onClick={() => void download(row)}><Download className="h-3.5 w-3.5" /></Button>])} empty={query.isError ? "Invoices are unavailable." : "No invoices found."} /></Panel></BillingPage>;
}
