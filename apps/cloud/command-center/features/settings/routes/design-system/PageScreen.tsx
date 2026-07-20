"use client";

import { Activity, AlertTriangle, Database, Plus, RefreshCw, ShieldCheck } from "lucide-react";
import { useState } from "react";

import { PageHeader } from "@/components/layout/PageHeader";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { AsyncState, PermissionDenied, RecoverableError } from "@/components/super-admin/ui/AsyncState";
import { ConfirmDestructiveAction } from "@/components/super-admin/ui/ConfirmDestructiveAction";
import { FormField, ServerErrorSummary } from "@/components/super-admin/ui/FormField";
import { KpiCard } from "@/components/super-admin/ui/KpiCard";
import { ActionToolbar, AuditPanel, KpiGrid, OperationalTimeline } from "@/components/super-admin/ui/OperationalPrimitives";
import { OperationalStatusRail } from "@/components/super-admin/ui/OperationalStatusRail";
import { StatusBadge } from "@/components/super-admin/ui/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PremiumAssetIcon, type PremiumAssetKey } from "@/components/super-admin/ui/PremiumAssetIcon";
import { PremiumObjectCard } from "@/components/super-admin/ui/PremiumObjectCard";

const tokenGroups = [
  { title: "Surfaces", tokens: ["--bg-base", "--bg-surface", "--bg-surface-2", "--border-default"] },
  { title: "Status", tokens: ["--status-success", "--status-info", "--status-warning", "--status-danger"] },
  { title: "Charts", tokens: ["--chart-1", "--chart-2", "--chart-3", "--chart-5"] },
];

const assetKeys: PremiumAssetKey[] = ["document", "spreadsheet", "presentation", "invoice", "proposal", "organization", "subscription", "integration", "deployment", "database", "security", "workflow"];

