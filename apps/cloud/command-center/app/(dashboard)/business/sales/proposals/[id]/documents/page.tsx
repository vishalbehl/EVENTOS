"use client"

import { useEffect } from "react"
import { useParams, useRouter, useSearchParams } from "next/navigation"

import { PageContainer } from "@/components/super-admin/ui/PageContainer"

export default function GeneratedDocumentsPage() {
  const params = useParams<{ id: string }>()
  const searchParams = useSearchParams()
  const router = useRouter()

  useEffect(() => {
    const organizationId = searchParams.get("organization_id")
    const query = organizationId ? `?organization_id=${organizationId}` : ""
    router.replace(`/business/sales/proposals/${params.id}/preview${query}`)
  }, [params.id, router, searchParams])

  return <PageContainer><p className="text-sm text-secondary" role="status">Opening the authorized proposal document workspace...</p></PageContainer>
}
