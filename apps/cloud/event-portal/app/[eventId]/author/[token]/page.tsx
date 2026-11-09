"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  FileText,
  Users,
  Layers,
  Clock,
  CheckCircle2,
  AlertCircle,
  UploadCloud,
  FileCheck,
  Undo2,
  Trash2,
  ExternalLink,
  Edit3,
  Save,
  X,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/lib/toast";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

type AuthorSubmission = {
  id: string;
  code: string;
  title: string;
  body: string;
  keywords: string[];
  abstract_type: string;
  topic?: string | null;
  track?: string | null;
  form_payload: Record<string, any>;
  authors: Array<{
    full_name: string;
    email?: string | null;
    affiliation?: string | null;
    country?: string | null;
    is_presenter: boolean;
  }>;
  attachments: Array<{
    id: string;
    kind: string;
    filename: string;
    storage_path?: string | null;
    mime_type?: string | null;
    file_size_bytes?: number | null;
  }>;
  status: string;
  version: number;
  submitted_at?: string | null;
  decision?: string | null;
  notes_to_author?: string | null;
  author_confirmation?: string | null;
};

const STATUS_BADGE: Record<string, { label: string; tone: string }> = {
  DRAFT: { label: "Draft", tone: "bg-slate-500/10 text-slate-400 border-slate-500/20" },
  SUBMITTED: { label: "Submitted", tone: "bg-sky-500/10 text-sky-500 border-sky-500/30" },
  UNDER_REVIEW: { label: "Under Review", tone: "bg-amber-500/10 text-amber-500 border-amber-500/30" },
  ACCEPTED: { label: "Accepted", tone: "bg-emerald-500/10 text-emerald-500 border-emerald-500/30" },
  REJECTED: { label: "Rejected", tone: "bg-rose-500/10 text-rose-500 border-rose-500/30" },
  REVISION_REQUESTED: { label: "Revision Requested", tone: "bg-violet-500/10 text-violet-500 border-violet-500/30" },
  WITHDRAWN: { label: "Withdrawn", tone: "bg-slate-500/10 text-slate-500 border-slate-500/20" },
};

