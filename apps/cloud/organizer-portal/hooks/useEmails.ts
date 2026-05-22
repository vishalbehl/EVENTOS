"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "@/lib/api-client";

export interface EmailTemplate {
  id: string;
  name: string;
  template_type: string;
  subject: string;
  body_html: string;
}

export interface AutoInviteResult {
  campaign_id: string;
  total_speakers: number;
  pending_speakers: number;
  already_uploaded: number;
  message: string;
}

export function useEmailTemplates(eventId: string) {
  return useQuery({
    queryKey: ["email-templates", eventId],
    queryFn: () => apiGet<EmailTemplate[]>(`/events/${eventId}/notifications/templates`),
    enabled: !!eventId,
  });
}

export function useSendToSpeakers(eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      template_id: string;
      recipient_ids: string[];
      send_immediately?: boolean;
    }) =>
      apiPost<{ id: string; total_recipients: number; sent_count: number }>(
        `/events/${eventId}/notifications/campaigns/send-to-speakers`,
        { ...data, send_immediately: data.send_immediately ?? true }
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["speakers", eventId] });
    },
  });
}

/** @deprecated Use useSendToSpeakers instead */
export function useBulkInvite(eventId: string) {
  return useSendToSpeakers(eventId);
}

/**
 * One-click post-import invitation blast.
 * Calls POST /events/{eventId}/notifications/campaigns/auto-invite
 * which finds the upload_invite template, creates a campaign for
 * pending-only speakers, and immediately fires the Celery task.
 */
export function useAutoInvite(eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiPost<AutoInviteResult>(
        `/events/${eventId}/notifications/campaigns/auto-invite`,
        {}
      ),
    onSuccess: () => {
      // Refresh speaker list to reflect any status changes
      queryClient.invalidateQueries({ queryKey: ["speakers", eventId] });
    },
  });
}
