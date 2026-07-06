"use client"
import { PageContainer } from "@/components/super-admin/ui/PageContainer"
import { SectionHeader } from "@/components/super-admin/ui/SectionHeader"
import { History, User, Tag } from "lucide-react"

export default function PriceHistoryPage() {
  const auditLogs = [
    { id: 1, date: "2026-06-29 11:20", item: "Thermal Badge Printer", change: "Renting Price updated", previous: "₹2,500/day", current: "₹2,600/day", user: "Super Admin" },
    { id: 2, date: "2026-06-28 14:05", item: "iPad Self Check-in Kiosk", change: "Renting Price updated", previous: "₹2,000/day", current: "₹2,200/day", user: "Super Admin" },
    { id: 3, date: "2026-06-25 09:30", item: "Registration Executive", change: "Daily Rate updated", previous: "₹2,800/day", current: "₹3,000/day", user: "Finance Director" },
    { id: 4, date: "2026-06-20 16:45", item: "Network Switch 24-Port", change: "Renting Price updated", previous: "₹1,200/day", current: "₹1,350/day", user: "Super Admin" }
  ]

  return (
    <PageContainer>
      <SectionHeader
        title="Price History"
        description="Audit log tracking catalog price modifications, rate variations, and commercial adjustments"
      />

      <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-3xl overflow-hidden mt-6">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-surface-2 border-b border-border text-secondary font-bold uppercase text-[10px]">
              <th className="p-4">Timestamp</th>
              <th className="p-4">Resource Item</th>
              <th className="p-4">Change Action</th>
              <th className="p-4">Old Rate</th>
              <th className="p-4">New Rate</th>
              <th className="p-4">Updated By</th>
            </tr>
          </thead>
          <tbody>
            {auditLogs.map((log) => (
              <tr key={log.id} className="border-b border-border/40 hover:bg-surface-hover/20">
                <td className="p-4 text-secondary text-xs font-mono">{log.date}</td>
                <td className="p-4 font-semibold text-primary">
                  <div className="flex items-center gap-1.5">
                    <Tag className="h-3.5 w-3.5 text-brand-primary" />
                    {log.item}
                  </div>
                </td>
                <td className="p-4 text-xs text-secondary">{log.change}</td>
                <td className="p-4 font-mono text-danger line-through text-xs">{log.previous}</td>
                <td className="p-4 font-mono text-success font-bold text-xs">{log.current}</td>
                <td className="p-4 text-secondary text-xs">
                  <div className="flex items-center gap-1.5">
                    <User className="h-3.5 w-3.5 text-tertiary" />
                    {log.user}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PageContainer>
  )
}
