"use client"

import { FormEvent, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, Calculator, Plus, Save, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { PageContainer } from "@/components/super-admin/ui/PageContainer"
import {
  QuoteLineItemInput,
  QuotePayload,
  useAdminOrgs,
  useCalculateQuote,
  useCreateQuote,
  useOrgEvents,
  useQuoteDetail,
  useUpdateQuote,
} from "@/services/super-admin-service"


interface QuoteFormProps {
  quoteId?: string
  organizationId?: string
}

type EditableLineItem = QuoteLineItemInput & { _key: string }

const blankItem = (): EditableLineItem => ({
  _key: crypto.randomUUID(),
  category: "Services",
  name: "",
  description: "",
  quantity: 1,
  duration_days: 1,
  unit_rate: 0,
})

const money = (value: string | number | undefined, currency: string) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 2 }).format(Number(value || 0))

export default function QuoteForm({ quoteId, organizationId: initialOrganizationId }: QuoteFormProps) {
  const router = useRouter()
  const isEdit = Boolean(quoteId)
  const [organizationId, setOrganizationId] = useState(initialOrganizationId || "")
  const [eventId, setEventId] = useState("")
  const [title, setTitle] = useState("")
  const [currency, setCurrency] = useState("INR")
  const [validityDays, setValidityDays] = useState(30)
  const [discountType, setDiscountType] = useState<QuotePayload["discount_type"]>("NONE")
  const [discountValue, setDiscountValue] = useState(0)
  const [taxRate, setTaxRate] = useState(18)
  const [internalNotes, setInternalNotes] = useState("")
  const [revisionReason, setRevisionReason] = useState("")
  const [lineItems, setLineItems] = useState<EditableLineItem[]>([blankItem()])
  const [idempotencyKey] = useState(() => `quote-${crypto.randomUUID()}`)

  const organizations = useAdminOrgs({ limit: 250 })
  const events = useOrgEvents(organizationId)
  const quote = useQuoteDetail(quoteId || "", organizationId || initialOrganizationId)
  const createQuote = useCreateQuote()
  const updateQuote = useUpdateQuote(quoteId || "", organizationId)
  const calculateQuote = useCalculateQuote()

  useEffect(() => {
    if (!quote.data) return
    setOrganizationId(quote.data.organization_id)
    setEventId(quote.data.event_id)
    setTitle(quote.data.title)
    setCurrency(quote.data.currency)
    setValidityDays(quote.data.validity_days)
    setDiscountType(quote.data.discount_type)
    setDiscountValue(Number(quote.data.discount_value))
    setTaxRate(Number(quote.data.tax_rate))
    setInternalNotes(quote.data.internal_notes || "")
    setLineItems(quote.data.line_items.map(({ id, category, name, description, quantity, duration_days, unit_rate }) => ({
      _key: id,
      category,
      name,
      description,
      quantity: Number(quantity),
      duration_days,
      unit_rate: Number(unit_rate),
    })))
  }, [quote.data])

  const pricingPayload = {
    line_items: lineItems.map(({ _key, ...item }) => item),
    discount_type: discountType,
    discount_value: discountValue,
    tax_rate: taxRate,
  }
  const isValid = Boolean(organizationId && eventId && title.trim() && lineItems.length && lineItems.every(item => item.name.trim() && item.quantity > 0 && item.duration_days > 0 && item.unit_rate >= 0))

  const updateItem = (index: number, key: keyof QuoteLineItemInput, value: string | number) => {
    setLineItems(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item))
    calculateQuote.reset()
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!isValid) return
    if (isEdit) {
      if (!quote.data || revisionReason.trim().length < 3) return
      await updateQuote.mutateAsync({
        ...pricingPayload,
        title: title.trim(),
        currency,
        validity_days: validityDays,
        internal_notes: internalNotes || null,
        expected_version: quote.data.version,
        reason: revisionReason.trim(),
      })
    } else {
      await createQuote.mutateAsync({
        idempotencyKey,
        payload: {
          ...pricingPayload,
          organization_id: organizationId,
          event_id: eventId,
          title: title.trim(),
          currency,
          validity_days: validityDays,
          internal_notes: internalNotes || null,
        },
      })
    }
    router.push(`/business/sales/quotes?organization_id=${organizationId}`)
  }

  if (isEdit && quote.isLoading) {
    return <PageContainer><p className="text-sm text-secondary" role="status">Loading quote...</p></PageContainer>
  }
  if (isEdit && quote.isError) {
    return <PageContainer><p className="text-sm text-destructive" role="alert">The quote could not be loaded. Confirm the organization context and try again.</p></PageContainer>
  }

  return (
    <PageContainer>
      <form onSubmit={submit} className="space-y-6">
        <header className="flex flex-col gap-4 border-b border-border pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex items-start gap-3">
            <Button type="button" size="icon" variant="ghost" onClick={() => router.back()} aria-label="Go back">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-primary">Commercial workspace</p>
              <h1 className="mt-1 text-2xl font-black text-primary">{isEdit ? `Edit ${quote.data?.quote_number}` : "Create draft quote"}</h1>
              <p className="mt-1 text-sm text-secondary">Persisted line items, server-calculated totals, and immutable revisions.</p>
            </div>
          </div>
          <Button type="submit" disabled={!isValid || createQuote.isPending || updateQuote.isPending || (isEdit && revisionReason.trim().length < 3)}>
            <Save className="mr-2 h-4 w-4" />{isEdit ? "Save revision" : "Create draft"}
          </Button>
        </header>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-6">
            <Card className="grid gap-5 rounded-3xl border-border bg-surface p-6 md:grid-cols-2">
              <label className="space-y-2 text-sm font-semibold text-secondary">
                Organization
                <select className="h-10 w-full rounded-xl border border-border bg-surface-2 px-3 text-primary" value={organizationId} onChange={event => { setOrganizationId(event.target.value); setEventId("") }} disabled={isEdit} required>
                  <option value="">Select organization</option>
                  {(organizations.data || []).map(org => <option key={org.id} value={org.id}>{org.name}</option>)}
                </select>
              </label>
              <label className="space-y-2 text-sm font-semibold text-secondary">
                Event
                <select className="h-10 w-full rounded-xl border border-border bg-surface-2 px-3 text-primary" value={eventId} onChange={event => setEventId(event.target.value)} disabled={!organizationId || isEdit} required>
                  <option value="">Select event</option>
                  {(events.data || []).map(event => <option key={event.id} value={event.id}>{event.name}</option>)}
                </select>
              </label>
              <label className="space-y-2 text-sm font-semibold text-secondary md:col-span-2">
                Quote title
                <Input value={title} onChange={event => setTitle(event.target.value)} maxLength={255} required />
              </label>
              <label className="space-y-2 text-sm font-semibold text-secondary">
                Currency
                <select className="h-10 w-full rounded-xl border border-border bg-surface-2 px-3 text-primary" value={currency} onChange={event => setCurrency(event.target.value)}>
                  <option value="INR">INR</option><option value="USD">USD</option><option value="EUR">EUR</option><option value="GBP">GBP</option>
                </select>
              </label>
              <label className="space-y-2 text-sm font-semibold text-secondary">
                Validity days
                <Input type="number" min={1} max={365} value={validityDays} onChange={event => setValidityDays(Number(event.target.value))} required />
              </label>
            </Card>

            <Card className="rounded-3xl border-border bg-surface p-6">
              <div className="mb-5 flex items-center justify-between">
                <div><h2 className="text-lg font-black text-primary">Line items</h2><p className="text-sm text-secondary">Quantity x duration x unit rate.</p></div>
                <Button type="button" variant="outline" onClick={() => setLineItems(items => [...items, blankItem()])}><Plus className="mr-2 h-4 w-4" />Add item</Button>
              </div>
              <div className="space-y-4">
                {lineItems.map((item, index) => (
                  <fieldset key={item._key} className="grid gap-3 rounded-2xl border border-border bg-surface-2 p-4 md:grid-cols-12">
                    <legend className="sr-only">Line item {index + 1}</legend>
                    <label className="space-y-1 text-xs font-bold text-secondary md:col-span-3">Category<Input value={item.category} onChange={event => updateItem(index, "category", event.target.value)} required /></label>
                    <label className="space-y-1 text-xs font-bold text-secondary md:col-span-5">Name<Input value={item.name} onChange={event => updateItem(index, "name", event.target.value)} required /></label>
                    <label className="space-y-1 text-xs font-bold text-secondary md:col-span-2">Quantity<Input type="number" min="0.01" step="0.01" value={item.quantity} onChange={event => updateItem(index, "quantity", Number(event.target.value))} required /></label>
                    <Button type="button" variant="ghost" className="self-end text-destructive md:col-span-2" onClick={() => { setLineItems(items => items.filter((_, itemIndex) => itemIndex !== index)); calculateQuote.reset() }} disabled={lineItems.length === 1}><Trash2 className="mr-2 h-4 w-4" />Remove</Button>
                    <label className="space-y-1 text-xs font-bold text-secondary md:col-span-3">Duration days<Input type="number" min={1} max={3650} value={item.duration_days} onChange={event => updateItem(index, "duration_days", Number(event.target.value))} required /></label>
                    <label className="space-y-1 text-xs font-bold text-secondary md:col-span-3">Unit rate<Input type="number" min={0} step="0.01" value={item.unit_rate} onChange={event => updateItem(index, "unit_rate", Number(event.target.value))} required /></label>
                    <label className="space-y-1 text-xs font-bold text-secondary md:col-span-6">Description<Input value={item.description || ""} onChange={event => updateItem(index, "description", event.target.value)} /></label>
                  </fieldset>
                ))}
              </div>
            </Card>
          </div>

          <aside className="space-y-5">
            <Card className="rounded-3xl border-border bg-surface p-6">
              <h2 className="text-lg font-black text-primary">Commercial terms</h2>
              <div className="mt-5 space-y-4">
                <label className="space-y-2 text-sm font-semibold text-secondary">Discount type<select className="h-10 w-full rounded-xl border border-border bg-surface-2 px-3 text-primary" value={discountType} onChange={event => { setDiscountType(event.target.value as QuotePayload["discount_type"]); setDiscountValue(0); calculateQuote.reset() }}><option value="NONE">None</option><option value="PERCENTAGE">Percentage</option><option value="FIXED">Fixed amount</option></select></label>
                <label className="space-y-2 text-sm font-semibold text-secondary">Discount value<Input type="number" min={0} max={discountType === "PERCENTAGE" ? 100 : undefined} step="0.01" value={discountValue} disabled={discountType === "NONE"} onChange={event => { setDiscountValue(Number(event.target.value)); calculateQuote.reset() }} /></label>
                <label className="space-y-2 text-sm font-semibold text-secondary">Tax rate (%)<Input type="number" min={0} max={100} step="0.01" value={taxRate} onChange={event => { setTaxRate(Number(event.target.value)); calculateQuote.reset() }} /></label>
                <label className="space-y-2 text-sm font-semibold text-secondary">Internal notes<textarea className="min-h-24 w-full rounded-xl border border-border bg-surface-2 p-3 text-sm text-primary" value={internalNotes} onChange={event => setInternalNotes(event.target.value)} maxLength={10000} /></label>
                {isEdit && <label className="space-y-2 text-sm font-semibold text-secondary">Revision reason<Input value={revisionReason} onChange={event => setRevisionReason(event.target.value)} minLength={3} maxLength={500} required /></label>}
              </div>
            </Card>

            <Card className="rounded-3xl border-brand-primary/30 bg-brand-primary/5 p-6">
              <div className="flex items-center justify-between"><h2 className="text-lg font-black text-primary">Server totals</h2><Calculator className="h-5 w-5 text-brand-primary" /></div>
              <Button type="button" variant="outline" className="mt-4 w-full" disabled={!isValid || calculateQuote.isPending} onClick={() => calculateQuote.mutate(pricingPayload)}>Recalculate</Button>
              {calculateQuote.data ? <dl className="mt-5 space-y-3 text-sm">
                <div className="flex justify-between"><dt className="text-secondary">Subtotal</dt><dd className="font-bold text-primary">{money(calculateQuote.data.subtotal, currency)}</dd></div>
                <div className="flex justify-between"><dt className="text-secondary">Discount</dt><dd className="font-bold text-primary">-{money(calculateQuote.data.discount_amount, currency)}</dd></div>
                <div className="flex justify-between"><dt className="text-secondary">Tax</dt><dd className="font-bold text-primary">{money(calculateQuote.data.tax_amount, currency)}</dd></div>
                <div className="flex justify-between border-t border-border pt-3 text-base"><dt className="font-black text-primary">Total</dt><dd className="font-black text-brand-primary">{money(calculateQuote.data.total_amount, currency)}</dd></div>
              </dl> : <p className="mt-4 text-xs text-secondary">Recalculate to preview the authoritative backend result. Saving always recalculates again.</p>}
              {calculateQuote.isError && <p className="mt-3 text-sm text-destructive" role="alert">Totals could not be calculated.</p>}
            </Card>
          </aside>
        </div>
      </form>
    </PageContainer>
  )
}
