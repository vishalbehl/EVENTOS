"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { BarChart3, BookOpenCheck, Check, ClipboardCheck, Download, FileCog, FileText, Gauge, Inbox, Mail, Plus, Search, Settings2, ShieldCheck, Users, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  AbstractSubmission,
  useAbstractAssignments,
  useAbstractDashboard,
  useAbstractForm,
  useAbstractReviewers,
  useAbstractSetup,
  useAbstractSubmissions,
  useAssignAbstractReviewer,
  useCreateAbstractReviewer,
  useDecideAbstract,
  useDeleteAbstractReviewer,
  useDeleteAbstractSubmission,
  usePublishAbstract,
  usePublishAllAccepted,
  useSaveAbstractForm,
  useSaveAbstractSetup,
  useUpdateAbstractAssignment,
  useUpdateAbstractReviewer,
  useUpdateAbstractSubmission,
} from "@/hooks/useAbstractWorkflow";

type AbstractView = "dashboard" | "setup" | "form-builder" | "submissions" | "reviewers" | "rubric" | "decisions" | "accepted" | "exports";

const VIEW_META: Record<AbstractView, { label: string; icon: typeof Gauge; description: string }> = {
  dashboard: { label: "Command Center", icon: Gauge, description: "Live call status, review pressure, publication readiness, and deep-linked corrective actions." },
  setup: { label: "Call Setup", icon: Settings2, description: "Configure the submission window, word limits, topics, rules, and publication policy." },
  "form-builder": { label: "Form Builder", icon: FileCog, description: "Maintain the author-facing form schema, required fields, disclosures, and preview state." },
  submissions: { label: "Submissions", icon: Inbox, description: "Operate the intake queue, inspect abstracts, assign reviewers, and track version state." },
  reviewers: { label: "Reviewers", icon: Users, description: "Manage committee reviewers, expertise, capacity, invitations, assignments, and conflicts." },
  rubric: { label: "Rubric", icon: ClipboardCheck, description: "Define the scoring model reviewers use and the committee reads during decisions." },
  decisions: { label: "Decisions", icon: ShieldCheck, description: "Compare review evidence and apply final accepted, rejected, or revision decisions." },
  accepted: { label: "Accepted Directory", icon: BookOpenCheck, description: "Prepare accepted abstracts for programme, posters, website, and abstract-book publication." },
  exports: { label: "Exports", icon: Download, description: "Generate operational manifests and publication-ready abstract outputs." },
};

const TABS: Array<{ view: AbstractView; href: string }> = [
  { view: "dashboard", href: "" },
  { view: "setup", href: "/setup" },
  { view: "form-builder", href: "/form-builder" },
  { view: "submissions", href: "/submissions" },
  { view: "reviewers", href: "/reviewers" },
  { view: "rubric", href: "/rubric" },
  { view: "decisions", href: "/decisions" },
  { view: "accepted", href: "/accepted" },
  { view: "exports", href: "/exports" },
];

const STATUS_TONE: Record<string, string> = {
  DRAFT: "bg-zinc-100 text-zinc-700 border-zinc-200",
  SUBMITTED: "bg-sky-100 text-sky-700 border-sky-200",
  UNDER_REVIEW: "bg-amber-100 text-amber-700 border-amber-200",
  REVISION_REQUESTED: "bg-violet-100 text-violet-700 border-violet-200",
  ACCEPTED: "bg-emerald-100 text-emerald-700 border-emerald-200",
  REJECTED: "bg-rose-100 text-rose-700 border-rose-200",
  WITHDRAWN: "bg-zinc-100 text-zinc-500 border-zinc-200",
};

function StatusPill({ status }: { status: string }) {
  return <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-wide", STATUS_TONE[status] || STATUS_TONE.DRAFT)}>{status.replaceAll("_", " ")}</span>;
}

