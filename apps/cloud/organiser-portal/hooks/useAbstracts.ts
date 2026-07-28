import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPatch } from "@/lib/api-client";

export type AbstractStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "UNDER_REVIEW"
  | "ACCEPTED"
  | "REJECTED"
  | "REVISION_REQUESTED"
  | "WITHDRAWN";

export interface SpeakerAbstract {
  session_speaker_id: string;
  event_id: string;
  speaker_id: string;
  speaker_name: string;
  speaker_email: string;
  session_id: string;
  session_name: string;
  presentation_title?: string | null;
  abstract_text?: string | null;
  keywords: string[];
  status: AbstractStatus;
  version: number;
  submitted_at?: string | null;
  reviewed_at?: string | null;
  reviewed_by?: string | null;
  review_notes?: string | null;
}

export interface AbstractPage {
  items: SpeakerAbstract[];
  next_cursor?: string | null;
}

export function useAbstracts(
  eventId: string,
  filters: { status?: string; search?: string } = {},
) {
  return useQuery({
    queryKey: ["speaker-abstracts", eventId, filters],
    queryFn: () => {
      const params = new URLSearchParams();
      if (filters.status) params.set("status", filters.status);
      if (filters.search) params.set("search", filters.search);
      params.set("limit", "200");
      return apiGet<AbstractPage>(
        `/events/${eventId}/abstracts?${params.toString()}`,
      );
    },
    enabled: Boolean(eventId),
  });
}

export function useReviewAbstract(eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      abstract,
      decision,
      notes,
      reason,
      caseReference,
    }: {
      abstract: SpeakerAbstract;
      decision:
        | "UNDER_REVIEW"
        | "ACCEPTED"
        | "REJECTED"
        | "REVISION_REQUESTED";
      notes?: string;
      reason: string;
      caseReference?: string;
    }) =>
      apiPatch<SpeakerAbstract>(
        `/events/${eventId}/abstracts/${abstract.session_speaker_id}/review`,
        {
          decision,
          notes: notes || null,
          reason,
          case_reference: caseReference || null,
        },
        {
          headers: {
            "If-Match": abstract.version,
            "Idempotency-Key": crypto.randomUUID(),
          },
        },
      ),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ["speaker-abstracts", eventId],
      }),
  });
}
