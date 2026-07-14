"use client"

import { useSearchParams } from "next/navigation"

import QuoteForm from "@/components/quotes/QuoteForm"

export default function CreateQuotePage() {
  const searchParams = useSearchParams()
  return <QuoteForm organizationId={searchParams.get("organization_id") || undefined} />
}
