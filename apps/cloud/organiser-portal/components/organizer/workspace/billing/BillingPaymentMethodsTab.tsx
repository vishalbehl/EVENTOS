"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api-client";
import { DataTable, Panel, StatusBadge } from "../OrganiserPrimitives";
import { asList, BillingPage } from "./shared";
export function BillingPaymentMethodsTab() { const [page, setPage] = useState(1); const [pageSize, setPageSize] = useState(10); const query = useQuery({ queryKey: ["organiser", "billing", "payment-methods", page, pageSize], queryFn: () => apiGet<any>(`/organiser/billing/payment-methods?page=${page}&page_size=${pageSize}`) }); return <BillingPage><Panel title="Payment methods" className="p-0"><DataTable total={query.data?.total || 0} page={page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={setPageSize} columns={["Provider", "Method", "Default", "Added"]} rows={asList(query.data).map((row, index) => [row.provider || "-", row.card_last4 ? `${row.card_brand || "Card"} ending ${row.card_last4}` : "Stored provider method", row.is_default ? <StatusBadge key={row.id || index} status="Default" /> : "-", row.created_at ? new Date(row.created_at).toLocaleDateString() : "-"])} empty={query.isError ? "Payment methods are unavailable." : "No payment methods have been added. Payment details are created through the configured billing provider."} /></Panel></BillingPage>; }
