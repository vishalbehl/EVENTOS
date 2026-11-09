"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  Calendar,
  Layers,
  Sliders,
  ClipboardCheck,
  Code,
  Plus,
  X,
  ExternalLink,
  Users,
  FileUp,
  Save,
  RotateCcw,
  Clock,
} from "lucide-react";
import {
  toDateTimeLocalString,
  fromDateTimeLocalString,
  formatDateTimeInTZ,
  getFallbackTimezone,
  getTimezoneAbbrev,
} from "@/lib/utils";
import {
  useAbstractSetup,
  useSaveAbstractSetup,
  useAbstractEvaluationPlans,
  useApplyAbstractEvaluationPlan,
} from "@/hooks/useAbstractWorkflow";
import { AbstractShell, EmptyState, LedgerPreview } from "./AbstractShell";
import { ScopedEventEditor } from "@/components/organizer/events/ScopedEventEditor";
import { ScopedCommandFeedback } from "@/components/organizer/events/ScopedCommandFeedback";

type TabId = "general" | "categories" | "limits" | "evaluation" | "advanced";

const ALLOWED_FILE_EXTENSIONS = [
  { ext: "pdf", label: "PDF Document (.pdf)" },
  { ext: "docx", label: "Word Document (.docx)" },
  { ext: "doc", label: "Word 97-2003 (.doc)" },
  { ext: "pptx", label: "PowerPoint (.pptx)" },
  { ext: "zip", label: "Zip Archive (.zip)" },
  { ext: "png", label: "PNG Image (.png)" },
  { ext: "jpg", label: "JPEG Image (.jpg)" },
];

export function AbstractSetupView() {
  const { eventId } = useParams<{ eventId: string }>();
  return <ScopedEventEditor eventId={eventId}><SetupEditor /></ScopedEventEditor>;
}

