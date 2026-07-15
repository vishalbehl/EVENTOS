"use client";

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { useAuthStore } from "@/store/use-auth-store";

export interface SupportScope {
  organizationId?: string;
  supportReason?: string;
  accessRequestId?: string;
}

export interface SupportTicketAdmin {
  id: string;
  organization_id: string;
  creator_id: string;
  assigned_to?: string | null;
  assigned_agent?: string | null;
  subject: string;
  description: string;
  status: string;
  priority: string;
  category: string;
  version: number;
  is_escalated: boolean;
  first_response_due_at?: string | null;
  resolution_due_at?: string | null;
  first_responded_at?: string | null;
  resolved_at?: string | null;
  closed_at?: string | null;
  escalated_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface SupportCommentAdmin {
  id: string;
  ticket_id: string;
  author_id: string;
  author_email: string;
  author_name: string;
  content: string;
  is_internal: boolean;
  created_at: string;
}

export interface SupportAttachmentAdmin {
  id: string;
  ticket_id: string;
  asset_id?: string | null;
  file_name: string;
  mime_type?: string | null;
  file_size_bytes?: number | null;
  processing_status: "UPLOADING" | "QUARANTINED" | "READY" | "INFECTED" | "SCAN_FAILED" | "LEGACY_UNVERIFIED";
  uploaded_by?: string | null;
  created_at: string;
  upload_url?: string | null;
  upload_headers?: Record<string, string> | null;
  expires_in?: number | null;
}

interface CursorPage<T> {
  items: T[];
  next_cursor: string | null;
  has_next: boolean;
}

function requireScope(scope: SupportScope) {
  if (!scope.organizationId || !scope.supportReason || !scope.accessRequestId) {
    throw new Error("Apply an audited tenant support scope before accessing tickets.");
  }
  return {
    organizationId: scope.organizationId,
    headers: { "X-Support-Reason": scope.supportReason },
  };
}

const keys = {
  tickets: (scope: SupportScope, filters?: Record<string, unknown>) => queryKeys.admin.domain("support-tickets", {
    organizationId: scope.organizationId,
    accessRequestId: scope.accessRequestId,
    ...filters,
  }),
  ticket: (scope: SupportScope, ticketId?: string) => queryKeys.admin.domain("support-ticket", {
    organizationId: scope.organizationId,
    accessRequestId: scope.accessRequestId,
    ticketId,
  }),
  comments: (scope: SupportScope, ticketId?: string) => queryKeys.admin.domain("support-comments", {
    organizationId: scope.organizationId,
    accessRequestId: scope.accessRequestId,
    ticketId,
  }),
  attachments: (scope: SupportScope, ticketId?: string) => queryKeys.admin.domain("support-attachments", {
    organizationId: scope.organizationId,
    accessRequestId: scope.accessRequestId,
    ticketId,
  }),
};

function enabled(scope: SupportScope) {
  return Boolean(scope.organizationId && scope.supportReason && scope.accessRequestId);
}

export function useSupportTicketsAdmin(scope: SupportScope, filters: { status?: string; priority?: string } = {}) {
  const auth = useAuthStore();
  return useInfiniteQuery({
    queryKey: keys.tickets(scope, filters),
    queryFn: ({ pageParam }) => {
      const scoped = requireScope(scope);
      const params = new URLSearchParams({ organization_id: scoped.organizationId, limit: "50" });
      if (filters.status) params.set("status", filters.status);
      if (filters.priority) params.set("priority", filters.priority);
      if (pageParam) params.set("cursor", String(pageParam));
      return apiClient.get<CursorPage<SupportTicketAdmin>>(`/support/tickets/admin?${params}`, { headers: scoped.headers });
    },
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.next_cursor ?? undefined,
    enabled: auth.hasHydrated && auth.isAuthenticated && enabled(scope),
  });
}

export function useSupportTicketAdmin(scope: SupportScope, ticketId?: string) {
  const auth = useAuthStore();
  return useQuery({
    queryKey: keys.ticket(scope, ticketId),
    queryFn: () => {
      const scoped = requireScope(scope);
      return apiClient.get<SupportTicketAdmin>(`/support/tickets/admin/${ticketId}?organization_id=${scoped.organizationId}`, { headers: scoped.headers });
    },
    enabled: auth.hasHydrated && auth.isAuthenticated && enabled(scope) && Boolean(ticketId),
  });
}

export function useSupportCommentsAdmin(scope: SupportScope, ticketId?: string) {
  const auth = useAuthStore();
  return useQuery({
    queryKey: keys.comments(scope, ticketId),
    queryFn: () => {
      const scoped = requireScope(scope);
      return apiClient.get<SupportCommentAdmin[]>(`/support/tickets/admin/${ticketId}/comments?organization_id=${scoped.organizationId}`, { headers: scoped.headers });
    },
    enabled: auth.hasHydrated && auth.isAuthenticated && enabled(scope) && Boolean(ticketId),
  });
}

export function useUpdateSupportTicketAdmin(scope: SupportScope) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ ticketId, payload }: { ticketId: string; payload: Record<string, unknown> }) => {
      const scoped = requireScope(scope);
      return apiClient.patch<SupportTicketAdmin>(`/support/tickets/admin/${ticketId}?organization_id=${scoped.organizationId}`, payload, { headers: scoped.headers });
    },
    onSuccess: async (_, variables) => {
      await Promise.all([
        client.invalidateQueries({ queryKey: queryKeys.admin.domain("support-tickets") }),
        client.invalidateQueries({ queryKey: keys.ticket(scope, variables.ticketId) }),
      ]);
    },
  });
}

