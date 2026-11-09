"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Calendar,
  Clock,
  FileText,
  Layers,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  HelpCircle,
  Mail,
  Phone,
  CheckCircle2,
  Lock,
  KeyRound,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/lib/toast";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

type Call = {
  event_id: string;
  event_name: string;
  opens_at?: string | null;
  closes_at?: string | null;
  revision_deadline?: string | null;
  min_words: number;
  max_words: number;
  abstract_types: string[];
  topics: string[];
  categories?: string[];
  allow_coauthors?: boolean;
  max_coauthors?: number | null;
  require_presenter?: boolean;
  require_affiliation?: boolean;
  require_country?: boolean;
  require_attachments?: boolean;
  allowed_file_extensions?: string[];
  max_file_size_mb?: number;
  require_disclosures?: boolean;
  portal_settings?: Record<string, any>;
  author_rules: Record<string, any>;
  attachment_rules: Record<string, any>;
  disclosure_rules: Record<string, any>;
  form_title: string;
  form_schema: Record<string, any>;
};

function formatCountdown(targetDate: string): string {
  const diff = new Date(targetDate).getTime() - Date.now();
  if (diff <= 0) return "Closed";
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  return `${days}d ${hours}h ${minutes}m`;
}

export default function CallForAbstractsPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const router = useRouter();
  const [call, setCall] = useState<Call | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accessKeyInput, setAccessKeyInput] = useState("");

  useEffect(() => {
    fetch(`${API_BASE}/api/v1/programme/events/${eventId}/call-for-abstracts`)
      .then(async (response) => {
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.message || "This call for abstracts is not currently open.");
        }
        setCall(await response.json());
      })
      .catch((reason) => setError(reason.message))
      .finally(() => setLoading(false));
  }, [eventId]);

  const handleOpenAuthorLink = (e: React.FormEvent) => {
    e.preventDefault();
    const token = accessKeyInput.trim();
    if (!token) {
      toast.error("Please enter your author access token");
      return;
    }
    router.push(`/${eventId}/author/${token}`);
  };

  if (loading) {
    return (
      <main className="min-h-screen grid place-items-center bg-[var(--bg-base)] text-[var(--text)]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--pri)] border-t-transparent" />
          <p className="text-sm font-semibold text-[var(--muted)]">Loading Call for Abstracts...</p>
        </div>
      </main>
    );
  }

  if (error || !call) {
    return (
      <main className="min-h-screen grid place-items-center bg-[var(--bg-base)] px-6 text-center text-[var(--text)]">
        <div className="max-w-md rounded-[28px] border-2 border-[var(--border-default)] bg-[var(--card)] p-8 shadow-xl ring-1 ring-black/5 dark:ring-white/10">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-500">
            <Lock className="h-6 w-6" />
          </div>
          <p className="text-xs font-black uppercase tracking-widest text-[var(--pri)]">Call for Abstracts</p>
          <h1 className="mt-2 text-2xl font-black">{error || "Call Unavailable"}</h1>
          <p className="mt-3 text-sm text-[var(--muted)]">
            Submissions are currently closed or restricted. If you hold an organizer-issued invitation link, you can enter it below:
          </p>
          <form onSubmit={handleOpenAuthorLink} className="mt-6 flex gap-2">
            <Input
              placeholder="Paste author access token"
              value={accessKeyInput}
              onChange={(e) => setAccessKeyInput(e.target.value)}
              className="rounded-xl border-[var(--border-default)] bg-[var(--bg-surface-2)] text-xs"
            />
            <Button type="submit" size="sm" className="rounded-xl bg-[var(--pri)] text-[var(--primary-contrast,#fff)] px-4">
              Open
            </Button>
          </form>
        </div>
      </main>
    );
  }

  const portalSettings = call.portal_settings || call.author_rules?.portal_settings || {};
  const subPortal = portalSettings.submission_portal || {};
  const deadlineCountdown = call.closes_at ? formatCountdown(call.closes_at) : null;
  const isExpired = call.closes_at && new Date(call.closes_at).getTime() < Date.now();

  return (
    <main className="min-h-screen bg-[var(--bg-base)] text-[var(--text)] pb-24">
      {/* Top Countdown Banner if configured */}
      {subPortal.show_countdown_banner !== false && call.closes_at && !isExpired && (
        <div
          className="w-full border-b border-[var(--border-default)] px-4 py-2.5 text-center text-xs font-bold flex items-center justify-center gap-2 bg-[var(--bg-surface-2)]"
        >
          <Clock className="h-4 w-4 shrink-0 text-[var(--sec)]" />
          <span className="text-[var(--text)]">
            Submission deadline closes in:{" "}
            <strong className="font-extrabold text-[var(--pri)]">{deadlineCountdown}</strong>{" "}
            ({new Date(call.closes_at).toLocaleString()})
          </span>
        </div>
      )}

      {/* Hero Header Card (Dashboard Card Token, No Glow) */}
      <div className="pt-8 px-4 sm:px-8">
        <div className="mx-auto max-w-5xl rounded-[28px] border-2 border-[var(--border-default)] bg-[var(--card)] p-6 md:p-8 shadow-xl ring-1 ring-black/5 dark:ring-white/10 relative overflow-hidden text-left">
          <div className="relative z-10">
            <div className="inline-flex items-center gap-2 rounded-full border border-[var(--sec)]/30 bg-[var(--sec)]/10 px-3.5 py-1 text-xs font-black uppercase tracking-wider text-[var(--sec)] mb-4 shadow-sm">
              <Sparkles className="h-3.5 w-3.5 text-[var(--pri)]" />
              <span>{call.event_name} · Call for Abstracts</span>
            </div>

            <h1 className="text-2xl sm:text-4xl font-black tracking-tight leading-tight flex items-center flex-wrap gap-2">
              <span>{call.form_title || "Call for Abstracts & Scientific Papers"}</span>
            </h1>

            <p className="mt-3 text-xs sm:text-sm text-[var(--muted)] max-w-2xl leading-relaxed">
              Submit your research, clinical studies, and innovations for peer review. Accepted submissions will be indexed in the official program and scheduled for presentation.
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Button
                size="lg"
                onClick={() => router.push(`/${eventId}/call-for-abstracts/submit`)}
                className="rounded-2xl text-white font-black text-sm px-7 h-12 shadow-md flex items-center gap-2 cursor-pointer hover:opacity-90 transition-all bg-[var(--pri)]"
              >
                <span>Submit Your Abstract</span>
                <ArrowRight className="h-4 w-4" />
              </Button>

              <a
                href="#guidelines"
                className="inline-flex items-center gap-2 rounded-2xl border-2 border-[var(--border-default)] bg-[var(--bg-surface-2)] px-5 h-12 text-xs font-bold text-[var(--text)] hover:border-[var(--sec)] hover:bg-[var(--bg-surface-hover)] transition-all"
              >
                <FileText className="h-4 w-4 text-[var(--sec)]" />
                <span>Submission Guidelines</span>
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Metrics & Scope Grid (Dashboard Sub-card Token) */}
      <div className="mx-auto max-w-5xl px-4 sm:px-8 mt-8">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border-2 border-[var(--border-default)] bg-[var(--card)] p-5 shadow-sm">
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-[var(--pri)]">
              <Calendar className="h-4 w-4" />
              <span>Key Dates</span>
            </div>
            <p className="mt-3 text-sm font-bold text-[var(--text)]">
              {call.opens_at ? new Date(call.opens_at).toLocaleDateString() : "Open Now"} →{" "}
              {call.closes_at ? new Date(call.closes_at).toLocaleDateString() : "Until Notice"}
            </p>
            {call.revision_deadline && (
              <p className="mt-1 text-[11px] text-[var(--muted)]">
                Revisions deadline: {new Date(call.revision_deadline).toLocaleDateString()}
              </p>
            )}
          </div>

          <div className="rounded-2xl border-2 border-[var(--border-default)] bg-[var(--card)] p-5 shadow-sm">
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-[var(--sec)]">
              <FileText className="h-4 w-4" />
              <span>Abstract Length</span>
            </div>
            <p className="mt-3 text-sm font-bold text-[var(--text)]">
              {call.min_words} to {call.max_words} words
            </p>
            <p className="mt-1 text-[11px] text-[var(--muted)]">Excludes title, authors, and references</p>
          </div>

          <div className="rounded-2xl border-2 border-[var(--border-default)] bg-[var(--card)] p-5 shadow-sm">
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-[var(--pri)]">
              <Layers className="h-4 w-4" />
              <span>Session Formats</span>
            </div>
            <p className="mt-3 text-sm font-bold text-[var(--text)]">
              {call.abstract_types.length ? call.abstract_types.join(" · ") : "Oral, Poster, Workshop"}
            </p>
            <p className="mt-1 text-[11px] text-[var(--muted)]">Selected during online submission</p>
          </div>

          <div className="rounded-2xl border-2 border-[var(--border-default)] bg-[var(--card)] p-5 shadow-sm">
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-[var(--sec)]">
              <ShieldCheck className="h-4 w-4" />
              <span>Author Rules</span>
            </div>
            <p className="mt-3 text-sm font-bold text-[var(--text)]">
              {call.allow_coauthors ? `Up to ${call.max_coauthors ?? 5} Co-authors` : "Single Author Only"}
            </p>
            <p className="mt-1 text-[11px] text-[var(--muted)]">
              {call.allowed_file_extensions?.length
                ? `${call.allowed_file_extensions.join(", ").toUpperCase()} (≤${call.max_file_size_mb || 25}MB)`
                : "PDF uploads accepted"}
            </p>
          </div>
        </div>

        {/* Categories if configured */}
        {call.categories && call.categories.length > 0 && (
          <div className="mt-8 rounded-[28px] border-2 border-[var(--border-default)] bg-[var(--card)] p-6 md:p-8 shadow-xl ring-1 ring-black/5 dark:ring-white/10">
            <h2 className="text-lg font-black tracking-tight text-[var(--text)] flex items-center gap-2">
              <Layers className="h-5 w-5 text-[var(--sec)]" />
              <span>Submission Categories</span>
            </h2>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Available tracks for submission under this call:
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {call.categories.map((cat, i) => (
                <span
                  key={i}
                  className="rounded-xl border border-[var(--sec)]/30 bg-[var(--sec)]/10 px-3 py-1.5 text-xs font-bold text-[var(--sec)]"
                >
                  {cat}
                </span>
              ))}
            </div>
          </div>
        )}
        {call.topics && call.topics.length > 0 && (
          <div className="mt-8 rounded-[28px] border-2 border-[var(--border-default)] bg-[var(--card)] p-6 md:p-8 shadow-xl ring-1 ring-black/5 dark:ring-white/10">
            <h2 className="text-lg font-black tracking-tight text-[var(--text)] flex items-center gap-2">
              <Layers className="h-5 w-5 text-[var(--pri)]" />
              <span>Scientific Tracks & Subject Topics</span>
            </h2>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Please align your abstract with one of the approved conference topics below:
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {call.topics.map((topic, i) => (
                <span
                  key={i}
                  className="rounded-xl border border-[var(--border-default)] hover:border-[var(--sec)]/50 bg-[var(--bg-surface-2)] px-3 py-1.5 text-xs font-bold text-[var(--text)] transition-colors"
                >
                  {topic}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Guidelines & Already Submitted Access */}
        <div id="guidelines" className="mt-8 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-[28px] border-2 border-[var(--border-default)] bg-[var(--card)] p-6 md:p-8 shadow-xl ring-1 ring-black/5 dark:ring-white/10">
            <h2 className="text-lg font-black tracking-tight text-[var(--text)] flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-[var(--pri)]" />
              <span>Author Submission Guidelines</span>
            </h2>
            <div className="mt-4 space-y-3 text-xs leading-relaxed text-[var(--muted)]">
              <p>
                {subPortal.guidelines_text ||
                  "Ensure your abstract contains concise Background, Methods, Results, and Conclusions. All named co-authors must have agreed to the submission."}
              </p>
              <ul className="space-y-2 mt-4">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                  <span>The primary presenter must be identified with current institutional affiliation and country.</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                  <span>Supporting PDF documents or figures may be uploaded in accordance with call file constraints.</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                  <span>Submissions undergo rigorous single or double-blind peer review by designated scientific committee reviewers.</span>
                </li>
              </ul>
            </div>
          </div>

          <div className="rounded-[28px] border-2 border-[var(--border-default)] bg-[var(--card)] p-6 md:p-8 shadow-xl ring-1 ring-black/5 dark:ring-white/10 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-[var(--pri)]">
                <KeyRound className="h-4 w-4" />
                <span>Existing Author Workspace</span>
              </div>
              <h3 className="mt-2 text-base font-black text-[var(--text)]">Already submitted or invited?</h3>
              <p className="mt-2 text-xs text-[var(--muted)] leading-relaxed">
                If you already submitted an abstract or received a personal invitation link, enter your token below to access your personal dashboard:
              </p>

              <form onSubmit={handleOpenAuthorLink} className="mt-4 space-y-2">
                <Input
                  placeholder="Paste your author token here"
                  value={accessKeyInput}
                  onChange={(e) => setAccessKeyInput(e.target.value)}
                  className="rounded-xl border-[var(--border-default)] bg-[var(--bg-surface-2)] text-xs h-10"
                />
                <Button
                  type="submit"
                  size="sm"
                  className="w-full rounded-xl text-white font-bold text-xs h-10 cursor-pointer shadow-md hover:opacity-90 bg-[var(--pri)]"
                >
                  Go to Author Dashboard
                </Button>
              </form>
            </div>

            {/* Support Helpline */}
            {(subPortal.support_email || subPortal.support_phone) && (
              <div className="mt-6 pt-4 border-t border-[var(--border-default)] text-xs text-[var(--muted)] space-y-1">
                <p className="font-bold text-[var(--text)] text-[11px] uppercase tracking-wider">Programme Secretariat Support</p>
                {subPortal.support_email && (
                  <p className="flex items-center gap-1.5">
                    <Mail className="h-3.5 w-3.5 text-[var(--pri)]" />
                    <span>{subPortal.support_email}</span>
                  </p>
                )}
                {subPortal.support_phone && (
                  <p className="flex items-center gap-1.5">
                    <Phone className="h-3.5 w-3.5 text-[var(--pri)]" />
                    <span>{subPortal.support_phone}</span>
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
