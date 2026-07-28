"use client";

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  Check,
  Clock3,
  FileSearch,
  MessageSquareText,
  RotateCcw,
  Search,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  AbstractStatus,
  SpeakerAbstract,
  useAbstracts,
  useReviewAbstract,
} from "@/hooks/useAbstracts";
import { cn } from "@/lib/utils";
import { useOperationAccess } from "@/lib/capabilities";

const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "All submissions" },
  { value: "SUBMITTED", label: "Awaiting review" },
  { value: "UNDER_REVIEW", label: "In review" },
  { value: "REVISION_REQUESTED", label: "Revision requested" },
  { value: "ACCEPTED", label: "Accepted" },
  { value: "REJECTED", label: "Rejected" },
  { value: "DRAFT", label: "Drafts" },
  { value: "WITHDRAWN", label: "Withdrawn" },
];

const STATUS_STYLE: Record<AbstractStatus, string> = {
  DRAFT: "border-zinc-500/20 bg-zinc-500/10 text-zinc-500",
  SUBMITTED: "border-blue-500/20 bg-blue-500/10 text-blue-600",
  UNDER_REVIEW: "border-amber-500/20 bg-amber-500/10 text-amber-600",
  ACCEPTED: "border-emerald-500/20 bg-emerald-500/10 text-emerald-600",
  REJECTED: "border-red-500/20 bg-red-500/10 text-red-600",
  REVISION_REQUESTED:
    "border-violet-500/20 bg-violet-500/10 text-violet-600",
  WITHDRAWN: "border-zinc-500/20 bg-zinc-500/10 text-zinc-500",
};

type ReviewDecision =
  | "UNDER_REVIEW"
  | "ACCEPTED"
  | "REJECTED"
  | "REVISION_REQUESTED";