function AbstractShell({ view, children }: { view: AbstractView; children: React.ReactNode }) {
  const { eventId } = useParams<{ eventId: string }>();
  const meta = VIEW_META[view];
  const Icon = meta.icon;
  return (
    <main className="min-h-screen bg-[var(--bg-page)] p-4 md:p-6">
      <section className="mx-auto max-w-[1600px] space-y-5">
        <header className="overflow-hidden rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)]">
          <div className="grid gap-5 border-b border-[var(--border-subtle)] p-5 lg:grid-cols-[1fr_auto]">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="grid size-9 place-items-center rounded-lg bg-[var(--brand-primary-muted)] text-[var(--brand-primary)]"><Icon className="size-4" /></span>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-tertiary)]">Abstract review ledger</p>
              </div>
              <h1 className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-[var(--text-primary)]">{meta.label}</h1>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-[var(--text-secondary)]">{meta.description}</p>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <Link href={`/events/${eventId}/abstracts/submissions`} className="rounded-lg border border-[var(--border-default)] px-3 py-2 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--bg-surface-2)]"><Inbox className="mr-1.5 inline size-3.5" />Inbox</Link>
              <Link href={`/events/${eventId}/abstracts/decisions`} className="rounded-lg bg-[var(--brand-primary)] px-3 py-2 text-xs font-bold text-white"><ShieldCheck className="mr-1.5 inline size-3.5" />Decision board</Link>
            </div>
          </div>
          <nav className="flex flex-wrap gap-1 p-2" aria-label="Abstract workspace sections">
            {TABS.map((tab) => {
              const active = tab.view === view;
              return (
                <Link key={tab.view} href={`/events/${eventId}/abstracts${tab.href}`} className={cn("rounded-lg px-3 py-2 text-xs font-bold text-[var(--text-secondary)] hover:bg-[var(--bg-surface-2)] hover:text-[var(--text-primary)]", active && "bg-[var(--bg-surface-2)] text-[var(--text-primary)]")}>
                  {VIEW_META[tab.view].label}
                </Link>
              );
            })}
          </nav>
        </header>
        {children}
      </section>
    </main>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
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

export function AbstractWorkspace({ view }: { view: AbstractView }) {
  if (view === "dashboard") return <DashboardView />;
  if (view === "setup") return <SetupView />;
  if (view === "form-builder") return <FormBuilderView />;
  if (view === "reviewers") return <ReviewersView />;
  if (view === "rubric") return <RubricView />;
  if (view === "decisions") return <SubmissionsView mode="decisions" />;
  if (view === "accepted") return <SubmissionsView mode="accepted" />;
  if (view === "exports") return <ExportsView />;
  return <SubmissionsView mode="submissions" />;
}

function DashboardView() {
  const { eventId } = useParams<{ eventId: string }>();
  const dashboard = useAbstractDashboard(eventId);
  const data = dashboard.data;
  const counts = data?.counts || {};
  const metrics = [
    ["Submitted", counts.SUBMITTED || 0, Inbox],
    ["In review", counts.UNDER_REVIEW || 0, ClipboardCheck],
    ["Accepted", counts.ACCEPTED || 0, Check],
    ["Published", data?.publication.published || 0, BookOpenCheck],
  ] as const;
  return (
    <AbstractShell view="dashboard">
      {dashboard.isLoading ? <EmptyState title="Loading abstract command center" body="The event abstract ledger is being read from the backend." /> : dashboard.isError ? <EmptyState title="Abstract service unavailable" body="No mock dashboard was generated. Resolve the API error and reload this workspace." /> : (
        <div className="grid gap-5 xl:grid-cols-[1fr_420px]">
          <section className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {metrics.map(([label, value, Icon]) => (
                <article key={label} className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-4">
                  <div className="flex items-center justify-between"><p className="text-xs font-bold text-[var(--text-secondary)]">{label}</p><Icon className="size-4 text-[var(--brand-primary)]" /></div>
                  <p className="mt-4 font-mono text-3xl font-semibold text-[var(--text-primary)]">{value}</p>
                </article>
              ))}
            </div>
            <section className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)]">
              <div className="border-b border-[var(--border-subtle)] px-5 py-4"><h2 className="text-sm font-black text-[var(--text-primary)]">Recent review ledger</h2></div>
              <div className="divide-y divide-[var(--border-subtle)]">
                {data?.recent.length ? data.recent.map((item) => <SubmissionRow key={item.id} item={item} />) : <div className="p-5"><EmptyState title="No abstracts yet" body="Open the call and submitted abstracts will appear here with their review ledger." /></div>}
              </div>
            </section>
          </section>
          <aside className="space-y-5">
            <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-5">
              <p className="text-xs font-black uppercase tracking-wide text-[var(--text-tertiary)]">Call state</p>
              <div className="mt-3 flex items-center justify-between gap-3">
                <StatusPill status={data?.call?.status || "DRAFT"} />
                <span className="text-xs text-[var(--text-secondary)]">v{data?.call?.version || 1}</span>
              </div>
              <p className="mt-4 text-sm leading-6 text-[var(--text-secondary)]">{data?.call ? `${data.call.min_words}-${data.call.max_words} words across ${(data.call.abstract_types || []).join(", ") || "configured"} abstract types.` : "Call setup has not been created yet."}</p>
            </div>
            <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-5">
              <p className="text-xs font-black uppercase tracking-wide text-[var(--text-tertiary)]">Needs attention</p>
              <div className="mt-3 space-y-2">
                {data?.needs_attention.length ? data.needs_attention.map((item) => <Link key={item.label} href={item.destination} className="block rounded-lg border border-[var(--border-subtle)] p-3 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--bg-surface-2)]">{item.label}</Link>) : <p className="text-sm text-[var(--text-secondary)]">No abstract actions are currently blocked.</p>}
              </div>
            </div>
          </aside>
        </div>
      )}
    </AbstractShell>
  );
}

