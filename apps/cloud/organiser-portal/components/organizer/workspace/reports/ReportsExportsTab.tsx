"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { apiGet } from "@/lib/api-client";
import { DataTable, Panel, StatusBadge } from "../OrganiserPrimitives";
import { downloadReport, type ReportData, ReportsPage } from "./shared";
export function ReportsExportsTab() { const [page, setPage] = useState(1); const [pageSize, setPageSize] = useState(10); const query = useQuery({ queryKey: ["organiser-reports", "exports", page, pageSize], queryFn: () => apiGet<ReportData>(`/organiser/reports/exports?page=${page}&page_size=${pageSize}`) }); const download = async (id: string) => { try { await downloadReport(id); } catch { toast.error("Report download failed."); } }; return <ReportsPage data={query.data} error={query.isError}><Panel title="Export history" className="p-0"><DataTable columns={["Domain", "Format", "Rows", "Status", "Created", "Action"]} rows={(query.data?.events || []).map((item) => [item.domain, item.format, item.row_count ?? 0, <StatusBadge key={`${item.id}-status`} status={item.status} />, item.created_at ? new Date(item.created_at).toLocaleString() : "-", <Button key={item.id} size="sm" variant="outline" onClick={() => void download(item.id)}><Download className="mr-2 h-3.5 w-3.5" />Download</Button>])} total={query.data?.total || 0} page={page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={setPageSize} empty={query.isLoading ? "Loading export history..." : "No report exports have been created."} /></Panel></ReportsPage>; }
