import { apiGet, apiPut } from "@/lib/api-client";

export interface PortalCapabilities {
  show_registration: boolean;
  show_speakers: boolean;
  show_abstracts: boolean;
  show_agenda: boolean;
  show_badges: boolean;
  show_certificates: boolean;
  show_exhibitors: boolean;
  show_support: boolean;
  show_resources: boolean;
}

export interface PortalSettingsData {
  enabled: boolean;
  registration_allowed: boolean;
  participants_list_allowed: boolean;
  window_required: boolean;
  edit_cutoff_days: number;
  edit_cutoff_date?: string | null;
  support_email?: string | null;
  support_phone?: string | null;
  additional_contacts: Array<{ id: string; type: "email" | "phone"; value: string; label: string }>;
  terms_and_conditions: string;
  faqs: Array<{ q: string; a: string }>;
  include_default_faqs: boolean;
  capabilities: PortalCapabilities;
  theme_preset: string;
  primary_color: string;
  secondary_color: string;
  tagline?: string | null;
  hero_description?: string | null;
}

export interface BadgeSettingsData {
  use_same_design_for_all_users: boolean;
  default_template_id?: string | null;
  role_template_assignments: Record<string, string>;
  paper_size: string;
  orientation: string;
  dpi: number;
  double_sided: boolean;
  show_cut_marks: boolean;
  show_qr_code: boolean;
  show_barcode: boolean;
  auto_print_on_checkin: boolean;
}

export interface CertificateSettingsData {
  use_same_design_for_all_users: boolean;
  default_template_id?: string | null;
  role_template_assignments: Record<string, string>;
  auto_issue_on_checkin: boolean;
  auto_issue_on_session_complete: boolean;
  enable_public_verification: boolean;
  allow_download: boolean;
  download_cutoff_date?: string | null;
  paper_size: string;
  orientation: string;
}

export interface WebsiteSettingsData {
  is_published: boolean;
  custom_domain?: string | null;
  subdomain?: string | null;
  meta_title?: string | null;
  meta_description?: string | null;
  favicon_url?: string | null;
  og_image_url?: string | null;
  ga_tracking_id?: string | null;
  meta_pixel_id?: string | null;
  custom_head_scripts?: string | null;
  custom_body_scripts?: string | null;
  maintenance_mode: boolean;
}

export interface EmailSettingsData {
  from_name: string;
  from_email?: string | null;
  reply_to?: string | null;
  brand_logo_url?: string | null;
  brand_primary_color: string;
  footer_text?: string | null;
  company_address?: string | null;
  enable_registration_trigger: boolean;
  enable_payment_trigger: boolean;
  enable_speaker_trigger: boolean;
  enable_abstract_trigger: boolean;
  enable_certificate_trigger: boolean;
}

export const designStudioService = {
  portal: {
    get: async (eventId: string) => {
      return apiGet<PortalSettingsData>(`/events/${eventId}/design-settings/portal?t=${Date.now()}`);
    },
    update: async (eventId: string, data: Partial<PortalSettingsData>) => {
      return apiPut<PortalSettingsData>(`/events/${eventId}/design-settings/portal`, data);
    },
  },
  badges: {
    get: async (eventId: string) => {
      return apiGet<BadgeSettingsData>(`/events/${eventId}/design-settings/badges?t=${Date.now()}`);
    },
    update: async (eventId: string, data: Partial<BadgeSettingsData>) => {
      return apiPut<BadgeSettingsData>(`/events/${eventId}/design-settings/badges`, data);
    },
  },
  certificates: {
    get: async (eventId: string) => {
      return apiGet<CertificateSettingsData>(`/events/${eventId}/design-settings/certificates?t=${Date.now()}`);
    },
    update: async (eventId: string, data: Partial<CertificateSettingsData>) => {
      return apiPut<CertificateSettingsData>(`/events/${eventId}/design-settings/certificates`, data);
    },
  },
  website: {
    get: async (eventId: string) => {
      return apiGet<WebsiteSettingsData>(`/events/${eventId}/design-settings/website?t=${Date.now()}`);
    },
    update: async (eventId: string, data: Partial<WebsiteSettingsData>) => {
      return apiPut<WebsiteSettingsData>(`/events/${eventId}/design-settings/website`, data);
    },
  },
  emails: {
    get: async (eventId: string) => {
      return apiGet<EmailSettingsData>(`/events/${eventId}/design-settings/emails?t=${Date.now()}`);
    },
    update: async (eventId: string, data: Partial<EmailSettingsData>) => {
      return apiPut<EmailSettingsData>(`/events/${eventId}/design-settings/emails`, data);
    },
  },
};
