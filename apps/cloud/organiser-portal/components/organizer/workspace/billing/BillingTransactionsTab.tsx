"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api-client";
import { DataTable, Panel, StatusBadge } from "../OrganiserPrimitives";
import { asList, BillingPage, money } from "./shared";
export function BillingTransactionsTab() { const [page, setPage] = useState(1); const [pageSize, setPageSize] = useState(10); const query = useQuery({ queryKey: ["organiser", "billing", "transactions", page, pageSize], queryFn: () => apiGet<any>(`/organiser/billing/transactions?page=${page}&page_size=${pageSize}`) }); return <BillingPage><Panel title="Transactions" className="p-0"><DataTable total={query.data?.total || 0} page={page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={setPageSize} columns={["Reference", "Date", "Provider", "Reconciliation", "Status", "Amount"]} rows={asList(query.data).map((row, index) => [row.reference || row.id, row.created_at ? new Date(row.created_at).toLocaleDateString() : "-", row.provider || "-", <StatusBadge key={`rec-${row.id || index}`} status={row.reconciliation_status || "Pending"} />, <StatusBadge key={row.id || index} status={row.status || "Processed"} />, money(Number(row.amount), row.currency || "INR")])} empty={query.isError ? "Transactions are unavailable." : "No transactions found."} /></Panel></BillingPage>; }
