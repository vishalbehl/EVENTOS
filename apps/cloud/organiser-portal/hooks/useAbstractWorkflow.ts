import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/api-client";
import type { FormTemplate } from "@eventos/form-builder-studio";
import { abstractSchemaForSave, rubricForSave } from "@eventos/form-builder-studio";
import { useScopedCommand } from "@/hooks/useScopedCommand";
import { accessContextCacheKey, useAuthStore } from "@/store/use-auth-store";

export type AbstractStatus = "DRAFT" | "SUBMITTED" | "UNDER_REVIEW" | "NOMINATED" | "WAITLISTED" | "ACCEPTED" | "REJECTED" | "REVISION_REQUESTED" | "WITHDRAWN";

export interface AbstractCall {
  id: string;
  event_id: string;
  status: "DRAFT" | "OPEN" | "CLOSED" | "PUBLISHED";
  opens_at?: string | null;
  closes_at?: string | null;
  revision_deadline?: string | null;
  min_words: number;
  max_words: number;
  abstract_types: string[];
  topics: string[];
  categories?: string[];
  allow_coauthors?: boolean;
  max_coauthors?: number;
  require_presenter?: boolean;
  require_affiliation?: boolean;
  require_country?: boolean;
  max_submissions_per_author?: number;
  require_attachments?: boolean;
  allowed_file_extensions?: string[];
  max_file_size_mb?: number;
  require_disclosures?: boolean;
  evaluation_plan_id?: string | null;
  target_reviews_per_submission?: number;
  portal_settings?: Record<string, unknown>;
  author_rules: Record<string, unknown>;
  attachment_rules: Record<string, unknown>;
  disclosure_rules: Record<string, unknown>;
  email_triggers: Record<string, unknown>;
  blind_review_enabled: boolean;
  published_at?: string | null;
  version: number;
}

export interface AbstractForm {
  id: string;
  event_id: string;
  title: string;
  schema: Record<string, unknown>;
  is_active: boolean;
  publish: boolean;
  version: number;
  published_at?: string | null;
  saved_template?: FormTemplate | null;
}

export interface AbstractEvaluationPlan {
  id: string;
  name: string;
  source_type: "ABSTRACT" | "SESSION";
  scope_filter: Record<string, unknown>;
  rubric: Array<Record<string, unknown>>;
  reviewer_ids: string[];
  due_at?: string | null;
  anonymous_review: boolean;
  status: string;
  version: number;
}

export interface EvaluationPlanApplyResult {
  plan_id: string;
  version: number;
  assignments_created: number;
  submissions_considered: number;
  submissions_unfilled: number;
  has_next: boolean;
  next_cursor: string | null;
}

export interface AbstractSubmission {
  id: string;
  event_id: string;
  code: string;
  title: string;
  body: string;
  keywords: string[];
  abstract_type: string;
  topic?: string | null;
  track?: string | null;
  status: AbstractStatus;
  version: number;
  submitted_at?: string | null;
  decided_at?: string | null;
  published_at?: string | null;
  presenter_name?: string | null;
  presenter_email?: string | null;
  linked_session_name?: string | null;
  average_score?: number | null;
  review_count: number;
  assignment_count: number;
  conflict_count: number;
  final_decision?: string | null;
  presentation_type?: string | null;
  authors?: Array<{ id: string; full_name: string; email?: string | null; affiliation?: string | null; country?: string | null; is_presenter: boolean; display_order: number }>;
  attachments?: Array<{ id: string; kind: string; filename: string; storage_path?: string | null; mime_type?: string | null; file_size_bytes?: number | null }>;
  reviews?: Array<{ id: string; reviewer_id: string; reviewer_name: string; scores: Record<string, number>; total_score: number; recommendation: string; comments_to_committee?: string | null; comments_to_author?: string | null; submitted_at: string }>;
  decisions?: Array<{ id: string; decision: string; presentation_type?: string | null; reason: string; notes_to_author?: string | null; decided_at: string }>;
}

export interface AbstractDashboard {
  call?: AbstractCall | null;
  counts: Record<string, number>;
  reviewer_load: { reviewers: number; assigned: number; completed: number };
  publication: { accepted: number; published: number; ready: number };
  needs_attention: Array<{ severity: string; label: string; destination: string }>;
  recent: AbstractSubmission[];
}

