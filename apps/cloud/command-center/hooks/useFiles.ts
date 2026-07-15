import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { useAuthStore } from "@/store/use-auth-store";

export interface FileValidationDetail {
  id: string;
  file_id: string;
  overall_result: "pass" | "warning" | "fail";
  validated_at: string;

  // PPTX
  slide_count?: number;
  image_count: number;
  video_count: number;
  animation_count: number;
  has_animations: boolean;
  has_transitions: boolean;
  has_missing_fonts: boolean;
  missing_fonts_list?: string[];
  has_unsupported_video: boolean;
  has_corrupted_slides: boolean;
  has_large_images: boolean;
  has_ole_objects: boolean;
  has_broken_ole: boolean;
  has_macros: boolean;
  notes_present: boolean;
  notes_slide_count: number;
  audio_objects_detected: boolean;
  audio_format_valid: boolean;

  // Links / assets
  internet_dependent_content: boolean;
  external_url_count: number;
  linked_assets_detected: boolean;
  linked_assets_resolved: boolean;
  image_links_detected: number;
  absolute_path_links_detected: number;
  has_broken_internal_media: boolean;

  // Forensic
  sha256_hash?: string;
  md5_hash?: string;
  mime_type_detected?: string;
  antivirus_status: string;

  // Bundle
  is_bundle: boolean;
  bundle_contents?: Array<{ name: string; type: string; size: string; size_bytes: number; format: string }>;

  // Format-specific (PDF, Video, Audio, Image) — stored in technical_metadata
  technical_metadata?: {
    // PDF
    page_count?: number;
    is_password_protected?: boolean;
    producer?: string;
    creator?: string;
    // Video
    duration_seconds?: number;
    duration_formatted?: string;
    width?: number;
    height?: number;
    resolution?: string;
    fps?: number;
    video_codec?: string;
    audio_codec?: string;
    audio_channels?: number;
    audio_sample_rate?: string;
    bitrate_kbps?: number;
    // Image
    mode?: string;
    dpi?: [number, number];
    // Audio
    sample_rate?: number;
    channels?: number;
    // PPTX extras
    external_links?: string[];
    // Bundle
    file_count?: number;
    total_size?: string;
    types?: string[];
    [key: string]: unknown;
  };

  error_details?: Record<string, unknown>;
  thumbnail_url?: string;
}

export interface PresentationFile {
  id: string;
  speaker_id: string;
  session_speaker_id: string;
  event_id: string;
  speaker_name?: string;
  session_name?: string;
  session_start_time?: string;
  original_filename: string;
  stored_filename: string;
  storage_path: string;
  file_size_bytes: number;
  file_format: string;
  version_number: number;
  upload_status: 'processing' | 'pending_validation' | 'valid' | 'invalid' | 'approved' | 'rejected' | 'locked';
  uploaded_at: string;
  upload_source: string;
  is_locked: boolean;
  rejection_reason?: string;
  validation?: FileValidationDetail;
}


export function useFiles(eventId: string, filters?: { upload_status?: string }) {
  const organizationId = useAuthStore((state) => state.user?.organization_id);
  return useQuery({
    queryKey: queryKeys.events.files(organizationId, eventId, filters),
    queryFn: () => {
      const params = new URLSearchParams();
      if (filters?.upload_status) params.append("upload_status", filters.upload_status);
      const queryString = params.toString();
      return apiGet<PresentationFile[]>(`/events/${eventId}/files${queryString ? `?${queryString}` : ""}`);
    },
    enabled: !!eventId,
    refetchInterval: 10000,
  });
}

export function useApproveFile(eventId: string) {
  const queryClient = useQueryClient();
  const organizationId = useAuthStore((state) => state.user?.organization_id);
  return useMutation({
    mutationFn: (fileId: string) => apiPost(`/events/${eventId}/files/${fileId}/approve`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.events.files(organizationId, eventId) });
    },
  });
}

export function useRejectFile(eventId: string) {
  const queryClient = useQueryClient();
  const organizationId = useAuthStore((state) => state.user?.organization_id);
  return useMutation({
    mutationFn: ({ fileId, reason }: { fileId: string; reason: string }) => 
      apiPost(`/events/${eventId}/files/${fileId}/reject`, { reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.events.files(organizationId, eventId) });
    },
  });
}

export function useDownloadFile(eventId: string) {
  return useMutation({
    mutationFn: async (fileId: string) => {
      const data = await apiGet<{ download_url: string }>(`/events/${eventId}/files/${fileId}/download`);
      window.open(data.download_url, '_blank');
      return data;
    }
  });
}
