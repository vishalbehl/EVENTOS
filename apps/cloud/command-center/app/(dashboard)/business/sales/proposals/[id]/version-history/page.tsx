"use client"

import { useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { useProposalDetail, useProposalVersionHistory, useCreateProposalVersion } from "@/services/super-admin-service"
import { PageContainer } from "@/components/super-admin/ui/PageContainer"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { 
  ArrowLeft, GitCompare, Plus, ChevronRight, FileText, 
  Calendar, User, Layers, Sparkles, Check 
} from "lucide-react"
import { formatIST } from "@/lib/formatters"

export default function VersionHistoryPage() {
  const router = useRouter()
  const params = useParams()
  const propId = params.id as string

  // Fetch API
  const { data: proposal } = useProposalDetail(propId)
  const { data: versions = [], refetch: refetchVersions } = useProposalVersionHistory(propId)
  const createVersionMutation = useCreateProposalVersion(propId)

  const [selectedVerNum, setSelectedVerNum] = useState<string>("1.0")

  const currentVersion = versions.find((v: any) => v.version_number === selectedVerNum) || versions[0]

  const handleCreateNewVersion = async () => {
    const desc = prompt("Enter description for the new major version:")
    if (!desc) return
    await createVersionMutation.mutateAsync({
      description: desc,
      changes_count: Math.floor(Math.random() * 4 + 1)
    })
    refetchVersions()
  }

  return (
    <PageContainer>
      {/* Header bar */}
      <div className="flex flex-col gap-3 mb-6">
        <div className="flex items-center gap-2 text-xs text-tertiary">
          <span className="hover:text-primary cursor-pointer" onClick={() => router.push("/service-requests")}>Service Requests</span>
          <ChevronRight className="h-3 w-3" />
          <span className="text-primary font-extrabold uppercase tracking-wide">PRP-2025-0010</span>
          <ChevronRight className="h-3 w-3" />
          <span className="text-primary font-extrabold uppercase tracking-wide">Version History</span>
        </div>

        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
          <div>
            <h1 className="text-xl font-black text-primary flex items-center gap-2">
              <Button size="icon" variant="ghost" className="h-7 w-7 rounded-lg" onClick={() => router.back()}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
              Proposal Version Ledger
            </h1>
            <p className="text-[10px] text-tertiary">Audit document iterations, compare sections revisions, and manage client releases</p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="text-xs h-9 gap-1 text-secondary border-border bg-surface-2"
            >
              <GitCompare className="h-3.5 w-3.5" /> Compare Versions
            </Button>
            <Button
              onClick={handleCreateNewVersion}
              className="bg-brand-primary text-white text-xs font-bold h-9 px-4 rounded-xl"
            >
              <Plus className="h-3.5 w-3.5" /> Create New Version
            </Button>
          </div>
        </div>
      </div>

      {/* Timeline view block */}
      <Card className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-3xl p-6 mb-8 space-y-4">
        <span className="text-[10px] uppercase tracking-wider font-extrabold text-secondary block">
          Document Release Timeline
        </span>
        
        {/* Horizontal dot timeline */}
        <div className="flex items-center gap-6 overflow-x-auto pb-2">
          {versions.map((ver: any, idx: number) => {
            const isSelected = selectedVerNum === ver.version_number
            return (
              <div key={idx} className="flex items-center relative">
                <div 
                  onClick={() => setSelectedVerNum(ver.version_number)}
                  className="flex flex-col items-center gap-2 cursor-pointer group"
                >
                  <span className={`text-[8px] uppercase tracking-wider font-bold group-hover:text-brand-primary
                    ${isSelected ? "text-brand-primary" : "text-tertiary"}`}>
                    {ver.status}
                  </span>
                  <div className={`h-6 w-6 rounded-full border-2 flex items-center justify-center text-[10px] font-black transition-all
                    ${isSelected ? "bg-brand-primary border-brand-primary text-white scale-110 shadow-md" : "bg-surface-2 border-border text-tertiary"}`}>
                    {ver.version_number}
                  </div>
                </div>
                {idx < versions.length - 1 && (
                  <div className="w-16 h-[2px] bg-border/40 mt-4 ml-2" />
                )}
              </div>
            )}
          )}
        </div>
      </Card>

      {/* Main Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
        
        {/* Left Panel: Current Version Card */}
        <div className="xl:col-span-4 space-y-4">
          <span className="text-[10px] uppercase tracking-wider font-extrabold text-secondary block">
            Selected Version detail
          </span>

          {currentVersion && (
            <Card className="p-6 rounded-3xl bg-[var(--bg-surface)] border border-[var(--border-default)] space-y-4 flex flex-col justify-between h-52">
              <div className="flex justify-between items-start">
                <div>
                  <span className="text-[9px] uppercase tracking-wider font-extrabold text-tertiary">Version Code</span>
                  <h3 className="text-2xl font-black text-brand-primary">V {currentVersion.version_number}</h3>
                </div>
                <Badge className="bg-success/10 text-success border border-success/20 text-[8px] font-black uppercase">
                  {currentVersion.status}
                </Badge>
              </div>

              <div className="space-y-1.5 text-xs text-secondary font-semibold border-t border-border/40 pt-3">
                <div className="flex items-center gap-2"><Calendar className="h-4 w-4 text-tertiary" /> {formatIST(currentVersion.created_at)}</div>
                <div className="flex items-center gap-2"><User className="h-4 w-4 text-tertiary" /> Super Admin</div>
              </div>

              <p className="text-[10px] text-tertiary italic leading-relaxed pt-2 border-t border-border/20">
                "{currentVersion.description || 'No version comments provided.'}"
              </p>
            </Card>
          )}
        </div>

        {/* Right Panel: All Versions Table */}
        <div className="xl:col-span-8 bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-3xl overflow-hidden h-fit">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-surface-2 border-b border-border text-secondary text-[10px]">
                <th className="p-3">Version</th>
                <th className="p-3">Status</th>
                <th className="p-3">Created On</th>
                <th className="p-3">Description</th>
                <th className="p-3 text-center">Changes</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {versions.map((ver: any, idx: number) => {
                const isCurrent = ver.version_number === proposal?.version
                return (
                  <tr key={idx} className="border-b border-border/40 hover:bg-surface-hover/20 font-semibold text-secondary">
                    <td className="p-3 text-primary font-bold">V {ver.version_number}</td>
                    <td className="p-3">
                      <Badge className={`text-[8px] border uppercase ${isCurrent ? "bg-brand-primary/10 text-brand-primary border-brand-primary/20" : "bg-success/10 text-success border-success/20"}`}>
                        {isCurrent ? "Current" : ver.status}
                      </Badge>
                    </td>
                    <td className="p-3 text-tertiary font-mono">{formatIST(ver.created_at)}</td>
                    <td className="p-3 text-secondary truncate max-w-[150px]">{ver.description || "N/A"}</td>
                    <td className="p-3 text-center text-brand-primary font-bold">{ver.changes_count || 0} deltas</td>
                    <td className="p-3 text-right">
                      <Button variant="ghost" size="sm" className="text-[10px] text-brand-primary font-bold h-7">Download</Button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

      </div>
    </PageContainer>
  )
}
