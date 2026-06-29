"use client"
import { PageContainer } from "@/components/super-admin/ui/PageContainer"
import { SectionHeader } from "@/components/super-admin/ui/SectionHeader"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { FileSpreadsheet, Download, FileText, CheckCircle2 } from "lucide-react"

export default function ReportsExportsPage() {
  const handleExport = (reportName: string) => {
    alert(`Exporting ${reportName} to Excel sheet...`)
  }

  const reportsList = [
    { title: "Hardware Catalog Summary", desc: "Detailed B2B hardware assets inventory log, current pricing and quantities.", type: "Excel" },
    { title: "Manpower Mappings Sheet", desc: "Operational staff roles, categories, and outsourced margins.", type: "Excel" },
    { title: "Recent Quoting Simulations", desc: "Archive of calculations runs, grand totals, and city tier parameters.", type: "CSV" },
    { title: "Pricing & Margin Rules Overview", desc: "Tax configurations, management fees and overhead metrics.", type: "PDF" }
  ]

  return (
    <PageContainer>
      <SectionHeader
        title="Commercial Exports & Reports"
        description="Download spreadsheet summaries, CSV inventories, and PDF commercial audits"
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
        {reportsList.map((rep) => (
          <Card key={rep.title} className="p-6 bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-3xl flex flex-col justify-between hover:border-brand-primary/45 transition-colors">
            <div className="space-y-2">
              <div className="flex justify-between items-start">
                <span className="text-[10px] bg-brand-primary/10 border border-brand-primary/20 text-brand-primary font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                  {rep.type} Report
                </span>
                <FileSpreadsheet className="h-5 w-5 text-tertiary" />
              </div>
              <h4 className="text-sm font-extrabold text-primary">{rep.title}</h4>
              <p className="text-xs text-secondary leading-relaxed">{rep.desc}</p>
            </div>
            <div className="mt-6 pt-4 border-t border-[var(--border-subtle)] flex justify-end">
              <Button
                onClick={() => handleExport(rep.title)}
                className="bg-brand-primary text-white text-xs font-bold gap-1.5 h-9"
              >
                <Download className="h-3.5 w-3.5" /> Export Report
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </PageContainer>
  )
}
