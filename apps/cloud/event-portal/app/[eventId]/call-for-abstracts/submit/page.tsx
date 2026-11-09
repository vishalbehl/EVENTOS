"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  FileText,
  Users,
  Layers,
  UploadCloud,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Send,
  Plus,
  Trash2,
  AlertCircle,
  HelpCircle,
  FileCheck,
  ShieldCheck,
  Sparkles,
  ArrowRight,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/lib/toast";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

type CallData = {
  event_id: string;
  event_name: string;
  opens_at?: string | null;
  closes_at?: string | null;
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

type AuthorItem = {
  full_name: string;
  email: string;
  affiliation: string;
  country: string;
  is_presenter: boolean;
};

type SubmissionResult = {
  id: string;
  code: string;
  title: string;
  status: string;
  author_confirmation?: string | null;
};

export default function PublicSubmitAbstractPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const router = useRouter();

  const [call, setCall] = useState<CallData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Wizard step (1: Content, 2: Authors, 3: Disclosures/Form, 4: Attachments, 5: Review)
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);

  // Step 1: Content
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [selectedTopic, setSelectedTopic] = useState("");
  const [selectedType, setSelectedType] = useState("");
  const [keywordInput, setKeywordInput] = useState("");
  const [keywords, setKeywords] = useState<string[]>([]);

  // Step 2: Authors
  const [authors, setAuthors] = useState<AuthorItem[]>([
    { full_name: "", email: "", affiliation: "", country: "", is_presenter: true },
  ]);

  // Step 3: Dynamic Form & Disclosures
  const [formResponses, setFormResponses] = useState<Record<string, any>>({});
  const [coiAcknowledged, setCoiAcknowledged] = useState(false);

  // Step 4: Attachments
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileStoragePath, setFileStoragePath] = useState<string | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);

  // Submission State
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<SubmissionResult | null>(null);
  const [authChecking, setAuthChecking] = useState(true);

  // Enforce Authentication: Abstract submission is ONLY accessible after login
  useEffect(() => {
    const token =
      localStorage.getItem(`portal_token_${eventId}`) ||
      localStorage.getItem(`portal_jwt_${eventId}`);

    if (!token) {
      toast.error("Please sign in to submit an abstract for this conference.");
      router.replace(`/${eventId}/login?redirect=call-for-abstracts/submit`);
      return;
    }

    // Pre-fill primary author with events_users data
    const cachedUser = localStorage.getItem(`events_user_${eventId}`);
    if (cachedUser) {
      try {
        const u = JSON.parse(cachedUser);
        if (u) {
          setAuthors([
            {
              full_name: u.full_name || "",
              email: u.email || "",
              affiliation: u.affiliation || "",
              country: u.country || "",
              is_presenter: true,
            },
          ]);
        }
      } catch (e) {}
    } else {
      fetch(`${API_BASE}/api/v1/portal/users/${eventId}/me`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((u) => {
          if (u) {
            localStorage.setItem(`events_user_${eventId}`, JSON.stringify(u));
            setAuthors([
              {
                full_name: u.full_name || "",
                email: u.email || "",
                affiliation: u.affiliation || "",
                country: u.country || "",
                is_presenter: true,
              },
            ]);
          }
        })
        .catch(() => {});
    }

    setAuthChecking(false);
  }, [eventId, router]);

  useEffect(() => {
    fetch(`${API_BASE}/api/v1/programme/events/${eventId}/call-for-abstracts`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.message || "This call for abstracts is not currently open.");
        }
        const data = await res.json();
        setCall(data);
        if (data.topics && data.topics.length > 0) setSelectedTopic(data.topics[0]);
        if (data.abstract_types && data.abstract_types.length > 0) setSelectedType(data.abstract_types[0]);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [eventId]);

  const wordCount = useMemo(() => {
    return body.trim() ? body.trim().split(/\s+/).length : 0;
  }, [body]);

  const maxCoauthorsAllowed = useMemo(() => {
    if (!call) return 5;
    if (call.allow_coauthors === false) return 0;
    if (typeof call.max_coauthors === "number") return call.max_coauthors;
    const authorRules = call.author_rules || {};
    if (authorRules.co_authors_allowed === "none" || authorRules.allow_coauthors === false) return 0;
    if (typeof authorRules.max_coauthors === "number") return authorRules.max_coauthors;
    if (authorRules.coauthor_rules?.max) return authorRules.coauthor_rules.max;
    return 5;
  }, [call]);

  // Keyword Helpers
  const handleAddKeyword = () => {
    const trimmed = keywordInput.trim();
    if (trimmed && !keywords.includes(trimmed) && keywords.length < 10) {
      setKeywords([...keywords, trimmed]);
      setKeywordInput("");
    }
  };

  const handleRemoveKeyword = (index: number) => {
    setKeywords(keywords.filter((_, i) => i !== index));
  };

  // Author List Helpers
  const handleAddAuthor = () => {
    if (authors.length - 1 >= maxCoauthorsAllowed) {
      toast.error(`Maximum ${maxCoauthorsAllowed} co-author(s) allowed for this call`);
      return;
    }
    setAuthors([
      ...authors,
      { full_name: "", email: "", affiliation: "", country: "", is_presenter: false },
    ]);
  };

  const handleRemoveAuthor = (index: number) => {
    if (authors.length <= 1) return;
    const next = authors.filter((_, i) => i !== index);
    if (!next.some((a) => a.is_presenter)) {
      next[0].is_presenter = true;
    }
    setAuthors(next);
  };

  const handleAuthorChange = (index: number, field: keyof AuthorItem, value: any) => {
    const updated = [...authors];
    if (field === "is_presenter" && value === true) {
      updated.forEach((a, i) => (a.is_presenter = i === index));
    } else {
      updated[index] = { ...updated[index], [field]: value };
    }
    setAuthors(updated);
  };

  // File Upload
  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedExts = (
      call?.allowed_file_extensions ||
      call?.attachment_rules?.allowed_extensions ||
      ["pdf", "docx"]
    ).map((x: string) => x.toLowerCase().replace(".", ""));
    const ext = file.name.split(".").pop()?.toLowerCase() || "";
    if (!allowedExts.includes(ext)) {
      toast.error(`Invalid file format. Only ${allowedExts.join(", ")} files are accepted.`);
      return;
    }

    const maxMb = call?.max_file_size_mb || call?.attachment_rules?.max_size_mb || 25;
    if (file.size > maxMb * 1024 * 1024) {
      toast.error(`File size exceeds the ${maxMb} MB limit.`);
      return;
    }

    setSelectedFile(file);
    setFileStoragePath(`public_uploads/${Date.now()}_${file.name}`);
    toast.success(`File "${file.name}" attached.`);
  };

  // Step Validation & Progression
  const validateStep1 = () => {
    if (!title.trim() || title.length < 5) {
      toast.error("Please enter a valid title (at least 5 characters)");
      return false;
    }
    if (!call) return false;
    if (wordCount < call.min_words || wordCount > call.max_words) {
      toast.error(`Abstract text must be between ${call.min_words} and ${call.max_words} words. Current: ${wordCount}`);
      return false;
    }
    if (!selectedType) {
      toast.error("Please select a presentation format");
      return false;
    }
    return true;
  };

  const validateStep2 = () => {
    for (let i = 0; i < authors.length; i++) {
      const a = authors[i];
      if (!a.full_name.trim()) {
        toast.error(`Author #${i + 1}: Name is required`);
        return false;
      }
      if (i === 0 && !a.email.trim()) {
        toast.error("Primary author email is required for correspondence");
        return false;
      }
      if (call?.author_rules?.require_affiliation && !a.affiliation.trim()) {
        toast.error(`Author #${i + 1} (${a.full_name}): Affiliation is required`);
        return false;
      }
      if (call?.author_rules?.require_country && !a.country.trim()) {
        toast.error(`Author #${i + 1} (${a.full_name}): Country is required`);
        return false;
      }
    }
    if (!authors.some((a) => a.is_presenter)) {
      toast.error("Please designate at least one author as the presenter");
      return false;
    }
    return true;
  };

  const validateStep3 = () => {
    const discRules = call?.disclosure_rules || {};
    if (discRules.required && !coiAcknowledged) {
      toast.error("You must acknowledge the conflict of interest disclosure");
      return false;
    }
    return true;
  };

  const handleNext = () => {
    if (step === 1 && !validateStep1()) return;
    if (step === 2 && !validateStep2()) return;
    if (step === 3 && !validateStep3()) return;
    setStep((prev) => Math.min(prev + 1, 5) as any);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleBack = () => {
    setStep((prev) => Math.max(prev - 1, 1) as any);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Final Submission
  const handleSubmitFinal = async () => {
    if (!call) return;
    setSubmitting(true);

    const payload = {
      title: title.trim(),
      body: body.trim(),
      keywords,
      abstract_type: selectedType,
      topic: selectedTopic || null,
      form_payload: {
        ...formResponses,
        coi_declared: coiAcknowledged,
      },
      authors: authors.map((a) => ({
        full_name: a.full_name.trim(),
        email: a.email.trim() || null,
        affiliation: a.affiliation.trim() || null,
        country: a.country.trim() || null,
        is_presenter: a.is_presenter,
      })),
    };

    try {
      const res = await fetch(`${API_BASE}/api/v1/programme/events/${eventId}/call-for-abstracts/submissions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": `submit-${eventId}-${Date.now()}`,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || errData.detail?.message || "Failed to submit abstract.");
      }

      const created = await res.json();
      setResult(created);
      toast.success("Abstract submitted successfully!");
    } catch (err: any) {
      toast.error(err.message || "An unexpected error occurred during submission.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || authChecking) {
    return (
      <main className="min-h-screen grid place-items-center bg-[var(--bg-base)] text-[var(--text)]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--pri)] border-t-transparent" />
          <p className="text-sm font-semibold text-[var(--muted)]">Loading Submission Form...</p>
        </div>
      </main>
    );
  }

  if (error || !call) {
    return (
      <main className="min-h-screen grid place-items-center bg-[var(--bg-base)] px-6 text-[var(--text)]">
        <div className="max-w-md rounded-[28px] border-2 border-[var(--border-default)] bg-[var(--card)] p-8 text-center shadow-xl ring-1 ring-black/5 dark:ring-white/10">
          <AlertCircle className="mx-auto mb-3 h-10 w-10 text-amber-500" />
          <h1 className="text-xl font-black">Submission Unavailable</h1>
          <p className="mt-2 text-xs text-[var(--muted)]">{error || "Call is currently closed."}</p>
          <Button
            onClick={() => router.push(`/${eventId}/call-for-abstracts`)}
            className="mt-6 rounded-xl bg-[var(--pri)] text-[var(--primary-contrast,#fff)]"
          >
            Return to Overview
          </Button>
        </div>
      </main>
    );
  }

  // If already submitted, show Success Receipt View
  if (result) {
    const authorToken = result.author_confirmation;
    return (
      <main className="min-h-screen bg-[var(--bg-base)] py-16 px-6 sm:px-12 text-[var(--text)]">
        <div className="mx-auto max-w-2xl rounded-[28px] border-2 border-emerald-500/30 bg-[var(--card)] p-8 sm:p-12 shadow-xl ring-1 ring-black/5 dark:ring-white/10 text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-500">
            <CheckCircle2 className="h-8 w-8" />
          </div>

          <p className="text-xs font-black uppercase tracking-widest text-emerald-500">Submission Confirmed</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight">{result.title}</h1>
          <p className="mt-3 text-sm text-[var(--muted)] leading-relaxed">
            Your abstract has been registered under reference code:
          </p>

          <div
            className="mt-4 inline-block rounded-2xl border border-[var(--sec)]/30 px-6 py-3 font-mono text-xl font-extrabold tracking-wider shadow-sm"
            style={{
              backgroundColor: "color-mix(in srgb, var(--sec) 12%, transparent)",
              color: "var(--sec)",
            }}
          >
            {result.code}
          </div>

          <p className="mt-6 text-xs text-[var(--muted)] leading-relaxed max-w-md mx-auto">
            A confirmation receipt has been generated. You can use your personal Author Workspace link to review reviewer notes, upload revisions, or make modifications before the deadline.
          </p>

          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            {authorToken ? (
              <Button
                size="lg"
                onClick={() => router.push(`/${eventId}/author/${authorToken}`)}
                className="w-full sm:w-auto rounded-2xl text-white font-bold text-sm px-6 h-12 shadow-md flex items-center gap-2 cursor-pointer hover:opacity-90 bg-[var(--pri)]"
              >
                <span>Go to Author Workspace</span>
                <ArrowRight className="h-4 w-4" />
              </Button>
            ) : null}

            <Button
              variant="outline"
              size="lg"
              onClick={() => router.push(`/${eventId}/call-for-abstracts`)}
              className="w-full sm:w-auto rounded-2xl border-[var(--border-default)] bg-[var(--bg-surface-2)] text-xs font-bold text-[var(--text)] h-12"
            >
              Back to Overview
            </Button>
          </div>
        </div>
      </main>
    );
  }

  const stepsList = [
    { num: 1, label: "Content", icon: FileText },
    { num: 2, label: "Authors", icon: Users },
    { num: 3, label: "Disclosures", icon: ShieldCheck },
    { num: 4, label: "Files", icon: UploadCloud },
    { num: 5, label: "Review", icon: FileCheck },
  ];

  return (
    <main className="min-h-screen bg-[var(--bg-base)] text-[var(--text)] pb-24">
      {/* Top Breadcrumb & Title */}
      <div className="border-b-2 border-[var(--border-default)] bg-[var(--card)] py-8 px-6 sm:px-12">
        <div className="mx-auto max-w-4xl">
          <button
            onClick={() => router.push(`/${eventId}/call-for-abstracts`)}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-[var(--muted)] hover:text-[var(--text)] transition-colors mb-3 cursor-pointer"
          >
            <ChevronLeft className="h-4 w-4" />
            <span>Back to Call Overview</span>
          </button>

          <h1 className="text-2xl sm:text-4xl font-black tracking-tight">Submit Abstract</h1>
          <p className="mt-1 text-xs sm:text-sm text-[var(--muted)]">
            {call.event_name} · Complete all sections below to register your paper.
          </p>

          {/* Stepper Progression */}
          <div className="mt-8 flex items-center justify-between border-t border-[var(--border-default)] pt-6">
            {stepsList.map((s, idx) => {
              const Icon = s.icon;
              const isActive = step === s.num;
              const isPast = step > s.num;
              return (
                <div key={s.num} className="flex items-center gap-2">
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-xl text-xs font-bold transition-all ${
                      isActive
                        ? "text-[var(--primary-contrast,#fff)] shadow-md ring-4 ring-[var(--sec)]/20"
                        : isPast
                        ? "bg-emerald-500/15 text-emerald-500 border border-emerald-500/30"
                        : "bg-[var(--bg-surface-2)] text-[var(--muted)] border border-[var(--border-default)]"
                    }`}
                    style={
                      isActive
                        ? { backgroundColor: "var(--pri)" }
                        : {}
                    }
                  >
                    {isPast ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                  </div>
                  <span
                    className={`hidden sm:inline text-xs font-bold ${
                      isActive ? "text-[var(--text)] font-extrabold" : "text-[var(--muted)]"
                    }`}
                  >
                    {s.label}
                  </span>
                  {idx < stepsList.length - 1 && (
                    <div className="hidden sm:block w-8 lg:w-16 h-[2px] bg-[var(--border-default)] ml-2" />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Form Steps Body */}
      <div className="mx-auto max-w-4xl px-6 sm:px-12 mt-10">
        <div className="rounded-[28px] border-2 border-[var(--border-default)] bg-[var(--card)] p-6 sm:p-10 shadow-xl ring-1 ring-black/5 dark:ring-white/10">
          {/* STEP 1: CONTENT */}
          {step === 1 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-black text-[var(--text)] flex items-center gap-2">
                  <FileText className="h-5 w-5 text-[var(--pri)]" />
                  <span>Abstract Title & Presentation Format</span>
                </h2>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  Provide a concise, informative title and select your preferred presentation format.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[var(--text)] mb-2">
                  Abstract Title <span className="text-rose-500">*</span>
                </label>
                <Input
                  placeholder="e.g. Clinical evaluation of deep learning in automated diagnosis"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="rounded-2xl border-[var(--border-default)] bg-[var(--bg-surface-2)] text-sm font-semibold h-12"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-[var(--text)] mb-2">
                    Session Format <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={selectedType}
                    onChange={(e) => setSelectedType(e.target.value)}
                    className="w-full rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface-2)] text-xs font-semibold px-4 h-12 text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--pri)]"
                  >
                    {call.abstract_types.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-[var(--text)] mb-2">
                    Topic / Track
                  </label>
                  <select
                    value={selectedTopic}
                    onChange={(e) => setSelectedTopic(e.target.value)}
                    className="w-full rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface-2)] text-xs font-semibold px-4 h-12 text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--pri)]"
                  >
                    {call.topics.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-[var(--text)]">
                    Abstract Body <span className="text-rose-500">*</span>
                  </label>
                  <span
                    className={`text-xs font-mono font-bold ${
                      wordCount < call.min_words || wordCount > call.max_words
                        ? "text-amber-500"
                        : "text-emerald-500"
                    }`}
                  >
                    {wordCount} / {call.max_words} words (min {call.min_words})
                  </span>
                </div>
                <Textarea
                  placeholder="Structure your abstract clearly: Background, Methods, Results, and Conclusion..."
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={10}
                  className="rounded-2xl border-[var(--border-default)] bg-[var(--bg-surface-2)] text-xs leading-relaxed"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[var(--text)] mb-2">
                  Keywords (Up to 10)
                </label>
                <div className="flex gap-2">
                  <Input
                    placeholder="Enter keyword and press Add"
                    value={keywordInput}
                    onChange={(e) => setKeywordInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddKeyword();
                      }
                    }}
                    className="rounded-xl border-[var(--border-default)] bg-[var(--bg-surface-2)] text-xs h-10"
                  />
                  <Button
                    type="button"
                    onClick={handleAddKeyword}
                    variant="outline"
                    className="rounded-xl text-xs font-bold border-[var(--border-default)] h-10 px-4"
                  >
                    Add
                  </Button>
                </div>
                {keywords.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {keywords.map((kw, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3 py-1 text-xs font-bold text-[var(--text)]"
                      >
                        <span>{kw}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveKeyword(i)}
                          className="text-[var(--muted)] hover:text-rose-500 transition-colors"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* STEP 2: AUTHORS */}
          {step === 2 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-black text-[var(--text)] flex items-center gap-2">
                  <Users className="h-5 w-5 text-[var(--pri)]" />
                  <span>Authors & Presenter Information</span>
                </h2>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  Add all contributing authors. At least one author must be designated as the presenter.
                  {maxCoauthorsAllowed > 0
                    ? ` You may add up to ${maxCoauthorsAllowed} co-authors.`
                    : " Co-authors are not permitted for this call."}
                </p>
              </div>

              <div className="space-y-4">
                {authors.map((author, index) => (
                  <div
                    key={index}
                    className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface-2)] p-5 relative"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-black uppercase tracking-wider text-[var(--pri)]">
                        Author #{index + 1} {index === 0 ? "(Primary Submitter)" : ""}
                      </span>
                      {index > 0 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveAuthor(index)}
                          className="text-[var(--muted)] hover:text-rose-500 transition-colors p-1"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <label className="block text-[11px] font-bold text-[var(--muted)] mb-1">
                          Full Name <span className="text-rose-500">*</span>
                        </label>
                        <Input
                          placeholder="e.g. Dr. Jane Doe"
                          value={author.full_name}
                          onChange={(e) => handleAuthorChange(index, "full_name", e.target.value)}
                          className="rounded-xl border-2 border-[var(--border-default)] bg-[var(--bg-surface-2)] text-xs h-10 focus:bg-[var(--card)]"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-[var(--muted)] mb-1">
                          Email Address {index === 0 ? <span className="text-rose-500">*</span> : ""}
                        </label>
                        <Input
                          type="email"
                          placeholder="jane.doe@university.edu"
                          value={author.email}
                          onChange={(e) => handleAuthorChange(index, "email", e.target.value)}
                          className="rounded-xl border-2 border-[var(--border-default)] bg-[var(--bg-surface-2)] text-xs h-10 focus:bg-[var(--card)]"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-[var(--muted)] mb-1">
                          Affiliation / Institution {call.author_rules?.require_affiliation ? <span className="text-rose-500">*</span> : ""}
                        </label>
                        <Input
                          placeholder="e.g. Oxford Institute"
                          value={author.affiliation}
                          onChange={(e) => handleAuthorChange(index, "affiliation", e.target.value)}
                          className="rounded-xl border-2 border-[var(--border-default)] bg-[var(--bg-surface-2)] text-xs h-10 focus:bg-[var(--card)]"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-[var(--muted)] mb-1">
                          Country / Region {call.author_rules?.require_country ? <span className="text-rose-500">*</span> : ""}
                        </label>
                        <Input
                          placeholder="e.g. United Kingdom"
                          value={author.country}
                          onChange={(e) => handleAuthorChange(index, "country", e.target.value)}
                          className="rounded-xl border-2 border-[var(--border-default)] bg-[var(--bg-surface-2)] text-xs h-10 focus:bg-[var(--card)]"
                        />
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-[var(--border-default)] flex items-center gap-2">
                      <input
                        type="radio"
                        name="presenter_selection"
                        id={`presenter_${index}`}
                        checked={author.is_presenter}
                        onChange={() => handleAuthorChange(index, "is_presenter", true)}
                        className="h-4 w-4 text-[var(--pri)]"
                      />
                      <label htmlFor={`presenter_${index}`} className="text-xs font-bold text-[var(--text)] cursor-pointer">
                        Designate as Conference Presenter
                      </label>
                    </div>
                  </div>
                ))}
              </div>

              {authors.length - 1 < maxCoauthorsAllowed && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleAddAuthor}
                  className="rounded-2xl border-dashed border-[var(--border-default)] hover:border-[var(--pri)] text-xs font-bold w-full h-11 flex items-center justify-center gap-2"
                >
                  <Plus className="h-4 w-4 text-[var(--pri)]" />
                  <span>Add Co-Author</span>
                </Button>
              )}
            </div>
          )}

          {/* STEP 3: DISCLOSURES & CUSTOM QUESTIONS */}
          {step === 3 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-black text-[var(--text)] flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-[var(--pri)]" />
                  <span>Disclosures & Submission Questions</span>
                </h2>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  Verify research integrity, ethical approvals, and declare any conflicts of interest.
                </p>
              </div>

              {/* Dynamic form questions from form_schema */}
              {call.form_schema?.fields && Array.isArray(call.form_schema.fields) && call.form_schema.fields.length > 0 && (
                <div className="space-y-4">
                  {call.form_schema.fields.map((field: any, idx: number) => {
                    const fieldKey = field.key || field.name || `field_${idx}`;
                    return (
                      <div key={idx} className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface-2)] p-4">
                        <label className="block text-xs font-bold text-[var(--text)] mb-1">
                          {field.label || field.title || fieldKey}
                          {field.required && <span className="text-rose-500"> *</span>}
                        </label>
                        {field.type === "textarea" ? (
                          <Textarea
                            value={formResponses[fieldKey] || ""}
                            onChange={(e) => setFormResponses({ ...formResponses, [fieldKey]: e.target.value })}
                            rows={3}
                            className="rounded-xl border-2 border-[var(--border-default)] bg-[var(--bg-surface-2)] text-xs focus:bg-[var(--card)]"
                          />
                        ) : (
                          <Input
                            type={field.type || "text"}
                            value={formResponses[fieldKey] || ""}
                            onChange={(e) => setFormResponses({ ...formResponses, [fieldKey]: e.target.value })}
                            className="rounded-xl border-2 border-[var(--border-default)] bg-[var(--bg-surface-2)] text-xs h-10 focus:bg-[var(--card)]"
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Conflict of Interest Declaration */}
              <div className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface-2)] p-5">
                <h3 className="text-xs font-black uppercase tracking-wider text-[var(--pri)] mb-2">
                  Conflict of Interest Declaration
                </h3>
                <p className="text-xs text-[var(--muted)] leading-relaxed mb-4">
                  All authors have read and agreed to the submission. Authors certify that this study is original and does not violate any third-party intellectual property or ethical guidelines.
                </p>
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={coiAcknowledged}
                    onChange={(e) => setCoiAcknowledged(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-[var(--border-default)] text-[var(--pri)]"
                  />
                  <span className="text-xs font-bold text-[var(--text)]">
                    I certify and declare that all authors consent to this submission, and there are no undeclared conflicts of interest.
                  </span>
                </label>
              </div>
            </div>
          )}

          {/* STEP 4: ATTACHMENTS */}
          {step === 4 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-black text-[var(--text)] flex items-center gap-2">
                  <UploadCloud className="h-5 w-5 text-[var(--pri)]" />
                  <span>Supporting Documents & Figures</span>
                </h2>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  Upload supplementary PDF figures, data tables, or charts if permitted by call rules.
                </p>
              </div>

              <div className="rounded-3xl border-2 border-dashed border-[var(--border-default)] hover:border-[var(--pri)] bg-[var(--bg-surface-2)] p-8 text-center transition-all">
                <UploadCloud className="mx-auto h-12 w-12 text-[var(--pri)]" />
                <h3 className="mt-3 text-sm font-bold text-[var(--text)]">
                  {selectedFile ? selectedFile.name : "Drag & drop supporting file or click to browse"}
                </h3>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  Accepted formats: {(call.attachment_rules?.allowed_extensions || ["pdf", "docx"]).join(", ").toUpperCase()} (Max {call.attachment_rules?.max_size_mb || 25} MB)
                </p>

                <label className="mt-5 inline-block">
                  <span className="rounded-xl bg-[var(--pri)] px-5 py-2.5 text-xs font-bold text-[var(--primary-contrast,#fff)] cursor-pointer hover:opacity-90 shadow-sm">
                    {selectedFile ? "Replace File" : "Select File"}
                  </span>
                  <input
                    type="file"
                    onChange={handleFileSelected}
                    accept=".pdf,.docx"
                    className="hidden"
                  />
                </label>

                {selectedFile && (
                  <div className="mt-4 inline-flex items-center gap-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 px-3 py-1.5 text-xs font-bold text-emerald-500">
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Ready for upload: {selectedFile.name} ({(selectedFile.size / (1024 * 1024)).toFixed(2)} MB)</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* STEP 5: REVIEW & SUBMIT */}
          {step === 5 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-black text-[var(--text)] flex items-center gap-2">
                  <FileCheck className="h-5 w-5 text-[var(--pri)]" />
                  <span>Review Before Final Submission</span>
                </h2>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  Review the summary of your submission. Once submitted, your abstract will be routed to the scientific review committee.
                </p>
              </div>

              {/* Title & Body Preview */}
              <div className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface-2)] p-5">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <span className="rounded-lg bg-[var(--pri)]/10 text-[var(--pri)] text-[10px] font-black uppercase px-2 py-0.5">
                    {selectedType}
                  </span>
                  {selectedTopic && (
                    <span className="rounded-lg bg-[var(--bg-surface-3)] text-[var(--muted)] text-[10px] font-bold px-2 py-0.5">
                      {selectedTopic}
                    </span>
                  )}
                  <span className="text-[11px] font-mono font-bold text-[var(--muted)] ml-auto">
                    {wordCount} words
                  </span>
                </div>
                <h3 className="text-base font-black text-[var(--text)]">{title}</h3>
                <p className="mt-3 text-xs leading-relaxed text-[var(--muted)] whitespace-pre-wrap">{body}</p>
              </div>

              {/* Authors List */}
              <div className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface-2)] p-5">
                <h4 className="text-xs font-black uppercase tracking-wider text-[var(--text)] mb-3">Authors</h4>
                <div className="space-y-2">
                  {authors.map((a, i) => (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <div>
                        <strong className="text-[var(--text)]">{a.full_name}</strong>
                        {a.affiliation && <span className="text-[var(--muted)]"> ({a.affiliation}{a.country ? `, ${a.country}` : ""})</span>}
                      </div>
                      {a.is_presenter && (
                        <span className="rounded-full bg-emerald-500/15 text-emerald-500 border border-emerald-500/30 text-[10px] font-black uppercase px-2 py-0.5">
                          Presenter
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Supporting Document */}
              {selectedFile && (
                <div className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface-2)] p-4 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-bold text-[var(--text)]">
                    <FileText className="h-4 w-4 text-[var(--pri)]" />
                    <span>{selectedFile.name}</span>
                  </div>
                  <span className="text-[11px] text-[var(--muted)] font-mono">
                    {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Navigation Controls */}
          <div className="mt-10 pt-6 border-t border-[var(--border-default)] flex items-center justify-between">
            {step > 1 ? (
              <Button
                type="button"
                variant="outline"
                onClick={handleBack}
                className="rounded-2xl border-[var(--border-default)] text-xs font-bold h-11 px-5 flex items-center gap-2"
              >
                <ChevronLeft className="h-4 w-4" />
                <span>Previous</span>
              </Button>
            ) : (
              <div />
            )}

            {step < 5 ? (
              <Button
                type="button"
                onClick={handleNext}
                className="rounded-2xl text-white text-xs font-bold h-11 px-6 flex items-center gap-2 cursor-pointer shadow-md hover:opacity-90 bg-[var(--pri)]"
              >
                <span>Next Section</span>
                <ChevronRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                type="button"
                onClick={handleSubmitFinal}
                disabled={submitting}
                className="rounded-2xl text-white text-xs font-black h-11 px-8 shadow-lg flex items-center gap-2 cursor-pointer hover:opacity-90 bg-[var(--pri)]"
              >
                {submitting ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    <span>Registering Submission...</span>
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    <span>Confirm & Submit Abstract</span>
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
