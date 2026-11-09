"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  AlertCircle,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  Eye,
  EyeOff,
  FileText,
  HelpCircle,
  Layers,
  Play,
  Plus,
  Scale,
  Shield,
  SlidersHorizontal,
  Sparkles,
  Star,
  ThumbsUp,
  Trash2,
  UserCheck,
  Users,
  Clock,
} from "lucide-react";
import { toast } from "sonner";
import {
  cn,
  toDateTimeLocalString,
  fromDateTimeLocalString,
  formatDateTimeInTZ,
  getFallbackTimezone,
  getTimezoneAbbrev,
} from "@/lib/utils";
import {
  AbstractEvaluationPlan,
  useAbstractEvaluationPlans,
  useAbstractReviewers,
  useAbstractSetup,
  useAbstractSubmissions,
  useApplyAbstractEvaluationPlan,
  useCreateAbstractEvaluationPlan,
  useUpdateAbstractEvaluationPlan,
} from "@/hooks/useAbstractWorkflow";
import { AbstractShell, EmptyState } from "./AbstractShell";
import { ScopedEventEditor } from "@/components/organizer/events/ScopedEventEditor";
import { ScopedCommandFeedback } from "@/components/organizer/events/ScopedCommandFeedback";

type EvaluationMode = "STARS" | "YES_NO" | "COMPARISON";
type EvaluatorScope = "ALL" | "SELECTED" | "ASSIGNED";

interface Criterion {
  key: string;
  label: string;
  max: number;
  weight: number;
  description: string;
}

const DEFAULT_CRITERIA: Criterion[] = [
  { key: "scientific_merit", label: "Scientific merit", max: 10, weight: 35, description: "Evidence quality, research question clarity, and sound conclusions." },
  { key: "originality", label: "Originality & Novelty", max: 10, weight: 25, description: "Novel contribution compared against existing conference literature." },
  { key: "methodology", label: "Methodology", max: 10, weight: 20, description: "Study design, data rigor, sampling, and appropriate statistical controls." },
  { key: "relevance", label: "Relevance & Value", max: 10, weight: 20, description: "Fit with conference topics and practical interest for attendees." },
];
const DEFAULT_INSTRUCTIONS = "Please score each abstract fairly based on the evaluation rubric criteria. Leave constructive feedback for the author and private notes for the committee.";

export function AbstractEvaluationView() {
  const { eventId } = useParams<{ eventId: string }>();
  return <ScopedEventEditor eventId={eventId}><EvaluationEditor /></ScopedEventEditor>;
}

