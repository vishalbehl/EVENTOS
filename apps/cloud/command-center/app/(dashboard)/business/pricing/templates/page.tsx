"use client"
import { useMemo } from "react"
import { useCatalogTemplates } from "@/services/super-admin-service"
import { PageContainer } from "@/components/super-admin/ui/PageContainer"
import { SectionHeader } from "@/components/super-admin/ui/SectionHeader"
import { MetricRow } from "@/components/super-admin/ui/MetricRow"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Layout, Users, Grid, ArrowRight, Library, Settings, CheckCircle2 } from "lucide-react"
import Link from "next/link"

export default function TemplatesLibraryDashboard() {
  const { data, isLoading } = useCatalogTemplates()

  const roomCount = data?.room_templates?.length ?? 0
  const regCount = data?.registration_templates?.length ?? 0
  const srrCount = data?.srr_templates?.length ?? 0

  const totalTemplates = roomCount + regCount + srrCount

  const recentTemplates = useMemo(() => {
    if (!data) return []
    const all = [
      ...(data.room_templates ?? []).map(t => ({ ...t, type: "Room Setup" })),
      ...(data.registration_templates ?? []).map(t => ({ ...t, type: "Registration counter" })),
      ...(data.srr_templates ?? []).map(t => ({ ...t, type: "Speaker Ready Room" })),
    ]
    return all.slice(0, 5)
  }, [data])

  return (
    <PageContainer>
      <SectionHeader
        title="Deployment Templates Library"
        description="Standardized presets for room planning, attendee registration desks, and Speaker Ready Stations"
      />

      <MetricRow metrics={[
        { label: "Total Reusable Presets", value: totalTemplates },
        { label: "Room Setups", value: roomCount },
        { label: "Registration Counters", value: regCount },
        { label: "Speaker Ready Rooms", value: srrCount },
      ]} />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4">
        {[
          {
            title: "Room Templates",
            desc: "Standard room deployment setups, podium counts, confidence monitors and seating styles.",
            count: roomCount,
            href: "/business/pricing/templates/room",
            icon: Layout,
            color: "text-purple-400 bg-purple-500/10 border-purple-500/20"
          },
          {
            title: "Registration Templates",
            desc: "Complete registration desk area designs, counter ratios, printers and self check-in kiosks.",
            count: regCount,
            href: "/business/pricing/templates/registration",
            icon: Users,
            color: "text-blue-400 bg-blue-500/10 border-blue-500/20"
          },
          {
            title: "SRR Templates",
            desc: "Speaker Ready Room station configurations, operators count, computers and workflow controls.",
            count: srrCount,
            href: "/business/pricing/templates/srr",
            icon: Grid,
            color: "text-indigo-400 bg-indigo-500/10 border-indigo-500/20"
          },
        ].map((sec) => (
          <Card key={sec.title} className="p-6 bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-3xl flex flex-col justify-between hover:border-brand-primary/45 transition-all">
            <div className="space-y-4">
              <div className={`p-3 rounded-2xl w-fit border ${sec.color}`}>
                <sec.icon className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-sm font-extrabold text-primary uppercase tracking-wide">{sec.title}</h3>
                <span className="text-[10px] text-tertiary font-bold font-mono block mt-1">{sec.count} Standard Presets</span>
              </div>
              <p className="text-xs text-secondary leading-relaxed">{sec.desc}</p>
            </div>
            <div className="pt-6">
              <Link href={sec.href}>
                <Button className="w-full bg-brand-primary text-white text-xs font-bold gap-2">
                  Configure Templates
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 pt-8">
        <div className="lg:col-span-2 bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-3xl p-6 space-y-4">
          <h3 className="text-xs font-extrabold uppercase tracking-widest text-secondary flex items-center gap-2">
            <Library className="h-4 w-4 text-brand-primary" />
            Standard Presets Library Overview
          </h3>
          <div className="space-y-3">
            {isLoading ? (
              <div className="text-xs text-secondary text-center py-6">Loading presets...</div>
            ) : recentTemplates.length === 0 ? (
              <div className="text-xs text-secondary text-center py-6">No presets found.</div>
            ) : (
              recentTemplates.map((t, idx) => (
                <div key={idx} className="flex justify-between items-center p-3 border border-border/40 rounded-2xl bg-surface-2/30 hover:bg-surface-2/65 transition-colors">
                  <div className="space-y-1">
                    <div className="flex gap-2 items-center">
                      <span className="text-xs font-bold text-primary">{t.name}</span>
                      <Badge variant="outline" className="text-[9px] px-1 py-0 border-border-subtle bg-surface-2 text-tertiary">{t.type}</Badge>
                    </div>
                    {t.description && <span className="text-[10px] text-secondary block line-clamp-1">{t.description}</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    {t.is_default && (
                      <Badge className="bg-success-muted/10 text-success border border-success/20 text-[9px] px-1.5 py-0 font-bold">Default</Badge>
                    )}
                    <span className="text-[10px] font-mono text-tertiary">Version {t.version}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="bg-[var(--bg-surface-2)] border border-[var(--border-default)] rounded-3xl p-6 flex flex-col justify-between">
          <div className="space-y-4">
            <h3 className="text-xs font-extrabold uppercase tracking-widest text-secondary flex items-center gap-2">
              <Settings className="h-4 w-4 text-tertiary" />
              Template Utility Ratios
            </h3>
            <p className="text-xs text-secondary leading-relaxed">
              Standard deployment presets enforce architectural and pricing constraints across all corporate quote pipelines:
            </p>
            <div className="space-y-3 text-xs">
              <div className="flex gap-3 items-start">
                <CheckCircle2 className="h-4 w-4 text-success shrink-0 mt-0.5" />
                <span className="text-secondary font-medium">Automatic hardware ratio provisioning during planning.</span>
              </div>
              <div className="flex gap-3 items-start">
                <CheckCircle2 className="h-4 w-4 text-success shrink-0 mt-0.5" />
                <span className="text-secondary font-medium">Pre-calculated operator headcount and supervisor requirements.</span>
              </div>
              <div className="flex gap-3 items-start">
                <CheckCircle2 className="h-4 w-4 text-success shrink-0 mt-0.5" />
                <span className="text-secondary font-medium">Room capacity and registration throughput alignment.</span>
              </div>
            </div>
          </div>
          <div className="pt-6 border-t border-[var(--border-subtle)] text-[10px] text-tertiary font-mono text-center">
            System templates are read-only for planners.
          </div>
        </div>
      </div>
    </PageContainer>
  )
}