export interface AbstractReviewer {
  id: string;
  full_name: string;
  email: string;
  expertise_topics: string[];
  capacity: number;
  status: "INVITED" | "ACTIVE" | "PAUSED";
  assigned_count: number;
  completed_count: number;
  conflict_count: number;
}

export interface AbstractReviewerGrant {
  id: string;
  email: string;
  audience: "REVIEWER";
  status: string;
  version: number;
  expires_at: string;
  revoked_at?: string | null;
}

export interface AbstractPage {
  items: AbstractSubmission[];
  next_cursor?: string | null;
}

export interface AbstractAssignment {
  id: string;
  submission_id: string;
  submission_code: string;
  submission_title: string;
  reviewer_id: string;
  reviewer_name: string;
  status: "ASSIGNED" | "ACCEPTED" | "DECLINED" | "CONFLICT" | "COMPLETED";
  due_at?: string | null;
  conflict_declared: boolean;
  conflict_reason?: string | null;
}

export function useAbstractDashboard(eventId: string) {
  return useQuery({
    queryKey: ["abstract-workflow", eventId, "dashboard"],
    queryFn: () => apiGet<AbstractDashboard>(`/events/${eventId}/abstracts/dashboard`),
    enabled: Boolean(eventId),
    refetchInterval: 15000,
    refetchOnWindowFocus: true,
  });
}

export function useAbstractSetup(eventId: string) {
  const { user, activeContext, isAuthenticated, isContextSwitching } = useAuthStore();
  return useQuery({
    queryKey: ["abstract-workflow", user?.id, accessContextCacheKey(activeContext, user?.organization_id), eventId, "setup"],
    queryFn: () => apiGet<AbstractCall>(`/events/${eventId}/abstracts/setup`),
    enabled: Boolean(eventId && user && isAuthenticated && !isContextSwitching),
    refetchOnWindowFocus: true,
  });
}

export function useSaveAbstractSetup(eventId: string) {
  const queryClient = useQueryClient();
  const command = useScopedCommand(eventId);
  const { user, activeContext } = useAuthStore();
  const prefix = ["abstract-workflow", user?.id, accessContextCacheKey(activeContext, user?.organization_id), eventId];
  const mutation = useMutation({
    retry: false,
    mutationFn: async (call: AbstractCall) => {
      // Response identity/version/publication metadata is not mutation input.
      const allowed = ["status", "opens_at", "closes_at", "revision_deadline", "min_words", "max_words",
        "abstract_types", "topics", "author_rules", "attachment_rules", "disclosure_rules", "email_triggers",
        "blind_review_enabled", "allow_coauthors", "max_coauthors", "require_presenter", "require_affiliation",
        "require_country", "max_submissions_per_author", "require_attachments", "allowed_file_extensions",
        "max_file_size_mb", "require_disclosures", "evaluation_plan_id", "target_reviews_per_submission",
        "categories", "portal_settings"];
      const source = call as unknown as Record<string, unknown>;
      const payload = Object.fromEntries(allowed.filter(key => source[key] !== undefined).map(key => [key, source[key]]));
      const saved = await command.execute<AbstractCall>("put", `/events/${eventId}/abstracts/setup`, payload, call.version);
      if (!saved) throw new Error("The access context changed; reload the current setup.");
      return saved;
    },
    onSuccess: saved => {
      if (!command.isCurrent()) return;
      queryClient.setQueryData([...prefix, "setup"], saved);
      void queryClient.invalidateQueries({ queryKey: prefix });
      void queryClient.invalidateQueries({ queryKey: ["abstract-workflow", eventId] });
    },
  });
  return { ...mutation, commandFailure: command.failure, retryAt: command.retryAt };
}

export function useAbstractForm(eventId: string) {
  const { user, activeContext, isAuthenticated, isContextSwitching } = useAuthStore();
  return useQuery({
    queryKey: ["abstract-workflow", user?.id, accessContextCacheKey(activeContext, user?.organization_id), eventId, "form"],
    queryFn: () => apiGet<AbstractForm>(`/events/${eventId}/abstracts/form`),
    enabled: Boolean(eventId) && isAuthenticated && !isContextSwitching,
    refetchOnWindowFocus: false,
  });
}

