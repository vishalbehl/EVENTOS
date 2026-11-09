"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  FileText,
  Star,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Send,
  Eye,
  Layers,
  Sparkles,
  ShieldAlert,
  Download,
  X,
  MessageSquare,
  Award,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/lib/toast";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

type RubricCriterion = {
  key: string;
  label: string;
  max: number;
};

type ReviewerAssignment = {
  id: string;
  submission_id: string;
  submission_version: number;
  code: string;
  title: string;
  body?: string | null;
  abstract_type: string;
  topic?: string | null;
  status: string;
  due_at?: string | null;
  conflict_declared: boolean;
  anonymous: boolean;
  rubric: RubricCriterion[];
  authors?: Array<{
    full_name: string;
    email?: string | null;
    affiliation?: string | null;
    country?: string | null;
    is_presenter: boolean;
  }>;
  attachments?: Array<{
    id: string;
    kind: string;
    filename: string;
    storage_path?: string | null;
    mime_type?: string | null;
    file_size_bytes?: number | null;
  }>;
  recommendation?: string | null;
  total_score?: number | null;
  scores?: Record<string, number>;
  comments_to_committee?: string | null;
  comments_to_author?: string | null;
};

export default function ReviewerWorkspacePage() {
  const { eventId, token } = useParams<{ eventId: string; token: string }>();
  return <ReviewerWorkspace key={`${eventId}:${token}`} />;
}

