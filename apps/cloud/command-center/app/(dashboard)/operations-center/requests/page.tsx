"use client";

import { AlertTriangle, ArrowRight, FileText, Lock, RefreshCw, ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageContainer } from "@/components/super-admin/ui/PageContainer";
import { SectionHeader } from "@/components/super-admin/ui/SectionHeader";

const REQUIRED_CONTRACTS = [
  "Global or tenant-scoped service-request listing endpoint for Super Admin",
  "Server-side permission for operations.requests.manage",
  "Audit trail for quote, approve, reject, and pricing mutations",
  "Event and organization scope selectors for every request",
  "Durable job/notification behavior for customer-facing quote dispatch",
];

export default function RequestsTriage() {
  return (
    <PageContainer>
      <SectionHeader
        title="Requests Triage Desk"
        description="Technology service request triage is disabled until the Command Center has a real global operations contract."
        breadcrumb={["Console", "Operations", "Requests"]}
        actions={
          <Button disabled variant="outline" size="sm" className="border-border text-xs">
            <RefreshCw className="mr-2 h-3.5 w-3.5" />
            Refresh unavailable
          </Button>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="border-amber-500/20 bg-amber-500/5">
          <CardHeader>
            <div className="flex items-start gap-3">
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-2">
                <AlertTriangle className="h-5 w-5 text-amber-400" />
              </div>
              <div>
                <CardTitle className="text-base font-black text-[var(--text-primary)]">
                  Production workflow not wired
                </CardTitle>
                <CardDescription className="mt-1 text-xs text-[var(--text-tertiary)]">
                  This route previously rendered local demo service requests, editable quote prices, and local-only approve/reject actions.
                  Those mocks have been removed so Command Center does not imply operational work was performed.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-xl border border-border bg-surface p-4">
              <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-[var(--text-primary)]">
                <Lock className="h-4 w-4 text-amber-400" />
                Current state
              </div>
              <p className="mt-2 text-xs leading-relaxed text-[var(--text-secondary)]">
                The existing backend service-request API is event-scoped and organizer-facing. A Super Admin global triage desk needs a
                separate, tenant-safe read model and mutation contract before it can list, price, approve, reject, or dispatch requests.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="border-amber-500/20 text-amber-400">
                No mock data
              </Badge>
              <Badge variant="outline" className="border-amber-500/20 text-amber-400">
                No fake quote actions
              </Badge>
              <Badge variant="outline" className="border-amber-500/20 text-amber-400">
                No local-only approvals
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-surface">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-black uppercase tracking-wider text-[var(--text-primary)]">
              <ShieldCheck className="h-4 w-4 text-[var(--brand-primary)]" />
              Required before enabling
            </CardTitle>
            <CardDescription className="text-xs text-[var(--text-tertiary)]">
              Implement these contracts before reintroducing an interactive operations request desk.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {REQUIRED_CONTRACTS.map((item) => (
                <div key={item} className="flex items-start gap-3 rounded-xl border border-border bg-surface-2/40 p-3">
                  <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--brand-primary)]" />
                  <span className="text-xs leading-relaxed text-[var(--text-secondary)]">{item}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-5 border-border bg-surface">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm font-black text-[var(--text-primary)]">
            <FileText className="h-4 w-4 text-[var(--brand-primary)]" />
            Real API note
          </CardTitle>
          <CardDescription className="text-xs text-[var(--text-tertiary)]">
            Organizer event workspaces can continue using the event-scoped technology service-request APIs. This Command Center route is
            intentionally disabled until a Super Admin-safe aggregate surface exists.
          </CardDescription>
        </CardHeader>
      </Card>
    </PageContainer>
  );
}