function SetupView() {
  const { eventId } = useParams<{ eventId: string }>();
  const setup = useAbstractSetup(eventId);
  const save = useSaveAbstractSetup(eventId);
  const [topics, setTopics] = useState("");
  const call = setup.data;
  return (
    <AbstractShell view="setup">
      {!call ? <EmptyState title="Loading call setup" body="The submission policy is being loaded." /> : (
        <section className="grid gap-5 lg:grid-cols-[1fr_360px]">
          <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-5">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-1.5 text-xs font-bold text-[var(--text-secondary)]">Status<select defaultValue={call.status} id="abstract-status" className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3 py-2 text-sm text-[var(--text-primary)]"><option>DRAFT</option><option>OPEN</option><option>CLOSED</option><option>PUBLISHED</option></select></label>
              <label className="space-y-1.5 text-xs font-bold text-[var(--text-secondary)]">Topics<input defaultValue={call.topics.join(", ")} onChange={(event) => setTopics(event.target.value)} placeholder="AI, Oncology, Imaging" className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3 py-2 text-sm text-[var(--text-primary)]" /></label>
              <label className="space-y-1.5 text-xs font-bold text-[var(--text-secondary)]">Minimum words<input type="number" defaultValue={call.min_words} id="abstract-min" className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3 py-2 text-sm text-[var(--text-primary)]" /></label>
              <label className="space-y-1.5 text-xs font-bold text-[var(--text-secondary)]">Maximum words<input type="number" defaultValue={call.max_words} id="abstract-max" className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3 py-2 text-sm text-[var(--text-primary)]" /></label>
            </div>
            <label className="mt-4 flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]"><input id="abstract-blind" type="checkbox" defaultChecked={call.blind_review_enabled} /> Blind reviewer mode</label>
            <button onClick={() => {
              const status = (document.getElementById("abstract-status") as HTMLSelectElement).value as typeof call.status;
              const min = Number((document.getElementById("abstract-min") as HTMLInputElement).value);
              const max = Number((document.getElementById("abstract-max") as HTMLInputElement).value);
              const blind = (document.getElementById("abstract-blind") as HTMLInputElement).checked;
              save.mutate({ ...call, status, min_words: min, max_words: max, blind_review_enabled: blind, topics: (topics || call.topics.join(",")).split(",").map((topic) => topic.trim()).filter(Boolean) }, { onSuccess: () => toast.success("Abstract call setup saved") });
            }} className="mt-5 rounded-lg bg-[var(--brand-primary)] px-4 py-2 text-sm font-black text-white">Save call setup</button>
          </div>
          <LedgerPreview />
        </section>
      )}
    </AbstractShell>
  );
}

