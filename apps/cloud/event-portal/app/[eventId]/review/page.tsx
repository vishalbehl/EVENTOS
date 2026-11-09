"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  ShieldCheck,
  FileText,
  Star,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Lock,
  ArrowRight,
  Sparkles,
  ExternalLink,
  Layers,
  Award,
  BookOpen,
  Filter,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

interface EventUserProfile {
  id: string;
  event_id: string;
  email: string;
  full_name?: string | null;
  affiliation?: string | null;
  roles: string[];
  is_reviewer: boolean;
  reviewer_id?: string | null;
  reviewer_status: string;
}

export default function ReviewerCenterPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<EventUserProfile | null>(null);
  const [assignments, setAssignments] = useState<any[]>([]);

  useEffect(() => {
    const token =
      localStorage.getItem(`portal_token_${eventId}`) ||
      localStorage.getItem(`portal_jwt_${eventId}`);

    if (!token) {
      toast.error("Please sign in to access the Reviewer Center.");
      router.replace(`/${eventId}/login?redirect=review`);
      return;
    }

    fetch(`${API_BASE}/api/v1/portal/users/${eventId}/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        if (!res.ok) throw new Error("Could not verify reviewer permissions.");
        const data: EventUserProfile = await res.json();
        setUser(data);
        localStorage.setItem(`events_user_${eventId}`, JSON.stringify(data));
      })
      .catch((err) => {
        toast.error(err.message || "Failed to load reviewer identity.");
      })
      .finally(() => setLoading(false));
  }, [eventId, router]);

  if (loading) {
    return (
      <main className="min-h-[70vh] grid place-items-center bg-[var(--bg-base)] text-[var(--text)]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-9 w-9 animate-spin rounded-full border-2 border-[var(--pri)] border-t-transparent" />
          <p className="text-xs font-bold text-[var(--muted)]">Verifying Reviewer Access Credentials...</p>
        </div>
      </main>
    );
  }

  // Strictly enforced condition: Must be reviewer AND must have accepted invite
  const isAuthorized =
    user?.is_reviewer === true &&
    (user?.reviewer_status === "ACCEPTED" || user?.reviewer_status === "ACTIVE");

  if (!isAuthorized) {
    return (
      <main className="min-h-[75vh] grid place-items-center bg-[var(--bg-base)] px-6 text-[var(--text)]">
        <div className="max-w-md w-full rounded-[28px] border-2 border-[var(--border-default)] bg-[var(--card)] p-8 text-center shadow-xl ring-1 ring-black/5 dark:ring-white/10 space-y-4">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-amber-500/15 text-amber-500 flex items-center justify-center">
            <Lock className="w-7 h-7" />
          </div>

          <div className="space-y-1">
            <h1 className="text-xl font-black">Restricted: Scientific Reviewer Center</h1>
            <p className="text-xs text-[var(--muted)] leading-relaxed">
              {user?.is_reviewer && user?.reviewer_status === "INVITED"
                ? "Your reviewer invitation is currently pending acceptance. Please accept the official invitation link sent to your email to unlock access."
                : "This workspace is strictly reserved for appointed scientific committee reviewers who have accepted their conference invitation."}
            </p>
          </div>

          <div className="pt-2 flex flex-col gap-2">
            <Button
              onClick={() => router.push(`/${eventId}/dashboard`)}
              className="w-full rounded-2xl bg-[var(--pri)] text-[var(--primary-contrast,#fff)] font-bold text-xs h-10"
            >
              Return to My Dashboard
            </Button>
            <Button
              variant="outline"
              onClick={() => router.push(`/${eventId}/profile`)}
              className="w-full rounded-2xl border-[var(--border-default)] text-xs h-10"
            >
              Check Profile &amp; Roles
            </Button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[var(--bg-base)] text-[var(--text)] pb-24 px-4 sm:px-8 pt-8">
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Header Title */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-[var(--sec)]/30 bg-[var(--sec)]/10 text-[var(--sec)] text-xs font-black uppercase tracking-wider shadow-sm">
              <ShieldCheck className="h-3.5 w-3.5 text-[var(--pri)]" />
              <span>Scientific Review Committee Workspace</span>
            </div>
            <h1 className="text-2xl sm:text-4xl font-black tracking-tight">
              Peer Reviewer Center
            </h1>
            <p className="text-xs sm:text-sm text-[var(--muted)] max-w-xl">
              Welcome, <strong className="text-[var(--text)]">{user.full_name || user.email}</strong>.
              Review and grade submitted abstracts according to the conference scoring rubrics.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="px-3 py-1.5 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-500 text-xs font-black uppercase tracking-wider flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Verified Reviewer</span>
            </span>
          </div>
        </div>

        {/* Metric Cards (Dashboard Sub-card Tokens) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-5 rounded-2xl border-2 border-[var(--border-default)] bg-[var(--card)] shadow-sm space-y-2">
            <div className="flex items-center justify-between text-[var(--muted)]">
              <span className="text-xs font-bold uppercase tracking-wider">Assigned Papers</span>
              <BookOpen className="w-4 h-4 text-[var(--pri)]" />
            </div>
            <div className="text-2xl sm:text-3xl font-black text-[var(--text)]">0</div>
            <div className="text-[11px] text-[var(--muted)]">Total abstracts allocated for review</div>
          </div>

          <div className="p-5 rounded-2xl border-2 border-[var(--border-default)] bg-[var(--card)] shadow-sm space-y-2">
            <div className="flex items-center justify-between text-[var(--muted)]">
              <span className="text-xs font-bold uppercase tracking-wider">Pending Grading</span>
              <Clock className="w-4 h-4 text-[var(--sec)]" />
            </div>
            <div className="text-2xl sm:text-3xl font-black text-[var(--text)]">0</div>
            <div className="text-[11px] text-[var(--muted)]">Awaiting your evaluation score</div>
          </div>

          <div className="p-5 rounded-2xl border-2 border-[var(--border-default)] bg-[var(--card)] shadow-sm space-y-2">
            <div className="flex items-center justify-between text-[var(--muted)]">
              <span className="text-xs font-bold uppercase tracking-wider">Completed</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            </div>
            <div className="text-2xl sm:text-3xl font-black text-[var(--text)]">0</div>
            <div className="text-[11px] text-[var(--muted)]">Scores submitted to committee</div>
          </div>
        </div>

        {/* Reviewer Assignment Workspace (Dashboard Card Token, No Glow) */}
        <div className="rounded-[28px] border-2 border-[var(--border-default)] bg-[var(--card)] p-6 md:p-8 shadow-xl ring-1 ring-black/5 dark:ring-white/10 space-y-6">
          <div className="flex items-center justify-between border-b-2 border-[var(--border-default)] pb-4">
            <div>
              <h2 className="text-base sm:text-lg font-black text-[var(--text)] flex items-center gap-2">
                <FileText className="h-5 w-5 text-[var(--pri)]" />
                <span>My Review Queue</span>
              </h2>
              <p className="text-xs text-[var(--muted)]">
                Assigned papers are scored anonymously. Your evaluations remain confidential.
              </p>
            </div>
          </div>

          {assignments.length === 0 ? (
            <div className="py-12 text-center space-y-3">
              <div className="mx-auto w-12 h-12 rounded-2xl flex items-center justify-center border-2 border-[var(--border-default)] bg-[var(--bg-surface-2)]">
                <CheckCircle2 className="w-6 h-6 text-[var(--pri)]" />
              </div>
              <h3 className="text-sm font-black text-[var(--text)]">Review Queue Empty</h3>
              <p className="text-xs text-[var(--muted)] max-w-sm mx-auto leading-relaxed">
                The scientific committee has not yet distributed abstract assignments for your topic track, or all assigned papers have been evaluated.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push(`/${eventId}/call-for-abstracts`)}
                className="mt-2 text-xs rounded-xl border-[var(--border-default)] cursor-pointer"
              >
                View Call for Abstracts Overview
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Render dynamic assignment rows */}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