export function useAddSupportCommentAdmin(scope: SupportScope) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ ticketId, content, isInternal }: { ticketId: string; content: string; isInternal: boolean }) => {
      const scoped = requireScope(scope);
      return apiClient.post(`/support/tickets/admin/${ticketId}/comments?organization_id=${scoped.organizationId}`, {
        content,
        is_internal: isInternal,
      }, { headers: scoped.headers });
    },
    onSuccess: async (_, variables) => {
      await Promise.all([
        client.invalidateQueries({ queryKey: queryKeys.admin.domain("support-tickets") }),
        client.invalidateQueries({ queryKey: keys.ticket(scope, variables.ticketId) }),
        client.invalidateQueries({ queryKey: keys.comments(scope, variables.ticketId) }),
      ]);
    },
  });
}

export function useSupportAttachmentsAdmin(scope: SupportScope, ticketId?: string) {
  const auth = useAuthStore();
  return useQuery({
    queryKey: keys.attachments(scope, ticketId),
    queryFn: () => {
      const scoped = requireScope(scope);
      return apiClient.get<SupportAttachmentAdmin[]>(`/support/tickets/admin/${ticketId}/attachments?organization_id=${scoped.organizationId}`, { headers: scoped.headers });
    },
    enabled: auth.hasHydrated && auth.isAuthenticated && enabled(scope) && Boolean(ticketId),
    refetchInterval: (query) => query.state.data?.some((attachment) => ["UPLOADING", "QUARANTINED"].includes(attachment.processing_status)) ? 5_000 : false,
  });
}

export function useUploadSupportAttachmentAdmin(scope: SupportScope) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ ticketId, file, reason, idempotencyKey }: { ticketId: string; file: File; reason: string; idempotencyKey: string }) => {
      const scoped = requireScope(scope);
      const requested = await apiClient.post<SupportAttachmentAdmin>(
        `/support/tickets/admin/${ticketId}/attachments/upload-request?organization_id=${scoped.organizationId}`,
        { file_name: file.name, mime_type: file.type || "application/octet-stream", file_size_bytes: file.size, reason },
        { headers: { ...scoped.headers, "Idempotency-Key": idempotencyKey } },
      );
      if (!requested.upload_url) throw new Error("The attachment upload URL was not returned.");
      await apiClient.uploadPresigned(requested.upload_url, file, requested.upload_headers ?? { "Content-Type": file.type });
      return apiClient.post<SupportAttachmentAdmin>(
        `/support/tickets/admin/${ticketId}/attachments/${requested.id}/complete?organization_id=${scoped.organizationId}`,
        { reason },
        { headers: scoped.headers },
      );
    },
    onSuccess: (_, variables) => client.invalidateQueries({ queryKey: keys.attachments(scope, variables.ticketId) }),
  });
}

export function useDownloadSupportAttachmentAdmin(scope: SupportScope) {
  return useMutation({
    mutationFn: ({ ticketId, attachmentId }: { ticketId: string; attachmentId: string }) => {
      const scoped = requireScope(scope);
      return apiClient.get<{ download_url: string; expires_in: number }>(
        `/support/tickets/admin/${ticketId}/attachments/${attachmentId}/download?organization_id=${scoped.organizationId}`,
        { headers: scoped.headers },
      );
    },
  });
}
