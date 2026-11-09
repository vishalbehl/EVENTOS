"use client";

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  Check,
  CheckSquare,
  ChevronRight,
  Clock,
  ExternalLink,
  FileText,
  Filter,
  Inbox,
  RefreshCw,
  RotateCcw,
  Search,
  Square,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { TablePagination } from "@/components/organizer/common/TablePagination";
import { useTablePagination } from "@/hooks/useTablePagination";
import {
  AbstractSubmission,
  useAbstractAssignments,
  useAbstractReviewers,
  useAbstractSetup,
  useAbstractSubmissions,
  useAssignAbstractReviewer,
  useBulkDecideAbstract,
  useDecideAbstract,
  useDeleteAbstractSubmission,
  useUpdateAbstractSubmission,
} from "@/hooks/useAbstractWorkflow";
import { AbstractShell, StatusPill } from "./AbstractShell";

export function DecisionActions({
  selected,
  onDecide,
}: {
  selected: AbstractSubmission;
  onDecide: (
    decision: "NOMINATED" | "ACCEPTED" | "WAITLISTED" | "REJECTED" | "REVISION_REQUESTED" | "WITHDRAWN",
    presentationType?: "ORAL" | "POSTER" | "EPOSTER",
    reason?: string,
    notes?: string
  ) => void;
}) {
  const [reason, setReason] = useState("Committee decision applied after review evidence check.");
  const [notes, setNotes] = useState("");

  return (
    <div className="grid gap-2">
      <textarea
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        rows={3}
        className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] p-3 text-xs text-[var(--text-primary)]"
      />
      <input
        value={notes}
        onChange={(event) => setNotes(event.target.value)}
        placeholder="Optional author note"
        className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3 py-2 text-xs text-[var(--text-primary)]"
      />
      <button
        onClick={() => onDecide("ACCEPTED", "ORAL", reason, notes)}
        disabled={selected.status === "ACCEPTED" || reason.trim().length < 5}
        className="rounded-lg bg-emerald-600 hover:bg-emerald-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-40 shadow-sm transition-colors cursor-pointer"
      >
        <Check className="mr-1.5 inline size-4" />
        Accept oral
      </button>
      <button
        onClick={() => onDecide("ACCEPTED", "POSTER", reason, notes)}
        disabled={selected.status === "ACCEPTED" || reason.trim().length < 5}
        className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 px-4 py-2 text-sm font-bold text-emerald-700 dark:text-emerald-300 disabled:opacity-40 transition-colors cursor-pointer"
      >
        Accept poster
      </button>
      <button
        onClick={() => onDecide("REVISION_REQUESTED", undefined, reason, notes)}
        disabled={reason.trim().length < 5}
        className="rounded-lg border border-violet-500/30 bg-violet-500/10 hover:bg-violet-500/20 px-4 py-2 text-sm font-bold text-violet-700 dark:text-violet-300 transition-colors cursor-pointer"
      >
        Request revision
      </button>
      <button
        onClick={() => onDecide("NOMINATED", undefined, reason, notes)}
        disabled={reason.trim().length < 5}
        className="rounded-lg border border-indigo-500/30 bg-indigo-500/10 hover:bg-indigo-500/20 px-4 py-2 text-sm font-bold text-indigo-700 dark:text-indigo-300 transition-colors cursor-pointer"
      >
        Nominate for committee
      </button>
      <button
        onClick={() => onDecide("WAITLISTED", undefined, reason, notes)}
        disabled={reason.trim().length < 5}
        className="rounded-lg border border-orange-500/30 bg-orange-500/10 hover:bg-orange-500/20 px-4 py-2 text-sm font-bold text-orange-700 dark:text-orange-300 transition-colors cursor-pointer"
      >
        Waitlist
      </button>
      <button
        onClick={() => onDecide("REJECTED", undefined, reason, notes)}
        disabled={reason.trim().length < 5}
        className="rounded-lg border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 px-4 py-2 text-sm font-bold text-rose-700 dark:text-rose-300 transition-colors cursor-pointer"
      >
        <X className="mr-1.5 inline size-4" />
        Reject
      </button>
      <button
        onClick={() => onDecide("WITHDRAWN", undefined, reason, notes)}
        disabled={reason.trim().length < 5}
        className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] hover:bg-[var(--bg-surface-hover)] px-4 py-2 text-sm font-bold text-[var(--text-secondary)] transition-colors cursor-pointer"
      >
        Withdraw
      </button>
    </div>
  );
}