export function useSaveAbstractForm(eventId: string) {
  const queryClient = useQueryClient();
  const command = useScopedCommand(eventId);
  const { user, activeContext } = useAuthStore();
  const queryKey = ["abstract-workflow", user?.id, accessContextCacheKey(activeContext, user?.organization_id), eventId, "form"];
  const mutation = useMutation({
    retry: false,
    mutationFn: async (form: AbstractForm) => {
      const saved = await command.execute<AbstractForm>("put", `/events/${eventId}/abstracts/form`,
        { title: form.title, schema: abstractSchemaForSave(form.schema), is_active: true, publish: form.publish }, form.version);
      if (!saved) throw new Error("The access context changed; reload the current form.");
      return saved;
    },
    onSuccess: (saved) => {
      if (command.isCurrent()) queryClient.setQueryData(queryKey, saved);
    },
  });
  return { ...mutation, commandFailure: command.failure, retryAt: command.retryAt };
}

export function useAbstractEvaluationPlans(eventId: string) {
  const { user, activeContext, isAuthenticated, isContextSwitching } = useAuthStore();
  return useQuery({
    queryKey: ["abstract-workflow", user?.id, accessContextCacheKey(activeContext, user?.organization_id), eventId, "evaluation-plans"],
    queryFn: ({ signal }) => apiGet<AbstractEvaluationPlan[]>(`/events/${eventId}/programme/evaluation-plans`, { signal }),
    enabled: Boolean(eventId && user && isAuthenticated && !isContextSwitching),
  });
}

export function useCreateAbstractEvaluationPlan(eventId: string) {
  const queryClient = useQueryClient();
  const command = useScopedCommand(eventId);
  const { user, activeContext } = useAuthStore();
  const prefix = ["abstract-workflow", user?.id, accessContextCacheKey(activeContext, user?.organization_id), eventId];
  const mutation = useMutation({
    retry: false,
    mutationFn: async (payload: {
      name: string;
      source_type: "ABSTRACT" | "SESSION";
      scope_filter: Record<string, unknown>;
      rubric: Array<Record<string, unknown>>;
      reviewer_ids: string[];
      due_at?: string | null;
      anonymous_review: boolean;
    }) => {
      const saved = await command.execute<AbstractEvaluationPlan>("post", `/events/${eventId}/programme/evaluation-plans`,
        { ...payload, rubric: rubricForSave(payload.rubric) });
      if (!saved) throw new Error("The access context changed; reload evaluation plans.");
      return saved;
    },
    onSuccess: () => { if (command.isCurrent()) void queryClient.invalidateQueries({ queryKey: [...prefix, "evaluation-plans"] }); },
  });
  return { ...mutation, commandFailure: command.failure, retryAt: command.retryAt };
}

export function useApplyAbstractEvaluationPlan(eventId: string) {
  const queryClient = useQueryClient();
  const command = useScopedCommand(eventId);
  const { user, activeContext } = useAuthStore();
  const scope = `${user?.id}:${accessContextCacheKey(activeContext, user?.organization_id)}:${eventId}`;
  const prefix = ["abstract-workflow", user?.id, accessContextCacheKey(activeContext, user?.organization_id), eventId];
  const [continuation, setContinuation] = useState<{
    scope: string; planId: string; version: number; count: number; hasNext: boolean; cursor: string | null;
  } | null>(null);
  const mutation = useMutation({
    retry: false,
    mutationFn: async ({ planId, version, assignmentsPerSubmission }: { planId: string; version: number; assignmentsPerSubmission: number }) => {
      const cursor = continuation?.scope === scope && continuation.planId === planId
        && continuation.version === version && continuation.count === assignmentsPerSubmission ? continuation.cursor : null;
      const saved = await command.execute<EvaluationPlanApplyResult>("post",
        `/events/${eventId}/programme/evaluation-plans/${planId}/apply`,
        { assignments_per_submission: assignmentsPerSubmission, cursor }, version);
      if (!saved) throw new Error("The access context changed; reload evaluation plans.");
      return saved;
    },
    onSuccess: (saved, input) => {
      if (!command.isCurrent()) return;
      setContinuation({ scope, planId: saved.plan_id, version: saved.version, count: input.assignmentsPerSubmission,
        hasNext: saved.has_next, cursor: saved.next_cursor });
      queryClient.setQueryData<AbstractEvaluationPlan[]>([...prefix, "evaluation-plans"], current =>
        current?.map(plan => plan.id === saved.plan_id && plan.version <= saved.version ? { ...plan, version: saved.version, status: "ACTIVE" } : plan));
      void queryClient.invalidateQueries({ queryKey: prefix });
      void queryClient.invalidateQueries({ queryKey: ["abstract-workflow", eventId] });
    },
  });
  return { ...mutation, continuation: continuation?.scope === scope ? continuation : null,
    commandFailure: command.failure, retryAt: command.retryAt };
}