export default function AuthorWorkspacePage() {
  const { eventId, token } = useParams<{ eventId: string; token: string }>();
  const router = useRouter();

  const [submissions, setSubmissions] = useState<AuthorSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit Mode state
  const [editingSubId, setEditingSubId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const fetchSubmissions = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/v1/programme/access/${token}/author/submissions`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || "Author access link is invalid or expired.");
      }
      const data = await res.json();
      setSubmissions(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      fetchSubmissions();
    }
  }, [token]);

  const handleStartEdit = (sub: AuthorSubmission) => {
    setEditingSubId(sub.id);
    setEditTitle(sub.title);
    setEditBody(sub.body);
  };

  const handleCancelEdit = () => {
    setEditingSubId(null);
  };

  const handleSaveEdit = async (sub: AuthorSubmission) => {
    setSavingEdit(true);
    try {
      const payload = {
        title: editTitle.trim(),
        body: editBody.trim(),
        keywords: sub.keywords,
        abstract_type: sub.abstract_type,
        topic: sub.topic,
        track: sub.track,
        form_payload: sub.form_payload,
        authors: sub.authors,
        expected_version: sub.version,
      };

      const res = await fetch(`${API_BASE}/api/v1/programme/access/${token}/author/submissions/${sub.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.message || "Failed to update abstract revision.");
      }

      toast.success("Abstract revised successfully.");
      setEditingSubId(null);
      fetchSubmissions();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSavingEdit(false);
    }
  };

  const handleWithdraw = async (subId: string) => {
    if (!confirm("Are you sure you want to withdraw this abstract submission? This cannot be undone.")) return;
    try {
      const res = await fetch(`${API_BASE}/api/v1/programme/access/${token}/author/submissions/${subId}/withdraw`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to withdraw submission.");
      toast.success("Abstract withdrawn.");
      fetchSubmissions();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen grid place-items-center bg-[var(--bg-base)] text-[var(--text)]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--pri)] border-t-transparent" />
          <p className="text-sm font-semibold text-[var(--muted)]">Loading Author Dashboard...</p>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen grid place-items-center bg-[var(--bg-base)] px-6 text-[var(--text)]">
        <div className="max-w-md rounded-[28px] border-2 border-[var(--border-default)] bg-[var(--card)] p-8 text-center shadow-xl ring-1 ring-black/5 dark:ring-white/10">
          <AlertCircle className="mx-auto mb-3 h-10 w-10 text-rose-500" />
          <h1 className="text-xl font-black">Access Link Unavailable</h1>
          <p className="mt-2 text-xs text-[var(--muted)]">{error}</p>
          <Button
            onClick={() => router.push(`/${eventId}/call-for-abstracts`)}
            className="mt-6 rounded-xl bg-[var(--pri)] text-[var(--primary-contrast,#fff)]"
          >
            Go to Call for Abstracts
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[var(--bg-base)] text-[var(--text)] pb-24">
      {/* Header */}
      <div className="border-b-2 border-[var(--border-default)] bg-[var(--card)] py-10 px-6 sm:px-12">
        <div className="mx-auto max-w-5xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-[var(--pri)]/30 bg-[var(--pri)]/10 px-3 py-1 text-xs font-black uppercase tracking-wider text-[var(--pri)] mb-2">
              <Sparkles className="h-3.5 w-3.5" />
              <span>Author Workspace</span>
            </div>
            <h1 className="text-2xl sm:text-4xl font-black tracking-tight">Your Abstract Submissions</h1>
            <p className="mt-1 text-xs sm:text-sm text-[var(--muted)]">
              Track peer review status, revise abstracts before the deadline, and inspect committee decisions.
            </p>
          </div>

          <Button
            onClick={() => router.push(`/${eventId}/call-for-abstracts/submit`)}
            className="rounded-2xl bg-[var(--pri)] text-[var(--primary-contrast,#fff)] font-bold text-xs h-11 px-5 self-start sm:self-auto cursor-pointer"
          >
            Submit Another Abstract
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-5xl px-6 sm:px-12 mt-10">
        {submissions.length === 0 ? (
          <div className="rounded-[28px] border-2 border-[var(--border-default)] bg-[var(--card)] p-12 text-center shadow-xl ring-1 ring-black/5 dark:ring-white/10">
            <FileText className="mx-auto h-12 w-12 text-[var(--muted)]" />
            <h3 className="mt-3 text-base font-bold text-[var(--text)]">No Submissions Found</h3>
            <p className="mt-1 text-xs text-[var(--muted)]">
              No active abstracts are currently linked to this author access link.
            </p>
            <Button
              onClick={() => router.push(`/${eventId}/call-for-abstracts/submit`)}
              className="mt-6 rounded-xl bg-[var(--pri)] text-[var(--primary-contrast,#fff)] text-xs"
            >
              Submit Your First Abstract
            </Button>
          </div>
        ) : (
          <div className="space-y-6">
            {submissions.map((sub) => {
              const badge = STATUS_BADGE[sub.status] || { label: sub.status, tone: "bg-slate-500/10 text-slate-400 border-slate-500/20" };
              const isEditing = editingSubId === sub.id;
              const canEdit = ["SUBMITTED", "DRAFT", "REVISION_REQUESTED"].includes(sub.status);

              return (
                <div
                  key={sub.id}
                  className="rounded-[28px] border-2 border-[var(--border-default)] bg-[var(--card)] p-6 sm:p-8 shadow-xl ring-1 ring-black/5 dark:ring-white/10 transition-all"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-default)] pb-4 mb-5">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-sm font-black text-[var(--pri)] bg-[var(--pri)]/10 px-3 py-1 rounded-xl">
                        {sub.code}
                      </span>
                      <span className="text-xs font-bold text-[var(--muted)]">
                        Format: <strong className="text-[var(--text)]">{sub.abstract_type}</strong>
                      </span>
                      {sub.topic && (
                        <span className="text-xs font-bold text-[var(--muted)]">
                          Topic: <strong className="text-[var(--text)]">{sub.topic}</strong>
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded-full border px-3 py-1 text-xs font-black uppercase tracking-wider ${badge.tone}`}
                      >
                        {badge.label}
                      </span>
                    </div>
                  </div>

                  {isEditing ? (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-xs font-bold text-[var(--muted)] mb-1">Title</label>
                        <Input
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          className="rounded-xl border-[var(--border-default)] bg-[var(--bg-surface-2)] text-sm font-bold"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-[var(--muted)] mb-1">Abstract Text</label>
                        <Textarea
                          value={editBody}
                          onChange={(e) => setEditBody(e.target.value)}
                          rows={8}
                          className="rounded-xl border-[var(--border-default)] bg-[var(--bg-surface-2)] text-xs leading-relaxed"
                        />
                      </div>

                      <div className="flex items-center gap-2 pt-2">
                        <Button
                          size="sm"
                          onClick={() => handleSaveEdit(sub)}
                          disabled={savingEdit}
                          className="rounded-xl bg-[var(--pri)] text-[var(--primary-contrast,#fff)] text-xs font-bold h-9 px-4 cursor-pointer"
                        >
                          <Save className="h-3.5 w-3.5 mr-1.5" />
                          <span>{savingEdit ? "Saving..." : "Save Revision"}</span>
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleCancelEdit}
                          className="rounded-xl border-[var(--border-default)] text-xs h-9 px-4"
                        >
                          <X className="h-3.5 w-3.5 mr-1.5" />
                          <span>Cancel</span>
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <h2 className="text-lg sm:text-xl font-black text-[var(--text)]">{sub.title}</h2>
                      <p className="mt-3 text-xs leading-relaxed text-[var(--muted)] whitespace-pre-wrap">{sub.body}</p>

                      {/* Keywords */}
                      {sub.keywords && sub.keywords.length > 0 && (
                        <div className="mt-4 flex flex-wrap gap-1.5">
                          {sub.keywords.map((kw, i) => (
                            <span
                              key={i}
                              className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-2.5 py-0.5 text-[11px] font-bold text-[var(--muted)]"
                            >
                              {kw}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Authors */}
                      <div className="mt-6 pt-4 border-t border-[var(--border-default)]">
                        <p className="text-[11px] font-black uppercase tracking-wider text-[var(--muted)] mb-2">
                          Authors & Presenter
                        </p>
                        <div className="flex flex-wrap gap-3">
                          {sub.authors.map((a, i) => (
                            <span
                              key={i}
                              className="inline-flex items-center gap-1.5 text-xs text-[var(--text)] bg-[var(--bg-surface-2)] px-3 py-1.5 rounded-xl border border-[var(--border-default)]"
                            >
                              <strong>{a.full_name}</strong>
                              {a.affiliation && <span className="text-[var(--muted)]">({a.affiliation})</span>}
                              {a.is_presenter && (
                                <span className="rounded bg-emerald-500/15 text-emerald-500 px-1.5 py-0.2 text-[9px] font-black uppercase">
                                  Presenter
                                </span>
                              )}
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* Decision Notes if Present */}
                      {sub.decision && (
                        <div className="mt-6 rounded-2xl border border-indigo-500/20 bg-indigo-500/5 p-4">
                          <p className="text-xs font-black uppercase tracking-wider text-indigo-400">
                            Scientific Committee Decision: {sub.decision}
                          </p>
                          {sub.notes_to_author && (
                            <p className="mt-1.5 text-xs text-[var(--muted)] leading-relaxed">{sub.notes_to_author}</p>
                          )}
                        </div>
                      )}

                      {/* Actions */}
                      <div className="mt-6 pt-4 border-t border-[var(--border-default)] flex flex-wrap items-center justify-between gap-3">
                        <span className="text-[11px] text-[var(--muted)]">
                          Submitted: {sub.submitted_at ? new Date(sub.submitted_at).toLocaleString() : "Recently"} · Version {sub.version}
                        </span>

                        <div className="flex items-center gap-2">
                          {canEdit && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleStartEdit(sub)}
                              className="rounded-xl border-[var(--border-default)] text-xs font-bold h-9 px-3.5 flex items-center gap-1.5 cursor-pointer"
                            >
                              <Edit3 className="h-3.5 w-3.5 text-[var(--pri)]" />
                              <span>Revise Abstract</span>
                            </Button>
                          )}

                          {canEdit && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleWithdraw(sub.id)}
                              className="rounded-xl text-xs text-rose-500 hover:bg-rose-500/10 h-9 px-3 cursor-pointer"
                            >
                              Withdraw
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
