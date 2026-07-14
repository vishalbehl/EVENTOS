"use client"

import { useFinancialAuditTrail, formatINR } from "@/services/super-admin-service"
import { PageContainer } from "@/components/super-admin/ui/PageContainer"
import { SectionHeader } from "@/components/super-admin/ui/SectionHeader"
import { History, User, Building, Landmark, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function PriceHistoryPage() {
  const { data, isLoading, refetch } = useFinancialAuditTrail({ limit: 100 })
  const auditLogs = data?.items || []

  return (
    <PageContainer>
      <SectionHeader
        title="Price History & Audit Trail"
        description="Audit log tracking catalog modifications, price adjustments, and financial operations across organizations"
        actions={
          <Button onClick={() => refetch()} variant="outline" className="h-9 gap-1 text-xs">
            <RefreshCw className="h-3.5 w-3.5" /> Refresh Logs
          </Button>
        }
      />

      <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-3xl overflow-hidden mt-6">
        {isLoading ? (
          <div className="p-12 text-center text-sm text-secondary flex items-center justify-center gap-2">
            <RefreshCw className="animate-spin h-4 w-4" /> Loading financial audit logs...
          </div>
        ) : auditLogs.length === 0 ? (
          <div className="p-16 text-center text-tertiary text-xs flex flex-col items-center justify-center gap-2">
            <History className="h-8 w-8 text-border-hover mb-2" />
            <span>No financial audit log entries found.</span>
          </div>
        ) : (
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-surface-2 border-b border-border text-secondary font-bold uppercase text-[10px]">
                <th className="p-4">Timestamp</th>
                <th className="p-4">Organization</th>
                <th className="p-4">Activity Type</th>
                <th className="p-4 text-right">Associated Amount</th>
                <th className="p-4">Performed By</th>
              </tr>
            </thead>
            <tbody>
              {auditLogs.map((log) => (
                <tr key={log.id} className="border-b border-border/40 hover:bg-surface-hover/20">
                  <td className="p-4 text-secondary text-xs font-mono">
                    {new Date(log.occurred_at).toLocaleString()}
                  </td>
                  <td className="p-4 font-semibold text-primary">
                    <div className="flex items-center gap-1.5">
                      <Building className="h-3.5 w-3.5 text-brand-primary" />
                      {log.org_name || "Platform-wide / Global"}
                    </div>
                  </td>
                  <td className="p-4 text-xs text-secondary font-medium">
                    <div className="flex items-center gap-1.5">
                      <Landmark className="h-3.5 w-3.5 text-indigo-400" />
                      {log.activity_type}
                    </div>
                  </td>
                  <td className="p-4 text-right font-mono font-semibold text-xs text-primary">
                    {log.amount !== null ? formatINR(log.amount) : "—"}
                  </td>
                  <td className="p-4 text-secondary text-xs">
                    <div className="flex items-center gap-1.5">
                      <User className="h-3.5 w-3.5 text-tertiary" />
                      {log.performed_by_name}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </PageContainer>
  )
}
