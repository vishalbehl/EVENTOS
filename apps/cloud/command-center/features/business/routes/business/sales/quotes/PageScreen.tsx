"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { FileText, Plus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { PageContainer } from "@/components/super-admin/ui/PageContainer"
import { useAdminOrgs, useAllQuotes } from "@/services/super-admin-service"


export default function QuotesPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const organizationId = searchParams.get("organization_id") || ""
  const organizations = useAdminOrgs({ limit: 250 })
  const quotes = useAllQuotes(undefined, undefined, organizationId)

  return (
    <PageContainer>
      <div className="space-y-6">
        <header className="flex flex-col gap-4 border-b border-border pb-5 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-primary">Business / Sales</p>
            <h1 className="mt-1 text-2xl font-black text-primary">Commercial quotes</h1>
            <p className="mt-1 text-sm text-secondary">Tenant-scoped draft quotes with immutable version history.</p>
          </div>
          <Button disabled={!organizationId} onClick={() => router.push(`/business/sales/quotes/create?organization_id=${organizationId}`)}>
            <Plus className="mr-2 h-4 w-4" />Create quote
          </Button>
        </header>

        <Card className="rounded-3xl border-border bg-surface p-5">
          <label className="block max-w-md space-y-2 text-sm font-semibold text-secondary">
            Organization scope
            <select className="h-10 w-full rounded-xl border border-border bg-surface-2 px-3 text-primary" value={organizationId} onChange={event => router.replace(event.target.value ? `/business/sales/quotes?organization_id=${event.target.value}` : "/business/sales/quotes")}>
              <option value="">Select organization</option>
              {(organizations.data || []).map(org => <option key={org.id} value={org.id}>{org.name}</option>)}
            </select>
          </label>
        </Card>

        {!organizationId ? (
          <Card className="rounded-3xl border-dashed border-border bg-surface p-12 text-center"><FileText className="mx-auto h-8 w-8 text-tertiary" /><p className="mt-3 font-bold text-primary">Choose an organization</p><p className="mt-1 text-sm text-secondary">Quotes are never pooled across tenant boundaries.</p></Card>
        ) : quotes.isLoading ? (
          <p className="text-sm text-secondary" role="status">Loading quotes...</p>
        ) : quotes.isError ? (
          <Card className="rounded-3xl border-destructive/30 bg-destructive/5 p-6"><p className="text-sm text-destructive" role="alert">Quotes could not be loaded.</p><Button className="mt-4" variant="outline" onClick={() => quotes.refetch()}>Retry</Button></Card>
        ) : !quotes.data?.length ? (
          <Card className="rounded-3xl border-dashed border-border bg-surface p-12 text-center"><FileText className="mx-auto h-8 w-8 text-tertiary" /><p className="mt-3 font-bold text-primary">No persisted quotes</p><p className="mt-1 text-sm text-secondary">Create the first draft for this organization.</p></Card>
        ) : (
          <Card className="overflow-hidden rounded-3xl border-border bg-surface">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-border bg-surface-2 text-xs uppercase tracking-wider text-secondary"><tr><th className="px-5 py-4">Quote</th><th className="px-5 py-4">Status</th><th className="px-5 py-4">Version</th><th className="px-5 py-4 text-right">Total</th><th className="px-5 py-4"><span className="sr-only">Actions</span></th></tr></thead>
                <tbody className="divide-y divide-border">
                  {quotes.data.map(quote => <tr key={quote.id}>
                    <td className="px-5 py-4"><p className="font-bold text-primary">{quote.title}</p><p className="text-xs text-secondary">{quote.quote_number}</p></td>
                    <td className="px-5 py-4 text-secondary">{quote.status}</td>
                    <td className="px-5 py-4 text-secondary">v{quote.version}</td>
                    <td className="px-5 py-4 text-right font-black text-primary">{new Intl.NumberFormat("en-IN", { style: "currency", currency: quote.currency }).format(Number(quote.total_amount))}</td>
                    <td className="px-5 py-4 text-right"><div className="flex justify-end gap-2">{quote.status === "DRAFT" && <Button size="sm" variant="outline" onClick={() => router.push(`/business/sales/quotes/${quote.id}/edit?organization_id=${organizationId}`)}>Edit</Button>}<Button size="sm" variant="outline" onClick={() => router.push(`/business/sales/quotes/${quote.id}/approval?organization_id=${organizationId}`)}>Approval</Button></div></td>
                  </tr>)}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </PageContainer>
  )
}
