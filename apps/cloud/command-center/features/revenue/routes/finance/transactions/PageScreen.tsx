"use client"

import React, { useState } from "react"
import { useFinancialTransactions } from "@/services/super-admin-service"
import { PageContainer } from "@/components/super-admin/ui/PageContainer"
import { SectionHeader } from "@/components/super-admin/ui/SectionHeader"
import { KpiCard } from "@/components/super-admin/ui/KpiCard"
import { StatusBadge } from "@/components/super-admin/ui/StatusBadge"
import { Button } from "@/components/ui/button"
import { ClipboardList, CheckCircle, XCircle, RefreshCw, ChevronLeft, ChevronRight } from "lucide-react"

export default function FinancialTransactionsPage() {
  const [status, setStatus] = useState<string>("ALL")
  const [page, setPage] = useState(1)
  const limit = 10

  const { data, isLoading, error, refetch } = useFinancialTransactions({
    skip: (page - 1) * limit,
    limit,
    status: status === "ALL" ? undefined : status,
  })

  if (isLoading) return <div className="p-8 text-center text-secondary">Loading transactions...</div>
  if (error || !data) return <div className="p-8 text-center text-danger">Failed to load transactions</div>

  const items = data.items || []
  const total = data.total || 0
  const summary = data.summary || { total_count: 0, completed_count: 0, failed_count: 0, refunded_count: 0 }

  const totalPages = Math.ceil(total / limit)

  return (
    <PageContainer>
      <div className="flex items-center justify-between mb-4">
        <SectionHeader title="Transactions ledger" description="Audit live registration payments and processing status across the platform." />
        <Button variant="outline" size="sm" onClick={() => refetch()} className="flex items-center gap-1 text-xs">
          <RefreshCw className="h-3 w-3" /> Refresh
        </Button>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-4 gap-4">
        <KpiCard title="Total Transactions" value={summary.total_count.toLocaleString()} delta={0} deltaLabel="" trend={[]} icon={ClipboardList} iconColor="brand" />
        <KpiCard title="Completed" value={summary.completed_count.toLocaleString()} delta={0} deltaLabel="" trend={[]} icon={CheckCircle} iconColor="success" />
        <KpiCard title="Failed" value={summary.failed_count.toLocaleString()} delta={0} deltaLabel="" trend={[]} icon={XCircle} iconColor="danger" />
        <KpiCard title="Refunded" value={summary.refunded_count.toLocaleString()} delta={0} deltaLabel="" trend={[]} icon={XCircle} iconColor="warning" />
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 mt-6 mb-4">
        {["ALL", "COMPLETED", "FAILED", "REFUNDED", "PENDING"].map(tab => (
          <button
            key={tab}
            onClick={() => {
              setStatus(tab)
              setPage(1)
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
              status === tab ? "bg-brand-primary text-white border-brand-primary" : "bg-surface border-border text-secondary hover:text-primary"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* DataTable */}
      <div className="bg-surface border border-border rounded-xl p-5">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-secondary text-xs">
                <th className="py-2.5">Transaction ID</th>
                <th className="py-2.5">Date & Time</th>
                <th className="py-2.5">Organization</th>
                <th className="py-2.5 text-right">Amount</th>
                <th className="py-2.5">Gateway</th>
                <th className="py-2.5">Status</th>
                <th className="py-2.5 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border text-primary">
              {items.map(tx => (
                <tr key={tx.id} className="hover:bg-surface-hover transition-colors">
                  <td className="py-3 font-mono text-xs">{tx.id}</td>
                  <td className="py-3 text-secondary">{new Date(tx.created_at).toLocaleString("en-IN")}</td>
                  <td className="py-3 font-medium">{tx.org_name}</td>
                  <td className="py-3 text-right font-mono font-bold">₹{tx.amount_inr.toLocaleString("en-IN")}</td>
                  <td className="py-3 font-mono text-xs text-secondary">{tx.gateway}</td>
                  <td className="py-3">
                    <StatusBadge status={tx.status} />
                  </td>
                  <td className="py-3 text-center">
                    <button className="text-xs text-brand-primary font-semibold hover:underline">View Receipt</button>
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-secondary">No transactions found</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination controls */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-border pt-4 mt-4">
            <span className="text-xs text-secondary">
              Showing {(page - 1) * limit + 1} - {Math.min(page * limit, total)} of {total} transactions
            </span>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(p - 1, 1))} disabled={page === 1} className="h-8 w-8 p-0">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-xs font-semibold px-3 text-primary">
                Page {page} of {totalPages}
              </span>
              <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(p + 1, totalPages))} disabled={page === totalPages} className="h-8 w-8 p-0">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </PageContainer>
  )
}
