"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api-client";
import { DataTable, Panel, StatusBadge } from "../OrganiserPrimitives";
import { asList, BillingPage, money } from "./shared";
export function BillingCreditsTab() { const [page, setPage] = useState(1); const [pageSize, setPageSize] = useState(10); const query = useQuery({ queryKey: ["organiser", "billing", "credits", page, pageSize], queryFn: () => apiGet<any>(`/organiser/billing/credits?page=${page}&page_size=${pageSize}`) }); return <BillingPage><Panel title="Credits" className="p-0"><DataTable total={query.data?.total || 0} page={page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={setPageSize} columns={["Type", "Reason", "Applied", "Expires", "Status", "Amount"]} rows={asList(query.data).map((row, index) => [row.credit_type || "Credit", row.reason || "-", row.applied_at ? new Date(row.applied_at).toLocaleDateString() : "-", row.expires_at ? new Date(row.expires_at).toLocaleDateString() : "No expiry", <StatusBadge key={row.id || index} status={row.is_used ? "Used" : "Available"} />, money(Number(row.amount), row.currency || "INR")])} empty={query.isError ? "Credits are unavailable." : "No organisation credits found."} /></Panel></BillingPage>; }
