"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { apiGet, apiPost, apiPatch } from "@/lib/api-client";
import { useAuthStore } from "@/store/use-auth-store";
import { socketService } from "@/lib/socket";

export type CatalogTemplateRecord = Record<string, any>;

export interface VenueOpsRecommendation {
  service_code: string;
  service_name: string;
  category: string;
  description?: string;
  priority: "REQUIRED" | "RECOMMENDED" | "OPTIONAL";
  suggested_quantity: number;
  reason: string;
  template_refs: string[];
  template_version?: string | null;
  dependencies: string[];
  requires_confirmation: boolean;
}

export interface VenueOpsItem {
  id?: string;
  description: string;
  quantity: number;
  service_definition_id?: string | null;
  source?: string;
  duration_days?: number;
  notes?: string;
  room_scope?: string[];
  configuration?: Record<string, unknown>;
}

export interface VenueOpsOverview {
  event: {
    id: string;
    name: string;
    venue_name?: string | null;
    start_date: string;
    end_date: string;
  };
  facts: Record<string, number | string | boolean>;
  recommendations: VenueOpsRecommendation[];
  request: {
    id: string;
    request_number: string;
    title: string;
    status: string;
    version: number;
    items: VenueOpsItem[];
    planning_overrides: Record<string, number>;
  } | null;
}

export interface VenueOpsQuote {
  id: string;
  quote_number: string;
  title: string;
  status: string;
  currency: string;
  total_amount: string | number;
  version: number;
  valid_until?: string | null;
  proposal?: {
    id: string;
    proposal_number?: string | null;
    status: string;
    current_version: number;
  } | null;
  documents: Array<{
    export_id: string;
    proposal_version: number;
    status: string;
    file_format: string;
    created_at: string;
    completed_at?: string | null;
    expires_at?: string | null;
    failure_reason?: string | null;
  }>;
}

export function useVenueOpsOverview(eventId: string) {
  const { isAuthenticated, hasHydrated } = useAuthStore();
  return useQuery({
    queryKey: ["venue-ops-overview", eventId],
    queryFn: () =>
      apiGet<VenueOpsOverview>(
        `/service-requests/events/${eventId}/venue-ops/overview`,
      ),
    enabled: hasHydrated && isAuthenticated && !!eventId,
  });
}

export function useVenueOpsMutations(eventId: string) {
  const queryClient = useQueryClient();
  const refresh = () =>
    queryClient.invalidateQueries({
      queryKey: ["venue-ops-overview", eventId],
    });
  const recalculate = useMutation({
    mutationFn: () =>
      apiPost(
        `/service-requests/events/${eventId}/venue-ops/recommendations/recalculate`,
        {},
      ),
    onSuccess: refresh,
  });
  const create = useMutation({
    mutationFn: (body: {
      title: string;
      description?: string;
      request_type?: string;
      items: VenueOpsItem[];
      planning_overrides?: Record<string, number>;
    }) =>
      apiPost(`/service-requests/events/${eventId}/venue-ops/requests`, body),
    onSuccess: refresh,
  });
  const update = useMutation({
    mutationFn: ({
      requestId,
      ...body
    }: {
      requestId: string;
      items: VenueOpsItem[];
      planning_overrides?: Record<string, number>;
      description?: string;
      expected_version?: number;
    }) => apiPatch(`/service-requests/${requestId}`, body),
    onSuccess: refresh,
  });
  const submit = useMutation({
    mutationFn: ({
      requestId,
      expectedVersion,
    }: {
      requestId: string;
      expectedVersion?: number;
    }) =>
      apiPost(`/service-requests/${requestId}/submit`, {
        expected_version: expectedVersion,
      }),
    onSuccess: refresh,
  });
  const clarify = useMutation({
    mutationFn: ({ requestId, body }: { requestId: string; body: string }) =>
      apiPost(`/service-requests/${requestId}/clarifications`, { body }),
    onSuccess: refresh,
  });
  return { recalculate, create, update, submit, clarify };
}

export function useVenueOpsQuotes(eventId: string) {
  return useQuery({
    queryKey: ["venue-ops-quotes", eventId],
    queryFn: () =>
      apiGet<VenueOpsQuote[]>(
        `/service-requests/events/${eventId}/venue-ops/quotes`,
      ),
    enabled: !!eventId,
  });
}

