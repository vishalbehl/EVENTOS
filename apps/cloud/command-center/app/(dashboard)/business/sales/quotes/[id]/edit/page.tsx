"use client"

import { useParams } from "next/navigation"
import QuoteForm from "@/components/quotes/QuoteForm"

export default function EditQuotePage() {
  const params = useParams()
  const id = params.id as string

  return <QuoteForm quoteId={id} />
}
