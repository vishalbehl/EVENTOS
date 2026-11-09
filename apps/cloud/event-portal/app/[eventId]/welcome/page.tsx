"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Ticket,
  FileText,
  ShieldCheck,
  ArrowRight,
  CheckCircle2,
  Clock,
  Sparkles,
  LayoutDashboard,
} from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

interface UserProfile {
  id: string;
  email: string;
  full_name?: string | null;
  is_registered: boolean;
  is_speaker: boolean;
  is_reviewer: boolean;
  reviewer_status: string;
  roles: string[];
}

interface AbstractCall {
  event_id: string;
  event_name: string;
  closes_at?: string | null;
  form_title?: string;
}

function formatDeadline(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function formatCountdown(targetDate: string): string {
  const diff = new Date(targetDate).getTime() - Date.now();
  if (diff <= 0) return "Closed";
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  return days > 0 ? `${days}d ${hours}h remaining` : `${hours}h remaining`;
}

export default function WelcomePage() {
  const { eventId } = useParams<{ eventId: string }>();
  const router = useRouter();

  const [user, setUser] = useState<UserProfile | null>(null);
  const [abstractCall, setAbstractCall] = useState<AbstractCall | null>(null);
  const [eventData, setEventData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!eventId) return;

    const token =
      localStorage.getItem(`portal_token_${eventId}`) ||
      localStorage.getItem(`portal_jwt_${eventId}`);

    // If no token, send back to login
    if (!token) {
      router.replace(`/${eventId}/login`);
      return;
    }

    // If user has already seen the welcome screen AND is registered → skip straight to dashboard
    const welcomed = localStorage.getItem(`portal_welcomed_${eventId}`);

    // Load cached event data immediately
    try {
      const cached = localStorage.getItem(`portal_theme_cache_${eventId}`);
      if (cached) setEventData(JSON.parse(cached));
    } catch {}

    // Fetch user profile + abstract call in parallel
    Promise.all([
      fetch(`${API_BASE}/api/v1/portal/users/${eventId}/me`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
      fetch(`${API_BASE}/api/v1/programme/events/${eventId}/call-for-abstracts`)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    ]).then(([profile, call]) => {
      setUser(profile);
      setAbstractCall(call);

      // Skip welcome screen if already seen and user is registered
      if (welcomed === "true" && profile?.is_registered) {
        router.replace(`/${eventId}/dashboard`);
        return;
      }

      setLoading(false);
    });
  }, [eventId, router]);

  const handleContinue = () => {
    try {
      localStorage.setItem(`portal_welcomed_${eventId}`, "true");
    } catch {}
    router.push(`/${eventId}/dashboard`);
  };

  const handleGoToWorkspace = (path: string) => {
    try {
      localStorage.setItem(`portal_welcomed_${eventId}`, "true");
    } catch {}
    router.push(`/${eventId}/${path}`);
  };

  if (loading) {
    return (
      <main className="min-h-screen grid place-items-center bg-[var(--bg-base)] text-[var(--text)]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--pri)] border-t-transparent" />
          <p className="text-sm font-semibold text-[var(--muted)]">Setting up your workspace…</p>
        </div>
      </main>
    );
  }

  const userName = user?.full_name?.split(" ")[0] || user?.email?.split("@")[0] || "there";
  const isRegistered = user?.is_registered ?? false;
  const isReviewer =
    user?.is_reviewer === true &&
    (user?.reviewer_status === "ACCEPTED" || user?.reviewer_status === "ACTIVE");

  const abstractIsOpen =
    abstractCall !== null &&
    (!abstractCall.closes_at || new Date(abstractCall.closes_at).getTime() > Date.now());

  const abstractDeadline = abstractCall?.closes_at
    ? formatDeadline(abstractCall.closes_at)
    : null;
  const abstractCountdown = abstractCall?.closes_at
    ? formatCountdown(abstractCall.closes_at)
    : null;

  const eventName = eventData?.event_name || abstractCall?.event_name || "Conference";

  return (
    <main className="min-h-screen bg-[var(--bg-base)] text-[var(--text)] pb-24">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-10 sm:pt-14 space-y-8">

        {/* ── Welcome Header ──────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="text-center space-y-3"
        >
          <div className="inline-flex items-center gap-2 rounded-full border border-[var(--pri)]/30 bg-[var(--pri)]/10 px-4 py-1.5 text-[11px] font-black uppercase tracking-wider text-[var(--pri)] mb-1">
            <Sparkles className="h-3.5 w-3.5" />
            <span>Welcome to {eventName}</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-[var(--text)]">
            Hi, {userName}!
          </h1>
          <p className="text-sm text-[var(--muted)] max-w-xl mx-auto leading-relaxed">
            You're all set. Here are the workspaces available to you for this event. Select
            where you'd like to start, or continue to your dashboard.
          </p>
        </motion.div>

        {/* ── Workspace Cards Grid ────────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

          {/* Registration Workspace */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.08 }}
            className="p-6 md:p-8 rounded-[28px] border-2 border-[var(--border-default)] bg-[var(--card)] shadow-xl ring-1 ring-black/5 dark:ring-white/10 flex flex-col gap-5 relative overflow-hidden"
          >
            {/* Registered badge */}
            {isRegistered && (
              <span className="absolute top-4 right-4 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-500/15 text-emerald-500 border border-emerald-500/20">
                <CheckCircle2 className="w-3 h-3" />
                Registered
              </span>
            )}

            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-[var(--pri)]/10 border border-[var(--pri)]/20 flex items-center justify-center shrink-0">
                <Ticket className="w-6 h-6 text-[var(--pri)]" />
              </div>
              <div className="space-y-1 min-w-0">
                <span className="text-[10px] font-black uppercase tracking-widest text-[var(--muted)] block">
                  Workspace 01
                </span>
                <h2 className="text-lg font-black text-[var(--text)] leading-tight">
                  Registration
                </h2>
                <p className="text-xs text-[var(--muted)] leading-relaxed">
                  {isRegistered
                    ? "Your delegate registration is confirmed. View your entry pass and registration details."
                    : "Complete your official delegate registration and receive your conference entry pass."}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => handleGoToWorkspace(isRegistered ? "dashboard" : "register")}
              className="mt-auto w-full h-11 rounded-2xl text-white text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 bg-[var(--pri)] hover:opacity-90 transition-all cursor-pointer shadow-md"
            >
              <span>{isRegistered ? "View My Pass" : "Register Now"}</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </motion.div>

          {/* Abstract Submission Workspace — shown only if call is active */}
          {abstractIsOpen && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.16 }}
              className="p-6 md:p-8 rounded-[28px] border-2 border-[var(--border-default)] bg-[var(--card)] shadow-xl ring-1 ring-black/5 dark:ring-white/10 flex flex-col gap-5 relative overflow-hidden"
            >
              {/* Deadline badge */}
              {abstractDeadline && (
                <span className="absolute top-4 right-4 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-[var(--sec)]/15 text-[var(--sec)] border border-[var(--sec)]/20">
                  <Clock className="w-3 h-3" />
                  {abstractCountdown}
                </span>
              )}

              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-2xl bg-[var(--sec)]/10 border border-[var(--sec)]/20 flex items-center justify-center shrink-0">
                  <FileText className="w-6 h-6 text-[var(--sec)]" />
                </div>
                <div className="space-y-1 min-w-0">
                  <span className="text-[10px] font-black uppercase tracking-widest text-[var(--muted)] block">
                    Workspace 02
                  </span>
                  <h2 className="text-lg font-black text-[var(--text)] leading-tight">
                    Abstract Submission
                  </h2>
                  <p className="text-xs text-[var(--muted)] leading-relaxed">
                    Submit your research paper or clinical study for peer review and
                    conference presentation.
                    {abstractDeadline && (
                      <span className="block mt-1 font-bold text-[var(--sec)]">
                        Deadline: {abstractDeadline}
                      </span>
                    )}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => handleGoToWorkspace("call-for-abstracts")}
                className="mt-auto w-full h-11 rounded-2xl text-white text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 hover:opacity-90 transition-all cursor-pointer shadow-md"
                style={{ backgroundColor: "var(--sec)" }}
              >
                <span>Go to Abstract Workspace</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </motion.div>
          )}

          {/* Reviewer Workspace — shown ONLY for accepted reviewers */}
          {isReviewer && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.24 }}
              className="p-6 md:p-8 rounded-[28px] border-2 border-indigo-500/30 bg-[var(--card)] shadow-xl ring-1 ring-black/5 dark:ring-white/10 flex flex-col gap-5 relative overflow-hidden"
            >
              <span className="absolute top-4 right-4 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-indigo-500/15 text-indigo-400 border border-indigo-500/20">
                <CheckCircle2 className="w-3 h-3" />
                Assigned
              </span>

              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0">
                  <ShieldCheck className="w-6 h-6 text-indigo-400" />
                </div>
                <div className="space-y-1 min-w-0">
                  <span className="text-[10px] font-black uppercase tracking-widest text-[var(--muted)] block">
                    Workspace 03
                  </span>
                  <h2 className="text-lg font-black text-[var(--text)] leading-tight">
                    Reviewer Center
                  </h2>
                  <p className="text-xs text-[var(--muted)] leading-relaxed">
                    You've been assigned as a peer reviewer. Access your assigned abstracts,
                    submit scores, and provide structured feedback.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => handleGoToWorkspace("review")}
                className="mt-auto w-full h-11 rounded-2xl text-white text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 bg-indigo-500 hover:opacity-90 transition-all cursor-pointer shadow-md"
              >
                <span>Open Reviewer Center</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </motion.div>
          )}
        </div>

        {/* ── Continue to Dashboard CTA ───────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.32 }}
          className="pt-2 flex flex-col items-center gap-3"
        >
          <button
            type="button"
            onClick={handleContinue}
            className="h-13 px-10 rounded-2xl text-white text-sm font-black uppercase tracking-wider flex items-center gap-2 bg-[var(--pri)] hover:opacity-90 transition-all cursor-pointer shadow-lg"
          >
            <LayoutDashboard className="h-4 w-4" />
            <span>Continue to My Dashboard</span>
            <ArrowRight className="h-4 w-4" />
          </button>
          <p className="text-[11px] text-[var(--muted)] font-medium">
            You can access all workspaces anytime from the sidebar.
          </p>
        </motion.div>

      </div>
    </main>
  );
}
