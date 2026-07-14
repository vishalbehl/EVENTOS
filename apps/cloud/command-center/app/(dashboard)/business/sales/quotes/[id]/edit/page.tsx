"use client"

import { useParams, useSearchParams } from "next/navigation"

import QuoteForm from "@/components/quotes/QuoteForm"

export default function EditQuotePage() {
  const params = useParams<{ id: string }>()
  const searchParams = useSearchParams()
  return <QuoteForm quoteId={params.id} organizationId={searchParams.get("organization_id") || undefined} />
}