function FormBuilderView() {
  const { eventId } = useParams<{ eventId: string }>();
  const form = useAbstractForm(eventId);
  const save = useSaveAbstractForm(eventId);
  return (
    <AbstractShell view="form-builder">
      {!form.data ? <EmptyState title="Loading form builder" body="The active abstract form schema is being loaded." /> : (
        <section className="grid gap-5 lg:grid-cols-[1fr_420px]">
          <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-5">
            <label className="space-y-1.5 text-xs font-bold text-[var(--text-secondary)]">Form title<input id="abstract-form-title" defaultValue={form.data.title} className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3 py-2 text-sm text-[var(--text-primary)]" /></label>
            <label className="mt-4 block space-y-1.5 text-xs font-bold text-[var(--text-secondary)]">Schema JSON<textarea id="abstract-form-schema" rows={14} defaultValue={JSON.stringify(form.data.schema, null, 2)} className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] p-3 font-mono text-xs text-[var(--text-primary)]" /></label>
            <button onClick={() => {
              try {
                const schema = JSON.parse((document.getElementById("abstract-form-schema") as HTMLTextAreaElement).value);
                const title = (document.getElementById("abstract-form-title") as HTMLInputElement).value;
                save.mutate({ ...form.data!, title, schema, publish: true }, { onSuccess: () => toast.success("Abstract form published") });
              } catch {
                toast.error("Schema JSON is invalid");
              }
            }} className="mt-5 rounded-lg bg-[var(--brand-primary)] px-4 py-2 text-sm font-black text-white">Publish form</button>
          </div>
          <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-5">
            <p className="text-sm font-black text-[var(--text-primary)]">Author preview</p>
            {["Title", "Abstract body", "Keywords", "Topic", "Authors", "Disclosure"].map((field) => <div key={field} className="mt-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface-2)] px-3 py-2 text-xs font-bold text-[var(--text-secondary)]">{field}</div>)}
          </div>
        </section>
      )}
    </AbstractShell>
  );
}

