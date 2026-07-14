"use client";

import { AlertTriangle, CheckCircle2, LockKeyhole, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PageContainer } from "@/components/super-admin/ui/PageContainer";
import { SectionHeader } from "@/components/super-admin/ui/SectionHeader";

type UnavailableRouteStateProps = {
  title: string;
  description: string;
  breadcrumb?: string[];
  removed?: string[];
  required?: string[];
  note?: string;
};

export function UnavailableRouteState({
  title,
  description,
  breadcrumb,
  removed = [],
  required = [],
  note,
}: UnavailableRouteStateProps) {
  return (
    <PageContainer>
      <SectionHeader
        title={title}
        description={description}
        breadcrumb={breadcrumb}
        actions={
          <Badge className="border-amber-400/30 bg-amber-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-amber-300">
            Contract required
          </Badge>
        }
      />

      <Card className="overflow-hidden rounded-3xl border border-amber-500/20 bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.16),transparent_35%),var(--bg-surface)] p-0">
        <div className="grid gap-0 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-5 p-7">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-amber-400/25 bg-amber-500/10 text-amber-300">
              <ShieldAlert className="h-5 w-5" />
            </div>

            <div className="space-y-2">
              <p className="text-xs font-black uppercase tracking-[0.28em] text-amber-300">Production disabled</p>
              <h2 className="max-w-3xl text-2xl font-black tracking-tight text-primary">This surface is intentionally not wired yet.</h2>
              <p className="max-w-3xl text-sm leading-6 text-secondary">
                The previous implementation either used static data, local-only state, or success messages without a complete backend contract. It has been
                disabled so Command Center does not imply a feature is production-ready before authorization, persistence, audit, and failure behavior exist.
              </p>
              {note && <p className="max-w-3xl rounded-2xl border border-border/60 bg-surface-2 p-4 text-xs leading-5 text-secondary">{note}</p>}
            </div>
          </div>

          <div className="border-t border-border/50 bg-black/10 p-7 lg:border-l lg:border-t-0">
            <div className="grid gap-4">
              <div className="rounded-2xl border border-border/60 bg-surface/70 p-4">
                <div className="mb-3 flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-primary">
                  <AlertTriangle className="h-4 w-4 text-amber-300" />
                  Removed unsafe behavior
                </div>
                {removed.length > 0 ? (
                  <ul className="space-y-2 text-xs leading-5 text-secondary">
                    {removed.map((item) => (
                      <li key={item} className="flex gap-2">
                        <LockKeyhole className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-secondary">No production-safe contract is available for this route yet.</p>
                )}
              </div>

              <div className="rounded-2xl border border-border/60 bg-surface/70 p-4">
                <div className="mb-3 flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-primary">
                  <CheckCircle2 className="h-4 w-4 text-emerald-300" />
                  Required before enabling
                </div>
                {required.length > 0 ? (
                  <ul className="space-y-2 text-xs leading-5 text-secondary">
                    {required.map((item) => (
                      <li key={item} className="flex gap-2">
                        <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-300" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-secondary">Define persistence, permissions, audit, loading/error states, and tests.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </Card>
    </PageContainer>
  );
}
