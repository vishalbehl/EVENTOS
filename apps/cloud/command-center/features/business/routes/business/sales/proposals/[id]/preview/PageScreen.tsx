"use client"

import { useState } from "react"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import { ArrowLeft, Ban, CheckCircle2, Clock3, Copy, Download, FileText, History, RefreshCw, Share2, XCircle } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { PageContainer } from "@/components/super-admin/ui/PageContainer"
import {
  downloadProposalDocument,
  useGenerateProposalDocument,
  useProposalDetail,
  useProposalDocuments,
  useProposalShares,
  useCreateProposalShare,
  useRevokeProposalShare,
  useSendProposalToOrganiser,
} from "@/services/super-admin-service"
import { toast } from "sonner"

function money(value: string, currency: string) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 2 }).format(Number(value || 0))
}

export default function ProposalPreviewPage() {
  const params = useParams<{ id: string }>()
  const searchParams = useSearchParams()
  const router = useRouter()
  const organizationId = searchParams.get("organization_id") || undefined
  const proposal = useProposalDetail(params.id, organizationId)
  const documents = useProposalDocuments(params.id, organizationId)
  const generateDocument = useGenerateProposalDocument(params.id, organizationId)
  const shares = useProposalShares(params.id, organizationId)
  const createShare = useCreateProposalShare(params.id, organizationId)
  const revokeShare = useRevokeProposalShare(params.id, organizationId)
  const sendProposal = useSendProposalToOrganiser(params.id, organizationId)
  const [generationReason, setGenerationReason] = useState("")
  const [generationKey] = useState(() => `proposal-document-${crypto.randomUUID()}`)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [recipientName, setRecipientName] = useState("")
  const [recipientEmail, setRecipientEmail] = useState("")
  const [shareReason, setShareReason] = useState("")
  const [expiresInHours, setExpiresInHours] = useState(72)
  const [shareKey, setShareKey] = useState(() => `proposal-share-${crypto.randomUUID()}`)
  const [createdLink, setCreatedLink] = useState("")
  const [revocationReason, setRevocationReason] = useState("")
  const [sendReason, setSendReason] = useState("")
  const [sendKey] = useState(() => `proposal-send-${crypto.randomUUID()}`)
  const [revocationKeys, setRevocationKeys] = useState<Record<string, string>>({})

  const currentVersion = proposal.data?.versions.find(version => version.version === proposal.data.current_version)
  const snapshot = currentVersion?.snapshot_json
  const organizationQuery = organizationId ? `?organization_id=${organizationId}` : ""

  const generate = () => {
    if (!proposal.data || generationReason.trim().length < 3) return
    generateDocument.mutate({
      expectedVersion: proposal.data.current_version,
      reason: generationReason.trim(),
      idempotencyKey: generationKey,
    })
  }

  const download = async (exportId: string) => {
    setDownloadingId(exportId)
    try {
      const result = await downloadProposalDocument(params.id, exportId, organizationId)
      window.location.assign(result.download_url)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Proposal download failed")
    } finally {
      setDownloadingId(null)
    }
  }

  const issueShare = () => {
    if (!proposal.data || recipientName.trim().length < 2 || !recipientEmail.includes("@") || shareReason.trim().length < 3) return
    createShare.mutate({
      expectedVersion: proposal.data.current_version,
      recipientName: recipientName.trim(),
      recipientEmail: recipientEmail.trim(),
      expiresInHours,
      reason: shareReason.trim(),
      idempotencyKey: shareKey,
    }, {
      onSuccess: async result => {
        const link = `${window.location.origin}/proposal-share#token=${encodeURIComponent(result.token)}`
        setCreatedLink(link)
        try {
          await navigator.clipboard.writeText(link)
          toast.success("Secure client link copied")
        } catch {
          toast.info("Secure link created. Copy it from the field below.")
        }
      },
    })
  }

  const resetShareForm = () => {
    setRecipientName("")
    setRecipientEmail("")
    setShareReason("")
    setCreatedLink("")
    setShareKey(`proposal-share-${crypto.randomUUID()}`)
  }

  const revoke = (shareId: string) => {
    if (revocationReason.trim().length < 3) return
    const key = revocationKeys[shareId] || `proposal-revoke-${crypto.randomUUID()}`
    if (!revocationKeys[shareId]) setRevocationKeys(current => ({ ...current, [shareId]: key }))
    revokeShare.mutate({ shareId, reason: revocationReason.trim(), idempotencyKey: key })
  }

  if (proposal.isLoading) return <PageContainer><p className="text-sm text-secondary" role="status">Loading immutable proposal...</p></PageContainer>
  if (proposal.isError || !proposal.data || !snapshot) return <PageContainer><p className="text-sm text-destructive" role="alert">The proposal could not be loaded.</p></PageContainer>

  return (
    <PageContainer>
      <div className="space-y-6">
        <header className="flex flex-col gap-4 border-b border-border pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex items-start gap-3">
            <Button size="icon" variant="ghost" onClick={() => router.back()} aria-label="Go back"><ArrowLeft className="h-4 w-4" /></Button>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-primary">Immutable client proposal</p>
              <h1 className="mt-1 text-2xl font-black text-primary">{proposal.data.title}</h1>
              <p className="mt-1 text-sm text-secondary">{proposal.data.proposal_number} / proposal v{proposal.data.current_version} / quote {snapshot.quote_number} v{snapshot.version}</p>
            </div>
          </div>
          <Button variant="outline" onClick={() => router.push(`/business/sales/proposals/${params.id}/version-history${organizationQuery}`)}><History className="mr-2 h-4 w-4" />Version ledger</Button>
        </header>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="space-y-6">
            <Card className="rounded-3xl border-border bg-surface p-6">
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                <div><p className="text-xs font-bold uppercase tracking-wider text-tertiary">Subtotal</p><p className="mt-2 text-lg font-black text-primary">{money(snapshot.subtotal, snapshot.currency)}</p></div>
                <div><p className="text-xs font-bold uppercase tracking-wider text-tertiary">Discount</p><p className="mt-2 text-lg font-black text-primary">{money(snapshot.discount_amount, snapshot.currency)}</p></div>
                <div><p className="text-xs font-bold uppercase tracking-wider text-tertiary">Tax</p><p className="mt-2 text-lg font-black text-primary">{money(snapshot.tax_amount, snapshot.currency)}</p></div>
                <div><p className="text-xs font-bold uppercase tracking-wider text-tertiary">Approved total</p><p className="mt-2 text-lg font-black text-brand-primary">{money(snapshot.total_amount, snapshot.currency)}</p></div>
              </div>
            </Card>

            <Card className="overflow-hidden rounded-3xl border-border bg-surface">
              <div className="border-b border-border p-6"><h2 className="text-lg font-black text-primary">Approved commercial scope</h2><p className="mt-1 text-sm text-secondary">Rendered from the persisted proposal snapshot. Values are never recalculated in the browser.</p></div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="bg-surface-2 text-xs uppercase tracking-wider text-tertiary"><tr><th className="px-6 py-3">Item</th><th className="px-4 py-3">Category</th><th className="px-4 py-3 text-right">Qty</th><th className="px-4 py-3 text-right">Days</th><th className="px-4 py-3 text-right">Rate</th><th className="px-6 py-3 text-right">Amount</th></tr></thead>
                  <tbody>
                    {snapshot.line_items.map(item => <tr key={`${item.sort_order}-${item.name}`} className="border-t border-border"><td className="px-6 py-4"><p className="font-bold text-primary">{item.name}</p>{item.description && <p className="mt-1 text-xs text-secondary">{item.description}</p>}</td><td className="px-4 py-4 text-secondary">{item.category}</td><td className="px-4 py-4 text-right text-secondary">{item.quantity}</td><td className="px-4 py-4 text-right text-secondary">{item.duration_days}</td><td className="px-4 py-4 text-right text-secondary">{money(item.unit_rate, snapshot.currency)}</td><td className="px-6 py-4 text-right font-black text-primary">{money(item.line_subtotal, snapshot.currency)}</td></tr>)}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>

          <aside className="space-y-6">
            <Card className="rounded-3xl border-brand-primary/30 bg-brand-primary/5 p-6">
              <Share2 className="h-7 w-7 text-brand-primary" />
              <h2 className="mt-3 text-lg font-black text-primary">Secure client review</h2>
              <p className="mt-1 text-sm text-secondary">Issue a version-bound bearer link. Creation and revocation require recent step-up authentication.</p>
              {createdLink ? <div className="mt-5 space-y-3"><label className="block space-y-2 text-sm font-semibold text-secondary">One-time client link<input readOnly value={createdLink} className="w-full rounded-xl border border-border bg-surface p-3 text-xs text-primary" /></label><div className="grid grid-cols-2 gap-2"><Button variant="outline" onClick={() => navigator.clipboard.writeText(createdLink)}><Copy className="mr-2 h-4 w-4" />Copy</Button><Button onClick={resetShareForm}>Create another</Button></div></div> : <div className="mt-5 space-y-3">
                <label className="block space-y-2 text-sm font-semibold text-secondary">Recipient name<input value={recipientName} onChange={event => setRecipientName(event.target.value)} className="w-full rounded-xl border border-border bg-surface p-3 text-primary" maxLength={200} /></label>
                <label className="block space-y-2 text-sm font-semibold text-secondary">Recipient email<input type="email" value={recipientEmail} onChange={event => setRecipientEmail(event.target.value)} className="w-full rounded-xl border border-border bg-surface p-3 text-primary" maxLength={320} /></label>
                <label className="block space-y-2 text-sm font-semibold text-secondary">Expires after<select value={expiresInHours} onChange={event => setExpiresInHours(Number(event.target.value))} className="w-full rounded-xl border border-border bg-surface p-3 text-primary"><option value={24}>24 hours</option><option value={72}>3 days</option><option value={168}>7 days</option><option value={720}>30 days</option></select></label>
                <label className="block space-y-2 text-sm font-semibold text-secondary">Sharing reason<textarea value={shareReason} onChange={event => setShareReason(event.target.value)} className="min-h-20 w-full rounded-xl border border-border bg-surface p-3 text-primary" minLength={3} maxLength={500} /></label>
                <Button className="w-full" disabled={proposal.data.status === "ACCEPTED" || proposal.data.status === "REJECTED" || recipientName.trim().length < 2 || !recipientEmail.includes("@") || shareReason.trim().length < 3 || createShare.isPending} onClick={issueShare}>{createShare.isPending ? "Creating secure link..." : "Create client review link"}</Button>
              </div>}
            </Card>

            <Card className="rounded-3xl border-border bg-surface p-6">
              <h2 className="text-lg font-black text-primary">Client link ledger</h2>
              <label className="mt-4 block space-y-2 text-xs font-semibold text-secondary">Revocation reason<textarea value={revocationReason} onChange={event => setRevocationReason(event.target.value)} className="min-h-16 w-full rounded-xl border border-border bg-surface-2 p-3 text-primary" minLength={3} maxLength={500} /></label>
              {shares.isLoading ? <p className="mt-4 text-sm text-secondary" role="status">Loading client links...</p> : shares.isError ? <p className="mt-4 text-sm text-destructive" role="alert">Client links could not be loaded.</p> : shares.data?.length ? <ul className="mt-4 space-y-3">{shares.data.map(share => <li key={share.id} className="rounded-2xl border border-border bg-surface-2 p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-black text-primary">{share.recipient_name}</p><p className="mt-1 text-xs text-secondary">{share.recipient_email}</p><p className="mt-2 text-xs font-bold uppercase tracking-wider text-brand-primary">{share.status} / {share.access_count} views</p><p className="mt-1 text-xs text-tertiary">Expires {new Date(share.expires_at).toLocaleString()}</p></div>{share.status === "ACTIVE" && <Button size="icon" variant="ghost" aria-label={`Revoke link for ${share.recipient_name}`} disabled={revocationReason.trim().length < 3 || revokeShare.isPending} onClick={() => revoke(share.id)}><Ban className="h-4 w-4" /></Button>}</div>{share.decision && <p className="mt-3 text-xs text-secondary">{share.decision} by {share.signer_name} at {share.decided_at ? new Date(share.decided_at).toLocaleString() : "Not recorded"}</p>}{share.revocation_reason && <p className="mt-3 text-xs text-destructive">{share.revocation_reason}</p>}</li>)}</ul> : <p className="mt-4 text-sm text-secondary">No client links have been issued.</p>}
            </Card>

            <Card className="rounded-3xl border-brand-primary/30 bg-brand-primary/5 p-6">
              <CheckCircle2 className="h-7 w-7 text-brand-primary" />
              <h2 className="mt-3 text-lg font-black text-primary">Send to organiser portal</h2>
              <p className="mt-1 text-sm text-secondary">Freeze this approved snapshot and make it available inside the authenticated organiser workspace.</p>
              <label className="mt-5 block space-y-2 text-sm font-semibold text-secondary">Send reason<textarea className="min-h-20 w-full rounded-xl border border-border bg-surface p-3 text-primary" value={sendReason} onChange={event => setSendReason(event.target.value)} minLength={3} maxLength={500} /></label>
              <Button className="mt-4 w-full" disabled={proposal.data.status !== "DRAFT" || sendReason.trim().length < 3 || sendProposal.isPending} onClick={() => sendProposal.mutate({ expectedVersion: proposal.data.current_version, reason: sendReason.trim(), idempotencyKey: sendKey })}>{sendProposal.isPending ? "Sending..." : "Send proposal"}</Button>
            </Card>

            <Card className="rounded-3xl border-brand-primary/30 bg-brand-primary/5 p-6">
              <FileText className="h-7 w-7 text-brand-primary" />
              <h2 className="mt-3 text-lg font-black text-primary">Generate proposal PDF</h2>
              <p className="mt-1 text-sm text-secondary">The worker renders this exact immutable version. The generated file expires after the configured retention period.</p>
              <label className="mt-5 block space-y-2 text-sm font-semibold text-secondary">Generation reason<textarea className="min-h-24 w-full rounded-xl border border-border bg-surface p-3 text-primary" value={generationReason} onChange={event => setGenerationReason(event.target.value)} minLength={3} maxLength={500} /></label>
              <Button className="mt-4 w-full" disabled={generationReason.trim().length < 3 || generateDocument.isPending} onClick={generate}><RefreshCw className="mr-2 h-4 w-4" />{generateDocument.isPending ? "Queuing..." : `Generate version ${proposal.data.current_version} PDF`}</Button>
            </Card>

            <Card className="rounded-3xl border-border bg-surface p-6">
              <h2 className="text-lg font-black text-primary">Document history</h2>
              {documents.isLoading ? <p className="mt-4 text-sm text-secondary" role="status">Loading document jobs...</p> : documents.isError ? <p className="mt-4 text-sm text-destructive" role="alert">Document jobs could not be loaded.</p> : documents.data?.length ? (
                <ul className="mt-4 space-y-3">
                  {documents.data.map(document => {
                    const Icon = document.status === "COMPLETED" ? CheckCircle2 : document.status === "FAILED" ? XCircle : Clock3
                    return <li key={document.export_id} className="rounded-2xl border border-border bg-surface-2 p-4"><div className="flex items-start justify-between gap-3"><div className="flex gap-3"><Icon className="mt-0.5 h-4 w-4 text-brand-primary" /><div><p className="text-sm font-black text-primary">Proposal v{document.proposal_version} PDF</p><p className="mt-1 text-xs text-secondary">{document.status} / {new Date(document.created_at).toLocaleString()}</p></div></div>{document.status === "COMPLETED" && <Button size="icon" variant="ghost" aria-label={`Download proposal version ${document.proposal_version}`} disabled={downloadingId === document.export_id} onClick={() => download(document.export_id)}><Download className="h-4 w-4" /></Button>}</div>{document.failure_reason && <p className="mt-3 text-xs text-destructive">{document.failure_reason}</p>}</li>
                  })}
                </ul>
              ) : <p className="mt-4 text-sm text-secondary">No proposal documents have been generated yet.</p>}
            </Card>
          </aside>
        </div>
      </div>
    </PageContainer>
  )
}