export function useUpdateAbstractEvaluationPlan(eventId: string) {
  const queryClient = useQueryClient();
  const command = useScopedCommand(eventId);
  const { user, activeContext } = useAuthStore();
  const prefix = ["abstract-workflow", user?.id, accessContextCacheKey(activeContext, user?.organization_id), eventId];
  const mutation = useMutation({
    retry: false,
    mutationFn: async (plan: AbstractEvaluationPlan) => {
      const saved = await command.execute<AbstractEvaluationPlan>("put", `/events/${eventId}/programme/evaluation-plans/${plan.id}`, {
      expected_version: plan.version, name: plan.name, scope_filter: plan.scope_filter, rubric: rubricForSave(plan.rubric),
      reviewer_ids: plan.reviewer_ids, due_at: plan.due_at, anonymous_review: plan.anonymous_review,
      }, plan.version);
      if (!saved) throw new Error("The access context changed; reload evaluation plans.");
      return saved;
    },
    onSuccess: saved => {
      if (!command.isCurrent()) return;
      queryClient.setQueryData<AbstractEvaluationPlan[]>([...prefix, "evaluation-plans"], current =>
        current?.map(plan => plan.id === saved.id && plan.version <= saved.version ? saved : plan));
      void queryClient.invalidateQueries({ queryKey: [...prefix, "evaluation-plans"] });
    },
  });
  return { ...mutation, commandFailure: command.failure, retryAt: command.retryAt };
}

export function useAbstractSubmissions(eventId: string, filters: { status?: string; search?: string; topic?: string; track?: string; format?: string } = {}) {
  return useQuery({
    queryKey: ["abstract-workflow", eventId, "submissions", filters],
    queryFn: () => {
      const params = new URLSearchParams();
      if (filters.status) params.set("status", filters.status);
      if (filters.search) params.set("search", filters.search);
      if (filters.topic) params.set("topic", filters.topic);
      if (filters.track) params.set("track", filters.track);
      if (filters.format) params.set("format", filters.format);
      params.set("limit", "200");
      return apiGet<AbstractPage>(`/events/${eventId}/abstracts/submissions?${params.toString()}`);
    },
    enabled: Boolean(eventId),
    refetchInterval: 15000,
    refetchOnWindowFocus: true,
  });
}

export function useAbstractReviewers(eventId: string) {
  return useQuery({
    queryKey: ["abstract-workflow", eventId, "reviewers"],
    queryFn: () => apiGet<AbstractReviewer[]>(`/events/${eventId}/abstracts/reviewers`),
    enabled: Boolean(eventId),
    refetchInterval: 15000,
    refetchOnWindowFocus: true,
  });
}

export function useCreateAbstractReviewer(eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (reviewer: Omit<AbstractReviewer, "id" | "assigned_count" | "completed_count" | "conflict_count">) =>
      apiPost<AbstractReviewer>(`/events/${eventId}/abstracts/reviewers`, reviewer),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["abstract-workflow", eventId] }),
  });
}

export function useIssueAbstractReviewerInvitation(eventId: string) {
  return useMutation({
    mutationFn: (reviewerId: string) => apiPost<{ access_token: string; expires_at: string }>(
      `/events/${eventId}/programme/reviewer-invitations/${reviewerId}`, {}, { headers: { "Idempotency-Key": crypto.randomUUID() } },
    ),
  });
}

export function useAbstractReviewerGrants(eventId: string) {
  return useQuery({
    queryKey: ["abstract-workflow", eventId, "reviewer-grants"],
    queryFn: () => apiGet<AbstractReviewerGrant[]>(`/events/${eventId}/programme/access-grants?audience=REVIEWER`),
    enabled: Boolean(eventId),
    refetchInterval: 15000,
    refetchOnWindowFocus: true,
  });
}

export function useRevokeAbstractReviewerGrant(eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ grantId, version }: { grantId: string; version: number }) => apiPost<void>(`/events/${eventId}/programme/access-grants/${grantId}/revoke`, {}, { headers: { "If-Match": version } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["abstract-workflow", eventId, "reviewer-grants"] }),
  });
}

