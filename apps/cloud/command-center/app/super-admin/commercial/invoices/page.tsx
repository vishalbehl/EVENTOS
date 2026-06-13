"use client";

import React, { useState, useMemo } from "react";
import { 
  useAdminInvoices, 
  useMarkInvoicePaid, 
  useSendInvoiceReminder, 
  useVoidInvoice, 
  Invoice 
} from "@/services/super-admin-service";
import { 
  useReactTable, 
  getCoreRowModel, 
  ColumnDef 
} from "@tanstack/react-table";
import { 
  RefreshCw, Search, Calendar, Filter, Download, MoreVertical, CreditCard, Mail, Trash2, ChevronDown
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PageContainer } from "@/components/super-admin/ui/PageContainer";
import { SectionHeader } from "@/components/super-admin/ui/SectionHeader";
import { DataTable } from "@/components/super-admin/ui/DataTable";
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// ── Helpers ────────────────────────────────────────────────────
function formatCurrency(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

export default function InvoicesLedgerPage() {
  const [page, setPage] = useState(0);
  const limit = 10;
  const [selectedStatus, setSelectedStatus] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Queries & Mutations
  const { data, isLoading, refetch } = useAdminInvoices({
    skip: page * limit,
    limit,
    status: selectedStatus === "ALL" ? undefined : selectedStatus,
  });

  const markPaidMutation = useMarkInvoicePaid();
  const sendReminderMutation = useSendInvoiceReminder();
  const voidMutation = useVoidInvoice();

  const invoices = data?.items || [];
  
  // Real summary stats from API response, removing dummy values
  const summary = useMemo(() => {
    const s = (data as any)?.summary || {
      total: 0,
      paid: 0,
      pending: 0,
      overdue: 0,
      total_count: 0
    };
    const collectionRate = s.total > 0 
      ? ((s.paid / s.total) * 100).toFixed(1) + "%" 
      : "0.0%";
    return {
      total: formatCurrency(s.total),
      paid: formatCurrency(s.paid),
      pending: formatCurrency(s.pending),
      overdue: formatCurrency(s.overdue),
      rate: collectionRate
    };
  }, [data]);

  // Actions
  const handleMarkPaid = async (invoiceId: string) => {
    try {
      await markPaidMutation.mutateAsync(invoiceId);
      toast.success("Invoice marked paid");
      refetch();
    } catch {
      toast.error("Failed to update status");
    }
  };

  const handleSendReminder = async (invoiceId: string) => {
    try {
      await sendReminderMutation.mutateAsync(invoiceId);
      toast.success("Reminder email dispatched");
    } catch {
      toast.error("Failed to queue reminder");
    }
  };

  const handleVoidInvoice = async (invoiceId: string) => {
    if (!confirm("Are you sure you want to void this invoice?")) return;
    try {
      await voidMutation.mutateAsync(invoiceId);
      toast.success("Invoice voided");
      refetch();
    } catch {
      toast.error("Failed to void invoice");
    }
  };

  // Columns definition
  const columns: ColumnDef<Invoice>[] = useMemo(() => [
    {
      accessorKey: "stripe_invoice_id",
      header: "Invoice #",
      cell: ({ row }) => {
        const displayId = row.original.stripe_invoice_id 
          ? row.original.stripe_invoice_id.slice(0, 14) 
          : `INV-2025-${row.original.id.slice(0, 4).toUpperCase()}`;
        return (
          <span className="font-mono text-xs font-black text-indigo-500 hover:underline cursor-pointer">
            {displayId}
          </span>
        );
      },
    },
    {
      accessorKey: "organization_name",
      header: "Organization",
      cell: ({ row }) => (
        <div className="flex items-center gap-2.5">
          <div className="w-6 h-6 rounded bg-indigo-600/10 text-indigo-400 text-[10px] font-black flex items-center justify-center flex-shrink-0">
            {row.original.organization_name ? row.original.organization_name.slice(0, 2).toUpperCase() : "OR"}
          </div>
          <span className="text-xs font-bold text-[var(--text-primary)]">
            {row.original.organization_name}
          </span>
        </div>
      ),
    },
    {
      id: "plan",
      header: "Plan",
      cell: ({ row }) => (
        <span className="inline-flex px-2 py-0.5 rounded bg-surface-2 border border-border text-[9px] text-[var(--text-secondary)] font-mono font-semibold uppercase tracking-wider">
          {row.original.plan_name || "Enterprise"}
        </span>
      ),
    },
    {
      accessorKey: "amount",
      header: "Amount",
      cell: ({ row }) => (
        <span className="font-mono text-xs font-black text-[var(--text-primary)]">
          {formatCurrency(row.original.amount || 0)}
        </span>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => {
        const status = row.original.status;
        let badgeStyle = "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
        if (status === "UNPAID" || status === "OPEN" || status === "PENDING") badgeStyle = "bg-amber-500/10 text-amber-400 border-amber-500/20";
        else if (status === "OVERDUE") badgeStyle = "bg-red-500/10 text-red-400 border-red-500/20";
        else if (status === "VOID" || status === "UNCOLLECTIBLE") badgeStyle = "bg-slate-500/10 text-slate-400 border-slate-500/20";

        return (
          <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase border", badgeStyle)}>
            {status}
          </span>
        );
      },
    },
    {
      accessorKey: "due_date",
      header: "Due Date",
      cell: ({ row }) => (
        <span className="text-xs text-[var(--text-secondary)] font-mono">
          {row.original.due_date ? new Date(row.original.due_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}
        </span>
      ),
    },
    {
      accessorKey: "paid_at",
      header: "Paid Date",
      cell: ({ row }) => (
        <span className="text-xs text-[var(--text-secondary)] font-mono">
          {row.original.paid_at ? new Date(row.original.paid_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}
        </span>
      ),
    },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 rounded-full hover:bg-surface-hover">
            <Download className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 rounded-full hover:bg-surface-hover">
                <MoreVertical className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-surface border border-border text-xs rounded-xl shadow-xl">
              {row.original.status !== "PAID" && (
                <DropdownMenuItem onClick={() => handleMarkPaid(row.original.id)} className="flex items-center gap-2 cursor-pointer py-2 px-3 text-[var(--text-primary)] hover:bg-surface-2">
                  <CreditCard className="w-3.5 h-3.5 text-emerald-400" />
                  Mark Paid
                </DropdownMenuItem>
              )}
              {row.original.status !== "PAID" && (
                <DropdownMenuItem onClick={() => handleSendReminder(row.original.id)} className="flex items-center gap-2 cursor-pointer py-2 px-3 text-[var(--text-primary)] hover:bg-surface-2">
                  <Mail className="w-3.5 h-3.5 text-amber-400" />
                  Send Reminder
                </DropdownMenuItem>
              )}
              {row.original.status !== "VOID" && (
                <DropdownMenuItem onClick={() => handleVoidInvoice(row.original.id)} className="flex items-center gap-2 cursor-pointer py-2 px-3 text-red-400 hover:bg-red-500/10 hover:text-red-300">
                  <Trash2 className="w-3.5 h-3.5" />
                  Void Invoice
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
    },
  ], []);

  const table = useReactTable({
    data: invoices,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <PageContainer>
      <SectionHeader
        title="Invoices"
        description="Track invoices, payments, and collections."
        actions={
          <Button variant="outline" onClick={() => refetch()} className="border-border hover:bg-surface-hover/30">
            <RefreshCw className={cn("w-3.5 h-3.5 mr-2", isLoading && "animate-spin")} />
            Refresh
          </Button>
        }
      />

      {/* Dynamic Metric Cards Row */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        {[
          { label: "Total Invoiced", value: summary.total },
          { label: "Paid", value: summary.paid },
          { label: "Pending", value: summary.pending },
          { label: "Overdue", value: summary.overdue },
          { label: "Collection Rate", value: summary.rate },
        ].map((stat, idx) => (
          <div key={idx} className="bg-surface border border-border rounded-2xl p-5 flex flex-col justify-center shadow-sm h-24">
            <span className="text-[10px] font-black uppercase tracking-wider text-[var(--text-tertiary)]">{stat.label}</span>
            <p className="text-xl font-black text-[var(--text-primary)] leading-tight tracking-tight mt-1">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Main Tabular Ledger */}
      <div className="space-y-4">
        
        {/* Filters Toolbar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pt-1">
          {/* Status Tabs */}
          <div className="flex flex-wrap gap-1 p-1 bg-surface border border-border rounded-xl w-fit">
            {[
              { label: "All", value: "ALL" },
              { label: "Paid", value: "PAID" },
              { label: "Pending", value: "UNPAID" },
              { label: "Overdue", value: "OVERDUE" },
              { label: "Void", value: "VOID" },
            ].map((tab) => {
              const isActive = selectedStatus === tab.value;
              return (
                <button
                  key={tab.value}
                  onClick={() => {
                    setSelectedStatus(tab.value);
                    setPage(0);
                  }}
                  className={cn(
                    "px-4 py-1.5 rounded-lg text-xs font-bold transition-all duration-150",
                    isActive
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-surface-2"
                  )}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Right side filter triggers */}
          <div className="flex items-center gap-3">
            <div className="relative w-64">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 transform -translate-y-1/2 text-[var(--text-tertiary)]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search organizations..."
                className="w-full bg-surface border border-border rounded-xl pl-9 pr-4 py-1.5 text-xs text-[var(--text-primary)] focus:outline-none focus:border-indigo-500 placeholder-[var(--text-tertiary)]"
              />
            </div>

            <Button variant="outline" className="border-border hover:bg-surface-hover/30 text-xs h-9 rounded-xl flex items-center gap-2">
              <Calendar className="w-3.5 h-3.5 text-[var(--text-tertiary)]" />
              <span>Apr 1 - May 15, 2025</span>
              <ChevronDown className="w-3 h-3 text-[var(--text-tertiary)]" />
            </Button>

            <Button variant="outline" className="border-border hover:bg-surface-hover/30 text-xs h-9 rounded-xl">
              <Filter className="w-3.5 h-3.5 mr-1.5 text-[var(--text-tertiary)]" />
              Filters
            </Button>

            <Button variant="outline" className="border-border hover:bg-surface-hover/30 text-xs h-9 rounded-xl">
              <Download className="w-3.5 h-3.5 mr-1.5 text-[var(--text-tertiary)]" />
              Export
            </Button>
          </div>
        </div>

        {/* Data Table */}
        <div className="bg-surface border border-border rounded-2xl overflow-hidden shadow-sm">
          <DataTable table={table} isLoading={isLoading} />
        </div>
      </div>
    </PageContainer>
  );
}