function SubmissionsView({ mode }: { mode: "submissions" | "decisions" | "accepted" }) {
  const { eventId } = useParams<{ eventId: string }>();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState(mode === "accepted" ? "ACCEPTED" : "");
  const [selected, setSelected] = useState<AbstractSubmission | null>(null);
  const submissions = useAbstractSubmissions(eventId, { search, status });
  const reviewers = useAbstractReviewers(eventId);
  const assign = useAssignAbstractReviewer(eventId);
  const decide = useDecideAbstract(eventId);
  const updateSubmission = useUpdateAbstractSubmission(eventId);
  const deleteSubmission = useDeleteAbstractSubmission(eventId);
  const publish = usePublishAbstract(eventId);
  const publishAll = usePublishAllAccepted(eventId);
  const [reviewerId, setReviewerId] = useState("");
  const view = mode === "decisions" ? "decisions" : mode === "accepted" ? "accepted" : "submissions";
  const filtered = submissions.data?.items || [];
  return (
    <AbstractShell view={view}>
      <section className="grid min-h-[650px] overflow-hidden rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] xl:grid-cols-[minmax(0,1fr)_430px]">
        <div className="min-w-0 border-b border-[var(--border-subtle)] xl:border-b-0 xl:border-r">
          <div className="flex flex-col gap-3 border-b border-[var(--border-subtle)] p-4 sm:flex-row">
            <label className="relative flex-1"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--text-tertiary)]" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search title, code, topic, or body" className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] py-2.5 pl-9 pr-3 text-sm text-[var(--text-primary)]" /></label>
            <select value={status} onChange={(event) => setStatus(event.target.value)} className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3 py-2.5 text-sm font-bold text-[var(--text-primary)]"><option value="">All states</option><option>SUBMITTED</option><option>UNDER_REVIEW</option><option>REVISION_REQUESTED</option><option>ACCEPTED</option><option>REJECTED</option><option>DRAFT</option><option>WITHDRAWN</option></select>
          </div>
          {submissions.isLoading ? <div className="p-6 text-sm text-[var(--text-secondary)]">Loading submissions...</div> : submissions.isError ? <div className="p-6"><EmptyState title="Submission queue unavailable" body="The backend did not return abstract data. No local mock data is being shown." /></div> : filtered.length ? <div className="divide-y divide-[var(--border-subtle)]">{filtered.map((item) => <button key={item.id} onClick={() => setSelected(item)} className={cn("block w-full p-4 text-left hover:bg-[var(--bg-surface-2)]", selected?.id === item.id && "bg-[var(--bg-surface-2)]")}><SubmissionRow item={item} /></button>)}</div> : <div className="p-6"><EmptyState title="No matching abstracts" body="Change filters or open the call for authors to begin submission." /></div>}
        </div>
        <aside className="p-5">
          {selected ? (
            <div className="space-y-5">
              <div><p className="text-[10px] font-black uppercase tracking-wide text-[var(--text-tertiary)]">{selected.code} · v{selected.version}</p><h2 className="mt-2 text-lg font-black text-[var(--text-primary)]">{selected.title}</h2><p className="mt-1 text-xs text-[var(--text-secondary)]">{selected.presenter_name || "Presenter not linked"} · {selected.topic || "No topic"}</p></div>
              <div className="max-h-72 overflow-y-auto rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface-2)] p-4 text-sm leading-6 text-[var(--text-primary)]">{selected.body}</div>
              <LedgerPreview compact submission={selected} />
              {selected.authors?.length ? <section className="rounded-lg border border-[var(--border-subtle)] p-3"><p className="text-[10px] font-black uppercase tracking-wide text-[var(--text-tertiary)]">Authors</p><div className="mt-2 space-y-1">{selected.authors.map((author) => <p key={author.id} className="text-xs font-bold text-[var(--text-secondary)]">{author.display_order + 1}. {author.full_name}{author.is_presenter ? " · presenter" : ""}</p>)}</div></section> : null}
              {selected.reviews?.length ? <section className="rounded-lg border border-[var(--border-subtle)] p-3"><p className="text-[10px] font-black uppercase tracking-wide text-[var(--text-tertiary)]">Review evidence</p><div className="mt-2 space-y-2">{selected.reviews.map((review) => <div key={review.id} className="text-xs text-[var(--text-secondary)]"><b className="text-[var(--text-primary)]">{review.reviewer_name}</b> · {review.total_score} · {review.recommendation}<p className="mt-1 leading-5">{review.comments_to_committee || "No committee comment."}</p></div>)}</div></section> : null}
              {mode === "submissions" && reviewers.data?.length ? <select value={reviewerId || reviewers.data[0]?.id || ""} onChange={(event) => setReviewerId(event.target.value)} className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3 py-2 text-sm text-[var(--text-primary)]">{reviewers.data.map((reviewer) => <option key={reviewer.id} value={reviewer.id}>{reviewer.full_name} ({reviewer.assigned_count}/{reviewer.capacity})</option>)}</select> : null}
              {mode === "submissions" && reviewers.data?.length ? <button onClick={() => assign.mutate({ submissionId: selected.id, reviewerId: reviewerId || reviewers.data![0].id }, { onSuccess: () => toast.success("Reviewer assigned") })} className="w-full rounded-lg border border-[var(--border-default)] px-4 py-2 text-sm font-black text-[var(--text-primary)]">Assign reviewer</button> : null}
              {mode === "submissions" ? <div className="grid grid-cols-2 gap-2"><button onClick={() => updateSubmission.mutate({ ...selected, status: "SUBMITTED" }, { onSuccess: () => toast.success("Abstract reopened for review") })} className="rounded-lg border border-[var(--border-default)] px-3 py-2 text-xs font-black text-[var(--text-primary)]">Reopen</button><button onClick={() => deleteSubmission.mutate(selected, { onSuccess: () => { setSelected(null); toast.success("Abstract deleted"); } })} disabled={selected.status === "ACCEPTED"} className="rounded-lg border border-rose-200 px-3 py-2 text-xs font-black text-rose-700 disabled:opacity-40">Delete</button></div> : null}
              {mode === "decisions" ? <DecisionActions selected={selected} onDecide={(decision, presentationType, reason, notes) => decide.mutate({ submission: selected, decision, reason: reason || "Committee decision applied after review evidence check.", notes, presentationType }, { onSuccess: () => toast.success("Decision applied") })} /> : null}
              {mode === "accepted" && selected.status === "ACCEPTED" ? <button onClick={() => publish.mutate(selected.id, { onSuccess: () => toast.success("Abstract published") })} className="w-full rounded-lg bg-[var(--brand-primary)] px-4 py-2 text-sm font-black text-white">Publish to directory</button> : null}
              {mode === "accepted" ? <button onClick={() => publishAll.mutate(undefined, { onSuccess: () => toast.success("Accepted abstracts published") })} className="w-full rounded-lg border border-[var(--border-default)] px-4 py-2 text-sm font-black text-[var(--text-primary)]">Publish all accepted</button> : null}
            </div>
          ) : <EmptyState title="Select an abstract" body="The detail rail keeps the manuscript, evidence, and next safe action together." />}
        </aside>
      </section>
    </AbstractShell>
  );
}