export function SubmissionRow({ item }: { item: AbstractSubmission }) {
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-black text-[var(--text-primary)]">{item.title}</p>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            {item.code} · {item.presenter_name || "No presenter"} · {item.topic || "No topic"}
          </p>
        </div>
        <StatusPill status={item.status} />
      </div>
      <div className="mt-3 flex flex-wrap gap-3 text-[11px] font-bold text-[var(--text-tertiary)]">
        <span>{item.assignment_count} assigned</span>
        <span>{item.review_count} reviews</span>
        <span>{item.conflict_count} conflicts</span>
        <span>{item.average_score ?? "No"} score</span>
      </div>
    </div>
  );
}

export function AbstractSubmissionsView({
  mode,
}: {
  mode: "submissions" | "decisions" | "accepted";
}) {
  const { eventId } = useParams<{ eventId: string }>();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState(mode === "accepted" ? "ACCEPTED" : "");
  const [topic, setTopic] = useState("");
  const [track, setTrack] = useState("");
  const [format, setFormat] = useState("");
  const [selected, setSelected] = useState<AbstractSubmission | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkReviewerId, setBulkReviewerId] = useState("");

  const submissions = useAbstractSubmissions(eventId, { search, status, topic, track, format });
  const setup = useAbstractSetup(eventId);
  const reviewers = useAbstractReviewers(eventId);
  const assign = useAssignAbstractReviewer(eventId);
  const decide = useDecideAbstract(eventId);
  const bulkDecide = useBulkDecideAbstract(eventId);
  const updateSubmission = useUpdateAbstractSubmission(eventId);
  const deleteSubmission = useDeleteAbstractSubmission(eventId);

  const view = mode === "decisions" ? "decisions" : mode === "accepted" ? "accepted" : "submissions";
  const items = submissions.data?.items || [];

  // Deduce unique topics & formats for filter options
  const uniqueTopics = useMemo(() => {
    const set = new Set<string>(setup.data?.topics || []);
    items.forEach((item) => {
      if (item.topic) set.add(item.topic);
    });
    return Array.from(set).filter(Boolean).sort();
  }, [items, setup.data?.topics]);

  const uniqueFormats = useMemo(() => {
    const set = new Set<string>(setup.data?.abstract_types || []);
    items.forEach((item) => {
      if (item.abstract_type) set.add(item.abstract_type);
      if (item.presentation_type) set.add(item.presentation_type);
    });
    return Array.from(set).filter(Boolean).sort();
  }, [items, setup.data?.abstract_types]);

  // KPI calculations
  const totalCount = items.length;
  const inReviewCount = items.filter((i) => i.status === "UNDER_REVIEW").length;
  const acceptedCount = items.filter((i) => i.status === "ACCEPTED").length;
  const pendingCount = items.filter((i) => i.status === "SUBMITTED").length;

  // Pagination hook
  const {
    currentPage,
    setCurrentPage,
    pageSize,
    setPageSize,
    totalItems,
    paginatedItems,
  } = useTablePagination(items, 20);

  // Selection toggle handlers
  const toggleSelectAll = () => {
    const pageIds = paginatedItems.map((i) => i.id);
    const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.includes(id));
    if (allPageSelected) {
      setSelectedIds((prev) => prev.filter((id) => !pageIds.includes(id)));
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...pageIds])));
    }
  };

  const toggleSelectRow = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  // Bulk actions
  const handleBulkAssign = () => {
    if (!bulkReviewerId || selectedIds.length === 0) return;
    Promise.all(
      selectedIds.map((subId) => assign.mutateAsync({ submissionId: subId, reviewerId: bulkReviewerId }))
    )
      .then(() => {
        toast.success(`Assigned reviewer to ${selectedIds.length} abstracts`);
        setSelectedIds([]);
        setBulkReviewerId("");
      })
      .catch(() => toast.error("Some reviewer assignments could not be completed"));
  };

  const handleBulkDecision = (targetDecision: "ACCEPTED" | "REJECTED") => {
    if (selectedIds.length === 0) return;
    const selectedSubmissions = items.filter((item) => selectedIds.includes(item.id));
    bulkDecide.mutate(
      {
        submissions: selectedSubmissions,
        decision: targetDecision,
        reason: `Bulk ${targetDecision.toLowerCase()} action from abstract console table`,
      },
      {
        onSuccess: () => {
          toast.success(`Bulk marked ${selectedIds.length} abstracts as ${targetDecision}`);
          setSelectedIds([]);
        },
        onError: () => toast.error("Failed to complete bulk decision"),
      }
    );
  };

  const resetFilters = () => {
    setSearch("");
    setStatus(mode === "accepted" ? "ACCEPTED" : "");
    setTopic("");
    setTrack("");
    setFormat("");
  };

  const hasActiveFilters = Boolean(
    search ||
    (mode !== "accepted" && status) ||
    topic ||
    track ||
    format
  );

  return (
    <AbstractShell view={view}>
      <div className="space-y-6">
        {/* KPI Strip */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-4 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                {mode === "accepted" ? "Accepted Abstracts" : "Total Submissions"}
              </span>
              <Inbox className="size-4 text-[var(--brand-primary)]" />
            </div>
            <div className="text-2xl font-bold text-[var(--text-primary)] mt-2">{totalCount}</div>
            <span className="text-[11px] text-[var(--text-secondary)] mt-0.5">Author submissions</span>
          </div>

          <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-4 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                Under Review
              </span>
              <RefreshCw className="size-4 text-amber-500" />
            </div>
            <div className="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-2">{inReviewCount}</div>
            <span className="text-[11px] text-[var(--text-secondary)] mt-0.5">Assigned to reviewers</span>
          </div>

          <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-4 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                Accepted
              </span>
              <CheckSquare className="size-4 text-emerald-500" />
            </div>
            <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-2">{acceptedCount}</div>
            <span className="text-[11px] text-[var(--text-secondary)] mt-0.5">Approved for programme</span>
          </div>

          <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-4 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                Pending Review
              </span>
              <Clock className="size-4 text-sky-500" />
            </div>
            <div className="text-2xl font-bold text-sky-600 dark:text-sky-400 mt-2">{pendingCount}</div>
            <span className="text-[11px] text-[var(--text-secondary)] mt-0.5">Awaiting reviewer triage</span>
          </div>
        </div>

        {/* Search & Filter Bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-[var(--text-tertiary)]" />
            <input
              type="text"
              placeholder="Search by title, code, presenter, topic..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] pl-9 pr-3 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:border-[var(--brand-primary)] focus:outline-none shadow-sm"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {mode !== "accepted" && (
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="h-9 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 text-xs text-[var(--text-primary)] focus:border-[var(--brand-primary)] focus:outline-none shadow-sm"
              >
                <option value="">All Statuses</option>
                <option value="DRAFT">Draft</option>
                <option value="SUBMITTED">Submitted</option>
                <option value="UNDER_REVIEW">Under Review</option>
                <option value="NOMINATED">Nominated</option>
                <option value="ACCEPTED">Accepted</option>
                <option value="WAITLISTED">Waitlisted</option>
                <option value="REVISION_REQUESTED">Revision Requested</option>
                <option value="REJECTED">Rejected</option>
                <option value="WITHDRAWN">Withdrawn</option>
              </select>
            )}

            {uniqueTopics.length > 0 && (
              <select
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                className="h-9 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 text-xs text-[var(--text-primary)] focus:border-[var(--brand-primary)] focus:outline-none shadow-sm max-w-[160px]"
              >
                <option value="">All Topics</option>
                {uniqueTopics.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            )}

            {uniqueFormats.length > 0 && (
              <select
                value={format}
                onChange={(e) => setFormat(e.target.value)}
                className="h-9 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 text-xs text-[var(--text-primary)] focus:border-[var(--brand-primary)] focus:outline-none shadow-sm"
              >
                <option value="">All Formats</option>
                {uniqueFormats.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            )}

            {hasActiveFilters && (
              <button
                type="button"
                onClick={resetFilters}
                className="inline-flex h-9 items-center gap-1 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] shadow-sm transition-colors cursor-pointer"
              >
                <RotateCcw className="size-3" />
                <span>Reset</span>
              </button>
            )}
          </div>
        </div>

        {/* Batch Operations Bar */}
        {selectedIds.length > 0 && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-[var(--brand-primary)]/30 bg-[var(--brand-primary)]/5 p-3 shadow-sm">
            <div className="flex items-center gap-2">
              <span className="flex size-5 items-center justify-center rounded-full bg-[var(--pri)] text-[10px] font-bold text-[var(--primary-contrast)]">
                {selectedIds.length}
              </span>
              <span className="text-xs font-bold text-[var(--text-primary)]">
                {selectedIds.length} abstract{selectedIds.length === 1 ? "" : "s"} selected
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {reviewers.data?.length ? (
                <div className="flex items-center gap-1.5">
                  <select
                    value={bulkReviewerId}
                    onChange={(e) => setBulkReviewerId(e.target.value)}
                    className="h-8 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-2.5 text-xs text-[var(--text-primary)]"
                  >
                    <option value="">Assign Reviewer...</option>
                    {reviewers.data.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.full_name} ({r.assigned_count}/{r.capacity})
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={!bulkReviewerId}
                    onClick={handleBulkAssign}
                    className="h-8 rounded-lg bg-[var(--pri)] px-3 text-xs font-bold text-[var(--primary-contrast)] hover:opacity-90 disabled:opacity-40 shadow-sm cursor-pointer"
                  >
                    Assign
                  </button>
                </div>
              ) : null}

              <button
                type="button"
                onClick={() => handleBulkDecision("ACCEPTED")}
                className="h-8 rounded-lg bg-emerald-600 hover:bg-emerald-700 px-3 text-xs font-bold text-white shadow-sm cursor-pointer"
              >
                Accept
              </button>
              <button
                type="button"
                onClick={() => handleBulkDecision("REJECTED")}
                className="h-8 rounded-lg border border-rose-500/30 px-3 text-xs font-bold text-rose-600 dark:text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 cursor-pointer"
              >
                Reject
              </button>
              <button
                type="button"
                onClick={() => setSelectedIds([])}
                className="h-8 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-2.5 text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-surface-2)]"
              >
                Clear
              </button>
            </div>
          </div>
        )}

        {/* Data Table */}
        <div className="overflow-hidden rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[var(--bg-surface-2)] border-b border-[var(--border-subtle)] text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                <tr>
                  <th className="w-10 px-4 py-3">
                    <button
                      type="button"
                      onClick={toggleSelectAll}
                      className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] cursor-pointer"
                      title="Select all"
                    >
                      {paginatedItems.length > 0 && paginatedItems.every((item) => selectedIds.includes(item.id)) ? (
                        <CheckSquare className="size-4 text-[var(--brand-primary)]" />
                      ) : (
                        <Square className="size-4" />
                      )}
                    </button>
                  </th>
                  <th className="px-4 py-3">Abstract</th>
                  <th className="px-4 py-3">Topic / Category</th>
                  <th className="px-4 py-3">Presenter</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-center">Reviews</th>
                  <th className="px-4 py-3">Submitted</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {submissions.isLoading ? (
                  <tr>
                    <td colSpan={8} className="py-16 text-center text-xs text-[var(--text-secondary)]">
                      <RefreshCw className="size-5 text-[var(--brand-primary)] animate-spin mx-auto mb-2" />
                      Loading abstract submissions...
                    </td>
                  </tr>
                ) : items.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-16 text-center text-xs text-[var(--text-secondary)]">
                      <FileText className="size-8 text-[var(--text-tertiary)] mx-auto mb-2" />
                      <p className="font-bold text-sm text-[var(--text-primary)]">No submissions found</p>
                      <p className="mt-1 text-xs text-[var(--text-tertiary)]">
                        {hasActiveFilters
                          ? "Try adjusting your search query or filters."
                          : "Abstract submissions will appear here once submitted by authors."}
                      </p>
                      {hasActiveFilters && (
                        <button
                          type="button"
                          onClick={resetFilters}
                          className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-default)] px-3 py-1.5 text-xs font-semibold hover:bg-[var(--bg-surface-2)]"
                        >
                          <RotateCcw className="size-3" /> Clear Filters
                        </button>
                      )}
                    </td>
                  </tr>
                ) : (
                  paginatedItems.map((item) => {
                    const isSelected = selectedIds.includes(item.id);
                    return (
                      <tr
                        key={item.id}
                        onClick={() => setSelected(item)}
                        className={`hover:bg-[var(--bg-surface-2)]/50 transition-colors cursor-pointer ${
                          isSelected ? "bg-[var(--brand-primary)]/5" : ""
                        }`}
                      >
                        <td className="px-4 py-3.5" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() => toggleSelectRow(item.id)}
                            className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] cursor-pointer"
                          >
                            {isSelected ? (
                              <CheckSquare className="size-4 text-[var(--brand-primary)]" />
                            ) : (
                              <Square className="size-4" />
                            )}
                          </button>
                        </td>
                        <td className="px-4 py-3.5 max-w-[280px]">
                          <div className="font-mono text-[10px] font-bold text-[var(--brand-primary)]">
                            {item.code}
                          </div>
                          <div className="truncate font-semibold text-[var(--text-primary)] text-xs mt-0.5" title={item.title}>
                            {item.title}
                          </div>
                          {item.abstract_type && (
                            <span className="text-[10px] text-[var(--text-tertiary)] uppercase font-mono mt-0.5 block">
                              {item.abstract_type}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3.5">
                          <span className="inline-flex items-center rounded-md bg-[var(--bg-surface-2)] px-2 py-0.5 text-[11px] font-medium text-[var(--text-secondary)] border border-[var(--border-subtle)]">
                            {item.topic || "General"}
                          </span>
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="font-medium text-[var(--text-primary)]">
                            {item.presenter_name || "—"}
                          </div>
                          {item.presenter_email && (
                            <div className="text-[11px] text-[var(--text-tertiary)] truncate max-w-[140px]">
                              {item.presenter_email}
                            </div>
                          )}
                          {item.authors && item.authors.length > 1 && (
                            <div className="text-[10px] text-[var(--text-tertiary)] mt-0.5">
                              +{item.authors.length - 1} co-author{item.authors.length - 1 === 1 ? "" : "s"}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3.5">
                          <StatusPill status={item.status} />
                        </td>
                        <td className="px-4 py-3.5 text-center">
                          <div className="inline-flex items-center gap-1">
                            <span className="font-bold text-[var(--text-primary)]">{item.review_count}</span>
                            <span className="text-[10px] text-[var(--text-tertiary)]">
                              {item.average_score != null ? `(★${item.average_score.toFixed(1)})` : "reviews"}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-[11px] text-[var(--text-secondary)] whitespace-nowrap">
                          {item.submitted_at
                            ? new Date(item.submitted_at).toLocaleDateString("en-US", {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                              })
                            : "Draft"}
                        </td>
                        <td className="px-4 py-3.5 text-right" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() => setSelected(item)}
                            className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-2.5 py-1 text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] transition-colors cursor-pointer"
                          >
                            <span>Inspect</span>
                            <ChevronRight className="size-3 text-[var(--text-tertiary)]" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Table Pagination */}
          {items.length > 0 && (
            <div className="border-t border-[var(--border-subtle)] p-3">
              <TablePagination
                currentPage={currentPage}
                totalItems={totalItems}
                pageSize={pageSize}
                onPageChange={setCurrentPage}
                onPageSizeChange={setPageSize}
                pageSizeOptions={[10, 20, 50, 100]}
                itemLabel="abstracts"
              />
            </div>
          )}
        </div>

        {/* Abstract Inspection Slide-over Drawer */}
        {selected && (
          <div className="fixed inset-0 z-50 overflow-hidden">
            {/* Backdrop */}
            <div
              className="absolute inset-0 bg-black/40 backdrop-blur-xs transition-opacity"
              onClick={() => setSelected(null)}
            />

            <div className="fixed inset-y-0 right-0 flex max-w-full pl-10">
              <aside className="w-screen max-w-xl bg-[var(--bg-surface)] shadow-2xl border-l border-[var(--border-default)] flex flex-col">
                {/* Drawer Header */}
                <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-6 py-4">
                  <div>
                    <span className="font-mono text-xs font-bold text-[var(--brand-primary)]">
                      {selected.code}
                    </span>
                    <h2 className="text-sm font-bold text-[var(--text-primary)] truncate max-w-sm mt-0.5">
                      {selected.title}
                    </h2>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusPill status={selected.status} />
                    <button
                      type="button"
                      onClick={() => setSelected(null)}
                      className="rounded-lg p-1.5 text-[var(--text-tertiary)] hover:bg-[var(--bg-surface-2)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                </div>

                {/* Drawer Content */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                  {/* Meta Strip */}
                  <div className="grid grid-cols-2 gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-2)] p-3.5 text-xs">
                    <div>
                      <span className="text-[10px] font-bold uppercase text-[var(--text-tertiary)]">Topic</span>
                      <p className="font-semibold text-[var(--text-primary)] mt-0.5">{selected.topic || "General"}</p>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold uppercase text-[var(--text-tertiary)]">Format</span>
                      <p className="font-semibold text-[var(--text-primary)] mt-0.5">{selected.abstract_type || "Standard"}</p>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold uppercase text-[var(--text-tertiary)]">Presenter</span>
                      <p className="font-semibold text-[var(--text-primary)] mt-0.5">{selected.presenter_name || "—"}</p>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold uppercase text-[var(--text-tertiary)]">Submitted</span>
                      <p className="font-semibold text-[var(--text-primary)] mt-0.5">
                        {selected.submitted_at ? new Date(selected.submitted_at).toLocaleDateString() : "Draft"}
                      </p>
                    </div>
                  </div>

                  {/* Authors List */}
                  {selected.authors && selected.authors.length > 0 && (
                    <div>
                      <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-2">
                        Authors ({selected.authors.length})
                      </h3>
                      <div className="space-y-1.5">
                        {selected.authors.map((author) => (
                          <div
                            key={author.id}
                            className="flex items-center justify-between rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2 text-xs"
                          >
                            <div>
                              <span className="font-bold text-[var(--text-primary)]">{author.full_name}</span>
                              {author.affiliation && (
                                <span className="text-[var(--text-secondary)] ml-1">· {author.affiliation}</span>
                              )}
                            </div>
                            {author.is_presenter && (
                              <span className="rounded bg-[var(--brand-primary)]/10 px-2 py-0.5 text-[10px] font-bold text-[var(--brand-primary)] border border-[var(--brand-primary)]/20">
                                Presenter
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Abstract Body */}
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-2">
                      Abstract Content
                    </h3>
                    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-2)] p-4 text-xs leading-relaxed text-[var(--text-primary)] whitespace-pre-wrap font-sans">
                      {selected.body}
                    </div>
                  </div>

                  {/* Keywords */}
                  {selected.keywords && selected.keywords.length > 0 && (
                    <div>
                      <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-2">
                        Keywords
                      </h3>
                      <div className="flex flex-wrap gap-1.5">
                        {selected.keywords.map((kw) => (
                          <span
                            key={kw}
                            className="rounded-md bg-[var(--bg-surface-2)] px-2 py-1 text-[11px] font-medium text-[var(--text-secondary)] border border-[var(--border-subtle)]"
                          >
                            {kw}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Attachments */}
                  {selected.attachments && selected.attachments.length > 0 && (
                    <div>
                      <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-2">
                        Attachments ({selected.attachments.length})
                      </h3>
                      <div className="space-y-2">
                        {selected.attachments.map((att) => (
                          <div
                            key={att.id}
                            className="flex items-center justify-between rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3 text-xs"
                          >
                            <span className="font-semibold text-[var(--text-primary)] truncate max-w-xs">
                              {att.filename}
                            </span>
                            <span className="text-[10px] text-[var(--text-tertiary)] uppercase font-mono">
                              {att.kind}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Review Evidence */}
                  {selected.reviews && selected.reviews.length > 0 && (
                    <div>
                      <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-2">
                        Review Evidence ({selected.reviews.length})
                      </h3>
                      <div className="space-y-3">
                        {selected.reviews.map((rev) => (
                          <div key={rev.id} className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-2)] p-4 text-xs space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-[var(--text-primary)]">{rev.reviewer_name}</span>
                              <span className="rounded-md bg-[var(--bg-surface)] px-2 py-0.5 font-mono text-[11px] font-bold border border-[var(--border-subtle)]">
                                Score: {rev.total_score} · {rev.recommendation}
                              </span>
                            </div>
                            {rev.comments_to_committee && (
                              <p className="text-[11px] text-[var(--text-secondary)] bg-[var(--bg-surface)] p-2.5 rounded-lg border border-[var(--border-subtle)]">
                                <span className="font-bold text-[var(--text-primary)] block mb-0.5">Committee Note:</span>
                                {rev.comments_to_committee}
                              </p>
                            )}
                            {rev.comments_to_author && (
                              <p className="text-[11px] text-[var(--text-secondary)] bg-[var(--bg-surface)] p-2.5 rounded-lg border border-[var(--border-subtle)]">
                                <span className="font-bold text-[var(--text-primary)] block mb-0.5">Author Note:</span>
                                {rev.comments_to_author}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Assign Reviewer */}
                  {reviewers.data && reviewers.data.length > 0 && (
                    <div>
                      <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-2">
                        Assign Reviewer
                      </h3>
                      <div className="flex items-center gap-2">
                        <select
                          id="drawer-reviewer-select"
                          className="flex-1 h-9 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3 text-xs text-[var(--text-primary)]"
                          defaultValue=""
                        >
                          <option value="" disabled>Select reviewer to assign...</option>
                          {reviewers.data.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.full_name} ({r.assigned_count}/{r.capacity} assigned)
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => {
                            const el = document.getElementById("drawer-reviewer-select") as HTMLSelectElement;
                            if (el && el.value) {
                              assign.mutate(
                                { submissionId: selected.id, reviewerId: el.value },
                                { onSuccess: () => toast.success("Reviewer assigned successfully") }
                              );
                            }
                          }}
                          className="h-9 rounded-lg bg-[var(--pri)] px-4 text-xs font-bold text-[var(--primary-contrast)] hover:opacity-90 shadow-sm transition-opacity cursor-pointer"
                        >
                          Assign
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Decision Actions */}
                  <div className="border-t border-[var(--border-subtle)] pt-4">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-3">
                      Evaluation & Decisions
                    </h3>
                    <DecisionActions
                      selected={selected}
                      onDecide={(decision, presentationType, reason, notes) =>
                        decide.mutate(
                          {
                            submission: selected,
                            decision,
                            reason: reason || "Committee decision applied after review evidence check.",
                            notes,
                            presentationType,
                          },
                          {
                            onSuccess: () => {
                              toast.success(`Abstract marked as ${decision}`);
                              setSelected(null);
                            },
                          }
                        )
                      }
                    />
                  </div>

                  {/* Safe Actions (Reopen / Delete) */}
                  <div className="border-t border-[var(--border-subtle)] pt-4 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() =>
                        updateSubmission.mutate(
                          { ...selected, status: "SUBMITTED" },
                          { onSuccess: () => { toast.success("Abstract reopened for review"); setSelected(null); } }
                        )
                      }
                      className="h-8 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-surface-2)]"
                    >
                      Reopen for Review
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        deleteSubmission.mutate(selected, {
                          onSuccess: () => {
                            setSelected(null);
                            toast.success("Abstract deleted");
                          },
                        })
                      }
                      disabled={selected.status === "ACCEPTED"}
                      className="h-8 rounded-lg border border-rose-200 px-3 text-xs font-bold text-rose-700 bg-[var(--bg-surface)] hover:bg-rose-50 disabled:opacity-40"
                    >
                      Delete Abstract
                    </button>
                  </div>
                </div>
              </aside>
            </div>
          </div>
        )}
      </div>
    </AbstractShell>
  );
}
export default AbstractSubmissionsView;
