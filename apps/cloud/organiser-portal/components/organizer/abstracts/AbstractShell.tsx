"use client";

import React from "react";
import {
  BookOpenCheck,
  ClipboardCheck,
  Download,
  FileCog,
  FileText,
  Gauge,
  Globe,
  Inbox,
  Settings2,
  ShieldCheck,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { OrganiserPage } from "@/components/organizer/workspace/OrganiserPrimitives";
import { AbstractSubmission } from "@/hooks/useAbstractWorkflow";

export type AbstractView = "dashboard" | "setup" | "form-builder" | "submissions" | "reviewers" | "rubric" | "evaluation" | "portal-settings" | "decisions" | "accepted" | "exports";

export const VIEW_META: Record<AbstractView, { label: string; icon: typeof Gauge; description: string }> = {
  dashboard: { label: "Dashboard", icon: Gauge, description: "Live call status, review pressure, publication readiness, and deep-linked corrective actions." },
  setup: { label: "Abstract Setup", icon: Settings2, description: "Configure the submission window, word limits, topics, rules, and publication policy." },
  "form-builder": { label: "Form Builder", icon: FileCog, description: "Maintain the author-facing form schema, required fields, disclosures, and preview state." },
  submissions: { label: "Submissions", icon: Inbox, description: "Operate the intake queue, inspect abstracts, assign reviewers, and track version state." },
  reviewers: { label: "Call for Reviewer", icon: Users, description: "Manage reviewer invitations and assignments, then inspect review progress, conflicts, workload, and completion." },
  evaluation: { label: "Evaluation", icon: ClipboardCheck, description: "Create and manage evaluation plans, scoring criteria, and review committee workflows." },
  rubric: { label: "Evaluation", icon: ClipboardCheck, description: "Create and manage evaluation plans, scoring criteria, and review committee workflows." },
  "portal-settings": { label: "Portal Settings", icon: Globe, description: "Configure operational policies, access rules, visibility controls, and feedback disclosure for author and reviewer portals." },
  decisions: { label: "Decisions", icon: ShieldCheck, description: "Compare review evidence and apply final accepted, rejected, or revision decisions." },
  accepted: { label: "Accepted Directory", icon: BookOpenCheck, description: "Prepare accepted abstracts for programme, posters, website, and abstract-book publication." },
  exports: { label: "Exports", icon: Download, description: "Generate operational manifests and publication-ready abstract outputs." },
};

export const STATUS_TONE: Record<string, string> = {
  DRAFT: "bg-zinc-500/15 text-zinc-700 dark:text-zinc-300 border-zinc-300 dark:border-zinc-700",
  SUBMITTED: "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-300 dark:border-sky-800",
  UNDER_REVIEW: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-800",
  REVISION_REQUESTED: "bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-300 dark:border-violet-800",
  NOMINATED: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border-indigo-300 dark:border-indigo-800",
  WAITLISTED: "bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-300 dark:border-orange-800",
  ACCEPTED: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800",
  REJECTED: "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-300 dark:border-rose-800",
  WITHDRAWN: "bg-zinc-500/15 text-zinc-500 dark:text-zinc-400 border-zinc-300 dark:border-zinc-700",
};

export function StatusPill({ status }: { status: string }) {
  return (
    <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-wide", STATUS_TONE[status] || STATUS_TONE.DRAFT)}>
      {status.replaceAll("_", " ")}
    </span>
  );
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="grid min-h-64 place-items-center rounded-xl border border-dashed border-[var(--border-default)] bg-[var(--bg-surface)] p-8 text-center">
      <div>
        <FileText className="mx-auto size-8 text-[var(--text-tertiary)]" />
        <p className="mt-3 text-sm font-black text-[var(--text-primary)]">{title}</p>
        <p className="mt-1 max-w-md text-xs leading-5 text-[var(--text-secondary)]">{body}</p>
      </div>
    </div>
  );
}

export function LedgerPreview({ compact = false, submission }: { compact?: boolean; submission?: AbstractSubmission }) {
  const steps = React.useMemo(() => [
    ["Submitted", Boolean(submission?.submitted_at) || !submission],
    ["Assigned", (submission?.assignment_count || 0) > 0 || !submission],
    ["Reviewed", (submission?.review_count || 0) > 0 || !submission],
    ["Decided", Boolean(submission?.decided_at) || !submission],
    ["Published", Boolean(submission?.published_at) || !submission],
  ], [submission]);

  return (
    <div className={cn("rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-5", compact && "p-4")}>
      <p className="text-xs font-black uppercase tracking-wide text-[var(--text-tertiary)]">Workflow progress</p>
      <div className="mt-4 grid gap-2">
        {steps.map(([label, done]) => (
          <div key={String(label)} className="flex items-center gap-3">
            <span className={cn("size-2 rounded-full", done ? "bg-[var(--brand-primary)]" : "bg-[var(--border-default)]")} />
            <span className="text-xs font-bold text-[var(--text-secondary)]">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function AbstractShell({
  view,
  actions,
  children,
}: {
  view: AbstractView;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const meta = VIEW_META[view];

  return (
    <main className="min-h-screen bg-[var(--bg-page)]">
      <OrganiserPage
        title={meta.label}
        description={meta.description}
        actions={actions}
      >
        {children}
      </OrganiserPage>
    </main>
  );
}