function DecisionActions({ selected, onDecide }: { selected: AbstractSubmission; onDecide: (decision: "ACCEPTED" | "REJECTED" | "REVISION_REQUESTED", presentationType?: "ORAL" | "POSTER" | "EPOSTER", reason?: string, notes?: string) => void }) {
  const [reason, setReason] = useState("Committee decision applied after review evidence check.");
  const [notes, setNotes] = useState("");
  return (
    <div className="grid gap-2">
      <textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={3} className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] p-3 text-xs text-[var(--text-primary)]" />
      <input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Optional author note" className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3 py-2 text-xs text-[var(--text-primary)]" />
      <button onClick={() => onDecide("ACCEPTED", "ORAL", reason, notes)} disabled={selected.status === "ACCEPTED" || reason.trim().length < 5} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-black text-white disabled:opacity-40"><Check className="mr-1.5 inline size-4" />Accept oral</button>
      <button onClick={() => onDecide("ACCEPTED", "POSTER", reason, notes)} disabled={selected.status === "ACCEPTED" || reason.trim().length < 5} className="rounded-lg border border-emerald-300 px-4 py-2 text-sm font-black text-emerald-700 disabled:opacity-40">Accept poster</button>
      <button onClick={() => onDecide("REVISION_REQUESTED", undefined, reason, notes)} disabled={reason.trim().length < 5} className="rounded-lg border border-violet-300 px-4 py-2 text-sm font-black text-violet-700">Request revision</button>
      <button onClick={() => onDecide("REJECTED", undefined, reason, notes)} disabled={reason.trim().length < 5} className="rounded-lg border border-rose-300 px-4 py-2 text-sm font-black text-rose-700"><X className="mr-1.5 inline size-4" />Reject</button>
    </div>
  );
}

