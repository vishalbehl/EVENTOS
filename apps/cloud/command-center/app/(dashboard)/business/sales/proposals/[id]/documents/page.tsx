"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import { useProposalDocuments, useGenerateProposalDocuments } from "@/services/super-admin-service"
import { PageContainer } from "@/components/super-admin/ui/PageContainer"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { 
  ArrowLeft, RefreshCw, FileText, FileSpreadsheet, Download, 
  Play, RotateCcw, ChevronRight, HardDrive, Clock, CheckCircle2 
} from "lucide-react"
import { formatIST } from "@/lib/formatters"
import { toast } from "sonner"

export default function GeneratedDocumentsPage() {
  const router = useRouter()
  const params = useParams()
  const propId = params.id as string

  // Fetch API
  const { data: documents = [], refetch: refetchDocs } = useProposalDocuments(propId)
  const generateDocsMutation = useGenerateProposalDocuments(propId)

  // Document polling effect — runs every 10 seconds if there are PENDING documents
  useEffect(() => {
    const hasPending = documents.some((doc: any) => doc.status === "PENDING")
    if (hasPending) {
      const interval = setInterval(() => {
        refetchDocs()
      }, 10000)
      return () => clearInterval(interval)
    }
  }, [documents, refetchDocs])

  const handleGenerateAll = async () => {
    await generateDocsMutation.mutateAsync()
    refetchDocs()
  }

  // KPI Calculations
  const totalDocs = documents.length
  const generatedCount = documents.filter((d: any) => d.status === "GENERATED").length
  const pendingCount = documents.filter((d: any) => d.status === "PENDING").length
  const totalStorageKb = documents.reduce((acc: number, cur: any) => acc + Number(cur.file_size || 0), 0)
  const storageStr = `${(totalStorageKb / 1024).toFixed(1)} MB`

  return (
    <PageContainer>
      {/* Header bar */}
      <div className="flex flex-col gap-3 mb-6">
        <div className="flex items-center gap-2 text-xs text-tertiary">
          <span className="hover:text-primary cursor-pointer" onClick={() => router.push("/service-requests")}>Service Requests</span>
          <ChevronRight className="h-3 w-3" />
          <span className="text-primary font-extrabold uppercase tracking-wide">PRP-2025-0010</span>
          <ChevronRight className="h-3 w-3" />
          <span className="text-primary font-extrabold uppercase tracking-wide">Generated Documents</span>
        </div>

        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
          <div>
            <h1 className="text-xl font-black text-primary flex items-center gap-2">
              <Button size="icon" variant="ghost" className="h-7 w-7 rounded-lg" onClick={() => router.back()}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
              Generated Documents Catalog
            </h1>
            <p className="text-[10px] text-tertiary">Track B2B quotations outputs, staff rosters sheets and BoQ Excel downloads</p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              onClick={() => refetchDocs()}
              variant="outline"
              size="sm"
              className="text-xs h-9 gap-1 text-secondary border-border bg-surface-2"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </Button>
            <Button
              onClick={handleGenerateAll}
              className="bg-brand-primary text-white text-xs font-bold h-9 px-4 rounded-xl"
            >
              <Play className="h-3.5 w-3.5" /> Generate All Documents
            </Button>
          </div>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        <Card className="p-4 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-default)] flex flex-col justify-between h-20">
          <span className="text-[9px] uppercase tracking-wider font-extrabold text-secondary block">Total Documents</span>
          <span className="text-sm font-black font-mono text-primary">{totalDocs} Files</span>
        </Card>
        <Card className="p-4 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-default)] flex flex-col justify-between h-20">
          <span className="text-[9px] uppercase tracking-wider font-extrabold text-secondary block">Generated Docs</span>
          <span className="text-sm font-black font-mono text-success">
            {generatedCount} ({totalDocs > 0 ? ((generatedCount / totalDocs) * 100).toFixed(0) : 0}%)
          </span>
        </Card>
        <Card className="p-4 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-default)] flex flex-col justify-between h-20">
          <span className="text-[9px] uppercase tracking-wider font-extrabold text-secondary block">Pending Rendering</span>
          <span className={`text-sm font-black font-mono ${pendingCount > 0 ? "text-amber-500 animate-pulse" : "text-tertiary"}`}>
            {pendingCount} ({totalDocs > 0 ? ((pendingCount / totalDocs) * 100).toFixed(0) : 0}%)
          </span>
        </Card>
        <Card className="p-4 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-default)] flex flex-col justify-between h-20">
          <span className="text-[9px] uppercase tracking-wider font-extrabold text-secondary block">Storage Footprint</span>
          <span className="text-sm font-black font-mono text-primary flex items-center gap-1">
            <HardDrive className="h-4 w-4 text-tertiary" /> {storageStr}
          </span>
        </Card>
        <Card className="p-4 rounded-2xl bg-[var(--bg-surface)] border border(--border-default) flex flex-col justify-between h-20 col-span-2 lg:col-span-1">
          <span className="text-[9px] uppercase tracking-wider font-extrabold text-secondary block">Last Rendering Time</span>
          <span className="text-sm font-black font-mono text-brand-primary flex items-center gap-1">
            <Clock className="h-4 w-4 text-brand-primary" /> Just Now
          </span>
        </Card>
      </div>

      {/* Documents Table */}
      <Card className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-3xl overflow-hidden text-xs font-semibold text-secondary">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-surface-2 border-b border-border text-secondary text-[10px]">
              <th className="p-3">Document Type</th>
              <th className="p-3">File Name</th>
              <th className="p-3 text-center">Version</th>
              <th className="p-3">Generated On</th>
              <th className="p-3">Generated By</th>
              <th className="p-3 text-right">Size</th>
              <th className="p-3 text-center">Status</th>
              <th className="p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {documents.map((doc: any, idx: number) => {
              const isPending = doc.status === "PENDING"
              const isFailed = doc.status === "FAILED"
              const isGenerated = doc.status === "GENERATED"
              
              const statusBadgeColor = 
                isGenerated ? "bg-success/10 text-success border-success/20" :
                isPending ? "bg-amber-500/10 text-amber-500 border-amber-500/20 animate-pulse" :
                "bg-danger/10 text-danger border-danger/20"

              return (
                <tr key={idx} className="border-b border-border/20 hover:bg-surface-hover/10 text-secondary">
                  <td className="p-3 text-primary flex items-center gap-2">
                    {doc.doc_type.includes("Excel") || doc.doc_type.includes("BOQ") ? (
                      <FileSpreadsheet className="h-4 w-4 text-emerald-500" />
                    ) : (
                      <FileText className="h-4 w-4 text-brand-primary" />
                    )}
                    {doc.doc_type}
                  </td>
                  <td className="p-3 font-mono text-tertiary text-[10px]">{doc.file_name || "Queued..."}</td>
                  <td className="p-3 text-center font-mono">{doc.version}</td>
                  <td className="p-3 text-tertiary font-mono">{doc.generated_at ? formatIST(doc.generated_at) : "Pending"}</td>
                  <td className="p-3 text-tertiary">Super Admin</td>
                  <td className="p-3 text-right font-mono">{(doc.file_size / 1024).toFixed(0)} KB</td>
                  <td className="p-3 text-center">
                    <Badge className={`text-[8px] font-black border uppercase ${statusBadgeColor}`}>
                      {doc.status}
                    </Badge>
                  </td>
                  <td className="p-3 text-right">
                    <div className="flex justify-end gap-1.5">
                      {isGenerated && (
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-tertiary hover:text-brand-primary">
                          <Download className="h-4 w-4" />
                        </Button>
                      )}
                      {isFailed && (
                        <Button onClick={handleGenerateAll} variant="ghost" size="icon" className="h-7 w-7 text-danger hover:bg-danger/10">
                          <RotateCcw className="h-4 w-4" />
                        </Button>
                      )}
                      {!isPending && (
                        <Button onClick={handleGenerateAll} variant="ghost" size="icon" className="h-7 w-7 text-tertiary hover:text-brand-primary">
                          <RotateCcw className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Card>
    </PageContainer>
  )
}
