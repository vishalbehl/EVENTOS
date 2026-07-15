"use client";

import { format } from "date-fns";
import { Activity, Building2, CalendarClock, CircleDollarSign, Mail, Users } from "lucide-react";
import { RecoverableError } from "@/components/super-admin/ui/AsyncState";
import { EmptyState } from "@/components/super-admin/ui/EmptyState";
import { Skeleton } from "@/components/super-admin/ui/LoadingSkeleton";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { type CRMAccount, type CRMSupportScope, useAccountWorkspace } from "@/hooks/useCRM";

function dateLabel(value?: string) {
  if (!value) return "Not set";
  try {
    return format(new Date(value), "dd MMM yyyy, HH:mm");
  } catch {
    return value;
  }
}

function money(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

function Metric({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface-2)] p-3">
      <Icon className="mb-2 size-4 text-[var(--brand-primary)]" aria-hidden="true" />
      <p className="text-lg font-semibold text-[var(--text-primary)]">{value}</p>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">{label}</p>
    </div>
  );
}

export function CrmAccountWorkspaceSheet({
  account,
  scope,
  open,
  onOpenChange,
}: {
  account: CRMAccount | null;
  scope: CRMSupportScope;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const workspace = useAccountWorkspace(scope, account?.id);
  const data = workspace.data;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-3xl">
        <SheetHeader>
          <div className="mb-2 flex items-center gap-2 text-[var(--brand-primary)]">
            <Building2 className="size-4" aria-hidden="true" />
            <span className="text-[10px] font-bold uppercase tracking-[0.18em]">Account workspace</span>
          </div>
          <SheetTitle>{account?.name ?? "CRM account"}</SheetTitle>
          <SheetDescription>
            Audited tenant-scoped contacts, pipeline, tasks, activities, and notes. Results are bounded to 100 records per collection.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6">
          {workspace.isLoading ? <Skeleton className="h-72" /> : null}
          {workspace.isError ? (
            <RecoverableError
              title="Account workspace unavailable"
              description={workspace.error instanceof Error ? workspace.error.message : "The account workspace could not be loaded."}
              action={{ label: "Retry", onClick: () => void workspace.refetch() }}
            />
          ) : null}
          {data ? (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Metric icon={Users} label="Contacts" value={data.metrics.contact_count} />
                <Metric icon={CircleDollarSign} label="Active deals" value={data.metrics.active_opportunity_count} />
                <Metric icon={Activity} label="Pipeline" value={money(data.metrics.pipeline_value)} />
                <Metric icon={CalendarClock} label="Open tasks" value={data.metrics.open_task_count} />
              </div>

              <section aria-labelledby="crm-account-contacts">
                <h3 id="crm-account-contacts" className="mb-3 text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Contacts</h3>
                {data.contacts.length ? (
                  <div className="divide-y divide-[var(--border-subtle)] rounded-xl border border-[var(--border-default)]">
                    {data.contacts.map((contact) => (
                      <div key={contact.id} className="flex items-center justify-between gap-4 p-3">
                        <div>
                          <p className="text-sm font-semibold text-[var(--text-primary)]">{contact.first_name} {contact.last_name}</p>
                          <a className="mt-1 flex items-center gap-1 text-xs text-[var(--brand-primary)] hover:underline" href={`mailto:${contact.email}`}>
                            <Mail className="size-3" aria-hidden="true" />{contact.email}
                          </a>
                        </div>
                        {contact.archived_at ? <Badge variant="outline">Archived</Badge> : null}
                      </div>
                    ))}
                  </div>
                ) : <EmptyState title="No contacts" description="No contacts belong to this account." className="py-8" />}
              </section>

              <section aria-labelledby="crm-account-opportunities">
                <h3 id="crm-account-opportunities" className="mb-3 text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Opportunities</h3>
                {data.opportunities.length ? (
                  <div className="divide-y divide-[var(--border-subtle)] rounded-xl border border-[var(--border-default)]">
                    {data.opportunities.map((opportunity) => (
                      <div key={opportunity.id} className="flex items-center justify-between gap-4 p-3">
                        <div>
                          <p className="text-sm font-semibold text-[var(--text-primary)]">{opportunity.name}</p>
                          <p className="mt-1 text-xs text-[var(--text-tertiary)]">Close: {dateLabel(opportunity.close_date)}</p>
                        </div>
                        <span className="font-mono text-sm font-bold text-emerald-400">{money(opportunity.amount)}</span>
                      </div>
                    ))}
                  </div>
                ) : <EmptyState title="No opportunities" description="No opportunities belong to this account." className="py-8" />}
              </section>

              <section aria-labelledby="crm-account-timeline">
                <h3 id="crm-account-timeline" className="mb-3 text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Recent engagement</h3>
                {data.activities.length || data.tasks.length || data.notes.length ? (
                  <div className="space-y-2">
                    {data.activities.slice(0, 10).map((item) => (
                      <div key={item.id} className="rounded-xl border border-[var(--border-default)] p-3">
                        <div className="flex items-center justify-between gap-3">
                          <Badge variant="outline">{item.activity_type}</Badge>
                          <time className="text-[10px] text-[var(--text-tertiary)]">{dateLabel(item.occurred_at)}</time>
                        </div>
                        <p className="mt-2 text-sm text-[var(--text-secondary)]">{item.description || "No description supplied."}</p>
                      </div>
                    ))}
                    {data.tasks.slice(0, 10).map((item) => (
                      <div key={item.id} className="flex items-center justify-between gap-4 rounded-xl border border-[var(--border-default)] p-3">
                        <div>
                          <p className="text-sm font-semibold text-[var(--text-primary)]">{item.subject}</p>
                          <p className="mt-1 text-xs text-[var(--text-tertiary)]">Due: {dateLabel(item.due_date)}</p>
                        </div>
                        <Badge variant="outline">{item.status.replaceAll("_", " ")}</Badge>
                      </div>
                    ))}
                    {data.notes.slice(0, 10).map((item) => (
                      <div key={item.id} className="rounded-xl border border-[var(--border-default)] p-3 text-sm text-[var(--text-secondary)]">
                        {item.content}
                      </div>
                    ))}
                  </div>
                ) : <EmptyState title="No engagement history" description="Activities, tasks, and notes linked to this account will appear here." className="py-8" />}
              </section>
            </div>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
