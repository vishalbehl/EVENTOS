"use client"

import { useEffect, useState } from "react"
import { CheckCircle2, FileCheck2, ShieldCheck, XCircle } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { useDecidePublicProposal, usePublicProposal } from "@/services/super-admin-service"

function money(value: string, currency: string) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 2 }).format(Number(value || 0))
}

export default function PublicProposalPage() {
  const [token, setToken] = useState("")
  const proposal = usePublicProposal(token)
  const decide = useDecidePublicProposal(token)
  const [decision, setDecision] = useState<"ACCEPTED" | "REJECTED">("ACCEPTED")
  const [signerName, setSignerName] = useState("")
  const [signerTitle, setSignerTitle] = useState("")
  const [reason, setReason] = useState("")
  const [consentConfirmed, setConsentConfirmed] = useState(false)
  const [idempotencyKey] = useState(() => `proposal-decision-${crypto.randomUUID()}`)

  useEffect(() => {
    const fragment = new URLSearchParams(window.location.hash.slice(1))
    setToken(fragment.get("token") || "")
  }, [])

  if (!token || proposal.isLoading) return <main className="grid min-h-screen place-items-center bg-[radial-gradient(circle_at_top,#17334d_0%,#071019_48%,#03070b_100%)] p-6 text-white"><p role="status" className="text-sm text-white/70">Verifying secure proposal link...</p></main>
  if (proposal.isError || !proposal.data) return <main className="grid min-h-screen place-items-center bg-[#050b10] p-6 text-white"><Card className="max-w-lg rounded-3xl border-white/10 bg-white/5 p-8 text-center"><XCircle className="mx-auto h-10 w-10 text-red-400" /><h1 className="mt-5 text-2xl font-black">This proposal link is unavailable</h1><p className="mt-3 text-sm text-white/60">The link may be invalid, expired, revoked, or already used. Contact the event organizer for a new review link.</p></Card></main>

  const snapshot = proposal.data.snapshot
  const submitDecision = () => {
    if (signerName.trim().length < 2 || reason.trim().length < 3 || !consentConfirmed) return
    decide.mutate({ decision, signerName: signerName.trim(), signerTitle: signerTitle.trim(), reason: reason.trim(), consentConfirmed, idempotencyKey })
  }

  if (decide.data) {
    const accepted = decide.data.decision === "ACCEPTED"
    const Icon = accepted ? CheckCircle2 : XCircle
    return <main className="grid min-h-screen place-items-center bg-[radial-gradient(circle_at_top,#17334d_0%,#071019_48%,#03070b_100%)] p-6 text-white"><Card className="max-w-xl rounded-3xl border-white/10 bg-white/5 p-8 text-center shadow-2xl"><Icon className={`mx-auto h-12 w-12 ${accepted ? "text-emerald-400" : "text-amber-400"}`} /><p className="mt-5 text-xs font-bold uppercase tracking-[0.2em] text-cyan-300">Decision recorded</p><h1 className="mt-2 text-3xl font-black">Proposal {decide.data.decision.toLowerCase()}</h1><p className="mt-3 text-sm text-white/60">Recorded for {decide.data.signer_name} on {new Date(decide.data.decided_at).toLocaleString()}. This decision is final for this proposal version.</p></Card></main>
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_15%_0%,rgba(22,128,164,0.25),transparent_30rem),linear-gradient(145deg,#07121b,#03070b)] px-4 py-10 text-white sm:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-col gap-5 border-b border-white/10 pb-7 lg:flex-row lg:items-end lg:justify-between"><div><div className="flex items-center gap-2 text-cyan-300"><ShieldCheck className="h-5 w-5" /><span className="text-xs font-black uppercase tracking-[0.2em]">Secure client review</span></div><h1 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl">{proposal.data.title}</h1><p className="mt-2 text-sm text-white/60">{proposal.data.proposal_number} / version {proposal.data.proposal_version} / prepared for {proposal.data.recipient_name}</p></div><div className="rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-sm text-white/70">Link expires {new Date(proposal.data.expires_at).toLocaleString()}</div></header>
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_390px]">
          <section className="space-y-6" aria-labelledby="commercial-scope-heading"><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[["Subtotal", snapshot.subtotal], ["Discount", snapshot.discount_amount], ["Tax", snapshot.tax_amount], ["Total", snapshot.total_amount]].map(([label, value]) => <Card key={label} className="rounded-2xl border-white/10 bg-white/5 p-5"><p className="text-xs font-bold uppercase tracking-wider text-white/45">{label}</p><p className="mt-2 text-xl font-black text-white">{money(value, snapshot.currency)}</p></Card>)}</div><Card className="overflow-hidden rounded-3xl border-white/10 bg-white/5"><div className="border-b border-white/10 p-6"><h2 id="commercial-scope-heading" className="text-xl font-black">Commercial scope</h2><p className="mt-1 text-sm text-white/55">This is the immutable approved quote snapshot supplied by the organizer.</p></div><div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left text-sm"><thead className="bg-white/5 text-xs uppercase tracking-wider text-white/45"><tr><th className="px-6 py-3">Item</th><th className="px-4 py-3">Category</th><th className="px-4 py-3 text-right">Qty</th><th className="px-4 py-3 text-right">Days</th><th className="px-4 py-3 text-right">Rate</th><th className="px-6 py-3 text-right">Amount</th></tr></thead><tbody>{snapshot.line_items.map(item => <tr key={`${item.sort_order}-${item.name}`} className="border-t border-white/10"><td className="px-6 py-4"><p className="font-bold">{item.name}</p>{item.description && <p className="mt-1 text-xs text-white/50">{item.description}</p>}</td><td className="px-4 py-4 text-white/65">{item.category}</td><td className="px-4 py-4 text-right text-white/65">{item.quantity}</td><td className="px-4 py-4 text-right text-white/65">{item.duration_days}</td><td className="px-4 py-4 text-right text-white/65">{money(item.unit_rate, snapshot.currency)}</td><td className="px-6 py-4 text-right font-black">{money(item.line_subtotal, snapshot.currency)}</td></tr>)}</tbody></table></div></Card></section>
          <aside><Card className="sticky top-6 rounded-3xl border-cyan-300/20 bg-[#091722]/95 p-6 shadow-2xl"><FileCheck2 className="h-7 w-7 text-cyan-300" /><h2 className="mt-4 text-xl font-black">Record your decision</h2><p className="mt-2 text-sm text-white/55">This records a bearer-link approval decision with access, device, and timing evidence. It is not a regulated digital signature.</p><fieldset className="mt-5 grid grid-cols-2 gap-3"><legend className="sr-only">Proposal decision</legend><Button type="button" variant={decision === "ACCEPTED" ? "primary" : "outline"} onClick={() => setDecision("ACCEPTED")}><CheckCircle2 className="mr-2 h-4 w-4" />Accept</Button><Button type="button" variant={decision === "REJECTED" ? "destructive" : "outline"} onClick={() => setDecision("REJECTED")}><XCircle className="mr-2 h-4 w-4" />Reject</Button></fieldset><div className="mt-5 space-y-4"><label className="block space-y-2 text-sm font-semibold text-white/70">Authorized signer name<input value={signerName} onChange={event => setSignerName(event.target.value)} className="w-full rounded-xl border border-white/10 bg-white/5 p-3 text-white" maxLength={200} /></label><label className="block space-y-2 text-sm font-semibold text-white/70">Title or role <span className="font-normal text-white/40">(optional)</span><input value={signerTitle} onChange={event => setSignerTitle(event.target.value)} className="w-full rounded-xl border border-white/10 bg-white/5 p-3 text-white" maxLength={200} /></label><label className="block space-y-2 text-sm font-semibold text-white/70">Decision reason<textarea value={reason} onChange={event => setReason(event.target.value)} className="min-h-24 w-full rounded-xl border border-white/10 bg-white/5 p-3 text-white" minLength={3} maxLength={1000} /></label><label className="flex items-start gap-3 text-sm text-white/65"><input type="checkbox" checked={consentConfirmed} onChange={event => setConsentConfirmed(event.target.checked)} className="mt-1 h-4 w-4" /><span>I confirm that I am authorized to record this decision and understand it is final for proposal version {proposal.data.proposal_version}.</span></label></div><Button className="mt-5 w-full" variant={decision === "REJECTED" ? "destructive" : "primary"} disabled={signerName.trim().length < 2 || reason.trim().length < 3 || !consentConfirmed || decide.isPending} onClick={submitDecision}>{decide.isPending ? "Recording decision..." : `${decision === "ACCEPTED" ? "Accept" : "Reject"} proposal`}</Button></Card></aside>
        </div>
      </div>
    </main>
  )
}