function ReviewersView() {
  const { eventId } = useParams<{ eventId: string }>();
  const reviewers = useAbstractReviewers(eventId);
  const assignments = useAbstractAssignments(eventId);
  const create = useCreateAbstractReviewer(eventId);
  const update = useUpdateAbstractReviewer(eventId);
  const remove = useDeleteAbstractReviewer(eventId);
  const updateAssignment = useUpdateAbstractAssignment(eventId);
  return (
    <AbstractShell view="reviewers">
      <section className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)]">
          <div className="border-b border-[var(--border-subtle)] px-5 py-4"><h2 className="text-sm font-black text-[var(--text-primary)]">Reviewer roster</h2></div>
          <div className="divide-y divide-[var(--border-subtle)]">{reviewers.data?.length ? reviewers.data.map((reviewer) => <div key={reviewer.id} className="grid gap-3 p-4 md:grid-cols-[1fr_auto]"><div><p className="text-sm font-black text-[var(--text-primary)]">{reviewer.full_name}</p><p className="text-xs text-[var(--text-secondary)]">{reviewer.email}</p><div className="mt-2 flex flex-wrap gap-1">{reviewer.expertise_topics.map((topic) => <span key={topic} className="rounded-full bg-[var(--bg-surface-2)] px-2 py-0.5 text-[10px] font-bold text-[var(--text-secondary)]">{topic}</span>)}</div></div><div className="flex flex-wrap items-center gap-2 text-xs font-bold text-[var(--text-secondary)]"><span>{reviewer.assigned_count}/{reviewer.capacity} assigned</span><span>{reviewer.completed_count} complete</span><span>{reviewer.conflict_count} conflicts</span><select value={reviewer.status} onChange={(event) => update.mutate({ reviewerId: reviewer.id, patch: { status: event.target.value as typeof reviewer.status } }, { onSuccess: () => toast.success("Reviewer status updated") })} className="rounded-md border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-2 py-1 text-xs"><option>INVITED</option><option>ACTIVE</option><option>PAUSED</option></select><button onClick={() => remove.mutate(reviewer.id, { onSuccess: () => toast.success("Reviewer removed"), onError: () => toast.error("Reviewer still has active assignments") })} className="rounded-md border border-rose-200 px-2 py-1 text-xs font-black text-rose-700">Remove</button></div></div>) : <div className="p-5"><EmptyState title="No reviewers yet" body="Add reviewers before assigning submitted abstracts." /></div>}</div>
          <div className="border-t border-[var(--border-subtle)] px-5 py-4"><h2 className="text-sm font-black text-[var(--text-primary)]">Assignment monitor</h2></div>
          <div className="divide-y divide-[var(--border-subtle)]">{assignments.data?.length ? assignments.data.map((assignment) => <div key={assignment.id} className="grid gap-3 p-4 md:grid-cols-[1fr_auto]"><div><p className="text-xs font-black text-[var(--text-primary)]">{assignment.submission_code} · {assignment.submission_title}</p><p className="mt-1 text-xs text-[var(--text-secondary)]">{assignment.reviewer_name}{assignment.conflict_declared ? ` · conflict: ${assignment.conflict_reason || "declared"}` : ""}</p></div><select value={assignment.status} onChange={(event) => updateAssignment.mutate({ assignmentId: assignment.id, patch: { status: event.target.value as typeof assignment.status, conflict_declared: event.target.value === "CONFLICT" } }, { onSuccess: () => toast.success("Assignment updated") })} className="rounded-md border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-2 py-1 text-xs font-bold text-[var(--text-primary)]"><option>ASSIGNED</option><option>ACCEPTED</option><option>DECLINED</option><option>CONFLICT</option><option>COMPLETED</option></select></div>) : <p className="p-5 text-sm text-[var(--text-secondary)]">No reviewer assignments yet.</p>}</div>
        </div>
        <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-5">
          <p className="text-sm font-black text-[var(--text-primary)]">Add reviewer</p>
          <input id="reviewer-name" placeholder="Full name" className="mt-3 w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3 py-2 text-sm" />
          <input id="reviewer-email" placeholder="Email" className="mt-3 w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3 py-2 text-sm" />
          <input id="reviewer-topics" placeholder="Topics, comma separated" className="mt-3 w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3 py-2 text-sm" />
          <button onClick={() => create.mutate({ full_name: (document.getElementById("reviewer-name") as HTMLInputElement).value, email: (document.getElementById("reviewer-email") as HTMLInputElement).value, expertise_topics: (document.getElementById("reviewer-topics") as HTMLInputElement).value.split(",").map((x) => x.trim()).filter(Boolean), capacity: 10, status: "INVITED" }, { onSuccess: () => toast.success("Reviewer added") })} className="mt-4 w-full rounded-lg bg-[var(--brand-primary)] px-4 py-2 text-sm font-black text-white"><Plus className="mr-1.5 inline size-4" />Add reviewer</button>
        </div>
      </section>
    </AbstractShell>
  );
}