export function useUpdateAbstractReviewer(eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ reviewerId, patch }: { reviewerId: string; patch: Partial<Omit<AbstractReviewer, "id" | "assigned_count" | "completed_count" | "conflict_count">> }) =>
      apiPut<AbstractReviewer>(`/events/${eventId}/abstracts/reviewers/${reviewerId}`, patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["abstract-workflow", eventId] }),
  });
}

export function useDeleteAbstractReviewer(eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (reviewerId: string) => apiDelete<void>(`/events/${eventId}/abstracts/reviewers/${reviewerId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["abstract-workflow", eventId] }),
  });
}

export function useAbstractAssignments(eventId: string) {
  return useQuery({
    queryKey: ["abstract-workflow", eventId, "assignments"],
    queryFn: () => apiGet<AbstractAssignment[]>(`/events/${eventId}/abstracts/assignments`),
    enabled: Boolean(eventId),
    refetchInterval: 15000,
    refetchOnWindowFocus: true,
  });
}

export function useUpdateAbstractAssignment(eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ assignmentId, patch }: { assignmentId: string; patch: Partial<Pick<AbstractAssignment, "status" | "due_at" | "conflict_declared" | "conflict_reason">> }) =>
      apiPut<{ id: string; status: string; conflict_declared: boolean }>(`/events/${eventId}/abstracts/assignments/${assignmentId}`, patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["abstract-workflow", eventId] }),
  });
}

export function useUpdateAbstractSubmission(eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (submission: AbstractSubmission) =>
      apiPut<AbstractSubmission>(`/events/${eventId}/abstracts/submissions/${submission.id}`, submission, { headers: { "If-Match": submission.version } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["abstract-workflow", eventId] }),
  });
}

export function useDeleteAbstractSubmission(eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (submission: AbstractSubmission) => apiDelete<void>(`/events/${eventId}/abstracts/submissions/${submission.id}`, { headers: { "If-Match": submission.version } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["abstract-workflow", eventId] }),
  });
}

export function useAssignAbstractReviewer(eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ submissionId, reviewerId }: { submissionId: string; reviewerId: string }) =>
      apiPost<AbstractSubmission>(`/events/${eventId}/abstracts/submissions/${submissionId}/assignments`, { reviewer_id: reviewerId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["abstract-workflow", eventId] }),
  });
}

export function useDecideAbstract(eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ submission, decision, reason, notes, presentationType }: { submission: AbstractSubmission; decision: "NOMINATED" | "ACCEPTED" | "WAITLISTED" | "REJECTED" | "REVISION_REQUESTED" | "WITHDRAWN"; reason: string; notes?: string; presentationType?: "ORAL" | "POSTER" | "EPOSTER" }) =>
      apiPost<AbstractSubmission>(
        `/events/${eventId}/abstracts/submissions/${submission.id}/decision`,
        { decision, reason, notes_to_author: notes || null, presentation_type: presentationType || null },
        { headers: { "If-Match": submission.version } },
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["abstract-workflow", eventId] }),
  });
}

export function useBulkDecideAbstract(eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ submissions, decision, reason, notes, presentationType }: { submissions: AbstractSubmission[]; decision: "NOMINATED" | "ACCEPTED" | "WAITLISTED" | "REJECTED" | "REVISION_REQUESTED" | "WITHDRAWN"; reason: string; notes?: string; presentationType?: "ORAL" | "POSTER" | "EPOSTER" }) =>
      apiPost<AbstractSubmission[]>(`/events/${eventId}/abstracts/decisions/bulk`, {
        items: submissions.map((submission) => ({ submission_id: submission.id, expected_version: submission.version })),
        decision, reason, notes_to_author: notes || null, presentation_type: presentationType || null,
      }, { headers: { "Idempotency-Key": crypto.randomUUID() } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["abstract-workflow", eventId] }),
  });
}

export function usePublishAbstract(eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (submissionId: string) => apiPost<AbstractSubmission>(`/events/${eventId}/abstracts/submissions/${submissionId}/publish`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["abstract-workflow", eventId] }),
  });
}

export function usePublishAllAccepted(eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiPost<AbstractPage>(`/events/${eventId}/abstracts/accepted/publish-all`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["abstract-workflow", eventId] }),
  });
}
