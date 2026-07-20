"use client"

import { useParams, useRouter, useSearchParams } from "next/navigation"
import { ArrowLeft, FileText, ShieldCheck } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { PageContainer } from "@/components/super-admin/ui/PageContainer"
import { useProposalDetail, useProposalVersionHistory } from "@/services/super-admin-service"

export default function VersionHistoryPage() {
  const params = useParams<{ id: string }>()
  const searchParams = useSearchParams()
  const router = useRouter()
  const organizationId = searchParams.get("organization_id") || undefined
  const proposal = useProposalDetail(params.id, organizationId)
  const versions = useProposalVersionHistory(params.id, organizationId)

  if (proposal.isLoading || versions.isLoading) return <PageContainer><p className="text-sm text-secondary" role="status">Loading proposal version ledger...</p></PageContainer>
  if (proposal.isError || versions.isError || !proposal.data) return <PageContainer><p className="text-sm text-destructive" role="alert">The proposal version ledger could not be loaded.</p></PageContainer>

  return (
    <PageContainer>
      <div className="space-y-6">
        <header className="flex items-start gap-3 border-b border-border pb-5">
          <Button size="icon" variant="ghost" onClick={() => router.back()} aria-label="Go back"><ArrowLeft className="h-4 w-4" /></Button>
          <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-primary">Append-only evidence</p><h1 className="mt-1 text-2xl font-black text-primary">Proposal version ledger</h1><p className="mt-1 text-sm text-secondary">{proposal.data.proposal_number} / current version {proposal.data.current_version}</p></div>
        </header>

        <Card className="rounded-3xl border-border bg-surface p-6">
          <div className="flex gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 text-brand-primary" /><div><h2 className="font-black text-primary">Deterministic history</h2><p className="mt-1 text-sm text-secondary">Each entry records the exact approved quote snapshot, source version, author, reason, and creation time. Existing versions are never changed.</p></div></div>
        </Card>

        {versions.data?.length ? <ol className="space-y-4">
          {versions.data.map(version => <li key={version.id}><Card className="rounded-3xl border-border bg-surface p-6"><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div className="flex gap-3"><div className="rounded-xl bg-brand-primary/10 p-3"><FileText className="h-5 w-5 text-brand-primary" /></div><div><h2 className="font-black text-primary">Proposal version {version.version}</h2><p className="mt-1 text-sm text-secondary">Source quote {version.snapshot_json.quote_number} version {version.source_quote_version}</p></div></div><div className="text-left sm:text-right"><p className="text-lg font-black text-primary">{new Intl.NumberFormat("en-IN", { style: "currency", currency: version.snapshot_json.currency }).format(Number(version.snapshot_json.total_amount))}</p><p className="mt-1 text-xs text-tertiary">{new Date(version.created_at).toLocaleString()}</p></div></div><div className="mt-5 rounded-2xl border border-border bg-surface-2 p-4"><p className="text-xs font-bold uppercase tracking-wider text-tertiary">Creation reason</p><p className="mt-2 text-sm text-secondary">{version.reason}</p><p className="mt-3 text-xs text-tertiary">Created by {version.created_by}</p></div></Card></li>)}
        </ol> : <Card className="rounded-3xl border-dashed border-border bg-surface p-8"><p className="text-sm text-secondary">No persisted proposal versions were found.</p></Card>}
      </div>
    </PageContainer>
  )
}