export default function AbstractReviewPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<SpeakerAbstract | null>(null);
  const [decision, setDecision] = useState<ReviewDecision | null>(null);
  const [notes, setNotes] = useState("");
  const [reason, setReason] = useState("");
  const [caseReference, setCaseReference] = useState("");
  const abstracts = useAbstracts(eventId, { status, search });
  const review = useReviewAbstract(eventId);
  const reviewAccess = useOperationAccess("abstracts.review");

  const counts = useMemo(() => {
    const items = abstracts.data?.items ?? [];
    return {
      total: items.length,
      waiting: items.filter((item) => item.status === "SUBMITTED").length,
      review: items.filter((item) => item.status === "UNDER_REVIEW").length,
      accepted: items.filter((item) => item.status === "ACCEPTED").length,
    };
  }, [abstracts.data?.items]);

  const openDecision = (
    item: SpeakerAbstract,
    nextDecision: ReviewDecision,
  ) => {
    if (!reviewAccess.enabled) {
      toast.error(
        `Abstract review is unavailable: ${(reviewAccess.reason || "RESOLUTION_UNAVAILABLE").replaceAll("_", " ").toLowerCase()}.`,
      );
      return;
    }
    setSelected(item);
    setDecision(nextDecision);
    setNotes("");
    setReason("");
    setCaseReference("");
  };

  const submitDecision = async () => {
    if (!selected || !decision || reason.trim().length < 5) return;
    if (
      ["REJECTED", "REVISION_REQUESTED"].includes(decision) &&
      notes.trim().length < 3
    )
      return;
    try {
      await review.mutateAsync({
        abstract: selected,
        decision,
        notes,
        reason,
        caseReference,
      });
      toast.success(
        decision === "ACCEPTED"
          ? "Abstract accepted"
          : decision === "UNDER_REVIEW"
            ? "Review started"
            : decision === "REVISION_REQUESTED"
              ? "Revision requested"
              : "Abstract rejected",
      );
      setSelected(null);
      setDecision(null);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Abstract review failed",
      );
    }
  };

  return (
    <main className="space-y-6 p-4 md:p-6">
      <header className="overflow-hidden rounded-2xl border border-default bg-surface">
        <div className="grid gap-5 p-5 lg:grid-cols-[1.4fr_1fr] lg:p-7">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-primary">
              Speaker programme · Review docket
            </p>
            <h1 className="mt-2 text-2xl font-black tracking-tight text-main md:text-3xl">
              Abstract review
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
              Review the written case behind every talk. Decisions are versioned,
              attributed, and applied only while the event owns the abstract
              submission capability.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-default bg-default">
            {[
              ["In this view", counts.total],
              ["Awaiting review", counts.waiting],
              ["In review", counts.review],
              ["Accepted", counts.accepted],
            ].map(([label, value]) => (
              <div key={label} className="bg-surface-2 p-3">
                <p className="text-[9px] font-black uppercase tracking-wider text-muted">
                  {label}
                </p>
                <p className="mt-1 text-xl font-black text-main">{value}</p>
              </div>
            ))}
          </div>
        </div>
      </header>

      <section className="grid min-h-[560px] overflow-hidden rounded-2xl border border-default bg-surface lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 border-b border-default lg:border-b-0 lg:border-r">
          <div className="flex flex-col gap-3 border-b border-default p-4 sm:flex-row">
            <label className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search speaker, talk, session, or email"
                className="w-full rounded-xl border border-default bg-surface-2 py-2.5 pl-9 pr-3 text-sm text-main outline-none focus:border-primary"
              />
            </label>
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              className="rounded-xl border border-default bg-surface-2 px-3 py-2.5 text-sm font-bold text-main outline-none focus:border-primary"
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {abstracts.isLoading ? (
            <div className="p-8 text-sm text-muted">Loading review docket…</div>
          ) : abstracts.isError ? (
            <div className="m-4 rounded-xl border border-red-500/30 bg-red-500/5 p-4">
              <p className="text-sm font-black text-red-600">
                Abstract data is unavailable
              </p>
              <p className="mt-1 text-xs text-muted">
                No empty state has been inferred. Retry after the event service
                is available.
              </p>
            </div>
          ) : !(abstracts.data?.items.length ?? 0) ? (
            <div className="flex min-h-72 flex-col items-center justify-center p-8 text-center">
              <FileSearch className="h-8 w-8 text-muted" />
              <p className="mt-3 text-sm font-black text-main">
                No matching abstracts
              </p>
              <p className="mt-1 text-xs text-muted">
                Change the review state or search query.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-default">
              {abstracts.data?.items.map((item) => (
                <button
                  key={item.session_speaker_id}
                  type="button"
                  onClick={() => setSelected(item)}
                  className={cn(
                    "block w-full p-4 text-left transition-colors hover:bg-surface-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                    selected?.session_speaker_id === item.session_speaker_id &&
                      "bg-surface-2",
                  )}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-main">
                        {item.presentation_title || item.session_name}
                      </p>
                      <p className="mt-1 truncate text-xs text-muted">
                        {item.speaker_name} · {item.session_name}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "shrink-0 rounded-full border px-2 py-1 text-[9px] font-black uppercase tracking-wider",
                        STATUS_STYLE[item.status],
                      )}
                    >
                      {item.status.replaceAll("_", " ")}
                    </span>
                  </div>
                  <p className="mt-3 line-clamp-2 text-xs leading-5 text-muted">
                    {item.abstract_text || "No abstract text has been saved."}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>

        <aside className="p-5">
          {selected ? (
            <div className="space-y-5">
              <div>
                <p className="text-[9px] font-black uppercase tracking-[0.18em] text-muted">
                  Manuscript #{selected.version}
                </p>
                <h2 className="mt-2 text-lg font-black text-main">
                  {selected.presentation_title || selected.session_name}
                </h2>
                <p className="mt-1 text-xs text-muted">
                  {selected.speaker_name} · {selected.speaker_email}
                </p>
              </div>
              <div className="max-h-72 overflow-y-auto rounded-xl border border-default bg-surface-2 p-4">
                <p className="whitespace-pre-wrap text-sm leading-6 text-main">
                  {selected.abstract_text || "No abstract text has been saved."}
                </p>
              </div>
              {!!selected.keywords.length && (
                <div className="flex flex-wrap gap-1.5">
                  {selected.keywords.map((keyword) => (
                    <span
                      key={keyword}
                      className="rounded-md bg-primary/10 px-2 py-1 text-[10px] font-bold text-primary"
                    >
                      {keyword}
                    </span>
                  ))}
                </div>
              )}
              {selected.review_notes && (
                <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-3">
                  <p className="text-[9px] font-black uppercase tracking-wider text-violet-600">
                    Review note
                  </p>
                  <p className="mt-1 text-xs leading-5 text-main">
                    {selected.review_notes}
                  </p>
                </div>
              )}
              {["SUBMITTED", "UNDER_REVIEW"].includes(selected.status) && (
                <div className="grid grid-cols-2 gap-2">
                  {selected.status === "SUBMITTED" && (
                    <button
                      onClick={() => openDecision(selected, "UNDER_REVIEW")}
                      disabled={reviewAccess.loading || !reviewAccess.enabled}
                      className="rounded-xl border border-default px-3 py-2 text-xs font-black text-main hover:bg-surface-2"
                    >
                      <Clock3 className="mr-1 inline h-3.5 w-3.5" />
                      Start review
                    </button>
                  )}
                  <button
                    onClick={() => openDecision(selected, "ACCEPTED")}
                    disabled={reviewAccess.loading || !reviewAccess.enabled}
                    className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-black text-white hover:bg-emerald-700"
                  >
                    <Check className="mr-1 inline h-3.5 w-3.5" />
                    Accept
                  </button>
                  <button
                    onClick={() =>
                      openDecision(selected, "REVISION_REQUESTED")
                    }
                    disabled={reviewAccess.loading || !reviewAccess.enabled}
                    className="rounded-xl border border-violet-500/30 px-3 py-2 text-xs font-black text-violet-600 hover:bg-violet-500/5"
                  >
                    <RotateCcw className="mr-1 inline h-3.5 w-3.5" />
                    Request revision
                  </button>
                  <button
                    onClick={() => openDecision(selected, "REJECTED")}
                    disabled={reviewAccess.loading || !reviewAccess.enabled}
                    className="rounded-xl border border-red-500/30 px-3 py-2 text-xs font-black text-red-600 hover:bg-red-500/5"
                  >
                    <X className="mr-1 inline h-3.5 w-3.5" />
                    Reject
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex min-h-72 flex-col items-center justify-center text-center">
              <MessageSquareText className="h-8 w-8 text-muted" />
              <p className="mt-3 text-sm font-black text-main">
                Select a submission
              </p>
              <p className="mt-1 max-w-xs text-xs leading-5 text-muted">
                The review pane keeps the manuscript and the decision together.
              </p>
            </div>
          )}
        </aside>
      </section>

      {selected && decision && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-default bg-surface p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-primary">
                  Governed review decision
                </p>
                <h2 className="mt-1 text-lg font-black text-main">
                  {decision.replaceAll("_", " ").toLowerCase()}
                </h2>
              </div>
              <button
                aria-label="Close review dialog"
                onClick={() => setDecision(null)}
                className="rounded-lg p-1 text-muted hover:bg-surface-2"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 space-y-3">
              {["REJECTED", "REVISION_REQUESTED"].includes(decision) && (
                <textarea
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  rows={4}
                  placeholder={
                    decision === "REJECTED"
                      ? "Explain why this abstract cannot be accepted"
                      : "Explain exactly what the speaker must revise"
                  }
                  className="w-full rounded-xl border border-default bg-surface-2 p-3 text-sm text-main outline-none focus:border-primary"
                />
              )}
              <input
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Administrative reason"
                className="w-full rounded-xl border border-default bg-surface-2 px-3 py-2.5 text-sm text-main outline-none focus:border-primary"
              />
              <input
                value={caseReference}
                onChange={(event) => setCaseReference(event.target.value)}
                placeholder="Case reference (optional)"
                className="w-full rounded-xl border border-default bg-surface-2 px-3 py-2.5 text-sm text-main outline-none focus:border-primary"
              />
            </div>
            <button
              onClick={submitDecision}
              disabled={
                review.isPending ||
                reviewAccess.loading ||
                !reviewAccess.enabled ||
                reason.trim().length < 5 ||
                (["REJECTED", "REVISION_REQUESTED"].includes(decision) &&
                  notes.trim().length < 3)
              }
              className="mt-4 w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-black text-white disabled:opacity-40"
            >
              Apply decision
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