const VENUE_OPS_EVENTS = [
  "venue_ops.request.created",
  "venue_ops.request.updated",
  "venue_ops.request.submitted",
  "venue_ops.clarification.created",
  "venue_ops.quote.created",
  "venue_ops.quote.revised",
  "venue_ops.proposal.sent",
  "venue_ops.pdf.status_changed",
  "venue_ops.organiser_decision.recorded",
  "venue_ops.fulfilment.created",
] as const;

/** Keeps the canonical Venue Ops pages authoritative when Command Center changes the workflow. */
export function useVenueOpsRealtime(eventId: string, refresh: () => void) {
  const { accessToken, isAuthenticated, hasHydrated } = useAuthStore();
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!hasHydrated || !isAuthenticated || !accessToken || !eventId) return;
    socketService.connect(accessToken);
    const socket = socketService.socket;
    if (!socket) return;
    const join = () => socketService.joinVenueOps(eventId);
    const onRefresh = () => refresh();
    const onConnect = () => {
      setConnected(true);
      join();
      refresh();
    };
    const onDisconnect = () => setConnected(false);
    const onConnectError = () => setConnected(false);

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("connect_error", onConnectError);
    VENUE_OPS_EVENTS.forEach((name) => socket.on(name, onRefresh));
    if (socket.connected) onConnect();
    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("connect_error", onConnectError);
      VENUE_OPS_EVENTS.forEach((name) => socket.off(name, onRefresh));
    };
  }, [accessToken, eventId, hasHydrated, isAuthenticated, refresh]);

  return { connected };
}

export function useVenueOpsQuoteActions(eventId: string) {
  const queryClient = useQueryClient();
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["venue-ops-quotes", eventId] });
    queryClient.invalidateQueries({
      queryKey: ["venue-ops-overview", eventId],
    });
  };
  const revision = useMutation({
    mutationFn: ({
      quoteId,
      expectedVersion,
      reason,
    }: {
      quoteId: string;
      expectedVersion: number;
      reason: string;
    }) =>
      apiPost(`/service-requests/quotes/${quoteId}/request-revision`, {
        expected_version: expectedVersion,
        reason,
      }),
    onSuccess: refresh,
  });
  const decide = useMutation({
    mutationFn: ({
      quoteId,
      expectedVersion,
      action,
      reason,
    }: {
      quoteId: string;
      expectedVersion: number;
      action: "APPROVE" | "DECLINE";
      reason: string;
    }) =>
      apiPost(`/service-requests/quotes/${quoteId}/organiser-decision`, {
        expected_version: expectedVersion,
        action,
        reason,
      }),
    onSuccess: refresh,
  });
  const requestPdf = useMutation({
    mutationFn: ({
      proposalId,
      expectedVersion,
      reason,
    }: {
      proposalId: string;
      expectedVersion: number;
      reason: string;
    }) =>
      apiPost(`/service-requests/proposals/${proposalId}/documents`, {
        expected_version: expectedVersion,
        reason,
      }),
    onSuccess: refresh,
  });
  return { revision, decide, requestPdf };
}

export function useCatalogTemplates() {
  return useQuery({
    queryKey: ["catalog-templates"],
    queryFn: () =>
      apiGet<{
        room_templates: CatalogTemplateRecord[];
        registration_templates: CatalogTemplateRecord[];
        srr_templates: CatalogTemplateRecord[];
      }>("/pricing/superadmin/catalog/templates"),
    staleTime: 300_000,
  });
}

export function useCatalogTemplate(slug: string | null) {
  return useQuery({
    queryKey: ["catalog-template", slug],
    queryFn: () =>
      apiGet<CatalogTemplateRecord>(
        `/pricing/superadmin/catalog/templates/${slug}`,
      ),
    enabled: !!slug,
    staleTime: 300_000,
  });
}

export function useCreateServiceRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      eventId,
      ...body
    }: {
      eventId: string;
      title: string;
      description?: string;
      priority?: string;
      request_type?: string;
    }) => apiPost(`/service-requests?event_id=${eventId}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["service-requests"] });
    },
  });
}