export default function DesignSystemCataloguePage() {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [showError, setShowError] = useState(true);

  return (
    <PageWrapper labelledBy="design-system-title" className="max-w-[1600px]">
      <PageHeader id="design-system-title" title="Command Center interface standards" description="The production component catalogue for operator-facing pages. These patterns encode accessibility, responsive behavior, status meaning, and audit expectations.">
        <ActionToolbar label="Catalogue controls">
          <Button variant="outline" onClick={() => setShowError((value) => !value)}><RefreshCw aria-hidden className="mr-2 size-4" />Toggle error example</Button>
          <Button onClick={() => setConfirmOpen(true)}><Plus aria-hidden className="mr-2 size-4" />Open confirmation</Button>
        </ActionToolbar>
      </PageHeader>

      <div className="space-y-8">
        <section aria-labelledby="assets-title" className="space-y-4">
          <div><h2 id="assets-title" className="text-lg font-semibold">Premium object language</h2><p className="mt-1 text-sm text-[var(--text-secondary)]">Sculpted, theme-aware assets identify detailed cards without turning routine controls into decoration.</p></div>
          <div className="grid grid-cols-3 gap-3 rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 shadow-[var(--shadow-panel)] sm:grid-cols-6 xl:grid-cols-12">
            {assetKeys.map((assetKey, index) => <div key={assetKey} className="flex flex-col items-center gap-2"><PremiumAssetIcon assetKey={assetKey} tone={(["neutral", "blue", "green", "amber", "red", "violet"] as const)[index % 6]} size="lg" /><span className="text-[10px] capitalize text-[var(--text-secondary)]">{assetKey}</span></div>)}
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <PremiumObjectCard assetKey="proposal" tone="blue" title="Enterprise service proposal" description="Commercial scope, venue allocations, and approval history." status={<StatusBadge status="active" />} metadata="v4 · Updated 12 min ago" />
            <PremiumObjectCard assetKey="invoice" tone="green" title="INV-2026-0842" description="Meridian Conferences · July platform subscription." status={<StatusBadge status="paid" />} metadata="₹4,82,000 · GST included" />
            <PremiumObjectCard assetKey="deployment" tone="violet" title="Command Center production" description="Next.js application deployment in ap-south-1." status={<StatusBadge status="healthy" />} metadata="Build 8f21a · 18 min ago" />
            <PremiumObjectCard assetKey="security" tone="amber" title="Quarterly access review" description="Privileged role and policy certification workflow." status={<StatusBadge status="pending" />} metadata="12 reviewers · Due 28 Jul" />
          </div>
        </section>
        <section aria-labelledby="tokens-title" className="space-y-4">
          <div><h2 id="tokens-title" className="text-lg font-semibold">Semantic tokens</h2><p className="mt-1 text-sm text-[var(--text-secondary)]">Components consume semantic variables so light and dark themes retain the same meaning and contrast hierarchy.</p></div>
          <div className="cc-grid-auto">
            {tokenGroups.map((group) => <Card key={group.title}><CardHeader><CardTitle>{group.title}</CardTitle></CardHeader><CardContent className="grid grid-cols-2 gap-3">{group.tokens.map((token) => <div key={token} className="space-y-2"><span className="block h-10 rounded-lg border border-[var(--border-default)]" style={{ background: `var(${token})` }} /><code className="block truncate text-[10px] text-[var(--text-secondary)]">{token}</code></div>)}</CardContent></Card>)}
          </div>
        </section>

        <section aria-labelledby="status-title" className="space-y-4">
          <div><h2 id="status-title" className="text-lg font-semibold">Operational status</h2><p className="mt-1 text-sm text-[var(--text-secondary)]">Color is always paired with iconography and text.</p></div>
          <div className="flex flex-wrap gap-2"><StatusBadge status="healthy" /><StatusBadge status="running" /><StatusBadge status="degraded" /><StatusBadge status="failed" /><StatusBadge status="draft" /></div>
          <div className="grid gap-3 lg:grid-cols-2">
            <OperationalStatusRail tone="success" label="Database" title="Primary is available" description="Transactional workloads are accepting connections." meta="42 ms" />
            <OperationalStatusRail tone="warning" label="Worker pool" title="Queue depth requires attention" description="Processing continues with increased latency." meta="1,248 jobs" />
          </div>
        </section>

        <section aria-labelledby="kpi-title" className="space-y-4">
          <div><h2 id="kpi-title" className="text-lg font-semibold">KPI and chart surfaces</h2><p className="mt-1 text-sm text-[var(--text-secondary)]">Responsive metrics use semantic chart colors and descriptive labels.</p></div>
          <KpiGrid><KpiCard title="Active tenants" value="248" delta={8.2} icon={ShieldCheck} iconColor="success" trend={[8, 12, 10, 16, 19, 23]} /><KpiCard title="Queued jobs" value="1,248" delta={-4.6} icon={Activity} iconColor="warning" trend={[24, 21, 18, 16, 14, 12]} /><KpiCard title="Storage used" value="62%" icon={Database} iconColor="info" trend={[45, 48, 52, 57, 60, 62]} /></KpiGrid>
        </section>

        <section aria-labelledby="forms-title" className="grid gap-4 xl:grid-cols-2">
          <Card><CardHeader><CardTitle id="forms-title">Forms and validation</CardTitle><CardDescription>Labels, descriptions, required state, server errors, and field errors remain programmatically connected.</CardDescription></CardHeader><CardContent className="space-y-4"><FormField label="Organization name" description="Use the legal or contracted organization name." required><Input defaultValue="Northstar Events" /></FormField><FormField label="Administrative reason" error="Enter at least eight characters." required><Textarea defaultValue="Short" /></FormField>{showError ? <ServerErrorSummary error={new Error("The service rejected the update. Review the fields and retry.")} action={<Button size="sm" variant="outline">Retry</Button>} /> : null}</CardContent></Card>
          <Card><CardHeader><CardTitle>Audit and timeline</CardTitle><CardDescription>Sensitive actions expose attribution and lifecycle evidence.</CardDescription></CardHeader><CardContent className="space-y-5"><AuditPanel actor="Platform administrator" timestamp="2026-07-14 16:30 UTC" reason="Catalogue example: demonstrate attributable mutation evidence." assurance="MFA assured session" /><OperationalTimeline items={[{ id: "1", title: "Change requested", timestamp: "16:27 UTC", status: "complete" }, { id: "2", title: "Policy evaluated", timestamp: "16:29 UTC", status: "complete" }, { id: "3", title: "Awaiting approval", timestamp: "16:30 UTC", status: "current" }]} /></CardContent></Card>
        </section>

        <section aria-labelledby="states-title" className="space-y-4"><div><h2 id="states-title" className="text-lg font-semibold">Page states</h2><p className="mt-1 text-sm text-[var(--text-secondary)]">Pages must expose truthful empty, loading, degraded, denied, and recoverable states.</p></div><div className="grid gap-4 xl:grid-cols-3"><AsyncState className="min-h-64" title="No records yet" description="Create the first record when the domain operation is available." /><PermissionDenied className="min-h-64" title="Permission required" description="Your authenticated account does not have access to this operation." /><RecoverableError className="min-h-64" title="Service unavailable" description="Existing data is safe. Retry after the dependency recovers." action={{ label: "Retry", onClick: () => undefined }} /></div></section>

        <section aria-labelledby="table-title" className="space-y-4"><div><h2 id="table-title" className="text-lg font-semibold">Operational table</h2><p className="mt-1 text-sm text-[var(--text-secondary)]">Tables preserve labels, horizontal reflow, focus, density, and non-color status communication.</p></div><div className="cc-scroll-region overflow-x-auto rounded-xl border border-[var(--border-default)]"><table className="min-w-full text-left text-sm"><caption className="sr-only">Example operational records</caption><thead className="bg-[var(--bg-surface-2)] text-[11px] uppercase tracking-wider text-[var(--text-secondary)]"><tr><th className="px-4 py-3" scope="col">Resource</th><th className="px-4 py-3" scope="col">Owner</th><th className="px-4 py-3" scope="col">Status</th><th className="px-4 py-3" scope="col">Updated</th></tr></thead><tbody><tr className="border-t border-[var(--border-subtle)]"><th scope="row" className="px-4 py-3 font-semibold">Registration API</th><td className="px-4 py-3 text-[var(--text-secondary)]">Platform operations</td><td className="px-4 py-3"><StatusBadge status="healthy" /></td><td className="px-4 py-3 font-mono text-xs">16:28 UTC</td></tr></tbody></table></div></section>
      </div>

      <ConfirmDestructiveAction open={confirmOpen} onOpenChange={setConfirmOpen} title="Confirm sensitive change" description="This example demonstrates focus management, reason capture, and destructive-action language." confirmLabel="Confirm example" requireReason minimumReasonLength={8} resourceName="Interface standard" onConfirm={() => setConfirmOpen(false)} />
    </PageWrapper>
  );
}
