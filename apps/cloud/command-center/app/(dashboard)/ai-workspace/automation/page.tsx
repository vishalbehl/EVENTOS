"use client"

import React from "react"
import { PageContainer } from "@/components/super-admin/ui/PageContainer"
import { SectionHeader } from "@/components/super-admin/ui/SectionHeader"
import { SlidersHorizontal } from "lucide-react"

export default function AILimitsPage() {
  return (
    <PageContainer>
      <SectionHeader title="Usage Limits" description="Define tenant-level tokens quotas, spending ceilings, and throttling policies." />
      <div className="flex flex-col items-center justify-center py-20 bg-surface border border-border rounded-xl mt-6">
        <SlidersHorizontal className="h-12 w-12 text-tertiary mb-3 animate-pulse" />
        <h3 className="text-sm font-bold text-primary mb-1">AI Usage Limits not configured</h3>
        <p className="text-xs text-secondary">Set up token quota limits and credit rules for tenant groups.</p>
      </div>
    </PageContainer>
  )
}
