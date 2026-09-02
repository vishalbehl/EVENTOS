export type FormFieldType =
  // Basic Inputs
  | "text"
  | "textarea"
  | "email"
  | "phone"
  | "number"
  | "date"
  | "time"
  | "datetime"
  // Choice & Select
  | "select"
  | "radio"
  | "checkbox"
  | "multiselect"
  // Identity & Specialized
  | "country"
  | "state"
  | "title"
  | "role"
  // Media & Rich
  | "file"
  | "image"
  | "signature"
  | "rating"
  | "nps"
  | "terms"
  // Layout & Decorators
  | "section_header"
  | "divider"
  | "rich_text";

export interface FormFieldOption {
  label: string;
  value: string;
  is_default?: boolean;
}

export interface FormFieldValidation {
  min_length?: number;
  max_length?: number;
  min_value?: number;
  max_value?: number;
  pattern?: string;
  custom_error_message?: string;
  allowed_file_types?: string[]; // e.g. [".pdf", ".docx", ".png"]
  max_file_size_mb?: number;
}

export interface FormStep {
  id: string;
  title: string;
  description?: string;
}

export interface FormField {
  id: string;
  name: string;
  label: string;
  type: FormFieldType;
  placeholder?: string;
  help_text?: string;
  default_value?: any;
  is_required: boolean;
  is_active: boolean;
  is_default: boolean; // Core system field marker (e.g. first_name, email)
  sort_order: number;
  step_index?: number; // Zero-based index of the form page/step
  grid_width?: "full" | "half" | "third";
  options?: string[] | FormFieldOption[];
  validation?: FormFieldValidation;
  category?: "basic" | "choice" | "identity" | "media" | "layout";
}

export interface FormCategory {
  id: string;
  organization_id?: string | null;
  name: string;
  slug: string;
  description?: string;
  icon?: string;
  is_system: boolean;
  sort_order: number;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface FAQItem {
  q: string;
  a: string;
  is_default?: boolean;
}

export interface FormSettings {
  submit_button_label?: string;
  success_title?: string;
  success_message?: string;
  redirect_url?: string;
  allow_multiple_submissions?: boolean;
  require_login?: boolean;
  send_email_confirmation?: boolean;
  confirmation_email_subject?: string;
  terms_and_conditions?: string;
  enable_terms?: boolean; // Default true for all forms
  enable_preview?: boolean; // Default true for all forms
  enable_payment?: boolean; // Default true for registration, false for custom/abstract/survey
  steps?: FormStep[]; // Configured pages/steps
  faqs?: FAQItem[];
  include_default_faqs?: boolean;
  theme?: {
    primary_color?: string;
    border_radius?: string;
    show_header_banner?: boolean;
    header_banner_url?: string;
  };
}

export interface FormTemplate {
  id: string;
  category_id?: string | null;
  organization_id?: string | null;
  event_id?: string | null;
  created_by?: string | null;
  name: string;
  slug: string;
  description?: string;
  category_key: string; // "registration" | "abstract" | "survey" | "speaker" | "sponsor" | "custom"
  category_name?: string;
  scope_type: "GLOBAL" | "ORGANIZATION" | "EVENT";
  is_default: boolean;
  is_system: boolean;
  is_active: boolean;
  version: number;
  fields: FormField[];
  settings: FormSettings;
  preview_image_url?: string;
  created_at?: string;
  updated_at?: string;
}

export type DeviceViewport = "desktop" | "tablet" | "mobile";

export type FormBuilderMode = "command-center" | "organiser-portal" | "standalone";
