"use client";

import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api-client";
import { useAuthStore } from "@/store/use-auth-store";
import { usePermissions } from "@/hooks/usePermissions";
import type { Campaign } from "@/services/email-service";

export interface CommunicationPage<T> { items: T[]; next_cursor: string | null; has_next: boolean; }
export interface DeliveryLogRow {
  id: string; campaign_id: string | null; speaker_id: string | null; participant_id: string | null;
  to_email: string; subject: string; status: string; opened_at: string | null; sent_at: string;
}
export interface CampaignDeliverySummary {
  campaign_id: string; event_id: string; name: string; created_at: string; version: number; status: string;
  target_type: string; observed_at: string;
  total_logs: number; sent_count: number; failed_count: number;
  opened_count: number; queued_count: number; sending_count: number; unknown_count: number;
}

export function useCampaignSummary(eventId: string, campaignId: string) {
  const { user, isAuthenticated } = useAuthStore();
  const access = usePermissions(eventId);
  const authorized = isAuthenticated && !!user?.id && !!eventId && !!campaignId
    && !access.isFetching && !access.error && access.permissions.includes("CAMPAIGNS:VIEW");
  const query = useQuery({
    queryKey: ["communication-campaign-summary", user?.id, user?.organization_id,
      eventId, access.policyRevision, campaignId],
    queryFn: ({ signal }) => apiGet<CampaignDeliverySummary>(
      `/events/${eventId}/notifications/campaigns/${campaignId}/summary`, { signal }),
    enabled: authorized, staleTime: 0, gcTime: 0, retry: false,
  });
  return { ...query, data: authorized && !query.isFetching ? query.data : undefined,
    accessLoading: access.isLoading || access.isFetching, accessError: access.error,
    accessDenied: !access.isLoading && !access.isFetching && !access.error && !authorized,
    policyRevision: access.policyRevision, refreshAccess: access.refetch };
}

export function useCampaignPage(eventId: string, target: "speaker" | "participant", cursor?: string) {
  const { user, isAuthenticated } = useAuthStore();
  const access = usePermissions(eventId);
  const authorized = isAuthenticated && !!user?.id && !!eventId && !access.isFetching && !access.error
    && access.permissions.includes("CAMPAIGNS:VIEW");
  const query = useQuery({
    queryKey: ["communication-campaign-page", user?.id, user?.organization_id, eventId, access.policyRevision, target, cursor ?? null],
    queryFn: ({ signal }) => apiGet<CommunicationPage<Campaign>>(
      `/events/${eventId}/notifications/campaigns/page`,
      { signal, params: { target_type: target, cursor, limit: 50 } }),
    enabled: authorized,
    staleTime: 0,
    gcTime: 0,
    retry: false,
    // No placeholder/previous-tenant page is rendered during context changes.
  });
  return { ...query, data: authorized && !query.isFetching ? query.data : undefined,
    accessLoading: access.isLoading || access.isFetching, accessError: access.error,
    accessDenied: !access.isLoading && !access.isFetching && !access.error && !authorized,
    policyRevision: access.policyRevision, refreshAccess: access.refetch };
}

export function useDeliveryLogPage(eventId: string, options: {
  target: "speaker" | "participant"; cursor?: string; campaignId?: string; status?: string;
}) {
  const { user, isAuthenticated } = useAuthStore();
  const access = usePermissions(eventId);
  const authorized = isAuthenticated && !!user?.id && !!eventId && !access.isFetching && !access.error
    && access.permissions.includes("CAMPAIGNS:VIEW");
  const query = useQuery({
    queryKey: ["communication-log-page", user?.id, user?.organization_id, eventId, access.policyRevision,
      options.target, options.cursor ?? null, options.campaignId ?? null, options.status ?? null],
    queryFn: ({ signal }) => apiGet<CommunicationPage<DeliveryLogRow>>(
      `/events/${eventId}/notifications/logs/cursor`, { signal, params: {
        target_type: options.target, cursor: options.cursor, campaign_id: options.campaignId, status: options.status, limit: 50,
      } }),
    enabled: authorized,
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
  return { ...query, data: authorized && !query.isFetching ? query.data : undefined,
    accessLoading: access.isLoading || access.isFetching, accessError: access.error,
    accessDenied: !access.isLoading && !access.isFetching && !access.error && !authorized,
    policyRevision: access.policyRevision, refreshAccess: access.refetch };
}
