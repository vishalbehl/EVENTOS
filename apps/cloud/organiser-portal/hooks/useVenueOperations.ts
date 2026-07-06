"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "@/lib/api-client";

export type CatalogTemplateRecord = Record<string, any>;

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
