"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Award,
  Download,
  Lock,
  Sparkles,
  Printer,
  Calendar,
  ShieldCheck,
  FileCheck,
  Clock,
  ExternalLink,
  Info,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

interface EventUserProfile {
  id: string;
  event_id: string;
  email: string;
  full_name?: string | null;
  roles: string[];
  is_registered: boolean;
  is_speaker: boolean;
  is_reviewer: boolean;
  reviewer_status: string;
}

interface IssuedCertificate {
  id: string;
  title: string;
  category: string;
  issued_at: string;
  download_url?: string;
  certificate_number?: string;
}

export default function CertificatesPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<EventUserProfile | null>(null);
  const [issuedCertificates, setIssuedCertificates] = useState<IssuedCertificate[]>([]);

  useEffect(() => {
    const token =
      localStorage.getItem(`portal_token_${eventId}`) ||
      localStorage.getItem(`portal_jwt_${eventId}`);

    if (!token) {
      toast.error("Please sign in to view and download your certificates.");
      router.replace(`/${eventId}/login?redirect=certificates`);
      return;
    }

    // Fetch user profile and check for any organizer-issued certificates
    fetch(`${API_BASE}/api/v1/portal/users/${eventId}/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((usr) => {
        if (usr) setUser(usr);
        // Only organizer portal generates certificates. Default is empty until published.
        setIssuedCertificates([]);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [eventId, router]);

  if (loading) {
    return (
      <main className="min-h-[70vh] grid place-items-center bg-[var(--bg-base)] text-[var(--text)]">
        <div className="flex flex-col items-center gap-3">
          <div
            className="h-10 w-10 animate-spin rounded-full border-2 border-t-transparent"
            style={{
              borderColor: "var(--pri)",
              borderTopColor: "transparent",
            }}
          />
          <p className="text-xs font-bold text-[var(--muted)]">Loading Certificates Center...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[var(--bg-base)] text-[var(--text)] pb-24 px-4 sm:px-8 pt-8">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header Title with Duo-Tone pill */}
        <div className="space-y-3">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-black uppercase tracking-wider border border-[var(--sec)]/30 bg-[var(--sec)]/10 text-[var(--sec)] shadow-sm">
            <Award className="h-3.5 w-3.5 text-[var(--pri)]" />
            <span>Official Credential Registry</span>
          </div>
          <h1 className="text-2xl sm:text-4xl font-black tracking-tight flex items-center gap-3">
            <span>Certificates &amp; Accreditation</span>
            <span
              className="inline-block w-2.5 h-2.5 rounded-full bg-[var(--pri)]"
            />
          </h1>
          <p className="text-xs sm:text-sm text-[var(--muted)] max-w-xl leading-relaxed">
            Tamper-proof digital certificates, CME credits, and academic recognitions issued directly by the conference organizer committee.
          </p>
        </div>

        {/* User Identity Banner (Dashboard Card Token) */}
        <div className="relative overflow-hidden p-6 md:p-8 rounded-[28px] border-2 border-[var(--border-default)] bg-[var(--card)] shadow-xl ring-1 ring-black/5 dark:ring-white/10">
          <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider text-[var(--sec)]">
                Certificate Registry Profile
              </span>
              <div className="text-lg font-black text-[var(--text)] flex items-center gap-2">
                <span>{user?.full_name || user?.email}</span>
                {user?.is_registered && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-500 border border-emerald-500/20">
                    <CheckCircle2 className="w-3 h-3" />
                    Registered Delegate
                  </span>
                )}
              </div>
              <div className="text-xs text-[var(--muted)] font-mono">{user?.email}</div>
            </div>

            <div className="flex flex-wrap gap-2">
              {user?.roles?.map((role, idx) => (
                <span
                  key={idx}
                  className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border border-[var(--sec)]/20"
                  style={{
                    backgroundColor: "color-mix(in srgb, var(--sec) 15%, transparent)",
                    color: "var(--sec)",
                  }}
                >
                  {role}
                </span>
              ))}
              <span
                className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider"
                style={{
                  backgroundColor: "color-mix(in srgb, var(--pri) 15%, transparent)",
                  color: "var(--pri)",
                }}
              >
                {user?.is_registered ? "Delegate" : "Guest"}
              </span>
            </div>
          </div>
        </div>

        {/* Certificate Display Area: Zero mock/default data */}
        {issuedCertificates.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {issuedCertificates.map((cert) => (
              <div
                key={cert.id}
                className="p-6 md:p-8 rounded-[28px] border-2 border-[var(--border-default)] bg-[var(--card)] shadow-xl ring-1 ring-black/5 dark:ring-white/10 flex flex-col justify-between space-y-4"
              >
                <div>
                  <span className="text-[10px] font-bold text-[var(--sec)] uppercase">
                    {cert.category}
                  </span>
                  <h3 className="text-base font-black text-[var(--text)]">{cert.title}</h3>
                  <p className="text-xs text-[var(--muted)] mt-1">
                    Issued: {new Date(cert.issued_at).toLocaleDateString()}
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={() => cert.download_url && window.open(cert.download_url, "_blank")}
                  className="rounded-2xl text-white font-bold text-xs h-10 flex items-center justify-center gap-2 bg-[var(--pri)] hover:opacity-90"
                >
                  <Download className="w-4 h-4" />
                  <span>Download Certificate</span>
                </Button>
              </div>
            ))}
          </div>
        ) : (
          /* Empty State Card (Dashboard Card Token, No Glow) */
          <div className="p-8 sm:p-12 rounded-[28px] border-2 border-[var(--border-default)] bg-[var(--card)] shadow-xl ring-1 ring-black/5 dark:ring-white/10 text-center relative overflow-hidden">
            <div className="max-w-md mx-auto space-y-4 relative z-10">
              <div
                className="w-16 h-16 rounded-2xl mx-auto flex items-center justify-center border-2 border-[var(--border-default)] bg-[var(--bg-surface-2)]"
              >
                <Award className="w-8 h-8 text-[var(--pri)]" />
              </div>

              <div className="space-y-1">
                <h3 className="text-lg font-black text-[var(--text)]">
                  No Certificates Issued Yet
                </h3>
                <p className="text-xs sm:text-sm text-[var(--muted)] leading-relaxed">
                  Official certificates (Attendance, CME Credits, Faculty/Speaker Honors, and Reviewer Citations) are generated and issued directly by the conference organizers upon session validation.
                </p>
              </div>

              <div className="pt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-left">
                <div className="p-4 rounded-2xl border-2 border-[var(--border-default)] bg-[var(--bg-surface-2)]/60">
                  <div className="flex items-center gap-2 text-xs font-black text-[var(--text)]">
                    <Clock className="w-3.5 h-3.5 text-[var(--pri)]" />
                    <span>Post-Event Release</span>
                  </div>
                  <p className="text-[11px] text-[var(--muted)] mt-1">
                    Attendance certificates are generated following event conclusion.
                  </p>
                </div>

                <div className="p-4 rounded-2xl border-2 border-[var(--border-default)] bg-[var(--bg-surface-2)]/60">
                  <div className="flex items-center gap-2 text-xs font-black text-[var(--text)]">
                    <ShieldCheck className="w-3.5 h-3.5 text-[var(--sec)]" />
                    <span>Organizer Verified</span>
                  </div>
                  <p className="text-[11px] text-[var(--muted)] mt-1">
                    Requires verification from the organizer scientific committee.
                  </p>
                </div>
              </div>

              <div className="pt-2">
                <Button
                  variant="outline"
                  onClick={() => router.push(`/${eventId}`)}
                  className="rounded-2xl border-[var(--border-default)] text-xs font-bold px-6 h-10 hover:border-[var(--sec)] transition-colors cursor-pointer"
                >
                  Return to Event Home
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
