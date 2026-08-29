"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { apiClient, apiGet } from "@/lib/api-client";
import { DataTable, Panel, StatusBadge } from "../OrganiserPrimitives";
import { type ReportData, ReportsPage } from "./shared";

export function ReportsCustomTab() {
  const client = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState({ name: "", domain: "registrations", columns: ["name", "registrations"], filters: {} });
  const query = useQuery({
    queryKey: ["organiser-reports", "custom", page, pageSize],
    queryFn: () => apiGet<ReportData>(`/organiser/reports/custom?page=${page}&page_size=${pageSize}`),
  });
  const create = useMutation({
    mutationFn: () => apiClient.post("/organiser/reports/custom", custom, { headers: { "Idempotency-Key": crypto.randomUUID() } }),
    onSuccess: async () => {
      setOpen(false);
      await client.invalidateQueries({ queryKey: ["organiser-reports", "custom"] });
      toast.success("Custom report created.");
    },
    onError: (error: any) => toast.error(error?.message || "Custom report could not be created."),
  });

  return <ReportsPage data={query.data} error={query.isError} actions={<Button onClick={() => setOpen(true)}><Plus className="mr-2 h-4 w-4" />Create report</Button>}>
    <Panel title="Custom reports" className="p-0">
      <DataTable
        columns={["Name", "Domain", "Columns", "Status", "Created"]}
        rows={(query.data?.events || []).map((item) => [item.name, item.domain, (item.columns || []).join(", "), <StatusBadge key={`${item.id}-status`} status={item.status} />, item.created_at ? new Date(item.created_at).toLocaleString() : "-"])}
        total={query.data?.total || 0}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
        empty={query.isLoading ? "Loading custom reports..." : "No custom reports have been created."}
      />
    </Panel>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Create custom report</DialogTitle><DialogDescription>Save an organisation-scoped report definition using authoritative analytics domains.</DialogDescription></DialogHeader>
        <div className="space-y-4">
          <label className="block text-sm font-medium">Name<Input className="mt-2" value={custom.name} onChange={(event) => setCustom({ ...custom, name: event.target.value })} /></label>
          <label className="block text-sm font-medium">Domain<select className="op-select mt-2" value={custom.domain} onChange={(event) => setCustom({ ...custom, domain: event.target.value })}><option value="registrations">Registrations</option><option value="revenue">Revenue</option><option value="engagement">Engagement</option><option value="events">Events</option></select></label>
          <label className="block text-sm font-medium">Columns<Input className="mt-2" value={custom.columns.join(", ")} onChange={(event) => setCustom({ ...custom, columns: event.target.value.split(",").map((value) => value.trim()).filter(Boolean) })} /></label>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={() => create.mutate()} disabled={custom.name.trim().length < 2 || custom.columns.length === 0 || create.isPending}>{create.isPending ? "Creating..." : "Create report"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </ReportsPage>;
}
