"use client";

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Copy,
  Eye,
  FileText,
  FolderPlus,
  Mail,
  Plus,
  RotateCcw,
  Search,
  Shield,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { TablePagination } from "@/components/organizer/common/TablePagination";
import { useTablePagination } from "@/hooks/useTablePagination";
import {
  AbstractReviewer,
  AbstractSubmission,
  useAbstractAssignments,
  useAbstractReviewerGrants,
  useAbstractReviewers,
  useAbstractSetup,
  useAbstractSubmissions,
  useAssignAbstractReviewer,
  useCreateAbstractReviewer,
  useDeleteAbstractReviewer,
  useIssueAbstractReviewerInvitation,
  useRevokeAbstractReviewerGrant,
  useUpdateAbstractAssignment,
  useUpdateAbstractReviewer,
} from "@/hooks/useAbstractWorkflow";
import { AbstractShell, StatusPill } from "./AbstractShell";

export function ReviewSummary({ eventId }: { eventId: string }) {
  const submissions = useAbstractSubmissions(eventId);
  const reviewed = (submissions.data?.items || []).filter((item) => (item.review_count || 0) > 0);

  return (
    <section className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] overflow-hidden shadow-sm">
      <div className="border-b border-[var(--border-subtle)] px-5 py-4">
        <h2 className="text-sm font-bold text-[var(--text-primary)]">Recent Evaluation Evidence</h2>
        <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
          Live stream of submitted reviews, score summaries, and comments across all abstracts.
        </p>
      </div>
      <div className="divide-y divide-[var(--border-subtle)]">
        {reviewed.length ? (
          reviewed.slice(0, 10).map((submission) => (
            <article key={submission.id} className="grid gap-3 p-4 lg:grid-cols-[1fr_auto] hover:bg-[var(--bg-surface-2)]/30 transition-colors">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10px] font-bold text-[var(--text-tertiary)]">{submission.code}</span>
                  <p className="text-sm font-bold text-[var(--text-primary)]">{submission.title}</p>
                </div>
                <p className="mt-1 text-xs text-[var(--text-secondary)]">
                  {submission.review_count} review{submission.review_count === 1 ? "" : "s"} · average score:{" "}
                  <strong>{submission.average_score != null ? submission.average_score.toFixed(1) : "—"}</strong>
                </p>
                {submission.reviews && submission.reviews.length > 0 && (
                  <div className="mt-2.5 space-y-2">
                    {submission.reviews.map((review) => (
                      <div key={review.id} className="rounded-lg bg-[var(--bg-surface-2)] p-3 border border-[var(--border-subtle)]">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-bold text-[var(--text-primary)]">
                            {review.reviewer_name}
                          </p>
                          <span className="rounded bg-[var(--bg-surface)] px-2 py-0.5 text-[11px] font-mono font-bold text-[var(--text-primary)] border border-[var(--border-subtle)]">
                            Score: {review.total_score} · {review.recommendation}
                          </span>
                        </div>
                        {review.comments_to_committee && (
                          <p className="mt-1.5 text-[11px] text-[var(--text-secondary)] bg-[var(--bg-surface)] p-2 rounded border border-[var(--border-subtle)]">
                            <span className="font-bold text-[var(--text-primary)]">Committee: </span>
                            {review.comments_to_committee}
                          </p>
                        )}
                        {review.comments_to_author && (
                          <p className="mt-1 text-[11px] text-[var(--text-secondary)] bg-[var(--bg-surface)] p-2 rounded border border-[var(--border-subtle)]">
                            <span className="font-bold text-[var(--text-primary)]">Author Feedback: </span>
                            {review.comments_to_author}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="shrink-0 self-start">
                <StatusPill status={submission.status} />
              </div>
            </article>
          ))
        ) : (
          <div className="p-8 text-center text-xs text-[var(--text-secondary)]">
            <ClipboardCheck className="mx-auto size-6 text-[var(--text-tertiary)] mb-2" />
            <p className="font-bold text-[var(--text-primary)]">No completed reviews yet</p>
            <p className="mt-0.5">As reviewers submit their evaluations, live scores and feedback will stream in here.</p>
          </div>
        )}
      </div>
    </section>
  );
}

export function ReviewerDetailDrawer({
  reviewer,
  eventId,
  onClose,
  onGenerateLink,
  issuedToken,
}: {
  reviewer: AbstractReviewer;
  eventId: string;
  onClose: () => void;
  onGenerateLink: () => void;
  issuedToken: string | null;
}) {
  const assignments = useAbstractAssignments(eventId);
  const submissions = useAbstractSubmissions(eventId);
  const setup = useAbstractSetup(eventId);
  const updateReviewer = useUpdateAbstractReviewer(eventId);
  const updateAssignment = useUpdateAbstractAssignment(eventId);
  const assignReviewer = useAssignAbstractReviewer(eventId);
  const grants = useAbstractReviewerGrants(eventId);
  const revokeGrant = useRevokeAbstractReviewerGrant(eventId);

  const [activeTab, setActiveTab] = useState<"actions" | "assigned" | "assign-task" | "access">("actions");
  const [selectedSubmissionId, setSelectedSubmissionId] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [isAssigning, setIsAssigning] = useState(false);

  // Reviewer's assignments
  const reviewerAssignments = useMemo(() => {
    return (assignments.data || []).filter((a) => a.reviewer_id === reviewer.id);
  }, [assignments.data, reviewer.id]);

  // Actions done by reviewer (reviews submitted)
  const reviewerActions = useMemo(() => {
    const list: Array<{
      submissionId: string;
      submissionCode: string;
      submissionTitle: string;
      review: NonNullable<AbstractSubmission["reviews"]>[number];
    }> = [];

    (submissions.data?.items || []).forEach((sub) => {
      (sub.reviews || []).forEach((rev) => {
        if (rev.reviewer_id === reviewer.id || rev.reviewer_name.toLowerCase() === reviewer.full_name.toLowerCase()) {
          list.push({
            submissionId: sub.id,
            submissionCode: sub.code,
            submissionTitle: sub.title,
            review: rev,
          });
        }
      });
    });

    return list;
  }, [submissions.data?.items, reviewer.id, reviewer.full_name]);

  // Available submissions for assignment
  const unassignedSubmissions = useMemo(() => {
    const assignedIds = new Set(reviewerAssignments.map((a) => a.submission_id));
    return (submissions.data?.items || []).filter((s) => !assignedIds.has(s.id));
  }, [submissions.data?.items, reviewerAssignments]);

  // Submissions in selected category
  const categorySubmissions = useMemo(() => {
    if (!selectedCategory) return [];
    return unassignedSubmissions.filter((s) => s.topic === selectedCategory);
  }, [unassignedSubmissions, selectedCategory]);

  // Active grants for this reviewer
  const reviewerGrantList = useMemo(() => {
    return (grants.data || []).filter((g) => g.email.toLowerCase() === reviewer.email.toLowerCase());
  }, [grants.data, reviewer.email]);

  const initials = reviewer.full_name
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase() || "R";

  const capacityPct = reviewer.capacity > 0 ? Math.min(100, Math.round((reviewer.assigned_count / reviewer.capacity) * 100)) : 0;

  const handleAssignSingle = async () => {
    if (!selectedSubmissionId) return;
    try {
      setIsAssigning(true);
      await assignReviewer.mutateAsync({ submissionId: selectedSubmissionId, reviewerId: reviewer.id });
      toast.success("Abstract assigned to reviewer");
      setSelectedSubmissionId("");
    } catch {
      toast.error("Failed to assign abstract");
    } finally {
      setIsAssigning(false);
    }
  };

  const handleAssignCategory = async () => {
    if (!selectedCategory || categorySubmissions.length === 0) return;
    try {
      setIsAssigning(true);
      let count = 0;
      for (const sub of categorySubmissions) {
        await assignReviewer.mutateAsync({ submissionId: sub.id, reviewerId: reviewer.id });
        count++;
      }
      toast.success(`Assigned ${count} abstracts from "${selectedCategory}" to ${reviewer.full_name}`);
      setSelectedCategory("");
    } catch {
      toast.error("Failed to complete category assignment");
    } finally {
      setIsAssigning(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-xs transition-opacity" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 flex max-w-full pl-10">
        <aside className="w-screen max-w-2xl bg-[var(--bg-surface)] shadow-2xl border-l border-[var(--border-default)] flex flex-col">
          {/* Header */}
          <div className="border-b border-[var(--border-subtle)] px-6 py-5">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3.5">
                <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-[var(--pri)] text-sm font-black text-[var(--primary-contrast)] shadow-sm">
                  {initials}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-black text-[var(--text-primary)]">{reviewer.full_name}</h2>
                    <select
                      value={reviewer.status}
                      onChange={(e) =>
                        updateReviewer.mutate(
                          { reviewerId: reviewer.id, patch: { status: e.target.value as typeof reviewer.status } },
                          { onSuccess: () => toast.success(`Reviewer status updated to ${e.target.value}`) }
                        )
                      }
                      className={cn(
                        "rounded-md border px-2 py-0.5 text-xs font-bold focus:outline-none cursor-pointer",
                        reviewer.status === "ACTIVE" && "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
                        reviewer.status === "INVITED" && "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
                        reviewer.status === "PAUSED" && "border-zinc-500/30 bg-zinc-500/10 text-zinc-700 dark:text-zinc-300"
                      )}
                    >
                      <option value="ACTIVE">ACTIVE</option>
                      <option value="INVITED">INVITED</option>
                      <option value="PAUSED">PAUSED</option>
                    </select>
                  </div>
                  <p className="text-xs text-[var(--text-secondary)]">{reviewer.email}</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onGenerateLink}
                  className="flex items-center gap-1.5 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3 py-1.5 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] shadow-xs transition-colors cursor-pointer"
                >
                  <Copy className="size-3.5" />
                  Copy Access Link
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg p-1.5 text-[var(--text-tertiary)] hover:bg-[var(--bg-surface-2)] hover:text-[var(--text-primary)] cursor-pointer"
                >
                  <X className="size-5" />
                </button>
              </div>
            </div>

            {/* Token Banner */}
            {issuedToken && (
              <div className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-800 dark:text-emerald-300">
                <p className="font-bold flex items-center gap-1.5">
                  <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" />
                  Live Access Token Prepared
                </p>
                <p className="mt-1 break-all font-mono text-[11px] bg-[var(--bg-surface)] p-2 rounded border border-emerald-500/30 text-[var(--text-primary)]">
                  {issuedToken}
                </p>
                <p className="mt-1 text-[11px] text-emerald-700 dark:text-emerald-400">Token copied. Reviewer can use this to access their review board directly.</p>
              </div>
            )}

            {/* Quick Stats Strip */}
            <div className="mt-4 grid grid-cols-3 gap-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface-2)] p-3 text-center">
              <div>
                <p className="text-[10px] font-bold uppercase text-[var(--text-tertiary)]">Assigned Load</p>
                <p className="mt-0.5 text-base font-black text-[var(--text-primary)]">
                  {reviewer.assigned_count} / {reviewer.capacity}
                </p>
                <div className="mx-auto mt-1 h-1 w-20 rounded-full bg-[var(--border-default)] overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full",
                      capacityPct >= 100 ? "bg-rose-500" : capacityPct >= 75 ? "bg-amber-500" : "bg-[var(--brand-primary)]"
                    )}
                    style={{ width: `${capacityPct}%` }}
                  />
                </div>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase text-[var(--text-tertiary)]">Completed Reviews</p>
                <p className="mt-0.5 text-base font-black text-emerald-600 dark:text-emerald-400">{reviewer.completed_count}</p>
                <p className="text-[10px] text-[var(--text-tertiary)]">evaluated</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase text-[var(--text-tertiary)]">Conflicts Declared</p>
                <p className={cn("mt-0.5 text-base font-black", reviewer.conflict_count > 0 ? "text-rose-600 dark:text-rose-400" : "text-[var(--text-primary)]")}>
                  {reviewer.conflict_count}
                </p>
                <p className="text-[10px] text-[var(--text-tertiary)]">recused</p>
              </div>
            </div>

            {/* Expertise Topics */}
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-semibold text-[var(--text-tertiary)]">Expertise:</span>
              {reviewer.expertise_topics && reviewer.expertise_topics.length > 0 ? (
                reviewer.expertise_topics.map((t) => (
                  <span key={t} className="rounded-full bg-[var(--brand-primary)]/10 px-2 py-0.5 text-[10px] font-bold text-[var(--brand-primary)] border border-[var(--brand-primary)]/20">
                    {t}
                  </span>
                ))
              ) : (
                <span className="text-xs text-[var(--text-tertiary)] italic">None specified</span>
              )}
            </div>

            {/* Navigation Tabs */}
            <div className="mt-4 flex border-b border-[var(--border-subtle)] text-xs font-bold">
              <button
                type="button"
                onClick={() => setActiveTab("actions")}
                className={cn(
                  "border-b-2 px-3.5 py-2 transition-colors cursor-pointer",
                  activeTab === "actions"
                    ? "border-[var(--brand-primary)] text-[var(--brand-primary)]"
                    : "border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                )}
              >
                Actions Done ({reviewerActions.length})
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("assigned")}
                className={cn(
                  "border-b-2 px-3.5 py-2 transition-colors cursor-pointer",
                  activeTab === "assigned"
                    ? "border-[var(--brand-primary)] text-[var(--brand-primary)]"
                    : "border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                )}
              >
                Assigned Tasks ({reviewerAssignments.length})
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("assign-task")}
                className={cn(
                  "border-b-2 px-3.5 py-2 transition-colors cursor-pointer",
                  activeTab === "assign-task"
                    ? "border-[var(--brand-primary)] text-[var(--brand-primary)]"
                    : "border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                )}
              >
                Assign Tasks
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("access")}
                className={cn(
                  "border-b-2 px-3.5 py-2 transition-colors cursor-pointer",
                  activeTab === "access"
                    ? "border-[var(--brand-primary)] text-[var(--brand-primary)]"
                    : "border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                )}
              >
                Access & Grants ({reviewerGrantList.length})
              </button>
            </div>
          </div>

          {/* Tab Contents */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {/* TAB 1: ACTIONS DONE BY REVIEWER */}
            {activeTab === "actions" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                    Completed Evaluations & Evidence
                  </h3>
                  <span className="text-xs text-[var(--text-secondary)]">{reviewerActions.length} submitted</span>
                </div>

                {reviewerActions.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-[var(--border-default)] p-8 text-center">
                    <ClipboardCheck className="mx-auto size-8 text-[var(--text-tertiary)] mb-2" />
                    <p className="text-sm font-bold text-[var(--text-primary)]">No completed reviews yet</p>
                    <p className="mt-1 text-xs text-[var(--text-secondary)]">
                      When {reviewer.full_name} submits reviews for their assigned talks, their recommendations, scores, and notes will appear here.
                    </p>
                  </div>
                ) : (
                  reviewerActions.map((item, idx) => (
                    <div
                      key={item.review.id || idx}
                      className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-2)] p-4 text-xs space-y-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="font-mono text-[10px] font-bold text-[var(--text-tertiary)] block">
                            {item.submissionCode}
                          </span>
                          <h4 className="font-bold text-[var(--text-primary)] text-sm">{item.submissionTitle}</h4>
                        </div>
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-[var(--bg-surface)] px-2.5 py-1 font-mono text-xs font-bold text-[var(--text-primary)] border border-[var(--border-subtle)]">
                          Score: {item.review.total_score} · {item.review.recommendation}
                        </span>
                      </div>

                      {/* Criteria breakdown if available */}
                      {item.review.scores && Object.keys(item.review.scores).length > 0 && (
                        <div className="flex flex-wrap gap-2 pt-1 border-t border-[var(--border-subtle)]">
                          {Object.entries(item.review.scores).map(([criterion, score]) => (
                            <span key={criterion} className="rounded bg-[var(--bg-surface)] px-2 py-0.5 text-[10px] font-medium text-[var(--text-secondary)] border border-[var(--border-subtle)]">
                              {criterion}: <strong className="text-[var(--text-primary)]">{score}</strong>
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Committee Note */}
                      {item.review.comments_to_committee && (
                        <div className="rounded-lg bg-[var(--bg-surface)] p-3 border border-[var(--border-subtle)]">
                          <span className="font-bold text-[var(--text-primary)] block mb-1 text-[11px]">
                            Private Committee Note:
                          </span>
                          <p className="text-[11px] text-[var(--text-secondary)] whitespace-pre-wrap">
                            {item.review.comments_to_committee}
                          </p>
                        </div>
                      )}

                      {/* Author Note */}
                      {item.review.comments_to_author && (
                        <div className="rounded-lg bg-[var(--bg-surface)] p-3 border border-[var(--border-subtle)]">
                          <span className="font-bold text-[var(--text-primary)] block mb-1 text-[11px]">
                            Feedback to Author:
                          </span>
                          <p className="text-[11px] text-[var(--text-secondary)] whitespace-pre-wrap">
                            {item.review.comments_to_author}
                          </p>
                        </div>
                      )}

                      <div className="text-[10px] text-[var(--text-tertiary)] flex items-center justify-between pt-1">
                        <span>Submitted {item.review.submitted_at ? new Date(item.review.submitted_at).toLocaleDateString() : "Recently"}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* TAB 2: ASSIGNED TASKS */}
            {activeTab === "assigned" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                    Assigned Abstracts & Talks
                  </h3>
                  <span className="text-xs text-[var(--text-secondary)]">{reviewerAssignments.length} talks</span>
                </div>

                {reviewerAssignments.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-[var(--border-default)] p-8 text-center">
                    <FileText className="mx-auto size-8 text-[var(--text-tertiary)] mb-2" />
                    <p className="text-sm font-bold text-[var(--text-primary)]">No assignments yet</p>
                    <p className="mt-1 text-xs text-[var(--text-secondary)]">
                      Assign talks to {reviewer.full_name} using the &quot;Assign Tasks&quot; tab.
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-[var(--border-subtle)] rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] overflow-hidden">
                    {reviewerAssignments.map((assignment) => (
                      <div key={assignment.id} className="p-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between hover:bg-[var(--bg-surface-2)]/40 transition-colors">
                        <div className="min-w-0 flex-1">
                          <p className="font-mono text-[10px] font-bold text-[var(--text-tertiary)]">
                            {assignment.submission_code}
                          </p>
                          <p className="font-bold text-[var(--text-primary)] text-sm truncate">
                            {assignment.submission_title}
                          </p>
                          {assignment.conflict_declared && (
                            <p className="mt-1 text-xs text-rose-600 font-semibold flex items-center gap-1">
                              <AlertTriangle className="size-3" />
                              Conflict declared: {assignment.conflict_reason || "recused"}
                            </p>
                          )}
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <select
                            value={assignment.status}
                            onChange={(e) =>
                              updateAssignment.mutate(
                                {
                                  assignmentId: assignment.id,
                                  patch: {
                                    status: e.target.value as typeof assignment.status,
                                    conflict_declared: e.target.value === "CONFLICT",
                                  },
                                },
                                { onSuccess: () => toast.success("Assignment status updated") }
                              )
                            }
                            className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-2.5 py-1 text-xs font-bold text-[var(--text-primary)] focus:outline-none"
                          >
                            <option value="ASSIGNED">ASSIGNED</option>
                            <option value="ACCEPTED">ACCEPTED</option>
                            <option value="DECLINED">DECLINED</option>
                            <option value="CONFLICT">CONFLICT</option>
                            <option value="COMPLETED">COMPLETED</option>
                          </select>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: ASSIGN TASKS (INDIVIDUAL OR WHOLE CATEGORY) */}
            {activeTab === "assign-task" && (
              <div className="space-y-6">
                {/* Method A: Assign Whole Category */}
                <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-5 space-y-4">
                  <div className="flex items-center gap-2">
                    <span className="flex size-7 items-center justify-center rounded-lg bg-[var(--brand-primary)]/10 text-[var(--brand-primary)]">
                      <FolderPlus className="size-4" />
                    </span>
                    <div>
                      <h4 className="font-bold text-sm text-[var(--text-primary)]">Assign Whole Category / Topic</h4>
                      <p className="text-xs text-[var(--text-secondary)]">Assign all talks matching a specific track or category.</p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-[var(--text-secondary)]">Select Topic / Category</label>
                    <select
                      value={selectedCategory}
                      onChange={(e) => setSelectedCategory(e.target.value)}
                      className="w-full h-9 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3 text-xs text-[var(--text-primary)] focus:outline-none"
                    >
                      <option value="">Choose a topic...</option>
                      {(setup.data?.topics || []).map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>

                  {selectedCategory && (
                    <div className="rounded-lg bg-[var(--bg-surface-2)] p-3 text-xs text-[var(--text-primary)] border border-[var(--border-default)] flex items-center justify-between">
                      <span>Found <strong>{categorySubmissions.length}</strong> unassigned abstracts in &quot;{selectedCategory}&quot;</span>
                      <button
                        type="button"
                        onClick={handleAssignCategory}
                        disabled={categorySubmissions.length === 0 || isAssigning}
                        className="rounded-lg bg-[var(--pri)] px-3 py-1.5 text-xs font-bold text-[var(--primary-contrast)] hover:opacity-90 disabled:opacity-40 shadow-sm cursor-pointer"
                      >
                        {isAssigning ? "Assigning..." : `Assign all ${categorySubmissions.length}`}
                      </button>
                    </div>
                  )}
                </div>

                {/* Method B: Assign Specific Abstract */}
                <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-5 space-y-4">
                  <div className="flex items-center gap-2">
                    <span className="flex size-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                      <FileText className="size-4" />
                    </span>
                    <div>
                      <h4 className="font-bold text-sm text-[var(--text-primary)]">Assign a Particular Abstract</h4>
                      <p className="text-xs text-[var(--text-secondary)]">Select any single submission from the intake inbox.</p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-[var(--text-secondary)]">Select Abstract</label>
                    <select
                      value={selectedSubmissionId}
                      onChange={(e) => setSelectedSubmissionId(e.target.value)}
                      className="w-full h-9 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3 text-xs text-[var(--text-primary)] focus:outline-none"
                    >
                      <option value="">Choose an abstract...</option>
                      {unassignedSubmissions.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.code} · {s.title} ({s.topic || "General"})
                        </option>
                      ))}
                    </select>
                  </div>

                  <button
                    type="button"
                    onClick={handleAssignSingle}
                    disabled={!selectedSubmissionId || isAssigning}
                    className="w-full h-9 rounded-lg bg-[var(--pri)] px-4 text-xs font-bold text-[var(--primary-contrast)] hover:opacity-90 disabled:opacity-40 shadow-sm transition-opacity cursor-pointer"
                  >
                    {isAssigning ? "Assigning..." : "Assign to Reviewer"}
                  </button>
                </div>
              </div>
            )}

            {/* TAB 4: ACCESS & CREDENTIALS */}
            {activeTab === "access" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                    Reviewer Access Grants
                  </h3>
                  <button
                    type="button"
                    onClick={onGenerateLink}
                    className="flex items-center gap-1 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-2.5 py-1 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--bg-surface-2)]"
                  >
                    <Plus className="size-3.5" /> Issue New Link
                  </button>
                </div>

                {reviewerGrantList.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-[var(--border-default)] p-8 text-center">
                    <Shield className="mx-auto size-8 text-[var(--text-tertiary)] mb-2" />
                    <p className="text-sm font-bold text-[var(--text-primary)]">No active grants found</p>
                    <p className="mt-1 text-xs text-[var(--text-secondary)]">
                      Click &quot;Issue New Link&quot; or &quot;Copy Access Link&quot; above to prepare credentials for {reviewer.full_name}.
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-[var(--border-subtle)] rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] overflow-hidden">
                    {reviewerGrantList.map((grant) => (
                      <div key={grant.id} className="p-4 flex items-center justify-between">
                        <div>
                          <p className="text-xs font-bold text-[var(--text-primary)]">
                            Audience: {grant.audience} · Status: <span className={grant.status === "ACTIVE" ? "text-emerald-600 font-bold" : "text-[var(--text-secondary)]"}>{grant.status}</span>
                          </p>
                          <p className="mt-1 text-[11px] text-[var(--text-secondary)]">
                            Expires: {new Date(grant.expires_at).toLocaleString()}
                          </p>
                        </div>
                        {grant.status === "ACTIVE" && (
                          <button
                            type="button"
                            onClick={() =>
                              revokeGrant.mutate(
                                { grantId: grant.id, version: grant.version },
                                { onSuccess: () => toast.success("Access revoked") }
                              )
                            }
                            className="rounded-lg border border-amber-200 px-2.5 py-1 text-xs font-bold text-amber-700 hover:bg-amber-50"
                          >
                            Revoke
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

export function InviteReviewerModal({
  eventId,
  availableTopics,
  onClose,
}: {
  eventId: string;
  availableTopics: string[];
  onClose: () => void;
}) {
  const createReviewer = useCreateAbstractReviewer(eventId);
  const inviteReviewer = useIssueAbstractReviewerInvitation(eventId);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [topicsInput, setTopicsInput] = useState("");
  const [capacity, setCapacity] = useState(10);
  const [status, setStatus] = useState<"INVITED" | "ACTIVE">("INVITED");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !email.trim()) {
      toast.error("Please enter reviewer name and email");
      return;
    }

    try {
      setIsSubmitting(true);
      const parsedTopics = topicsInput
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      const created = await createReviewer.mutateAsync({
        full_name: fullName.trim(),
        email: email.trim().toLowerCase(),
        expertise_topics: parsedTopics,
        capacity: Number(capacity) || 10,
        status,
      });

      // Prepare invitation link
      try {
        const link = await inviteReviewer.mutateAsync(created.id);
        navigator.clipboard.writeText(link.access_token);
        toast.success(`Reviewer ${created.full_name} invited! Access link copied.`);
      } catch {
        toast.success(`Reviewer ${created.full_name} added to roster.`);
      }

      onClose();
    } catch {
      toast.error("Failed to add reviewer. Email may already be registered.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddTopicChip = (topic: string) => {
    const current = topicsInput.split(",").map((x) => x.trim()).filter(Boolean);
    if (!current.includes(topic)) {
      setTopicsInput(current.concat(topic).join(", "));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-xs" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-6 shadow-2xl space-y-5">
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-lg bg-[var(--brand-primary)]/10 text-[var(--brand-primary)]">
              <UserPlus className="size-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[var(--text-primary)]">Invite Reviewer</h3>
              <p className="text-xs text-[var(--text-secondary)]">Add a peer reviewer to evaluate submitted abstracts.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-[var(--text-tertiary)] hover:bg-[var(--bg-surface-2)]">
            <X className="size-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-bold text-[var(--text-primary)]">Full Name *</label>
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="e.g. Dr. Jane Smith"
              className="mt-1 h-9 w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3 text-xs text-[var(--text-primary)] focus:border-[var(--brand-primary)] focus:outline-none"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-[var(--text-primary)]">Email Address *</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="jane.smith@institution.edu"
              className="mt-1 h-9 w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3 text-xs text-[var(--text-primary)] focus:border-[var(--brand-primary)] focus:outline-none"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-[var(--text-primary)]">Expertise Topics (comma separated)</label>
            <input
              type="text"
              value={topicsInput}
              onChange={(e) => setTopicsInput(e.target.value)}
              placeholder="e.g. AI in Medicine, Genomics, Clinical Ethics"
              className="mt-1 h-9 w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3 text-xs text-[var(--text-primary)] focus:border-[var(--brand-primary)] focus:outline-none"
            />
            {availableTopics.length > 0 && (
              <div className="mt-2 flex flex-wrap items-center gap-1">
                <span className="text-[10px] text-[var(--text-tertiary)] mr-1">Event Topics:</span>
                {availableTopics.slice(0, 6).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => handleAddTopicChip(t)}
                    className="rounded-md bg-[var(--bg-surface-2)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-secondary)] border border-[var(--border-subtle)] hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-primary)] cursor-pointer"
                  >
                    + {t}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-[var(--text-primary)]">Max Capacity (Talks)</label>
              <input
                type="number"
                min={1}
                max={100}
                value={capacity}
                onChange={(e) => setCapacity(Number(e.target.value))}
                className="mt-1 h-9 w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3 text-xs text-[var(--text-primary)] focus:border-[var(--brand-primary)] focus:outline-none"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-[var(--text-primary)]">Initial Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as "INVITED" | "ACTIVE")}
                className="mt-1 h-9 w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3 text-xs text-[var(--text-primary)] focus:border-[var(--brand-primary)] focus:outline-none"
              >
                <option value="INVITED">INVITED (Awaiting Confirmation)</option>
                <option value="ACTIVE">ACTIVE (Immediately Available)</option>
              </select>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-[var(--border-subtle)] pt-4">
            <button
              type="button"
              onClick={onClose}
              className="h-9 rounded-lg border border-[var(--border-default)] px-4 text-xs font-bold text-[var(--text-secondary)] hover:bg-[var(--bg-surface-2)] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex h-9 items-center gap-1.5 rounded-lg bg-[var(--pri)] px-4 text-xs font-bold text-[var(--primary-contrast)] hover:opacity-90 disabled:opacity-50 shadow-sm cursor-pointer"
            >
              <UserPlus className="size-4" />
              {isSubmitting ? "Inviting..." : "Send Invitation & Add"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function BulkAssignModal({
  eventId,
  reviewers,
  availableTopics,
  onClose,
}: {
  eventId: string;
  reviewers: AbstractReviewer[];
  availableTopics: string[];
  onClose: () => void;
}) {
  const submissions = useAbstractSubmissions(eventId);
  const assignReviewer = useAssignAbstractReviewer(eventId);

  const [mode, setMode] = useState<"category" | "talks">("category");
  const [selectedTopic, setSelectedTopic] = useState("");
  const [selectedReviewerId, setSelectedReviewerId] = useState("");
  const [selectedTalkIds, setSelectedTalkIds] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Filter matching submissions in selected category
  const categorySubmissions = useMemo(() => {
    if (!selectedTopic) return [];
    return (submissions.data?.items || []).filter((s) => s.topic === selectedTopic);
  }, [submissions.data?.items, selectedTopic]);

  const targetReviewer = useMemo(() => {
    return reviewers.find((r) => r.id === selectedReviewerId);
  }, [reviewers, selectedReviewerId]);

  const handleBulkAssign = async () => {
    if (!selectedReviewerId) {
      toast.error("Please select a target reviewer");
      return;
    }

    const talkIdsToAssign = mode === "category" ? categorySubmissions.map((s) => s.id) : selectedTalkIds;

    if (talkIdsToAssign.length === 0) {
      toast.error("No talks selected to assign");
      return;
    }

    try {
      setIsSubmitting(true);
      let count = 0;
      for (const id of talkIdsToAssign) {
        await assignReviewer.mutateAsync({ submissionId: id, reviewerId: selectedReviewerId });
        count++;
      }
      toast.success(`Successfully assigned ${count} talks to ${targetReviewer?.full_name || "reviewer"}`);
      onClose();
    } catch {
      toast.error("An error occurred during bulk assignment");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleTalk = (id: string) => {
    setSelectedTalkIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleSelectAllTalks = () => {
    const allIds = (submissions.data?.items || []).map((s) => s.id);
    if (selectedTalkIds.length === allIds.length) {
      setSelectedTalkIds([]);
    } else {
      setSelectedTalkIds(allIds);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-xs" onClick={onClose} />
      <div className="relative w-full max-w-xl rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-6 shadow-2xl space-y-5">
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-lg bg-[var(--brand-primary)]/10 text-[var(--brand-primary)]">
              <FolderPlus className="size-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[var(--text-primary)]">Assign Abstracts in Bulk</h3>
              <p className="text-xs text-[var(--text-secondary)]">Distribute multiple talks or an entire topic category to reviewers.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-[var(--text-tertiary)] hover:bg-[var(--bg-surface-2)]">
            <X className="size-5" />
          </button>
        </div>

        {/* Mode Selector */}
        <div className="grid grid-cols-2 gap-2 rounded-xl bg-[var(--bg-surface-2)] p-1 text-xs font-bold">
          <button
            type="button"
            onClick={() => setMode("category")}
            className={cn(
              "rounded-lg py-2 transition-all cursor-pointer",
              mode === "category" ? "bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-xs" : "text-[var(--text-secondary)]"
            )}
          >
            Assign by Category / Topic
          </button>
          <button
            type="button"
            onClick={() => setMode("talks")}
            className={cn(
              "rounded-lg py-2 transition-all cursor-pointer",
              mode === "talks" ? "bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-xs" : "text-[var(--text-secondary)]"
            )}
          >
            Select Specific Talks
          </button>
        </div>

        {/* Step 1: Select Topic or Select Talks */}
        {mode === "category" ? (
          <div className="space-y-2">
            <label className="text-xs font-bold text-[var(--text-primary)]">Select Category / Topic</label>
            <select
              value={selectedTopic}
              onChange={(e) => setSelectedTopic(e.target.value)}
              className="w-full h-9 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3 text-xs text-[var(--text-primary)] focus:outline-none"
            >
              <option value="">Choose a category...</option>
              {availableTopics.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            {selectedTopic && (
              <p className="text-xs text-[var(--brand-primary)] font-semibold">
                Found {categorySubmissions.length} abstracts tagged under &quot;{selectedTopic}&quot;.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-[var(--text-primary)]">
              <span>Select Submissions ({selectedTalkIds.length} selected)</span>
              <button
                type="button"
                onClick={handleSelectAllTalks}
                className="text-[var(--brand-primary)] hover:underline cursor-pointer"
              >
                {selectedTalkIds.length === (submissions.data?.items || []).length ? "Deselect All" : "Select All"}
              </button>
            </div>
            <div className="max-h-48 overflow-y-auto rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] divide-y divide-[var(--border-subtle)]">
              {(submissions.data?.items || []).length === 0 ? (
                <p className="p-4 text-center text-xs text-[var(--text-secondary)]">No submissions found</p>
              ) : (
                (submissions.data?.items || []).map((sub) => (
                  <label
                    key={sub.id}
                    className="flex items-center gap-2.5 p-2.5 text-xs hover:bg-[var(--bg-surface)] cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedTalkIds.includes(sub.id)}
                      onChange={() => handleToggleTalk(sub.id)}
                      className="rounded border-[var(--border-default)] text-[var(--brand-primary)]"
                    />
                    <span className="font-mono text-[10px] font-bold text-[var(--text-tertiary)]">{sub.code}</span>
                    <span className="font-medium text-[var(--text-primary)] truncate flex-1">{sub.title}</span>
                    <span className="text-[10px] text-[var(--text-tertiary)]">{sub.topic || "General"}</span>
                  </label>
                ))
              )}
            </div>
          </div>
        )}

        {/* Step 2: Target Reviewer */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-[var(--text-primary)]">Assign To Reviewer</label>
          <select
            value={selectedReviewerId}
            onChange={(e) => setSelectedReviewerId(e.target.value)}
            className="w-full h-9 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3 text-xs text-[var(--text-primary)] focus:outline-none"
          >
            <option value="">Select target reviewer...</option>
            {reviewers.map((r) => (
              <option key={r.id} value={r.id}>
                {r.full_name} ({r.assigned_count}/{r.capacity} assigned) · {r.status}
              </option>
            ))}
          </select>
          {targetReviewer && (
            <div className="rounded-lg bg-[var(--bg-surface-2)] p-2.5 text-xs text-[var(--text-secondary)] flex items-center justify-between border border-[var(--border-subtle)]">
              <span>Current Workload: <strong>{targetReviewer.assigned_count} / {targetReviewer.capacity}</strong></span>
              <span>Available Capacity: <strong>{Math.max(0, targetReviewer.capacity - targetReviewer.assigned_count)}</strong></span>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-2 border-t border-[var(--border-subtle)] pt-4">
          <button
            type="button"
            onClick={onClose}
            className="h-9 rounded-lg border border-[var(--border-default)] px-4 text-xs font-bold text-[var(--text-secondary)] hover:bg-[var(--bg-surface-2)] cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleBulkAssign}
            disabled={isSubmitting || !selectedReviewerId || (mode === "category" ? !selectedTopic : selectedTalkIds.length === 0)}
            className="flex h-9 items-center gap-1.5 rounded-lg bg-[var(--pri)] px-4 text-xs font-bold text-[var(--primary-contrast)] hover:opacity-90 disabled:opacity-50 shadow-sm cursor-pointer"
          >
            <FolderPlus className="size-4" />
            {isSubmitting ? "Assigning..." : "Assign Talks"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function AbstractReviewersView() {
  const { eventId } = useParams<{ eventId: string }>();
  const reviewers = useAbstractReviewers(eventId);
  const submissions = useAbstractSubmissions(eventId);
  const setup = useAbstractSetup(eventId);
  const updateReviewer = useUpdateAbstractReviewer(eventId);
  const deleteReviewer = useDeleteAbstractReviewer(eventId);
  const inviteReviewer = useIssueAbstractReviewerInvitation(eventId);

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "INVITED" | "PAUSED">("ALL");
  const [topicFilter, setTopicFilter] = useState<string>("ALL");
  const [selectedReviewer, setSelectedReviewer] = useState<AbstractReviewer | null>(null);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [isBulkAssignModalOpen, setIsBulkAssignModalOpen] = useState(false);
  const [issuedTokens, setIssuedTokens] = useState<Record<string, string>>({});

  // Keep selectedReviewer fresh if reviewers data updates
  const activeSelectedReviewer = useMemo(() => {
    if (!selectedReviewer) return null;
    return (reviewers.data || []).find((r) => r.id === selectedReviewer.id) || selectedReviewer;
  }, [selectedReviewer, reviewers.data]);

  // Derived KPIs
  const totalReviewers = reviewers.data?.length || 0;
  const activeReviewers = reviewers.data?.filter((r) => r.status === "ACTIVE").length || 0;
  const invitedReviewers = reviewers.data?.filter((r) => r.status === "INVITED").length || 0;
  const totalAssigned = reviewers.data?.reduce((acc, r) => acc + (r.assigned_count || 0), 0) || 0;
  const totalCompleted = reviewers.data?.reduce((acc, r) => acc + (r.completed_count || 0), 0) || 0;
  const totalCapacity = reviewers.data?.reduce((acc, r) => acc + (r.capacity || 0), 0) || 0;
  const totalConflicts = reviewers.data?.reduce((acc, r) => acc + (r.conflict_count || 0), 0) || 0;

  // Available topics for filtering
  const allTopics = useMemo(() => {
    const set = new Set<string>();
    (setup.data?.topics || []).forEach((t) => set.add(t));
    (reviewers.data || []).forEach((r) => (r.expertise_topics || []).forEach((t) => set.add(t)));
    (submissions.data?.items || []).forEach((s) => {
      if (s.topic) set.add(s.topic);
    });
    return Array.from(set).sort();
  }, [setup.data?.topics, reviewers.data, submissions.data?.items]);

  // Filtered reviewers
  const filteredReviewers = useMemo(() => {
    return (reviewers.data || []).filter((r) => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        r.full_name.toLowerCase().includes(q) ||
        r.email.toLowerCase().includes(q) ||
        r.expertise_topics?.some((t) => t.toLowerCase().includes(q));

      const matchesStatus = statusFilter === "ALL" || r.status === statusFilter;
      const matchesTopic = topicFilter === "ALL" || r.expertise_topics?.includes(topicFilter);

      return matchesSearch && matchesStatus && matchesTopic;
    });
  }, [reviewers.data, searchQuery, statusFilter, topicFilter]);

  const {
    currentPage,
    setCurrentPage,
    pageSize,
    setPageSize,
    totalItems,
    paginatedItems: paginatedReviewers,
  } = useTablePagination(filteredReviewers, 10);

  const handleGenerateLink = (reviewerId: string) => {
    inviteReviewer.mutate(reviewerId, {
      onSuccess: (result) => {
        setIssuedTokens((prev) => ({ ...prev, [reviewerId]: result.access_token }));
        navigator.clipboard.writeText(result.access_token);
        toast.success("Reviewer access token copied to clipboard!");
      },
      onError: () => toast.error("Could not prepare reviewer invitation link"),
    });
  };

  return (
    <AbstractShell view="reviewers">
      <div className="space-y-6">
        {/* KPI Strip */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[var(--text-secondary)]">Total Reviewers</span>
              <span className="rounded-lg bg-[var(--brand-primary)]/10 p-2 text-[var(--brand-primary)]">
                <Users className="size-4" />
              </span>
            </div>
            <div className="mt-2 text-2xl font-bold text-[var(--text-primary)]">{totalReviewers}</div>
            <p className="mt-1 text-xs text-[var(--text-tertiary)]">
              {totalCapacity} total review slots
            </p>
          </div>

          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[var(--text-secondary)]">Active / Accepted</span>
              <span className="rounded-lg bg-emerald-500/10 p-2 text-emerald-600 dark:text-emerald-400">
                <UserCheck className="size-4" />
              </span>
            </div>
            <div className="mt-2 text-2xl font-bold text-emerald-600 dark:text-emerald-400">{activeReviewers}</div>
            <p className="mt-1 text-xs text-[var(--text-tertiary)]">
              {totalReviewers > 0 ? `${Math.round((activeReviewers / totalReviewers) * 100)}% of roster ready` : "Awaiting reviewers"}
            </p>
          </div>

          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[var(--text-secondary)]">Pending Invitations</span>
              <span className="rounded-lg bg-amber-500/10 p-2 text-amber-600 dark:text-amber-400">
                <Mail className="size-4" />
              </span>
            </div>
            <div className="mt-2 text-2xl font-bold text-amber-600 dark:text-amber-400">{invitedReviewers}</div>
            <p className="mt-1 text-xs text-[var(--text-tertiary)]">
              {invitedReviewers === 1 ? "1 awaiting confirmation" : `${invitedReviewers} awaiting confirmation`}
            </p>
          </div>

          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[var(--text-secondary)]">Reviews Completed</span>
              <span className="rounded-lg bg-sky-500/10 p-2 text-sky-600 dark:text-sky-400">
                <ClipboardCheck className="size-4" />
              </span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-[var(--text-primary)]">{totalCompleted}</span>
              <span className="text-xs font-medium text-[var(--text-secondary)]">/ {totalAssigned} assigned</span>
            </div>
            <p className="mt-1 text-xs text-[var(--text-tertiary)]">
              {totalAssigned > 0 ? `${Math.round((totalCompleted / totalAssigned) * 100)}% completed` : "0 assignments pending"}
              {totalConflicts > 0 ? ` · ${totalConflicts} conflicts` : ""}
            </p>
          </div>
        </div>

        {/* Action & Filter Toolbar */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-1 flex-wrap items-center gap-2">
            <div className="relative min-w-[240px] flex-1 sm:max-w-xs">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--text-tertiary)]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name, email, topic..."
                className="h-9 w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] pl-9 pr-3 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:border-[var(--brand-primary)] focus:outline-none"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>

            {/* Status Tabs */}
            <div className="flex rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] p-0.5 text-xs">
              {(["ALL", "ACTIVE", "INVITED", "PAUSED"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatusFilter(s)}
                  className={cn(
                    "rounded-md px-3 py-1 font-semibold transition-all cursor-pointer",
                    statusFilter === s
                      ? "bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-sm font-bold"
                      : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  )}
                >
                  {s === "ALL" ? "All" : s.charAt(0) + s.slice(1).toLowerCase()}
                </button>
              ))}
            </div>

            {/* Topic Filter */}
            {allTopics.length > 0 && (
              <select
                value={topicFilter}
                onChange={(e) => setTopicFilter(e.target.value)}
                className="h-9 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 text-xs text-[var(--text-primary)] focus:border-[var(--brand-primary)] focus:outline-none"
              >
                <option value="ALL">All Expertise Topics</option>
                {allTopics.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            )}

            {(searchQuery || statusFilter !== "ALL" || topicFilter !== "ALL") && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery("");
                  setStatusFilter("ALL");
                  setTopicFilter("ALL");
                }}
                className="flex items-center gap-1 text-xs text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
              >
                <RotateCcw className="size-3" /> Reset
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsBulkAssignModalOpen(true)}
              className="flex h-9 items-center gap-1.5 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--bg-surface-2)] shadow-sm transition-colors cursor-pointer"
            >
              <FolderPlus className="size-4 text-[var(--brand-primary)]" />
              Assign by Category / Bulk
            </button>

            <button
              type="button"
              onClick={() => setIsInviteModalOpen(true)}
              className="flex h-9 items-center gap-1.5 rounded-lg bg-[var(--pri)] px-3.5 text-xs font-bold text-[var(--primary-contrast)] hover:opacity-90 shadow-sm transition-all cursor-pointer"
            >
              <UserPlus className="size-4" />
              Invite Reviewer
            </button>
          </div>
        </div>

        {/* Reviewers Table */}
        <div className="overflow-hidden rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-[var(--text-secondary)]">
              <thead className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface-2)] text-[11px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                <tr>
                  <th className="px-4 py-3">Reviewer</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Expertise Topics</th>
                  <th className="px-4 py-3">Workload & Capacity</th>
                  <th className="px-4 py-3">Completed</th>
                  <th className="px-4 py-3">Conflicts</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {paginatedReviewers.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center">
                      <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-[var(--bg-surface-2)] text-[var(--text-tertiary)] mb-3">
                        <Users className="size-6" />
                      </div>
                      <p className="text-sm font-bold text-[var(--text-primary)]">No reviewers found</p>
                      <p className="mt-1 text-xs text-[var(--text-secondary)]">
                        {searchQuery || statusFilter !== "ALL" || topicFilter !== "ALL"
                          ? "Try adjusting your search or filters."
                          : "Invite your first reviewer to start managing evaluation workflows."}
                      </p>
                      {(!searchQuery && statusFilter === "ALL" && topicFilter === "ALL") && (
                        <button
                          type="button"
                          onClick={() => setIsInviteModalOpen(true)}
                          className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-[var(--pri)] px-3 py-1.5 text-xs font-bold text-[var(--primary-contrast)] hover:opacity-90 shadow-sm cursor-pointer"
                        >
                          <UserPlus className="size-3.5" /> Invite Reviewer
                        </button>
                      )}
                    </td>
                  </tr>
                ) : (
                  paginatedReviewers.map((r) => {
                    const capacityPct = r.capacity > 0 ? Math.min(100, Math.round((r.assigned_count / r.capacity) * 100)) : 0;
                    const hasConflicts = (r.conflict_count || 0) > 0;
                    const initials = r.full_name
                      .split(" ")
                      .map((w) => w[0])
                      .filter(Boolean)
                      .slice(0, 2)
                      .join("")
                      .toUpperCase() || "R";

                    return (
                      <tr
                        key={r.id}
                        className="transition-colors hover:bg-[var(--bg-surface-2)]/50 cursor-pointer"
                        onClick={() => setSelectedReviewer(r)}
                      >
                        {/* Reviewer Name & Email */}
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-3">
                            <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--pri)] text-xs font-bold text-[var(--primary-contrast)] shadow-sm">
                              {initials}
                            </div>
                            <div className="min-w-0">
                              <p className="font-bold text-[var(--text-primary)] truncate hover:underline">
                                {r.full_name}
                              </p>
                              <p className="text-[11px] text-[var(--text-secondary)] truncate">{r.email}</p>
                            </div>
                          </div>
                        </td>

                        {/* Status */}
                        <td className="px-4 py-3.5" onClick={(e) => e.stopPropagation()}>
                          <select
                            value={r.status}
                            onChange={(e) =>
                              updateReviewer.mutate(
                                { reviewerId: r.id, patch: { status: e.target.value as typeof r.status } },
                                { onSuccess: () => toast.success(`Reviewer set to ${e.target.value}`) }
                              )
                            }
                            className={cn(
                              "rounded-md border px-2 py-0.5 text-xs font-bold focus:outline-none cursor-pointer",
                              r.status === "ACTIVE" && "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
                              r.status === "INVITED" && "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
                              r.status === "PAUSED" && "border-zinc-500/30 bg-zinc-500/10 text-zinc-700 dark:text-zinc-300"
                            )}
                          >
                            <option value="ACTIVE">ACTIVE</option>
                            <option value="INVITED">INVITED</option>
                            <option value="PAUSED">PAUSED</option>
                          </select>
                        </td>

                        {/* Expertise Topics */}
                        <td className="px-4 py-3.5">
                          <div className="flex flex-wrap gap-1 max-w-xs">
                            {r.expertise_topics && r.expertise_topics.length > 0 ? (
                              r.expertise_topics.slice(0, 3).map((topic) => (
                                <span
                                  key={topic}
                                  className="rounded-md bg-[var(--bg-surface-2)] px-2 py-0.5 text-[10px] font-medium text-[var(--text-secondary)] border border-[var(--border-subtle)]"
                                >
                                  {topic}
                                </span>
                              ))
                            ) : (
                              <span className="text-[11px] text-[var(--text-tertiary)] italic">General reviewer</span>
                            )}
                            {r.expertise_topics && r.expertise_topics.length > 3 && (
                              <span className="rounded-md bg-[var(--bg-surface-2)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--text-tertiary)]">
                                +{r.expertise_topics.length - 3}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Workload & Capacity */}
                        <td className="px-4 py-3.5">
                          <div className="w-36 space-y-1">
                            <div className="flex items-center justify-between text-[11px]">
                              <span className="font-semibold text-[var(--text-primary)]">
                                {r.assigned_count} / {r.capacity}
                              </span>
                              <span className="text-[10px] text-[var(--text-tertiary)]">{capacityPct}%</span>
                            </div>
                            <div className="h-1.5 w-full rounded-full bg-[var(--bg-surface-2)] overflow-hidden">
                              <div
                                className={cn(
                                  "h-full rounded-full transition-all",
                                  capacityPct >= 100 ? "bg-rose-500" : capacityPct >= 75 ? "bg-amber-500" : "bg-indigo-500"
                                )}
                                style={{ width: `${capacityPct}%` }}
                              />
                            </div>
                          </div>
                        </td>

                        {/* Completed Reviews */}
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-1.5">
                            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700 border border-emerald-200">
                              <CheckCircle2 className="size-3" />
                              {r.completed_count || 0}
                            </span>
                          </div>
                        </td>

                        {/* Conflicts */}
                        <td className="px-4 py-3.5">
                          {hasConflicts ? (
                            <span className="inline-flex items-center gap-1 rounded-md bg-rose-50 px-2 py-0.5 text-xs font-bold text-rose-700 border border-rose-200">
                              <AlertTriangle className="size-3" />
                              {r.conflict_count}
                            </span>
                          ) : (
                            <span className="text-[11px] text-[var(--text-tertiary)]">None</span>
                          )}
                        </td>

                        {/* Action Buttons */}
                        <td className="px-4 py-3.5 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => setSelectedReviewer(r)}
                              className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-2.5 py-1 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--bg-surface-2)] shadow-xs transition-colors cursor-pointer"
                              title="Inspect reviewer actions, reviews, and assignments"
                            >
                              <Eye className="size-3.5 text-[var(--brand-primary)]" />
                              Inspect
                            </button>

                            <button
                              type="button"
                              onClick={() => handleGenerateLink(r.id)}
                              className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-2.5 py-1 text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-surface-2)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                              title="Copy invitation link / access token"
                            >
                              <Copy className="size-3" />
                              Link
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                if (confirm(`Are you sure you want to remove reviewer ${r.full_name}?`)) {
                                  deleteReviewer.mutate(r.id, {
                                    onSuccess: () => toast.success("Reviewer removed"),
                                    onError: () => toast.error("Could not remove reviewer with active assignments"),
                                  });
                                }
                              }}
                              className="rounded-lg p-1 text-[var(--text-tertiary)] hover:bg-rose-50 hover:text-rose-600 transition-colors cursor-pointer"
                              title="Remove reviewer"
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="border-t border-[var(--border-subtle)] p-3">
            <TablePagination
              currentPage={currentPage}
              totalItems={totalItems}
              pageSize={pageSize}
              onPageChange={setCurrentPage}
              onPageSizeChange={setPageSize}
              pageSizeOptions={[10, 20, 50]}
              itemLabel="reviewers"
            />
          </div>
        </div>

        {/* Global Recent Review Evidence Feed */}
        <ReviewSummary eventId={eventId} />

        {/* Slide-over Detailed Reviewer Drawer */}
        {activeSelectedReviewer && (
          <ReviewerDetailDrawer
            reviewer={activeSelectedReviewer}
            eventId={eventId}
            onClose={() => setSelectedReviewer(null)}
            onGenerateLink={() => handleGenerateLink(activeSelectedReviewer.id)}
            issuedToken={issuedTokens[activeSelectedReviewer.id] || null}
          />
        )}

        {/* Invite Reviewer Modal */}
        {isInviteModalOpen && (
          <InviteReviewerModal
            eventId={eventId}
            availableTopics={allTopics}
            onClose={() => setIsInviteModalOpen(false)}
          />
        )}

        {/* Bulk / Category Assignment Modal */}
        {isBulkAssignModalOpen && (
          <BulkAssignModal
            eventId={eventId}
            reviewers={reviewers.data || []}
            availableTopics={allTopics}
            onClose={() => setIsBulkAssignModalOpen(false)}
          />
        )}
      </div>
    </AbstractShell>
  );
}
export default AbstractReviewersView;
