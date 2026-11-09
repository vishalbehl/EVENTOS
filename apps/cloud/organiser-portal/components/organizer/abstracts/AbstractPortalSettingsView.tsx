"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import {
  Globe,
  Sliders,
  CheckCircle2,
  AlertCircle,
  Clock,
  ShieldCheck,
  Eye,
  EyeOff,
  Mail,
  HelpCircle,
  Save,
  RotateCcw,
  FileText,
  UserCheck,
  Lock,
  MessageSquare,
  Users,
  Send,
  FileUp,
  FileCode,
  Info,
} from "lucide-react";
import {
  useAbstractSetup,
  useSaveAbstractSetup,
} from "@/hooks/useAbstractWorkflow";
import { AbstractShell, EmptyState } from "./AbstractShell";
import { ScopedEventEditor } from "@/components/organizer/events/ScopedEventEditor";
import { ScopedCommandFeedback } from "@/components/organizer/events/ScopedCommandFeedback";

type PortalTab = "submission" | "review";

export function AbstractPortalSettingsView() {
  const { eventId } = useParams<{ eventId: string }>();
  return <ScopedEventEditor eventId={eventId}><PortalSettingsEditor /></ScopedEventEditor>;
}

function PortalSettingsEditor() {
  const { eventId } = useParams<{ eventId: string }>();
  const setup = useAbstractSetup(eventId);
  const save = useSaveAbstractSetup(eventId);
  const [loadedCall, setLoadedCall] = useState<typeof setup.data>(undefined);

  const [activeTab, setActiveTab] = useState<PortalTab>("submission");
  const [isDirty, setIsDirty] = useState(false);

  // ─── Submission Portal State ──────────────────────────────────────────────
  const [accessMode, setAccessMode] = useState<"OPEN_PUBLIC" | "INVITED_ONLY">("OPEN_PUBLIC");
  const [showCountdownBanner, setShowCountdownBanner] = useState(true);
  const [showTaxonomyGuide, setShowTaxonomyGuide] = useState(true);
  const [submissionGuidelines, setSubmissionGuidelines] = useState("");
  const [allowAuthorEdits, setAllowAuthorEdits] = useState(true);
  const [allowAuthorWithdrawal, setAllowAuthorWithdrawal] = useState(true);
  const [requireCoauthorVerification, setRequireCoauthorVerification] = useState(false);
  const [feedbackReleasePolicy, setFeedbackReleasePolicy] = useState<
    "STATUS_ONLY" | "SCORES_ONLY" | "ANONYMIZED_COMMENTS" | "FULL_RUBRIC"
  >("ANONYMIZED_COMMENTS");
  const [sendConfirmationEmail, setSendConfirmationEmail] = useState(true);
  const [customSuccessMessage, setCustomSuccessMessage] = useState("");
  const [supportEmail, setSupportEmail] = useState("");
  const [supportPhone, setSupportPhone] = useState("");

  // ─── Review Portal State ──────────────────────────────────────────────────
  const [blindReviewEnabled, setBlindReviewEnabled] = useState(false);
  const [redactAuthorNames, setRedactAuthorNames] = useState(true);
  const [redactAffiliations, setRedactAffiliations] = useState(true);
  const [redactCoauthors, setRedactCoauthors] = useState(true);
  const [peerVisibilityMode, setPeerVisibilityMode] = useState<
    "ISOLATED" | "AFTER_SUBMIT" | "TRANSPARENT"
  >("AFTER_SUBMIT");
  const [showAggregateScores, setShowAggregateScores] = useState(true);
  const [allowReviewEditing, setAllowReviewEditing] = useState(true);
  const [mandatoryCommentsPolicy, setMandatoryCommentsPolicy] = useState<
    "OPTIONAL" | "LOW_SCORES_ONLY" | "MANDATORY_ALL"
  >("LOW_SCORES_ONLY");
  const [enforceCoiDeclaration, setEnforceCoiDeclaration] = useState(true);
  const [autoWarnInstitutionalConflict, setAutoWarnInstitutionalConflict] = useState(true);
  const [inBrowserPdfViewer, setInBrowserPdfViewer] = useState(true);
  const [remind72h, setRemind72h] = useState(true);
  const [remind48h, setRemind48h] = useState(true);
  const [remind24h, setRemind24h] = useState(true);

  // Sync initial backend data
  useEffect(() => {
    if (!setup.data || isDirty) return;
    const call = setup.data;
    setLoadedCall(call);
    const authorRules = (call.author_rules || {}) as Record<string, any>;
    const portalSettings = (call.portal_settings || authorRules.portal_settings || {}) as Record<string, any>;
    const subSettings = (portalSettings.submission_portal || {}) as Record<string, any>;
    const revSettings = (portalSettings.review_portal || {}) as Record<string, any>;
    const emailTriggers = (call.email_triggers || {}) as Record<string, any>;

    // Submission portal
    setAccessMode(subSettings.access_mode || "OPEN_PUBLIC");
    setShowCountdownBanner(subSettings.show_countdown_banner ?? true);
    setShowTaxonomyGuide(subSettings.show_taxonomy_guide ?? true);
    setSubmissionGuidelines(
      subSettings.guidelines_text ??
        "Please ensure your abstract adheres to the structured format: Background, Methods, Results, and Conclusion. All authors must consent to submission."
    );
    setAllowAuthorEdits(subSettings.allow_author_edits ?? true);
    setAllowAuthorWithdrawal(subSettings.allow_author_withdrawal ?? true);
    setRequireCoauthorVerification(subSettings.require_coauthor_verification ?? false);
    setFeedbackReleasePolicy(subSettings.feedback_release_policy || "ANONYMIZED_COMMENTS");
    setSendConfirmationEmail(emailTriggers.submission_receipt ?? true);
    setCustomSuccessMessage(
      subSettings.success_message ??
        "Your abstract has been registered for peer review. Decisions will be communicated via email."
    );
    setSupportEmail(subSettings.support_email || "");
    setSupportPhone(subSettings.support_phone || "");

    // Review portal
    setBlindReviewEnabled(Boolean(call.blind_review_enabled));
    setRedactAuthorNames(revSettings.redact_author_names ?? true);
    setRedactAffiliations(revSettings.redact_affiliations ?? true);
    setRedactCoauthors(revSettings.redact_coauthors ?? true);
    setPeerVisibilityMode(revSettings.peer_visibility_mode || "AFTER_SUBMIT");
    setShowAggregateScores(revSettings.show_aggregate_scores ?? true);
    setAllowReviewEditing(revSettings.allow_review_editing ?? true);
    setMandatoryCommentsPolicy(revSettings.mandatory_comments_policy || "LOW_SCORES_ONLY");
    setEnforceCoiDeclaration(revSettings.enforce_coi_declaration ?? true);
    setAutoWarnInstitutionalConflict(revSettings.auto_warn_institutional_conflict ?? true);
    setInBrowserPdfViewer(revSettings.in_browser_pdf_viewer ?? true);

    const reminders = revSettings.reminders || {};
    setRemind72h(reminders.remind_72h ?? true);
    setRemind48h(reminders.remind_48h ?? true);
    setRemind24h(reminders.remind_24h ?? true);

    setIsDirty(false);
  }, [setup.data, isDirty]);

  const handleSave = () => {
    if (!loadedCall) return;
    const call = loadedCall;
    const authorRules = (call.author_rules || {}) as Record<string, any>;
    const existingPortalSettings = (authorRules.portal_settings || {}) as Record<string, any>;
    const emailTriggers = (call.email_triggers || {}) as Record<string, any>;

    const updatedPortalSettings = {
      ...existingPortalSettings,
      submission_portal: {
        access_mode: accessMode,
        show_countdown_banner: showCountdownBanner,
        show_taxonomy_guide: showTaxonomyGuide,
        guidelines_text: submissionGuidelines,
        allow_author_edits: allowAuthorEdits,
        allow_author_withdrawal: allowAuthorWithdrawal,
        require_coauthor_verification: requireCoauthorVerification,
        feedback_release_policy: feedbackReleasePolicy,
        success_message: customSuccessMessage,
        support_email: supportEmail,
        support_phone: supportPhone,
      },
      review_portal: {
        redact_author_names: redactAuthorNames,
        redact_affiliations: redactAffiliations,
        redact_coauthors: redactCoauthors,
        peer_visibility_mode: peerVisibilityMode,
        show_aggregate_scores: showAggregateScores,
        allow_review_editing: allowReviewEditing,
        mandatory_comments_policy: mandatoryCommentsPolicy,
        enforce_coi_declaration: enforceCoiDeclaration,
        auto_warn_institutional_conflict: autoWarnInstitutionalConflict,
        in_browser_pdf_viewer: inBrowserPdfViewer,
        reminders: {
          remind_72h: remind72h,
          remind_48h: remind48h,
          remind_24h: remind24h,
        },
      },
    };

    const payload = {
      ...call,
      blind_review_enabled: blindReviewEnabled,
      portal_settings: updatedPortalSettings,
      email_triggers: {
        ...emailTriggers,
        submission_receipt: sendConfirmationEmail,
      },
      author_rules: {
        ...authorRules,
        portal_settings: updatedPortalSettings,
      },
    };

    save.mutate(payload, {
      onSuccess: () => {
        toast.success("Portal settings saved successfully");
        setIsDirty(false);
      },
      onError: error => {
        toast.error(error.message || "Failed to save portal settings");
      },
    });
  };

  return (
    <AbstractShell view="portal-settings">
      <ScopedCommandFeedback failure={save.commandFailure} retryAt={save.retryAt} />
      {setup.isError ? <p role="alert">Portal settings are unavailable. Reload before making changes.</p> : null}
      {!setup.data ? (
        <EmptyState title="Loading portal settings" body="Retrieving call configuration from server." />
      ) : (
        <div className="space-y-6">
          {/* Header Action Bar */}
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-4 shadow-xs">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] text-[var(--pri)]">
                <Globe className="size-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-[var(--text-primary)]">Portal Operational Settings</h2>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[10px] font-extrabold tracking-wide uppercase ${
                      setup.data.status === "OPEN"
                        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                        : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                    }`}
                  >
                    Call {setup.data.status}
                  </span>
                  {isDirty && (
                    <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-bold text-blue-600 dark:text-blue-400 border border-blue-500/20">
                      Unsaved changes
                    </span>
                  )}
                </div>
                <p className="text-xs text-[var(--text-secondary)]">
                  Control what authors and reviewers see, how peer review operates, and why specific disclosures are enforced.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              {isDirty && (
                <button
                  type="button"
                  onClick={() => {
                    // Force state resync from setup.data
                    const call = setup.data;
                    if (call) {
                      const authorRules = (call.author_rules || {}) as Record<string, any>;
                      const portalSettings = (authorRules.portal_settings || {}) as Record<string, any>;
                      const subSettings = (portalSettings.submission_portal || {}) as Record<string, any>;
                      const revSettings = (portalSettings.review_portal || {}) as Record<string, any>;
                      setAccessMode(subSettings.access_mode || "OPEN_PUBLIC");
                      setBlindReviewEnabled(Boolean(call.blind_review_enabled));
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
                {save.isPending ? "Saving..." : "Save Portal Settings"}
              </button>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex border-b border-[var(--border-default)] gap-1">
            <button
              type="button"
              onClick={() => setActiveTab("submission")}
              className={`flex items-center gap-2 border-b-2 px-5 py-3 text-xs font-bold transition-colors cursor-pointer ${
                activeTab === "submission"
                  ? "border-[var(--pri)] text-[var(--pri)]"
                  : "border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              <Send className="size-4" />
              Submission Portal (Author-Facing)
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("review")}
              className={`flex items-center gap-2 border-b-2 px-5 py-3 text-xs font-bold transition-colors cursor-pointer ${
                activeTab === "review"
                  ? "border-[var(--pri)] text-[var(--pri)]"
                  : "border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              <ShieldCheck className="size-4" />
              Review Portal (Committee-Facing)
            </button>
          </div>

          {/* ════════════════════════════════════════════════════════════════════
              TAB 1: SUBMISSION PORTAL SETTINGS
          ════════════════════════════════════════════════════════════════════ */}
          {activeTab === "submission" && (
            <div className="space-y-6">
              {/* Section 1: Access Controls & Guidance */}
              <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-5 shadow-xs space-y-5">
                <div>
                  <h3 className="text-sm font-bold text-[var(--text-primary)]">Intake Access & Submission Guidance</h3>
                  <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                    Control who can access the portal and what guidance is communicated prior to submission.
                  </p>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  {/* Access Mode */}
                  <div className="space-y-1.5 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] p-4">
                    <div className="flex items-center justify-between">
                      <label htmlFor="intake-access-mode" className="text-xs font-bold text-[var(--text-primary)]">
                        Intake Access Mode
                      </label>
                      <span className="rounded bg-[var(--bg-surface)] px-2 py-0.5 text-[10px] font-bold text-[var(--text-secondary)] border border-[var(--border-subtle)]">
                        Access Gate
                      </span>
                    </div>
                    <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                      <strong>Why:</strong> Open calls maximize international reach, whereas invited-only mode restricts intake to keynote speakers and invited symposium authors.
                    </p>
                    <select
                      id="intake-access-mode"
                      value={accessMode}
                      onChange={(e) => {
                        setAccessMode(e.target.value as any);
                        setIsDirty(true);
                      }}
                      className="mt-2 w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 text-xs font-bold text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none"
                    >
                      <option value="OPEN_PUBLIC">Open Public Call (Anyone with link can submit)</option>
                      <option value="INVITED_ONLY">Invited Only (Restricted to pre-registered tokens/emails)</option>
                    </select>
                  </div>

                  {/* Countdown Banner */}
                  <div className="space-y-2 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-[var(--text-primary)]">Deadline Countdown Banner</span>
                      <input
                        type="checkbox"
                        checked={showCountdownBanner}
                        onChange={(e) => {
                          setShowCountdownBanner(e.target.checked);
                          setIsDirty(true);
                        }}
                        className="size-4 rounded text-[var(--pri)] focus:ring-[var(--pri)] cursor-pointer"
                      />
                    </div>
                    <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                      <strong>What:</strong> Displays a live ticking countdown clock to the submission deadline on the author portal homepage.
                    </p>
                    <p className="text-[11px] text-[var(--text-tertiary)]">
                      <strong>Why:</strong> Drives submission urgency, eliminates timezone ambiguities, and drastically reduces last-minute deadline extension appeals.
                    </p>
                  </div>
                </div>

                {/* Guidelines Text */}
                <div className="space-y-1.5 pt-2">
                  <div className="flex items-center justify-between">
                    <label htmlFor="submission-guidelines" className="text-xs font-bold text-[var(--text-primary)]">
                      Author Submission Guidelines & Ethics Policy Notice
                    </label>
                    <span className="text-[10px] text-[var(--text-tertiary)]">Shown at top of intake form</span>
                  </div>
                  <textarea
                    id="submission-guidelines"
                    rows={3}
                    value={submissionGuidelines}
                    onChange={(e) => {
                      setSubmissionGuidelines(e.target.value);
                      setIsDirty(true);
                    }}
                    placeholder="Enter author instructions, ethical requirements, formatting constraints..."
                    className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] p-3 text-xs text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none"
                  />
                  <p className="text-[11px] text-[var(--text-tertiary)]">
                    <strong>Why:</strong> Educates authors on word counts, structure, and disclosure requirements before they begin typing.
                  </p>
                </div>

                {/* Topic Taxonomy Guide */}
                <label className="flex items-start gap-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] p-3.5 cursor-pointer hover:bg-[var(--bg-surface-hover)] transition-colors">
                  <input
                    type="checkbox"
                    checked={showTaxonomyGuide}
                    onChange={(e) => {
                      setShowTaxonomyGuide(e.target.checked);
                      setIsDirty(true);
                    }}
                    className="mt-0.5 size-4 rounded text-[var(--pri)] focus:ring-[var(--pri)]"
                  />
                  <div className="space-y-0.5">
                    <span className="text-xs font-bold text-[var(--text-primary)]">Display Topic Taxonomy & Track Guide</span>
                    <p className="text-[11px] text-[var(--text-secondary)]">
                      Shows descriptions and examples under the Category and Track dropdowns to help authors choose the correct track.
                    </p>
                  </div>
                </label>
              </div>

              {/* Section 2: Author Permissions & Self-Service */}
              <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-5 shadow-xs space-y-4">
                <div>
                  <h3 className="text-sm font-bold text-[var(--text-primary)]">Author Permissions & Self-Service</h3>
                  <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                    Specify what actions submitters are permitted to execute after submitting.
                  </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="flex items-start gap-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] p-3.5 cursor-pointer hover:bg-[var(--bg-surface-hover)] transition-colors">
                    <input
                      type="checkbox"
                      checked={allowAuthorEdits}
                      onChange={(e) => {
                        setAllowAuthorEdits(e.target.checked);
                        setIsDirty(true);
                      }}
                      className="mt-0.5 size-4 rounded text-[var(--pri)] focus:ring-[var(--pri)]"
                    />
                    <div className="space-y-0.5">
                      <span className="text-xs font-bold text-[var(--text-primary)]">Pre-Review Self-Edits</span>
                      <p className="text-[11px] text-[var(--text-secondary)]">
                        <strong>Why:</strong> Authors can fix typos or update co-author affiliations before review begins, reducing support tickets.
                      </p>
                    </div>
                  </label>

                  <label className="flex items-start gap-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] p-3.5 cursor-pointer hover:bg-[var(--bg-surface-hover)] transition-colors">
                    <input
                      type="checkbox"
                      checked={allowAuthorWithdrawal}
                      onChange={(e) => {
                        setAllowAuthorWithdrawal(e.target.checked);
                        setIsDirty(true);
                      }}
                      className="mt-0.5 size-4 rounded text-[var(--pri)] focus:ring-[var(--pri)]"
                    />
                    <div className="space-y-0.5">
                      <span className="text-xs font-bold text-[var(--text-primary)]">Self-Withdrawal</span>
                      <p className="text-[11px] text-[var(--text-secondary)]">
                        <strong>Why:</strong> Authors can formally retract their paper prior to assignment if funding or presentation ability changes.
                      </p>
                    </div>
                  </label>

                  <label className="flex items-start gap-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] p-3.5 cursor-pointer hover:bg-[var(--bg-surface-hover)] transition-colors">
                    <input
                      type="checkbox"
                      checked={requireCoauthorVerification}
                      onChange={(e) => {
                        setRequireCoauthorVerification(e.target.checked);
                        setIsDirty(true);
                      }}
                      className="mt-0.5 size-4 rounded text-[var(--pri)] focus:ring-[var(--pri)]"
                    />
                    <div className="space-y-0.5">
                      <span className="text-xs font-bold text-[var(--text-primary)]">Co-Author Verification</span>
                      <p className="text-[11px] text-[var(--text-secondary)]">
                        <strong>Why:</strong> Sends an email to listed co-authors requiring them to acknowledge their inclusion in the paper.
                      </p>
                    </div>
                  </label>
                </div>
              </div>

              {/* Section 3: Post-Decision Feedback Disclosure */}
              <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-5 shadow-xs space-y-4">
                <div>
                  <h3 className="text-sm font-bold text-[var(--text-primary)]">Review Results & Feedback Disclosure Policy</h3>
                  <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                    Configure what reviewers' assessments are released to submitters once decisions are published.
                  </p>
                </div>

                <div className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <label htmlFor="feedback-policy" className="text-xs font-bold text-[var(--text-primary)]">
                      Author Feedback Release Level
                    </label>
                    <span className="rounded bg-[var(--bg-surface)] px-2 py-0.5 text-[10px] font-bold text-[var(--text-secondary)] border border-[var(--border-subtle)]">
                      Transparency Control
                    </span>
                  </div>
                  <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                    <strong>Why:</strong> Some high-stakes medical/scientific conferences keep reviewer deliberations confidential, while academic conferences encourage constructive reviewer comments for authors.
                  </p>

                  <select
                    id="feedback-policy"
                    value={feedbackReleasePolicy}
                    onChange={(e) => {
                      setFeedbackReleasePolicy(e.target.value as any);
                      setIsDirty(true);
                    }}
                    className="w-full max-w-md rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 text-xs font-bold text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none"
                  >
                    <option value="STATUS_ONLY">Decision Status Only (Accepted / Rejected, no review details)</option>
                    <option value="SCORES_ONLY">Status & Aggregate Score (Show overall rating without comments)</option>
                    <option value="ANONYMIZED_COMMENTS">Status, Scores & Qualitative Comments (Reviewer names hidden)</option>
                    <option value="FULL_RUBRIC">Full Rubric Breakdown (Criterion-by-criterion scores and feedback)</option>
                  </select>
                </div>
              </div>

              {/* Section 4: Confirmation Screen & Author Support */}
              <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-5 shadow-xs space-y-4">
                <div>
                  <h3 className="text-sm font-bold text-[var(--text-primary)]">Confirmation Receipt & Support Escalation</h3>
                  <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                    Ensure submitters receive confirmation and know who to contact if issues arise.
                  </p>
                </div>

                <div className="space-y-3">
                  <label className="flex items-center gap-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] p-3.5 cursor-pointer hover:bg-[var(--bg-surface-hover)] transition-colors">
                    <input
                      type="checkbox"
                      checked={sendConfirmationEmail}
                      onChange={(e) => {
                        setSendConfirmationEmail(e.target.checked);
                        setIsDirty(true);
                      }}
                      className="size-4 rounded text-[var(--pri)] focus:ring-[var(--pri)]"
                    />
                    <div>
                      <span className="text-xs font-bold text-[var(--text-primary)]">Instant Submission Receipt Email</span>
                      <p className="text-[11px] text-[var(--text-secondary)]">
                        Automatically emails the submitter their unique submission tracking code and a PDF summary.
                      </p>
                    </div>
                  </label>

                  <div className="space-y-1.5">
                    <label htmlFor="custom-success-message" className="text-xs font-bold text-[var(--text-primary)]">
                      Post-Submission Success Screen Message
                    </label>
                    <textarea
                      id="custom-success-message"
                      rows={2}
                      value={customSuccessMessage}
                      onChange={(e) => {
                        setCustomSuccessMessage(e.target.value);
                        setIsDirty(true);
                      }}
                      placeholder="Next steps, decision dates, presentation instructions..."
                      className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] p-3 text-xs text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none"
                    />
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2 pt-1">
                    <div className="space-y-1.5">
                      <label htmlFor="support-email" className="text-xs font-bold text-[var(--text-secondary)]">
                        Author Support Contact Email
                      </label>
                      <input
                        id="support-email"
                        type="email"
                        value={supportEmail}
                        onChange={(e) => {
                          setSupportEmail(e.target.value);
                          setIsDirty(true);
                        }}
                        placeholder="abstracts@eventos.org"
                        className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3 py-2 text-xs text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label htmlFor="support-phone" className="text-xs font-bold text-[var(--text-secondary)]">
                        Support Hotline / Phone (Optional)
                      </label>
                      <input
                        id="support-phone"
                        type="tel"
                        value={supportPhone}
                        onChange={(e) => {
                          setSupportPhone(e.target.value);
                          setIsDirty(true);
                        }}
                        placeholder="+1 (555) 019-2834"
                        className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3 py-2 text-xs text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ════════════════════════════════════════════════════════════════════
              TAB 2: REVIEW PORTAL SETTINGS
          ════════════════════════════════════════════════════════════════════ */}
          {activeTab === "review" && (
            <div className="space-y-6">
              {/* Section 1: Blinded Peer Review Policy */}
              <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-5 shadow-xs space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-[var(--text-primary)]">Blinded Peer Review & Metadata Redaction</h3>
                    <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                      Mitigate unconscious bias by stripping identifying details from reviewers during the evaluation phase.
                    </p>
                  </div>
                  <label className="flex items-center gap-2 rounded-full border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3 py-1 text-xs font-bold text-[var(--text-primary)] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={blindReviewEnabled}
                      onChange={(e) => {
                        setBlindReviewEnabled(e.target.checked);
                        setIsDirty(true);
                      }}
                      className="size-4 rounded text-[var(--pri)] focus:ring-[var(--pri)]"
                    />
                    Blinded Review Mode
                  </label>
                </div>

                <div className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] p-4 space-y-3">
                  <p className="text-xs font-bold text-[var(--text-primary)]">
                    Information Redacted from Reviewer Interface:
                  </p>
                  <p className="text-[11px] text-[var(--text-secondary)]">
                    <strong>Why:</strong> Protects early-career researchers from seniority bias and prevents institutional prestige bias.
                  </p>

                  <div className="grid gap-2 sm:grid-cols-3 pt-1">
                    <label className="flex items-center gap-2 text-xs text-[var(--text-primary)] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={redactAuthorNames}
                        disabled={!blindReviewEnabled}
                        onChange={(e) => {
                          setRedactAuthorNames(e.target.checked);
                          setIsDirty(true);
                        }}
                        className="size-4 rounded text-[var(--pri)] disabled:opacity-40"
                      />
                      Author Names & Emails
                    </label>

                    <label className="flex items-center gap-2 text-xs text-[var(--text-primary)] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={redactAffiliations}
                        disabled={!blindReviewEnabled}
                        onChange={(e) => {
                          setRedactAffiliations(e.target.checked);
                          setIsDirty(true);
                        }}
                        className="size-4 rounded text-[var(--pri)] disabled:opacity-40"
                      />
                      Institutions & Locations
                    </label>

                    <label className="flex items-center gap-2 text-xs text-[var(--text-primary)] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={redactCoauthors}
                        disabled={!blindReviewEnabled}
                        onChange={(e) => {
                          setRedactCoauthors(e.target.checked);
                          setIsDirty(true);
                        }}
                        className="size-4 rounded text-[var(--pri)] disabled:opacity-40"
                      />
                      Co-Author Collaborator List
                    </label>
                  </div>
                </div>
              </div>

              {/* Section 2: Peer Review Visibility & Deliberation */}
              <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-5 shadow-xs space-y-4">
                <div>
                  <h3 className="text-sm font-bold text-[var(--text-primary)]">Peer Review Visibility & Interaction</h3>
                  <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                    Determine when evaluators can see other evaluators' ratings on the same submission.
                  </p>
                </div>

                <div className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <label htmlFor="peer-visibility" className="text-xs font-bold text-[var(--text-primary)]">
                      Peer Review Disclosure Mode
                    </label>
                    <span className="rounded bg-[var(--bg-surface)] px-2 py-0.5 text-[10px] font-bold text-[var(--text-secondary)] border border-[var(--border-subtle)]">
                      Anchoring Prevention
                    </span>
                  </div>
                  <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                    <strong>Why:</strong> Prevents "anchoring bias" where subsequent reviewers unconsciously adjust their score to match an earlier reviewer's grade.
                  </p>

                  <select
                    id="peer-visibility"
                    value={peerVisibilityMode}
                    onChange={(e) => {
                      setPeerVisibilityMode(e.target.value as any);
                      setIsDirty(true);
                    }}
                    className="w-full max-w-md rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 text-xs font-bold text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none"
                  >
                    <option value="ISOLATED">Strictly Isolated (Reviewers never see peer reviews)</option>
                    <option value="AFTER_SUBMIT">Post-Submission Visibility (See peers only after submitting own review)</option>
                    <option value="TRANSPARENT">Committee Transparent (All reviews visible to committee in real-time)</option>
                  </select>

                  <label className="flex items-center gap-2 pt-2 text-xs text-[var(--text-primary)] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showAggregateScores}
                      onChange={(e) => {
                        setShowAggregateScores(e.target.checked);
                        setIsDirty(true);
                      }}
                      className="size-4 rounded text-[var(--pri)]"
                    />
                    Display Running Average Score badge once evaluated
                  </label>
                </div>
              </div>

              {/* Section 3: Review Re-editing & Mandatory Comments */}
              <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-5 shadow-xs space-y-4">
                <div>
                  <h3 className="text-sm font-bold text-[var(--text-primary)]">Review Quality & Comment Enforcements</h3>
                  <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                    Enforce feedback standards and allow reviewers to normalize scores across their assigned batch.
                  </p>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  {/* Re-editing */}
                  <label className="flex items-start gap-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] p-4 cursor-pointer hover:bg-[var(--bg-surface-hover)] transition-colors">
                    <input
                      type="checkbox"
                      checked={allowReviewEditing}
                      onChange={(e) => {
                        setAllowReviewEditing(e.target.checked);
                        setIsDirty(true);
                      }}
                      className="mt-0.5 size-4 rounded text-[var(--pri)] focus:ring-[var(--pri)]"
                    />
                    <div className="space-y-0.5">
                      <span className="text-xs font-bold text-[var(--text-primary)]">Allow Review Re-editing</span>
                      <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                        <strong>Why:</strong> Evaluators often review 10+ papers in sequence and need to recalibrate earlier scores after discovering the batch's baseline quality.
                      </p>
                    </div>
                  </label>

                  {/* Mandatory Comments */}
                  <div className="space-y-1.5 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] p-4">
                    <label htmlFor="mandatory-comments-policy" className="text-xs font-bold text-[var(--text-primary)] block">
                      Mandatory Comment Policy
                    </label>
                    <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                      <strong>Why:</strong> Ensures that authors of rejected or low-scored abstracts receive actionable justification.
                    </p>
                    <select
                      id="mandatory-comments-policy"
                      value={mandatoryCommentsPolicy}
                      onChange={(e) => {
                        setMandatoryCommentsPolicy(e.target.value as any);
                        setIsDirty(true);
                      }}
                      className="mt-2 w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 text-xs font-bold text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none"
                    >
                      <option value="OPTIONAL">Optional for all reviews</option>
                      <option value="LOW_SCORES_ONLY">Mandatory only on low scores (≤ 2 stars or reject recommendation)</option>
                      <option value="MANDATORY_ALL">Mandatory on every evaluation</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Section 4: Conflict of Interest & Document Viewer */}
              <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-5 shadow-xs space-y-4">
                <div>
                  <h3 className="text-sm font-bold text-[var(--text-primary)]">Integrity & Document Handling</h3>
                  <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                    Maintain rigorous academic integrity and provide convenient in-browser reading tools.
                  </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="flex items-start gap-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] p-3.5 cursor-pointer hover:bg-[var(--bg-surface-hover)] transition-colors">
                    <input
                      type="checkbox"
                      checked={enforceCoiDeclaration}
                      onChange={(e) => {
                        setEnforceCoiDeclaration(e.target.checked);
                        setIsDirty(true);
                      }}
                      className="mt-0.5 size-4 rounded text-[var(--pri)] focus:ring-[var(--pri)]"
                    />
                    <div className="space-y-0.5">
                      <span className="text-xs font-bold text-[var(--text-primary)]">Mandatory COI Self-Recusal Gate</span>
                      <p className="text-[11px] text-[var(--text-secondary)]">
                        Reviewers must certify they have no conflict of interest before opening the full submission.
                      </p>
                    </div>
                  </label>

                  <label className="flex items-start gap-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] p-3.5 cursor-pointer hover:bg-[var(--bg-surface-hover)] transition-colors">
                    <input
                      type="checkbox"
                      checked={autoWarnInstitutionalConflict}
                      onChange={(e) => {
                        setAutoWarnInstitutionalConflict(e.target.checked);
                        setIsDirty(true);
                      }}
                      className="mt-0.5 size-4 rounded text-[var(--pri)] focus:ring-[var(--pri)]"
                    />
                    <div className="space-y-0.5">
                      <span className="text-xs font-bold text-[var(--text-primary)]">Automated Institutional Conflict Warning</span>
                      <p className="text-[11px] text-[var(--text-secondary)]">
                        System automatically flags and warns if an author belongs to the reviewer&apos;s home university or organization.
                      </p>
                    </div>
                  </label>

                  <label className="flex items-start gap-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] p-3.5 cursor-pointer hover:bg-[var(--bg-surface-hover)] transition-colors sm:col-span-2">
                    <input
                      type="checkbox"
                      checked={inBrowserPdfViewer}
                      onChange={(e) => {
                        setInBrowserPdfViewer(e.target.checked);
                        setIsDirty(true);
                      }}
                      className="mt-0.5 size-4 rounded text-[var(--pri)] focus:ring-[var(--pri)]"
                    />
                    <div className="space-y-0.5">
                      <span className="text-xs font-bold text-[var(--text-primary)]">Integrated In-Browser PDF Document Previewer</span>
                      <p className="text-[11px] text-[var(--text-secondary)]">
                        Allows reviewers to read manuscripts directly side-by-side with the score sheet, preventing unencrypted PDF downloads on personal computers.
                      </p>
                    </div>
                  </label>
                </div>
              </div>

              {/* Section 5: Reviewer Deadline Reminder Cadence */}
              <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-5 shadow-xs space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-[var(--text-primary)]">Automated Reviewer Reminder Triggers</h3>
                    <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                      Automatically nudge reviewers with uncompleted assignments as the deadline nears.
                    </p>
                  </div>
                  <Clock className="size-4 text-[var(--pri)]" />
                </div>

                <div className="flex flex-wrap gap-4 pt-1">
                  <label className="flex items-center gap-2 text-xs font-bold text-[var(--text-primary)] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={remind72h}
                      onChange={(e) => {
                        setRemind72h(e.target.checked);
                        setIsDirty(true);
                      }}
                      className="size-4 rounded text-[var(--pri)]"
                    />
                    72 Hours Before Deadline
                  </label>

                  <label className="flex items-center gap-2 text-xs font-bold text-[var(--text-primary)] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={remind48h}
                      onChange={(e) => {
                        setRemind48h(e.target.checked);
                        setIsDirty(true);
                      }}
                      className="size-4 rounded text-[var(--pri)]"
                    />
                    48 Hours Before Deadline
                  </label>

                  <label className="flex items-center gap-2 text-xs font-bold text-[var(--text-primary)] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={remind24h}
                      onChange={(e) => {
                        setRemind24h(e.target.checked);
                        setIsDirty(true);
                      }}
                      className="size-4 rounded text-[var(--pri)]"
                    />
                    24 Hours (Urgent Final Call)
                  </label>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </AbstractShell>
  );
}

export default AbstractPortalSettingsView;