function RubricView() {
  const { eventId } = useParams<{ eventId: string }>();
  const form = useAbstractForm(eventId);
  const save = useSaveAbstractForm(eventId);
  const rubric = Array.isArray(form.data?.schema?.rubric) ? form.data?.schema?.rubric as Array<{ label: string; weight: number; description: string }> : [
    { label: "Scientific merit", weight: 30, description: "Evidence quality, research question, and contribution." },
    { label: "Originality", weight: 20, description: "Novelty against the current conference field." },
    { label: "Methodology", weight: 20, description: "Study design, analysis quality, and limitations." },
    { label: "Relevance", weight: 20, description: "Fit with event tracks and delegate value." },
    { label: "Clarity", weight: 10, description: "Readable title, structure, and conclusion." },
  ];
  return (
    <AbstractShell view="rubric">
      <section className="grid gap-5 lg:grid-cols-3">
        {rubric.map((criterion, index) => <article key={`${criterion.label}-${index}`} className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-5"><p className="text-[10px] font-black uppercase tracking-wide text-[var(--text-tertiary)]">Criterion {index + 1} · {criterion.weight}%</p><h2 className="mt-2 text-sm font-black text-[var(--text-primary)]">{criterion.label}</h2><p className="mt-2 text-xs leading-5 text-[var(--text-secondary)]">{criterion.description}</p></article>)}
        <button onClick={() => form.data && save.mutate({ ...form.data, schema: { ...form.data.schema, rubric }, publish: true }, { onSuccess: () => toast.success("Rubric saved to active form") })} disabled={!form.data} className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-5 text-left hover:bg-[var(--bg-surface-2)] disabled:opacity-50"><ClipboardCheck className="size-5 text-[var(--brand-primary)]" /><p className="mt-4 text-sm font-black text-[var(--text-primary)]">Save rubric</p><p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">Persist committee scoring criteria into the active abstract form schema.</p></button>
      </section>
    </AbstractShell>
  );
}

function ExportsView() {
  const { eventId } = useParams<{ eventId: string }>();
  const baseUrl = `${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"}/api/v1/events/${eventId}/abstracts/exports`;
  const exports = [["Manifest JSON", `${baseUrl}/manifest`], ["Submissions CSV", `${baseUrl}/submissions.csv`], ["Abstract book DOCX", `${baseUrl}/abstract-book.docx`], ["Print-ready abstract book", `${baseUrl}/abstract-book.html`], ["Reviewer report DOCX", `${baseUrl}/reviewer-report.docx`]];
  return (
    <AbstractShell view="exports">
      <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {exports.map(([label, href]) => <a key={label} href={href} className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-5 hover:bg-[var(--bg-surface-2)]"><Download className="size-5 text-[var(--brand-primary)]" /><p className="mt-4 text-sm font-black text-[var(--text-primary)]">{label}</p><p className="mt-1 text-xs text-[var(--text-secondary)]">Export uses authoritative abstract workflow records.</p></a>)}
        <article className="rounded-xl border border-dashed border-[var(--border-default)] bg-[var(--bg-surface)] p-5"><BookOpenCheck className="size-5 text-[var(--text-tertiary)]" /><p className="mt-4 text-sm font-black text-[var(--text-primary)]">Reviewer report pack</p><p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">The committee evidence pack is available as DOCX; branded per-reviewer templates remain a later extension.</p></article>
      </section>
    </AbstractShell>
  );
}

function SubmissionRow({ item }: { item: AbstractSubmission }) {
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0"><p className="truncate text-sm font-black text-[var(--text-primary)]">{item.title}</p><p className="mt-1 text-xs text-[var(--text-secondary)]">{item.code} · {item.presenter_name || "No presenter"} · {item.topic || "No topic"}</p></div>
        <StatusPill status={item.status} />
      </div>
      <div className="mt-3 flex flex-wrap gap-3 text-[11px] font-bold text-[var(--text-tertiary)]"><span>{item.assignment_count} assigned</span><span>{item.review_count} reviews</span><span>{item.conflict_count} conflicts</span><span>{item.average_score ?? "No"} score</span></div>
    </div>
  );
}

function LedgerPreview({ compact = false, submission }: { compact?: boolean; submission?: AbstractSubmission }) {
  const steps = useMemo(() => [
    ["Submitted", Boolean(submission?.submitted_at) || !submission],
    ["Assigned", (submission?.assignment_count || 0) > 0 || !submission],
    ["Reviewed", (submission?.review_count || 0) > 0 || !submission],
    ["Decided", Boolean(submission?.decided_at) || !submission],
    ["Published", Boolean(submission?.published_at) || !submission],
  ], [submission]);
  return (
    <div className={cn("rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-5", compact && "p-4")}>
      <p className="text-xs font-black uppercase tracking-wide text-[var(--text-tertiary)]">Review ledger</p>
      <div className="mt-4 grid gap-2">
        {steps.map(([label, done]) => <div key={String(label)} className="flex items-center gap-3"><span className={cn("size-2 rounded-full", done ? "bg-[var(--brand-primary)]" : "bg-[var(--border-default)]")} /><span className="text-xs font-bold text-[var(--text-secondary)]">{label}</span></div>)}
      </div>
    </div>
  );
}