function SetupEditor() {
  const { eventId } = useParams<{ eventId: string }>();
  const setup = useAbstractSetup(eventId);
  const save = useSaveAbstractSetup(eventId);
  const [loadedCall, setLoadedCall] = useState<typeof setup.data>(undefined);
  const evaluationPlans = useAbstractEvaluationPlans(eventId);
  const applyEvaluationPlan = useApplyAbstractEvaluationPlan(eventId);

  const [activeTab, setActiveTab] = useState<TabId>("general");

  // Local Form State
  const [status, setStatus] = useState<"DRAFT" | "OPEN" | "CLOSED" | "PUBLISHED">("DRAFT");
  const [opensAt, setOpensAt] = useState("");
  const [closesAt, setClosesAt] = useState("");
  const [revisionDeadline, setRevisionDeadline] = useState("");
  const [blindReview, setBlindReview] = useState(false);
  const [presenterRequired, setPresenterRequired] = useState(true);
  const [disclosureRequired, setDisclosureRequired] = useState(false);
  const [attachmentRequired, setAttachmentRequired] = useState(false);

  // Categories & Formats
  const [categories, setCategories] = useState<string[]>([]);
  const [newCategory, setNewCategory] = useState("");
  const [topics, setTopics] = useState<string[]>([]);
  const [newTopic, setNewTopic] = useState("");
  const [sessionFormats, setSessionFormats] = useState<string[]>([]);
  const [newFormat, setNewFormat] = useState("");

  // Limits & File rules
  const [maxCoauthors, setMaxCoauthors] = useState<number>(5);
  const [minWords, setMinWords] = useState<number>(50);
  const [maxWords, setMaxWords] = useState<number>(500);
  const [allowedExtensions, setAllowedExtensions] = useState<string[]>(["pdf"]);
  const [maxFileSizeMb, setMaxFileSizeMb] = useState<number>(25);

  // Evaluation Plan linkage
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [targetReviewsPerSubmission, setTargetReviewsPerSubmission] = useState(2);
  const selectedEvaluationPlan = evaluationPlans.data?.find(plan => plan.id === selectedPlanId);
  const moreEvaluationBatches = applyEvaluationPlan.continuation?.planId === selectedPlanId
    && applyEvaluationPlan.continuation?.version === selectedEvaluationPlan?.version
    && applyEvaluationPlan.continuation?.count === targetReviewsPerSubmission && applyEvaluationPlan.continuation.hasNext;

  // Advanced Rules JSON
  const [rulesJson, setRulesJson] = useState("");
  const [isDirty, setIsDirty] = useState(false);

  // Sync initial setup data into state
  useEffect(() => {
    if (!setup.data || isDirty) return;
    const call = setup.data;
    setLoadedCall(call);
    const callRules = (call.author_rules || {}) as Record<string, any>;
    const callDisclosureRules = (call.disclosure_rules || {}) as Record<string, any>;
    const callAttachmentRules = (call.attachment_rules || {}) as Record<string, any>;

    setStatus(call.status || "DRAFT");
    setOpensAt(toDateTimeLocalString(call.opens_at || ""));
    setClosesAt(toDateTimeLocalString(call.closes_at || ""));
    setRevisionDeadline(toDateTimeLocalString(call.revision_deadline || ""));
    setBlindReview(Boolean(call.blind_review_enabled));
    setPresenterRequired(call.require_presenter ?? callRules.coauthor_rules?.presenter_required ?? true);
    setDisclosureRequired(call.require_disclosures ?? callDisclosureRules.required ?? callRules.disclosure_required ?? false);
    setAttachmentRequired(call.require_attachments ?? callAttachmentRules.required ?? false);

    setCategories(
      Array.isArray(call.categories) && call.categories.length
        ? call.categories
        : Array.isArray(callRules.categories) && callRules.categories.length
        ? callRules.categories
        : []
    );
    setTopics(
      Array.isArray(call.topics) && call.topics.length
        ? call.topics
        : []
    );
    setSessionFormats(
      Array.isArray(callRules.session_formats) && callRules.session_formats.length
        ? callRules.session_formats
        : Array.isArray(call.abstract_types) && call.abstract_types.length
        ? call.abstract_types
        : []
    );

    setMaxCoauthors(
      typeof call.max_coauthors === "number"
        ? call.max_coauthors
        : typeof callRules.coauthor_rules?.max === "number"
        ? callRules.coauthor_rules.max
        : 5
    );
    setMinWords(typeof call.min_words === "number" ? call.min_words : 50);
    setMaxWords(typeof call.max_words === "number" ? call.max_words : 500);

    const extensions = call.allowed_file_extensions || callAttachmentRules.allowed_extensions || ["pdf", "docx"];
    setAllowedExtensions(Array.isArray(extensions) ? extensions : ["pdf"]);
    setMaxFileSizeMb(call.max_file_size_mb || callAttachmentRules.max_size_mb || 25);

    const savedPlanId = String(call.evaluation_plan_id || callRules.selected_evaluation_plan_id || callRules.evaluation_plan_id || "");
    setSelectedPlanId(savedPlanId);
    if (typeof call.target_reviews_per_submission === "number") {
      setTargetReviewsPerSubmission(call.target_reviews_per_submission);
    } else if (typeof callRules.target_reviews_per_submission === "number") {
      setTargetReviewsPerSubmission(callRules.target_reviews_per_submission);
    }

    setRulesJson(JSON.stringify(call.author_rules || {}, null, 2));
    setIsDirty(false);
  }, [setup.data, isDirty]);

  const selectedPlan = useMemo(() => {
    return evaluationPlans.data?.find((p) => p.id === selectedPlanId);
  }, [evaluationPlans.data, selectedPlanId]);

  // Handlers for interactive tags
  const handleAddCategory = () => {
    const trimmed = newCategory.trim();
    if (trimmed && !categories.includes(trimmed)) {
      setCategories([...categories, trimmed]);
      setNewCategory("");
      setIsDirty(true);
    }
  };

  const handleRemoveCategory = (cat: string) => {
    setCategories(categories.filter((c) => c !== cat));
    setIsDirty(true);
  };

  const handleAddTopic = () => {
    const trimmed = newTopic.trim();
    if (trimmed && !topics.includes(trimmed)) {
      setTopics([...topics, trimmed]);
      setNewTopic("");
      setIsDirty(true);
    }
  };

  const handleRemoveTopic = (t: string) => {
    setTopics(topics.filter((item) => item !== t));
    setIsDirty(true);
  };

  const handleAddFormat = () => {
    const trimmed = newFormat.trim();
    if (trimmed && !sessionFormats.includes(trimmed)) {
      setSessionFormats([...sessionFormats, trimmed]);
      setNewFormat("");
      setIsDirty(true);
    }
  };

  const handleRemoveFormat = (f: string) => {
    setSessionFormats(sessionFormats.filter((item) => item !== f));
    setIsDirty(true);
  };

  const toggleAllowedExtension = (ext: string) => {
    if (allowedExtensions.includes(ext)) {
      if (allowedExtensions.length === 1) {
        toast.error("At least one file extension must be allowed");
        return;
      }
      setAllowedExtensions(allowedExtensions.filter((e) => e !== ext));
    } else {
      setAllowedExtensions([...allowedExtensions, ext]);
    }
    setIsDirty(true);
  };

  const handleSave = () => {
    if (!loadedCall) return;
    const call = loadedCall;

    let parsedAuthorRules = {};
    try {
      parsedAuthorRules = rulesJson ? JSON.parse(rulesJson) : (call.author_rules || {});
    } catch {
      toast.error("Programme rules JSON in the Advanced tab is invalid");
      return;
    }

    const payload = {
      ...call,
      status,
      opens_at: fromDateTimeLocalString(opensAt) || null,
      closes_at: fromDateTimeLocalString(closesAt) || null,
      revision_deadline: fromDateTimeLocalString(revisionDeadline) || null,
      min_words: minWords,
      max_words: maxWords,
      abstract_types: sessionFormats,
      blind_review_enabled: blindReview,
      topics,
      categories,
      allow_coauthors: maxCoauthors > 0,
      max_coauthors: maxCoauthors,
      require_presenter: presenterRequired,
      require_disclosures: disclosureRequired,
      require_attachments: attachmentRequired,
      allowed_file_extensions: allowedExtensions,
      max_file_size_mb: maxFileSizeMb,
      evaluation_plan_id: selectedPlanId || null,
      target_reviews_per_submission: targetReviewsPerSubmission,
      author_rules: {
        ...((call.author_rules as any) || {}),
        ...parsedAuthorRules,
        portal_settings: ((call.author_rules as any)?.portal_settings || (parsedAuthorRules as any)?.portal_settings || {}),
        categories,
        session_formats: sessionFormats,
        tracks: topics,
        topics,
        selected_evaluation_plan_id: selectedPlanId,
        evaluation_plan_id: selectedPlanId,
        target_reviews_per_submission: targetReviewsPerSubmission,
        co_authors_allowed: String(maxCoauthors),
        coauthor_rules: {
          ...((parsedAuthorRules as any).coauthor_rules || {}),
          max: maxCoauthors,
          presenter_required: presenterRequired,
        },
        disclosure_required: disclosureRequired,
        disclosure_rules: {
          ...((call.disclosure_rules as any) || {}),
          required: disclosureRequired,
        },
        attachment_rules: {
          ...((call.attachment_rules as any) || {}),
          required: attachmentRequired,
          allowed_extensions: allowedExtensions,
          max_size_mb: maxFileSizeMb,
        },
      },
      disclosure_rules: {
        ...((call.disclosure_rules as any) || {}),
        required: disclosureRequired,
      },
      attachment_rules: {
        ...((call.attachment_rules as any) || {}),
        required: attachmentRequired,
        allowed_extensions: allowedExtensions,
        max_size_mb: maxFileSizeMb,
      },
    };

    save.mutate(payload, {
      onSuccess: () => {
        toast.success("Abstract call settings saved successfully");
        setIsDirty(false);
      },
      onError: error => {
        toast.error(error.message || "Failed to save abstract settings");
      },
    });
  };

  const tabs: Array<{ id: TabId; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { id: "general", label: "General & Schedule", icon: Calendar },
    { id: "categories", label: "Categories & Formats", icon: Layers },
    { id: "limits", label: "Submission Limits", icon: Sliders },
    { id: "evaluation", label: "Evaluation Plan", icon: ClipboardCheck },
    { id: "advanced", label: "Policy JSON", icon: Code },
  ];

  return (
    <AbstractShell view="setup">
      <ScopedCommandFeedback failure={save.commandFailure} retryAt={save.retryAt} />
      {setup.isError ? <p role="alert">Setup is unavailable. Reload before making changes.</p> : null}
      {!setup.data ? (
        <EmptyState title="Loading call setup" body="The submission policy is being loaded." />
      ) : (
        <div className="space-y-5">
          {/* Header Action Bar */}
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-4 shadow-xs">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] text-[var(--text-primary)]">
                <Sliders className="size-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-[var(--text-primary)]">Abstract Call Settings</h2>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[10px] font-extrabold tracking-wide uppercase ${
                      status === "OPEN"
                        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                        : status === "CLOSED"
                        ? "bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20"
                        : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                    }`}
                  >
                    {status}
                  </span>
                  {isDirty && (
                    <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-bold text-blue-600 dark:text-blue-400 border border-blue-500/20">
                      Unsaved changes
                    </span>
                  )}
                </div>
                <p className="text-xs text-[var(--text-secondary)]">
                  Configure submission windows, co-author restrictions, topic taxonomies, and reviewer workflows.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              {isDirty && (
                <button
                  type="button"
                  onClick={() => {
                    if (setup.data) {
                      const call = setup.data;
                      const callRules = (call.author_rules || {}) as Record<string, any>;
                      const callDisclosureRules = (call.disclosure_rules || {}) as Record<string, any>;
                      const callAttachmentRules = (call.attachment_rules || {}) as Record<string, any>;
                      setStatus(call.status || "DRAFT");
                      setOpensAt(toDateTimeLocalString(call.opens_at || ""));
                      setClosesAt(toDateTimeLocalString(call.closes_at || ""));
                      setRevisionDeadline(toDateTimeLocalString(call.revision_deadline || ""));
                      setBlindReview(Boolean(call.blind_review_enabled));
                      setPresenterRequired(callRules.coauthor_rules?.presenter_required ?? true);
                      setDisclosureRequired(callDisclosureRules.required ?? callRules.disclosure_required ?? false);
                      setAttachmentRequired(callAttachmentRules.required ?? false);
                      setCategories(callRules.categories || []);
                      setTopics(call.topics || []);
                      setSessionFormats(callRules.session_formats || call.abstract_types || []);
                      setMaxCoauthors(callRules.coauthor_rules?.max ?? 5);
                      setMinWords(call.min_words || 50);
                      setMaxWords(call.max_words || 500);
                      setAllowedExtensions(callAttachmentRules.allowed_extensions || ["pdf"]);
                      setMaxFileSizeMb(callAttachmentRules.max_size_mb || 25);
                      setRulesJson(JSON.stringify(call.author_rules || {}, null, 2));
                      setIsDirty(false);
                      toast.info("Changes discarded");
                    }
                  }}
                  className="flex items-center gap-1.5 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3 py-2 text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                >
                  <RotateCcw className="size-3.5" />
                  Discard
                </button>
              )}
              <button
                type="button"
                onClick={handleSave}
                disabled={save.isPending}
                className="flex items-center gap-2 rounded-lg bg-[var(--pri)] px-4 py-2 text-xs font-bold text-[var(--primary-contrast)] hover:opacity-90 shadow-sm transition-all cursor-pointer disabled:opacity-50"
              >
                <Save className="size-3.5" />
                {save.isPending ? "Saving..." : "Save Settings"}
              </button>
            </div>
          </div>

          {/* Tab Navigation */}
          <div className="flex border-b border-[var(--border-default)] gap-1 overflow-x-auto scrollbar-none">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
                    isActive
                      ? "border-[var(--pri)] text-[var(--pri)]"
                      : "border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-default)]"
                  }`}
                >
                  <Icon className="size-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Tab Content & Ledger Layout */}
          <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
            <div className="space-y-5">
              {/* TAB 1: General & Schedule */}
              {activeTab === "general" && (
                <div className="space-y-5 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-5 shadow-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-bold text-[var(--text-primary)]">Call Lifecycle & Deadlines</h3>
                      <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                        Set when submissions open, close, and when revisions are due.
                      </p>
                    </div>
                    <span className="flex items-center gap-1.5 rounded-full border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-2.5 py-1 text-[11px] font-bold text-[var(--text-secondary)]">
                      <Clock className="size-3 text-[var(--pri)]" />
                      Timezone: {getFallbackTimezone()} ({getTimezoneAbbrev(getFallbackTimezone())})
                    </span>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <label htmlFor="call-status" className="block text-xs font-bold text-[var(--text-secondary)]">
                        Submission Call Status
                      </label>
                      <select
                        id="call-status"
                        value={status}
                        onChange={(e) => {
                          setStatus(e.target.value as any);
                          setIsDirty(true);
                        }}
                        className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3 py-2 text-xs font-bold text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none"
                      >
                        <option value="DRAFT">DRAFT (Hidden from authors)</option>
                        <option value="OPEN">OPEN (Accepting submissions)</option>
                        <option value="CLOSED">CLOSED (Review in progress)</option>
                        <option value="PUBLISHED">PUBLISHED (Decisions announced)</option>
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label htmlFor="call-opens" className="block text-xs font-bold text-[var(--text-secondary)]">
                        Call Opens At
                      </label>
                      <input
                        id="call-opens"
                        type="datetime-local"
                        value={opensAt}
                        onChange={(e) => {
                          setOpensAt(e.target.value);
                          setIsDirty(true);
                        }}
                        className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3 py-2 text-xs text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none"
                      />
                      {opensAt && (
                        <p className="flex items-center gap-1.5 text-[11px] font-medium text-[var(--text-secondary)]">
                          <Clock className="size-3 text-[var(--pri)]" />
                          <span>{formatDateTimeInTZ(fromDateTimeLocalString(opensAt))} ({getTimezoneAbbrev(getFallbackTimezone())})</span>
                        </p>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <label htmlFor="call-closes" className="block text-xs font-bold text-[var(--text-secondary)]">
                        Call Closes At (Submission Deadline)
                      </label>
                      <input
                        id="call-closes"
                        type="datetime-local"
                        value={closesAt}
                        onChange={(e) => {
                          setClosesAt(e.target.value);
                          setIsDirty(true);
                        }}
                        className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3 py-2 text-xs text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none"
                      />
                      {closesAt && (
                        <p className="flex items-center gap-1.5 text-[11px] font-medium text-[var(--text-secondary)]">
                          <Clock className="size-3 text-[var(--pri)]" />
                          <span>{formatDateTimeInTZ(fromDateTimeLocalString(closesAt))} ({getTimezoneAbbrev(getFallbackTimezone())})</span>
                        </p>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <label htmlFor="call-revision" className="block text-xs font-bold text-[var(--text-secondary)]">
                        Revision Deadline (Post-review updates)
                      </label>
                      <input
                        id="call-revision"
                        type="datetime-local"
                        value={revisionDeadline}
                        onChange={(e) => {
                          setRevisionDeadline(e.target.value);
                          setIsDirty(true);
                        }}
                        className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3 py-2 text-xs text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none"
                      />
                      {revisionDeadline && (
                        <p className="flex items-center gap-1.5 text-[11px] font-medium text-[var(--text-secondary)]">
                          <Clock className="size-3 text-[var(--pri)]" />
                          <span>{formatDateTimeInTZ(fromDateTimeLocalString(revisionDeadline))} ({getTimezoneAbbrev(getFallbackTimezone())})</span>
                        </p>
                      )}
                    </div>
                  </div>

                  <hr className="border-[var(--border-subtle)]" />

                  <div>
                    <h3 className="text-sm font-bold text-[var(--text-primary)]">Submission Policy Flags</h3>
                    <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                      Enforce author verification, disclosures, and reviewer blinding.
                    </p>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="flex items-start gap-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] p-3 cursor-pointer hover:bg-[var(--bg-surface-hover)] transition-colors">
                      <input
                        type="checkbox"
                        checked={blindReview}
                        onChange={(e) => {
                          setBlindReview(e.target.checked);
                          setIsDirty(true);
                        }}
                        className="mt-0.5 size-4 rounded text-[var(--pri)] focus:ring-[var(--pri)]"
                      />
                      <div className="space-y-0.5">
                        <span className="text-xs font-bold text-[var(--text-primary)]">Blinded Review Mode</span>
                        <p className="text-[11px] text-[var(--text-secondary)]">
                          Hide author names, emails, and affiliations from reviewers during evaluation.
                        </p>
                      </div>
                    </label>

                    <label className="flex items-start gap-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] p-3 cursor-pointer hover:bg-[var(--bg-surface-hover)] transition-colors">
                      <input
                        type="checkbox"
                        checked={presenterRequired}
                        onChange={(e) => {
                          setPresenterRequired(e.target.checked);
                          setIsDirty(true);
                        }}
                        className="mt-0.5 size-4 rounded text-[var(--pri)] focus:ring-[var(--pri)]"
                      />
                      <div className="space-y-0.5">
                        <span className="text-xs font-bold text-[var(--text-primary)]">Presenter Designation Required</span>
                        <p className="text-[11px] text-[var(--text-secondary)]">
                          At least one author must be designated as the presenting author.
                        </p>
                      </div>
                    </label>

                    <label className="flex items-start gap-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] p-3 cursor-pointer hover:bg-[var(--bg-surface-hover)] transition-colors">
                      <input
                        type="checkbox"
                        checked={disclosureRequired}
                        onChange={(e) => {
                          setDisclosureRequired(e.target.checked);
                          setIsDirty(true);
                        }}
                        className="mt-0.5 size-4 rounded text-[var(--pri)] focus:ring-[var(--pri)]"
                      />
                      <div className="space-y-0.5">
                        <span className="text-xs font-bold text-[var(--text-primary)]">Conflict of Interest Disclosure</span>
                        <p className="text-[11px] text-[var(--text-secondary)]">
                          Authors must explicitly confirm financial and corporate disclosures.
                        </p>
                      </div>
                    </label>

                    <label className="flex items-start gap-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] p-3 cursor-pointer hover:bg-[var(--bg-surface-hover)] transition-colors">
                      <input
                        type="checkbox"
                        checked={attachmentRequired}
                        onChange={(e) => {
                          setAttachmentRequired(e.target.checked);
                          setIsDirty(true);
                        }}
                        className="mt-0.5 size-4 rounded text-[var(--pri)] focus:ring-[var(--pri)]"
                      />
                      <div className="space-y-0.5">
                        <span className="text-xs font-bold text-[var(--text-primary)]">Supporting File Required</span>
                        <p className="text-[11px] text-[var(--text-secondary)]">
                          Make manuscript, extended abstract, or PDF upload mandatory.
                        </p>
                      </div>
                    </label>
                  </div>
                </div>
              )}

              {/* TAB 2: Categories & Formats */}
              {activeTab === "categories" && (
                <div className="space-y-5 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-5 shadow-xs">
                  {/* Abstract Categories */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-sm font-bold text-[var(--text-primary)]">Submission Categories</h3>
                        <p className="text-xs text-[var(--text-secondary)]">
                          Primary classification of submissions (e.g. Clinical Trial, Original Research, Case Study).
                        </p>
                      </div>
                      <span className="text-xs font-bold text-[var(--text-tertiary)]">{categories.length} defined</span>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {categories.map((cat) => (
                        <span
                          key={cat}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3 py-1.5 text-xs font-bold text-[var(--text-primary)]"
                        >
                          {cat}
                          <button
                            type="button"
                            onClick={() => handleRemoveCategory(cat)}
                            className="rounded-full p-0.5 text-[var(--text-tertiary)] hover:bg-rose-500/20 hover:text-rose-600 transition-colors"
                          >
                            <X className="size-3" />
                          </button>
                        </span>
                      ))}
                    </div>

                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newCategory}
                        onChange={(e) => setNewCategory(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddCategory())}
                        placeholder="Add new category (e.g. Translational Research)"
                        className="flex-1 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3 py-2 text-xs text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={handleAddCategory}
                        className="flex items-center gap-1 rounded-lg bg-[var(--pri)] px-3 py-2 text-xs font-bold text-[var(--primary-contrast)] hover:opacity-90 transition-all cursor-pointer"
                      >
                        <Plus className="size-3.5" />
                        Add
                      </button>
                    </div>
                  </div>

                  <hr className="border-[var(--border-subtle)]" />

                  {/* Topics / Tracks */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-sm font-bold text-[var(--text-primary)]">Event Topics & Scientific Tracks</h3>
                        <p className="text-xs text-[var(--text-secondary)]">
                          Thematic tags used for reviewer matching and session scheduling.
                        </p>
                      </div>
                      <span className="text-xs font-bold text-[var(--text-tertiary)]">{topics.length} defined</span>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {topics.map((t) => (
                        <span
                          key={t}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-blue-500/20 bg-blue-500/10 px-3 py-1.5 text-xs font-bold text-blue-700 dark:text-blue-300"
                        >
                          {t}
                          <button
                            type="button"
                            onClick={() => handleRemoveTopic(t)}
                            className="rounded-full p-0.5 hover:bg-blue-500/20 transition-colors"
                          >
                            <X className="size-3" />
                          </button>
                        </span>
                      ))}
                    </div>

                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newTopic}
                        onChange={(e) => setNewTopic(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddTopic())}
                        placeholder="Add topic (e.g. Immuno-oncology, Digital Health)"
                        className="flex-1 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3 py-2 text-xs text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={handleAddTopic}
                        className="flex items-center gap-1 rounded-lg bg-[var(--pri)] px-3 py-2 text-xs font-bold text-[var(--primary-contrast)] hover:opacity-90 transition-all cursor-pointer"
                      >
                        <Plus className="size-3.5" />
                        Add
                      </button>
                    </div>
                  </div>

                  <hr className="border-[var(--border-subtle)]" />

                  {/* Session Formats */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-sm font-bold text-[var(--text-primary)]">Allowed Presentation Formats</h3>
                        <p className="text-xs text-[var(--text-secondary)]">
                          Format options authors can request (e.g. Oral Presentation, Poster, Workshop).
                        </p>
                      </div>
                      <span className="text-xs font-bold text-[var(--text-tertiary)]">{sessionFormats.length} defined</span>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {sessionFormats.map((f) => (
                        <span
                          key={f}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-purple-500/20 bg-purple-500/10 px-3 py-1.5 text-xs font-bold text-purple-700 dark:text-purple-300 uppercase tracking-wide"
                        >
                          {f}
                          <button
                            type="button"
                            onClick={() => handleRemoveFormat(f)}
                            className="rounded-full p-0.5 hover:bg-purple-500/20 transition-colors"
                          >
                            <X className="size-3" />
                          </button>
                        </span>
                      ))}
                    </div>

                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newFormat}
                        onChange={(e) => setNewFormat(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddFormat())}
                        placeholder="Add session format (e.g. LIGHTNING_TALK, PANEL)"
                        className="flex-1 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3 py-2 text-xs text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={handleAddFormat}
                        className="flex items-center gap-1 rounded-lg bg-[var(--pri)] px-3 py-2 text-xs font-bold text-[var(--primary-contrast)] hover:opacity-90 transition-all cursor-pointer"
                      >
                        <Plus className="size-3.5" />
                        Add
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 3: Limits & File Rules */}
              {activeTab === "limits" && (
                <div className="space-y-5 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-5 shadow-xs">
                  <div>
                    <h3 className="text-sm font-bold text-[var(--text-primary)]">Co-Author Restrictions</h3>
                    <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                      Control how many additional contributors can be attached to a submission.
                    </p>
                  </div>

                  <div className="max-w-md space-y-1.5">
                    <label htmlFor="coauthor-dropdown" className="block text-xs font-bold text-[var(--text-secondary)]">
                      Maximum Co-Authors Allowed
                    </label>
                    <select
                      id="coauthor-dropdown"
                      value={maxCoauthors}
                      onChange={(e) => {
                        setMaxCoauthors(Number(e.target.value));
                        setIsDirty(true);
                      }}
                      className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3 py-2.5 text-xs font-bold text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none"
                    >
                      <option value={0}>Not allowed (Sole author only)</option>
                      <option value={1}>Allowed: 1 co-author</option>
                      <option value={2}>Allowed: 2 co-authors</option>
                      <option value={3}>Allowed: 3 co-authors</option>
                      <option value={4}>Allowed: 4 co-authors</option>
                      <option value={5}>Allowed: 5 co-authors</option>
                      <option value={6}>Allowed: 6 co-authors</option>
                      <option value={7}>Allowed: 7 co-authors</option>
                      <option value={8}>Allowed: 8 co-authors</option>
                      <option value={9}>Allowed: 9 co-authors</option>
                      <option value={10}>Allowed: 10 co-authors</option>
                    </select>
                    <p className="text-[11px] text-[var(--text-tertiary)]">
                      {maxCoauthors === 0
                        ? "Authors cannot invite any collaborators."
                        : `Authors may invite up to ${maxCoauthors} co-authors.`}
                    </p>
                  </div>

                  <hr className="border-[var(--border-subtle)]" />

                  <div>
                    <h3 className="text-sm font-bold text-[var(--text-primary)]">Word Count Limits</h3>
                    <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                      Set the minimum and maximum boundaries for the abstract body text.
                    </p>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <label htmlFor="word-min" className="block text-xs font-bold text-[var(--text-secondary)]">
                        Minimum Words
                      </label>
                      <input
                        id="word-min"
                        type="number"
                        min={0}
                        max={5000}
                        value={minWords}
                        onChange={(e) => {
                          setMinWords(Number(e.target.value));
                          setIsDirty(true);
                        }}
                        className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3 py-2 text-xs font-bold text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label htmlFor="word-max" className="block text-xs font-bold text-[var(--text-secondary)]">
                        Maximum Words
                      </label>
                      <input
                        id="word-max"
                        type="number"
                        min={10}
                        max={10000}
                        value={maxWords}
                        onChange={(e) => {
                          setMaxWords(Number(e.target.value));
                          setIsDirty(true);
                        }}
                        className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3 py-2 text-xs font-bold text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none"
                      />
                    </div>
                  </div>

                  <hr className="border-[var(--border-subtle)]" />

                  <div>
                    <h3 className="text-sm font-bold text-[var(--text-primary)]">Allowed Attachment Formats & Size</h3>
                    <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                      Select which file types can be uploaded as supporting documents or extended abstracts.
                    </p>
                  </div>

                  <div className="space-y-3">
                    <div className="flex flex-wrap gap-2">
                      {ALLOWED_FILE_EXTENSIONS.map((item) => {
                        const isSelected = allowedExtensions.includes(item.ext);
                        return (
                          <button
                            key={item.ext}
                            type="button"
                            onClick={() => toggleAllowedExtension(item.ext)}
                            className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold transition-all cursor-pointer ${
                              isSelected
                                ? "border-[var(--pri)] bg-[var(--pri)] text-[var(--primary-contrast)] shadow-xs"
                                : "border-[var(--border-default)] bg-[var(--bg-surface-2)] text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)]"
                            }`}
                          >
                            <FileUp className="size-3.5" />
                            {item.label}
                          </button>
                        );
                      })}
                    </div>

                    <div className="max-w-xs space-y-1.5 pt-2">
                      <label htmlFor="max-file-size" className="block text-xs font-bold text-[var(--text-secondary)]">
                        Maximum File Size (MB)
                      </label>
                      <input
                        id="max-file-size"
                        type="number"
                        min={1}
                        max={100}
                        value={maxFileSizeMb}
                        onChange={(e) => {
                          setMaxFileSizeMb(Number(e.target.value));
                          setIsDirty(true);
                        }}
                        className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3 py-2 text-xs font-bold text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 4: Evaluation Plan */}
              {activeTab === "evaluation" && (
                <div className="space-y-5 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-5 shadow-xs">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-bold text-[var(--text-primary)]">Evaluation Plan Linkage</h3>
                      <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                        Select which evaluation plan and scoring methodology governs abstracts submitted to this call.
                      </p>
                    </div>
                    <Link
                      href={`/events/${eventId}/abstracts/evaluation`}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3 py-1.5 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] transition-colors"
                    >
                      <ExternalLink className="size-3.5" />
                      Manage Evaluation Plans
                    </Link>
                  </div>

                  {/* Dropdown Only */}
                  <div className="space-y-2">
                    <label htmlFor="evaluation-plan-select" className="block text-xs font-bold text-[var(--text-secondary)]">
                      Active Evaluation Plan
                    </label>
                    <select
                      id="evaluation-plan-select"
                      value={selectedPlanId}
                      onChange={(e) => {
                        setSelectedPlanId(e.target.value);
                        setIsDirty(true);
                      }}
                      className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3 py-2.5 text-xs font-bold text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none"
                    >
                      <option value="">-- Select an Evaluation Plan --</option>
                      {(evaluationPlans.data || [])
                        .filter((plan) => plan.source_type === "ABSTRACT")
                        .map((plan) => (
                          <option key={plan.id} value={plan.id}>
                            {plan.name} ({plan.rubric?.length || 0} criteria · {plan.reviewer_ids?.length || 0} reviewers)
                          </option>
                        ))}
                    </select>
                  </div>

                  {/* Selected Plan Details Card */}
                  {selectedPlan ? (
                    <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface-2)] p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <ClipboardCheck className="size-4 text-[var(--pri)]" />
                          <span className="text-xs font-extrabold text-[var(--text-primary)]">{selectedPlan.name}</span>
                        </div>
                        <span className="rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 px-2 py-0.5 text-[10px] font-bold">
                          Ready for Review
                        </span>
                      </div>

                      <div className="grid gap-2 text-xs sm:grid-cols-3">
                        <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-2.5">
                          <p className="text-[10px] uppercase font-bold text-[var(--text-tertiary)]">Evaluation Mode</p>
                          <p className="mt-0.5 font-bold text-[var(--text-primary)]">
                            {selectedPlan.anonymous_review ? "Anonymous Stars Rating" : "Standard Rating"}
                          </p>
                        </div>
                        <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-2.5">
                          <p className="text-[10px] uppercase font-bold text-[var(--text-tertiary)]">Criteria</p>
                          <p className="mt-0.5 font-bold text-[var(--text-primary)]">
                            {selectedPlan.rubric?.length || 0} weighted criteria
                          </p>
                        </div>
                        <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-2.5">
                          <p className="text-[10px] uppercase font-bold text-[var(--text-tertiary)]">Assigned Reviewers</p>
                          <p className="mt-0.5 font-bold text-[var(--text-primary)]">
                            {selectedPlan.reviewer_ids?.length || 0} evaluators
                          </p>
                        </div>
                      </div>

                      <div className="space-y-1.5 pt-1">
                        <p className="text-[11px] font-bold text-[var(--text-secondary)]">Rubric Breakdown:</p>
                        <div className="flex flex-wrap gap-1.5">
                          {selectedPlan.rubric?.map((r: any, idx: number) => (
                            <span
                              key={idx}
                              className="rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)] px-2 py-0.5 text-[11px] text-[var(--text-secondary)]"
                            >
                              {r.label || r.key} ({r.weight || 0}%)
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed border-[var(--border-default)] p-6 text-center">
                      <p className="text-xs text-[var(--text-secondary)]">No evaluation plan currently selected.</p>
                      <Link
                        href={`/events/${eventId}/abstracts/evaluation`}
                        className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-[var(--pri)] hover:underline"
                      >
                        Create an Evaluation Plan
                      </Link>
                    </div>
                  )}

                  <hr className="border-[var(--border-subtle)]" />

                  {/* Apply workload to submissions */}
                  <div>
                    <h4 className="text-xs font-bold text-[var(--text-primary)]">Distribute Review Workload</h4>
                    <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                      Allocate reviewers from the selected plan across submitted abstracts.
                    </p>

                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-[var(--text-secondary)]">Reviews per abstract:</span>
                        <input
                          type="number"
                          min={1}
                          max={10}
                          value={targetReviewsPerSubmission}
                          onChange={(e) => setTargetReviewsPerSubmission(Number(e.target.value))}
                          className="w-20 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-2.5 py-1.5 text-xs font-bold text-[var(--text-primary)] focus:outline-none"
                        />
                      </div>

                      <button
                        type="button"
                        disabled={!selectedEvaluationPlan || applyEvaluationPlan.isPending}
                        onClick={() => {
                          if (!selectedEvaluationPlan) {
                            toast.error("Load the selected evaluation plan first");
                            return;
                          }
                          applyEvaluationPlan.mutate(
                            {
                              planId: selectedPlanId,
                              version: selectedEvaluationPlan.version,
                              assignmentsPerSubmission: targetReviewsPerSubmission,
                            },
                            {
                              onSuccess: (result) =>
                                toast.success(`${result.assignments_created} assignments applied in this batch.${result.submissions_unfilled ? ` ${result.submissions_unfilled} submissions still need reviewer capacity.` : ""}${result.has_next ? " More submissions remain." : " Batch processing complete."}`),
                              onError: (error: unknown) => toast.error(error instanceof Error ? error.message : "This batch was not applied."),
                            }
                          );
                        }}
                        className="flex items-center gap-1.5 rounded-lg bg-[var(--pri)] px-3.5 py-2 text-xs font-bold text-[var(--primary-contrast)] hover:opacity-90 shadow-sm transition-all cursor-pointer disabled:opacity-40"
                      >
                        <Users className="size-3.5" />
                        {applyEvaluationPlan.isPending ? "Assigning..." : moreEvaluationBatches ? "Continue next batch" : "Apply plan (up to 100 submissions)"}
                      </button>
                      <ScopedCommandFeedback failure={applyEvaluationPlan.commandFailure} retryAt={applyEvaluationPlan.retryAt} />
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 5: Advanced (Policy JSON) */}
              {activeTab === "advanced" && (
                <div className="space-y-4 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-5 shadow-xs">
                  <div>
                    <h3 className="text-sm font-bold text-[var(--text-primary)]">Author Rules JSON Policy</h3>
                    <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                      Direct low-level policy configuration stored under <code className="text-[11px] font-mono">author_rules</code>.
                    </p>
                  </div>

                  <textarea
                    rows={14}
                    value={rulesJson}
                    onChange={(e) => {
                      setRulesJson(e.target.value);
                      setIsDirty(true);
                    }}
                    className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] p-3 font-mono text-xs text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none"
                  />
                  <p className="text-[11px] text-[var(--text-tertiary)]">
                    Modifications made here will be merged when saving call setup.
                  </p>
                </div>
              )}
            </div>

            {/* Sidebar Ledger Preview */}
            <div>
              <LedgerPreview />
            </div>
          </div>
        </div>
      )}
    </AbstractShell>
  );
}

export default AbstractSetupView;
