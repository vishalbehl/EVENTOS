import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/api-client";

export type AbstractStatus = "DRAFT" | "SUBMITTED" | "UNDER_REVIEW" | "ACCEPTED" | "REJECTED" | "REVISION_REQUESTED" | "WITHDRAWN";

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
  });
}

export function useAbstractSetup(eventId: string) {
  return useQuery({
    queryKey: ["abstract-workflow", eventId, "setup"],
    queryFn: () => apiGet<AbstractCall>(`/events/${eventId}/abstracts/setup`),
    enabled: Boolean(eventId),
  });
}

export function useSaveAbstractSetup(eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (call: AbstractCall) =>
      apiPut<AbstractCall>(`/events/${eventId}/abstracts/setup`, call, { headers: { "If-Match": call.version } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["abstract-workflow", eventId] }),
  });
}

export function useAbstractForm(eventId: string) {
  return useQuery({
    queryKey: ["abstract-workflow", eventId, "form"],
    queryFn: () => apiGet<AbstractForm>(`/events/${eventId}/abstracts/form`),
    enabled: Boolean(eventId),
  });
}

export function useSaveAbstractForm(eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (form: AbstractForm) =>
      apiPut<AbstractForm>(`/events/${eventId}/abstracts/form`, form, { headers: { "If-Match": form.version } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["abstract-workflow", eventId] }),
  });
}

export function useAbstractSubmissions(eventId: string, filters: { status?: string; search?: string } = {}) {
  return useQuery({
    queryKey: ["abstract-workflow", eventId, "submissions", filters],
    queryFn: () => {
      const params = new URLSearchParams();
      if (filters.status) params.set("status", filters.status);
      if (filters.search) params.set("search", filters.search);
      params.set("limit", "200");
      return apiGet<AbstractPage>(`/events/${eventId}/abstracts/submissions?${params.toString()}`);
    },
    enabled: Boolean(eventId),
  });
}

export function useAbstractReviewers(eventId: string) {
  return useQuery({
    queryKey: ["abstract-workflow", eventId, "reviewers"],
    queryFn: () => apiGet<AbstractReviewer[]>(`/events/${eventId}/abstracts/reviewers`),
    enabled: Boolean(eventId),
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
    mutationFn: ({ submission, decision, reason, notes, presentationType }: { submission: AbstractSubmission; decision: "ACCEPTED" | "REJECTED" | "REVISION_REQUESTED"; reason: string; notes?: string; presentationType?: "ORAL" | "POSTER" | "EPOSTER" }) =>
      apiPost<AbstractSubmission>(
        `/events/${eventId}/abstracts/submissions/${submission.id}/decision`,
        { decision, reason, notes_to_author: notes || null, presentation_type: presentationType || null },
        { headers: { "If-Match": submission.version } },
      ),
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