function EvaluationEditor() {
  const { eventId } = useParams<{ eventId: string }>();
  const evaluationPlans = useAbstractEvaluationPlans(eventId);
  const submissions = useAbstractSubmissions(eventId);
  const reviewers = useAbstractReviewers(eventId);
  const setup = useAbstractSetup(eventId);

  const createPlan = useCreateAbstractEvaluationPlan(eventId);
  const updatePlan = useUpdateAbstractEvaluationPlan(eventId);
  const applyPlan = useApplyAbstractEvaluationPlan(eventId);

  // Selected Plan state (empty = new plan)
  const [selectedPlanId, setSelectedPlanId] = useState<string>("");
  const [loadedPlan, setLoadedPlan] = useState<AbstractEvaluationPlan | null>(null);

  // Form State
  const [planName, setPlanName] = useState("Evaluation Round 1");
  const [evaluationMode, setEvaluationMode] = useState<EvaluationMode>("STARS");
  const [useMultipleCriteria, setUseMultipleCriteria] = useState(true);
  const [criteria, setCriteria] = useState<Criterion[]>(DEFAULT_CRITERIA);
  const [evaluatorScope, setEvaluatorScope] = useState<EvaluatorScope>("ASSIGNED");
  const [selectedReviewerIds, setSelectedReviewerIds] = useState<string[]>([]);
  const [assignmentsPerSubmission, setAssignmentsPerSubmission] = useState(2);
  const [instructions, setInstructions] = useState(DEFAULT_INSTRUCTIONS);
  const [deadline, setDeadline] = useState("");
  const [anonymousReview, setAnonymousReview] = useState(true);

  // Advanced Options
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string[]>(["SUBMITTED", "UNDER_REVIEW", "NOMINATED"]);
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");
  const [categoryMatchMode, setCategoryMatchMode] = useState<"OR" | "AND">("OR");
  const [fluentSessionList, setFluentSessionList] = useState(true);
  const [commentsDisplayMode, setCommentsDisplayMode] = useState<"CURRENT_ONLY" | "ALL_EVALUATORS" | "COMMITTEE_ONLY">("CURRENT_ONLY");
  const [commentRequirement, setCommentRequirement] = useState<"OPTIONAL" | "MANDATORY">("OPTIONAL");

  // Load existing plan if selected
  const activePlan = useMemo(() => {
    return (evaluationPlans.data || []).find((p) => p.id === selectedPlanId) || null;
  }, [evaluationPlans.data, selectedPlanId]);
  const mutationPending = createPlan.isPending || updatePlan.isPending || applyPlan.isPending;
  const moreBatches = applyPlan.continuation?.planId === selectedPlanId
    && applyPlan.continuation?.version === loadedPlan?.version
    && applyPlan.continuation?.count === assignmentsPerSubmission && applyPlan.continuation.hasNext;

  useEffect(() => {
    if (activePlan) {
      // A background refresh must not replace an unsaved draft or advance its
      // optimistic version. Only selection/reload or a committed save does so.
      if (loadedPlan?.id === activePlan.id) return;
      setLoadedPlan(activePlan);
      setPlanName(activePlan.name);
      setAnonymousReview(Boolean(activePlan.anonymous_review));
      if (activePlan.due_at) {
        setDeadline(toDateTimeLocalString(activePlan.due_at));
      } else {
        setDeadline("");
      }
      if (activePlan.reviewer_ids && activePlan.reviewer_ids.length > 0) {
        setSelectedReviewerIds(activePlan.reviewer_ids);
        setEvaluatorScope("SELECTED");
      } else {
        setSelectedReviewerIds([]);
        setEvaluatorScope("ASSIGNED");
      }

      if (Array.isArray(activePlan.rubric)) {
        setUseMultipleCriteria(true);
        setCriteria(
          activePlan.rubric.map((r, i) => ({
            key: String(r.key || `crit_${i + 1}`),
            label: String(r.label || `Criterion ${i + 1}`),
            max: Number(r.max || 10),
            weight: Number(r.weight || 0),
            description: String(r.description || ""),
          }))
        );
      }

      const scope = (activePlan.scope_filter || {}) as Record<string, any>;
      setEvaluatorScope(scope.evaluator_scope ?? (activePlan.reviewer_ids?.length ? "SELECTED" : "ASSIGNED"));
      setEvaluationMode(scope.evaluation_mode ?? "STARS");
      setInstructions(scope.instructions ?? DEFAULT_INSTRUCTIONS);
      setStatusFilter(scope.status_filter ?? ["SUBMITTED", "UNDER_REVIEW", "NOMINATED"]);
      setCategoryFilter(scope.category_filter ?? "ALL");
      setCategoryMatchMode(scope.category_match_mode ?? "OR");
      setAssignmentsPerSubmission(scope.assignments_per_submission ?? 2);
      setFluentSessionList(scope.fluent_list ?? true);
      setCommentsDisplayMode(scope.comments_display ?? "CURRENT_ONLY");
      setCommentRequirement(scope.comment_requirement ?? "OPTIONAL");
    } else if (!selectedPlanId) {
      setLoadedPlan(null);
    }
  }, [activePlan, loadedPlan?.id, selectedPlanId]);

  // Calculate live matching submissions based on advanced criteria
  const matchingSubmissions = useMemo(() => {
    const items = submissions.data?.items || [];
    return items.filter((sub) => {
      // Filter by status
      if (!statusFilter.includes(sub.status)) {
        return false;
      }
      // Filter by topic/category
      if (categoryFilter !== "ALL" && sub.topic !== categoryFilter) {
        return false;
      }
      return true;
    });
  }, [submissions.data?.items, statusFilter, categoryFilter]);

  // Total Rubric Weight
  const totalWeight = useMemo(() => {
    return criteria.reduce((sum, item) => sum + (Number(item.weight) || 0), 0);
  }, [criteria]);

  // Available topics from setup
  const availableTopics = setup.data?.topics || [];

  // Toggle reviewer selection
  const handleToggleReviewer = (reviewerId: string) => {
    setSelectedReviewerIds((prev) =>
      prev.includes(reviewerId) ? prev.filter((id) => id !== reviewerId) : [...prev, reviewerId]
    );
  };

  const handleSelectAllReviewers = () => {
    const allIds = (reviewers.data || []).map((r) => r.id);
    if (selectedReviewerIds.length === allIds.length) {
      setSelectedReviewerIds([]);
    } else {
      setSelectedReviewerIds(allIds);
    }
  };

  // Criterion updates
  const updateCriterion = (index: number, patch: Partial<Criterion>) => {
    setCriteria((items) =>
      items.map((item, itemIdx) => (itemIdx === index ? { ...item, ...patch } : item))
    );
  };

  const addCriterion = () => {
    if (criteria.length >= 20) {
      toast.error("An evaluation plan supports up to 20 criteria.");
      return;
    }
    setCriteria((items) => [
      ...items,
      {
        key: `criterion_${items.length + 1}`,
        label: `Criterion ${items.length + 1}`,
        max: 10,
        weight: Math.max(0, 100 - totalWeight),
        description: "Reviewer assessment instructions for this criterion.",
      },
    ]);
  };

  const removeCriterion = (index: number) => {
    setCriteria((items) => items.filter((_, idx) => idx !== index));
  };

  // Submit Plan
  const handleSavePlan = async () => {
    if (!planName.trim()) {
      toast.error("Please enter a name for the evaluation plan");
      return;
    }

    if (useMultipleCriteria && criteria.length > 0 && (!Number.isFinite(totalWeight) || Math.abs(totalWeight - 100) > 0.000001)) {
      toast.error(`Total criteria weight must equal 100% (currently ${totalWeight}%)`);
      return;
    }

    const payloadRubric = useMultipleCriteria
      ? criteria.map((c) => ({
          key: c.key,
          label: c.label,
          max: c.max,
          weight: c.weight,
          description: c.description,
        }))
      : [{ key: "overall", label: "Overall Evaluation", max: 5, weight: 100, description: "General rating" }];

    const reviewerIdsToSave =
      evaluatorScope === "SELECTED"
        ? selectedReviewerIds
        : evaluatorScope === "ALL"
        ? (reviewers.data || []).map((r) => r.id)
        : [];

    const scopeFilterPayload = {
      evaluation_mode: evaluationMode,
      evaluator_scope: evaluatorScope,
      assignments_per_submission: assignmentsPerSubmission,
      instructions,
      status_filter: statusFilter,
      category_filter: categoryFilter,
      category_match_mode: categoryMatchMode,
      fluent_list: fluentSessionList,
      comments_display: commentsDisplayMode,
      comment_requirement: commentRequirement,
    };

    try {
      if (selectedPlanId && loadedPlan?.id !== selectedPlanId) {
        throw new Error("Reload the selected plan before saving.");
      }
      if (selectedPlanId && loadedPlan) {
        // Update
        const saved = await updatePlan.mutateAsync({
          ...loadedPlan,
          name: planName.trim(),
          rubric: payloadRubric,
          reviewer_ids: reviewerIdsToSave,
          due_at: fromDateTimeLocalString(deadline) || null,
          anonymous_review: anonymousReview,
          scope_filter: scopeFilterPayload,
        });
        setLoadedPlan(saved);
        toast.success("Evaluation plan updated successfully");
      } else {
        // Create new
        const created = await createPlan.mutateAsync({
          name: planName.trim(),
          source_type: "ABSTRACT",
          rubric: payloadRubric,
          reviewer_ids: reviewerIdsToSave,
          due_at: fromDateTimeLocalString(deadline) || null,
          anonymous_review: anonymousReview,
          scope_filter: scopeFilterPayload,
        });
        toast.success(`Evaluation plan "${created.name}" created!`);
        setSelectedPlanId(created.id);
      }
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Evaluation plan was not saved. Your draft is retained.");
    }
  };

  const handleApplyToSubmissions = async () => {
    if (!selectedPlanId || loadedPlan?.id !== selectedPlanId) return;
    try {
      const res = await applyPlan.mutateAsync({
        planId: selectedPlanId,
        version: loadedPlan.version,
        assignmentsPerSubmission: Number(assignmentsPerSubmission) || 2,
      });
      setLoadedPlan(current => current?.id === res.plan_id ? { ...current, version: res.version, status: "ACTIVE" } : current);
      toast.success(
        `Created ${res.assignments_created} assignments for this batch of ${res.submissions_considered} submissions.${res.submissions_unfilled ? ` ${res.submissions_unfilled} submissions still need reviewer capacity.` : ""}${res.has_next ? " More submissions remain; continue the next batch." : " Batch processing complete."}`
      );
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "This batch was not applied. You can explicitly retry.");
    }
  };

  const resetToNewPlan = () => {
    setSelectedPlanId("");
    setPlanName("Evaluation Round 1");
    setEvaluationMode("STARS");
    setUseMultipleCriteria(true);
    setCriteria(DEFAULT_CRITERIA);
    setEvaluatorScope("ASSIGNED");
    setSelectedReviewerIds([]);
    setAssignmentsPerSubmission(2);
    setInstructions(DEFAULT_INSTRUCTIONS);
    setStatusFilter(["SUBMITTED", "UNDER_REVIEW", "NOMINATED"]);
    setCategoryFilter("ALL");
    setCategoryMatchMode("OR");
    setFluentSessionList(true);
    setCommentsDisplayMode("CURRENT_ONLY");
    setCommentRequirement("OPTIONAL");
    setShowAdvanced(false);
    setDeadline("");
    setAnonymousReview(true);
  };

  const reloadSelectedPlan = async () => {
    if (!selectedPlanId || mutationPending || !window.confirm("Reload the saved plan and discard unsaved edits?")) return;
    const result = await evaluationPlans.refetch();
    if (result.error || !result.data?.some(plan => plan.id === selectedPlanId)) {
      toast.error("The saved plan could not be reloaded. Your draft is retained.");
      return;
    }
    setLoadedPlan(null);
  };

  const headerActions = (
    <div className="flex items-center gap-2">
      {selectedPlanId && (
        <button
          type="button"
          onClick={handleApplyToSubmissions}
          disabled={mutationPending || loadedPlan?.id !== selectedPlanId}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-3.5 text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-surface-2)] shadow-sm transition-colors cursor-pointer"
        >
          <Play className="size-3.5 text-[var(--brand-primary)]" />
          <span>{moreBatches ? "Continue next batch" : "Apply to abstracts (up to 100)"}</span>
        </button>
      )}
      <button
        type="button"
        onClick={handleSavePlan}
        disabled={mutationPending || Boolean(selectedPlanId && loadedPlan?.id !== selectedPlanId)}
        className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[var(--pri)] px-4 text-xs font-bold text-[var(--primary-contrast)] hover:opacity-90 shadow-sm transition-all cursor-pointer"
      >
        <ClipboardCheck className="size-4" />
        <span>{selectedPlanId ? "Save evaluation plan" : "Create evaluation plan"}</span>
      </button>
    </div>
  );

  return (
    <AbstractShell view="evaluation" actions={headerActions}>
      <div className="space-y-6 max-w-5xl">
        <ScopedCommandFeedback failure={createPlan.commandFailure} retryAt={createPlan.retryAt} />
        <ScopedCommandFeedback failure={updatePlan.commandFailure} retryAt={updatePlan.retryAt} />
        <ScopedCommandFeedback failure={applyPlan.commandFailure} retryAt={applyPlan.retryAt} />
        {evaluationPlans.error ? <p role="alert">Evaluation plans could not be loaded. Reload before making changes.</p> : null}
        {/* Existing Plans Selector Strip */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-3.5 shadow-sm">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
              Plan Roster:
            </span>
            <select
              aria-label="Evaluation plan"
              value={selectedPlanId}
              disabled={mutationPending}
              onChange={(e) => {
                if (e.target.value === "new") {
                  resetToNewPlan();
                } else {
                  setSelectedPlanId(e.target.value);
                }
              }}
              className="h-8 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-2.5 text-xs font-semibold text-[var(--text-primary)] focus:border-[var(--brand-primary)] focus:outline-none"
            >
              <option value="new">+ Start New Evaluation Plan</option>
              {(evaluationPlans.data || [])
                .filter((p) => p.source_type === "ABSTRACT")
                .map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.name} ({plan.rubric?.length || 0} criteria · {plan.status || "DRAFT"})
                  </option>
                ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            {selectedPlanId ? <button type="button" disabled={mutationPending}
              onClick={() => void reloadSelectedPlan()} className="text-xs underline">Reload saved plan</button> : null}
            {selectedPlanId ? (
              <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-0.5 text-[11px] font-bold text-emerald-700 dark:text-emerald-300 border border-emerald-500/20">
                <CheckCircle2 className="size-3" />
                Editing Existing Plan
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-md bg-[var(--brand-primary)]/10 px-2 py-0.5 text-[11px] font-bold text-[var(--brand-primary)] border border-[var(--brand-primary)]/20">
                <Sparkles className="size-3" />
                Drafting New Plan
              </span>
            )}
          </div>
        </div>
        {loadedPlan && useMultipleCriteria && criteria.length === 0 ? <p role="status" className="text-sm">
          This saved plan has no numeric criteria. Saving without adding criteria preserves that definition.
        </p> : null}

        {/* Anonymous Mode Callout Banner (From Sessionize Screenshot) */}
        <div className="rounded-xl border border-[var(--brand-primary)]/20 bg-[var(--brand-primary)]/5 p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[var(--brand-primary)]/10 text-[var(--brand-primary)]">
              {anonymousReview ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-xs font-bold text-[var(--text-primary)]">
                  Anonymous Review Mode
                </h4>
                <span className={cn(
                  "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase",
                  anonymousReview ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "bg-zinc-500/15 text-zinc-600 dark:text-zinc-400"
                )}>
                  {anonymousReview ? "Enabled" : "Disabled"}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                Hide authors&apos; and presenters&apos; identity, affiliations, and contact details from reviewers to prevent bias during committee scoring.
              </p>
            </div>
          </div>

          <label className="flex items-center gap-2 shrink-0 cursor-pointer self-start sm:self-center">
            <input
              type="checkbox"
              checked={anonymousReview}
              onChange={(e) => setAnonymousReview(e.target.checked)}
              className="size-4 rounded border-[var(--border-default)] text-[var(--brand-primary)] focus:ring-[var(--brand-primary)]"
            />
            <span className="text-xs font-bold text-[var(--text-primary)]">
              Enable Blind Mode
            </span>
          </label>
        </div>

        {/* Main Configuration Form Card */}
        <div className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-6 shadow-sm space-y-7">
          {/* Field 1: Plan Name */}
          <div className="grid gap-2 sm:grid-cols-[180px_1fr] sm:items-center">
            <label htmlFor="evaluation-plan-name" className="text-xs font-bold text-[var(--text-primary)]">
              Name <span className="text-rose-500">*</span>
            </label>
            <input
              id="evaluation-plan-name"
              type="text"
              required
              value={planName}
              onChange={(e) => setPlanName(e.target.value)}
              placeholder="e.g. Scientific Committee Evaluation"
              className="h-9 w-full max-w-lg rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3 text-xs text-[var(--text-primary)] focus:border-[var(--brand-primary)] focus:outline-none"
            />
          </div>

          <hr className="border-[var(--border-subtle)]" />

          {/* Field 2: Evaluation Mode (Radio Cards with detailed explanations) */}
          <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
            <div>
              <label className="text-xs font-bold text-[var(--text-primary)] block">
                Evaluation mode <span className="text-rose-500">*</span>
              </label>
              <p className="mt-1 text-[11px] text-[var(--text-secondary)]">
                Select the scoring methodology evaluators will use.
              </p>
            </div>

            <div className="space-y-3 max-w-2xl">
              {/* Option A: Stars rating */}
              <label
                onClick={() => setEvaluationMode("STARS")}
                className={cn(
                  "flex items-start gap-3 rounded-xl border p-4 cursor-pointer transition-all",
                  evaluationMode === "STARS"
                    ? "border-[var(--brand-primary)] bg-[var(--brand-primary)]/5 shadow-xs"
                    : "border-[var(--border-default)] bg-[var(--bg-surface-2)]/50 hover:bg-[var(--bg-surface-2)]"
                )}
              >
                <input
                  type="radio"
                  name="eval_mode"
                  checked={evaluationMode === "STARS"}
                  onChange={() => setEvaluationMode("STARS")}
                  className="mt-1 text-[var(--brand-primary)]"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-xs text-[var(--text-primary)]">
                      Stars rating
                    </span>
                    <div className="flex items-center text-amber-500">
                      <Star className="size-3.5 fill-amber-500" />
                      <Star className="size-3.5 fill-amber-500" />
                      <Star className="size-3.5 fill-amber-500" />
                      <Star className="size-3.5 fill-amber-500" />
                      <Star className="size-3.5 fill-amber-500" />
                    </div>
                  </div>
                  <p className="mt-1 text-xs text-[var(--text-secondary)] leading-relaxed">
                    Go through abstracts one by one and rate each one with 1–5 stars. Classic choice, easiest to understand for committee reviewers.
                  </p>
                </div>
              </label>

              {/* Option B: Yes/No */}
              <label
                onClick={() => setEvaluationMode("YES_NO")}
                className={cn(
                  "flex items-start gap-3 rounded-xl border p-4 cursor-pointer transition-all",
                  evaluationMode === "YES_NO"
                    ? "border-[var(--brand-primary)] bg-[var(--brand-primary)]/5 shadow-xs"
                    : "border-[var(--border-default)] bg-[var(--bg-surface-2)]/50 hover:bg-[var(--bg-surface-2)]"
                )}
              >
                <input
                  type="radio"
                  name="eval_mode"
                  checked={evaluationMode === "YES_NO"}
                  onChange={() => setEvaluationMode("YES_NO")}
                  className="mt-1 text-[var(--brand-primary)]"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-xs text-[var(--text-primary)]">
                      Yes / No
                    </span>
                    <ThumbsUp className="size-3.5 text-emerald-500" />
                  </div>
                  <p className="mt-1 text-xs text-[var(--text-secondary)] leading-relaxed">
                    Go through submissions one by one and say Yes, No or Maybe. Great for rapid initial screening to eliminate abstracts that clearly don&apos;t fit the event.
                  </p>
                </div>
              </label>

              {/* Option C: Comparison */}
              <label
                onClick={() => setEvaluationMode("COMPARISON")}
                className={cn(
                  "flex items-start gap-3 rounded-xl border p-4 cursor-pointer transition-all",
                  evaluationMode === "COMPARISON"
                    ? "border-[var(--brand-primary)] bg-[var(--brand-primary)]/5 shadow-xs"
                    : "border-[var(--border-default)] bg-[var(--bg-surface-2)]/50 hover:bg-[var(--bg-surface-2)]"
                )}
              >
                <input
                  type="radio"
                  name="eval_mode"
                  checked={evaluationMode === "COMPARISON"}
                  onChange={() => setEvaluationMode("COMPARISON")}
                  className="mt-1 text-[var(--brand-primary)]"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-xs text-[var(--text-primary)]">
                      Comparison
                    </span>
                    <Scale className="size-3.5 text-indigo-500" />
                  </div>
                  <p className="mt-1 text-xs text-[var(--text-secondary)] leading-relaxed">
                    Compare abstracts head-to-head in pairs or sets of three. Fast, smart and mathematically resilient against individual reviewer leniency.
                  </p>
                </div>
              </label>
            </div>
          </div>

          <hr className="border-[var(--border-subtle)]" />

          {/* Field 3: Criteria & Rubric Builder */}
          <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
            <div>
              <label className="text-xs font-bold text-[var(--text-primary)] block">
                Criteria <span className="text-rose-500">*</span>
              </label>
              <p className="mt-1 text-[11px] text-[var(--text-secondary)]">
                Break evaluations down into explicit scoring dimensions.
              </p>
            </div>

            <div className="space-y-4 max-w-3xl">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={useMultipleCriteria}
                  onChange={(e) => setUseMultipleCriteria(e.target.checked)}
                  className="mt-0.5 size-4 rounded border-[var(--border-default)] text-[var(--brand-primary)]"
                />
                <div>
                  <span className="text-xs font-bold text-[var(--text-primary)]">
                    Use multiple criteria
                  </span>
                  <p className="text-[11px] text-[var(--text-secondary)]">
                    Evaluator will give individual ratings to each defined dimension. Total score is computed from the weighted average.
                  </p>
                </div>
              </label>

              {useMultipleCriteria && (
                <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface-2)] p-4 space-y-3.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)]">
                      Evaluation Rubric Criteria
                    </span>
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-0.5 text-xs font-bold",
                        totalWeight === 100
                          ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30"
                          : "bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30"
                      )}
                    >
                      {totalWeight}% / 100% total weight
                    </span>
                  </div>

                  {/* Criteria Rows */}
                  <div className="space-y-2.5">
                    {criteria.map((item, index) => (
                      <div
                        key={item.key || index}
                        className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3 space-y-2 shadow-2xs"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                          <input
                            type="text"
                            value={item.label}
                            onChange={(e) => updateCriterion(index, { label: e.target.value })}
                            placeholder="Criterion name"
                            className="h-8 flex-1 rounded-md border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-2.5 text-xs font-bold text-[var(--text-primary)] focus:border-[var(--brand-primary)] focus:outline-none"
                          />
                          <div className="flex items-center gap-2">
                            <div className="flex items-center gap-1">
                              <span className="text-[10px] font-bold text-[var(--text-tertiary)] uppercase">Weight</span>
                              <input
                                type="number"
                                min={1}
                                max={100}
                                value={item.weight}
                                onChange={(e) => updateCriterion(index, { weight: Number(e.target.value) })}
                                className="h-8 w-16 rounded-md border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-2 text-center text-xs font-bold text-[var(--text-primary)]"
                              />
                              <span className="text-xs font-bold text-[var(--text-secondary)]">%</span>
                            </div>

                            <div className="flex items-center gap-1">
                              <span className="text-[10px] font-bold text-[var(--text-tertiary)] uppercase">Max</span>
                              <input
                                type="number"
                                min={1}
                                max={100}
                                value={item.max}
                                onChange={(e) => updateCriterion(index, { max: Number(e.target.value) })}
                                className="h-8 w-14 rounded-md border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-2 text-center text-xs text-[var(--text-primary)]"
                              />
                            </div>

                            <button
                              type="button"
                              onClick={() => removeCriterion(index)}
                              className="rounded-md p-1.5 text-[var(--text-tertiary)] hover:bg-rose-500/10 hover:text-rose-600 transition-colors cursor-pointer"
                              title="Delete criterion"
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          </div>
                        </div>

                        <input
                          type="text"
                          value={item.description}
                          onChange={(e) => updateCriterion(index, { description: e.target.value })}
                          placeholder="Brief guidance for evaluators assessing this criterion..."
                          className="h-7 w-full rounded-md border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-2.5 text-[11px] text-[var(--text-secondary)] focus:outline-none"
                        />
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={addCriterion}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-1.5 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] shadow-2xs transition-colors cursor-pointer"
                  >
                    <Plus className="size-3.5" /> Add criterion
                  </button>
                </div>
              )}
            </div>
          </div>

          <hr className="border-[var(--border-subtle)]" />

          {/* Field 4: Evaluators Scoping */}
          <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
            <div>
              <label className="text-xs font-bold text-[var(--text-primary)] block">
                Evaluators <span className="text-rose-500">*</span>
              </label>
              <p className="mt-1 text-[11px] text-[var(--text-secondary)]">
                Assign reviewer workload and distribution model.
              </p>
            </div>

            <div className="space-y-3 max-w-2xl">
              {/* Scope A: All Team members */}
              <label
                onClick={() => setEvaluatorScope("ALL")}
                className={cn(
                  "flex items-start gap-3 rounded-xl border p-3.5 cursor-pointer transition-all",
                  evaluatorScope === "ALL"
                    ? "border-[var(--brand-primary)] bg-[var(--brand-primary)]/5"
                    : "border-[var(--border-default)] bg-[var(--bg-surface-2)]/40 hover:bg-[var(--bg-surface-2)]"
                )}
              >
                <input
                  type="radio"
                  name="eval_scope"
                  checked={evaluatorScope === "ALL"}
                  onChange={() => setEvaluatorScope("ALL")}
                  className="mt-0.5 text-[var(--brand-primary)]"
                />
                <div>
                  <span className="text-xs font-bold text-[var(--text-primary)]">
                    All Team members
                  </span>
                  <span className="ml-1.5 text-[11px] text-[var(--text-secondary)]">
                    (available reviewers for balanced assignment, within their capacity)
                  </span>
                </div>
              </label>

              {/* Scope B: Only selected Team members */}
              <label
                onClick={() => setEvaluatorScope("SELECTED")}
                className={cn(
                  "flex items-start gap-3 rounded-xl border p-3.5 cursor-pointer transition-all",
                  evaluatorScope === "SELECTED"
                    ? "border-[var(--brand-primary)] bg-[var(--brand-primary)]/5"
                    : "border-[var(--border-default)] bg-[var(--bg-surface-2)]/40 hover:bg-[var(--bg-surface-2)]"
                )}
              >
                <input
                  type="radio"
                  name="eval_scope"
                  checked={evaluatorScope === "SELECTED"}
                  onChange={() => setEvaluatorScope("SELECTED")}
                  className="mt-0.5 text-[var(--brand-primary)]"
                />
                <div className="flex-1">
                  <div>
                    <span className="text-xs font-bold text-[var(--text-primary)]">
                      Only selected Team members
                    </span>
                    <span className="ml-1.5 text-[11px] text-[var(--text-secondary)]">
                      (available reviewers for balanced assignment, within their capacity)
                    </span>
                  </div>

                  {evaluatorScope === "SELECTED" && (
                    <div className="mt-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] p-3 space-y-2">
                      <div className="flex items-center justify-between text-xs font-bold text-[var(--text-primary)]">
                        <span>Select Reviewers ({selectedReviewerIds.length} chosen)</span>
                        <button
                          type="button"
                          onClick={handleSelectAllReviewers}
                          className="text-[var(--brand-primary)] hover:underline cursor-pointer"
                        >
                          {selectedReviewerIds.length === (reviewers.data || []).length ? "Deselect All" : "Select All"}
                        </button>
                      </div>
                      <div className="max-h-36 overflow-y-auto divide-y divide-[var(--border-subtle)]">
                        {(reviewers.data || []).length === 0 ? (
                          <p className="py-3 text-center text-xs text-[var(--text-secondary)]">
                            No reviewers in roster. Invite reviewers in the Call for Reviewer console.
                          </p>
                        ) : (
                          (reviewers.data || []).map((r) => (
                            <label
                              key={r.id}
                              className="flex items-center gap-2.5 py-1.5 text-xs hover:bg-[var(--bg-surface-2)] px-1 rounded cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                checked={selectedReviewerIds.includes(r.id)}
                                onChange={() => handleToggleReviewer(r.id)}
                                className="rounded border-[var(--border-default)] text-[var(--brand-primary)]"
                              />
                              <span className="font-bold text-[var(--text-primary)]">{r.full_name}</span>
                              <span className="text-[11px] text-[var(--text-tertiary)] truncate">({r.email})</span>
                            </label>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </label>

              {/* Scope C: Only assigned evaluators */}
              <label
                onClick={() => setEvaluatorScope("ASSIGNED")}
                className={cn(
                  "flex items-start gap-3 rounded-xl border p-3.5 cursor-pointer transition-all",
                  evaluatorScope === "ASSIGNED"
                    ? "border-[var(--brand-primary)] bg-[var(--brand-primary)]/5"
                    : "border-[var(--border-default)] bg-[var(--bg-surface-2)]/40 hover:bg-[var(--bg-surface-2)]"
                )}
              >
                <input
                  type="radio"
                  name="eval_scope"
                  checked={evaluatorScope === "ASSIGNED"}
                  onChange={() => setEvaluatorScope("ASSIGNED")}
                  className="mt-0.5 text-[var(--brand-primary)]"
                />
                <div className="flex-1">
                  <div>
                    <span className="text-xs font-bold text-[var(--text-primary)]">
                      Only assigned evaluators
                    </span>
                    <span className="ml-1.5 text-[11px] text-[var(--text-secondary)]">
                      (each abstract may have different assigned evaluators)
                    </span>
                  </div>

                  {evaluatorScope === "ASSIGNED" && (
                    <div className="mt-3 flex items-center gap-2 text-xs">
                      <span className="font-semibold text-[var(--text-secondary)]">
                        Target evaluations per abstract:
                      </span>
                      <input
                        type="number"
                        min={1}
                        max={10}
                        value={assignmentsPerSubmission}
                        onChange={(e) => setAssignmentsPerSubmission(Number(e.target.value))}
                        className="h-8 w-16 rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)] px-2 text-center text-xs font-bold text-[var(--text-primary)]"
                      />
                      <span className="text-[11px] text-[var(--text-tertiary)]">
                        (e.g., 2 or 3 peer reviews per talk)
                      </span>
                    </div>
                  )}
                </div>
              </label>
            </div>
          </div>

          <hr className="border-[var(--border-subtle)]" />

          {/* Field 5: Instructions */}
          <div className="grid gap-2 sm:grid-cols-[180px_1fr]">
            <div>
              <label className="text-xs font-bold text-[var(--text-primary)] block">
                Instructions
              </label>
              <p className="mt-1 text-[11px] text-[var(--text-secondary)]">
                Shown to evaluators before they commence review.
              </p>
            </div>
            <div>
              <textarea
                rows={3}
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="Will be shown to evaluators when they start evaluating..."
                className="w-full max-w-2xl rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] p-3 text-xs text-[var(--text-primary)] focus:border-[var(--brand-primary)] focus:outline-none"
              />
              <p className="mt-1 text-[11px] text-[var(--text-tertiary)]">
                Visible to evaluators on their dedicated evaluation portal.
              </p>
            </div>
          </div>

          <hr className="border-[var(--border-subtle)]" />

          {/* Field 6: Deadline */}
          <div className="grid gap-2 sm:grid-cols-[180px_1fr]">
            <div>
              <label className="text-xs font-bold text-[var(--text-primary)] block">
                Deadline
              </label>
              <p className="mt-1 text-[11px] text-[var(--text-secondary)]">
                Automatic closing timestamp.
              </p>
            </div>
            <div>
              <input
                type="datetime-local"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                className="h-9 w-full max-w-xs rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3 text-xs text-[var(--text-primary)] focus:border-[var(--brand-primary)] focus:outline-none"
              />
              {deadline && (
                <p className="mt-1 flex items-center gap-1.5 text-[11px] font-medium text-[var(--text-secondary)]">
                  <Clock className="size-3 text-[var(--brand-primary)]" />
                  <span>{formatDateTimeInTZ(fromDateTimeLocalString(deadline))} ({getTimezoneAbbrev(getFallbackTimezone())})</span>
                </p>
              )}
              <p className="mt-1 text-[11px] text-[var(--text-tertiary)]">
                Evaluation, if opened, will automatically close at this date. Evaluators will be warned when approaching the deadline.
              </p>
            </div>
          </div>

          <hr className="border-[var(--border-subtle)]" />

          {/* Field 7: Advanced Options Accordion (From Screenshot) */}
          <div>
            <button
              type="button"
              onClick={() => setShowAdvanced((prev) => !prev)}
              className="flex items-center gap-2 text-xs font-bold text-[var(--brand-primary)] hover:underline cursor-pointer"
            >
              <ChevronDown className={cn("size-4 transition-transform", !showAdvanced && "-rotate-90")} />
              <span>Advanced options</span>
            </button>

            {showAdvanced && (
              <div className="mt-4 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface-2)]/60 p-5 space-y-6">
                {/* Section A: Include Sessions / Abstracts */}
                <div>
                  <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)]">
                      Include Submissions
                    </h4>
                    <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-bold text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                      {matchingSubmissions.length} matches in the loaded preview
                    </span>
                  </div>

                  <div className="mt-4 space-y-4">
                    {/* Status filter */}
                    <div className="grid gap-2 sm:grid-cols-[160px_1fr] sm:items-center">
                      <span className="text-xs font-bold text-[var(--text-secondary)]">With status</span>
                      <div className="flex flex-wrap gap-1.5">
                        {["DRAFT", "SUBMITTED", "UNDER_REVIEW", "NOMINATED", "ACCEPTED", "WAITLISTED"].map((st) => {
                          const active = statusFilter.includes(st);
                          return (
                            <button
                              key={st}
                              type="button"
                              onClick={() => {
                                setStatusFilter((prev) =>
                                  prev.includes(st) ? prev.filter((x) => x !== st) : [...prev, st]
                                );
                              }}
                              className={cn(
                                "rounded-md px-2.5 py-1 text-xs font-bold transition-all cursor-pointer",
                                active
                                  ? "bg-[var(--pri)] text-[var(--primary-contrast)] shadow-xs"
                                  : "bg-[var(--bg-surface)] text-[var(--text-secondary)] border border-[var(--border-default)] hover:bg-[var(--bg-surface-hover)]"
                              )}
                            >
                              {active && <Check className="mr-1 inline size-3" />}
                              {st.replaceAll("_", " ")}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Category filter */}
                    <div className="grid gap-2 sm:grid-cols-[160px_1fr] sm:items-center">
                      <span className="text-xs font-bold text-[var(--text-secondary)]">In categories / topics</span>
                      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                        <select
                          value={categoryFilter}
                          onChange={(e) => setCategoryFilter(e.target.value)}
                          className="h-8 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 text-xs text-[var(--text-primary)] focus:outline-none"
                        >
                          <option value="ALL">(all categories & topics)</option>
                          {availableTopics.map((t) => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </select>

                        <div className="flex items-center gap-3 text-xs text-[var(--text-secondary)]">
                          <label className="flex items-center gap-1 cursor-pointer">
                            <input
                              type="radio"
                              name="cat_match"
                              checked={categoryMatchMode === "OR"}
                              onChange={() => setCategoryMatchMode("OR")}
                              className="text-[var(--brand-primary)]"
                            />
                            <span>Match at least one category (OR)</span>
                          </label>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Section B: Fluent Session List */}
                <div className="pt-4 border-t border-[var(--border-subtle)]">
                  <div className="grid gap-2 sm:grid-cols-[160px_1fr]">
                    <span className="text-xs font-bold text-[var(--text-secondary)]">Fluent abstract list</span>
                    <label className="flex items-start gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={fluentSessionList}
                        onChange={(e) => setFluentSessionList(e.target.checked)}
                        className="mt-0.5 size-4 rounded border-[var(--border-default)] text-[var(--brand-primary)]"
                      />
                      <div>
                        <span className="text-xs font-bold text-[var(--text-primary)]">
                          Add submissions to the evaluation plan as they are submitted or meet criteria
                        </span>
                        <p className="text-[11px] text-[var(--text-secondary)]">
                          This evaluation mode allows newly submitted abstracts to be seamlessly added to reviewers&apos; queue even if scoring has already started.
                        </p>
                      </div>
                    </label>
                  </div>
                </div>

                {/* Section C: Comments Settings */}
                <div className="pt-4 border-t border-[var(--border-subtle)] space-y-4">
                  <div className="grid gap-2 sm:grid-cols-[160px_1fr] sm:items-center">
                    <span className="text-xs font-bold text-[var(--text-secondary)]">Comments display</span>
                    <select
                      value={commentsDisplayMode}
                      onChange={(e) => setCommentsDisplayMode(e.target.value as any)}
                      className="h-8 max-w-sm rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 text-xs text-[var(--text-primary)] focus:outline-none"
                    >
                      <option value="CURRENT_ONLY">Show only comments from current evaluator</option>
                      <option value="ALL_EVALUATORS">Show all comments from all evaluators</option>
                      <option value="COMMITTEE_ONLY">Committee comments visible only to organizers</option>
                    </select>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-[160px_1fr] sm:items-center">
                    <span className="text-xs font-bold text-[var(--text-secondary)]">Comment requirement</span>
                    <select
                      value={commentRequirement}
                      onChange={(e) => setCommentRequirement(e.target.value as any)}
                      className="h-8 max-w-sm rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 text-xs text-[var(--text-primary)] focus:outline-none"
                    >
                      <option value="OPTIONAL">Optional comments - Evaluators can submit reviews without comments</option>
                      <option value="MANDATORY">Mandatory comments - Comment required on every scored submission</option>
                    </select>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Bottom CTA Button */}
          <div className="pt-4 border-t border-[var(--border-subtle)] flex items-center justify-between">
            <div className="text-xs text-[var(--text-tertiary)]">
              {activePlan ? `Last saved as version ${activePlan.version}` : "Unsaved draft plan"}
            </div>
            <button
              type="button"
              onClick={handleSavePlan}
              disabled={mutationPending || Boolean(selectedPlanId && loadedPlan?.id !== selectedPlanId)}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[var(--pri)] px-5 text-xs font-bold text-[var(--primary-contrast)] hover:opacity-90 shadow-sm transition-all cursor-pointer"
            >
              <ClipboardCheck className="size-4" />
              <span>{selectedPlanId ? "Save evaluation plan" : "Create evaluation plan"}</span>
            </button>
          </div>
        </div>
      </div>
    </AbstractShell>
  );
}

export default AbstractEvaluationView;