function ReviewerWorkspace() {
  const { eventId, token } = useParams<{ eventId: string; token: string }>();
  const router = useRouter();

  const [assignments, setAssignments] = useState<ReviewerAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Active scoring modal
  const [activeAssignment, setActiveAssignment] = useState<ReviewerAssignment | null>(null);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [recommendation, setRecommendation] = useState<"ACCEPT" | "REJECT" | "REVISION" | "DISCUSS">("DISCUSS");
  const [committeeComments, setCommitteeComments] = useState("");
  const [authorComments, setAuthorComments] = useState("");
  const [submittingReview, setSubmittingReview] = useState(false);
  const reviewBusy = useRef(false);
  const reviewReceipt = useRef<{ fingerprint: string; key: string } | null>(null);
  const conflictBusy = useRef(false);
  const conflictReceipt = useRef<{ fingerprint: string; key: string } | null>(null);
  const assignmentRequest = useRef<AbortController | null>(null);

  // Conflict modal
  const [conflictModalOpen, setConflictModalOpen] = useState(false);
  const [conflictReason, setConflictReason] = useState("");
  const [conflictAssignment, setConflictAssignment] = useState<ReviewerAssignment | null>(null);
  const [submittingConflict, setSubmittingConflict] = useState(false);

  // Filter tab
  const [filter, setFilter] = useState<"ALL" | "PENDING" | "COMPLETED">("ALL");

  const fetchAssignments = async () => {
    assignmentRequest.current?.abort();
    const request = new AbortController();
    assignmentRequest.current = request;
    try {
      const res = await fetch(`${API_BASE}/api/v1/programme/access/${encodeURIComponent(token)}/reviewer/assignments`, {
        signal: request.signal, cache: "no-store",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || "Reviewer access link is invalid or expired.");
      }
      const data = await res.json();
      if (request.signal.aborted) return;
      setError(null);
      setAssignments(data);
    } catch (err: any) {
      if (request.signal.aborted) return;
      setError(err.message);
    } finally {
      if (!request.signal.aborted) setLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      fetchAssignments();
    }
    return () => assignmentRequest.current?.abort();
  }, [token]);

  const openReviewModal = (asgn: ReviewerAssignment) => {
    if (reviewBusy.current) return;
    setActiveAssignment(asgn);
    setScores(asgn.scores || {});
    setRecommendation((asgn.recommendation as any) || "DISCUSS");
    setCommitteeComments(asgn.comments_to_committee || "");
    setAuthorComments(asgn.comments_to_author || "");
  };

  const closeReviewModal = () => {
    if (reviewBusy.current) return;
    setActiveAssignment(null);
  };

  const handleScoreChange = (key: string, value: number, max: number) => {
    const val = Math.min(Math.max(0, value), max);
    setScores((prev) => ({ ...prev, [key]: val }));
  };

  const totalScoreCalculated = useMemo(() => {
    return Object.values(scores).reduce((acc, curr) => acc + (Number(curr) || 0), 0);
  }, [scores]);

  const handleSubmitReview = async () => {
    if (!activeAssignment || activeAssignment.status === "COMPLETED" || reviewBusy.current) return;

    // Verify all rubric criteria scored
    const rubric = activeAssignment.rubric || [];
    for (const crit of rubric) {
      if (scores[crit.key] === undefined || scores[crit.key] === null) {
        toast.error(`Please provide a score for: ${crit.label}`);
        return;
      }
    }

    reviewBusy.current = true;
    setSubmittingReview(true);
    try {
      const payload = {
        scores,
        recommendation,
        comments_to_committee: committeeComments.trim() || null,
        comments_to_author: authorComments.trim() || null,
      };
      const bytes = new TextEncoder().encode(JSON.stringify([token, activeAssignment.id, payload]));
      const digest = await crypto.subtle.digest("SHA-256", bytes);
      const fingerprint = Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, "0")).join("");
      if (reviewReceipt.current?.fingerprint !== fingerprint) {
        reviewReceipt.current = { fingerprint, key: crypto.randomUUID() };
      }

      const res = await fetch(
        `${API_BASE}/api/v1/programme/access/${token}/reviewer/assignments/${activeAssignment.id}/review`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": reviewReceipt.current.key,
          },
          body: JSON.stringify(payload),
        }
      );

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const retryAfter = res.headers.get("Retry-After");
        throw new Error((err.detail?.message || err.message || "Review was not saved. Your input is retained.")
          + (retryAfter ? ` Retry after ${retryAfter} seconds.` : ""));
      }

      toast.success("Review submitted successfully!");
      reviewReceipt.current = null;
      setActiveAssignment(null);
      fetchAssignments();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      reviewBusy.current = false;
      setSubmittingReview(false);
    }
  };

  const handleDeclareConflict = async () => {
    if (!conflictAssignment || conflictBusy.current) return;
    conflictBusy.current = true;
    setSubmittingConflict(true);
    try {
      const payload = {
        conflict_declared: true,
        conflict_reason: conflictReason.trim() || "Reviewer declared institutional / personal conflict.",
      };
      const bytes = new TextEncoder().encode(JSON.stringify([
        token, conflictAssignment.id, conflictAssignment.submission_version, payload,
      ]));
      const digest = await crypto.subtle.digest("SHA-256", bytes);
      const fingerprint = Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, "0")).join("");
      if (conflictReceipt.current?.fingerprint !== fingerprint) {
        conflictReceipt.current = { fingerprint, key: crypto.randomUUID() };
      }
      const res = await fetch(
        `${API_BASE}/api/v1/programme/access/${token}/reviewer/assignments/${conflictAssignment.id}/conflict`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json",
            "If-Match": String(conflictAssignment.submission_version),
            "Idempotency-Key": conflictReceipt.current.key },
          body: JSON.stringify(payload),
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const retryAfter = res.headers.get("Retry-After");
        throw new Error((err.detail?.message || err.message ||
          (res.status === 412 ? "This assignment changed. Reload before declaring a conflict." : "Failed to register conflict."))
          + (retryAfter ? ` Retry after ${retryAfter} seconds.` : ""));
      }
      toast.success("Conflict declared. You have been recused from this submission.");
      conflictReceipt.current = null;
      setConflictModalOpen(false);
      setConflictAssignment(null);
      setConflictReason("");
      fetchAssignments();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      conflictBusy.current = false;
      setSubmittingConflict(false);
    }
  };

  const filteredAssignments = useMemo(() => {
    if (filter === "PENDING") {
      return assignments.filter((a) => a.status !== "COMPLETED" && !a.conflict_declared);
    }
    if (filter === "COMPLETED") {
      return assignments.filter((a) => a.status === "COMPLETED");
    }
    return assignments;
  }, [assignments, filter]);

  if (loading) {
    return (
      <main className="min-h-screen grid place-items-center bg-[var(--bg-base)] text-[var(--text)]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--pri)] border-t-transparent" />
          <p className="text-sm font-semibold text-[var(--muted)]">Loading Reviewer Workspace...</p>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen grid place-items-center bg-[var(--bg-base)] px-6 text-[var(--text)]">
        <div className="max-w-md rounded-[28px] border-2 border-[var(--border-default)] bg-[var(--card)] p-8 text-center shadow-xl ring-1 ring-black/5 dark:ring-white/10">
          <AlertTriangle className="mx-auto mb-3 h-10 w-10 text-rose-500" />
          <h1 className="text-xl font-black">Reviewer Access Link Expired</h1>
          <p className="mt-2 text-xs text-[var(--muted)]">{error}</p>
        </div>
      </main>
    );
  }

  const completedCount = assignments.filter((a) => a.status === "COMPLETED").length;
  const pendingCount = assignments.filter((a) => a.status !== "COMPLETED" && !a.conflict_declared).length;
  const conflictCount = assignments.filter((a) => a.conflict_declared).length;

  return (
    <main className="min-h-screen bg-[var(--bg-base)] text-[var(--text)] pb-24">
      {/* Header */}
      <div className="border-b-2 border-[var(--border-default)] bg-[var(--card)] py-10 px-6 sm:px-12">
        <div className="mx-auto max-w-6xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-[var(--pri)]/30 bg-[var(--pri)]/10 px-3 py-1 text-xs font-black uppercase tracking-wider text-[var(--pri)] mb-2">
            <Award className="h-3.5 w-3.5" />
            <span>Peer Review Committee</span>
          </div>

          <h1 className="text-2xl sm:text-4xl font-black tracking-tight">Reviewer Workspace</h1>
          <p className="mt-1 text-xs sm:text-sm text-[var(--muted)]">
            Evaluate assigned abstracts, grade rubric criteria, and provide recommendations to the scientific committee.
          </p>

          {/* Metric Badges */}
          <div className="mt-8 grid gap-4 sm:grid-cols-4">
            <div className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface-2)] p-4">
              <span className="text-[11px] font-black uppercase text-[var(--muted)]">Total Assigned</span>
              <p className="mt-1 text-2xl font-black text-[var(--text)]">{assignments.length}</p>
            </div>
            <div className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface-2)] p-4">
              <span className="text-[11px] font-black uppercase text-amber-500">Pending Review</span>
              <p className="mt-1 text-2xl font-black text-amber-500">{pendingCount}</p>
            </div>
            <div className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface-2)] p-4">
              <span className="text-[11px] font-black uppercase text-emerald-500">Completed</span>
              <p className="mt-1 text-2xl font-black text-emerald-500">{completedCount}</p>
            </div>
            <div className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface-2)] p-4">
              <span className="text-[11px] font-black uppercase text-slate-400">Conflict / Recused</span>
              <p className="mt-1 text-2xl font-black text-slate-400">{conflictCount}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filter Tabs & Content */}
      <div className="mx-auto max-w-6xl px-6 sm:px-12 mt-8">
        <div className="flex items-center gap-2 border-b border-[var(--border-default)] pb-4 mb-6">
          <button
            onClick={() => setFilter("ALL")}
            className={`rounded-xl px-4 py-2 text-xs font-bold transition-all cursor-pointer ${
              filter === "ALL"
                ? "bg-[var(--pri)] text-[var(--primary-contrast,#fff)]"
                : "text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--bg-surface-2)]"
            }`}
          >
            All Assigned ({assignments.length})
          </button>
          <button
            onClick={() => setFilter("PENDING")}
            className={`rounded-xl px-4 py-2 text-xs font-bold transition-all cursor-pointer ${
              filter === "PENDING"
                ? "bg-[var(--pri)] text-[var(--primary-contrast,#fff)]"
                : "text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--bg-surface-2)]"
            }`}
          >
            Needs Review ({pendingCount})
          </button>
          <button
            onClick={() => setFilter("COMPLETED")}
            className={`rounded-xl px-4 py-2 text-xs font-bold transition-all cursor-pointer ${
              filter === "COMPLETED"
                ? "bg-[var(--pri)] text-[var(--primary-contrast,#fff)]"
                : "text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--bg-surface-2)]"
            }`}
          >
            Reviewed ({completedCount})
          </button>
        </div>

        {filteredAssignments.length === 0 ? (
          <div className="rounded-[28px] border-2 border-[var(--border-default)] bg-[var(--card)] p-12 text-center shadow-xl ring-1 ring-black/5 dark:ring-white/10">
            <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" />
            <h3 className="mt-3 text-base font-bold text-[var(--text)]">No Submissions in this view</h3>
            <p className="mt-1 text-xs text-[var(--muted)]">All abstracts are reviewed or no assignments matched.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredAssignments.map((asgn) => {
              const isCompleted = asgn.status === "COMPLETED";
              const isConflict = asgn.conflict_declared;

              return (
                <div
                  key={asgn.id}
                  className="rounded-[28px] border-2 border-[var(--border-default)] bg-[var(--card)] p-6 shadow-xl ring-1 ring-black/5 dark:ring-white/10 transition-all hover:border-[var(--pri)]/50"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--border-default)] pb-4 mb-4">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-xs font-black bg-[var(--pri)]/10 text-[var(--pri)] px-3 py-1 rounded-xl">
                        {asgn.code}
                      </span>
                      <span className="text-xs font-bold text-[var(--muted)]">Format: {asgn.abstract_type}</span>
                      {asgn.topic && (
                        <span className="text-xs font-bold text-[var(--muted)]">Topic: {asgn.topic}</span>
                      )}
                      {asgn.anonymous && (
                        <span className="rounded-full bg-violet-500/10 text-violet-400 border border-violet-500/20 text-[10px] font-black uppercase px-2.5 py-0.5">
                          Blind Review
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {isConflict ? (
                        <span className="rounded-full bg-slate-500/10 text-slate-400 border border-slate-500/20 text-xs font-black uppercase px-3 py-1">
                          Conflict Declared
                        </span>
                      ) : isCompleted ? (
                        <span className="rounded-full bg-emerald-500/15 text-emerald-500 border border-emerald-500/30 text-xs font-black uppercase px-3 py-1 flex items-center gap-1.5">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          <span>Reviewed ({asgn.total_score} pts)</span>
                        </span>
                      ) : (
                        <span className="rounded-full bg-amber-500/15 text-amber-500 border border-amber-500/30 text-xs font-black uppercase px-3 py-1">
                          Pending Score
                        </span>
                      )}
                    </div>
                  </div>

                  <h3 className="text-lg font-black text-[var(--text)]">{asgn.title}</h3>
                  {asgn.body && (
                    <p className="mt-2 text-xs text-[var(--muted)] line-clamp-3 leading-relaxed">{asgn.body}</p>
                  )}

                  <div className="mt-6 pt-4 border-t border-[var(--border-default)] flex flex-wrap items-center justify-between gap-3">
                    <span className="text-xs text-[var(--muted)]">
                      {asgn.due_at ? `Due: ${new Date(asgn.due_at).toLocaleDateString()}` : "Standard Review Window"}
                    </span>

                    <div className="flex items-center gap-2">
                      {!isConflict && (
                        <Button
                          size="sm"
                          onClick={() => openReviewModal(asgn)}
                          className="rounded-xl bg-[var(--pri)] text-[var(--primary-contrast,#fff)] text-xs font-bold h-9 px-4 cursor-pointer"
                        >
                          <Star className="h-3.5 w-3.5 mr-1.5" />
                          <span>{isCompleted ? "View submitted review" : "Score Abstract"}</span>
                        </Button>
                      )}

                      {!isCompleted && !isConflict && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setConflictAssignment(asgn);
                            setConflictModalOpen(true);
                          }}
                          className="rounded-xl border-[var(--border-default)] text-xs text-rose-500 hover:bg-rose-500/10 h-9 px-3 cursor-pointer"
                        >
                          Declare Conflict
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Interactive Review Modal */}
      {activeAssignment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="relative w-full max-w-3xl rounded-[28px] border-2 border-[var(--border-default)] bg-[var(--card)] p-6 sm:p-8 shadow-2xl my-8">
            <div className="flex items-center justify-between border-b border-[var(--border-default)] pb-4 mb-6">
              <div>
                <span className="font-mono text-xs font-black text-[var(--pri)] bg-[var(--pri)]/10 px-2.5 py-0.5 rounded-lg">
                  {activeAssignment.code}
                </span>
                <h2 className="mt-2 text-xl font-black text-[var(--text)]">{activeAssignment.title}</h2>
              </div>
              <button
                onClick={closeReviewModal}
                className="text-[var(--muted)] hover:text-[var(--text)] p-2 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Abstract Text Viewer */}
            <div className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface-2)] p-5 mb-6 max-h-56 overflow-y-auto">
              <p className="text-xs font-black uppercase tracking-wider text-[var(--pri)] mb-2">Abstract Text</p>
              <p className="text-xs leading-relaxed text-[var(--text)] whitespace-pre-wrap">
                {activeAssignment.body || "No abstract text provided."}
              </p>
            </div>

            {/* Rubric Criteria Sliders/Inputs */}
            <div className="space-y-4 mb-6">
              <h3 className="text-xs font-black uppercase tracking-wider text-[var(--text)] flex items-center justify-between">
                <span>Evaluation Rubric Criteria</span>
                <span className="text-[var(--pri)] font-mono font-extrabold text-sm">
                  Total Score: {totalScoreCalculated} pts
                </span>
              </h3>

              {activeAssignment.rubric.map((crit) => (
                <div key={crit.key} className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface-2)] p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-[var(--text)]">{crit.label}</span>
                    <span className="text-xs font-mono font-bold text-[var(--pri)]">
                      {scores[crit.key] ?? 0} / {crit.max}
                    </span>
                  </div>
                  <input
                    type="range"
                    aria-label={crit.label}
                    disabled={submittingReview || activeAssignment.status === "COMPLETED"}
                    min="0"
                    max={crit.max}
                    value={scores[crit.key] ?? 0}
                    onChange={(e) => handleScoreChange(crit.key, parseInt(e.target.value) || 0, crit.max)}
                    className="w-full accent-[var(--pri)] cursor-pointer"
                  />
                </div>
              ))}
            </div>

            {/* Recommendation Radio */}
            <div className="mb-6">
              <label className="block text-xs font-black uppercase tracking-wider text-[var(--text)] mb-2">
                Overall Recommendation
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {(["ACCEPT", "REJECT", "REVISION", "DISCUSS"] as const).map((rec) => (
                  <button
                    key={rec}
                    type="button"
                    disabled={submittingReview || activeAssignment.status === "COMPLETED"}
                    onClick={() => setRecommendation(rec)}
                    className={`rounded-xl border py-2.5 text-xs font-bold transition-all cursor-pointer ${
                      recommendation === rec
                        ? "border-[var(--pri)] bg-[var(--pri)] text-[var(--primary-contrast,#fff)]"
                        : "border-[var(--border-default)] bg-[var(--bg-surface-2)] text-[var(--muted)] hover:text-[var(--text)]"
                    }`}
                  >
                    {rec}
                  </button>
                ))}
              </div>
            </div>

            {/* Comments */}
            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-xs font-bold text-[var(--muted)] mb-1">
                  Confidential Comments to Programme Committee
                </label>
                <Textarea
                  value={committeeComments}
                  aria-label="Confidential Comments to Programme Committee"
                  disabled={submittingReview || activeAssignment.status === "COMPLETED"}
                  onChange={(e) => setCommitteeComments(e.target.value)}
                  rows={3}
                  placeholder="Private remarks for committee members..."
                  className="rounded-xl border-[var(--border-default)] bg-[var(--bg-surface-2)] text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[var(--muted)] mb-1">
                  Constructive Comments for Author
                </label>
                <Textarea
                  value={authorComments}
                  aria-label="Constructive Comments for Author"
                  disabled={submittingReview || activeAssignment.status === "COMPLETED"}
                  onChange={(e) => setAuthorComments(e.target.value)}
                  rows={3}
                  placeholder="Feedback shared anonymously with author..."
                  className="rounded-xl border-[var(--border-default)] bg-[var(--bg-surface-2)] text-xs"
                />
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-[var(--border-default)]">
              <Button
                variant="outline"
                size="sm"
                onClick={closeReviewModal}
                className="rounded-xl border-[var(--border-default)] text-xs font-bold h-10 px-4"
              >
                Cancel
              </Button>
              {activeAssignment.status === "COMPLETED" ? <p className="text-sm">This submitted review is read-only.</p> : <Button
                size="sm"
                onClick={handleSubmitReview}
                disabled={submittingReview}
                className="rounded-xl bg-[var(--pri)] text-[var(--primary-contrast,#fff)] text-xs font-bold h-10 px-6 cursor-pointer"
              >
                {submittingReview ? "Submitting..." : "Save & Finalize Review"}
              </Button>}
            </div>
          </div>
        </div>
      )}

      {/* Conflict Modal */}
      {conflictModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-[28px] border-2 border-[var(--border-default)] bg-[var(--card)] p-6 shadow-2xl">
            <div className="flex items-center gap-3 text-rose-500 mb-3">
              <ShieldAlert className="h-6 w-6" />
              <h3 className="text-base font-black text-[var(--text)]">Declare Conflict of Interest</h3>
            </div>
            <p className="text-xs text-[var(--muted)] leading-relaxed">
              If you have a co-author, institutional, financial, or personal relationship with this work, declaring a conflict will reassign the submission to another reviewer.
            </p>

            <Textarea
              value={conflictReason}
              disabled={submittingConflict}
              onChange={(e) => setConflictReason(e.target.value)}
              placeholder="State conflict reason (e.g. Same research institution)..."
              rows={3}
              className="mt-4 rounded-xl border-[var(--border-default)] bg-[var(--bg-surface-2)] text-xs"
            />

            <div className="mt-5 flex items-center justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={submittingConflict}
                onClick={() => { if (!conflictBusy.current) setConflictModalOpen(false); }}
                className="rounded-xl text-xs"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={submittingConflict}
                onClick={handleDeclareConflict}
                className="rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold"
              >
                {submittingConflict ? "Saving…" : "Confirm Recusal"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
